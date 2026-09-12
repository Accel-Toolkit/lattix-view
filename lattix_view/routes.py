"""The plugin's routes under ``/plugins/lattix_view/``: the page, its static files (the app modules
and the vendored three.js), the scene payload of a session, and a small info endpoint.  Handlers
have the shape of the workbench's own routes (``fn(handler, query, *groups)``)."""
from __future__ import annotations

import gzip
import json
from importlib import resources
from pathlib import Path

from lattix import __version__ as lattix_version
from lattix.ui.model import jsonable
from lattix.ui.server import ApiError

from lattix_view._version import __version__
from lattix_view.overrides import ModelRegistry, assignments, discover, load_all
from lattix_view.scene import KINDS, scene_view
from lattix_view.sizing import outer_size

PREFIX = "/plugins/lattix_view"
MODELS = ModelRegistry()              # the model files a rule named, served by handle only

#: the page's own policy: real script files, no inline script; blobs for exports and previews;
#: only the workbench may frame it
CSP = ("default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
       "media-src blob:; connect-src 'self'; font-src 'self' data:; worker-src 'self'; "
       "frame-ancestors 'self'; base-uri 'none'; form-action 'none'")

MIME: dict[str, str] = {
    ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".json": "application/json",
    ".png": "image/png", ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
    ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8",
    ".wasm": "application/wasm",
}


def static_root() -> Path:
    return Path(str(resources.files("lattix_view").joinpath("static")))


def three_manifest() -> dict:
    p = static_root() / "vendor" / "three" / "MANIFEST.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.is_file() else {}


def r_page(handler, query) -> None:
    body = (static_root() / "index.html").read_bytes()
    handler._send(200, body, "text/html; charset=utf-8", {"Content-Security-Policy": CSP})


def r_static(handler, query, rel: str) -> None:
    """A file under the package's ``static`` directory; the path must stay inside it."""
    root = static_root().resolve()
    if "\\" in rel or rel.startswith("/") or any(part in ("..", "") for part in rel.split("/")):
        raise ApiError(404, "not_found", f"no static file {rel!r}")
    p = (root / rel).resolve()
    if root not in p.parents or not p.is_file():
        raise ApiError(404, "not_found", f"no static file {rel!r}")
    etag = f'"{__version__}-{p.stat().st_mtime_ns}"'
    if handler.headers.get("If-None-Match") == etag:
        handler._send(304, b"", MIME.get(p.suffix, "application/octet-stream"), {"ETag": etag},
                      cache="private, max-age=86400")
        return
    handler._send(200, p.read_bytes(), MIME.get(p.suffix, "application/octet-stream"), {"ETag": etag},
                  cache="private, max-age=86400")


def _flag(query: dict, name: str, default: str = "1") -> bool:
    return (query.get(name) or [default])[0].lower() not in ("0", "false", "no")


SITE_KEYS = ("x0", "y0", "z0", "theta0", "phi0", "psi0")


def _site(query: dict) -> tuple[float, ...]:
    try:
        return tuple(float((query.get(k) or ["0"])[0]) for k in SITE_KEYS)
    except ValueError as exc:
        raise ApiError(400, "bad_request", f"site pose must be numbers: {exc}") from None


