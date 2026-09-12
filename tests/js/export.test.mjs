// The pure export writers under node: a zip any reader opens (checked by Python in tests/test_exports.py) and a
// deterministic OBJ + MTL.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, "..", "..", "lattix_view", "static", "app");
const { crc32, zip } = await import(join(app, "math", "zip.js"));
const { writeObj } = await import(join(app, "math", "obj.js"));

test("crc32 matches the reference vectors", () => {
  const enc = new TextEncoder();
  assert.equal(crc32(enc.encode("")), 0);
  assert.equal(crc32(enc.encode("123456789")), 0xcbf43926);
  assert.equal(crc32(enc.encode("The quick brown fox jumps over the lazy dog")), 0x414fa339);
});

test("a stored zip has the right signatures and sizes", () => {
  const bytes = zip([{ name: "a.txt", data: "hello" }, { name: "dir/b.bin", data: new Uint8Array([1, 2, 3]) }], new Date(2026, 8, 12, 10, 30, 0));
  assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b); assert.equal(bytes[2], 3); assert.equal(bytes[3], 4);
  // end of central directory: 22 bytes, two entries
  const tail = bytes.subarray(bytes.length - 22);
  assert.deepEqual([...tail.subarray(0, 4)], [0x50, 0x4b, 5, 6]);
  assert.equal(tail[10] | (tail[11] << 8), 2);
  if (process.env.ZIP_OUT) writeFileSync(process.env.ZIP_OUT, bytes);
});

test("obj and mtl text", () => {
  const objects = [{ name: "q f", groups: [{ material: "yoke_Quadrupole", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], indices: [0, 1, 2] }] },
                   { name: "b", groups: [{ material: "coil_Bend", positions: [0, 0, 1, 1, 0, 1, 0, 1, 1], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], indices: [0, 1, 2] }] }];
  const { obj, mtl } = writeObj(objects, { yoke_Quadrupole: [0.2, 0.4, 0.6], coil_Bend: [0.7, 0.45, 0.2] }, { mtlName: "s.mtl", comment: "test" });
  assert.ok(obj.startsWith("# test\nmtllib s.mtl\n"));
  assert.ok(obj.includes("o q_f\nv 0 0 0\nv 1 0 0\nv 0 1 0\nvn 0 0 1\n"));
  assert.ok(obj.includes("usemtl yoke_Quadrupole\nf 1//1 2//2 3//3\n"));
  assert.ok(obj.includes("o b\n") && obj.includes("f 4//4 5//5 6//6"));
  assert.ok(mtl.includes("newmtl coil_Bend\nKd 0.7 0.45 0.2"));
  if (process.env.OBJ_OUT) writeFileSync(process.env.OBJ_OUT, obj);
});
