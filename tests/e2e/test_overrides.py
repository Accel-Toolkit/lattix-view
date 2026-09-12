"""glTF overrides in the page: a unit cube replaces every quadrupole fitted to its length, bends are
hidden, a missing model keeps the procedural model and is reported."""
from __future__ import annotations

import pytest

from tests.test_overrides import cube_glb


@pytest.fixture
def rules(tmp_path, monkeypatch):
    (tmp_path / "models").mkdir()
    cube_glb(tmp_path / "models" / "cube.glb")
    (tmp_path / "rules.yaml").write_text(
        "version: 1\nmodels_dir: models\nrules:\n"
        "  - match: {kind: Quadrupole}\n    model: cube.glb\n    fit: length\n    materials: kind\n"
        "  - match: {kind: Bend}\n    hide: true\n"
        "  - match: {kind: Drift}\n    model: absent.glb\n", encoding="utf-8")
    monkeypatch.setenv("LATTIX_VIEW_OVERRIDES", str(tmp_path / "rules.yaml"))
    return tmp_path


def test_cube_replaces_quadrupoles_fitted_to_their_length(open_view, rules, workbench):
    workbench.sessions.pop("helix/bend_line.dat", None)                 # a fresh session reads the rules
    o = open_view("helix/bend_line.dat")
    page = o.page
    page.wait_for_function("window.lattix3d.overrideReport", timeout=60_000)
    report = o.evaluate("window.lattix3d.overrideReport")
    payload = o.payload()
    el, kinds = payload["el"], payload["kinds"]
    n = payload["lattice"]["n"]
    quads = [i for i in range(n) if kinds[el["kind"][i]] == "Quadrupole"]
    bends = [i for i in range(n) if kinds[el["kind"][i]] == "Bend"]
    oks = [r for r in report if r["status"] == "ok"]
    assert quads and len(oks) == len(quads) and all(r["i"] in quads for r in oks)
    assert len([r for r in report if r["status"] == "hidden"]) == len(bends)
    i = quads[0]
    extent = o.evaluate(f"""(() => {{
      const holder = window.lattix3d.state.scene.overrides.objects.find(h => h.name === '{el["name"][i]}:override');
      holder.updateMatrixWorld(true);
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      holder.traverse(m => {{
        if (!m.isMesh) return;
        const pos = m.geometry.getAttribute('position');
        for (let k = 0; k < pos.count; k++) {{
          const w = m.localToWorld(m.position.clone().set(pos.getX(k), pos.getY(k), pos.getZ(k)));
          [w.x, w.y, w.z].forEach((v, d) => {{ lo[d] = Math.min(lo[d], v); hi[d] = Math.max(hi[d], v); }});
        }}
      }});
      return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    }})()""")
    L = el["L"][i]
    assert all(abs(e - L) < 1e-6 for e in extent), f"cube extent {extent} for L = {L}"
    ov = payload["overrides"]
    assert any("not found" in e for e in ov["errors"])
    drawn = o.evaluate("window.lattix3d.state.scene.chunks.flatMap(c => c.levels.filter(Boolean)"
                       ".flatMap(l => l.meshes.flatMap(m => m.userData.ranges.map(r => r.i))))")
    drifts = [i for i in range(n) if kinds[el["kind"][i]] == "Drift"]
    assert all(i in drawn for i in drifts) and not any(i in drawn for i in quads) and not any(i in drawn for i in bends)
    assert o.evaluate("document.querySelector('#btn-models').textContent").startswith("models:")
    # the cube is picked as its element (from the top, where nothing else lies over it)
    page.keyboard.press("t")
    o.settle()
    x, y = o.evaluate(f"window.lattix3d.screenPosOf({i}, 'c')")
    page.mouse.move(x, y)
    o.settle()
    assert el["name"][i] in o.evaluate("document.querySelector('#tip').textContent")
    assert o.errors == []
