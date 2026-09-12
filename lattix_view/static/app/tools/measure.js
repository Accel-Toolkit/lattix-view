// The measurement tools: point-to-point distance (with snapping), element gap and axis angle between two
// clicked elements, the coordinate probe, and the section plane.  Records are kept in a list the panel
// shows; drawings are lines and small spheres that ignore depth so they stay visible inside magnets.
import * as THREE from "../../vendor/three/three.module.js";
import { CSS2DObject } from "../../vendor/three/addons/renderers/CSS2DRenderer.js";
import { buildOrbit, elementAtS, frameAt, localCoords } from "../math/orbit.js";
import { nearElements, snap } from "../math/snap.js";
import { axisAngle, describe, distance, elementGap, heading, toTSV } from "../math/measure.js";

const COLOURS = { distance: 0xfbbf24, gap: 0xf472b6, angle: 0xa78bfa, probe: 0x34d399, heading: 0x60a5fa };

export class Measure {
  constructor(scene3, getScene, camera, canvas, onChange) {
    this.scene3 = scene3;
    this.getScene = getScene;
    this.camera = camera;
    this.canvas = canvas;
    this.onChange = onChange || (() => {});
    this.group = new THREE.Group();
    this.group.name = "measurements";
    scene3.add(this.group);
    this.records = [];
    this.tool = null;                        // null | distance | gap | angle | probe
    this.pending = null;                     // the first point or element of a two-click tool
    this.cursorMark = this._sphere(0xffffff, 0.6);
    this.cursorMark.visible = false;
    this.group.add(this.cursorMark);
    this.orbit = null;
    this.section = { plane: null, axis: "s", offset: 0 };
  }

  setScene(payload) {
    this.orbit = buildOrbit(payload.orbit);
    this.clear();
    this.setSection(null);
  }

  // -- tools -------------------------------------------------------------------------------------------
  setTool(name) {
    this.tool = this.tool === name ? null : name;
    this.pending = null;
    this.cursorMark.visible = false;
    this.onChange();
    return this.tool;
  }

