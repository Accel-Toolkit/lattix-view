// The measurements panel: a table of records with locate and delete, copy as TSV or JSON, clear.
import { describe } from "../math/measure.js";

export class MeasuresPanel {
  constructor(root, measure, getScene, onLocate) {
    this.root = root;
    this.measure = measure;
    this.getScene = getScene;
    this.onLocate = onLocate;
    root.innerHTML = `
      <div class="head"><b>Measurements</b><span class="spacer"></span>
        <button data-act="tsv" title="copy as tab-separated text">copy TSV</button>
        <button data-act="json">copy JSON</button>
        <button data-act="clear">clear</button>
        <button data-act="close" title="hide the panel">×</button></div>
      <div class="hint">m distance · a angle · y gap between two elements · p probe · h heading of the selection · Delete removes the last</div>
      <table class="list" aria-live="polite"><tbody></tbody></table>`;
    root.addEventListener("click", ev => {
      const b = ev.target.closest("button");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "tsv") this.copy(this.measure.tsv());
      else if (act === "json") this.copy(this.measure.json());
      else if (act === "clear") this.measure.clear();
      else if (act === "close") this.root.hidden = true;
      else if (act === "del") this.measure.remove(+b.dataset.id);
      else if (act === "go") this.onLocate(+b.dataset.id);
    });
  }

  copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => this._fallback(text));
    else this._fallback(text);
  }
  _fallback(text) {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) { /* nothing to do */ }
    ta.remove();
  }

  render() {
    const scene = this.getScene();
    const names = scene ? scene.payload.el.name : [];
    const body = this.root.querySelector("tbody");
    body.innerHTML = "";
    for (const r of this.measure.records) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="num">${r.id}</td><td>${r.rec.type}</td><td class="text"></td>
        <td><button data-act="go" data-id="${r.id}" title="fly to it">go</button><button data-act="del" data-id="${r.id}" title="remove">×</button></td>`;
      tr.querySelector(".text").textContent = describe(r.rec, names);
      body.appendChild(tr);
    }
    if (this.measure.records.length) this.root.hidden = false;
  }
}
