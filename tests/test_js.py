"""The JavaScript tests run under node's own runner when node is installed; the app and vendor
modules must at least parse."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

from lattix_view.routes import static_root

ROOT = Path(__file__).resolve().parents[1]
node = shutil.which("node")


@pytest.mark.skipif(node is None, reason="node is not installed")
def test_node_test_suite():
    files = sorted(str(p) for p in (ROOT / "tests" / "js").glob("*.test.mjs"))
    assert files, "no node tests"
    r = subprocess.run([node, "--test", *files], capture_output=True, text=True, timeout=300, cwd=ROOT)
    assert r.returncode == 0, r.stdout[-4000:] + r.stderr[-4000:]


@pytest.mark.skipif(node is None, reason="node is not installed")
def test_every_module_parses(tmp_path: Path):
    """``node --check`` parses a ``.js`` file as CommonJS; a ``.mjs`` copy is checked as the module it is."""
    for f in sorted(static_root().rglob("*.js")):
        copy = tmp_path / (f.stem + ".mjs")
        copy.write_bytes(f.read_bytes())
        r = subprocess.run([node, "--check", str(copy)], capture_output=True, text=True, timeout=120)
        assert r.returncode == 0, f"{f}: {r.stderr[-2000:]}"
