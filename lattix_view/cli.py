"""``lattix-view``: open a deck in the 3D viewer, dump its scene payload, or check the installation."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from lattix_view._version import __version__


def _kv(items: list[str] | None) -> dict:
    out: dict = {}
    for it in items or []:
        k, _, v = it.partition("=")
        try:
            out[k] = float(v)
        except ValueError:
            out[k] = v
    return out


def cmd_view(a) -> int:
    from lattix.ui.plugins import compile_plugin
    from lattix.ui.server import Settings, serve, stable_token

    from lattix_view.plugin import register

    deck = Path(a.deck).expanduser().resolve()
    if not deck.is_file():
        print(f"lattix-view: no such deck: {a.deck}", file=sys.stderr)
        return 2
    root = Path(a.root).expanduser().resolve() if a.root else deck.parent
    settings = Settings(host=a.host, port=a.port, root=root, any_path=a.any_path, open_browser=not a.no_browser,
                        token=stable_token(rotate=a.new_token), open_path="/plugins/lattix_view/")
    options = {"format": a.format} if a.format else {}
    if a.read_option:
        options["options"] = _kv(a.read_option)
    return serve(settings, check=a.check, deck=str(deck), deck_options=options,
                 plugins=[compile_plugin(register())])


def cmd_scene(a) -> int:
    from lattix.formats import read
    from lattix.ir.walk import propagate
    from lattix.ui.model import jsonable

    from lattix_view.scene import scene_view

    lat, rep = read(a.deck, a.format, **_kv(a.read_option))
    placed = propagate(lat)
    payload = scene_view(lat, placed, fmt=rep.source_format or a.format or "", path=a.deck,
                         shift=not a.no_shift, children=not a.no_children)
    text = json.dumps(jsonable(payload), allow_nan=False, indent=None if a.compact else 1)
    if a.out:
        Path(a.out).write_text(text, encoding="utf-8")
        n = payload["lattice"]["n"]
        print(f"{n} elements, {len(text)} bytes -> {a.out}")
    else:
        print(text)
    return 0


def cmd_check(a) -> int:
    from importlib.metadata import entry_points

    ok = True
    try:
        import lattix
        from lattix.ui import plugins as hook

        present = hasattr(hook, "UiPlugin")
        print(f"lattix {lattix.__version__}: workbench plugin hook {'present' if present else 'MISSING'}")
        ok &= present
    except ImportError as exc:
        print(f"lattix: not importable ({exc})")
        ok = False
    eps = [e for e in entry_points(group="lattix.ui.plugins") if e.name == "lattix_view"]
    print("entry point lattix.ui.plugins/lattix_view: "
          + ("registered" if eps else "NOT registered (pip install this package)"))
    ok &= bool(eps)
    from lattix_view.routes import static_root, three_manifest

    m = three_manifest()
    if m:
        missing = [rel for rel in m.get("files", {}) if not (static_root() / "vendor" / "three" / rel).is_file()]
        print(f"three.js {m.get('version')} vendored ({'minified' if m.get('minified') else 'readable'}), "
              f"{len(m.get('files', {}))} files{', MISSING: ' + ', '.join(missing) if missing else ''}")
        ok &= not missing
    else:
        print("three.js: NOT vendored (python tools/vendor_three.py)")
        ok = False
    print(f"lattix-view {__version__}: {'ok' if ok else 'problems found'}")
    return 0 if ok else 1


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="lattix-view", description="a 3D viewer for every lattice lattix reads")
    p.add_argument("--version", action="version", version=f"lattix-view {__version__}")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("view", help="open a deck in the 3D viewer (the lattix workbench server, 3D page first)")
    s.add_argument("deck")
    s.add_argument("--format", default=None, help="the deck's format (default: guessed)")
    s.add_argument("--read-option", action="append", help="KEY=VALUE for the reader (e.g. species=h-)")
    s.add_argument("--root", default=None, help="the directory the workbench may open decks from (default: the deck's)")
    s.add_argument("--any-path", action="store_true")
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--port", type=int, default=0)
    s.add_argument("--no-browser", action="store_true")
    s.add_argument("--check", action="store_true", help="start, self-test, stop")
    s.add_argument("--new-token", action="store_true")
    s.set_defaults(func=cmd_view)

    s = sub.add_parser("scene", help="write the scene payload of a deck as JSON")
    s.add_argument("deck")
    s.add_argument("--format", default=None)
    s.add_argument("--read-option", action="append")
    s.add_argument("-o", "--out", default=None)
    s.add_argument("--compact", action="store_true")
    s.add_argument("--no-shift", action="store_true", help="ignore misalignments")
    s.add_argument("--no-children", action="store_true", help="keep superposition clusters whole")
    s.set_defaults(func=cmd_scene)

    s = sub.add_parser("check", help="verify the installation: lattix's plugin hook, the entry point, three.js")
    s.set_defaults(func=cmd_check)

    a = p.parse_args(argv)
    return a.func(a)


if __name__ == "__main__":
    raise SystemExit(main())
