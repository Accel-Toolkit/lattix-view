// Material slots.  Every part of every model lands in one of these; the colour per vertex is the slot's
// base mixed with the element's kind colour, so the family language of the 2D workbench survives.
import * as THREE from "../../vendor/three/three.module.js";

export const SLOTS = {
  yoke:    { base: "#8b95a3", roughness: 0.6,  metalness: 0.25, mix: 0.55 },
  coil:    { base: "#b87333", roughness: 0.4,  metalness: 0.85, mix: 0.0 },
  cavity:  { base: "#c9ced6", roughness: 0.3,  metalness: 0.9,  mix: 0.0 },
  pipe:    { base: "#9aa3ad", roughness: 0.35, metalness: 0.8,  mix: 0.3, opacity: 0.4 },
  ceramic: { base: "#f1efe6", roughness: 0.7,  metalness: 0.0,  mix: 0.0 },
  glass:   { base: "#8ab4f8", roughness: 0.2,  metalness: 0.0,  mix: 1.0, opacity: 0.18 },
  kind:    { base: "#888888", roughness: 0.85, metalness: 0.05, mix: 1.0 },
};

export function makeMaterials(theme) {
  const out = {};
  for (const [slot, s] of Object.entries(SLOTS)) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: s.roughness, metalness: s.metalness });
    if (s.opacity != null) {
      m.transparent = true;
      m.opacity = theme === "dark" ? s.opacity : Math.min(1, s.opacity + 0.1);
      m.depthWrite = false;
      m.side = THREE.FrontSide;
    }
    out[slot] = m;
  }
  return out;
}

const _a = new THREE.Color(), _b = new THREE.Color();
/** The vertex colour of a slot for a kind colour, as [r, g, b] in 0..1. */
export function slotColour(slot, kindHex) {
  const s = SLOTS[slot] || SLOTS.kind;
  _a.set(s.base);
  _b.set(kindHex || "#888888");
  _a.lerp(_b, s.mix);
  return [_a.r, _a.g, _a.b];
}
