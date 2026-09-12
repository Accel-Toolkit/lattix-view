// The model library under node: every archetype builds for every kind and sub-kind at several sizes,
// stays inside the overhang rule, is finite and indexed within range, and keeps its triangle budget.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..", "..", "lattix_view", "static", "app");
const { archetypeFor, build, buildMerged, optionsFor, ARCHETYPES } = await import(join(app, "models", "index.js"));
const { arcFrames, arcEnds } = await import(join(app, "models", "frames.js"));
const { box, lathe, torus, bounds } = await import(join(app, "models", "geom.js"));

const KINDS = ["Drift", "Quadrupole", "Sextupole", "Octupole", "Multipole", "Bend", "Solenoid", "RFCavity", "FieldMap",
               "NCells", "RFQCell", "Kicker", "Collimator", "Marker", "Instrument", "Foil", "Taylor", "Patch",
               "ReferenceChange", "Freq", "Directive", "Superposition"];
const SUBS = { Bend: ["sector", "rect"], RFCavity: ["gap", "sw", "tw"], FieldMap: ["rf", "solenoid", "quad", "none"],
               Kicker: ["h", "v", "hv", "electric_h"], Collimator: ["rect", "ellipse", "unknown"], Multipole: ["n1", "n3"],
               NCells: ["mode0"], Quadrupole: ["", "skew"], Taylor: ["", "rf_focusing"] };
const FAMS = ["bpm", "bpm_h", "bpm_v", "phase", "profile", "wire", "screen", "laser", "emittance", "cup", "current", "current_gap",
              "loss", "valve", "chopper", "corrector_h", "corrector_v", "corrector", "collimator", "absorber", "pump", "generic"];
const BUDGET = 9000;         // triangles per element at full detail (24 segments)

function spec(kind, sub = "", fam = "", { L = 0.3, a = 0.03, angle = 0, tilt = 0, lam = 0.85, beta = 0.6, thin = false } = {}) {
  const Lr = thin ? 0 : L;
  const size = sizeFor(kind, sub, fam, Lr, a, angle, lam, beta);
  return { i: 0, kind, sub, fam, L: Lr, size, bore: [a, a], apshape: 1, arc: [angle, tilt], clear: [0.5, 0.5], lam, beta,
           flags: kind === "Directive" || sub === "rf_focusing" ? 64 : 0, strength: 0.5,
           params: kind === "Bend" ? { angle, hgap: a, rect: sub === "rect", chord: angle ? 2 * (Lr / angle) * Math.sin(angle / 2) : Lr }
                 : kind === "Kicker" ? { hkick: /h/.test(sub) ? 1e-3 : 0, vkick: /v/.test(sub) ? 1e-3 : 0, electric: sub.startsWith("electric") }
                 : kind === "NCells" ? { mode: 0, n_cells: 6, beta_g: beta } : kind === "RFQCell" ? { r0: a, modulation: 1.5 }
                 : kind === "RFCavity" ? { n_cell: 5, tw: sub === "tw" } : kind === "Solenoid" ? { B: 2.0 } : {} };
}

