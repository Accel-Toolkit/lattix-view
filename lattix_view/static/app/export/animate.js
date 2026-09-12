// Deterministic camera paths: a turntable about the lattice and a fly-through along the beam, as
// frame generators driven by a fixed time step, so a slow machine produces the same frames.
import * as THREE from "../../vendor/three/three.module.js";

const easeInOutSine = u => -(Math.cos(Math.PI * u) - 1) / 2;
const smoothstep = u => u * u * (3 - 2 * u);

/** Turntable: the camera circles the centre at radius and elevation over `seconds`. */
export function turntable({ centre, radius, seconds = 8, fps = 30, degrees = 360, elevation = 25 }) {
  const n = Math.max(1, Math.round(seconds * fps));
  const el = elevation * Math.PI / 180;
  return { frames: n, fps, poseAt(k) {
    const u = k / n;
    const a = easeInOutSine(u) * degrees * Math.PI / 180 + Math.PI * 0.75;
    const position = new THREE.Vector3(centre.x + radius * Math.cos(el) * Math.sin(a), centre.y + radius * Math.sin(el), centre.z + radius * Math.cos(el) * Math.cos(a));
    return { position, target: centre.clone(), up: new THREE.Vector3(0, 1, 0) };
  } };
}

/** Fly-through: ride the reference orbit from s0 to s1 with the rig's follow geometry. */
export function flyThrough({ rig, s0 = 0, s1 = null, seconds = 12, fps = 30 }) {
  const n = Math.max(1, Math.round(seconds * fps));
  const end = s1 == null ? rig.orbitLine.length : s1;
  return { frames: n, fps, poseAt(k) {
    const s = s0 + (end - s0) * smoothstep(k / n);
    const here = rig.orbitAt(s), ahead = rig.orbitAt(s + rig.follow.ahead);
    const up = new THREE.Vector3(0, 1, 0);
    const position = here.p.clone().addScaledVector(here.z, -rig.follow.back).addScaledVector(up, rig.follow.height);
    return { position, target: ahead.p.clone(), up, s };
  } };
}
