// Pure triangle-mesh construction: no DOM, no three.js, so the builders run and are tested under node.
// A Mesh is { positions: number[], normals: number[], indices: number[] } with vertex data in the
// element's centre frame (origin at the element centre on the beam axis, +z along s, +y up,
// +x to the left looking downstream).

export class MeshBuilder {
  constructor() { this.positions = []; this.normals = []; this.indices = []; }
  get vertexCount() { return this.positions.length / 3; }
  get triangleCount() { return this.indices.length / 3; }
  vertex(p, n) { this.positions.push(p[0], p[1], p[2]); this.normals.push(n[0], n[1], n[2]); return this.vertexCount - 1; }
  tri(a, b, c) { this.indices.push(a, b, c); }
  quad(a, b, c, d) { this.indices.push(a, b, c, a, c, d); }
  /** Append another mesh, optionally transformed by an affine {q: quaternion, t: translation} or a 3x3 basis. */
  append(mesh, xf) {
    const base = this.vertexCount;
    const n = mesh.positions.length / 3;
    for (let k = 0; k < n; k++) {
      let p = [mesh.positions[3 * k], mesh.positions[3 * k + 1], mesh.positions[3 * k + 2]];
      let nv = [mesh.normals[3 * k], mesh.normals[3 * k + 1], mesh.normals[3 * k + 2]];
      if (xf) { p = xf.apply(p); nv = xf.applyNormal(nv); }
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(nv[0], nv[1], nv[2]);
    }
    for (const i of mesh.indices) this.indices.push(i + base);
    return this;
  }
  toMesh() { return { positions: this.positions, normals: this.normals, indices: this.indices }; }
}

// -- small vector helpers ----------------------------------------------------------------------------
export const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

/** An affine transform: rotate by a 3x3 basis (columns = images of x, y, z) then translate. */
export class Transform {
  constructor(basis, t) { this.b = basis || [1, 0, 0, 0, 1, 0, 0, 0, 1]; this.t = t || [0, 0, 0]; }
  static translate(t) { return new Transform(null, t); }
  static rotateZ(a) { const c = Math.cos(a), s = Math.sin(a); return new Transform([c, s, 0, -s, c, 0, 0, 0, 1]); }
  static rotateY(a) { const c = Math.cos(a), s = Math.sin(a); return new Transform([c, 0, -s, 0, 1, 0, s, 0, c]); }
  static rotateX(a) { const c = Math.cos(a), s = Math.sin(a); return new Transform([1, 0, 0, 0, c, s, 0, -s, c]); }
  /** Columns ex, ey, ez placed at p: the frame's own coordinates map to the parent's. */
  static frame(ex, ey, ez, p) { return new Transform([ex[0], ex[1], ex[2], ey[0], ey[1], ey[2], ez[0], ez[1], ez[2]], p); }
  apply(p) {
    const b = this.b;
    return [b[0] * p[0] + b[3] * p[1] + b[6] * p[2] + this.t[0],
            b[1] * p[0] + b[4] * p[1] + b[7] * p[2] + this.t[1],
            b[2] * p[0] + b[5] * p[1] + b[8] * p[2] + this.t[2]];
  }
  applyNormal(n) {          // the bases used here are orthonormal, so normals transform like vectors
    const b = this.b;
    return [b[0] * n[0] + b[3] * n[1] + b[6] * n[2], b[1] * n[0] + b[4] * n[1] + b[7] * n[2], b[2] * n[0] + b[5] * n[1] + b[8] * n[2]];
  }
  then(other) {             // this, then other:  x -> other(this(x))
    const a = this.b, b = other.b;
    const m = new Array(9);
    for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) {
      m[3 * col + row] = b[row] * a[3 * col] + b[3 + row] * a[3 * col + 1] + b[6 + row] * a[3 * col + 2];
    }
    return new Transform(m, other.apply(this.t));
  }
}