// the server's sizing, mirrored just enough for the tests (the page uses the payload's numbers)
function sizeFor(kind, sub, fam, L, a, angle, lam, beta) {
  const hz = (L > 0 ? L : 0.05) / 2;
  if (kind === "Quadrupole" || (kind === "FieldMap" && sub === "quad")) return [Math.max(4.5 * a, 0.12), Math.max(4.5 * a, 0.12), hz];
  if (kind === "Sextupole" || kind === "Octupole") return [Math.max(4 * a, 0.1), Math.max(4 * a, 0.1), hz];
  if (kind === "Bend") { const g = 2 * a; const wp = Math.max(4 * a + 2 * g, 0.08); const hp = Math.max(1.2 * g, 0.05), wc = Math.max(g, 0.04), t = Math.max(1.5 * g, 0.05);
    return [(wp + 2 * wc + 2 * t) / 2, (g + 2 * hp + 2 * t) / 2, angle ? (L / angle) * Math.sin(angle / 2) : L / 2]; }
  if (kind === "Solenoid" || (kind === "FieldMap" && sub === "solenoid")) return [Math.max(3 * a, 0.08), Math.max(3 * a, 0.08), hz + 0.02];
  if (["RFCavity", "FieldMap", "NCells", "Superposition"].includes(kind)) { const R = Math.min(Math.max(0.38 * lam, 0.05), 1) + 0.03; return L > 0 ? [R, R, hz] : [1.8 * a, 1.8 * a, 0.01]; }
  if (kind === "RFQCell") return [0.2 * lam, 0.2 * lam, hz];
  if (kind === "Kicker" || ["corrector_h", "corrector_v", "chopper"].includes(fam)) return [Math.max(3 * a, 0.08), Math.max(3 * a, 0.08), hz];
  if (kind === "Collimator" || ["collimator", "absorber"].includes(fam)) return [Math.max(3 * a, 0.08), Math.max(3 * a, 0.08), Math.max(hz, 0.01)];
  if (kind === "Foil") return [2 * a + 0.01, 2 * a + 0.01, 0.0025];
  if (kind === "Marker") return [a + 0.01, a + 0.01, 0.001];
  if (kind === "Instrument") return ["profile", "wire", "screen", "laser", "emittance", "cup"].includes(fam) ? [a + 0.02, 3 * a + 0.06, Math.max(hz, 0.05)] : [a + 0.03, a + 0.08, Math.max(hz, 0.03)];
  if (["Patch", "ReferenceChange", "Freq", "Directive"].includes(kind)) return [0.05, 0.05, 0.001];
  return [2 * a, 2 * a, hz];
}

function check(s, o, label) {
  const r = buildMerged(s, o);
  const m = r.mesh;
  assert.ok(m.positions.length % 3 === 0 && m.normals.length === m.positions.length, `${label}: arrays`);
  const nv = m.positions.length / 3;
  for (const ix of m.indices) assert.ok(ix >= 0 && ix < nv && Number.isInteger(ix), `${label}: index ${ix} of ${nv}`);
  for (const v of m.positions) assert.ok(Number.isFinite(v), `${label}: non-finite position`);
  for (let k = 0; k < m.normals.length; k += 3) {
    const l = Math.hypot(m.normals[k], m.normals[k + 1], m.normals[k + 2]);
    assert.ok(Math.abs(l - 1) < 1e-3, `${label}: normal length ${l}`);
  }
  assert.ok(r.triangles <= BUDGET, `${label}: ${r.triangles} triangles`);
  return r;
}

test("every kind, sub-kind and family builds within budget and inside the overhang rule", () => {
  const o = optionsFor(100);
  let built = 0;
  for (const kind of KINDS) {
    const subs = SUBS[kind] || [""];
    const fams = kind === "Instrument" ? FAMS : [""];
    for (const sub of subs) for (const fam of fams) for (const thin of [false, true]) {
      if (thin && ["Drift", "Bend", "Solenoid", "NCells", "RFQCell", "FieldMap", "Superposition"].includes(kind)) continue;
      const s = spec(kind, sub, fam, { thin, angle: kind === "Bend" ? 0.3 : 0 });
      const arch = archetypeFor(s);
      if (!arch) { assert.deepEqual(build(s, o), [], `${kind} is hidden`); continue; }
      assert.ok(ARCHETYPES.includes(arch[0]), `${kind}/${sub}/${fam} -> ${arch[0]}`);
      const r = check(s, o, `${kind}/${sub}/${fam}${thin ? " thin" : ""}`);
      assert.ok(r.parts.length > 0, `${kind}/${sub}/${fam}: no parts`);
      // the overhang rule: nothing further than 0.45 of the free gap beyond the element's own length
      const limit = s.L / 2 + 0.45 * 0.5 + 1e-6;
      assert.ok(r.bounds.min[2] >= -limit - 0.01 && r.bounds.max[2] <= limit + 0.01, `${kind}/${sub}/${fam}: z ${r.bounds.min[2]}..${r.bounds.max[2]}`);
      built++;
    }
  }
  assert.ok(built > 40, `only ${built} models built`);
});

