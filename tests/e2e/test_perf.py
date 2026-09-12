"""Budgets on the largest public deck (FRIB, 2549 elements): build time, draw calls and triangles per
frame from afar and up close, pick time, the level switch, and the lazy path that builds full detail on
demand and keeps a bounded number of chunks."""
from __future__ import annotations

DECK = "flame/ALL_lattice.lat"
BUILD_MS = 3000
CALLS = 300
TRIANGLES = 1_500_000
PICK_MS = 4.0
KEEP = 32


def test_budgets_from_afar_and_up_close(open_view):
    o = open_view(DECK)
    o.settle()
    st = o.stats()
    assert st["buildMs"] <= BUILD_MS, f"build {st['buildMs']:.0f} ms"
    assert st["chunks"] >= 10 and st["levels"][2] == st["chunks"], st["levels"]
    assert st["frame"]["calls"] <= CALLS and st["frame"]["triangles"] <= TRIANGLES, st["frame"]
    assert st["distances"][0] < st["distances"][1] < 1e9
    o.evaluate("window.lattix3d.select(1200)")
    o.page.keyboard.press("f")
    o.settle()
    st = o.stats()
    assert st["levels"][0] >= 1 and st["frame"]["triangles"] > 10_000, st
    assert st["frame"]["calls"] <= CALLS and st["frame"]["triangles"] <= TRIANGLES, st["frame"]
    pick_ms = o.evaluate("window.lattix3d.pickMs(40)")
    assert pick_ms <= PICK_MS, f"pick {pick_ms:.2f} ms"
    o.page.keyboard.press("v")
    o.settle()
    st = o.stats()
    assert st["levels"][1] == st["chunks"] and st["frame"]["calls"] <= CALLS
    assert o.errors == []


def test_lazy_scene_builds_full_detail_on_demand_and_trims(open_view):
    o = open_view(DECK, query="&static=1&lazy=1")
    o.settle()
    st = o.stats()
    assert st["lazy"] and st["levels"][2] == st["chunks"] and st["buildMs"] <= BUILD_MS / 2
    o.evaluate("window.lattix3d.select(1200)")
    o.page.keyboard.press("f")
    o.settle()
    built = o.evaluate("window.lattix3d.state.scene.chunks.filter(c => c.levels[0]).length")
    assert o.stats()["levels"][0] >= 1 and 1 <= built <= KEEP
    n = o.evaluate("window.lattix3d.state.scene.n")
    for i in range(0, n, 60):
        o.evaluate(f"window.lattix3d.select({i})")
        o.page.keyboard.press("f")
        o.settle(1)
    built = o.evaluate("window.lattix3d.state.scene.chunks.filter(c => c.levels[0]).length")
    assert built <= KEEP, f"{built} full-detail chunks kept"
    assert o.errors == []
