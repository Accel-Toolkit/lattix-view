// The procedural model library: one builder per archetype, each returning parts {slot, mesh} in the
// element's centre frame from a spec {kind, sub, fam, L, size, bore, apshape, arc, params, clear, lam,
// beta, flags}.  Dimensions follow the server's outer half-extents (size) and the sizing rules in
// docs/models.md; a value marked "guess" is a typical-hardware default.
import { MeshBuilder, Transform, box, lathe, profile, racetrack, sweep, sweepCircle, straightFrames, torus, v3 } from "./geom.js";
import { arcFrames, arcSegments } from "./frames.js";

const TAU = 2 * Math.PI;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// -- shared pieces ----------------------------------------------------------------------------------
/** The bore tube through an element: elliptical or rectangular profile from the bore, straight or on the arc. */
export function boreTube(spec, o, { z0 = -spec.L / 2, z1 = spec.L / 2, wall = null } = {}) {
  const [hx, hy] = spec.bore;
  const t = wall == null ? Math.max(0.002, 0.05 * Math.max(hx, hy)) : wall;
  const shape = spec.apshape === 2 ? "rect" : "ellipse";
  const prof = profile(shape, hx + t, hy + t, o.segs);
  if (spec.arc && spec.arc[0] && spec.kind === "Bend") {
    const rho = spec.L / spec.arc[0];
    return sweep(prof, arcFrames(rho, spec.arc[0], spec.arc[1], arcSegments(spec.arc[0], o.arcStep)), { caps: true });
  }
  return sweep(prof, straightFrames(z0, z1), { caps: true });
}

function flange(r, t, z) {
  return lathe([[r * 0.7, z - t / 2], [r, z - t / 2], [r, z + t / 2], [r * 0.7, z + t / 2]], 16, { closed: true });
}

/** A coil as a racetrack loop of tube radius `rt` in the plane (u, v) at centre c. */
function coil(c, u, v, a, b, rt, o) {
  return sweepCircle(racetrack(c, u, v, a, b, Math.min(a, b) * 0.25, o.lod === 0 ? 4 : 2), rt, 8, { closed: true, tube: o.lod === 0 ? 8 : 6 });
}

// -- pipe --------------------------------------------------------------------------------------------
export function buildPipe(spec, o) {
  const parts = [{ slot: "pipe", mesh: boreTube(spec, o) }];
  if (o.lod === 0 && spec.L > 0.25 && o.flanges) {
    const r = Math.max(...spec.bore) * 1.5 + 0.01;
    parts.push({ slot: "yoke", mesh: flange(r, 0.02, -spec.L / 2 + 0.012) }, { slot: "yoke", mesh: flange(r, 0.02, spec.L / 2 - 0.012) });
  }
  return parts;
}

