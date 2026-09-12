// lattix 3D: fetch the scene of the session, draw it, keep it in step with the workbench.
import * as THREE from "../vendor/three/three.module.js";
import { OrbitControls } from "../vendor/three/addons/controls/OrbitControls.js";
import { PREFIX, embedded, getJSON, session, withToken } from "./api.js";
import { Bridge } from "./bridge.js";
import { cssVar, paletteFor, systemTheme } from "./palette.js";
import { LatticeScene } from "./scene.js";

const $ = sel => document.querySelector(sel);

const state = {
  session, theme: systemTheme(), palette: paletteFor(systemTheme()), scene: null, selection: null, hover: null,
  bridge: null,
};

// -- renderer -------------------------------------------------------------------------------------
const view = $("#view");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
} catch (e) {
  showMessage(`<p class="err">WebGL is not available in this browser.</p><p>${e.message}</p>`);
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
view.appendChild(renderer.domElement);
const scene3 = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
camera.position.set(6, 4, -8);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 1.2);
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(5, 10, -3);
scene3.add(hemi, sun);
let grid = null;
window.lattix3d = { state, scene3, camera, ready: false,
  stats() { return { elements: state.scene ? state.scene.n : 0, frames, ...(state.scene ? state.scene.stats : {}) }; } };

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  scene3.background = new THREE.Color(cssVar("--bg-0") || (state.theme === "dark" ? "#0b0f15" : "#eef1f5"));
  hemi.groundColor.set(state.theme === "dark" ? 0x1a2230 : 0x94a3b8);
  if (state.scene) state.scene.recolour(state.palette);
}

function resize() {
  const w = view.clientWidth || 1, h = view.clientHeight || 1;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

let frames = 0;
function loop() {
  requestAnimationFrame(loop);
  controls.update();
  renderer.render(scene3, camera);
  frames++;
}
loop();

// -- camera helpers ---------------------------------------------------------------------------------
function fitSphere(sphere, dir) {
  const d = sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2) * 1.05;
  const direction = (dir || camera.position.clone().sub(controls.target)).normalize();
  if (direction.lengthSq() === 0) direction.set(0.6, 0.4, -0.7).normalize();
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(direction, d);
  camera.near = Math.max(0.005, d * 1e-4);
  camera.far = Math.max(10 * d, d + 4 * sphere.radius);
  camera.updateProjectionMatrix();
  controls.update();
}
function fitAll(dir, up) {
  if (!state.scene) return;
  if (up) camera.up.copy(up);
  fitSphere(state.scene.bounds().sphere, dir);
}
const VIEWS = {
  top: () => fitAll(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)),         // +Z right, +X up: the floor plan
  side: () => fitAll(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)),       // +Z right, +Y up: the synoptic
  front: () => fitAll(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)),      // looking downstream, +X left
  iso: () => fitAll(new THREE.Vector3(0.6, 0.45, -0.7), new THREE.Vector3(0, 1, 0)),
};

// -- picking ----------------------------------------------------------------------------------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(ev) {
  if (!state.scene) return -1;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(state.scene.pickables, false);
  return hits.length ? state.scene.elementAt(hits[0]) : -1;
}
const tip = $("#tip");
function showTip(i, ev) {
  if (i < 0 || !state.scene) { tip.hidden = true; return; }
  const el = state.scene.payload.el;
  const s0 = el.s[2 * i], s1 = el.s[2 * i + 1];
  const head = `${el.name[i]}  ·  ${state.scene.kindOf(i)}`;
  const where = `s = ${s0.toPrecision(6)} → ${s1.toPrecision(6)} m  (L = ${fmtLen(el.L[i])})`;
  const pos = `X ${el.pc[3 * i].toFixed(4)}  Y ${el.pc[3 * i + 1].toFixed(4)}  Z ${el.pc[3 * i + 2].toFixed(4)} m`;
  tip.textContent = [head, where, pos, el.label[i]].filter(Boolean).join("\n");
  tip.hidden = false;
  tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 370) + "px";
  tip.style.top = Math.min(ev.clientY + 14, window.innerHeight - 120) + "px";
}
function fmtLen(v) { return Math.abs(v) < 1 && v !== 0 ? (v * 1e3).toPrecision(5) + " mm" : v.toPrecision(6) + " m"; }
/** The 1-2-5 step at or above a raw step. */
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

let down = null;
renderer.domElement.addEventListener("pointerdown", ev => { down = { x: ev.clientX, y: ev.clientY }; });
renderer.domElement.addEventListener("pointermove", ev => {
  const i = pick(ev);
  if (i !== state.hover) {
    state.hover = i;
    state.scene && state.scene.highlight(state.selection != null ? state.selection : i, state.palette, state.selection != null ? 0.7 : 0.45);
    if (state.bridge) state.bridge.hover(i >= 0 ? { side: "src", index: state.scene.payload.el.i[i] } : null);
  }
  showTip(i, ev);
});
renderer.domElement.addEventListener("pointerleave", () => { state.hover = -1; tip.hidden = true; });
renderer.domElement.addEventListener("pointerup", ev => {
  if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 3) { down = null; return; }
  down = null;
  const i = pick(ev);
  select(i >= 0 ? i : null, true);
});

