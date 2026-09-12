// The scene from a payload (lattix-view.scene/1): every element built by the model library in its own
// centre frame, transformed by its body pose, merged into one mesh per material slot with per-vertex
// colours and an element index per triangle range for picking.
import * as THREE from "../vendor/three/three.module.js";
import { build, optionsFor } from "./models/index.js";
import { makeMaterials, slotColour } from "./scene/materials.js";
import { OverrideModels } from "./scene/overrides.js";

export const HIDDEN = 64;

export class LatticeScene {
  constructor(payload, palette, theme, opts = {}) {
    this.payload = payload;
    this.n = payload.lattice.n;
    this.group = new THREE.Group();
    this.group.name = "lattice";
    this.opts = optionsFor(this.n, opts);
    this.materials = makeMaterials(theme);
    this.meshes = {};                     // slot -> Mesh
    this.ranges = {};                     // slot -> [{i, start, count}] sorted by start (index units)
    this.colourRanges = {};               // slot -> per element [start, count] in vertex units
    this.stats = { triangles: 0, vertices: 0, drawCalls: 0, buildMs: 0 };
    this.build(palette);
  }

  kindOf(i) { return this.payload.kinds[this.payload.el.kind[i]]; }
  nameOf(i) { return this.payload.el.name[i]; }

  specOf(i) {
    const el = this.payload.el;
    return {
      i, kind: this.kindOf(i), sub: this.payload.subkinds[el.sub[i]] || "", fam: this.payload.families[el.fam[i]] || "",
      L: el.L[i], size: el.size.slice(3 * i, 3 * i + 3), bore: el.bore.slice(2 * i, 2 * i + 2), apshape: el.apshape[i],
      arc: el.arc.slice(2 * i, 2 * i + 2), params: el.params[i] || {}, clear: el.clear.slice(2 * i, 2 * i + 2),
      lam: el.lambda_in[i] || 0, beta: el.beta_in[i] || 1, flags: el.flags[i], strength: el.strength[i],
    };
  }

