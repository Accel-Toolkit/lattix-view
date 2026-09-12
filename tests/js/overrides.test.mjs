// The override fit maths under node.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..", "..", "lattix_view", "static", "app");
const { fitTransform, orientationBasis } = await import(join(app, "models", "overrides.js"));

const unit = { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };
const spec = { L: 0.4, size: [0.12, 0.12, 0.2], bore: [0.03, 0.03] };

test("fit by length scales a unit cube to the element length, centred", () => {
  const xf = fitTransform(unit, null, { units: "m", up: "+y", forward: "+z", anchor: "centre", fit: "length", scale: 1, rotate: [0, 0, 0], offset: [0, 0, 0] }, spec);
  assert.deepEqual(xf.scale.map(v => +v.toFixed(9)), [0.4, 0.4, 0.4]);
  assert.deepEqual(xf.position, [0, 0, 0]);
  assert.deepEqual(xf.basis, [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
});

test("units, anchor, offset, rotate and declared extras", () => {
  const mm = fitTransform({ min: [0, 0, 0], max: [100, 100, 400] }, null, { units: "mm", anchor: "entrance", fit: "none", scale: 1, rotate: [0, 0, 90], offset: [0, 0, 0.05] }, spec);
  assert.deepEqual(mm.scale.map(v => +v.toFixed(9)), [0.001, 0.001, 0.001]);
  assert.deepEqual(mm.position.map(v => +v.toFixed(9)), [0, 0, -0.15]);
  assert.ok(Math.abs(mm.rotate[2] - Math.PI / 2) < 1e-12);
  const declared = fitTransform(unit, { length_m: 2.0, anchor: "exit" }, { units: "m", anchor: "centre", fit: "length", scale: 1, rotate: [0, 0, 0], offset: [0, 0, 0] }, spec);
  assert.deepEqual(declared.scale.map(v => +v.toFixed(9)), [0.2, 0.2, 0.2]);      // 2 m declared -> 0.4 m
  assert.deepEqual(declared.position, [0, 0, 0.2]);                                   // the file's anchor wins
  const bore = fitTransform(unit, null, { units: "m", anchor: "centre", fit: "bore", scale: 1, rotate: [0, 0, 0], offset: [0, 0, 0] }, spec);
  assert.deepEqual(bore.scale.map(v => +v.toFixed(9)), [0.06, 0.06, 0.06]);         // half-extent 0.5 -> bore 0.03
  const box = fitTransform(unit, null, { units: "m", anchor: "centre", fit: "box", scale: 1, rotate: [0, 0, 0], offset: [0, 0, 0] }, spec);
  assert.deepEqual(box.scale.map(v => +v.toFixed(9)), [0.24, 0.24, 0.4]);
});

test("a z-up file is re-oriented so its forward axis lies along the beam", () => {
  const b = orientationBasis("+z", "+y");                      // file: up = z, forward = y  (right = up x forward = z x y = -x)
  const apply = p => [b[0][0] * p[0] + b[0][1] * p[1] + b[0][2] * p[2], b[1][0] * p[0] + b[1][1] * p[1] + b[1][2] * p[2], b[2][0] * p[0] + b[2][1] * p[1] + b[2][2] * p[2]];
  assert.deepEqual(apply([0, 0, 1]), [0, 1, 0]);               // file up -> body y
  assert.deepEqual(apply([0, 1, 0]), [0, 0, 1]);               // file forward -> body z
  assert.deepEqual(apply([-1, 0, 0]), [1, 0, 0]);              // file right -> body x
});
