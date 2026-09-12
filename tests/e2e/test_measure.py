"""The tools on the chicane: a snapped distance equals the centre distance, an angle between two bends,
a probe on the floor, the heading of a selection, the section plane, the TSV, the camera modes, labels
and search."""
from __future__ import annotations

import math
import time


def test_measurements_modes_labels_and_search(open_view):
    o = open_view("helix/csr_chicane.dat")
    page = o.page
    payload = o.payload()
    el, kinds = payload["el"], payload["kinds"]
    n = payload["lattice"]["n"]
    bends = [i for i in range(n) if kinds[el["kind"][i]] == "Bend"]
    quads = [i for i in range(n) if kinds[el["kind"][i]] == "Quadrupole"]
    assert len(bends) >= 2 and len(quads) >= 2
    page.keyboard.press("t")
    o.settle()
    # a distance between the centres of two quadrupoles, snapped to their frame points
    page.keyboard.press("m")
    a, b = quads[0], quads[1]
    for i in (a, b):
        x, y = o.evaluate(f"window.lattix3d.screenPosOf({i}, 'c')")
        page.mouse.move(x, y)
        time.sleep(0.15)
        page.mouse.click(x, y)
    recs = o.evaluate("window.lattix3d.measure.records.map(r => r.rec)")
    assert len(recs) == 1 and recs[0]["type"] == "distance"
    r = recs[0]
    chord = math.dist(el["pc"][3 * a:3 * a + 3], el["pc"][3 * b:3 * b + 3])
    assert abs(r["chord"] - chord) < 1e-6 and r["a"]["kind"] == "c" and r["b"]["kind"] == "c"
    sc = [(el["s"][2 * i] + el["s"][2 * i + 1]) / 2 for i in (a, b)]
    assert abs(abs(r["ds"]) - abs(sc[1] - sc[0])) < 1e-6
    # an angle between the first two bends' axes
    page.keyboard.press("a")
    for i in bends[:2]:
        x, y = o.evaluate(f"window.lattix3d.screenPosOf({i}, 'c')")
        page.mouse.click(x, y)
        time.sleep(0.15)
    recs = o.evaluate("window.lattix3d.measure.records.map(r => r.rec)")
    assert len(recs) == 2 and recs[1]["type"] == "angle" and abs(recs[1]["alpha"]) > 1e-4
    # a probe on the floor, far from any element
    page.keyboard.press("p")
    page.mouse.click(60, 700)
    time.sleep(0.15)
    recs = o.evaluate("window.lattix3d.measure.records.map(r => r.rec)")
    assert len(recs) == 3 and recs[2]["type"] == "probe"
    page.keyboard.press("Escape")
    # heading of a selected bend, then the section plane through it
    o.evaluate(f"window.lattix3d.select({bends[0]})")
    page.keyboard.press("h")
    recs = o.evaluate("window.lattix3d.measure.records.map(r => r.rec)")
    assert len(recs) == 4 and recs[3]["type"] == "heading"
    page.keyboard.press("c")
    assert o.evaluate("!!window.lattix3d.measure.section.plane")
    page.keyboard.press("c")
    assert not o.evaluate("!!window.lattix3d.measure.section.plane")
    tsv = o.evaluate("window.lattix3d.measure.tsv()")
    assert tsv.count("\n") == 5 and "distance" in tsv and "angle" in tsv
    # camera modes
    page.keyboard.press(" ")
    assert o.evaluate("window.lattix3d.rig.mode") == "fly"
    page.keyboard.press("Escape")
    page.keyboard.press("r")
    assert o.evaluate("window.lattix3d.rig.mode") == "follow"
    page.keyboard.press("k")
    assert o.evaluate("window.lattix3d.rig.follow.s") > 0
    page.keyboard.press("Escape")
    assert o.evaluate("window.lattix3d.rig.mode") == "orbit"
    # labels and search
    page.keyboard.press("l")
    o.settle()
    assert o.evaluate("document.querySelectorAll('.el-label').length") >= 1
    page.fill("#search", el["name"][quads[1]])
    page.press("#search", "Enter")
    assert o.evaluate("window.lattix3d.state.selection") == quads[1]
    page.keyboard.press("Escape")
    page.fill("#search", f"#{el['i'][bends[1]]}")
    page.press("#search", "Enter")
    assert o.evaluate("window.lattix3d.state.selection") == bends[1]
    page.keyboard.press("Escape")                                       # leave the search box
    # the schematic style switches the level everywhere without a rebuild
    page.keyboard.press("v")
    o.settle()
    st = o.stats()
    assert st["levels"][1] == st["chunks"]
    page.keyboard.press("v")
    o.settle()
    assert o.stats()["levels"][0] == st["chunks"]
    assert o.errors == []
