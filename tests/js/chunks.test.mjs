// Chunks and levels of detail under node.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..", "..", "lattix_view", "static", "app");
const { chunkBounds, chunkLimits, lodDistances, lodLevel, partition, sphereDistance } = await import(join(app, "models", "chunks.js"));

function line(n, L) {                    // n elements of length L end to end along +z
  const s = [], pc = [], pin = [], pout = [], size = [], Ls = [];
  for (let i = 0; i < n; i++) {
    s.push(i * L, (i + 1) * L); Ls.push(L);
    pin.push(0, 0, i * L); pout.push(0, 0, (i + 1) * L); pc.push(0, 0, (i + 0.5) * L);
    size.push(0.1, 0.1, L / 2);
  }
  return { s, pc, pin, pout, size, L: Ls };
}

test("partition cuts by count and by length and covers every element once", () => {
  const el = line(100, 1.0);
  const byCount = partition(el.s, 100, { maxN: 48, maxLen: 1e9 });
  assert.deepEqual(byCount.map(c => [c.start, c.end]), [[0, 48], [48, 96], [96, 100]]);
  const byLength = partition(el.s, 100, { maxN: 1000, maxLen: 25 });
  assert.equal(byLength.length, 4);
  assert.ok(byLength.every(c => el.s[2 * (c.end - 1) + 1] - el.s[2 * c.start] <= 25));
  const all = byLength.flatMap(c => Array.from({ length: c.end - c.start }, (_, k) => c.start + k));
  assert.deepEqual(all, Array.from({ length: 100 }, (_, k) => k));
  assert.deepEqual(partition(el.s, 0), []);
  assert.deepEqual(partition(el.s, 1), [{ start: 0, end: 1 }]);
});

test("chunk limits keep the chunk count near forty for big and long decks", () => {
  assert.deepEqual(chunkLimits(100, 50), { maxN: 48, maxLen: 25 });
  assert.deepEqual(chunkLimits(4000, 2000), { maxN: 100, maxLen: 50 });
  const el = line(4000, 0.5);
  assert.ok(partition(el.s, 4000, chunkLimits(4000, 2000)).length <= 41);
});

test("chunk bounds enclose every element's centre and ends with its size", () => {
  const el = line(10, 2.0);
  const b = chunkBounds(el, 2, 5);
  assert.deepEqual(b.centre.map(v => +v.toFixed(9)), [0, 0, 7]);                  // elements 2..4 span z 4..10
  assert.ok(Math.abs(b.radius - Math.hypot(1.0, 1.0, 4.0)) < 1e-9);                 // half-size 1 m grows the box by 1 m each way
  assert.equal(chunkBounds(el, 3, 3).radius, 0);
});

test("levels follow the distance and the scene size; small scenes stay at full detail", () => {
  assert.deepEqual(lodDistances(100, 200_000), [Infinity, Infinity]);
  assert.deepEqual(lodDistances(100, 800_000), [12, 60]);
  assert.deepEqual(lodDistances(500, 800_000), [30, 150]);
  assert.deepEqual(lodDistances(500, 800_000, { bias: 2 }), [60, 300]);
  const d = lodDistances(100, 800_000);
  assert.equal(lodLevel(0, d), 0);
  assert.equal(lodLevel(11.9, d), 0);
  assert.equal(lodLevel(12, d), 1);
  assert.equal(lodLevel(59.9, d), 1);
  assert.equal(lodLevel(60, d), 2);
  assert.equal(lodLevel(1e6, [Infinity, Infinity]), 0);
  assert.equal(sphereDistance([0, 0, 10], [0, 0, 0], 3), 7);
  assert.equal(sphereDistance([0, 0, 1], [0, 0, 0], 3), 0);
});