def r_scene(handler, query) -> None:
    """``?session=&side=src|dst&translation=&shift=1&children=1&x0=…&psi0=…`` -> the scene payload, in the
    site frame given by the start pose (metres, radians, as MAD-X SURVEY), gzip when accepted."""
    from lattix.ir.frames import site_frame

    sid = (query.get("session") or [""])[0]
    if not sid:
        raise ApiError(400, "bad_request", "session is required")
    s = handler._session(sid)
    tid = (query.get("translation") or [None])[0]
    side = "dst" if tid else "src"
    if tid:
        tr = s.translations.get(tid)
        if tr is None:
            raise ApiError(404, "not_found", f"no translation {tid!r}")
        loaded = tr.target
        if loaded is None:
            raise ApiError(409, "conflict", f"translation {tid!r} was not re-read; no target lattice to draw")
    else:
        loaded = s.source
        if loaded is None:
            raise ApiError(409, "conflict", "no source deck in this session")
    shift, children = _flag(query, "shift"), _flag(query, "children")
    pose = _site(query)
    key = (id(loaded), shift, children, pose)
    state = s.plugin_state.setdefault("lattix_view", {})
    with s.lock:
        cached = state.get("scene")
        if cached is None or cached[0] != key:
            payload = scene_view(loaded.lattice, loaded.placed, fmt=loaded.fmt, path=loaded.path, side=side,
                                 shift=shift, children=children, start=site_frame(*pose))
            payload["lattice"]["site"] = dict(zip(SITE_KEYS, pose, strict=True))
            payload["overrides"] = overrides_for(payload, loaded.path)
            body = json.dumps(jsonable(payload), allow_nan=False, separators=(",", ":")).encode("utf-8")
            state["scene"] = (key, body, gzip.compress(body, 6))
        _, body, packed = state["scene"]
    if "gzip" in (handler.headers.get("Accept-Encoding") or ""):
        handler._send(200, packed, "application/json; charset=utf-8",
                      {"Content-Encoding": "gzip", "Vary": "Accept-Encoding"})
    else:
        handler._send(200, body, "application/json; charset=utf-8")


def overrides_for(payload: dict, path: str | None, extra: list[Path] | None = None) -> dict:
    """The override block of a payload: the rule files that apply to this deck, resolved per element."""
    errors: list[str] = []
    files = discover(Path(path) if path else None, extra)
    rules = load_all(files, errors)
    if not rules:
        return {"files": [str(f) for f in files], "errors": errors, "models": {}, "assign": {}}
    el = payload["el"]
    elements = []
    for k in range(payload["lattice"]["n"]):
        prm = el["params"][k] or {}
        elements.append({"name": el["name"][k], "def": el["def"][k], "kind": KINDS[el["kind"][k]],
                         "sub": payload["subkinds"][el["sub"][k]],
                         "family": prm.get("family") or payload["families"][el["fam"][k]],
                         "format": payload["lattice"]["format"], "original_type": prm.get("original_type")})
    block = assignments(rules, elements, MODELS, PREFIX, errors)
    apply_family_rules(payload, block)
    block["files"] = [str(f) for f in files]
    block["errors"] = errors
    return block


def apply_family_rules(payload: dict, block: dict) -> None:
    """A ``family`` rule draws an element as a device of that family: the payload's family and outer
    size change here, on the server, so the page, the exports and the measurements agree."""
    el = payload["el"]
    families = payload["families"]
    for key, entry in block.get("assign", {}).items():
        fam = entry.get("family")
        if not fam or fam not in families:
            continue
        k = int(key)
        el["fam"][k] = families.index(fam)
        sub = payload["subkinds"][el["sub"][k]]
        lam = el["lambda_in"][k] or None
        size = outer_size("Instrument", sub, fam, float(el["L"][k]), (el["bore"][2 * k], el["bore"][2 * k + 1]),
                          el["params"][k] or {}, lam, (el["clear"][2 * k], el["clear"][2 * k + 1]))
        el["size"][3 * k:3 * k + 3] = [round(max(v, 1e-4), 5) for v in size]


def r_models(handler, query, handle: str) -> None:
    """A model file a rule named, by its handle; nothing else on the disk is reachable here."""
    p = MODELS.get(handle)
    if p is None or not p.is_file():
        raise ApiError(404, "not_found", "no such model")
    ctype = "model/gltf-binary" if p.suffix.lower() == ".glb" else "model/gltf+json"
    handler._send(200, p.read_bytes(), ctype, cache="private, max-age=60")


def r_info(handler, query) -> None:
    m = three_manifest()
    handler._json(200, {"name": "lattix_view", "version": __version__, "lattix": lattix_version,
                        "three": m.get("version"), "three_minified": m.get("minified"),
                        "schema": "lattix-view.scene/1"})


#: the static files are public (a browser fetches scripts without headers); everything else needs the token
ROUTES = [
    ("GET", r"/", r_page),
    ("GET", r"/index\.html", r_page),
    ("GET", r"/static/(.+)", r_static, True),
    ("GET", r"/api/scene", r_scene),
    ("GET", r"/models/([0-9a-f]{16})", r_models),
    ("GET", r"/api/info", r_info),
]
