// Floor grid, survey axes at the origin, a corner gizmo and the scale bar.
import * as THREE from "../../vendor/three/three.module.js";
import { CSS2DObject } from "../../vendor/three/addons/renderers/CSS2DRenderer.js";

/** The 1-2-5 step at or above a raw step. */
export function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

export class Overlays {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "overlays";
    scene.add(this.group);
    this.grid = null;
    this.axes = null;
    this.labels = [];
  }

  build(bounds, floorY, start) {
    for (const o of this.group.children.slice()) this.group.remove(o);
    const r = bounds.sphere.radius;
    this.step = niceStep(r * 2.5 / 25);
    const span = Math.max(10, Math.ceil(r * 2.5 / this.step) * this.step);
    this.grid = new THREE.GridHelper(span, Math.round(span / this.step), 0x3b4a5e, 0x263241);
    this.grid.position.set(bounds.sphere.center.x, floorY, bounds.sphere.center.z);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.55;
    this.group.add(this.grid);
    // survey axes at the start of the line, sized to the scene
    const L = Math.max(0.5, niceStep(r * 0.15));
    const origin = new THREE.Vector3(start.V[0], start.V[1], start.V[2]);
    this.axes = new THREE.Group();
    const axis = (dir, colour, text) => {
      const arrow = new THREE.ArrowHelper(dir, origin, L, colour, 0.15 * L, 0.06 * L);
      this.axes.add(arrow);
      const div = document.createElement("div");
      div.className = "axis-label";
      div.textContent = text;
      div.style.color = "#" + new THREE.Color(colour).getHexString();
      const label = new CSS2DObject(div);
      label.position.copy(origin).addScaledVector(dir, L * 1.12);
      this.axes.add(label);
    };
    axis(new THREE.Vector3(1, 0, 0), 0xef5350, "X");
    axis(new THREE.Vector3(0, 1, 0), 0x66bb6a, "Y");
    axis(new THREE.Vector3(0, 0, 1), 0x42a5f5, "Z");
    this.group.add(this.axes);
  }

  setGrid(on) { if (this.grid) this.grid.visible = on; }
  setAxes(on) { if (this.axes) this.axes.visible = on; }

  /** Metres per pixel at the controls' target distance, for the scale bar. */
  scaleBar(camera, targetDistance, heightPx) {
    const mpp = 2 * targetDistance * Math.tan(camera.fov * Math.PI / 360) / heightPx;
    const len = niceStep(80 * mpp);
    return { metres: len, px: len / mpp };
  }
}

/** A corner gizmo: a second tiny scene with the three axes, rendered into a viewport; click snaps a view. */
export class Gizmo {
  constructor(size = 90) {
    this.size = size;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1.4, 1.4, 1.4, -1.4, 0.1, 10);
    const mk = (dir, colour) => {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 8), new THREE.MeshBasicMaterial({ color: colour }));
      shaft.position.y = 0.5;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 10), new THREE.MeshBasicMaterial({ color: colour }));
      head.position.y = 1.1;
      g.add(shaft, head);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      g.userData.dir = dir;
      this.scene.add(g);
      return g;
    };
    this.arms = [mk(new THREE.Vector3(1, 0, 0), 0xef5350), mk(new THREE.Vector3(0, 1, 0), 0x66bb6a), mk(new THREE.Vector3(0, 0, 1), 0x42a5f5)];
  }
  render(renderer, camera, width, height) {
    const s = this.size;
    this.camera.position.copy(camera.position.clone().sub(this.scene.position).normalize().multiplyScalar(3));
    this.camera.up.copy(camera.up);
    this.camera.lookAt(0, 0, 0);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;                 // keep the main image behind the gizmo
    renderer.setViewport(width - s - 12, 12, s, s);
    renderer.setScissor(width - s - 12, 12, s, s);
    renderer.setScissorTest(true);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    renderer.autoClear = autoClear;
  }
  /** Which axis (if any) a click at canvas pixel (x, y) from the top-left lands on; null otherwise. */
  hit(x, y, width, height) {
    const s = this.size;
    const gx = x - (width - s - 12), gy = (height - y) - 12;
    if (gx < 0 || gy < 0 || gx > s || gy > s) return null;
    const ndc = new THREE.Vector2((gx / s) * 2 - 1, (gy / s) * 2 - 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hits = ray.intersectObjects(this.arms, true);
    if (!hits.length) return null;
    let g = hits[0].object;
    while (g && !g.userData.dir) g = g.parent;
    return g ? g.userData.dir.clone() : null;
  }
}
