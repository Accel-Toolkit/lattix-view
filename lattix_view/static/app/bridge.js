// The link to the lattix workbench when this page runs as one of its tabs: messages are exchanged
// with the parent window over postMessage, same origin only, in both directions
// (lattix docs/ui.md "Plugins").  Standalone, every send is a no-op.
export class Bridge {
  constructor(handlers) {
    this.embedded = new URLSearchParams(location.search).get("embedded") === "1" && window.parent !== window;
    this.handlers = handlers || {};
    if (!this.embedded) return;
    window.addEventListener("message", ev => {
      if (ev.origin !== location.origin || ev.source !== window.parent || !ev.data || typeof ev.data.type !== "string") return;
      const fn = this.handlers[ev.data.type];
      if (fn) { try { fn(ev.data); } catch (e) { console.error(ev.data.type, e); } }
    });
  }
  send(msg) {
    if (this.embedded) window.parent.postMessage(msg, location.origin);
  }
  ready() { this.send({ type: "plugin:ready" }); }
  select(index, side = "src") { this.send({ type: "plugin:selection", selection: index == null ? null : { side, index } }); }
  hover(hover) { this.send({ type: "plugin:hover", hover }); }
  key(ev) { this.send({ type: "plugin:key", key: ev.key, shiftKey: ev.shiftKey, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey }); }
}
