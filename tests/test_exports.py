"""The zip the page writes opens with Python's zipfile, and the OBJ parses as faces over vertices."""
from __future__ import annotations

import shutil
import subprocess
import zipfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
node = shutil.which("node")


@pytest.mark.skipif(node is None, reason="node is not installed")
def test_zip_and_obj_written_by_the_page_modules(tmp_path: Path):
    env = {"ZIP_OUT": str(tmp_path / "t.zip"), "OBJ_OUT": str(tmp_path / "t.obj"), "PATH": str(Path(node).parent)}
    r = subprocess.run([node, "--test", str(ROOT / "tests" / "js" / "export.test.mjs")], capture_output=True, text=True,
                       timeout=120, env={**env, "HOME": str(tmp_path)})
    assert r.returncode == 0, r.stdout[-2000:] + r.stderr[-2000:]
    with zipfile.ZipFile(tmp_path / "t.zip") as z:
        assert z.namelist() == ["a.txt", "dir/b.bin"]
        assert z.read("a.txt") == b"hello" and z.read("dir/b.bin") == b"\x01\x02\x03"
        assert z.testzip() is None
    lines = (tmp_path / "t.obj").read_text().splitlines()
    verts = [ln for ln in lines if ln.startswith("v ")]
    faces = [ln for ln in lines if ln.startswith("f ")]
    assert len(verts) == 6 and len(faces) == 2
    for f in faces:
        for tok in f.split()[1:]:
            v, n = tok.split("//")
            assert 1 <= int(v) <= 6 and int(n) == int(v)