function select(i, tell) {
  state.selection = i;
  if (state.scene) state.scene.highlight(i == null ? -1 : i, state.palette, 0.7);
  $("#status").textContent = i == null ? "" : `selected ${state.scene.nameOf(i)} (${state.scene.kindOf(i)})`;
  if (tell && state.bridge) state.bridge.select(i == null ? null : state.scene.payload.el.i[i]);
}

// -- loading ----------------------------------------------------------------------------------------
function showMessage(html) { const m = $("#msg"); m.innerHTML = `<div>${html}</div>`; m.hidden = false; }
function hideMessage() { $("#msg").hidden = true; }

async function load(sid) {
  state.session = sid;
  if (!sid) {
    showMessage(`<p>No lattice yet.</p><p class="muted">Read a deck in the workbench, or start with <code>lattix-view view deck.dat</code>.</p>`);
    return;
  }
  showMessage("loading the scene…");
  let payload;
  try {
    payload = await getJSON(`${PREFIX}/api/scene?session=${encodeURIComponent(sid)}`);
  } catch (e) {
    showMessage(`<p class="err">${e.message}</p><p class="muted">${e.status === 409 ? "read a deck first" : "open this page through the link the workbench printed"}</p>`);
    return;
  }
  if (state.scene) scene3.remove(state.scene.group);
  state.scene = new LatticeScene(payload, state.palette, state.theme);
  scene3.add(state.scene.group);
  if (grid) scene3.remove(grid);
  const b = state.scene.bounds();
  const step = niceStep(b.sphere.radius * 2.5 / 25);          // about 25 cells across, on a 1-2-5 step
  const span = Math.max(10, Math.ceil(b.sphere.radius * 2.5 / step) * step);
  grid = new THREE.GridHelper(span, Math.round(span / step), 0x3b4a5e, 0x263241);
  grid.position.set(b.sphere.center.x, payload.lattice.floor_y, b.sphere.center.z);
  grid.visible = $("#btn-grid").getAttribute("aria-pressed") === "true";
  scene3.add(grid);
  const L = payload.lattice;
  $("#deck-name").textContent = L.file ? L.file.split("/").pop() : L.name;
  $("#deck-info").textContent = `${L.format}  ·  ${L.n} elements  ·  ${L.total_length.toPrecision(6)} m`;
  hideMessage();
  VIEWS.iso();
  window.lattix3d.ready = true;
}

// -- bridge with the workbench ------------------------------------------------------------------------
state.bridge = new Bridge({
  "lattix:source": m => { if (m.session && m.session !== state.session) load(m.session); else if (m.session && !state.scene) load(m.session); },
  "lattix:selection": m => {
    if (!state.scene) return;
    const sel = m.selection;
    if (!sel || sel.side !== "src") { select(null, false); return; }
    const k = state.scene.payload.el.i.indexOf(sel.index);
    select(k >= 0 ? k : null, false);
  },
  "lattix:hover": m => {
    if (!state.scene || state.selection != null) return;
    const hv = m.hover;
    const k = hv && hv.side === "src" ? state.scene.payload.el.i.indexOf(hv.index) : -1;
    state.scene.highlight(k, state.palette, 0.45);
  },
  "lattix:palette": m => {
    state.theme = m.theme === "dark" || (m.theme === "auto" && systemTheme() === "dark") ? "dark" : "light";
    state.palette = { ...paletteFor(state.theme), ...(m.colors || {}) };
    applyTheme();
  },
});

// -- controls ---------------------------------------------------------------------------------------
$("#btn-fit").addEventListener("click", () => VIEWS.iso());
$("#btn-top").addEventListener("click", VIEWS.top);
$("#btn-side").addEventListener("click", VIEWS.side);
$("#btn-front").addEventListener("click", VIEWS.front);
$("#btn-orbit").addEventListener("click", ev => {
  const on = ev.currentTarget.getAttribute("aria-pressed") !== "true";
  ev.currentTarget.setAttribute("aria-pressed", String(on));
  if (state.scene) state.scene.orbit.visible = on;
});
$("#btn-grid").addEventListener("click", ev => {
  const on = ev.currentTarget.getAttribute("aria-pressed") !== "true";
  ev.currentTarget.setAttribute("aria-pressed", String(on));
  if (grid) grid.visible = on;
});
document.addEventListener("keydown", ev => {
  const tag = (ev.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "select" || tag === "textarea") return;
  if (ev.key === "0") { VIEWS.iso(); return; }
  if (ev.key === "t") { VIEWS.top(); return; }
  if (ev.key === "e") { VIEWS.side(); return; }
  if (ev.key === "n") { VIEWS.front(); return; }
  if (ev.key === "g") { $("#btn-grid").click(); return; }
  if (ev.key === "Escape") { select(null, true); return; }
  if (state.bridge && state.bridge.embedded) state.bridge.key(ev);
});
if (!embedded) {
  const link = $("#workbench-link");
  link.hidden = false;
  link.href = withToken("/") + (session ? "&session=" + encodeURIComponent(session) : "");
}

applyTheme();
load(session);
if (state.bridge.embedded) state.bridge.ready();