// -- multipole magnets (quad n=2 pairs, sext 3, oct 4) --------------------------------------------------
export function buildMultipoleMagnet(spec, o, pairs) {
  const a = Math.max(...spec.bore);
  const R = spec.size[0];                                  // yoke half-width from the server's sizing
  const hz = spec.size[2];
  const parts = [];
  if (spec.L <= 0) {                                       // a thin multipole: a disc with pole marks
    const disc = lathe([[0, -hz], [R, -hz], [R, hz], [0, hz]], o.segs, { closed: true });
    parts.push({ slot: "kind", mesh: disc });
    for (let k = 0; k < 2 * pairs; k++) {
      const ang = TAU * k / (2 * pairs) + Math.PI / (2 * pairs);
      parts.push({ slot: "yoke", mesh: box(0.15 * R, 0.08 * R, hz * 1.4, [0.75 * R * Math.cos(ang), 0.75 * R * Math.sin(ang), 0]) });
    }
    return parts;
  }
  const rTip = 1.15 * a;
  const rYi = 0.72 * R;
  const Ly = Math.max(spec.L - a, 0.6 * spec.L);
  const nSides = 2 * pairs;                                  // octagon for a quad, 12-gon for a sextupole
  // the yoke: a polygonal annular prism, one flat per pole pair
  const yoke = lathe([[rYi, -Ly / 2], [R, -Ly / 2], [R, Ly / 2], [rYi, Ly / 2]], nSides, { closed: true, phase: Math.PI / nSides });
  parts.push({ slot: "yoke", mesh: yoke });
  // poles: wedges from the tip to the yoke, one per pole, the first pole at 45 degrees for a quad (MAD convention:
  // a normal quadrupole's poles sit between the axes)
  const tipHalf = 0.6 * a, rootHalf = 1.0 * a;
  for (let k = 0; k < nSides; k++) {
    const ang = TAU * k / nSides + Math.PI / nSides;
    const m = new MeshBuilder();
    const c = Math.cos(ang), s = Math.sin(ang);
    const u = [c, s, 0], w = [-s, c, 0];
    const corners = (r, half) => [v3.add(v3.scale(u, r), v3.scale(w, -half)), v3.add(v3.scale(u, r), v3.scale(w, half))];
    const [t0, t1] = corners(rTip, tipHalf), [r0, r1] = corners(rYi + 0.01, rootHalf);
    const zs = [-Ly / 2, Ly / 2];
    const P = [t0, t1, r1, r0].map(p => [p, [p[0], p[1], 0]]);
    // side quads of the wedge prism
    const ids = [];
    for (const z of zs) ids.push(P.map(([p]) => m.vertex([p[0], p[1], z], u)));
    for (let e = 0; e < 4; e++) {
      const a0 = ids[0][e], a1 = ids[0][(e + 1) % 4], b1 = ids[1][(e + 1) % 4], b0 = ids[1][e];
      const edge = v3.sub([P[(e + 1) % 4][0][0], P[(e + 1) % 4][0][1], 0], [P[e][0][0], P[e][0][1], 0]);
      const nrm = v3.norm(v3.cross(edge, [0, 0, 1]));
      for (const id of [a0, a1, b1, b0]) { m.normals[3 * id] = nrm[0]; m.normals[3 * id + 1] = nrm[1]; m.normals[3 * id + 2] = nrm[2]; }
      m.quad(a0, a1, b1, b0);
    }
    const capA = P.map(([p]) => m.vertex([p[0], p[1], -Ly / 2], [0, 0, -1])), capB = P.map(([p]) => m.vertex([p[0], p[1], Ly / 2], [0, 0, 1]));
    m.quad(capA[3], capA[2], capA[1], capA[0]); m.quad(capB[0], capB[1], capB[2], capB[3]);
    parts.push({ slot: "yoke", mesh: m.toMesh() });
    // the coil around the pole root
    if (o.lod === 0) {
      const rc = 0.5 * (rTip + rYi), ct = 0.18 * R;
      const over = Math.min(ct, 0.45 * Math.min(spec.clear[0], spec.clear[1]));
      const centre = v3.scale(u, rc);
      parts.push({ slot: "coil", mesh: coil(centre, w, [0, 0, 1], 2.4 * rootHalf, Ly + 2 * over, ct * 0.5, o) });
    }
  }
  parts.push({ slot: "pipe", mesh: boreTube(spec, o) });
  return parts;
}

