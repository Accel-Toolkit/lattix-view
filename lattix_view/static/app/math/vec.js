// Small vector and quaternion helpers on plain arrays: no three.js, so the measurement maths runs under node.
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = a => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => len(sub(a, b));
export function norm(a) { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

/** Rotate v by the quaternion q = [x, y, z, w]. */
export function rotate(q, v) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}

/** The three axes (columns of the orientation) of a quaternion. */
export function axesOf(q) {
  return { x: rotate(q, [1, 0, 0]), y: rotate(q, [0, 1, 0]), z: rotate(q, [0, 0, 1]) };
}

/** MAD-X survey angles (theta, phi, psi) of the orientation with axes ex, ey, es (columns of W). */
export function madxAngles(ax) {
  const W = [[ax.x[0], ax.y[0], ax.z[0]], [ax.x[1], ax.y[1], ax.z[1]], [ax.x[2], ax.y[2], ax.z[2]]];
  const theta = Math.atan2(W[0][2], W[2][2]);
  const phi = Math.asin(Math.max(-1, Math.min(1, W[1][2])));
  const psi = Math.atan2(W[1][0], W[1][1]);
  return { theta, phi, psi };
}

/** Coordinates of a global point in the frame (origin p, axes ax). */
export function toLocal(p, ax, point) {
  const d = sub(point, p);
  return [dot(d, ax.x), dot(d, ax.y), dot(d, ax.z)];
}

export const wrapPi = a => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
