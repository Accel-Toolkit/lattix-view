// The measurement maths under node: frames inside elements against the payload's exit frames, projection
// onto the orbit, snapping tiers, records and their formatting.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..", "..", "lattix_view", "static", "app");
const { buildOrbit, projectToOrbit, projectExact, frameAt, localCoords, raySegment, elementAtS } = await import(join(app, "math", "orbit.js"));
const { snap, framePoints, nearElements } = await import(join(app, "math", "snap.js"));
const { distance, elementGap, axisAngle, heading, describe, toTSV, fmtNum, fmtLen, fmtAng } = await import(join(app, "math", "measure.js"));
const { axesOf, madxAngles, rotate } = await import(join(app, "math", "vec.js"));

// a two-element payload fragment: a 2 m drift then a 90-degree bend of rho = 1 (the survey convention: positive
// angle turns toward -x), frames as lattix computes them (exit of the bend at (-rho, 0, 2 + rho))
const rho = 1, a = Math.PI / 2, L = rho * a;
const c45 = Math.cos(a / 2), s45 = Math.sin(a / 2);
const qy = t => [0, Math.sin(t / 2), 0, Math.cos(t / 2)];            // rotation about y by t
const el = {
  name: ["d", "b"], kind: [0, 5], sub: [0, 0], fam: [0, 0], i: [0, 1], parent: [-1, -1], flags: [0, 0],
  s: [0, 2, 2, 2 + L], L: [2, L], arc: [0, 0, a, 0],
  pin: [0, 0, 0, 0, 0, 2], pc: [0, 0, 1, rho * (c45 - 1), 0, 2 + rho * s45], pout: [0, 0, 2, -rho, 0, 2 + rho],
  pb: [0, 0, 1, rho * (c45 - 1), 0, 2 + rho * s45],
  qin: [0, 0, 0, 1, 0, 0, 0, 1], qc: [0, 0, 0, 1, ...qy(-a / 2)], qout: [0, 0, 0, 1, ...qy(-a)], qb: [0, 0, 0, 1, ...qy(-a / 2)],
  size: [0.03, 0.03, 1, 0.2, 0.15, rho * s45],
};
const n = 2;

test("frameAt reproduces the payload's exit and centre frames of a bend", () => {
  const out = frameAt(el, 1, 2 + L);
  assert.ok(Math.abs(out.p[0] + rho) < 1e-12 && Math.abs(out.p[2] - (2 + rho)) < 1e-12, `exit ${out.p}`);
  assert.ok(Math.abs(out.ax.z[0] + 1) < 1e-12 && Math.abs(out.ax.z[2]) < 1e-12, `exit tangent ${out.ax.z}`);
  const mid = frameAt(el, 1, 2 + L / 2);
  assert.ok(Math.abs(mid.p[0] - rho * (c45 - 1)) < 1e-12 && Math.abs(mid.p[2] - (2 + rho * s45)) < 1e-12);
  const qc = axesOf([el.qc[4], el.qc[5], el.qc[6], el.qc[7]]);
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(mid.ax.z[k] - qc.z[k]) < 1e-12, `centre tangent ${mid.ax.z} vs ${qc.z}`);
  const d = frameAt(el, 0, 1.5);
  assert.deepEqual(d.p, [0, 0, 1.5]);
});

test("projection onto the orbit and local coordinates", () => {
  const pts = [[0, 0, 0], [0, 0, 2]];
  for (let k = 1; k <= 8; k++) { const t = a * k / 8; pts.push([rho * (Math.cos(t) - 1), 0, 2 + rho * Math.sin(t)]); }
  const orbit = buildOrbit(pts);
  assert.ok(Math.abs(orbit.length - (2 + 2 * rho * 8 * Math.sin(a / 16))) < 1e-12);
  const r = projectToOrbit(orbit, [0.1, 0.2, 1.0]);
  assert.ok(Math.abs(r.s - 1.0) < 1e-12 && r.seg === 0);
  // a point beside the arc's midpoint projects onto the arc at s = 2 + L/2 after refinement
  const pm = [rho * (c45 - 1) + 0.05 * c45, 0.02, 2 + rho * s45 + 0.05 * s45];  // 5 cm outward along local x at the midpoint
  const ex = projectExact(orbit, el, n, pm);
  assert.equal(ex.i, 1);
  assert.ok(Math.abs(ex.s - (2 + L / 2)) < 1e-9, `s ${ex.s}`);
  const loc = localCoords(orbit, el, n, pm);
  assert.ok(Math.abs(loc.x - 0.05) < 1e-9 && Math.abs(loc.y - 0.02) < 1e-9, `local ${loc.x} ${loc.y}`);
  assert.equal(elementAtS(el, n, 2.0), 1);
  assert.equal(elementAtS(el, n, 0.5), 0);
  const rs = raySegment([1, 1, 0], [-1, 0, 0], [0, 0, 0], [0, 0, 2]);
  assert.ok(Math.abs(rs.dist - 1) < 1e-12 && rs.u === 0);
});