// -- dipole --------------------------------------------------------------------------------------------
export function buildDipole(spec, o) {
  const p = spec.params || {};
  const angle = spec.arc[0] || 0, tilt = spec.arc[1] || 0;
  const rho = angle ? spec.L / angle : 0;
  const [hxb, hyb] = spec.bore;
  const hgap = p.hgap || 0;
  const g = hgap > 0 ? 2 * hgap : 2 * hyb;
  const wp = Math.max(2 * hxb + 2 * g, 0.08);
  const hp = Math.max(1.2 * g, 0.05), wc = Math.max(g, 0.04), t = Math.max(1.5 * g, 0.05);
  const Wy = wp + 2 * wc + 2 * t, Hy = g + 2 * hp + 2 * t;
  const parts = [];
  // the yoke cross-section (x-y plane of the bend frame, poles along +/-y): an H frame as four boxes
  const section = [
    // return legs (left and right), full height
    { c: [Wy / 2 - t / 2, 0], hx: t / 2, hy: Hy / 2 }, { c: [-(Wy / 2 - t / 2), 0], hx: t / 2, hy: Hy / 2 },
    // top and bottom yoke bars over the coil windows
    { c: [0, Hy / 2 - t / 2], hx: Wy / 2 - t, hy: t / 2 }, { c: [0, -(Hy / 2 - t / 2)], hx: Wy / 2 - t, hy: t / 2 },
    // the poles down to the gap
    { c: [0, g / 2 + hp / 2], hx: wp / 2, hy: hp / 2 }, { c: [0, -(g / 2 + hp / 2)], hx: wp / 2, hy: hp / 2 },
  ];
  const straight = !angle || p.rect;
  const R = new Transform([Math.cos(tilt), Math.sin(tilt), 0, -Math.sin(tilt), Math.cos(tilt), 0, 0, 0, 1]);
  if (straight) {
    const hz = spec.size[2] * 0.96;
    for (const s of section) parts.push({ slot: "yoke", mesh: new MeshBuilder().append(box(s.hx, s.hy, hz, [s.c[0], s.c[1], 0]), R).toMesh() });
  } else {
    // sweep each box of the section along the arc
    const frames = arcFrames(rho, angle, tilt, arcSegments(angle, o.arcStep));
    for (const s of section) {
      const prof = [[s.c[0] - s.hx, s.c[1] - s.hy], [s.c[0] + s.hx, s.c[1] - s.hy], [s.c[0] + s.hx, s.c[1] + s.hy], [s.c[0] - s.hx, s.c[1] + s.hy]];
      parts.push({ slot: "yoke", mesh: sweep(prof, frames, { caps: true }) });
    }
  }
  // two racetrack coils around the poles, in planes parallel to the mid-plane
  if (o.lod === 0) {
    const Lc = straight ? 2 * spec.size[2] * 0.96 : Math.abs(rho * angle);
    const over = Math.min(0.5 * hp, 0.45 * Math.min(spec.clear[0], spec.clear[1]));
    for (const sign of [1, -1]) {
      const c = R.apply([0, sign * (g / 2 + hp / 2), 0]);
      const u = R.applyNormal([1, 0, 0]);
      parts.push({ slot: "coil", mesh: coil(c, u, [0, 0, 1], wp + wc, Lc + 2 * over, 0.45 * Math.min(wc, hp) * 0.5, o) });
    }
  }
  parts.push({ slot: "pipe", mesh: boreTube(spec, o) });
  return parts;
}

// -- solenoid ------------------------------------------------------------------------------------------
export function buildSolenoid(spec, o) {
  const a = Math.max(...spec.bore);
  const R = spec.size[0];
  const B = Math.abs((spec.params && (spec.params.B || spec.params.B_eff)) || 0);
  const Leff = spec.params && spec.params.L_eff ? Math.min(spec.params.L_eff, spec.L) : spec.L;
  const hz = Leff / 2;
  const rci = 1.3 * a + 0.005, rco = Math.max(rci + 0.4 * a + 0.02, 1.8 * a);
  const parts = [];
  if (B >= 3.0) {                                         // superconducting: a cryostat hides the coil
    parts.push({ slot: "cavity", mesh: lathe([[a + 0.005, -hz - 0.02], [R, -hz - 0.02], [R, hz + 0.02], [a + 0.005, hz + 0.02]], o.segs) });
  } else {
    parts.push({ slot: "coil", mesh: lathe([[rci, -hz], [rco, -hz], [rco, hz], [rci, hz]], o.segs) });
    const tp = 0.02;
    parts.push({ slot: "yoke", mesh: lathe([[rco, -hz - tp], [R, -hz - tp], [R, hz + tp], [rco, hz + tp]], o.segs) });
    parts.push({ slot: "yoke", mesh: lathe([[a + 0.004, -hz - tp], [R, -hz - tp], [R, -hz], [a + 0.004, -hz]], o.segs) });
    parts.push({ slot: "yoke", mesh: lathe([[a + 0.004, hz], [R, hz], [R, hz + tp], [a + 0.004, hz + tp]], o.segs) });
  }
  parts.push({ slot: "pipe", mesh: boreTube(spec, o) });
  return parts;
}

