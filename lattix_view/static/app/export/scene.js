// Scene export: the lattice rebuilt as one node per element (name, kind and positions as extras) with a
// material per slot and kind, written as binary glTF through three's exporter or as OBJ + MTL by the
// pure writer; the reference orbit goes along as a line.
import * as THREE from "../../vendor/three/three.module.js";
import { GLTFExporter } from "../../vendor/three/addons/exporters/GLTFExporter.js";
import { build } from "../models/index.js";
import { slotColour } from "../scene/materials.js";
import { writeObj } from "../math/obj.js";
import { zip } from "../math/zip.js";

const HIDDEN = 64;

/** Per-element groups of meshes in world coordinates, and the materials they use. */
export function exportObjects(scene, palette, opts) {
  const el = scene.payload.el;
  const objects = [];
  const materials = {};
  const p = new THREE.Vector3(), q = new THREE.Quaternion();
  const seen = {};
  for (let i = 0; i < scene.n; i++) {
    if (el.flags[i] & HIDDEN) continue;
    const spec = scene.specOf(i);
    let parts;
    try { parts = build(spec, { ...scene.opts, ...(opts || {}) }); } catch (e) { parts = []; }
    if (!parts.length) continue;
    p.set(el.pb[3 * i], el.pb[3 * i + 1], el.pb[3 * i + 2]);
    q.set(el.qb[4 * i], el.qb[4 * i + 1], el.qb[4 * i + 2], el.qb[4 * i + 3]);
    const kind = scene.kindOf(i);
    const base = el.name[i].replace(/[^\w.\-]/g, "_");
    seen[base] = (seen[base] || 0) + 1;
    const name = seen[base] > 1 ? `${base}@${i}` : base;
    const groups = [];
    for (const part of parts) {
      const material = `${part.slot}_${kind}`;
      if (!materials[material]) materials[material] = slotColour(part.slot, palette[kind] || "#888888");
      const m = part.mesh;
      const positions = new Array(m.positions.length), normals = new Array(m.normals.length);
      const v = new THREE.Vector3();
      for (let k = 0; k < m.positions.length; k += 3) {
        v.set(m.positions[k], m.positions[k + 1], m.positions[k + 2]).applyQuaternion(q).add(p);
        positions[k] = v.x; positions[k + 1] = v.y; positions[k + 2] = v.z;
        v.set(m.normals[k], m.normals[k + 1], m.normals[k + 2]).applyQuaternion(q);
        normals[k] = v.x; normals[k + 1] = v.y; normals[k + 2] = v.z;
      }
      groups.push({ material, slot: part.slot, positions, normals, indices: m.indices });
    }
    objects.push({ name, i, kind, groups, extras: { index: el.i[i], name: el.name[i], kind, sub: scene.payload.subkinds[el.sub[i]] || "",
                   s_in: el.s[2 * i], s_out: el.s[2 * i + 1], L: el.L[i] } });
  }
  return { objects, materials };
}

/** A three.js Group of the export objects (for the glTF exporter), plus the orbit as a line. */
export function exportGroup(scene, palette, opts) {
  const { objects, materials } = exportObjects(scene, palette, opts);
  const group = new THREE.Group();
  group.name = scene.payload.lattice.name || "lattice";
  const mats = {};
  for (const [name, [r, g, b]] of Object.entries(materials)) mats[name] = new THREE.MeshStandardMaterial({ name, color: new THREE.Color(r, g, b), roughness: 0.6, metalness: 0.2 });
  for (const o of objects) {
    const node = new THREE.Group();
    node.name = o.name;
    node.userData = o.extras;
    for (const g of o.groups) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(g.positions, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(g.normals, 3));
      geo.setIndex(g.indices.length > 65535 || g.positions.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(g.indices, 1) : new THREE.Uint16BufferAttribute(g.indices, 1));
      const mesh = new THREE.Mesh(geo, mats[g.material]);
      mesh.name = `${o.name}:${g.slot}`;
      node.add(mesh);
    }
    group.add(node);
  }
  const pts = scene.payload.orbit.map(v => new THREE.Vector3(v[0], v[1], v[2]));
  const orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ name: "reference_orbit", color: 0x22d3ee }));
  orbit.name = "reference_orbit";
  group.add(orbit);
  return group;
}

export async function toGLB(scene, palette, opts) {
  const group = exportGroup(scene, palette, opts);
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(group, { binary: true, onlyVisible: false });
  return new Blob([result], { type: "model/gltf-binary" });
}

export function toObjZip(scene, palette, opts, stem) {
  const { objects, materials } = exportObjects(scene, palette, opts);
  const comment = `lattix-view export of ${scene.payload.lattice.file || scene.payload.lattice.name}; metres; survey frame (+Z downstream at the start, +Y up, +X left)`;
  const { obj, mtl } = writeObj(objects, materials, { mtlName: `${stem}.mtl`, comment });
  const bytes = zip([{ name: `${stem}.obj`, data: obj }, { name: `${stem}.mtl`, data: mtl }]);
  return new Blob([bytes], { type: "application/zip" });
}
