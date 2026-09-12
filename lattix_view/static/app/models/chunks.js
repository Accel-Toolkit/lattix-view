// Chunks and levels of detail, as pure functions over the payload's columns: consecutive elements are
// grouped so a chunk is at most `maxN` elements and `maxLen` metres of beam line, each chunk gets a
// bounding sphere from the element centres and outer sizes, and the level a chunk is drawn at follows
// its distance to the camera.  Nothing here touches three or the DOM, so it runs under node.

/** Chunk limits for a deck: at most about forty chunks by count and forty by length. */
export function chunkLimits(n, totalLength) {
  return { maxN: Math.max(48, Math.ceil(n / 40)), maxLen: Math.max(25, totalLength / 40) };
}

/**
 * Consecutive runs of elements: `[{start, end}]` with `end` exclusive, cut when the run would exceed
 * `maxN` elements or `maxLen` metres from the run's first entrance to the element's exit.
 */
export function partition(s, n, { maxN = 48, maxLen = 25 } = {}) {
  const out = [];
  let start = 0;
  for (let i = 1; i <= n; i++) {
    const cut = i === n || i - start >= maxN || s[2 * i + 1] - s[2 * start] > maxLen;
    if (cut) { out.push({ start, end: i }); start = i; }
  }
  return out;
}

/** The bounding sphere of elements [start, end): the centre of their box, the radius to the farthest corner. */
export function chunkBounds(el, start, end) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = start; i < end; i++) {
    const r = Math.max(el.size[3 * i], el.size[3 * i + 1], el.size[3 * i + 2], 0.5 * el.L[i], 0.01);
    for (const arr of [el.pc, el.pin, el.pout]) {
      for (let d = 0; d < 3; d++) {
        lo[d] = Math.min(lo[d], arr[3 * i + d] - r);
        hi[d] = Math.max(hi[d], arr[3 * i + d] + r);
      }
    }
  }
  const centre = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const radius = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
  return { centre, radius: Number.isFinite(radius) ? radius : 0 };
}

/**
 * The distances at which a chunk drops to level 1 (schematic parts) and level 2 (one box per element):
 * 12 m and 60 m, stretched for long machines and by the user's bias; `Infinity` when a scene is small
 * enough to stay at full detail everywhere.
 */
export function lodDistances(totalLength, triangles, { bias = 1, fullBudget = 400_000 } = {}) {
  if (triangles <= fullBudget) return [Infinity, Infinity];
  const k = Math.max(1, totalLength / 200) * bias;
  return [12 * k, 60 * k];
}

/** The level for a chunk whose sphere is `distance` from the camera (0 inside it). */
export function lodLevel(distance, [d1, d2]) {
  return distance >= d2 ? 2 : distance >= d1 ? 1 : 0;
}

/** Distance from a point to a sphere's surface, 0 inside. */
export function sphereDistance(p, centre, radius) {
  return Math.max(0, Math.hypot(p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]) - radius);
}
