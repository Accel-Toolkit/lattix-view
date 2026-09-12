"""Vendor three.js into ``lattix_view/static/vendor/three``: the ES module build and the addons the
viewer uses, offline, with no bundler at run time.

    python tools/vendor_three.py              # the pinned version below
    python tools/vendor_three.py --no-minify  # keep the readable sources (much larger)

The npm tarball is downloaded from the registry and checked against the pinned sha256.  Each
addon's bare ``from 'three'`` import is rewritten to the relative path of the vendored module (an
import map would need an inline script, which the page's content policy forbids); the relative
imports between addons are kept, so the ``addons/<dir>/<file>.js`` layout of the package is
kept too.  When ``npx esbuild`` is available the files are minified (ES module output, imports
untouched) with a one-line banner naming the version and the licence.  ``MANIFEST.json`` records
the version, the tarball checksum and the sha256 of every vendored file; ``THIRD_PARTY.md`` and
the tests read it."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

VERSION = "0.186.0"
TARBALL_SHA256 = "61eeff9d7616005c9a481c796f52287d81fbbbc0d55eaca5565322924252c1aa"
URL = f"https://registry.npmjs.org/three/-/three-{VERSION}.tgz"

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "lattix_view" / "static" / "vendor" / "three"

#: tarball member -> vendored path (relative to DEST)
FILES = {
    "package/LICENSE": "LICENSE",
    "package/build/three.module.js": "three.module.js",
    "package/build/three.core.js": "three.core.js",
    "package/examples/jsm/controls/OrbitControls.js": "addons/controls/OrbitControls.js",
    "package/examples/jsm/loaders/GLTFLoader.js": "addons/loaders/GLTFLoader.js",
    "package/examples/jsm/exporters/GLTFExporter.js": "addons/exporters/GLTFExporter.js",
    "package/examples/jsm/renderers/CSS2DRenderer.js": "addons/renderers/CSS2DRenderer.js",
    "package/examples/jsm/utils/BufferGeometryUtils.js": "addons/utils/BufferGeometryUtils.js",
    "package/examples/jsm/utils/SkeletonUtils.js": "addons/utils/SkeletonUtils.js",
    "package/examples/jsm/environments/RoomEnvironment.js": "addons/environments/RoomEnvironment.js",
    "package/examples/jsm/lines/Line2.js": "addons/lines/Line2.js",
    "package/examples/jsm/lines/LineMaterial.js": "addons/lines/LineMaterial.js",
    "package/examples/jsm/lines/LineGeometry.js": "addons/lines/LineGeometry.js",
    "package/examples/jsm/lines/LineSegments2.js": "addons/lines/LineSegments2.js",
    "package/examples/jsm/lines/LineSegmentsGeometry.js": "addons/lines/LineSegmentsGeometry.js",
}

_BARE = re.compile(r"""(from\s*)(['"])three\2""")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _relative_module(dest_rel: str) -> str:
    depth = dest_rel.count("/")
    return "../" * depth + "three.module.js"


def _rewrite(text: str, dest_rel: str) -> str:
    """``from 'three'`` -> the relative path of the vendored module."""
    target = _relative_module(dest_rel)
    return _BARE.sub(lambda m: f"{m.group(1)}'{target}'", text)


def _esbuild() -> list[str] | None:
    npx = shutil.which("npx")
    if npx is None:
        return None
    try:
        out = subprocess.run([npx, "--yes", "esbuild", "--version"], capture_output=True, text=True, timeout=120)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return [npx, "--yes", "esbuild"] if out.returncode == 0 else None


def _minify(esbuild: list[str], text: str, banner: str, name: str) -> str:
    out = subprocess.run([*esbuild, "--minify", "--format=esm", "--target=es2020", "--loader=js",
                          f"--banner={banner}", "--log-level=warning"],
                         input=text, capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(f"esbuild failed on {name}:\n{out.stderr[-3000:]}")
    return out.stdout


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--no-minify", action="store_true", help="keep the readable sources")
    a = p.parse_args(argv)

    print(f"downloading {URL}")
    with urllib.request.urlopen(URL, timeout=120) as resp:   # noqa: S310 - a fixed https URL
        data = resp.read()
    digest = _sha256(data)
    if digest != TARBALL_SHA256:
        print(f"sha256 mismatch: got {digest}, pinned {TARBALL_SHA256}", file=sys.stderr)
        return 1
    esbuild = None if a.no_minify else _esbuild()
    if esbuild is None and not a.no_minify:
        print("esbuild not available (npx); vendoring the readable sources", file=sys.stderr)
    revision = VERSION.split(".")[1]
    banner = f"/* three.js r{revision} (npm three@{VERSION}) - MIT licence, see LICENSE beside this file */"

    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.mkdir(parents=True)
    manifest_files: dict[str, str] = {}
    with tempfile.TemporaryDirectory() as tmp:
        tgz = Path(tmp) / "three.tgz"
        tgz.write_bytes(data)
        with tarfile.open(tgz) as tar:
            members = {m.name: m for m in tar.getmembers()}
            for src, rel in FILES.items():
                if src not in members:
                    print(f"{src} is not in the tarball", file=sys.stderr)
                    return 1
                raw = tar.extractfile(members[src]).read()
                out = DEST / rel
                out.parent.mkdir(parents=True, exist_ok=True)
                if rel.endswith(".js"):
                    text = _rewrite(raw.decode("utf-8"), rel)
                    if esbuild is not None:
                        text = _minify(esbuild, text, banner, rel)
                    out.write_text(text, encoding="utf-8")
                else:
                    out.write_bytes(raw)
                manifest_files[rel] = _sha256(out.read_bytes())
    manifest = {
        "package": "three", "version": VERSION, "url": URL, "tarball_sha256": TARBALL_SHA256,
        "license": "MIT", "minified": esbuild is not None, "files": manifest_files,
    }
    (DEST / "MANIFEST.json").write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    total = sum((DEST / rel).stat().st_size for rel in manifest_files)
    print(f"vendored three@{VERSION}: {len(manifest_files)} files, {total / 1e6:.2f} MB, "
          f"{'minified' if esbuild else 'readable'} -> {DEST.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
