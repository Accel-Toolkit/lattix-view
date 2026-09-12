// A Wavefront OBJ + MTL writer over plain arrays: one object per element, one material per slot and
// kind, deterministic text, so a scene can go to CAD or Blender and be tested under node.

const f = v => (Math.abs(v) < 1e-12 ? "0" : parseFloat(v.toPrecision(9)).toString());

/**
 * objects: [{name, groups: [{material, positions, normals, indices}]}] in world coordinates;
 * materials: {name: [r, g, b]} in 0..1.  Returns {obj, mtl} strings.
 */
export function writeObj(objects, materials, { mtlName = "scene.mtl", comment = "" } = {}) {
  const out = [`# ${comment}`.trimEnd(), `mtllib ${mtlName}`, ""];
  let vBase = 1;
  for (const o of objects) {
    out.push(`o ${o.name.replace(/\s+/g, "_")}`);
    for (const g of o.groups) {
      const n = g.positions.length / 3;
      for (let k = 0; k < n; k++) out.push(`v ${f(g.positions[3 * k])} ${f(g.positions[3 * k + 1])} ${f(g.positions[3 * k + 2])}`);
      for (let k = 0; k < n; k++) out.push(`vn ${f(g.normals[3 * k])} ${f(g.normals[3 * k + 1])} ${f(g.normals[3 * k + 2])}`);
      out.push(`usemtl ${g.material}`);
      for (let k = 0; k < g.indices.length; k += 3) {
        const a = g.indices[k] + vBase, b = g.indices[k + 1] + vBase, c = g.indices[k + 2] + vBase;
        out.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
      }
      vBase += n;
    }
  }
  const mtl = [`# ${comment}`.trimEnd(), ""];
  for (const [name, [r, g, b]] of Object.entries(materials)) {
    mtl.push(`newmtl ${name}`, `Kd ${f(r)} ${f(g)} ${f(b)}`, `Ka ${f(r * 0.2)} ${f(g * 0.2)} ${f(b * 0.2)}`, "Ks 0.2 0.2 0.2", "Ns 40", "illum 2", "");
  }
  return { obj: out.join("\n") + "\n", mtl: mtl.join("\n") };
}
