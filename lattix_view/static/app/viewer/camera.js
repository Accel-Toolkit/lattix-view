// The camera rig: orbit (OrbitControls), fly (keyboard in camera space) and follow (riding the
// reference orbit at a position s), with the framing helpers and the canonical views.  Axes are the
// survey frame's: +Z downstream at the start, +Y up, +X to the left looking downstream.
import * as THREE from "../../vendor/three/three.module.js";
import { OrbitControls } from "../../vendor/three/addons/controls/OrbitControls.js";

const DEG = Math.PI / 180;

export class CameraRig {
  constructor(renderer, domElement) {
    this.renderer = renderer;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
    this.camera.position.set(6, 4, -8);
    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    this.mode = "orbit";
    this.keys = new Set();
    this.speed = 2.0;                       // m/s in fly mode, scaled by the scene size at load
    this.follow = { s: 0, back: 2.0, height: 0.6, ahead: 3.0, playing: false, rate: 2.0 };
    this.orbitLine = null;                  // {pts: Vector3[], s: number[]} from the payload
    this.sceneRadius = 5;
    this.reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this._anim = null;
    this._lastT = performance.now();
    this._look = { yaw: 0, pitch: 0 };
    this._drag = null;
    domElement.addEventListener("pointerdown", ev => { if (this.mode === "fly") this._drag = { x: ev.clientX, y: ev.clientY }; });
    domElement.addEventListener("pointermove", ev => {
      if (this.mode !== "fly" || !this._drag) return;
      const dx = ev.clientX - this._drag.x, dy = ev.clientY - this._drag.y;
      this._drag = { x: ev.clientX, y: ev.clientY };
      this._look.yaw -= dx * 0.004;
      this._look.pitch = THREE.MathUtils.clamp(this._look.pitch - dy * 0.004, -89 * DEG, 89 * DEG);
      this._applyLook();
    });
    window.addEventListener("pointerup", () => { this._drag = null; });
  }

  setScene(bounds, orbitPts) {
    this.sceneRadius = bounds.sphere.radius;
    this.speed = THREE.MathUtils.clamp(0.1 * this.sceneRadius, 0.5, 20);
    const pts = orbitPts.map(v => new THREE.Vector3(v[0], v[1], v[2]));
    const s = [0];
    for (let k = 1; k < pts.length; k++) s.push(s[k - 1] + pts[k].distanceTo(pts[k - 1]));
    this.orbitLine = { pts, s, length: s[s.length - 1] || 0 };
    this.follow.back = THREE.MathUtils.clamp(0.04 * this.sceneRadius, 1.0, 6.0);
    this.follow.height = this.follow.back * 0.3;
    this.follow.ahead = this.follow.back * 1.5;
  }

  // -- framing ----------------------------------------------------------------------------------------
  fitSphere(sphere, dir, up, animate = true) {
    const cam = this.camera;
    const fovV = cam.fov * DEG, fovH = 2 * Math.atan(Math.tan(fovV / 2) * cam.aspect);
    const d = sphere.radius / Math.sin(Math.min(fovV, fovH) / 2) * 1.05;
    const direction = (dir ? dir.clone() : cam.position.clone().sub(this.controls.target)).normalize();
    if (direction.lengthSq() === 0) direction.set(0.6, 0.4, -0.7).normalize();
    const pose = { position: sphere.center.clone().addScaledVector(direction, d), target: sphere.center.clone(), up: up ? up.clone() : cam.up.clone() };
    cam.near = Math.max(0.005, d * 1e-4);
    cam.far = Math.max(10 * d, d + 4 * this.sceneRadius);
    cam.updateProjectionMatrix();
    this.setMode("orbit");
    this.flyTo(pose, animate);
  }

  flyTo(pose, animate = true, ms = 600) {
    const cam = this.camera;
    if (!animate || this.reducedMotion) {
      cam.up.copy(pose.up); cam.position.copy(pose.position); this.controls.target.copy(pose.target); this.controls.update();
      return;
    }
    this._anim = { from: { position: cam.position.clone(), target: this.controls.target.clone(), up: cam.up.clone() }, to: pose, t0: performance.now(), ms };
  }

  frameElement(centre, radius) {
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.fitSphere(new THREE.Sphere(centre, Math.max(radius, 0.05)), dir, null);
  }

