// The registry: which builder draws which element, and the options that scale detail with the deck.
import { bounds, merged } from "./geom.js";
import * as B from "./builders.js";

export const HIDDEN = 64;

/** The archetype of a spec: a builder name and a parameter for it. */
export function archetypeFor(spec) {
  const k = spec.kind, fam = spec.fam || "";
  if (spec.flags & HIDDEN) return null;
  switch (k) {
    case "Drift": return ["pipe"];
    case "Quadrupole": return ["multipole", 2];
    case "Sextupole": return ["multipole", 3];
    case "Octupole": return ["multipole", 4];
    case "Multipole": return ["multipole", Math.max(1, Number((spec.sub || "n1").slice(1)) || 1) + 1];
    case "Bend": return ["dipole"];
    case "Solenoid": return ["solenoid"];
    case "RFCavity": return ["cavity"];
    case "FieldMap":
      if (spec.sub === "solenoid") return ["solenoid"];
      if (spec.sub === "quad") return ["multipole", 2];
      if (spec.sub === "rf") return ["cavity"];
      return ["mapextent"];
    case "NCells": return ["dtl"];
    case "RFQCell": return ["rfq"];
    case "Superposition": return ["abstract"];
    case "Kicker": return ["corrector"];
    case "Collimator": return ["collimator"];
    case "Foil": return ["foil"];
    case "Marker": return ["ring"];
    case "Taylor": return spec.L > 0 ? ["abstract"] : ["ring"];
    case "Patch": return ["triad"];
    case "ReferenceChange": case "Freq": return ["flag"];
    case "Directive": return null;
    case "Instrument":
      if (["bpm", "bpm_h", "bpm_v", "phase"].includes(fam)) return ["bpm"];
      if (["profile", "wire", "screen", "laser", "emittance", "cup"].includes(fam)) return ["profile"];
      if (["current", "current_gap"].includes(fam)) return ["current"];
      if (fam === "loss") return ["sidedetector"];
      if (fam === "valve") return ["valve"];
      if (["corrector_h", "corrector_v", "chopper"].includes(fam)) return ["corrector"];
      if (["collimator", "absorber"].includes(fam)) return ["collimator"];
      return ["generic"];
    default: return ["abstract"];
  }
}

const BUILDERS = {
  pipe: (s, o) => B.buildPipe(s, o),
  multipole: (s, o, n) => B.buildMultipoleMagnet(s, o, n),
  dipole: (s, o) => B.buildDipole(s, o),
  solenoid: (s, o) => B.buildSolenoid(s, o),
  cavity: (s, o) => B.buildCavity(s, o),
  dtl: (s, o) => B.buildDtlTank(s, o),
  rfq: (s, o) => B.buildRfqCell(s, o),
  corrector: (s, o) => B.buildCorrector(s, o),
  collimator: (s, o) => B.buildCollimator(s, o),
  foil: (s, o) => B.buildFoil(s, o),
  bpm: (s, o) => B.buildBpm(s, o),
  profile: (s, o) => B.buildProfileMonitor(s, o),
  current: (s, o) => B.buildCurrentMonitor(s, o),
  sidedetector: (s, o) => B.buildSideDetector(s, o),
  valve: (s, o) => B.buildValve(s, o),
  generic: (s, o) => B.buildGenericDiagnostic(s, o),
  abstract: (s, o) => B.buildAbstractBox(s, o),
  ring: (s, o) => B.buildMarkerRing(s, o),
  triad: (s, o) => B.buildFrameTriad(s, o),
  flag: (s, o) => B.buildFlag(s, o),
  mapextent: (s, o) => B.buildMapExtent(s, o),
};

export const ARCHETYPES = Object.keys(BUILDERS);

/** Detail options for a deck of n elements: fewer segments on big decks until the level of detail lands. */
export function optionsFor(n, { style = "realistic", lod = 0 } = {}) {
  const segs = n > 1500 ? 12 : n > 500 ? 16 : 24;
  return { lod, segs, arcStep: (n > 1500 ? 6 : 3) * Math.PI / 180, style, flanges: n <= 500, vessels: n <= 800 };
}

/** Build the parts of one element; schematic style collapses everything to the kind slot. */
export function build(spec, o) {
  const arch = archetypeFor(spec);
  if (!arch) return [];
  const [name, arg] = arch;
  let parts = BUILDERS[name](spec, o, arg);
  if (o.style === "schematic") parts = parts.filter(p => p.slot !== "coil" && p.slot !== "glass").map(p => ({ slot: p.slot === "pipe" ? "pipe" : "kind", mesh: p.mesh }));
  return parts;
}

/** A single mesh of all parts, for tests and the contact sheet. */
export function buildMerged(spec, o) {
  const parts = build(spec, o);
  const mesh = merged(parts.map(p => p.mesh));
  return { parts, mesh, bounds: bounds(mesh), triangles: mesh.indices.length / 3 };
}