// -- cavities ------------------------------------------------------------------------------------------
function ellipticalCells(spec, o) {
  const p = spec.params || {};
  const lam = spec.lam, beta = clamp(spec.beta || 1, 0.05, 1);
  const pitch = beta * lam / 2;
  const Lact = p.L_active && p.L_active > 0 ? Math.min(p.L_active, spec.L) : spec.L;
  const nCell = p.n_cell || clamp(Math.round(Lact / pitch), 1, 9);
  const cellL = Lact / nCell;
  const Req = clamp(0.38 * lam, 0.05, 1.0);
  const Riris = spec.bore[0] > 0 ? spec.bore[0] : 0.15 * lam;
  const pts = [];
  const z0 = -Lact / 2;
  pts.push([Riris, -spec.L / 2]);
  for (let c = 0; c < nCell; c++) {
    const za = z0 + c * cellL, zb = za + cellL;
    const zm = (za + zb) / 2;
    const irisL = 0.08 * cellL;
    pts.push([Riris, za + irisL / 2]);
    const steps = o.lod === 0 ? 6 : 3;
    for (let k = 1; k <= steps; k++) {           // elliptical rise to the equator and back
      const t = k / (steps + 1);
      const z = za + irisL / 2 + (zm - za - irisL / 2) * t;
      pts.push([Riris + (Req - Riris) * Math.sin(t * Math.PI / 2), z]);
    }
    pts.push([Req, zm]);
    for (let k = steps; k >= 1; k--) {
      const t = k / (steps + 1);
      const z = zb - irisL / 2 - (zb - irisL / 2 - zm) * t;
      pts.push([Riris + (Req - Riris) * Math.sin(t * Math.PI / 2), z]);
    }
    pts.push([Riris, zb - irisL / 2]);
  }
  pts.push([Riris, spec.L / 2]);
  return { pts, Req, nCell };
}

export function buildCavity(spec, o) {
  const parts = [];
  if (spec.L <= 0) {                                        // a thin gap: a ring and two drift-tube nose stubs
    const a = Math.max(...spec.bore);
    parts.push({ slot: "cavity", mesh: torus(1.5 * a, 0.3 * a, o.segs, 8) });
    const stub = Math.min(0.03, 0.4 * Math.min(spec.clear[0], spec.clear[1]));
    if (stub > 0.004) {
      parts.push({ slot: "cavity", mesh: lathe([[a, -stub], [1.6 * a, -stub], [1.6 * a, -0.002], [a, -0.002]], o.segs) });
      parts.push({ slot: "cavity", mesh: lathe([[a, 0.002], [1.6 * a, 0.002], [1.6 * a, stub], [a, stub]], o.segs) });
    }
    return parts;
  }
  if (!spec.lam) return buildAbstractBox(spec, o);
  const lam = spec.lam;
  if (spec.sub === "tw") {                                   // disc-loaded travelling-wave structure
    const R = clamp(0.40 * lam, 0.05, 1.0);
    const pitch = clamp((spec.beta || 1) * lam / 3, spec.L / 60, spec.L);
    const pts = [[spec.bore[0] + 0.004, -spec.L / 2], [R, -spec.L / 2]];
    let z = -spec.L / 2;
    const depth = 0.03 * lam;
    while (z + pitch <= spec.L / 2 + 1e-9) {
      pts.push([R, z + pitch * 0.35], [R - depth, z + pitch * 0.4], [R - depth, z + pitch * 0.6], [R, z + pitch * 0.65]);
      z += pitch;
    }
    pts.push([R, spec.L / 2], [spec.bore[0] + 0.004, spec.L / 2]);
    parts.push({ slot: "cavity", mesh: lathe(pts, o.segs) });
    const cube = 0.12 * lam;
    parts.push({ slot: "cavity", mesh: box(cube / 2, cube / 2, cube / 2, [0, R + cube / 2 - 0.01, -spec.L / 2 + cube]) });
    parts.push({ slot: "cavity", mesh: box(cube / 2, cube / 2, cube / 2, [0, R + cube / 2 - 0.01, spec.L / 2 - cube]) });
  } else if ((spec.beta || 1) < 0.5) {                        // a low-beta tank: spoke or half-wave resonator
    const Rt = clamp(0.25 * lam, 0.05, 1.0);
    const a = spec.bore[0];
    if (spec.L >= 0.35 * lam) {                              // spoke: a cylinder along the beam with a transverse spoke
      parts.push({ slot: "cavity", mesh: lathe([[a + 0.004, -spec.L / 2], [Rt, -spec.L / 2], [Rt, spec.L / 2], [a + 0.004, spec.L / 2]], o.segs) });
      const rs = 0.05 * lam;
      parts.push({ slot: "cavity", mesh: new MeshBuilder().append(lathe([[0, -Rt], [rs, -Rt], [rs, Rt], [0, Rt]], 12), Transform.rotateX(Math.PI / 2)).toMesh() });
    } else {                                                 // HWR: a vertical cylinder crossing the beam
      const h = 0.5 * lam, r = Math.max(0.12 * lam, 2 * a);
      parts.push({ slot: "cavity", mesh: new MeshBuilder().append(lathe([[0, -h / 2], [r, -h / 2], [r, h / 2], [0, h / 2]], o.segs), Transform.rotateX(Math.PI / 2)).toMesh() });
    }
  } else {                                                   // elliptical multi-cell
    const { pts, Req } = ellipticalCells(spec, o);
    parts.push({ slot: "cavity", mesh: lathe(pts, o.segs, { closed: false }) });
    if (o.lod === 0 && o.vessels) {
      const rv = Req + 0.03;
      parts.push({ slot: "glass", mesh: lathe([[Req * 0.6, -spec.L / 2 + 0.02], [rv, -spec.L / 2 + 0.02], [rv, spec.L / 2 - 0.02], [Req * 0.6, spec.L / 2 - 0.02]], o.segs) });
    }
  }
  parts.push({ slot: "pipe", mesh: boreTube(spec, o) });
  return parts;
}

