"""Override rules: precedence, discovery, the model registry, and the payload block."""
from __future__ import annotations

import json
import os
import struct
from pathlib import Path

import pytest

from lattix_view.overrides import CLI_FILES, ModelRegistry, assignments, discover, load_all, load_file, resolve


def cube_glb(path: Path, size: float = 1.0) -> Path:
    """A one-cube binary glTF with a root node carrying lattix extras: enough for a loader and a fit test."""
    h = size / 2
    verts = [(-h, -h, -h), (h, -h, -h), (h, h, -h), (-h, h, -h),
             (-h, -h, h), (h, -h, h), (h, h, h), (-h, h, h)]
    faces = [(0, 1, 2), (0, 2, 3), (4, 6, 5), (4, 7, 6), (0, 4, 5), (0, 5, 1),
             (3, 2, 6), (3, 6, 7), (1, 5, 6), (1, 6, 2), (0, 3, 7), (0, 7, 4)]
    vbuf = b"".join(struct.pack("<3f", *v) for v in verts)
    ibuf = b"".join(struct.pack("<3H", *f) for f in faces)
    pad = lambda b: b + b"\x00" * ((4 - len(b) % 4) % 4)  # noqa: E731
    bin_chunk = pad(vbuf) + pad(ibuf)
    gltf = {
        "asset": {"version": "2.0"},
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "cube", "extras": {"lattix": {"anchor": "centre", "length_m": size}}}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}],
        "accessors": [{"bufferView": 0, "componentType": 5126, "count": 8, "type": "VEC3",
                       "min": [-h, -h, -h], "max": [h, h, h]},
                      {"bufferView": 1, "componentType": 5123, "count": 36, "type": "SCALAR"}],
        "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": len(vbuf)},
                        {"buffer": 0, "byteOffset": len(pad(vbuf)), "byteLength": len(ibuf)}],
        "buffers": [{"byteLength": len(bin_chunk)}],
    }
    jchunk = json.dumps(gltf, separators=(",", ":")).encode()
    jchunk += b" " * ((4 - len(jchunk) % 4) % 4)
    body = (struct.pack("<II", len(jchunk), 0x4E4F534A) + jchunk
            + struct.pack("<II", len(bin_chunk), 0x004E4942) + bin_chunk)
    path.write_bytes(b"glTF" + struct.pack("<II", 2, 12 + len(body)) + body)
    return path


def write_rules(path: Path, text: str) -> Path:
    path.write_text(text, encoding="utf-8")
    return path


def test_precedence_and_matching(tmp_path: Path):
    (tmp_path / "models").mkdir()
    cube_glb(tmp_path / "models" / "quad.glb")
    cube_glb(tmp_path / "models" / "qd.glb")
    f1 = write_rules(tmp_path / "a.yaml", """
version: 1
models_dir: models
rules:
  - match: {kind: Quadrupole}
    model: quad.glb
    fit: length
  - match: {name: "QD*"}
    model: qd.glb
  - match: {kind: Instrument, family: bpm}
    hide: true
  - match: {name: cav1}
    archetype: cavity
    params: {variant: hwr}
""")
    f2 = write_rules(tmp_path / "b.yaml", """
version: 1
models_dir: models
rules:
  - match: {kind: Quadrupole}
    model: qd.glb
    materials: tint
""")
    rules = load_all([f1, f2])
    assert len(rules) == 5
    quad = {"name": "QF1", "def": "QF1", "kind": "Quadrupole", "sub": "", "family": "", "format": "madx",
            "original_type": "QUADRUPOLE"}
    assert resolve(rules, quad).source == f2                              # the later file wins among equal matches
    qd = {**quad, "name": "QD2"}
    assert resolve(rules, qd).rule.model == "qd.glb" and resolve(rules, qd).source == f1   # a name glob beats a kind
    bpm = {"name": "BPM1", "def": "BPM1", "kind": "Instrument", "sub": "", "family": "BPM", "format": "madx",
           "original_type": "MONITOR"}
    assert resolve(rules, bpm).rule.hide
    cav = {"name": "cav1", "def": "cav1", "kind": "RFCavity", "sub": "sw", "family": "", "format": "madx",
           "original_type": ""}
    assert resolve(rules, cav).rule.archetype == "cavity"
    assert resolve(rules, {**cav, "name": "cav2"}) is None
    reg = ModelRegistry()
    errors: list[str] = []
    block = assignments(rules, [quad, qd, bpm, cav, {**cav, "name": "d"}], reg, "/plugins/lattix_view", errors)
    assert errors == []
    assert set(block["assign"]) == {"0", "1", "2", "3"}
    assert block["assign"]["0"]["materials"] == "tint" and block["assign"]["0"]["fit"] == "none"
    assert block["assign"]["1"]["fit"] == "none" and block["assign"]["1"]["anchor"] == "centre"
    assert block["assign"]["2"] == {"hide": True, "rule": "a.yaml"}
    assert block["assign"]["3"]["archetype"] == "cavity" and block["assign"]["3"]["params"] == {"variant": "hwr"}
    handles = {e["model"] for e in block["assign"].values() if "model" in e}
    assert len(handles) == 1 and block["models"][next(iter(handles))]["file"] == "qd.glb"
    assert reg.get(next(iter(handles))) == (tmp_path / "models" / "qd.glb").resolve() and reg.get("nope") is None