test("a sector bend sweeps its yoke along the arc and its chord frame is the centre", () => {
  const rho = 2.0, angle = 0.5, L = rho * angle;
  const s = spec("Bend", "sector", "", { L, angle });
  const r = check(s, optionsFor(10), "sector bend");
  const ends = arcEnds(rho, angle, 0);
  // the entrance and exit of the arc lie symmetric about the origin, behind and ahead in z; a positive angle turns
  // toward -x, so the circle's centre is at -rho and both ends sit at x < 0 (the midpoint is the outermost point)
  assert.ok(Math.abs(ends.entrance[2] + ends.exit[2]) < 1e-12 && ends.entrance[2] < 0);
  assert.ok(ends.entrance[0] < 0 && Math.abs(ends.entrance[0] - ends.exit[0]) < 1e-12);
  assert.ok(Math.abs(ends.chord - 2 * rho * Math.sin(angle / 2)) < 1e-12);
  // the yoke's extent along x reaches beyond the sagitta on the outer side
  assert.ok(r.bounds.max[0] > ends.sagitta);
  const frames = arcFrames(rho, angle, 0, 10);
  assert.equal(frames.length, 11);
  assert.ok(Math.abs(frames[5].p[0]) < 1e-12 && Math.abs(frames[5].p[2]) < 1e-12);
  for (const f of frames) {
    assert.ok(Math.abs(Math.hypot(...f.z) - 1) < 1e-12 && Math.abs(f.x[0] * f.z[0] + f.x[1] * f.z[1] + f.x[2] * f.z[2]) < 1e-12);
  }
  // a vertical bend (tilt pi/2) curves in y: a positive angle bends toward -y, as lattix's survey does
  const v = arcFrames(rho, angle, Math.PI / 2, 4);
  assert.ok(Math.abs(v[0].p[0]) < 1e-12 && v[0].p[1] < 0);
  const rect = check(spec("Bend", "rect", "", { L, angle }), optionsFor(10), "rect bend");
  assert.ok(rect.triangles > 0);
});

test("detail options scale with the deck and schematic style collapses the slots", () => {
  const o = optionsFor(3000);
  assert.equal(o.segs, 12);
  const s = spec("Quadrupole");
  const real = build(s, optionsFor(10));
  const schematic = build(s, optionsFor(10, { style: "schematic" }));
  assert.ok(real.some(p => p.slot === "coil") && !schematic.some(p => p.slot === "coil"));
  assert.ok(schematic.every(p => p.slot === "kind" || p.slot === "pipe"));
  const big = buildMerged(s, optionsFor(10)).triangles, small = buildMerged(s, optionsFor(3000)).triangles;
  assert.ok(small < big, `${small} < ${big}`);
});

test("primitives are well formed", () => {
  const b = box(1, 2, 3);
  assert.equal(b.indices.length / 3, 12);
  const bb = bounds(b);
  assert.deepEqual(bb.min, [-1, -2, -3]);
  assert.deepEqual(bb.max, [1, 2, 3]);
  const cyl = lathe([[0, 0], [1, 0], [1, 2], [0, 2]], 8);
  assert.equal(cyl.indices.length / 3, 4 * 8 * 2);
  const t = torus(1, 0.1, 12, 6);
  assert.ok(t.indices.length / 3 === 12 * 6 * 2);
});

test("a marker that names a device is drawn as that device, a bare marker as a ring", () => {
  assert.deepEqual(archetypeFor(spec("Marker")), ["ring"]);
  assert.deepEqual(archetypeFor(spec("Marker", "", "bpm")), ["bpm"]);
  assert.deepEqual(archetypeFor(spec("Marker", "", "pump")), ["pump"]);
  assert.deepEqual(archetypeFor(spec("Marker", "", "corrector")), ["corrector"]);
  const pump = buildMerged({ ...spec("Marker", "", "pump", { thin: true }), size: [0.06, 0.21, 0.02] }, optionsFor(10));
  assert.ok(pump.triangles > 50 && pump.bounds.min[1] < -0.15 && pump.bounds.max[1] < 0.05, "the pump hangs under the pipe");
  const corr = buildMerged({ ...spec("Marker", "", "corrector", { thin: true }), size: [0.09, 0.09, 0.05] }, optionsFor(10));
  assert.ok(corr.triangles > 100);
});