export function buildDtlTank(spec, o) {
  const p = spec.params || {};
  const lam = spec.lam;
  if (!lam) return buildAbstractBox(spec, o);
  const a = spec.bore[0];
  const Rt = clamp(0.30 * lam, 0.05, 1.0);
  const parts = [{ slot: "cavity", mesh: lathe([[a + 0.004, -spec.L / 2], [Rt, -spec.L / 2], [Rt, spec.L / 2], [a + 0.004, spec.L / 2]], o.segs) }];
  const n = clamp(p.n_cells || Math.round(spec.L / ((spec.beta || 0.2) * lam)), 1, 60);
  const cellL = spec.L / n;
  const rdt = clamp(4 * a, 0.03, 0.6 * Rt);
  for (let c = 0; c < n; c++) {
    const zc = -spec.L / 2 + (c + 0.5) * cellL;
    const half = 0.75 * cellL / 2;
    parts.push({ slot: "yoke", mesh: lathe([[a, zc - half], [rdt, zc - half], [rdt, zc + half], [a, zc + half]], o.lod === 0 ? 12 : 8) });
    if (o.lod === 0) parts.push({ slot: "yoke", mesh: box(0.012, (Rt - rdt) / 2, 0.012, [0, rdt + (Rt - rdt) / 2, zc]) });
  }
  return parts;
}

export function buildRfqCell(spec, o) {
  const p = spec.params || {};
  const r0 = p.r0 ? Math.max(1e-3, Number(p.r0) * (Number(p.r0) > 1 ? 1e-3 : 1)) : spec.bore[0];
  const m = Number(p.modulation) || 1;
  const w = spec.size[0];
  const parts = [{ slot: "glass", mesh: box(w, w, spec.L / 2) }];
  const tipHalf = 0.4 * r0;
  const n = o.lod === 0 ? 8 : 4;
  for (let v = 0; v < 4; v++) {                              // four modulated vane tips
    const ang = v * Math.PI / 2;
    const frames = [];
    for (let k = 0; k <= n; k++) {
      const z = -spec.L / 2 + spec.L * k / n;
      const phase = (v % 2 === 0) ? 0 : Math.PI;
      const r = r0 * (1 + ((m - 1) / (m + 1)) * Math.cos(2 * Math.PI * (z + spec.L / 2) / spec.L + phase));
      frames.push({ p: [r * Math.cos(ang), r * Math.sin(ang), z], x: [Math.cos(ang), Math.sin(ang), 0], y: [-Math.sin(ang), Math.cos(ang), 0], z: [0, 0, 1] });
    }
    parts.push({ slot: "cavity", mesh: sweep([[0, -tipHalf], [1.2 * tipHalf, -tipHalf], [1.2 * tipHalf, tipHalf], [0, tipHalf]], frames, { caps: true }) });
  }
  return parts;
}