  /** Beam's-eye view: behind the element's entrance looking downstream. */
  lookAlongS(entrance, exit, up, radius) {
    const es = exit.clone().sub(entrance).normalize();
    if (es.lengthSq() === 0) es.set(0, 0, 1);
    const back = Math.max(3 * entrance.distanceTo(exit), 1.0);
    const pose = { position: entrance.clone().addScaledVector(es, -back).addScaledVector(up, 0.3 * Math.max(radius, 0.2)), target: exit.clone(), up: up.clone() };
    this.setMode("orbit");
    this.flyTo(pose);
  }

  view(name, sphere) {
    const dirs = {
      top: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)],        // +Z right, +X up: the floor plan
      side: [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)],      // +Z right, +Y up: the synoptic
      front: [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)],     // looking downstream, +X to the left
      iso: [new THREE.Vector3(0.6, 0.45, -0.7), new THREE.Vector3(0, 1, 0)],
    };
    const [dir, up] = dirs[name] || dirs.iso;
    this.fitSphere(sphere, dir, up);
  }

  // -- modes ---------------------------------------------------------------------------------------------
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.controls.enabled = mode === "orbit";
    if (mode === "fly") {
      const dir = this.controls.target.clone().sub(this.camera.position).normalize();
      this._look.yaw = Math.atan2(dir.x, dir.z);
      this._look.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
      this.camera.up.set(0, 1, 0);
    }
    if (mode === "follow") this.camera.up.set(0, 1, 0);
  }
  toggleFly() { this.setMode(this.mode === "fly" ? "orbit" : "fly"); return this.mode; }
  toggleFollow() { this.setMode(this.mode === "follow" ? "orbit" : "follow"); this.follow.playing = false; return this.mode; }

  _applyLook() {
    const { yaw, pitch } = this._look;
    const dir = new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
    this.controls.target.copy(this.camera.position).add(dir);
    this.camera.lookAt(this.controls.target);
  }

  /** Point and tangent frame on the reference orbit at path position s. */
  orbitAt(s) {
    const o = this.orbitLine;
    if (!o || o.pts.length < 2) return null;
    const sc = THREE.MathUtils.clamp(s, 0, o.length);
    let k = 1;
    while (k < o.s.length - 1 && o.s[k] < sc) k++;
    const a = o.pts[k - 1], b = o.pts[k];
    const seg = o.s[k] - o.s[k - 1] || 1;
    const t = (sc - o.s[k - 1]) / seg;
    const p = a.clone().lerp(b, t);
    const z = b.clone().sub(a).normalize();
    return { p, z };
  }

  stepFollow(ds) { this.follow.s = THREE.MathUtils.clamp(this.follow.s + ds, 0, this.orbitLine ? this.orbitLine.length : 0); }

  /** Per frame: animation, fly motion, follow pose, controls damping. */
  update() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastT) / 1000);
    this._lastT = now;
    if (this._anim) {
      const a = this._anim;
      const u = Math.min(1, (now - a.t0) / a.ms);
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      this.camera.position.lerpVectors(a.from.position, a.to.position, e);
      this.controls.target.lerpVectors(a.from.target, a.to.target, e);
      this.camera.up.lerpVectors(a.from.up, a.to.up, e).normalize();
      if (u >= 1) this._anim = null;
    }
    if (this.mode === "fly") {
      const k = this.keys;
      const v = this.speed * (k.has("Shift") ? 5 : k.has("Control") ? 0.2 : 1) * dt;
      const fwd = this.controls.target.clone().sub(this.camera.position).normalize();
      const right = new THREE.Vector3().crossVectors(fwd, this.camera.up).normalize();
      const move = new THREE.Vector3();
      if (k.has("w")) move.addScaledVector(fwd, v);
      if (k.has("s")) move.addScaledVector(fwd, -v);
      if (k.has("d")) move.addScaledVector(right, v);
      if (k.has("a")) move.addScaledVector(right, -v);
      if (k.has("e")) move.y += v;
      if (k.has("q")) move.y -= v;
      this.camera.position.add(move);
      this.controls.target.add(move);
      this.camera.lookAt(this.controls.target);
    } else if (this.mode === "follow" && this.orbitLine) {
      if (this.follow.playing) this.stepFollow(this.follow.rate * dt);
      const here = this.orbitAt(this.follow.s), ahead = this.orbitAt(this.follow.s + this.follow.ahead);
      if (here && ahead) {
        const up = new THREE.Vector3(0, 1, 0);
        const pos = here.p.clone().addScaledVector(here.z, -this.follow.back).addScaledVector(up, this.follow.height);
        this.camera.position.lerp(pos, 0.25);
        this.controls.target.lerp(ahead.p, 0.25);
        this.camera.up.copy(up);
        this.camera.lookAt(this.controls.target);
      }
    } else {
      this.controls.update();
    }
  }
}
