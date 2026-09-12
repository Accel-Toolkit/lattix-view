// The vendored three.js loads under node and is the version the manifest names.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const vendor = join(here, "..", "..", "lattix_view", "static", "vendor", "three");

test("three.module.js exports the revision the manifest names", async () => {
  const manifest = JSON.parse(readFileSync(join(vendor, "MANIFEST.json"), "utf8"));
  const THREE = await import(join(vendor, "three.module.js"));
  assert.equal(THREE.REVISION, manifest.version.split(".")[1]);
  const v = new THREE.Vector3(1, 2, 3).applyQuaternion(new THREE.Quaternion(0, 0, 0, 1));
  assert.deepEqual([v.x, v.y, v.z], [1, 2, 3]);
});

test("the addons import their relative three and each other", async () => {
  const { OrbitControls } = await import(join(vendor, "addons", "controls", "OrbitControls.js"));
  assert.equal(typeof OrbitControls, "function");
  const utils = await import(join(vendor, "addons", "utils", "BufferGeometryUtils.js"));
  assert.equal(typeof utils.mergeGeometries, "function");
  const { Line2 } = await import(join(vendor, "addons", "lines", "Line2.js"));
  assert.equal(typeof Line2, "function");
});