// -- correctors, collimators, foils ---------------------------------------------------------------------
export function buildCorrector(spec, o) {
  const p = spec.params || {};
  const w = spec.size[0], hz = spec.size[2];
  const parts = [];
  if (p.electric || spec.sub.startsWith("electric")) {         // plate pair
    const a = Math.max(...spec.bore);
    const vertical = (p.vkick && !p.hkick) || spec.fam === "corrector_v";
    for (const sign of [1, -1]) {
      const c = vertical ? [0, sign * (a + 0.01), 0] : [sign * (a + 0.01), 0, 0];
      parts.push({ slot: "coil", mesh: vertical ? box(a, 0.003, hz, c) : box(0.003, a, hz, c) });
    }
    return parts;
  }
  const t = 0.2 * w;
  parts.push({ slot: "yoke", mesh: box(w, t / 2, hz, [0, w - t / 2, 0]) }, { slot: "yoke", mesh: box(w, t / 2, hz, [0, -(w - t / 2), 0]) });
  parts.push({ slot: "yoke", mesh: box(t / 2, w - t, hz, [w - t / 2, 0, 0]) }, { slot: "yoke", mesh: box(t / 2, w - t, hz, [-(w - t / 2), 0, 0]) });
  if (o.lod === 0) {
    const h = !!(p.hkick || spec.fam === "corrector_h" || /h/.test(spec.sub)), v = !!(p.vkick || spec.fam === "corrector_v" || /v/.test(spec.sub));
    const rt = 0.15 * w * 0.5;
    if (h || (!h && !v)) for (const s of [1, -1]) parts.push({ slot: "coil", mesh: coil([0, s * (w - t), 0], [1, 0, 0], [0, 0, 1], 1.4 * w, 2 * hz + 0.02, rt, o) });
    if (v || (!h && !v)) for (const s of [1, -1]) parts.push({ slot: "coil", mesh: coil([s * (w - t), 0, 0], [0, 1, 0], [0, 0, 1], 1.4 * w, 2 * hz + 0.02, rt, o) });
  }
  parts.push({ slot: "pipe", mesh: boreTube(spec, o) });
  return parts;
}

export function buildCollimator(spec, o) {
  const [hx, hy] = spec.bore;
  const R = spec.size[0], hz = spec.size[2];
  const t = Math.max(0.02, 0.5 * Math.max(hx, hy));
  const parts = [];
  if (spec.sub === "rect") {                                  // jaws
    parts.push({ slot: "yoke", mesh: box(t / 2, hy + t, hz, [hx + t / 2, 0, 0]) }, { slot: "yoke", mesh: box(t / 2, hy + t, hz, [-(hx + t / 2), 0, 0]) });
    parts.push({ slot: "yoke", mesh: box(hx, t / 2, hz, [0, hy + t / 2, 0]) }, { slot: "yoke", mesh: box(hx, t / 2, hz, [0, -(hy + t / 2), 0]) });
    return parts;
  }
  const slot = spec.sub === "unknown" ? "glass" : "yoke";
  const prof = profile("ellipse", hx, hy, o.segs);
  const outer = [[R, -hz], [R, hz]];
  // an annular plate: lathe cannot cut an elliptical hole, so sweep the hole and cap with a lathe ring of the same size
  parts.push({ slot, mesh: lathe([[Math.max(hx, hy) * 1.001, outer[0][1]], [R, outer[0][1]], [R, outer[1][1]], [Math.max(hx, hy) * 1.001, outer[1][1]]], o.segs) });
  parts.push({ slot, mesh: sweep(prof, straightFrames(-hz, hz), { caps: false }) });
  return parts;
}

export function buildFoil(spec, o) {
  const a = Math.max(...spec.bore);
  const w = spec.size[0], hz = spec.size[2];
  return [
    { slot: "yoke", mesh: box(w, 0.005, hz, [0, w - 0.005, 0]) }, { slot: "yoke", mesh: box(w, 0.005, hz, [0, -(w - 0.005), 0]) },
    { slot: "yoke", mesh: box(0.005, w, hz, [w - 0.005, 0, 0]) }, { slot: "yoke", mesh: box(0.005, w, hz, [-(w - 0.005), 0, 0]) },
    { slot: "glass", mesh: box(a, a, Math.max(0.0005, hz * 0.2)) },
  ];
}

