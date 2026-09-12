"""Screenshot regression: the canvas of a few decks in the canonical views, at a fixed size and pixel
ratio, against the goldens in `tests/e2e/screens/`.  A golden is missing until someone generates it
with LATTIX_VIEW_UPDATE_GOLDENS=1 (the nightly job does, on Linux); the comparison tolerates half a
percent of pixels differing by more than 24 levels, and writes the difference image beside the
artifacts when it fails."""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from tests.e2e.conftest import ARTIFACTS
from tests.e2e.png import compare

GOLDENS = Path(__file__).resolve().parent / "screens"
UPDATE = os.environ.get("LATTIX_VIEW_UPDATE_GOLDENS") == "1"
TOLERANCE = 0.005
HIDE = "#bar, #status, #help, #view .labels, #tip { visibility: hidden !important; }"
CASES = [("helix/csr_chicane.dat", "iso"), ("helix/csr_chicane.dat", "top"), ("helix/dtl_section.dat", "side"),
         ("flame/ALL_lattice.lat", "iso"), ("flame/ALL_lattice.lat", "top")]


@pytest.mark.slow
@pytest.mark.parametrize("deck,view", CASES)
def test_canvas_matches_the_golden(open_view, deck, view):
    o = open_view(deck, viewport=(640, 400))
    o.page.add_style_tag(content=HIDE)
    o.evaluate(f"window.lattix3d.view('{view}')")
    o.settle(4)
    name = f"{Path(deck).stem}_{view}.png"
    shot = o.page.locator("#view canvas").screenshot()
    (ARTIFACTS / name).write_bytes(shot)
    golden = GOLDENS / name
    if UPDATE or not golden.is_file():
        if UPDATE:
            golden.write_bytes(shot)
        pytest.skip(f"golden {'written' if UPDATE else 'missing'}: {golden.name}")
    fraction, diff = compare(golden.read_bytes(), shot)
    if fraction > TOLERANCE:
        (ARTIFACTS / f"diff_{name}").write_bytes(diff)
    assert fraction <= TOLERANCE, f"{fraction * 100:.2f} % of pixels differ from {golden.name}"
    assert o.errors == []
