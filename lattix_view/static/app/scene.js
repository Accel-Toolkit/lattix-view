// The scene from a payload (lattix-view.scene/1).  This first version draws one box per element on
// its body frame, sized by the server's outer half-extents and coloured by kind, the reference orbit
// as a line, and a floor grid; the model library replaces the boxes archetype by archetype.
import * as THREE from "../vendor/three/three.module.js";

export const HIDDEN = 64;                       // el.flags bit: not drawn (directives, synthetic lenses)

export class LatticeScene {
  constructor(payload, palette) {
    this.payload = payload;
    this.group = new THREE.Group();
    this.group.name = "lattice";
    this.n = payload.lattice.n;
    this.drawn = [];                              // instance id -> element index
    this.instanceOf = new Int32Array(this.n).fill(-1);
    this.build(palette);
  }

  kindOf(i) { return this.payload.kinds[this.payload.el.kind[i]]; }
  nameOf(i) { return this.payload.el.name[i]; }

  build(palette) {
    const el = this.payload.el;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.15, vertexColors: false });
    const ids = [];
    for (let i = 0; i < this.n; i++) if (!(el.flags[i] & HIDDEN)) ids.push(i);
    const mesh = new THREE.InstancedMesh(box, mat, Math.max(1, ids.length));
    mesh.name = "elements";
    mesh.count = ids.length;
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const c = new THREE.Color();
    ids.forEach((i, k) => {
      p.set(el.pb[3 * i], el.pb[3 * i + 1], el.pb[3 * i + 2]);
      q.set(el.qb[4 * i], el.qb[4 * i + 1], el.qb[4 * i + 2], el.qb[4 * i + 3]);
      s.set(2 * el.size[3 * i], 2 * el.size[3 * i + 1], 2 * el.size[3 * i + 2]);
      m.compose(p, q, s);
      mesh.setMatrixAt(k, m);
      mesh.setColorAt(k, c.set(palette[this.kindOf(i)] || "#888888"));
      this.drawn[k] = i;
      this.instanceOf[i] = k;
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.mesh = mesh;
    this.group.add(mesh);

    const pts = this.payload.orbit.map(v => new THREE.Vector3(v[0], v[1], v[2]));
    this.orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
                                new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.9 }));
    this.orbit.name = "reference_orbit";
    this.group.add(this.orbit);
  }

  recolour(palette) {
    const c = new THREE.Color();
    this.drawn.forEach((i, k) => this.mesh.setColorAt(k, c.set(palette[this.kindOf(i)] || "#888888")));
    this.mesh.instanceColor.needsUpdate = true;
  }

  /** Highlight one element (instance colour lightened); -1 clears. */
  highlight(index, palette, strength = 0.5) {
    const c = new THREE.Color();
    if (this._lit != null && this.instanceOf[this._lit] >= 0) {
      this.mesh.setColorAt(this.instanceOf[this._lit], c.set(palette[this.kindOf(this._lit)] || "#888888"));
    }
    this._lit = index >= 0 ? index : null;
    if (index >= 0 && this.instanceOf[index] >= 0) {
      c.set(palette[this.kindOf(index)] || "#888888").lerp(new THREE.Color(0xffffff), strength);
      this.mesh.setColorAt(this.instanceOf[index], c);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  bounds() {
    const b = this.payload.lattice.bbox;
    const box = new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max));
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    if (sphere.radius < 0.5) sphere.radius = 0.5;
    return { box, sphere };
  }

  centreOf(i) {
    const el = this.payload.el;
    return new THREE.Vector3(el.pc[3 * i], el.pc[3 * i + 1], el.pc[3 * i + 2]);
  }
}
