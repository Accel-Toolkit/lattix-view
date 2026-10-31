"""Every deck renders: the page becomes ready, draws every element, answers a hover with the element's
name, and keeps the console clean."""
from __future__ import annotations

import time
from pathlib import Path

import pytest

from tests.e2e.conftest import SMOKE_DECKS, hover_point, thick_element

#: the tooltip under the pointer, empty when it is hidden
TIP = "document.querySelector('#tip').hidden ? '' : document.querySelector('#tip').textContent"


@pytest.mark.parametrize("deck", SMOKE_DECKS)
def test_deck_renders_and_hovers(open_view, deck):
    o = open_view(deck)
    o.settle()
    st = o.stats()
    payload = o.payload()
    n = payload["lattice"]["n"]
    assert st["elements"] == n and st["frames"] > 0 and st["frame"]["calls"] > 0
    assert st["frame"]["calls"] <= 300, f"{st['frame']['calls']} draw calls"
    assert str(n) in o.evaluate("document.querySelector('#deck-info').textContent")
    drawn = o.evaluate("window.lattix3d.state.scene.chunks.reduce((t, c) => t + (c.end - c.start), 0)")
    assert drawn == n
    i = thick_element(payload)
    if i >= 0:
        o.evaluate(f"window.lattix3d.select({i})")
        o.page.keyboard.press("f")
        o.settle()
        x, y = hover_point(o, i)
        o.page.mouse.move(x, y)
        time.sleep(0.3)
        tip = o.evaluate(TIP)
        assert payload["el"]["name"][i] in tip, f"tooltip at the framed element reads {tip!r}"
        o.page.keyboard.press("Escape")
        o.page.keyboard.press("0")
        o.settle()
    stem = Path(deck).stem
    o.screenshot(f"smoke_{stem}.png")
    assert o.errors == []


def test_an_element_that_is_only_glass_answers_the_pointer(open_view):
    """A cavity with no frequency to size it is a glass box and nothing else."""
    o = open_view("pals/rf_voltage.pals.yaml")
    o.settle()
    assert o.evaluate("window.lattix3d.state.scene.pickables.length") == 0
    x, y = o.evaluate("window.lattix3d.screenPosOf(0, 'c')")
    o.page.mouse.move(x, y)
    time.sleep(0.3)
    assert "cav" in o.evaluate(TIP)
    o.page.mouse.click(x, y)
    assert o.evaluate("window.lattix3d.state.selection") == 0
    assert o.errors == []


#: the first pixel where glass stands in front of another element's hardware: [that element's name, x, y]
GLASS_OVER_HARDWARE = """async () => {
  const main = [...document.scripts].map(s => s.src).find(s => s.includes("main.js"));
  const THREE = await import(new URL("../vendor/three/three.module.js", main).href);
  const sc = window.lattix3d.state.scene, ray = new THREE.Raycaster();
  const r = document.querySelector("canvas").getBoundingClientRect();
  for (let a = 0; a < 180; a++) for (let b = 0; b < 120; b++) {
    const x = (a + 0.5) / 180, y = (b + 0.5) / 120;
    ray.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), window.lattix3d.camera);
    const solid = ray.intersectObjects(sc.pickables, false)[0];
    const glass = ray.intersectObjects(sc.glassPickables, false)[0];
    if (solid && glass && glass.distance < solid.distance && sc.elementAt(solid) !== sc.elementAt(glass))
      return [sc.payload.el.name[sc.elementAt(solid)], r.left + x * r.width, r.top + y * r.height];
  }
  return null;
}"""


def test_glass_does_not_hide_the_hardware_behind_it(open_view):
    o = open_view("xtrack/elena.seq")
    o.settle()
    o.evaluate("window.lattix3d.view('iso')")
    o.settle(4)
    found = o.page.evaluate(GLASS_OVER_HARDWARE)
    assert found, "no pixel of this view has glass in front of another element's hardware"
    name, x, y = found
    o.page.mouse.move(x, y)
    time.sleep(0.3)
    assert name in o.evaluate(TIP)
