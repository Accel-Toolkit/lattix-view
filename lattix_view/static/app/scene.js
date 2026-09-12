// The scene from a payload (lattix-view.scene/1): every element built by the model library in its own
// centre frame, transformed by its body pose, merged per material slot into one mesh per chunk of
// consecutive elements, with an element index per triangle range for picking.  Each chunk carries three
// levels of detail (full parts, schematic parts, one box per element) and shows the one its distance to
// the camera asks for; on small scenes the full level is kept everywhere.
import * as THREE from "../vendor/three/three.module.js";
import { box } from "./models/geom.js";
import { build, optionsFor } from "./models/index.js";
import { chunkBounds, chunkLimits, lodDistances, lodLevel, partition, sphereDistance } from "./models/chunks.js";
import { makeMaterials, slotColour } from "./scene/materials.js";
import { OverrideModels } from "./scene/overrides.js";

export const HIDDEN = 64;
const LEVELS = 3;
const LOD0_KEEP = 32;                        // built full-detail chunks kept when the scene is lazy

export class LatticeScene {
  constructor(payload, palette, theme, opts = {}) {
    this.payload = payload;
    this.n = payload.lattice.n;
    this.group = new THREE.Group();
    this.group.name = "lattice";
    this.opts = optionsFor(this.n, opts);
    this.levelOpts = [
      this.opts,
      { ...this.opts, style: "schematic", segs: 12, flanges: false, vessels: false, lod: 1 },
      { ...this.opts, lod: 2 },
    ];
    this.materials = makeMaterials(theme);
    this.palette = palette;
    this.lazy = !!opts.lazy || this.n > 3000;
    this.forcedLevel = null;                  // schematic style shows level 1 everywhere
    this.bias = opts.lodBias || 1;
    this.stats = { triangles: 0, vertices: 0, drawCalls: 0, buildMs: 0, chunks: 0, levels: [0, 0, 0] };
    this.chunks = [];
    this.chunkOf = new Int32Array(this.n).fill(-1);
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

  /** The parts of element i at a level: the library's parts, or one box in the kind slot at level 2. */
  partsOf(i, level) {
    const el = this.payload.el;
    if ((el.flags[i] & HIDDEN) || this._replaced.has(i)) return [];
    const spec = this.specOf(i);
    const re = this._assign[i];
    if (re && re.archetype) { spec.archetype = re.archetype; spec.params = { ...spec.params, ...(re.params || {}) }; }
    if (level === 2) {
      if (spec.kind === "Drift" || spec.kind === "Directive") return [];
      const hz = spec.L > 0 ? spec.L / 2 : spec.size[2];
      return [{ slot: "kind", mesh: box(Math.max(spec.size[0], 0.01), Math.max(spec.size[1], 0.01), Math.max(hz, 0.005)) }];
    }
    try { return build(spec, this.levelOpts[level]); } catch (e) { console.warn("model failed", spec.kind, spec.sub, e); return []; }
  }

  build(palette) {
    const t0 = performance.now();
    const el = this.payload.el, L = this.payload.lattice;
    this._replaced = OverrideModels.replaced(this.payload);
    this._assign = (this.payload.overrides && this.payload.overrides.assign) || {};
    const runs = partition(el.s, this.n, chunkLimits(this.n, L.total_length));
    this.chunks = runs.map((r, k) => {
      const b = chunkBounds(el, r.start, r.end);
      for (let i = r.start; i < r.end; i++) this.chunkOf[i] = k;
      return { index: k, start: r.start, end: r.end, centre: b.centre, radius: b.radius, levels: [null, null, null], level: -1, used: 0 };
    });
    this.stats.chunks = this.chunks.length;
    for (const c of this.chunks) {
      if (!this.lazy) this.buildLevel(c, 0);
      this.buildLevel(c, 1);
      this.buildLevel(c, 2);
    }
    const full = this.lazy ? Infinity : this.chunks.reduce((t, c) => t + c.levels[0].triangles, 0);
    this.distances = lodDistances(L.total_length, full, { bias: this.bias });
    this.stats.triangles = this.lazy ? 0 : full;
    this.stats.vertices = this.lazy ? 0 : this.chunks.reduce((t, c) => t + c.levels[0].vertices, 0);
    const pts = this.payload.orbit.map(v => new THREE.Vector3(v[0], v[1], v[2]));
    this.orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
                                new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.9, depthTest: false }));
    this.orbit.name = "reference_orbit";
    this.orbit.renderOrder = 20;
    this.group.add(this.orbit);
    this.overrides = new OverrideModels(this, palette);
    this.group.add(this.overrides.group);
    this.stats.buildMs = performance.now() - t0;
    this._lit = null;
  }

  /** Build one level of one chunk: the parts of its elements merged per slot into meshes with ranges. */
  buildLevel(chunk, level) {
    if (chunk.levels[level]) return chunk.levels[level];
    const el = this.payload.el;
    const acc = {};                         // slot -> {pos, nrm, col, idx, ranges, vranges}
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), n = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = chunk.start; i < chunk.end; i++) {
      const parts = this.partsOf(i, level);
      if (!parts.length) continue;
      p.set(el.pb[3 * i], el.pb[3 * i + 1], el.pb[3 * i + 2]);
      q.set(el.qb[4 * i], el.qb[4 * i + 1], el.qb[4 * i + 2], el.qb[4 * i + 3]);
      const kindHex = this.palette[this.kindOf(i)] || "#888888";
      for (const part of parts) {
        const a = acc[part.slot] || (acc[part.slot] = { pos: [], nrm: [], col: [], idx: [], ranges: [], vranges: {} });
        const base = a.pos.length / 3;
        const [r, g, b] = slotColour(part.slot, kindHex);
        const m = part.mesh;
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
        (a.vranges[i] || (a.vranges[i] = [])).push([base, m.positions.length / 3]);
      }
    }
    const holder = new THREE.Group();
    holder.name = `chunk${chunk.index}:lod${level}`;
    holder.visible = false;
    let triangles = 0, vertices = 0;
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
      mesh.userData = { chunk: chunk.index, level, ranges: a.ranges, vranges: a.vranges };
      holder.add(mesh);
      triangles += a.idx.length / 3;
      vertices += a.pos.length / 3;
    }
    const built = { holder, meshes: holder.children.slice(), triangles, vertices };
    chunk.levels[level] = built;
    this.group.add(holder);
    return built;
  }

  /** Drop one level of a chunk: its GPU buffers go, the other levels stay. */
  dropLevel(chunk, level) {
    const lv = chunk.levels[level];
    if (!lv) return;
    for (const m of lv.meshes) m.geometry.dispose();
    this.group.remove(lv.holder);
    chunk.levels[level] = null;
    if (chunk.level === level) chunk.level = -1;
  }

  /**
   * Per frame: pick every chunk's level from its distance to the camera (or the forced level), building
   * the full level on demand in lazy scenes and keeping only the most recently used ones.
   */
  updateLOD(cameraPosition, frame = 0) {
    const cp = [cameraPosition.x, cameraPosition.y, cameraPosition.z];
    const counts = [0, 0, 0];
    for (const c of this.chunks) {
      let level = this.forcedLevel != null ? this.forcedLevel : lodLevel(sphereDistance(cp, c.centre, c.radius), this.distances);
      if (level === 0 && !c.levels[0]) { this.buildLevel(c, 0); this._trimLod0(frame); }
      if (!c.levels[level]) level = c.levels[1] ? 1 : 2;
      if (level !== c.level) {
        for (let k = 0; k < LEVELS; k++) if (c.levels[k]) c.levels[k].holder.visible = k === level;
        c.level = level;
      }
      if (level === 0) c.used = frame;
      counts[level]++;
    }
    this.stats.levels = counts;
    return counts;
  }

  _trimLod0(frame) {
    if (!this.lazy) return;
    const built = this.chunks.filter(c => c.levels[0]);
    if (built.length <= LOD0_KEEP) return;
    built.sort((a, b) => a.used - b.used);
    for (const c of built.slice(0, built.length - LOD0_KEEP)) if (c.used !== frame && c.level !== 0) this.dropLevel(c, 0);
  }

  /** Force a level everywhere (1 = schematic) or null for distance-based levels. */
  setForcedLevel(level) { this.forcedLevel = level; }

  /** The meshes a ray may hit now: the visible level of every chunk (glass excluded) and the overrides. */
  get pickables() {
    const out = [];
    for (const c of this.chunks) {
      const lv = c.level >= 0 ? c.levels[c.level] : null;
      if (lv) for (const m of lv.meshes) if (m.name !== "glass") out.push(m);
    }
    return out.concat(this.overrides.meshes);
  }

  /** Load the glTF overrides (asynchronous; the procedural scene is already on screen). */
  async loadOverrides() {
    await this.overrides.load();
    return this.overrides.report;
  }

  /** The element behind a raycast hit on one of the merged meshes (faceIndex -> element via the ranges). */
  elementAt(hit) {
    const ud = hit.object.userData || {};
    if (ud.i != null) return ud.i;
    const ranges = ud.ranges;
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

  /** Paint one element's vertices in every built level: `strength` lerps toward white; 0 restores. */
  paint(i, palette, strength) {
    if (i < 0 || i >= this.n) return;
    const c = this.chunks[this.chunkOf[i]];
    if (!c) return;
    const kindHex = palette[this.kindOf(i)] || "#888888";
    const white = new THREE.Color(0xffffff);
    for (const lv of c.levels) {
      if (!lv) continue;
      for (const mesh of lv.meshes) {
        const spans = mesh.userData.vranges[i];
        if (!spans) continue;
        const attr = mesh.geometry.getAttribute("color");
        const [r, g, b] = slotColour(mesh.name, kindHex);
        const col = new THREE.Color(r, g, b).lerp(white, strength);
        for (const [start, count] of spans) for (let k = start; k < start + count; k++) attr.setXYZ(k, col.r, col.g, col.b);
        attr.needsUpdate = true;
      }
    }
  }

  recolour(palette) {
    this.palette = palette;
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
    const box3 = new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max));
    const sphere = new THREE.Sphere();
    box3.getBoundingSphere(sphere);
    if (sphere.radius < 0.5) sphere.radius = 0.5;
    return { box: box3, sphere };
  }

  centreOf(i) {
    const el = this.payload.el;
    return new THREE.Vector3(el.pc[3 * i], el.pc[3 * i + 1], el.pc[3 * i + 2]);
  }

  /** Free every GPU buffer of the scene. */
  dispose() {
    for (const c of this.chunks) for (let k = 0; k < LEVELS; k++) this.dropLevel(c, k);
    if (this.orbit) this.orbit.geometry.dispose();
    for (const m of Object.values(this.materials)) m.dispose();
  }
}
