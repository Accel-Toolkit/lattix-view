"""Every deck renders: the page becomes ready, draws every element, answers a hover with the element's
name, and keeps the console clean."""
from __future__ import annotations

import time
from pathlib import Path

import pytest

from tests.e2e.conftest import SMOKE_DECKS, thick_element


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
        x, y = o.evaluate(f"window.lattix3d.screenPosOf({i}, 'c')")
        o.page.mouse.move(x, y)
        time.sleep(0.3)
        tip = o.evaluate("document.querySelector('#tip').hidden ? '' : document.querySelector('#tip').textContent")
        assert payload["el"]["name"][i] in tip, f"tooltip at the framed element reads {tip!r}"
        o.page.keyboard.press("Escape")
        o.page.keyboard.press("0")
        o.settle()
    stem = Path(deck).stem
    o.screenshot(f"smoke_{stem}.png")
    assert o.errors == []
