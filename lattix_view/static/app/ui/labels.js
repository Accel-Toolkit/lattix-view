// Element labels as DOM nodes placed by CSS2DRenderer: the selected element's pinned label, and, on
// request, the labels of every thick element within a budget (nearest first, no overlaps).
import * as THREE from "../../vendor/three/three.module.js";
import { CSS2DObject, CSS2DRenderer } from "../../vendor/three/addons/renderers/CSS2DRenderer.js";

export class Labels {
  constructor(container, scene3) {
    this.renderer = new CSS2DRenderer();
    this.renderer.domElement.className = "labels";
    container.appendChild(this.renderer.domElement);
    this.scene3 = scene3;
    this.group = new THREE.Group();
    this.group.name = "labels";
    scene3.add(this.group);
    this.mode = "selected";                     // off | selected | all
    this.pinned = null;
    this.budget = 200;
    this.nodes = [];
  }
  resize(w, h) { this.renderer.setSize(w, h); }
  render(camera) { this.renderer.render(this.scene3, camera); }

  _make(text, cls) {
    const div = document.createElement("div");
    div.className = "el-label " + (cls || "");
    div.textContent = text;
    return new CSS2DObject(div);
  }

  setSelected(scene, i) {
    if (this.pinned) { this.group.remove(this.pinned); this.pinned = null; }
    if (i == null || i < 0 || this.mode === "off") return;
    const label = this._make(scene.nameOf(i), "pinned");
    const el = scene.payload.el;
    label.position.set(el.pc[3 * i], el.pc[3 * i + 1] + el.size[3 * i + 1] + 0.05, el.pc[3 * i + 2]);
    this.group.add(label);
    this.pinned = label;
  }

  /** Rebuild the "all" labels for the elements nearest the camera target, within the budget. */
  setAll(scene, camera, target) {
    for (const n of this.nodes) this.group.remove(n);
    this.nodes = [];
    if (this.mode !== "all" || !scene) return;
    const el = scene.payload.el;
    const cands = [];
    for (let i = 0; i < scene.n; i++) {
      if ((el.flags[i] & 64) || scene.kindOf(i) === "Drift") continue;
      const d = Math.hypot(el.pc[3 * i] - target.x, el.pc[3 * i + 1] - target.y, el.pc[3 * i + 2] - target.z);
      cands.push([d, i]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    for (const [, i] of cands.slice(0, this.budget)) {
      const label = this._make(scene.nameOf(i), "");
      label.position.set(el.pc[3 * i], el.pc[3 * i + 1] + el.size[3 * i + 1] + 0.03, el.pc[3 * i + 2]);
      this.group.add(label);
      this.nodes.push(label);
    }
  }

  cycle() {
    this.mode = this.mode === "off" ? "selected" : this.mode === "selected" ? "all" : "off";
    return this.mode;
  }
}
