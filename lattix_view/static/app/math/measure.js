// Measurement records: plain objects the tools draw and the panel lists, all in metres and radians.
import { axesOf, cross, dist, dot, len, madxAngles, sub, toLocal, wrapPi } from "./vec.js";

/** Point-to-point: the chord, its global components, its components in A's local frame, and, when both
 *  points carry a path position, the difference along s (the path length between them on the orbit). */
export function distance(A, B) {
  const chord = dist(A.p, B.p);
  const d = sub(B.p, A.p);
  const rec = { type: "distance", chord, dX: d[0], dY: d[1], dZ: d[2], a: A, b: B };
  if (A.ax) { const l = toLocal(A.p, A.ax, B.p); rec.dx = l[0]; rec.dy = l[1]; rec.ds_local = l[2]; }
  if (A.s != null && B.s != null) { rec.ds = B.s - A.s; rec.path = Math.abs(rec.ds); rec.sagitta_ratio = chord > 0 ? rec.path / chord - 1 : 0; }
  return rec;
}

/** The gap between two elements: free space, centre-to-centre, entrance-to-entrance, straight-line centre distance. */
export function elementGap(el, i, j) {
  const [a, b] = i <= j ? [i, j] : [j, i];
  const c = k => [el.pc[3 * k], el.pc[3 * k + 1], el.pc[3 * k + 2]];
  const sc = k => (el.s[2 * k] + el.s[2 * k + 1]) / 2;
  return { type: "gap", i: a, j: b, free: el.s[2 * b] - el.s[2 * a + 1], centre_ds: sc(b) - sc(a),
           entrance_ds: el.s[2 * b] - el.s[2 * a], between: Math.max(0, b - a - 1), centre_chord: dist(c(a), c(b)) };
}

/** The angle between two elements' axes (their centre frames' s axes) and the heading and elevation differences. */
export function axisAngle(el, i, j) {
  const q = k => [el.qc[4 * k], el.qc[4 * k + 1], el.qc[4 * k + 2], el.qc[4 * k + 3]];
  const ai = axesOf(q(i)), aj = axesOf(q(j));
  const alpha = Math.atan2(len(cross(ai.z, aj.z)), dot(ai.z, aj.z));
  const hi = madxAngles(ai), hj = madxAngles(aj);
  return { type: "angle", i, j, alpha, dtheta: wrapPi(hj.theta - hi.theta), dphi: hj.phi - hi.phi, dpsi: wrapPi(hj.psi - hi.psi) };
}

/** The MAD-X survey angles of an element's centre frame (or body frame when `body`). */
export function heading(el, i, body = false) {
  const arr = body ? el.qb : el.qc;
  const q = [arr[4 * i], arr[4 * i + 1], arr[4 * i + 2], arr[4 * i + 3]];
  return { type: "heading", i, ...madxAngles(axesOf(q)) };
}

// -- formatting ----------------------------------------------------------------------------------------
export function fmtNum(v, sig = 6) {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a < 1e-4 || a >= 1e6) return v.toExponential(sig - 1).replace(/\.?0+e/, "e");
  return String(parseFloat(v.toPrecision(sig)));
}
export function fmtLen(v) {
  if (v == null) return "—";
  const a = Math.abs(v);
  if (a < 1e-3 && a > 0) return fmtNum(v * 1e6, 4) + " µm";
  if (a < 1) return fmtNum(v * 1e3, 5) + " mm";
  return fmtNum(v, 6) + " m";
}
export function fmtAng(rad) {
  if (rad == null) return "—";
  const deg = rad * 180 / Math.PI;
  return Math.abs(deg) < 1 && deg !== 0 ? `${fmtNum(deg, 5)}° (${fmtNum(rad * 1e3, 4)} mrad)` : `${fmtNum(deg, 5)}°`;
}

/** One line of text for a record, for the label and the list. */
export function describe(rec, names) {
  const nm = i => (i >= 0 && names ? names[i] : "—");
  switch (rec.type) {
    case "distance": {
      const parts = [`chord ${fmtLen(rec.chord)}`, `ΔX ${fmtLen(rec.dX)}  ΔY ${fmtLen(rec.dY)}  ΔZ ${fmtLen(rec.dZ)}`];
      if (rec.ds != null) parts.push(`Δs ${fmtLen(rec.ds)} (path ${fmtLen(rec.path)})`);
      if (rec.dx != null) parts.push(`local Δx ${fmtLen(rec.dx)}  Δy ${fmtLen(rec.dy)}`);
      return parts.join("  ·  ");
    }
    case "gap":
      return `${nm(rec.i)} → ${nm(rec.j)}: free ${fmtLen(rec.free)}  ·  centres ${fmtLen(rec.centre_ds)} along s, ${fmtLen(rec.centre_chord)} straight  ·  ${rec.between} between`;
    case "angle":
      return `${nm(rec.i)} ∠ ${nm(rec.j)}: ${fmtAng(rec.alpha)}  ·  Δθ ${fmtAng(rec.dtheta)}  Δφ ${fmtAng(rec.dphi)}  Δψ ${fmtAng(rec.dpsi)}`;
    case "heading":
      return `${nm(rec.i)}: θ ${fmtAng(rec.theta)}  φ ${fmtAng(rec.phi)}  ψ ${fmtAng(rec.psi)}`;
    case "probe": {
      const g = `X ${fmtLen(rec.p[0])}  Y ${fmtLen(rec.p[1])}  Z ${fmtLen(rec.p[2])}`;
      const l = rec.local ? `  ·  s ${fmtNum(rec.local.s, 6)} m  x ${fmtLen(rec.local.x)}  y ${fmtLen(rec.local.y)}` : "";
      return g + l + (rec.i >= 0 ? `  ·  ${nm(rec.i)}` : "");
    }
    default: return JSON.stringify(rec);
  }
}

/** Records as TSV with full precision (12 significant digits), one row per record. */
export function toTSV(records, names) {
  const f = v => (typeof v === "number" ? parseFloat(v.toPrecision(12)).toString() : v == null ? "" : String(v));
  const rows = [["id", "type", "element_a", "element_b", "value_m_or_rad", "dX", "dY", "dZ", "ds", "text"]];
  records.forEach((r, k) => {
    const a = r.type === "distance" ? (r.a.i >= 0 ? names[r.a.i] : r.a.kind) : r.i >= 0 ? names[r.i] : "";
    const b = r.type === "distance" ? (r.b.i >= 0 ? names[r.b.i] : r.b.kind) : r.j != null && r.j >= 0 ? names[r.j] : "";
    const value = r.type === "distance" ? r.chord : r.type === "gap" ? r.free : r.type === "angle" ? r.alpha : r.type === "heading" ? r.theta : r.p ? r.p[0] : null;
    rows.push([k + 1, r.type, a, b, f(value), f(r.dX), f(r.dY), f(r.dZ), f(r.ds), describe(r, names)]);
  });
  return rows.map(r => r.join("\t")).join("\n") + "\n";
}
