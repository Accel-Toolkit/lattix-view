"""The plugin inside the lattix workbench server: the page and its policy, the static files, the scene of
a session (plain and gzip), the info route, and the paths that must not resolve."""
from __future__ import annotations

import gzip
import http.client
import json

import pytest
from lattix.crossval import PUBLIC
from lattix.ui.plugins import compile_plugin
from lattix.ui.server import App, Settings, start_in_thread

from lattix_view.plugin import register
from lattix_view.routes import CSP


@pytest.fixture(scope="module")
def server():
    if not (PUBLIC / "helix" / "fodo_cell.dat").is_file():
        pytest.skip("lattix public decks not available")
    settings = Settings(root=PUBLIC, open_browser=False, quiet=True)
    app = App(settings, oracle_probe=lambda: {}, plugins=[compile_plugin(register())])
    srv, thread, port = start_in_thread(app, "127.0.0.1", 0)
    yield {"app": app, "port": port, "token": settings.token}
    srv.shutdown()
    srv.server_close()
    app.close()


def api(server, method, path, body=None, headers=None):
    conn = http.client.HTTPConnection("127.0.0.1", server["port"], timeout=60)
    h = {"X-Lattix-Token": server["token"], **(headers or {})}
    raw = None
    if body is not None:
        raw, h["Content-Type"] = json.dumps(body).encode(), "application/json"
    conn.request(method, path, body=raw, headers=h)
    resp = conn.getresponse()
    data = resp.read()
    conn.close()
    ctype = resp.getheader("Content-Type") or ""
    if resp.getheader("Content-Encoding") == "gzip":
        data = gzip.decompress(data)
    return resp.status, (json.loads(data) if ctype.startswith("application/json") and data else data), resp


def test_listed_page_and_static_files(server):
    status, listing, _ = api(server, "GET", "/api/plugins")
    assert status == 200 and [p["name"] for p in listing["plugins"]] == ["lattix_view"]
    assert listing["plugins"][0]["tabs"] == [{"id": "view3d", "label": "3D", "page": "/plugins/lattix_view/",
                                              "order": 50}]
    status, page, resp = api(server, "GET", "/plugins/lattix_view/")
    assert status == 200 and b"<title>lattix 3D</title>" in page and resp.getheader("Content-Security-Policy") == CSP
    assert api(server, "GET", "/plugins/lattix_view/index.html")[0] == 200
    status, js, resp = api(server, "GET", "/plugins/lattix_view/static/app/main.js")
    assert status == 200 and resp.getheader("Content-Type").startswith("text/javascript") and b"import" in js
    assert resp.getheader("Cache-Control") == "private, max-age=86400" and resp.getheader("ETag")
    etag = resp.getheader("ETag")
    assert api(server, "GET", "/plugins/lattix_view/static/app/main.js", headers={"If-None-Match": etag})[0] == 304
    status, three, resp = api(server, "GET", "/plugins/lattix_view/static/vendor/three/three.module.js")
    assert status == 200 and len(three) > 10_000 and resp.getheader("Content-Type").startswith("text/javascript")
    # scripts are fetched by the browser without the token header: the static route is public, the API is not
    conn = http.client.HTTPConnection("127.0.0.1", server["port"], timeout=60)
    conn.request("GET", "/plugins/lattix_view/static/app/main.js")
    assert conn.getresponse().status == 200
    conn.close()
    conn = http.client.HTTPConnection("127.0.0.1", server["port"], timeout=60)
    conn.request("GET", "/plugins/lattix_view/api/info")
    assert conn.getresponse().status == 403
    conn.close()
    for bad in ("static/../../pyproject.toml", "static/app/../../__init__.py", "static/%2e%2e/scene.py",
                "static//app/main.js", "static/app/nothing.js"):
        assert api(server, "GET", f"/plugins/lattix_view/{bad}")[0] == 404, bad
    status, info, _ = api(server, "GET", "/plugins/lattix_view/api/info")
    assert status == 200 and info["name"] == "lattix_view" and info["three"] and info["schema"] == "lattix-view.scene/1"