// -- diagnostics --------------------------------------------------------------------------------------
function port(r, h, c, dir, o) {
  const m = new MeshBuilder();
  const cyl = lathe([[0, 0], [r, 0], [r, h], [0, h]], o.lod === 0 ? 12 : 8);
  const xf = dir === "y" ? Transform.rotateX(-Math.PI / 2) : dir === "-y" ? Transform.rotateX(Math.PI / 2) : dir === "x" ? Transform.rotateY(Math.PI / 2) : Transform.rotateY(-Math.PI / 2);
  m.append(cyl, xf.then(Transform.translate(c)));
  return m.toMesh();
}

export function buildBpm(spec, o) {
  const a = Math.max(...spec.bore);
  const hz = spec.size[2];
  const parts = [{ slot: "pipe", mesh: lathe([[a, -hz], [a + 0.006, -hz], [a + 0.006, hz], [a, hz]], o.segs) }];
  parts.push({ slot: "cavity", mesh: lathe([[a + 0.006, -hz * 0.6], [a + 0.02, -hz * 0.6], [a + 0.02, hz * 0.6], [a + 0.006, hz * 0.6]], o.segs) });
  const buttons = spec.fam === "bpm_h" ? [0, Math.PI] : spec.fam === "bpm_v" ? [Math.PI / 2, -Math.PI / 2] : spec.fam === "phase" ? [Math.PI / 2] : [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
  for (const ang of buttons) {
    const c = [Math.cos(ang) * (a + 0.02), Math.sin(ang) * (a + 0.02), 0];
    const m = new MeshBuilder();
    m.append(lathe([[0, 0], [0.008, 0], [0.008, 0.02], [0, 0.02]], 10), Transform.rotateX(-Math.PI / 2).then(Transform.rotateZ(ang - Math.PI / 2)).then(Transform.translate(c)));
    parts.push({ slot: "ceramic", mesh: m.toMesh() });
  }
  return parts;
}

export function buildProfileMonitor(spec, o) {
  const a = Math.max(...spec.bore);
  const hz = spec.size[2], H = spec.size[1];
  const parts = [{ slot: "pipe", mesh: lathe([[a, -hz], [a + 0.006, -hz], [a + 0.006, hz], [a, hz]], o.segs) }];
  const rc = a + 0.02;
  parts.push({ slot: "cavity", mesh: new MeshBuilder().append(lathe([[0, -H], [rc, -H], [rc, H], [0, H]], o.segs), Transform.rotateX(Math.PI / 2)).toMesh() });
  parts.push({ slot: "cavity", mesh: port(rc * 0.8, rc * 1.6, [rc * 0.4, 0, 0], "x", o) });
  if (o.lod === 0) {
    if (spec.fam === "wire") parts.push({ slot: "ceramic", mesh: new MeshBuilder().append(box(0.01, 0.17, 0.01), Transform.rotateZ(Math.PI / 4).then(Transform.translate([0, H + 0.12, 0]))).toMesh() });
    else if (spec.fam === "cup") parts.push({ slot: "ceramic", mesh: box(0.03, 0.03, 0.05, [0, H + 0.05, 0]) });
    else parts.push({ slot: "ceramic", mesh: box(0.03, 0.125, 0.03, [0, H + 0.125, 0]) });
    if (spec.fam === "laser" || spec.fam === "emittance") parts.push({ slot: "cavity", mesh: port(rc * 0.8, rc * 1.6, [-rc * 0.4, 0, 0], "-x", o) });
  }
  return parts;
}

export function buildCurrentMonitor(spec, o) {
  const a = Math.max(...spec.bore);
  const hz = spec.size[2];
  const major = 2.5 * a + 0.02, minor = 0.4 * a + 0.01;
  const parts = [{ slot: "pipe", mesh: lathe([[a, -hz], [a + 0.006, -hz], [a + 0.006, hz], [a, hz]], o.segs) }];
  parts.push({ slot: "coil", mesh: torus(major, minor, o.segs, 8) });
  const half = major + minor + 0.01;
  parts.push({ slot: "glass", mesh: box(half, half, Math.max(hz, minor + 0.01)) });
  if (spec.fam === "current_gap") parts.push({ slot: "ceramic", mesh: lathe([[a - 0.001, -0.01], [a + 0.008, -0.01], [a + 0.008, 0.01], [a - 0.001, 0.01]], o.segs) });
  return parts;
}

export function buildSideDetector(spec, o) {
  const parts = [{ slot: "cavity", mesh: new MeshBuilder().append(lathe([[0, -0.075], [0.04, -0.075], [0.04, 0.075], [0, 0.075]], 12), Transform.translate([0.25, 0, 0])).toMesh() }];
  parts.push({ slot: "yoke", mesh: box(0.1, 0.005, 0.01, [0.14, 0, 0]) });
  return parts;
}

export function buildValve(spec, o) {
  const a = Math.max(...spec.bore);
  const parts = [{ slot: "yoke", mesh: box(2 * a + 0.03, 2 * a + 0.06, 0.03, [0, a + 0.03, 0]) }];
  parts.push({ slot: "cavity", mesh: port(0.025, 0.12, [0, 3 * a + 0.09, 0], "y", o) });
  parts.push({ slot: "pipe", mesh: boreTube(spec, o, { z0: -0.03, z1: 0.03 }) });
  return parts;
}

/** An ion pump hanging under the pipe: a short pipe section, a port down, the pump body (sizes are guesses). */
export function buildPump(spec, o) {
  const a = Math.max(...spec.bore);
  const hz = spec.size[2];
  const r = spec.size[0], h = 0.12;
  const parts = [{ slot: "pipe", mesh: lathe([[a, -hz], [a + 0.006, -hz], [a + 0.006, hz], [a, hz]], o.segs) }];
  parts.push({ slot: "cavity", mesh: port(Math.min(0.03, a + 0.01), a + 0.04, [0, -(a + 0.006), 0], "-y", o) });
  const top = -(a + 0.045);
  parts.push({ slot: "yoke", mesh: port(r, h, [0, top, 0], "-y", o) });
  if (o.lod === 0) parts.push({ slot: "yoke", mesh: box(r * 0.9, 0.006, r * 0.9, [0, top - h - 0.006, 0]) });
  return parts;
}

export function buildGenericDiagnostic(spec, o) {
  const a = Math.max(...spec.bore);
  const hz = spec.size[2];
  return [
    { slot: "pipe", mesh: lathe([[a, -hz], [a + 0.006, -hz], [a + 0.006, hz], [a, hz]], o.segs) },
    { slot: "cavity", mesh: port(0.02, 0.06, [0, a + 0.006, 0], "y", o) },
    { slot: "kind", mesh: box(0.025, 0.025, 0.025, [0, a + 0.09, 0]) },
  ];
}

// -- non-hardware ----------------------------------------------------------------------------------------
export function buildAbstractBox(spec, o) {
  return [{ slot: "glass", mesh: box(spec.size[0], spec.size[1], spec.size[2]) }];
}

export function buildMarkerRing(spec, o) {
  const a = Math.max(...spec.bore);
  return [{ slot: "kind", mesh: torus(a + 0.008, 0.003, o.segs, 6) }];
}

export function buildFrameTriad(spec, o) {
  const L = Math.max(0.1, 3 * Math.max(...spec.bore));
  const t = 0.004;
  return [
    { slot: "kind", mesh: box(L / 2, t, t, [L / 2, 0, 0]) },
    { slot: "kind", mesh: box(t, L / 2, t, [0, L / 2, 0]) },
    { slot: "kind", mesh: box(t, t, L / 2, [0, 0, L / 2]) },
    { slot: "kind", mesh: lathe([[0, -0.012], [0.012, -0.012], [0.012, 0.012], [0, 0.012]], 8) },
  ];
}

export function buildFlag(spec, o) {
  const a = Math.max(...spec.bore);
  const h = a + 0.08;
  return [{ slot: "kind", mesh: box(0.002, h / 2, 0.002, [0, h / 2, 0]) }, { slot: "kind", mesh: box(0.03, 0.02, 0.002, [0.03, h - 0.02, 0]) }];
}

export function buildMapExtent(spec, o) {
  const p = spec.params || {};
  const r = p.r_max || spec.size[0];
  return [{ slot: "glass", mesh: lathe([[0, -spec.L / 2], [r, -spec.L / 2], [r, spec.L / 2], [0, spec.L / 2]], o.segs) }];
}
