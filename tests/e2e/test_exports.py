"""The exports: survey CSV and JSON through the workbench route, glTF, an OBJ zip and a PNG from the
page, the site pose reload, and (nightly) a turntable video and the fly-through frames."""
from __future__ import annotations

import json
import os
import zipfile

import pytest


def test_survey_scene_and_screenshot_exports(open_view):
    o = open_view("helix/csr_chicane.dat", downloads=True)
    page = o.page
    n = o.evaluate("window.lattix3d.state.scene.n")
    page.click("#btn-export")
    csv_path = o.download("#exports button[data-act='csv']")
    text = csv_path.read_text()
    assert text.startswith("# lattix ") and "in_X" in text.splitlines()[4] and text.count("\n") >= n
    doc = json.loads(o.download("#exports button[data-act='json']").read_text())
    assert doc["at"] == "all" and len(doc["rows"]) == n
    data = o.download("#exports button[data-act='glb']").read_bytes()
    assert data[:4] == b"glTF" and len(data) > 10_000
    chunk_len = int.from_bytes(data[12:16], "little")
    gltf = json.loads(data[20:20 + chunk_len])
    names = {nd.get("name") for nd in gltf["nodes"]}
    assert "reference_orbit" in names and sum(1 for nd in gltf["nodes"] if "extras" in nd) >= n - 5
    with zipfile.ZipFile(o.download("#exports button[data-act='obj']")) as z:
        assert len(z.namelist()) == 2 and z.testzip() is None
        obj = z.read([nm for nm in z.namelist() if nm.endswith(".obj")][0]).decode()
        assert obj.count("\no ") >= n - 5 and "usemtl yoke_Bend" in obj
    png = o.download("#exports button[data-act='png']:first-of-type").read_bytes()
    assert png[:8] == b"\x89PNG\r\n\x1a\n" and len(png) > 20_000
    # the site pose reloads the scene in the site frame and the survey follows it
    page.fill("#exports [data-site='x0']", "10")
    page.fill("#exports [data-site='theta0']", "90")
    page.click("#exports button[data-act='site']")
    page.wait_for_function("window.lattix3d.state.payload.lattice.site "
                           "&& window.lattix3d.state.payload.lattice.site.x0 === 10", timeout=60_000)
    el = o.evaluate("window.lattix3d.state.payload.el")
    assert abs(el["pin"][0] - 10) < 1e-9 and abs(el["pin"][2]) < 1e-9
    assert el["pout"][3 * (n - 1)] > 13                                  # theta0 = 90 degrees turns +Z into +X
    lines = o.download("#exports button[data-act='csv']").read_text().splitlines()
    cols, row = lines[4].split(","), lines[5].split(",")
    assert abs(float(row[cols.index("in_X")]) - 10) < 1e-9
    page.click("#exports button[data-act='site-reset']")
    page.wait_for_function("window.lattix3d.state.payload.lattice.site.x0 === 0", timeout=60_000)
    assert o.errors == []


@pytest.mark.slow
@pytest.mark.skipif(os.environ.get("LATTIX_VIEW_E2E_ALL") != "1",
                    reason="video export runs nightly (LATTIX_VIEW_E2E_ALL=1)")
def test_video_and_frames(open_view):
    o = open_view("helix/csr_chicane.dat", viewport=(960, 600), downloads=True)
    page = o.page
    o.evaluate("window.lattix3d.videoSeconds = 1.5")
    page.click("#btn-export")
    data = o.download("#exports button[data-act='turntable']", timeout=300_000).read_bytes()
    webm, mp4 = data[:4] == b"\x1a\x45\xdf\xa3", data[4:8] == b"ftyp"
    assert (webm or mp4) and len(data) > 2000
    with zipfile.ZipFile(o.download("#exports button[data-act='frames']", timeout=600_000)) as z:
        names = z.namelist()
        assert z.testzip() is None and "README.txt" in names and sum(1 for nm in names if nm.endswith(".png")) == 15
        first = [nm for nm in names if nm.endswith(".png")][0]
        assert z.read(first)[:8] == b"\x89PNG\r\n\x1a\n" and b"ffmpeg -framerate 10" in z.read("README.txt")
    assert o.errors == []
