// The reference orbit as a polyline with path positions, projection of a point onto it, and the exact
// frame inside an element at a path position (straight from the entrance frame; the arc for a bend).
import { add, axesOf, cross, dist, dot, norm, rotate, scale, sub } from "./vec.js";

/** Build {pts, s} from the payload's orbit polyline. */
export function buildOrbit(points) {
  const pts = points.map(p => [p[0], p[1], p[2]]);
  const s = [0];
  for (let k = 1; k < pts.length; k++) s.push(s[k - 1] + dist(pts[k], pts[k - 1]));
  return { pts, s, length: s[s.length - 1] || 0 };
}

/** The closest point of the polyline to p: {s, q, seg, d}. */
export function projectToOrbit(orbit, p) {
  let best = null;
  for (let k = 0; k + 1 < orbit.pts.length; k++) {
    const a = orbit.pts[k], b = orbit.pts[k + 1];
    const ab = sub(b, a);
    const L2 = dot(ab, ab);
    const t = L2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / L2)) : 0;
    const q = add(a, scale(ab, t));
    const d = dist(p, q);
    if (!best || d < best.d) best = { s: orbit.s[k] + t * Math.sqrt(L2), q, seg: k, d };
  }
  return best;
}

/** Index of the element whose [s_in, s_out] contains s (the last one when several end there). */
export function elementAtS(el, n, s) {
  let found = -1;
  for (let i = 0; i < n; i++) {
    const s0 = el.s[2 * i], s1 = el.s[2 * i + 1];
    if (s0 - 1e-9 <= s && s <= s1 + 1e-9 && s1 > s0) found = i;
  }
  return found;
}

/** The reference-orbit frame at path position s inside element i: {p, ax:{x,y,z}} from the entrance frame.
 *  Mirrors lattix.ir.frames: straight elements advance along z; a bend follows its arc, rolled by tilt_ref. */
export function frameAt(el, i, s) {
  const pin = [el.pin[3 * i], el.pin[3 * i + 1], el.pin[3 * i + 2]];
  const qin = [el.qin[4 * i], el.qin[4 * i + 1], el.qin[4 * i + 2], el.qin[4 * i + 3]];
  const ax = axesOf(qin);
  const L = el.L[i];
  const u = Math.max(0, Math.min(1, L > 0 ? (s - el.s[2 * i]) / L : 0));
  const angle = el.arc[2 * i], tilt = el.arc[2 * i + 1];
  if (!angle || L <= 0) {
    return { p: add(pin, scale(ax.z, u * L)), ax };
  }
  const rho = L / angle, a = angle * u;
  const c = Math.cos(a), sn = Math.sin(a);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  // local displacement and tangent of the arc in the bend plane, then rolled by tilt about s
  const local = [rho * (c - 1), 0, rho * sn];
  const tang = [-sn, 0, c];
  const R = v => [ct * v[0] - st * v[1], st * v[0] + ct * v[1], v[2]];
  const dl = R(local), tl = R(tang), xl = R([c, 0, sn]);
  const p = add(pin, add(scale(ax.x, dl[0]), add(scale(ax.y, dl[1]), scale(ax.z, dl[2]))));
  const z = norm(add(scale(ax.x, tl[0]), add(scale(ax.y, tl[1]), scale(ax.z, tl[2]))));
  const x = norm(add(scale(ax.x, xl[0]), add(scale(ax.y, xl[1]), scale(ax.z, xl[2]))));
  const y = cross(z, x);
  return { p, ax: { x, y, z } };
}

/** Refine a polyline projection onto the true orbit with two Newton steps along s. */
export function projectExact(orbit, el, n, p) {
  const rough = projectToOrbit(orbit, p);
  if (!rough) return null;
  let s = rough.s;
  let i = elementAtS(el, n, s);
  if (i < 0) return { s, q: rough.q, i: -1, ax: null };
  let f = frameAt(el, i, s);
  for (let k = 0; k < 12; k++) {              // Newton on the arc: linear convergence at ratio offset/rho
    const ds = dot(f.ax.z, sub(p, f.p));
    s = Math.max(el.s[2 * i], Math.min(el.s[2 * i + 1], s + ds));
    f = frameAt(el, i, s);
    if (Math.abs(ds) < 1e-12) break;
  }
  return { s, q: f.p, i, ax: f.ax };
}

/** Local (s, x, y) of a global point: its projection on the orbit and the transverse offsets there. */
export function localCoords(orbit, el, n, p) {
  const r = projectExact(orbit, el, n, p);
  if (!r || !r.ax) return null;
  const d = sub(p, r.q);
  return { s: r.s, x: dot(d, r.ax.x), y: dot(d, r.ax.y), i: r.i, q: r.q, ax: r.ax };
}

/** Closest approach of a ray (o, d unit) to the segment a-b: {t (along the ray), u (0..1 on the segment), q, dist}. */
export function raySegment(o, d, a, b) {
  const r = sub(b, a), w = sub(o, a);                  // closest points of the lines o + t d and a + u r
  const A = dot(d, d), B = dot(d, r), C = dot(r, r), D = dot(d, w), E = dot(r, w);
  const den = A * C - B * B;
  let u;
  if (den < 1e-12 * A * C || C === 0) u = C > 0 ? Math.max(0, Math.min(1, -E / C)) : 0;
  else u = Math.max(0, Math.min(1, (A * E - B * D) / den));
  const q = add(a, scale(r, u));
  const t = Math.max(0, dot(sub(q, o), d));
  const onRay = add(o, scale(d, t));
  return { t, u, q, dist: dist(q, onRay) };
}

/** Rotate helper re-exported for the tools. */
export { rotate };