test("snapping prefers frame points, then the axis, then the surface, then the floor", () => {
  const project = p => [p[0] * 100 + 500, -p[2] * 100 + 500];        // a fake top-view projection: 100 px per metre
  const ray = { o: [0, 10, 1], d: [0, -1, 0] };
  const near = nearElements(el, n, 0, 2);
  assert.deepEqual(near, [0, 1]);
  const orbitSegs = i => [[[el.pin[3 * i], el.pin[3 * i + 1], el.pin[3 * i + 2]], [el.pout[3 * i], el.pout[3 * i + 1], el.pout[3 * i + 2]]]];
  const base = { project, ray, near, el, orbitSegs, floorY: -1.2 };
  const atExit = snap({ ...base, cursor: project([0, 0, 2]).map(v => v + 4), hit: { p: [0.2, 0, 1.9], i: 0 } });
  assert.equal(atExit.tier, "frame");
  assert.ok(["out", "in"].includes(atExit.kind));
  const onAxis = snap({ ...base, cursor: project([0, 0, 1.3]), ray: { o: [0.05, 10, 1.3], d: [0, -1, 0] }, hit: { p: [0.2, 0, 1.3], i: 0 } });
  assert.equal(onAxis.tier, "axis");
  assert.ok(Math.abs(onAxis.p[2] - 1.3) < 1e-9);
  const surface = snap({ ...base, cursor: [9999, 9999], hit: { p: [0.5, 0.5, 0.5], i: 0 }, near: [] });
  assert.equal(surface.tier, "surface");
  const floor = snap({ ...base, cursor: [9999, 9999], hit: null, near: [] });
  assert.equal(floor.tier, "floor");
  assert.ok(Math.abs(floor.p[1] + 1.2) < 1e-12);
  assert.equal(framePoints(el, 1).length, 3);
});

test("records and formatting", () => {
  const A = { p: [0, 0, 0], s: 0, ax: axesOf([0, 0, 0, 1]), i: 0, kind: "in" };
  const B = { p: [-rho, 0, 2 + rho], s: 2 + L, ax: null, i: 1, kind: "out" };
  const d = distance(A, B);
  assert.ok(Math.abs(d.chord - Math.hypot(rho, 2 + rho)) < 1e-12 && Math.abs(d.path - (2 + L)) < 1e-12);
  assert.ok(Math.abs(d.dx + rho) < 1e-12 && Math.abs(d.ds_local - (2 + rho)) < 1e-12);
  const g = elementGap(el, 1, 0);
  assert.equal(g.i, 0); assert.ok(Math.abs(g.free) < 1e-12 && g.between === 0);
  const ang = axisAngle(el, 0, 1);
  assert.ok(Math.abs(ang.alpha - a / 2) < 1e-12 && Math.abs(ang.dtheta + a / 2) < 1e-12);
  const h = heading(el, 1);
  assert.ok(Math.abs(h.theta + a / 2) < 1e-12 && Math.abs(h.phi) < 1e-12);
  assert.ok(describe(d, el.name).includes("chord") && describe(g, el.name).includes("d → b"));
  const tsv = toTSV([d, g, ang, h, { type: "probe", p: [1, 2, 3], i: -1, local: null }], el.name);
  assert.equal(tsv.split("\n").length, 7);
  assert.ok(tsv.includes("distance\td\tb"), tsv);
  assert.equal(fmtNum(0.123456789), "0.123457");
  assert.equal(fmtLen(0.0005), "500 µm");
  assert.equal(fmtLen(0.25), "250 mm");
  assert.ok(fmtAng(0.001).includes("mrad"));
  const q = [0, Math.sin(0.15), 0, Math.cos(0.15)];
  assert.ok(Math.abs(madxAngles(axesOf(q)).theta - 0.3) < 1e-12);
  const v = rotate(q, [0, 0, 1]);
  assert.ok(Math.abs(v[0] - Math.sin(0.3)) < 1e-12 && Math.abs(v[2] - Math.cos(0.3)) < 1e-12);
});
