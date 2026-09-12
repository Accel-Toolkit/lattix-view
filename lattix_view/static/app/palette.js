// The per-kind colours of the lattix workbench (its --k-<Kind> CSS variables), so a standalone page
// and an embedded tab read as the same family.  The workbench sends its live palette through the
// bridge ("lattix:palette"), which replaces these.
export const DARK = {
  Drift: "#6b7280", Quadrupole: "#22d3ee", Sextupole: "#84cc16", Octupole: "#65a30d", Multipole: "#34d399",
  Bend: "#fb923c", Solenoid: "#a78bfa", RFCavity: "#a3e635", FieldMap: "#a3e635", NCells: "#a3e635", RFQCell: "#67e8f9",
  Kicker: "#f472b6", Collimator: "#f87171", Marker: "#e5e7eb", Instrument: "#f472b6", Foil: "#e94f37", Taylor: "#60a5fa",
  Patch: "#fbbf24", ReferenceChange: "#fbbf24", Freq: "#fbbf24", Directive: "#9ca3af", Superposition: "#a3e635",
};
export const LIGHT = {
  Drift: "#64748b", Quadrupole: "#0891b2", Sextupole: "#4d7c0f", Octupole: "#3f6212", Multipole: "#047857",
  Bend: "#ea580c", Solenoid: "#7c3aed", RFCavity: "#15803d", FieldMap: "#15803d", NCells: "#15803d", RFQCell: "#0e7490",
  Kicker: "#db2777", Collimator: "#991b1b", Marker: "#475569", Instrument: "#db2777", Foil: "#9f1239", Taylor: "#1d4ed8",
  Patch: "#b45309", ReferenceChange: "#b45309", Freq: "#b45309", Directive: "#6b7280", Superposition: "#15803d",
};

export function systemTheme() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function paletteFor(theme) {
  return theme === "dark" ? DARK : LIGHT;
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
