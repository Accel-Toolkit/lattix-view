// lattix 3D: fetch the scene of the session, draw it, keep it in step with the workbench.
import * as THREE from "../vendor/three/three.module.js";
import { PREFIX, embedded, getJSON, session, withToken } from "./api.js";
import { Bridge } from "./bridge.js";
import { cssVar, paletteFor, systemTheme } from "./palette.js";
import { LatticeScene } from "./scene.js";
import { CameraRig } from "./viewer/camera.js";
import { Gizmo, Overlays } from "./viewer/overlays.js";
import { Labels } from "./ui/labels.js";
import { Measure } from "./tools/measure.js";
import { MeasuresPanel } from "./ui/panel_measures.js";
import { ExportPanel } from "./ui/panel_export.js";

const $ = sel => document.querySelector(sel);

const state = {
  session, theme: systemTheme(), palette: paletteFor(systemTheme()), scene: null, selection: null, hover: -1,
  bridge: null, style: "realistic", xray: false, payload: null,
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
renderer.autoClear = true;
view.appendChild(renderer.domElement);
const scene3 = new THREE.Scene();
const rig = new CameraRig(renderer, renderer.domElement);
const camera = rig.camera;
const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 1.2);
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(5, 10, -3);
const fill = new THREE.DirectionalLight(0xffffff, 0.5);
fill.position.set(-6, 3, 4);
scene3.add(hemi, sun, fill);
const overlays = new Overlays(scene3);
const gizmo = new Gizmo(84);
const labels = new Labels(view, scene3);
const measure = new Measure(scene3, () => state.scene, camera, renderer.domElement, () => { panel.render(); toolButtons(); });
const panel = new MeasuresPanel($("#measures"), measure, () => state.scene, id => {
  const r = measure.records.find(x => x.id === id);
  if (!r) return;
  const p = r.rec.p || (r.rec.a ? r.rec.a.p : null) || (r.rec.i >= 0 ? state.scene.centreOf(r.rec.i).toArray() : null);
  if (p) rig.frameElement(new THREE.Vector3(p[0], p[1], p[2]), 0.6);
});
const section = { on: false, axis: "s", offset: 0 };
const exportPanel = new ExportPanel($("#exports"), {
  getScene: () => state.scene, getState: () => state, renderer, scene3, camera, rig, session: () => state.session,
  onSite: site => { state.site = site; load(state.session); },
});
state.site = null;
let frames = 0;
window.lattix3d = { state, scene3, camera, rig, measure, ready: false,
  stats() { return { elements: state.scene ? state.scene.n : 0, frames, ...(state.scene ? state.scene.stats : {}) }; },
  select(i) { select(i, true); }, view(name) { views(name); },
  /** Canvas pixel of a global point, or of element i's centre ("c"), entrance ("in") or exit ("out"). */
  screenPosOf(i, at = "c") {
    const el = state.scene.payload.el, arr = { c: el.pc, in: el.pin, out: el.pout }[at];
    const v = new THREE.Vector3(arr[3 * i], arr[3 * i + 1], arr[3 * i + 2]).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
  } };

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  scene3.background = new THREE.Color(cssVar("--bg-0") || (state.theme === "dark" ? "#0b0f15" : "#eef1f5"));
  hemi.groundColor.set(state.theme === "dark" ? 0x1a2230 : 0x94a3b8);
  if (state.scene) state.scene.recolour(state.palette);
}