  build(palette) {
    const t0 = performance.now();
    const el = this.payload.el;
    const acc = {};                         // slot -> {pos: [], nrm: [], col: [], idx: [], ranges: [], vranges: {}}
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), n = new THREE.Vector3();
    const replaced = OverrideModels.replaced(this.payload);
    const assign = (this.payload.overrides && this.payload.overrides.assign) || {};
    for (let i = 0; i < this.n; i++) {
      if ((el.flags[i] & HIDDEN) || replaced.has(i)) continue;
      const spec = this.specOf(i);
      const re = assign[i];
      if (re && re.archetype) { spec.archetype = re.archetype; spec.params = { ...spec.params, ...(re.params || {}) }; }
      let parts;
      try { parts = build(spec, this.opts); } catch (e) { console.warn("model failed", spec.kind, spec.sub, e); parts = []; }
      if (!parts.length) continue;
      p.set(el.pb[3 * i], el.pb[3 * i + 1], el.pb[3 * i + 2]);
      q.set(el.qb[4 * i], el.qb[4 * i + 1], el.qb[4 * i + 2], el.qb[4 * i + 3]);
      const kindHex = palette[this.kindOf(i)] || "#888888";
      for (const part of parts) {
        const a = acc[part.slot] || (acc[part.slot] = { pos: [], nrm: [], col: [], idx: [], ranges: [], vranges: {} });
        const base = a.pos.length / 3;
        const [r, g, b] = slotColour(part.slot, kindHex);
        const m = part.mesh;
        const v = new THREE.Vector3();
        for (let k = 0; k < m.positions.length; k += 3) {
          v.set(m.positions[k], m.positions[k + 1], m.positions[k + 2]).applyQuaternion(q).add(p);
          a.pos.push(v.x, v.y, v.z);
          n.set(m.normals[k], m.normals[k + 1], m.normals[k + 2]).applyQuaternion(q);
          a.nrm.push(n.x, n.y, n.z);
          a.col.push(r, g, b);
        }
        const start = a.idx.length;
        for (const ix of m.indices) a.idx.push(ix + base);
        a.ranges.push({ i, start, count: m.indices.length });
        const vr = a.vranges[i] || (a.vranges[i] = []);
        vr.push([base, m.positions.length / 3]);
      }
    }
    for (const [slot, a] of Object.entries(acc)) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(a.pos, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(a.nrm, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(a.col, 3));
      geo.setIndex(a.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(a.idx, 1) : new THREE.Uint16BufferAttribute(a.idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.materials[slot] || this.materials.kind);
      mesh.name = slot;
      mesh.renderOrder = slot === "pipe" || slot === "glass" ? 10 : 0;
      this.meshes[slot] = mesh;
      this.ranges[slot] = a.ranges;
      this.colourRanges[slot] = a.vranges;
      this.group.add(mesh);
      this.stats.triangles += a.idx.length / 3;
      this.stats.vertices += a.pos.length / 3;
      this.stats.drawCalls += 1;
    }
    const pts = this.payload.orbit.map(v => new THREE.Vector3(v[0], v[1], v[2]));
    this.orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
                                new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.9, depthTest: false }));
    this.orbit.name = "reference_orbit";
    this.orbit.renderOrder = 20;
    this.group.add(this.orbit);
    this.stats.buildMs = performance.now() - t0;
    this.pickables = Object.values(this.meshes).filter(m => m.name !== "glass");
    this.overrides = new OverrideModels(this, palette);
    this.group.add(this.overrides.group);
  }

  /** Load the glTF overrides (asynchronous; the procedural scene is already on screen). */
  async loadOverrides() {
    await this.overrides.load();
    for (const o of this.overrides.objects) this.pickables.push(o);
    return this.overrides.report;
  }

  /** The element behind a raycast hit on one of the merged meshes (faceIndex -> element via the ranges). */
  elementAt(hit) {
    if (hit.object.userData && hit.object.userData.i != null) return hit.object.userData.i;
    const ranges = this.ranges[hit.object.name];
    if (!ranges) return -1;
    const idx = hit.faceIndex * 3;
    let lo = 0, hi = ranges.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r = ranges[mid];
      if (idx < r.start) hi = mid - 1;
      else if (idx >= r.start + r.count) lo = mid + 1;
      else return r.i;
    }
    return -1;
  }

  /** Paint one element's vertices: `tint` lerps toward white by `strength`; strength 0 restores. */
  paint(i, palette, strength) {
    if (i < 0) return;
    const kindHex = palette[this.kindOf(i)] || "#888888";
    const white = new THREE.Color(0xffffff);
    for (const [slot, vr] of Object.entries(this.colourRanges)) {
      const spans = vr[i];
      if (!spans) continue;
      const attr = this.meshes[slot].geometry.getAttribute("color");
      const [r, g, b] = slotColour(slot, kindHex);
      const c = new THREE.Color(r, g, b).lerp(white, strength);
      for (const [start, count] of spans) for (let k = start; k < start + count; k++) attr.setXYZ(k, c.r, c.g, c.b);
      attr.needsUpdate = true;
    }
  }

  recolour(palette) {
    for (let i = 0; i < this.n; i++) this.paint(i, palette, 0);
    this._lit = null;
  }

  highlight(index, palette, strength = 0.5) {
    if (this._lit != null && this._lit !== index) this.paint(this._lit, palette, 0);
    this._lit = index >= 0 ? index : null;
    if (index >= 0) this.paint(index, palette, strength);
  }

  bounds() {
    const b = this.payload.lattice.bbox;
    const box = new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max));
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    if (sphere.radius < 0.5) sphere.radius = 0.5;
    return { box, sphere };
  }

  centreOf(i) {
    const el = this.payload.el;
    return new THREE.Vector3(el.pc[3 * i], el.pc[3 * i + 1], el.pc[3 * i + 2]);
  }
}
