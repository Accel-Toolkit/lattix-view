// Loading glTF overrides into the scene: each handle is fetched once, cloned per element, fitted and placed
// by the pure transform, with the element's index on the object for picking.
import * as THREE from "../../vendor/three/three.module.js";
import { GLTFLoader } from "../../vendor/three/addons/loaders/GLTFLoader.js";
import { withToken } from "../api.js";
import { fitTransform } from "../models/overrides.js";
import { slotColour } from "./materials.js";

export class OverrideModels {
  constructor(scene, palette) {
    this.scene = scene;
    this.palette = palette;
    this.group = new THREE.Group();
    this.group.name = "overrides";
    this.loader = new GLTFLoader();
    this.report = [];                 // [{i, name, rule, status, detail}]
    this.objects = [];                // placed holders, one per element
    this.meshes = [];                 // their meshes, for picking (userData.i names the element)
  }

  async load() {
    const ov = this.scene.payload.overrides;
    if (!ov || !ov.assign) return this;
    const cache = {};
    const loadOne = async handle => {
      if (cache[handle]) return cache[handle];
      const url = withToken(ov.models[handle].url);
      cache[handle] = this.loader.loadAsync(url).then(g => g.scene);
      return cache[handle];
    };
    const el = this.scene.payload.el;
    for (const [key, entry] of Object.entries(ov.assign)) {
      const i = +key;
      const name = el.name[i];
      if (entry.hide || entry.archetype || entry.family) {
        const status = entry.hide ? "hidden" : entry.archetype ? "archetype" : "family";
        this.report.push({ i, name, rule: entry.rule, status, detail: entry.archetype || entry.family || "" });
        continue;
      }
      try {
        const source = await loadOne(entry.model);
        const model = source.clone(true);
        const bbox = new THREE.Box3().setFromObject(model);
        const extras = (source.userData && source.userData.lattix) || (source.children[0] && source.children[0].userData && source.children[0].userData.lattix) || null;
        const spec = this.scene.specOf(i);
        const xf = fitTransform({ min: bbox.min.toArray(), max: bbox.max.toArray() }, extras, entry, { L: spec.L, size: spec.size, bore: spec.bore });
        const holder = new THREE.Group();
        holder.name = `${name}:override`;
        // file -> body frame: scale, basis, rotate, offset, then the body pose
        const basis = new THREE.Matrix4().set(xf.basis[0][0], xf.basis[0][1], xf.basis[0][2], 0, xf.basis[1][0], xf.basis[1][1], xf.basis[1][2], 0, xf.basis[2][0], xf.basis[2][1], xf.basis[2][2], 0, 0, 0, 0, 1);
        const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(xf.rotate[0], xf.rotate[1], xf.rotate[2], "XYZ"));
        const local = new THREE.Matrix4().makeTranslation(xf.position[0], xf.position[1], xf.position[2]).multiply(rot).multiply(basis).multiply(new THREE.Matrix4().makeScale(xf.scale[0], xf.scale[1], xf.scale[2]));
        model.applyMatrix4(local);
        const p = new THREE.Vector3(el.pb[3 * i], el.pb[3 * i + 1], el.pb[3 * i + 2]);
        const q = new THREE.Quaternion(el.qb[4 * i], el.qb[4 * i + 1], el.qb[4 * i + 2], el.qb[4 * i + 3]);
        holder.quaternion.copy(q);
        holder.position.copy(p);
        holder.add(model);
        const kindHex = this.palette[this.scene.kindOf(i)] || "#888888";
        model.traverse(o => {
          if (!o.isMesh) return;
          o.userData.i = i;
          this.meshes.push(o);
          if (entry.materials === "kind") {
            const [r, g, b] = slotColour("yoke", kindHex);
            o.material = new THREE.MeshStandardMaterial({ color: new THREE.Color(r, g, b), roughness: 0.6, metalness: 0.25 });
          } else if (entry.materials === "tint" && o.material && o.material.color) {
            o.material = o.material.clone();
            o.material.color.lerp(new THREE.Color(kindHex), 0.4);
          }
        });
        this.group.add(holder);
        this.objects.push(holder);
        this.report.push({ i, name, rule: entry.rule, status: "ok", detail: `${ov.models[entry.model].file}, fit ${xf.fitted}, extent ${xf.extent.map(v => v.toFixed(3)).join("×")} ${entry.units}` });
      } catch (e) {
        this.report.push({ i, name, rule: entry.rule, status: "failed", detail: String(e.message || e) });
        console.warn("override failed", name, e);
      }
    }
    return this;
  }

  /** Indices whose procedural model is replaced or hidden (drawn by this class or not at all). */
  static replaced(payload) {
    const out = new Set();
    const ov = payload.overrides;
    if (!ov || !ov.assign) return out;
    for (const [k, e] of Object.entries(ov.assign)) if (e.hide || e.model) out.add(+k);
    return out;
  }
}
