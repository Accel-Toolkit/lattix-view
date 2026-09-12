// Arc frames of a bend in its centre frame: the arc passes through the origin with tangent +z and
// curves in the plane rolled by tilt_ref about z (MAD-X: a positive angle turns toward -x; a tilt of
// +pi/2 turns toward -y).  Mirrors lattix.ir.frames: p(phi) = R(tilt) (rho (cos phi - 1), 0, rho sin phi).
import { v3 } from "./geom.js";

export function rotS(tilt) {
  const c = Math.cos(tilt), s = Math.sin(tilt);
  return v => [c * v[0] - s * v[1], s * v[0] + c * v[1], v[2]];
}

/** Frames along the arc from phi = -angle/2 to +angle/2 (n + 1 stations), each {p, x, y, z, phi}. */
export function arcFrames(rho, angle, tilt, n) {
  const R = rotS(tilt || 0);
  const out = [];
  for (let k = 0; k <= n; k++) {
    const phi = -angle / 2 + angle * k / n;
    const c = Math.cos(phi), s = Math.sin(phi);
    const p = R([rho * (c - 1), 0, rho * s]);
    const z = R([-s, 0, c]);
    const x = R([c, 0, s]);
    const y = v3.cross(z, x);
    out.push({ p, x, y, z, phi });
  }
  return out;
}

/** The number of arc stations for an angle at a given step (radians per segment), at least `min`. */
export function arcSegments(angle, step, min = 4, max = 90) {
  return Math.min(max, Math.max(min, Math.ceil(Math.abs(angle) / step)));
}

/** The chord frame: entrance and exit points of the arc in the centre frame. */
export function arcEnds(rho, angle, tilt) {
  const f = arcFrames(rho, angle, tilt, 1);
  return { entrance: f[0].p, exit: f[1].p, chord: v3.len(v3.sub(f[1].p, f[0].p)), sagitta: Math.abs(rho) * (1 - Math.cos(angle / 2)) };
}
