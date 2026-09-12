// The export panel: the survey table (from the workbench's own route, so Python is the single source),
// the scene as glTF or OBJ, a screenshot, a turntable or fly-through video, and the site pose.
import * as THREE from "../../vendor/three/three.module.js";
import { PREFIX, withToken } from "../api.js";
import { download, stamp } from "../export/download.js";
import { canvasToBlob, renderToCanvas } from "../export/capture.js";
import { flyThrough, turntable } from "../export/animate.js";
import { framesZip, recordPath, videoMime } from "../export/video.js";
import { toGLB, toObjZip } from "../export/scene.js";

const SITE_KEYS = ["x0", "y0", "z0", "theta0", "phi0", "psi0"];

export class ExportPanel {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;                       // {getScene, getState, renderer, scene3, camera, rig, session, onSite}
    root.innerHTML = `
      <div class="head"><b>Export</b><span class="spacer"></span><button data-act="close" title="hide the panel">×</button></div>
      <div class="row"><span class="lbl">survey table</span>
        <button data-act="csv" title="every element's entrance, centre, exit and body frames: X Y Z theta phi psi">CSV</button>
        <button data-act="json">JSON</button></div>
      <div class="row"><span class="lbl">scene</span>
        <button data-act="glb" title="binary glTF, one node per element with its name and s as extras">glTF</button>
        <button data-act="obj" title="OBJ with an MTL, in a zip">OBJ</button></div>
      <div class="row"><span class="lbl">image</span>
        <button data-act="png" data-scale="1">PNG 1×</button><button data-act="png" data-scale="2">2×</button><button data-act="png" data-scale="4">4×</button></div>
      <div class="row"><span class="lbl">video</span>
        <button data-act="turntable" title="the camera circles the lattice (8 s)">turntable</button>
        <button data-act="flythrough" title="ride the beam from start to end (12 s)">fly-through</button>
        <button data-act="frames" title="the fly-through as PNG frames in a zip, with the ffmpeg line">PNG frames</button>
        <span class="muted" id="video-mime"></span></div>
      <div class="row"><span class="lbl">site pose</span>
        <span class="muted">the start of the line in the site frame (MAD-X SURVEY): metres and degrees</span></div>
      <div class="row site">
        ${SITE_KEYS.map(k => `<label>${k}<input type="number" step="any" data-site="${k}" value="0"></label>`).join("")}
        <button data-act="site">apply</button><button data-act="site-reset">reset</button></div>
      <div class="muted" id="export-status"></div>`;
    root.querySelector("#video-mime").textContent = videoMime() ? `(${videoMime().split(";")[0]})` : "(no recorder in this browser: PNG frames only)";
    root.addEventListener("click", ev => {
      const b = ev.target.closest("button");
      if (!b) return;
      this.run(b.dataset.act, b).catch(e => this.status(`failed: ${e.message}`));
    });
  }

  status(text) { this.root.querySelector("#export-status").textContent = text; }
  site() { const out = {}; for (const k of SITE_KEYS) out[k] = parseFloat(this.root.querySelector(`[data-site="${k}"]`).value) || 0; return out; }
  setSite(site) { for (const k of SITE_KEYS) this.root.querySelector(`[data-site="${k}"]`).value = site[k] || 0; }

  /** The site pose as radians for the routes (the form takes degrees for the angles). */
  siteQuery() {
    const s = this.site();
    const rad = k => (s[k] || 0) * Math.PI / 180;
    return `x0=${s.x0 || 0}&y0=${s.y0 || 0}&z0=${s.z0 || 0}&theta0=${rad("theta0")}&phi0=${rad("phi0")}&psi0=${rad("psi0")}`;
  }

  async run(act, button) {
    const scene = this.ctx.getScene();
    const stem = scene ? (scene.payload.lattice.file || scene.payload.lattice.name).split("/").pop().replace(/\.[^.]+$/, "") : "lattice";
    if (act === "close") { this.root.hidden = true; return; }
    if (act === "site") { this.ctx.onSite(this.site()); return; }
    if (act === "site-reset") { this.setSite({}); this.ctx.onSite(this.site()); return; }
    if (!scene) { this.status("no lattice loaded"); return; }
    if (act === "csv" || act === "json") {
      const url = withToken(`/api/session/${encodeURIComponent(this.ctx.session())}/survey?at=all&children=1&format=${act}&${this.siteQuery()}`);
      const a = document.createElement("a"); a.href = url; a.download = `${stem}.survey.${act}`; document.body.appendChild(a); a.click(); a.remove();
      this.status(`survey ${act.toUpperCase()} requested from the workbench`);
      return;
    }
    const palette = this.ctx.getState().palette;
    if (act === "glb") {
      this.status("building the glTF…");
      const blob = await toGLB(scene, palette, { style: "realistic" });
      download(blob, `${stem}.glb`);
      this.status(`glTF: ${(blob.size / 1e6).toFixed(1)} MB, ${scene.n} elements`);
      return;
    }
    if (act === "obj") {
      this.status("writing the OBJ…");
      const blob = toObjZip(scene, palette, { style: "realistic" }, stem);
      download(blob, `${stem}.obj.zip`);
      this.status(`OBJ + MTL: ${(blob.size / 1e6).toFixed(1)} MB`);
      return;
    }
    if (act === "png") {
      const scale = +button.dataset.scale;
      const caption = [`${stem}  ·  ${scene.payload.lattice.format}  ·  ${scene.n} elements  ·  ${scene.payload.lattice.total_length.toPrecision(6)} m`, `lattix-view ${scene.payload.versions.lattix_view}  ·  ${new Date().toISOString().slice(0, 19).replace("T", " ")}`];
      const canvas = renderToCanvas(this.ctx.renderer, this.ctx.scene3, this.ctx.camera, scale, caption, this.ctx.getState().theme);
      const blob = await canvasToBlob(canvas);
      download(blob, `${stem}_${stamp()}.png`);
      this.status(`PNG ${canvas.width}×${canvas.height}`);
      return;
    }
    if (act === "turntable" || act === "flythrough" || act === "frames") {
      const rig = this.ctx.rig;
      const b = scene.bounds();
      const secs = (window.lattix3d && window.lattix3d.videoSeconds) || null;     // the tests shorten the clips
      const path = act === "turntable" ? turntable({ centre: b.sphere.center, radius: b.sphere.radius * 2.2, seconds: secs || 8, fps: 30 })
                                       : flyThrough({ rig, seconds: secs || 12, fps: secs ? 10 : 30 });
      const saved = { position: this.ctx.camera.position.clone(), target: rig.controls.target.clone(), up: this.ctx.camera.up.clone() };
      const mode = rig.mode;
      rig.setMode("orbit");
      rig.controls.enabled = false;
      try {
        if (act === "frames") {
          const blob = await framesZip(this.ctx.renderer, this.ctx.scene3, this.ctx.camera, path, stem, { onProgress: u => this.status(`frames ${(u * 100).toFixed(0)} %`) });
          download(blob, `${stem}_frames.zip`);
          this.status(`PNG frames: ${(blob.size / 1e6).toFixed(1)} MB`);
        } else {
          const { blob, ext } = await recordPath(this.ctx.renderer, this.ctx.scene3, this.ctx.camera, path, { onProgress: u => this.status(`recording ${(u * 100).toFixed(0)} %`) });
          download(blob, `${stem}_${act}.${ext}`);
          this.status(`${act}: ${(blob.size / 1e6).toFixed(1)} MB ${ext}`);
        }
      } finally {
        rig.controls.enabled = true;
        rig.flyTo(saved, false);
        rig.setMode(mode);
      }
      return;
    }
  }
}

export { THREE };
