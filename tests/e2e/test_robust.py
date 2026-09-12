"""The page under trouble: a lost and restored graphics context, a browser without WebGL (the survey
stays reachable), and the diagnostics text."""
from __future__ import annotations

import time

NO_WEBGL = """(() => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    return String(type).startsWith("webgl") ? null : orig.call(this, type, ...rest);
  };
})();"""


def test_context_loss_and_restore(open_view):
    o = open_view("helix/csr_chicane.dat")
    o.settle()
    o.evaluate("window.__lose = window.lattix3d.rig.renderer.getContext().getExtension('WEBGL_lose_context'); "
               "window.__lose.loseContext()")
    time.sleep(0.3)
    assert o.evaluate("window.lattix3d.state.contextLost")
    assert "context was lost" in o.evaluate("document.querySelector('#msg').textContent")
    o.evaluate("window.__lose.restoreContext()")
    o.page.wait_for_function("!window.lattix3d.state.contextLost", timeout=30_000)
    f0 = o.stats()["frames"]
    o.settle(4)
    st = o.stats()
    assert st["frames"] > f0 and st["frame"]["calls"] > 0
    assert o.evaluate("document.querySelector('#msg').hidden")
    o.screenshot("restored.png")
    assert o.errors == []


def test_without_webgl_the_survey_stays_reachable(open_view):
    o = open_view("helix/csr_chicane.dat", init_script=NO_WEBGL, ready=False)
    o.page.wait_for_function("document.documentElement.getAttribute('data-webgl') === 'none'", timeout=60_000)
    msg = o.evaluate("document.querySelector('#msg').textContent")
    assert "WebGL is not available" in msg
    href = o.evaluate("document.querySelector('#msg a[download]').href")
    assert "/survey?" in href and "format=csv" in href
    r = o.page.request.get(href)
    assert r.ok and r.text().startswith("# lattix ")
    assert o.evaluate("typeof window.lattix3d") == "undefined"


def test_diagnostics_text(open_view):
    o = open_view("helix/dtl_section.dat")
    o.settle()
    text = o.evaluate("window.lattix3d.diagnostics()")
    for needle in ("lattix-view ", "deck: ", "gpu: ", "webgl: ", "scene: build ", "frame: ", "camera: orbit",
                   "browser: ", "log: clean"):
        assert needle in text, needle
    assert "dtl_section.dat" in text and "chunks" in text
    o.page.click("#btn-help")
    o.page.click("#btn-diag")
    assert o.evaluate("!document.querySelector('#diag').hidden")
    assert "deck:" in o.evaluate("document.querySelector('#diag').textContent")
    o.evaluate("console.warn('a warning for the log')")
    assert "warn: a warning for the log" in o.evaluate("window.lattix3d.diagnostics()")
    assert o.errors == []