def test_scene_of_a_session_plain_gzip_and_errors(server):
    assert api(server, "GET", "/plugins/lattix_view/api/scene")[0] == 400
    assert api(server, "GET", "/plugins/lattix_view/api/scene?session=nope")[0] == 404
    status, r, _ = api(server, "POST", "/api/session")
    sid = r["session"]
    assert api(server, "GET", f"/plugins/lattix_view/api/scene?session={sid}")[0] == 409
    status, r, _ = api(server, "POST", "/api/read", body={"source": {"sample": "helix/bend_line.dat"}})
    sid = r["session"]
    status, sc, resp = api(server, "GET", f"/plugins/lattix_view/api/scene?session={sid}")
    assert status == 200 and sc["schema"] == "lattix-view.scene/1"
    assert sc["lattice"]["n"] == r["source"]["header"]["n_placed"]
    assert sc["lattice"]["side"] == "src" and sc["lattice"]["format"] == "tracewin"
    status, sc2, resp = api(server, "GET", f"/plugins/lattix_view/api/scene?session={sid}",
                            headers={"Accept-Encoding": "gzip"})
    assert status == 200 and resp.getheader("Content-Encoding") == "gzip" and sc2 == sc
    status, sc3, _ = api(server, "GET", f"/plugins/lattix_view/api/scene?session={sid}&shift=0&children=0")
    assert status == 200 and sc3["lattice"]["shift"] is False and sc3["lattice"]["children"] is False
    assert api(server, "GET", f"/plugins/lattix_view/api/scene?session={sid}&translation=t9")[0] == 404
    status, t, _ = api(server, "POST", "/api/translate", body={"session": sid, "format": "elegant"})
    status, tsc, _ = api(server, "GET", f"/plugins/lattix_view/api/scene?session={sid}&translation={t['translation']}")
    assert status == 200 and tsc["lattice"]["side"] == "dst" and tsc["lattice"]["format"] == "elegant"
    assert server["app"].sessions.get(sid).plugin_state["lattix_view"]["scene"][1]


def test_overrides_reach_the_scene_and_models_are_served_by_handle(server, tmp_path, monkeypatch):
    from tests.test_overrides import cube_glb

    (tmp_path / "models").mkdir()
    cube_glb(tmp_path / "models" / "cube.glb")
    (tmp_path / "rules.yaml").write_text(
        "version: 1\nmodels_dir: models\nrules:\n"
        "  - match: {kind: Quadrupole}\n    model: cube.glb\n    fit: length\n"
        "  - match: {kind: Bend}\n    hide: true\n"
        "  - match: {kind: Drift}\n    model: absent.glb\n", encoding="utf-8")
    monkeypatch.setenv("LATTIX_VIEW_OVERRIDES", str(tmp_path / "rules.yaml"))
    status, r, _ = api(server, "POST", "/api/read", body={"source": {"sample": "helix/bend_line.dat"}})
    sid = r["session"]
    status, sc, _ = api(server, "GET", f"/plugins/lattix_view/api/scene?session={sid}")
    ov = sc["overrides"]
    assert status == 200 and str(tmp_path / "rules.yaml") in ov["files"]
    kinds = [sc["kinds"][k] for k in sc["el"]["kind"]]
    quads = [str(i) for i, k in enumerate(kinds) if k == "Quadrupole"]
    bends = [str(i) for i, k in enumerate(kinds) if k == "Bend"]
    assert quads and all(ov["assign"][q]["fit"] == "length" and "model" in ov["assign"][q] for q in quads)
    assert all(ov["assign"][b] == {"hide": True, "rule": "rules.yaml"} for b in bends)
    assert any("not found" in e for e in ov["errors"])
    handle = ov["assign"][quads[0]]["model"]
    assert ov["models"][handle]["file"] == "cube.glb"
    assert ov["models"][handle]["url"] == f"/plugins/lattix_view/models/{handle}"
    status, data, resp = api(server, "GET", ov["models"][handle]["url"])
    assert status == 200 and data[:4] == b"glTF" and resp.getheader("Content-Type") == "model/gltf-binary"
    assert api(server, "GET", "/plugins/lattix_view/models/0000000000000000")[0] == 404
    assert api(server, "GET", "/plugins/lattix_view/models/../pyproject.toml")[0] == 404
