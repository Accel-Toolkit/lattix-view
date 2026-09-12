// Applying a glTF override: the file's model is measured (or trusts its extras.lattix), scaled by the
// units and the fit, re-oriented from its up/forward to the body frame, rotated, offset, and placed by the
// anchor.  The maths is pure (plain arrays) so it is tested under node; the loading lives in scene/.

const AXIS = { "+x": [1, 0, 0], "-x": [-1, 0, 0], "+y": [0, 1, 0], "-y": [0, -1, 0], "+z": [0, 0, 1], "-z": [0, 0, -1] };
const UNITS = { m: 1, cm: 0.01, mm: 0.001 };

/** Columns of the basis that maps the file's (right, up, forward) onto the body frame's (x, y, z). */
export function orientationBasis(up = "+y", forward = "+z") {
  const u = AXIS[up] || AXIS["+y"], f = AXIS[forward] || AXIS["+z"];
  const r = [u[1] * f[2] - u[2] * f[1], u[2] * f[0] - u[0] * f[2], u[0] * f[1] - u[1] * f[0]];   // right = up x forward
  // the file's axis r maps to body x, u to body y, f to body z: basis B with B * r = x, etc.  B = [x y z] * inverse([r u f]);
  // r, u, f are orthonormal, so the inverse is the transpose
  const M = [r, u, f];                                  // rows: file axes
  return [[M[0][0], M[1][0], M[2][0]], [M[0][1], M[1][1], M[2][1]], [M[0][2], M[1][2], M[2][2]]];   // columns of the inverse
}

/**
 * The transform of a loaded model into the element's body frame.
 * `bbox` {min, max} of the file (its own units), `extras` the root node's lattix extras or null,
 * `entry` the assignment (units, up, forward, anchor, fit, scale, rotate, offset), `spec` {L, size, bore, chord}.
 * Returns {scale: [sx, sy, sz], basis: 3x3 (rows), rotate: [rx, ry, rz] rad, position: [x, y, z]} to compose as
 * position + R(rotate) * basis * (scale * p_file).
 */
export function fitTransform(bbox, extras, entry, spec) {
  const u = UNITS[entry.units] || 1;
  const basis = orientationBasis(entry.up, entry.forward);
  const apply = p => [basis[0][0] * p[0] + basis[0][1] * p[1] + basis[0][2] * p[2],
                      basis[1][0] * p[0] + basis[1][1] * p[1] + basis[1][2] * p[2],
                      basis[2][0] * p[0] + basis[2][1] * p[1] + basis[2][2] * p[2]];
  // the file's extent in the body frame after re-orientation and the unit scale
  const corners = [];
  for (const x of [bbox.min[0], bbox.max[0]]) for (const y of [bbox.min[1], bbox.max[1]]) for (const z of [bbox.min[2], bbox.max[2]]) corners.push(apply([x * u, y * u, z * u]));
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const c of corners) for (let d = 0; d < 3; d++) { lo[d] = Math.min(lo[d], c[d]); hi[d] = Math.max(hi[d], c[d]); }
  const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const declaredLength = extras && extras.length_m ? extras.length_m : null;
  const declaredBore = extras && extras.bore_m ? extras.bore_m : null;
  let s = Array.isArray(entry.scale) ? entry.scale.slice() : [entry.scale, entry.scale, entry.scale];
  const fit = entry.fit || "none";
  const target = spec.L > 0 ? spec.L : 2 * spec.size[2];
  if (fit === "length") {
    const have = declaredLength != null ? declaredLength * u : ext[2] * s[2];
    if (have > 0) s = s.map(v => v * target / have);
  } else if (fit === "bore") {
    const have = declaredBore != null ? declaredBore * u : Math.min(ext[0], ext[1]) * s[0] / 2;
    const want = Math.max(...spec.bore);
    if (have > 0) s = s.map(v => v * want / have);
  } else if (fit === "box") {
    s = [ext[0] > 0 ? 2 * spec.size[0] / ext[0] : s[0], ext[1] > 0 ? 2 * spec.size[1] / ext[1] : s[1], ext[2] > 0 ? target / ext[2] : s[2]];
  }
  // the anchor: where the file's origin sits in the body frame (the centre frame of the element)
  const anchor = (extras && extras.anchor) || entry.anchor || "centre";
  const halfL = spec.L > 0 ? spec.L / 2 : spec.size[2];
  let position = [0, 0, 0];
  if (anchor === "entrance") position = [0, 0, -halfL];
  else if (anchor === "exit") position = [0, 0, halfL];
  else if (anchor === "chord") position = [0, 0, 0];
  position = position.map((v, k) => v + (entry.offset ? entry.offset[k] : 0));
  const rotate = (entry.rotate || [0, 0, 0]).map(d => d * Math.PI / 180);
  return { scale: s.map(v => v * u), basis, rotate, position, extent: ext, fitted: fit };
}
