// Snapping for the measurement tools, in screen space so it is zoom-invariant: frame points of the
// element under the cursor and its neighbours first, then the beam axis, then the picked surface,
// then the floor plane, else a free point at the pick depth.
import { add, dist, scale, sub } from "./vec.js";
import { raySegment } from "./orbit.js";

export const TIERS = ["frame", "axis", "surface", "floor", "free"];

/** Frame points (entrance, centre, exit, body) of element i. */
export function framePoints(el, i) {
  const at = (arr, k) => [arr[3 * k], arr[3 * k + 1], arr[3 * k + 2]];
  const pts = [{ kind: "in", p: at(el.pin, i) }, { kind: "c", p: at(el.pc, i) }, { kind: "out", p: at(el.pout, i) }];
  if (el.flags[i] & 2) pts.push({ kind: "body", p: at(el.pb, i) });
  return pts.map(x => ({ ...x, i }));
}

/**
 * Pick the snapped point.  `project(p) -> [px, py] | null` projects a global point to the canvas;
 * `ray = {o, d}` is the pick ray; `hit` the surface hit {p, i} or null; `near` the elements to consider;
 * `orbitSegs(i) -> [[a, b], ...]` the orbit segments of element i; `floorY` the floor plane.
 */
export function snap({ cursor, project, ray, hit, near, el, orbitSegs, floorY, radiusPx = 12, fallbackDepth = 10 }) {
  const within = p => { const s = project(p); return s ? Math.hypot(s[0] - cursor[0], s[1] - cursor[1]) : Infinity; };
  let best = null;
  // tier 1: frame points
  for (const i of near) for (const fp of framePoints(el, i)) {
    const d = within(fp.p);
    if (d <= radiusPx && (!best || d < best.px)) best = { tier: "frame", kind: fp.kind, i, p: fp.p, px: d };
  }
  if (best) return best;
  // tier 2: the beam axis of the nearby elements: the closest approach of the ray to each orbit segment
  for (const i of near) for (const [a, b] of orbitSegs(i)) {
    const r = raySegment(ray.o, ray.d, a, b);
    const d = within(r.q);
    if (d <= radiusPx && (!best || d < best.px)) best = { tier: "axis", kind: "axis", i, p: r.q, px: d };
  }
  if (best) return best;
  // tier 3: the surface under the cursor
  if (hit) return { tier: "surface", kind: "surface", i: hit.i, p: hit.p, px: 0 };
  // tier 4: the floor plane
  if (Math.abs(ray.d[1]) > 1e-6) {
    const t = (floorY - ray.o[1]) / ray.d[1];
    if (t > 0) return { tier: "floor", kind: "floor", i: -1, p: add(ray.o, scale(ray.d, t)), px: 0 };
  }
  return { tier: "free", kind: "free", i: -1, p: add(ray.o, scale(ray.d, fallbackDepth)), px: 0 };
}

/** Elements within `reach` indices of i (or the whole line when i < 0), skipping hidden ones. */
export function nearElements(el, n, i, reach = 2) {
  if (i < 0) return [];
  const out = [];
  for (let k = Math.max(0, i - reach); k <= Math.min(n - 1, i + reach); k++) if (!(el.flags[k] & 64)) out.push(k);
  return out;
}

export { dist, sub };