function resize() {
  const w = view.clientWidth || 1, h = view.clientHeight || 1;
  renderer.setSize(w, h, false);
  labels.resize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

let lastLabels = 0;
function loop() {
  requestAnimationFrame(loop);
  rig.update();
  renderer.render(scene3, camera);
  gizmo.render(renderer, camera, renderer.domElement.width / renderer.getPixelRatio(), renderer.domElement.height / renderer.getPixelRatio());
  labels.render(camera);
  frames++;
  const now = performance.now();
  if (now - lastLabels > 200) { lastLabels = now; statusBar(); if (labels.mode === "all") labels.setAll(state.scene, camera, rig.controls.target); }
}
loop();

function statusBar() {
  const h = renderer.domElement.height / renderer.getPixelRatio();
  const d = camera.position.distanceTo(rig.controls.target);
  const sb = overlays.scaleBar(camera, d, h);
  $("#scalebar .bar").style.width = Math.round(sb.px) + "px";
  $("#scalebar .len").textContent = sb.metres >= 1 ? `${sb.metres} m` : `${Math.round(sb.metres * 1000)} mm`;
  const mode = rig.mode === "fly" ? "fly: W A S D Q E, drag to look, Esc to leave" : rig.mode === "follow" ? `ride: s = ${rig.follow.s.toFixed(2)} m  (j k step, p play, Esc to leave)` : "";
  $("#status-mode").textContent = mode;
  $("#btn-fly").setAttribute("aria-pressed", String(rig.mode === "fly"));
  $("#btn-follow").setAttribute("aria-pressed", String(rig.mode === "follow"));
}

// -- views ------------------------------------------------------------------------------------------
function views(name) {
  if (!state.scene) return;
  if (name === "selection") {
    if (state.selection == null) return rig.view("iso", state.scene.bounds().sphere);
    const i = state.selection, el = state.scene.payload.el;
    return rig.frameElement(state.scene.centreOf(i), Math.max(...el.size.slice(3 * i, 3 * i + 3)) * 2.5);
  }
  if (name === "beam") {
    if (state.selection == null) return;
    const i = state.selection, el = state.scene.payload.el;
    const q = new THREE.Quaternion(el.qin[4 * i], el.qin[4 * i + 1], el.qin[4 * i + 2], el.qin[4 * i + 3]);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    return rig.lookAlongS(new THREE.Vector3(el.pin[3 * i], el.pin[3 * i + 1], el.pin[3 * i + 2]),
                          new THREE.Vector3(el.pout[3 * i], el.pout[3 * i + 1], el.pout[3 * i + 2]), up, Math.max(...el.size.slice(3 * i, 3 * i + 3)));
  }
  rig.view(name, state.scene.bounds().sphere);
}

// -- picking ----------------------------------------------------------------------------------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let lastHit = null;                                  // {i, p} of the surface under the cursor
function pick(ev) {
  lastHit = null;
  if (!state.scene) return -1;
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(state.scene.pickables, false);
  if (!hits.length) return -1;
  const i = state.scene.elementAt(hits[0]);
  lastHit = { i, p: hits[0].point.toArray() };
  return i;
}
const tip = $("#tip");
function fmtLen(v) { return Math.abs(v) < 1 && v !== 0 ? (v * 1e3).toPrecision(5) + " mm" : v.toPrecision(6) + " m"; }
function showTip(i, ev) {
  if (i < 0 || !state.scene) { tip.hidden = true; return; }
  const el = state.scene.payload.el;
  const s0 = el.s[2 * i], s1 = el.s[2 * i + 1];
  const sub = state.scene.payload.subkinds[el.sub[i]], fam = state.scene.payload.families[el.fam[i]];
  const head = `${el.name[i]}  ·  ${state.scene.kindOf(i)}${sub ? " (" + sub + ")" : ""}${fam ? " · " + fam : ""}`;
  const where = `s = ${s0.toPrecision(6)} → ${s1.toPrecision(6)} m  (L = ${fmtLen(el.L[i])})`;
  const pos = `X ${el.pc[3 * i].toFixed(4)}  Y ${el.pc[3 * i + 1].toFixed(4)}  Z ${el.pc[3 * i + 2].toFixed(4)} m`;
  const flags = [(el.flags[i] & 2) ? "misaligned" : "", (el.flags[i] & 1) ? "reversed" : "", (el.flags[i] & 8) ? "in a superposition" : ""].filter(Boolean).join(", ");
  tip.textContent = [head, where, pos, el.label[i], flags].filter(Boolean).join("\n");
  tip.hidden = false;
  tip.style.left = Math.min(ev.clientX + 14, window.innerWidth - 390) + "px";
  tip.style.top = Math.min(ev.clientY + 14, window.innerHeight - 130) + "px";
}

let down = null;
renderer.domElement.addEventListener("pointerdown", ev => { down = { x: ev.clientX, y: ev.clientY }; });
renderer.domElement.addEventListener("pointermove", ev => {
  if (rig.mode === "fly" && down) { tip.hidden = true; return; }
  const i = pick(ev);
  if (i !== state.hover) {
    state.hover = i;
    if (state.scene && state.selection == null) state.scene.highlight(i, state.palette, 0.45);
    if (state.bridge) state.bridge.hover(i >= 0 ? { side: "src", index: state.scene.payload.el.i[i] } : null);
  }
  if (measure.tool) {
    const sn = measure.hover([ev.clientX, ev.clientY], lastHit);
    if (sn && sn.tier !== "surface") { tip.textContent = snapText(sn); tip.hidden = false; tip.style.left = (ev.clientX + 14) + "px"; tip.style.top = (ev.clientY + 14) + "px"; return; }
  }
  showTip(i, ev);
});
function snapText(sn) {
  const el = state.scene.payload.el;
  const what = sn.tier === "frame" ? { in: "entrance", c: "centre", out: "exit", body: "body centre" }[sn.kind] + " of " + el.name[sn.i]
             : sn.tier === "axis" ? "beam axis" + (sn.i >= 0 ? " in " + el.name[sn.i] : "") : sn.tier === "floor" ? "floor" : "free point";
  const s = sn.s != null ? `  s = ${sn.s.toFixed(4)} m` : "";
  return `${what}${s}\nX ${sn.p[0].toFixed(4)}  Y ${sn.p[1].toFixed(4)}  Z ${sn.p[2].toFixed(4)} m`;
}
renderer.domElement.addEventListener("pointerleave", () => { state.hover = -1; tip.hidden = true; });
renderer.domElement.addEventListener("pointerup", ev => {
  const wasDown = down; down = null;
  if (!wasDown || Math.hypot(ev.clientX - wasDown.x, ev.clientY - wasDown.y) > 3) return;
  const r = renderer.domElement.getBoundingClientRect();
  const dir = gizmo.hit(ev.clientX - r.left, ev.clientY - r.top, r.width, r.height);
  if (dir && state.scene) {
    const name = Math.abs(dir.y) > 0.5 ? "top" : Math.abs(dir.x) > 0.5 ? "side" : "front";
    views(name);
    return;
  }
  if (rig.mode === "fly") return;
  const i = pick(ev);
  if (measure.click([ev.clientX, ev.clientY], lastHit)) return;
  select(i >= 0 ? i : null, true);
});

function toolButtons() {
  for (const [name, id] of [["distance", "#btn-measure"], ["angle", "#btn-angle"], ["gap", "#btn-gap"], ["probe", "#btn-probe"]]) {
    $(id).setAttribute("aria-pressed", String(measure.tool === name));
  }
  $("#btn-section").setAttribute("aria-pressed", String(section.on));
  $("#section-ctl").hidden = !section.on;
}
function applySection() {
  if (!section.on || state.selection == null) { measure.setSection(null, section.axis, 0, renderer); section.on = false; toolButtons(); return; }
  const i = state.selection, el = state.scene.payload.el;
  const half = section.axis === "s" ? el.size[3 * i + 2] : section.axis === "x" ? el.size[3 * i] : el.size[3 * i + 1];
  const slider = $("#section-offset");
  slider.min = -half; slider.max = half; slider.step = half / 50;
  measure.setSection(i, section.axis, section.offset, renderer);
  $("#section-axis").textContent = section.axis;
  toolButtons();
}

function select(i, tell) {
  state.selection = i;
  if (state.scene) state.scene.highlight(i == null ? -1 : i, state.palette, 0.7);
  labels.setSelected(state.scene, i);
  if (section.on) applySection();
  $("#status-text").textContent = i == null ? "" : `${state.scene.nameOf(i)}  ${state.scene.kindOf(i)}`;
  if (tell && state.bridge) state.bridge.select(i == null ? null : state.scene.payload.el.i[i]);
}

function step(delta, skipDrifts) {
  if (!state.scene) return;
  let i = state.selection == null ? (delta > 0 ? -1 : state.scene.n) : state.selection;
  const el = state.scene.payload.el;
  do { i += delta; } while (i >= 0 && i < state.scene.n && ((el.flags[i] & 64) || (skipDrifts && state.scene.kindOf(i) === "Drift")));
  if (i < 0 || i >= state.scene.n) return;
  select(i, true);
  views("selection");
}

// -- loading ----------------------------------------------------------------------------------------
function showMessage(html) { const m = $("#msg"); m.innerHTML = `<div>${html}</div>`; m.hidden = false; }
function hideMessage() { $("#msg").hidden = true; }

function rebuild() {
  if (!state.payload) return;
  if (state.scene) scene3.remove(state.scene.group);
  state.scene = new LatticeScene(state.payload, state.palette, state.theme, { style: state.style });
  state.scene.orbit.visible = $("#btn-orbit").getAttribute("aria-pressed") === "true";
  applyXray();
  scene3.add(state.scene.group);
  if (state.selection != null && state.selection < state.scene.n) select(state.selection, false);
}

function applyXray() {
  if (!state.scene) return;
  for (const slot of ["yoke", "cavity", "coil", "ceramic"]) {
    const m = state.scene.materials[slot];
    if (!m) continue;
    m.transparent = state.xray;
    m.opacity = state.xray ? 0.25 : 1.0;
    m.depthWrite = !state.xray;
    m.needsUpdate = true;
  }
  $("#btn-xray").setAttribute("aria-pressed", String(state.xray));
}

async function load(sid) {
  state.session = sid;
  if (!sid) {
    showMessage(`<p>No lattice yet.</p><p class="muted">Read a deck in the workbench, or start with <code>lattix-view view deck.dat</code>.</p>`);
    return;
  }
  showMessage("loading the scene…");
  let payload;
  try {
    const site = state.site ? "&" + exportPanel.siteQuery() : "";
    payload = await getJSON(`${PREFIX}/api/scene?session=${encodeURIComponent(sid)}${site}`);
  } catch (e) {
    showMessage(`<p class="err">${e.message}</p><p class="muted">${e.status === 409 ? "read a deck first" : "open this page through the link the workbench printed"}</p>`);
    return;
  }
  const keepView = !!state.payload && state.payload.lattice.file === payload.lattice.file;
  state.payload = payload;
  state.selection = null;
  section.on = false;
  rebuild();
  measure.setScene(payload);
  toolButtons();
  window.lattix3d.exportPanel = exportPanel;
  const b = state.scene.bounds();
  overlays.build(b, payload.lattice.floor_y, payload.lattice.start);
  overlays.setGrid($("#btn-grid").getAttribute("aria-pressed") === "true");
  rig.setScene(b, payload.orbit);
  const L = payload.lattice;
  $("#deck-name").textContent = L.file ? L.file.split("/").pop() : L.name;
  $("#deck-info").textContent = `${L.format}  ·  ${L.n} elements  ·  ${L.total_length.toPrecision(6)} m`;
  hideMessage();
  if (!keepView) {
    rig.view("iso", b.sphere);
    rig.flyTo({ position: camera.position.clone(), target: rig.controls.target.clone(), up: camera.up.clone() }, false);
  }
  window.lattix3d.ready = true;
}

// -- bridge with the workbench ------------------------------------------------------------------------
state.bridge = new Bridge({
  "lattix:source": m => { if (m.session && (m.session !== state.session || !state.scene)) load(m.session); },
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
  "lattix:cursor": m => { if (typeof m.s === "number" && rig.mode === "follow") rig.follow.s = m.s; },
  "lattix:palette": m => {
    state.theme = m.theme === "dark" || (m.theme === "auto" && systemTheme() === "dark") ? "dark" : "light";
    state.palette = { ...paletteFor(state.theme), ...(m.colors || {}) };
    applyTheme();
  },
});

// -- controls ---------------------------------------------------------------------------------------
$("#btn-fit").addEventListener("click", () => views("iso"));
$("#btn-top").addEventListener("click", () => views("top"));
$("#btn-side").addEventListener("click", () => views("side"));
$("#btn-front").addEventListener("click", () => views("front"));
$("#btn-beam").addEventListener("click", () => views("beam"));
$("#btn-fly").addEventListener("click", () => rig.toggleFly());
$("#btn-follow").addEventListener("click", () => rig.toggleFollow());
$("#btn-style").addEventListener("click", ev => {
  state.style = state.style === "realistic" ? "schematic" : "realistic";
  ev.currentTarget.textContent = state.style === "realistic" ? "schematic" : "realistic";
  ev.currentTarget.setAttribute("aria-pressed", String(state.style === "schematic"));
  rebuild();
});
$("#btn-xray").addEventListener("click", () => { state.xray = !state.xray; applyXray(); });
$("#btn-labels").addEventListener("click", ev => { const mode = labels.cycle(); ev.currentTarget.textContent = `labels: ${mode}`; labels.setSelected(state.scene, state.selection); labels.setAll(state.scene, camera, rig.controls.target); });
$("#btn-orbit").addEventListener("click", ev => {
  const on = ev.currentTarget.getAttribute("aria-pressed") !== "true";
  ev.currentTarget.setAttribute("aria-pressed", String(on));
  if (state.scene) state.scene.orbit.visible = on;
});
$("#btn-grid").addEventListener("click", ev => {
  const on = ev.currentTarget.getAttribute("aria-pressed") !== "true";
  ev.currentTarget.setAttribute("aria-pressed", String(on));
  overlays.setGrid(on);
});
$("#btn-help").addEventListener("click", () => { $("#help").hidden = !$("#help").hidden; });
$("#btn-measure").addEventListener("click", () => measure.setTool("distance"));
$("#btn-angle").addEventListener("click", () => measure.setTool("angle"));
$("#btn-gap").addEventListener("click", () => measure.setTool("gap"));
$("#btn-probe").addEventListener("click", () => measure.setTool("probe"));
$("#btn-heading").addEventListener("click", () => measure.addHeading(state.selection));
$("#btn-section").addEventListener("click", () => { section.on = !section.on && state.selection != null; section.offset = 0; applySection(); });
$("#btn-list").addEventListener("click", () => { $("#measures").hidden = !$("#measures").hidden; });
$("#btn-export").addEventListener("click", () => { $("#exports").hidden = !$("#exports").hidden; $("#measures").hidden = true; });
$("#section-offset").addEventListener("input", ev => { section.offset = parseFloat(ev.target.value); applySection(); });
$("#section-axis").addEventListener("click", () => { section.axis = { s: "x", x: "y", y: "s" }[section.axis]; section.offset = 0; $("#section-offset").value = 0; applySection(); });
$("#search").addEventListener("keydown", ev => {
  if (ev.key === "Escape") { ev.target.blur(); return; }
  if (ev.key !== "Enter" || !state.scene) return;
  const q = ev.target.value.trim();
  if (!q) return;
  const el = state.scene.payload.el;
  let found = -1;
  if (/^#\d+$/.test(q)) found = el.i.indexOf(+q.slice(1));
  else if (/^s\s*=\s*[-\d.e+]+$/i.test(q)) {
    const s = parseFloat(q.split("=")[1]);
    found = el.s.findIndex((v, k) => k % 2 === 0 && v <= s && el.s[k + 1] >= s);
    if (found >= 0) found = found / 2;
  } else {
    const ql = q.toLowerCase(), start = state.selection == null ? 0 : state.selection + 1;
    for (let k = 0; k < state.scene.n; k++) { const i = (start + k) % state.scene.n; if (el.name[i].toLowerCase().includes(ql)) { found = i; break; } }
  }
  if (found < 0) { $("#status-text").textContent = `no element matching "${q}"`; return; }
  select(found, true);
  views("selection");
});

document.addEventListener("keydown", ev => {
  const tag = (ev.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "select" || tag === "textarea") return;
  if (rig.mode === "fly") rig.keys.add(ev.key.length === 1 ? ev.key.toLowerCase() : ev.key);
  const k = ev.key;
  if (k === "/") { ev.preventDefault(); $("#search").focus(); return; }
  if (k === "?") { $("#help").hidden = !$("#help").hidden; return; }
  if (k === "0") return views("iso");
  if (k === "f") return views("selection");
  if (k === "t") return views("top");
  if (k === "e" && rig.mode !== "fly") return views("side");
  if (k === "n") return views("front");
  if (k === "b") return views("beam");
  if (k === " ") { ev.preventDefault(); rig.toggleFly(); return; }
  if (rig.mode === "fly") { if (k === "Escape") rig.setMode("orbit"); return; }     // the letters belong to flying now
  if (k === "r") return void rig.toggleFollow();
  if (k === "j") return rig.stepFollow(ev.shiftKey ? -5 : -0.25);
  if (k === "k") return rig.stepFollow(ev.shiftKey ? 5 : 0.25);
  if (k === "Enter" && rig.mode === "follow") { rig.follow.playing = !rig.follow.playing; return; }
  if (k === "[") { rig.follow.rate = Math.max(0.25, rig.follow.rate / 2); return; }
  if (k === "]") { rig.follow.rate = Math.min(64, rig.follow.rate * 2); return; }
  if (k === "m") return void measure.setTool("distance");
  if (k === "a") return void measure.setTool("angle");
  if (k === "y") return void measure.setTool("gap");
  if (k === "p") return void measure.setTool("probe");
  if (k === "h") return measure.addHeading(state.selection);
  if (k === "c") return $("#btn-section").click();
  if (k === "C") { if (section.on) $("#section-axis").click(); return; }
  if (k === "Delete" || k === "Backspace") return measure.removeLast();
  if (k === "L") return $("#btn-list").click();
  if (k === "v") return $("#btn-style").click();
  if (k === "x") return $("#btn-xray").click();
  if (k === "l") return $("#btn-labels").click();
  if (k === "o") return $("#btn-orbit").click();
  if (k === "g") return $("#btn-grid").click();
  if (k === "ArrowRight") { ev.preventDefault(); return step(1, ev.shiftKey); }
  if (k === "ArrowLeft") { ev.preventDefault(); return step(-1, ev.shiftKey); }
  if (k === "Escape") {
    if (rig.mode !== "orbit") { rig.setMode("orbit"); return; }
    if (measure.tool) { measure.setTool(measure.tool); return; }
    $("#help").hidden = true; select(null, true); return;
  }
  if (state.bridge && state.bridge.embedded) state.bridge.key(ev);
});
document.addEventListener("keyup", ev => { rig.keys.delete(ev.key.length === 1 ? ev.key.toLowerCase() : ev.key); });
window.addEventListener("blur", () => rig.keys.clear());
if (!embedded) {
  const link = $("#workbench-link");
  link.hidden = false;
  link.href = withToken("/") + (session ? "&session=" + encodeURIComponent(session) : "");
}

applyTheme();
load(session);
if (state.bridge.embedded) state.bridge.ready();