// -- primitives -------------------------------------------------------------------------------------
/** A box with half-extents (hx, hy, hz) centred at c. */
export function box(hx, hy, hz, c = [0, 0, 0]) {
  const m = new MeshBuilder();
  const faces = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
  ];
  const h = [hx, hy, hz];
  for (const [n, u, v] of faces) {
    const centre = [c[0] + n[0] * h[0], c[1] + n[1] * h[1], c[2] + n[2] * h[2]];
    const du = [u[0] * h[0], u[1] * h[1], u[2] * h[2]], dv = [v[0] * h[0], v[1] * h[1], v[2] * h[2]];
    const a = m.vertex(v3.sub(v3.sub(centre, du), dv), n), b = m.vertex(v3.sub(v3.add(centre, du), dv), n);
    const cc = m.vertex(v3.add(v3.add(centre, du), dv), n), d = m.vertex(v3.add(v3.sub(centre, du), dv), n);
    m.quad(a, b, cc, d);
  }
  return m.toMesh();
}

/** A polygon profile in the x-y plane: ellipse (hx, hy) or rectangle, `segs` points, counter-clockwise. */
export function profile(shape, hx, hy, segs) {
  const pts = [];
  if (shape === "rect") {
    const n = Math.max(4, Math.round(segs / 4) * 4);
    const per = n / 4;
    const corners = [[hx, -hy], [hx, hy], [-hx, hy], [-hx, -hy]];
    for (let k = 0; k < 4; k++) {
      const a = corners[k], b = corners[(k + 1) % 4];
      for (let j = 0; j < per; j++) { const t = j / per; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return pts;
  }
  for (let k = 0; k < segs; k++) { const a = 2 * Math.PI * k / segs; pts.push([hx * Math.cos(a), hy * Math.sin(a)]); }
  return pts;
}

/** Surface of revolution about z: `pts` are [r, z] pairs along the generatrix (r >= 0), closed polygon
 *  in (r, z) when `closed`, else an open profile (a shell).  `segs` around; `phase` rotates the first vertex. */
export function lathe(pts, segs, { closed = true, phase = 0, flat = false } = {}) {
  const m = new MeshBuilder();
  const n = pts.length;
  const rings = [];
  const edgeCount = closed ? n : n - 1;
  for (let e = 0; e < edgeCount; e++) {
    const a = pts[e], b = pts[(e + 1) % n];
    const dr = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dr, dz) || 1;
    const nr = dz / L, nz = -dr / L;            // outward normal of the generatrix edge (for ccw (r, z) polygons)
    const ringA = [], ringB = [];
    for (let k = 0; k <= segs; k++) {
      const t = 2 * Math.PI * k / segs + phase;
      const c = Math.cos(t), s = Math.sin(t);
      const nA = flat ? [c * nr, s * nr, nz] : [c * nr, s * nr, nz];
      ringA.push(m.vertex([a[0] * c, a[0] * s, a[1]], nA));
      ringB.push(m.vertex([b[0] * c, b[0] * s, b[1]], nA));
    }
    rings.push([ringA, ringB]);
    for (let k = 0; k < segs; k++) m.quad(ringA[k], ringB[k], ringB[k + 1], ringA[k + 1]);
  }
  return m.toMesh();
}

/** A tube: sweep a closed 2D profile (in the frame's x-y plane) along `frames`, each {p, x, y, z}
 *  (position and unit axes).  Caps the ends when `caps`. */
export function sweep(prof, frames, { caps = true } = {}) {
  const m = new MeshBuilder();
  const n = prof.length;
  const rings = frames.map(f => {
    const ring = [];
    for (let k = 0; k <= n; k++) {
      const q = prof[k % n], qn = prof[(k + 1) % n], qp = prof[(k - 1 + n) % n];
      // outward normal of the profile at q: perpendicular to the neighbouring edges' mean tangent
      const tx = qn[0] - qp[0], ty = qn[1] - qp[1];
      const l = Math.hypot(tx, ty) || 1;
      const nx = ty / l, ny = -tx / l;
      const p = v3.add(f.p, v3.add(v3.scale(f.x, q[0]), v3.scale(f.y, q[1])));
      const nv = v3.add(v3.scale(f.x, nx), v3.scale(f.y, ny));
      ring.push(m.vertex(p, nv));
    }
    return ring;
  });
  for (let s = 0; s + 1 < frames.length; s++) {
    for (let k = 0; k < n; k++) m.quad(rings[s][k], rings[s][k + 1], rings[s + 1][k + 1], rings[s + 1][k]);
  }
  if (caps && frames.length > 1) {
    for (const [s, sign] of [[0, -1], [frames.length - 1, 1]]) {
      const f = frames[s];
      const nrm = v3.scale(f.z, sign);
      const centre = m.vertex(f.p, nrm);
      const ids = prof.map(q => m.vertex(v3.add(f.p, v3.add(v3.scale(f.x, q[0]), v3.scale(f.y, q[1]))), nrm));
      for (let k = 0; k < n; k++) {
        const a = ids[k], b = ids[(k + 1) % n];
        if (sign > 0) m.tri(centre, a, b); else m.tri(centre, b, a);
      }
    }
  }
  return m.toMesh();
}

/** Straight frames along +z from z0 to z1 (two stations). */
export function straightFrames(z0, z1) {
  return [{ p: [0, 0, z0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, { p: [0, 0, z1], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }];
}

/** A tube of circular cross-section (radius r) swept along a polyline `path` (closed when `closed`),
 *  frames by parallel transport: coils and rings. */
export function sweepCircle(path, r, segs, { closed = true, tube = 8 } = {}) {
  const pts = closed ? [...path, path[0]] : path;
  const frames = [];
  let prevY = null;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k];
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
    let z = v3.norm(v3.sub(b, a));
    if (v3.len(v3.sub(b, a)) === 0) z = [0, 0, 1];
    let y = prevY ? v3.sub(prevY, v3.scale(z, v3.dot(prevY, z))) : (Math.abs(z[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
    y = v3.norm(v3.sub(y, v3.scale(z, v3.dot(y, z))));
    const x = v3.cross(y, z);
    prevY = y;
    frames.push({ p, x, y, z });
  }
  return sweep(profile("ellipse", r, r, tube), frames, { caps: !closed });
}

/** A racetrack path in the plane spanned by (u, v) at centre c: straight length `a` along u, `b` along v,
 *  corner radius `rc`, `corner` points per corner. */
export function racetrack(c, u, v, a, b, rc, corner = 4) {
  const pts = [];
  const hx = a / 2 - rc, hy = b / 2 - rc;
  const corners = [[hx, hy, 0], [-hx, hy, Math.PI / 2], [-hx, -hy, Math.PI], [hx, -hy, 3 * Math.PI / 2]];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= corner; k++) {
      const t = a0 + (Math.PI / 2) * k / corner;
      const px = cx + rc * Math.cos(t), py = cy + rc * Math.sin(t);
      pts.push(v3.add(c, v3.add(v3.scale(u, px), v3.scale(v, py))));
    }
  }
  return pts;
}

/** A ring (torus) of major radius R and tube radius r in the x-y plane at z. */
export function torus(R, r, segs, tube, z = 0) {
  const path = [];
  for (let k = 0; k < segs; k++) { const t = 2 * Math.PI * k / segs; path.push([R * Math.cos(t), R * Math.sin(t), z]); }
  return sweepCircle(path, r, segs, { closed: true, tube });
}

/** Axis-aligned bounds of a mesh. */
export function bounds(mesh) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < mesh.positions.length; k += 3) {
    for (let d = 0; d < 3; d++) { const v = mesh.positions[k + d]; if (v < lo[d]) lo[d] = v; if (v > hi[d]) hi[d] = v; }
  }
  return { min: lo, max: hi };
}

export function transformed(mesh, xf) { return new MeshBuilder().append(mesh, xf).toMesh(); }
export function merged(meshes) { const m = new MeshBuilder(); for (const x of meshes) m.append(x); return m.toMesh(); }