  /** The snapped point for a cursor position: uses the scene's pick hit (element and point) when given. */
  snapAt(cursor, hit) {
    const scene = this.getScene();
    if (!scene || !this.orbit) return null;
    const el = scene.payload.el, n = scene.n;
    const o = this.camera.position.toArray();
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cursor[0] - r.left) / r.width) * 2 - 1, -((cursor[1] - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const d = ray.ray.direction.toArray();
    const project = p => {
      const v = new THREE.Vector3(p[0], p[1], p[2]).project(this.camera);
      if (v.z > 1) return null;
      return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
    };
    const near = nearElements(el, n, hit ? hit.i : -1, 2);
    const orbitSegs = i => {
      const out = [];
      const s0 = el.s[2 * i], s1 = el.s[2 * i + 1];
      const steps = el.arc[2 * i] ? 8 : 1;
      let prev = frameAt(el, i, s0).p;
      for (let k = 1; k <= steps; k++) { const p = frameAt(el, i, s0 + (s1 - s0) * k / steps).p; out.push([prev, p]); prev = p; }
      return out;
    };
    const snapped = snap({ cursor: [cursor[0], cursor[1]], project, ray: { o, d }, hit: hit ? { p: hit.p, i: hit.i } : null, near, el,
                           orbitSegs, floorY: scene.payload.lattice.floor_y, fallbackDepth: this.camera.position.distanceTo(new THREE.Vector3()) });
    // path position of a snapped point: frame points know their element; anything else is projected onto the orbit
    if (snapped.kind === "in" || snapped.kind === "c" || snapped.kind === "out" || snapped.kind === "body") {
      const s = snapped.kind === "in" ? el.s[2 * snapped.i] : snapped.kind === "out" ? el.s[2 * snapped.i + 1] : (el.s[2 * snapped.i] + el.s[2 * snapped.i + 1]) / 2;
      const f = frameAt(el, snapped.i, s);
      return { ...snapped, s, ax: f.ax };
    }
    const loc = localCoords(this.orbit, el, n, snapped.p);
    return { ...snapped, s: loc ? loc.s : null, ax: loc ? loc.ax : null, local: loc };
  }

  hover(cursor, hit) {
    if (!this.tool || this.tool === "gap" || this.tool === "angle") { this.cursorMark.visible = false; return null; }
    const sn = this.snapAt(cursor, hit);
    if (!sn) return null;
    this.cursorMark.visible = true;
    this.cursorMark.position.set(sn.p[0], sn.p[1], sn.p[2]);
    const scale = this._markScale(sn.p);
    this.cursorMark.scale.setScalar(scale * (sn.tier === "frame" ? 1.3 : 1));
    this.cursorMark.material.color.set(sn.tier === "frame" ? 0xfbbf24 : sn.tier === "axis" ? 0x22d3ee : 0xffffff);
    return sn;
  }

  /** A click while a tool is active; returns true when the click was consumed. */
  click(cursor, hit) {
    if (!this.tool) return false;
    const scene = this.getScene();
    if (!scene) return false;
    const names = scene.payload.el.name;
    if (this.tool === "probe") {
      const sn = this.snapAt(cursor, hit);
      if (!sn) return true;
      const loc = sn.local || (sn.s != null ? { s: sn.s, x: 0, y: 0 } : null);
      this.add({ type: "probe", p: sn.p, i: sn.i, local: loc, snapped: sn.kind }, [sn.p]);
      return true;
    }
    if (this.tool === "distance") {
      const sn = this.snapAt(cursor, hit);
      if (!sn) return true;
      if (!this.pending) { this.pending = sn; this._pendingMark(sn.p); return true; }
      const rec = distance(this.pending, sn);
      this.add(rec, [this.pending.p, sn.p]);
      this.pending = null;
      return true;
    }
    if (this.tool === "gap" || this.tool === "angle") {
      if (!hit || hit.i < 0) return true;
      if (this.pending == null) { this.pending = hit.i; this._pendingMark(scene.centreOf(hit.i).toArray()); return true; }
      const el = scene.payload.el;
      const rec = this.tool === "gap" ? elementGap(el, this.pending, hit.i) : axisAngle(el, this.pending, hit.i);
      const a = scene.centreOf(rec.i).toArray(), b = scene.centreOf(rec.j).toArray();
      this.add(rec, [a, b]);
      this.pending = null;
      return true;
    }
    return false;
  }

  addHeading(i, body = false) {
    const scene = this.getScene();
    if (!scene || i == null || i < 0) return;
    this.add(heading(scene.payload.el, i, body), [scene.centreOf(i).toArray()]);
  }

  add(rec, points) {
    const scene = this.getScene();
    const id = this.records.length + 1;
    const drawn = new THREE.Group();
    const colour = COLOURS[rec.type] || 0xffffff;
    for (const p of points) { const m = this._sphere(colour, 1); m.position.set(p[0], p[1], p[2]); m.scale.setScalar(this._markScale(p)); drawn.add(m); }
    if (points.length === 2) {
      const geo = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: colour, depthTest: false, transparent: true }));
      line.renderOrder = 30;
      drawn.add(line);
    }
    const div = document.createElement("div");
    div.className = "measure-label";
    div.textContent = `${id}: ${describe(rec, scene ? scene.payload.el.name : null)}`;
    const label = new CSS2DObject(div);
    const mid = points.length === 2 ? points[0].map((v, k) => (v + points[1][k]) / 2) : points[0];
    label.position.set(mid[0], mid[1], mid[2]);
    drawn.add(label);
    this.group.add(drawn);
    if (this._pending) { this.group.remove(this._pending); this._pending = null; }
    this.records.push({ id, rec, drawn });
    this.onChange();
  }

  remove(id) {
    const k = this.records.findIndex(r => r.id === id);
    if (k < 0) return;
    this.group.remove(this.records[k].drawn);
    this.records.splice(k, 1);
    this.onChange();
  }
  removeLast() { if (this.records.length) this.remove(this.records[this.records.length - 1].id); }
  clear() { for (const r of this.records) this.group.remove(r.drawn); this.records = []; this.pending = null; if (this._pending) { this.group.remove(this._pending); this._pending = null; } this.onChange(); }

  tsv() { const scene = this.getScene(); return toTSV(this.records.map(r => r.rec), scene ? scene.payload.el.name : []); }
  json() { const scene = this.getScene(); const names = scene ? scene.payload.el.name : []; return JSON.stringify(this.records.map(r => ({ id: r.id, ...r.rec, text: describe(r.rec, names) })), null, 1); }

  // -- section plane -----------------------------------------------------------------------------------
  /** A clipping plane through the selection's centre with its local axis `axis` (s, x or y) as normal. */
  setSection(i, axis = "s", offset = 0, renderer = null) {
    const scene = this.getScene();
    if (i == null || i < 0 || !scene) {
      this.section.plane = null;
      if (renderer) renderer.clippingPlanes = [];
      for (const m of scene ? Object.values(scene.materials) : []) m.side = THREE.FrontSide;
      return null;
    }
    const el = scene.payload.el;
    const q = new THREE.Quaternion(el.qc[4 * i], el.qc[4 * i + 1], el.qc[4 * i + 2], el.qc[4 * i + 3]);
    const dir = new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "s" ? 1 : 0).applyQuaternion(q);
    const c = scene.centreOf(i).addScaledVector(dir, offset);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(dir.clone().negate(), c);
    this.section = { plane, axis, offset, i };
    if (renderer) renderer.clippingPlanes = [plane];
    for (const m of Object.values(scene.materials)) m.side = THREE.DoubleSide;
    return plane;
  }

  // -- helpers --------------------------------------------------------------------------------------------
  _sphere(colour, size) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: colour, depthTest: false, transparent: true, opacity: 0.9 }));
    m.renderOrder = 31;
    m.scale.setScalar(size * 0.02);
    return m;
  }
  _markScale(p) {
    const d = this.camera.position.distanceTo(new THREE.Vector3(p[0], p[1], p[2]));
    return Math.max(0.004, d * 0.006);
  }
  _pendingMark(p) {
    if (this._pending) this.group.remove(this._pending);
    this._pending = this._sphere(0xffffff, 1.2);
    this._pending.position.set(p[0], p[1], p[2]);
    this._pending.scale.setScalar(this._markScale(p));
    this.group.add(this._pending);
  }

  /** The element that contains path position s (for the ride mode's readout). */
  elementAt(s) { const scene = this.getScene(); return scene ? elementAtS(scene.payload.el, scene.n, s) : -1; }
}
