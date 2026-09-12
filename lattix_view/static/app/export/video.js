// Video of a camera path: MediaRecorder on the canvas stream (WebM, or MP4 where the browser offers it),
// one frame requested per rendered frame at a fixed time step; PNG sequence in a zip as the fallback.
import { canvasToBlob, renderToCanvas } from "./capture.js";
import { zip } from "../math/zip.js";

export function videoMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

/** Play a path on the rig's camera while recording the canvas; returns a Blob and its extension. */
export async function recordPath(renderer, scene3, camera, path, { onProgress } = {}) {
  const mime = videoMime();
  if (!mime) throw new Error("this browser cannot record video; use the PNG sequence instead");
  const stream = renderer.domElement.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
  const chunks = [];
  rec.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  const done = new Promise(resolve => { rec.onstop = resolve; });
  rec.start();
  const dt = 1000 / path.fps;
  for (let k = 0; k <= path.frames; k++) {
    const pose = path.poseAt(k);
    camera.up.copy(pose.up);
    camera.position.copy(pose.position);
    camera.lookAt(pose.target);
    renderer.render(scene3, camera);
    if (track.requestFrame) track.requestFrame();
    if (onProgress) onProgress(k / path.frames);
    await new Promise(r => setTimeout(r, dt));                // real time: the recorder stamps wall-clock
  }
  rec.stop();
  await done;
  return { blob: new Blob(chunks, { type: mime }), ext: mime.includes("mp4") ? "mp4" : "webm" };
}

/** The frames of a path as PNG files in a zip (at most 300 frames, at most 1920 px wide). */
export async function framesZip(renderer, scene3, camera, path, stem, { onProgress, maxFrames = 300 } = {}) {
  const n = Math.min(path.frames, maxFrames);
  const entries = [];
  const w = renderer.domElement.width / renderer.getPixelRatio();
  const scale = Math.min(1, 1920 / w);
  for (let k = 0; k < n; k++) {
    const pose = path.poseAt(Math.round(k * path.frames / n));
    camera.up.copy(pose.up);
    camera.position.copy(pose.position);
    camera.lookAt(pose.target);
    const canvas = renderToCanvas(renderer, scene3, camera, scale);
    const blob = await canvasToBlob(canvas);
    entries.push({ name: `${stem}_${String(k).padStart(4, "0")}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
    if (onProgress) onProgress(k / n);
  }
  entries.push({ name: "README.txt", data: `${n} frames at ${path.fps} fps.\nffmpeg -framerate ${path.fps} -i ${stem}_%04d.png -c:v libx264 -pix_fmt yuv420p -movflags +faststart ${stem}.mp4\n` });
  return new Blob([zip(entries)], { type: "application/zip" });
}
