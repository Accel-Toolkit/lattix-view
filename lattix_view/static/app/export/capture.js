// Screenshots at 1 to 4 times the canvas size, rendered into an offscreen multisampled target, read
// back and composed on a 2D canvas with a caption, so the drawing buffer is never preserved.
import * as THREE from "../../vendor/three/three.module.js";

export const MAX_PIXELS = 64e6;

/** Render the scene at `scale` and return a canvas with the image and the caption lines drawn on it. */
export function renderToCanvas(renderer, scene3, camera, scale, caption = [], theme = "dark") {
  const w0 = renderer.domElement.width / renderer.getPixelRatio(), h0 = renderer.domElement.height / renderer.getPixelRatio();
  let w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const gl = renderer.getContext();
  const maxSize = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), 16384);
  const shrink = Math.min(1, maxSize / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
  w = Math.floor(w * shrink); h = Math.floor(h * shrink);
  const target = new THREE.WebGLRenderTarget(w, h, { samples: 4, type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace });
  const aspect = camera.aspect;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setRenderTarget(target);
  renderer.render(scene3, camera);
  const pixels = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(target, 0, 0, w, h, pixels);
  renderer.setRenderTarget(null);
  target.dispose();
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  // flip rows (GL reads bottom-up) into an ImageData
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(w, h);
  const row = w * 4;
  for (let y = 0; y < h; y++) img.data.set(pixels.subarray((h - 1 - y) * row, (h - y) * row), y * row);
  ctx.putImageData(img, 0, 0);
  if (caption.length) {
    const fs = Math.round(13 * scale);
    ctx.font = `${fs}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = "top";
    const pad = Math.round(8 * scale);
    const widths = caption.map(t => ctx.measureText(t).width);
    const bw = Math.max(...widths) + 2 * pad, bh = caption.length * fs * 1.4 + 2 * pad;
    ctx.fillStyle = theme === "dark" ? "rgba(17,22,31,0.8)" : "rgba(248,250,252,0.85)";
    ctx.fillRect(pad, h - bh - pad, bw, bh);
    ctx.fillStyle = theme === "dark" ? "#dbe2eb" : "#1e293b";
    caption.forEach((t, k) => ctx.fillText(t, 2 * pad, h - bh - pad + pad + k * fs * 1.4));
  }
  return canvas;
}

export function canvasToBlob(canvas, type = "image/png") {
  return new Promise(resolve => canvas.toBlob(resolve, type));
}