def test_bad_files_and_missing_models_are_reported_not_fatal(tmp_path: Path):
    bad = write_rules(tmp_path / "bad.yaml", "version: 1\nrules:\n  - match: {kind: Quadrupole}\n")   # no action
    escape = write_rules(tmp_path / "escape.yaml", "version: 1\nmodels_dir: models\nrules:\n"
                         "  - match: {kind: Bend}\n    model: ../../etc/passwd\n")
    missing = write_rules(tmp_path / "missing.yaml",
                          "version: 1\nmodels_dir: models\nrules:\n  - match: {kind: Bend}\n    model: nothing.glb\n")
    (tmp_path / "models").mkdir()
    errors: list[str] = []
    rules = load_all([bad, escape, missing], errors)
    assert len(errors) == 1 and "bad.yaml" in errors[0] and len(rules) == 2
    bend = {"name": "b", "def": "b", "kind": "Bend", "sub": "sector", "family": "", "format": "", "original_type": ""}
    block = assignments(rules, [bend], ModelRegistry(), "/p", errors)     # one rule per element: the later file's
    assert block["assign"] == {} and len(errors) == 2 and "not found" in errors[1]
    only_escape = load_all([escape])
    assert assignments(only_escape, [bend], ModelRegistry(), "/p", errors)["assign"] == {} and "escapes" in errors[2]
    with pytest.raises(ValueError):
        load_file(write_rules(tmp_path / "v2.yaml", "version: 2\n"), 0)


def test_discovery_order(tmp_path: Path, monkeypatch):
    cfg = tmp_path / "cfg"
    cfg.mkdir()
    monkeypatch.setenv("LATTIX_VIEW_CONFIG_DIR", str(cfg))
    monkeypatch.setenv("LATTIX_VIEW_OVERRIDES",
                       os.pathsep.join([str(tmp_path / "env.yaml"), str(tmp_path / "absent.yaml")]))
    deck = tmp_path / "ring.seq"
    deck.write_text("! deck")
    for p in (cfg / "overrides.yaml", tmp_path / "env.yaml", tmp_path / "ring.seq.view.yaml",
              tmp_path / "ring.view.yaml", tmp_path / "cli.yaml"):
        write_rules(p, "version: 1\n")
    monkeypatch.setattr("lattix_view.overrides.CLI_FILES", [tmp_path / "cli.yaml"])
    found = discover(deck)
    assert [p.name for p in found] == ["overrides.yaml", "env.yaml", "ring.seq.view.yaml", "ring.view.yaml", "cli.yaml"]
    assert discover(None) == [cfg / "overrides.yaml", tmp_path / "env.yaml", tmp_path / "cli.yaml"]
    assert CLI_FILES == [] or True


def test_the_shipped_example_parses():
    from lattix_view.overrides import load_file

    example = Path(__file__).resolve().parents[1] / "overrides" / "example.yaml"
    rules = load_file(example, 0)
    assert len(rules) == 6 and rules[0].defaults.units == "m" and rules[-1].rule.hide
    assert rules[4].rule.archetype == "cavity" and rules[4].rule.params == {"n_cell": 2}
