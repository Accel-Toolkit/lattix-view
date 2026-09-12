"""The shipped page and scripts: offline, self-contained, no inline script, every import a real file,
the vendored three.js exactly what the manifest says, all within the size policy."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from lattix_view.routes import static_root

STATIC = static_root()
IMPORT = re.compile(r"""(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]""")


def _js_files(sub: str) -> list[Path]:
    return sorted(p for p in (STATIC / sub).rglob("*.js"))


def test_index_has_no_inline_script_and_no_external_resources():
    text = (STATIC / "index.html").read_text(encoding="utf-8")
    assert "<title>lattix 3D</title>" in text
    assert re.search(r"<script(?![^>]*\bsrc=)", text) is None, "inline script forbidden by the page's policy"
    assert 'type="module" src="static/app/main.js"' in text
    assert "https://" not in text and "http://" not in text
    assert len(text.encode("utf-8")) <= 30_000


def test_app_modules_are_offline_and_resolve_their_imports():
    files = _js_files("app")
    assert files, "no app modules"
    total = 0
    for f in files:
        text = f.read_text(encoding="utf-8")
        total += len(text.encode("utf-8"))
        assert "https://" not in text and "http://" not in text, f
        for m in IMPORT.finditer(text):
            spec = m.group(1) or m.group(2)
            assert spec.startswith("."), f"{f.name}: bare or absolute import {spec!r}"
            assert (f.parent / spec).resolve().is_file(), f"{f.name}: import {spec!r} does not resolve"
    assert total <= 400_000


def test_vendored_three_matches_its_manifest_and_imports_nothing_bare():
    root = STATIC / "vendor" / "three"
    manifest = json.loads((root / "MANIFEST.json").read_text(encoding="utf-8"))
    assert manifest["package"] == "three" and manifest["license"] == "MIT" and (root / "LICENSE").is_file()
    assert re.fullmatch(r"\d+\.\d+\.\d+", manifest["version"])
    on_disk = {str(p.relative_to(root)) for p in root.rglob("*") if p.is_file()} - {"MANIFEST.json"}
    assert on_disk == set(manifest["files"]), on_disk ^ set(manifest["files"])
    for rel, digest in manifest["files"].items():
        assert hashlib.sha256((root / rel).read_bytes()).hexdigest() == digest, rel
    total = 0
    for f in _js_files("vendor"):
        text = f.read_text(encoding="utf-8")
        total += len(text.encode("utf-8"))
        for m in IMPORT.finditer(text):
            spec = m.group(1) or m.group(2)
            assert spec.startswith("."), f"{f.relative_to(root)}: import {spec!r} is not relative"
            assert (f.parent / spec).resolve().is_file(), f"{f.relative_to(root)}: import {spec!r} does not resolve"
    assert total <= 1_500_000 if manifest.get("minified") else total <= 3_000_000
    assert "three.module.js" in manifest["files"] and "addons/controls/OrbitControls.js" in manifest["files"]


def test_third_party_notice_names_the_vendored_version():
    root = Path(__file__).resolve().parents[1]
    manifest = json.loads((STATIC / "vendor" / "three" / "MANIFEST.json").read_text(encoding="utf-8"))
    notice = (root / "THIRD_PARTY.md").read_text(encoding="utf-8")
    assert manifest["version"] in notice and "MIT" in notice and manifest["tarball_sha256"] in notice
