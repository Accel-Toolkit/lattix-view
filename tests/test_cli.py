from __future__ import annotations

import json

import pytest

from lattix_view.cli import main
from tests.conftest import deck_path


def test_version(capsys):
    with pytest.raises(SystemExit):
        main(["--version"])
    assert "lattix-view" in capsys.readouterr().out


def test_scene_command_writes_the_payload(tmp_path, capsys):
    deck = deck_path("helix/bend_line.dat")
    out = tmp_path / "scene.json"
    assert main(["scene", str(deck), "-o", str(out)]) == 0
    doc = json.loads(out.read_text())
    assert doc["schema"] == "lattix-view.scene/1" and doc["lattice"]["n"] == 21
    assert doc["lattice"]["format"] == "tracewin"
    assert main(["scene", str(deck), "--compact", "--no-shift", "--no-children"]) == 0
    printed = json.loads(capsys.readouterr().out.splitlines()[-1])
    assert printed["lattice"]["shift"] is False and printed["lattice"]["children"] is False


def test_check_reports_the_installation(capsys):
    code = main(["check"])
    out = capsys.readouterr().out
    assert "three.js" in out and "plugin hook" in out and "entry point" in out
    assert code in (0, 1)


def test_view_self_test(capsys):
    deck = deck_path("helix/fodo_cell.dat")
    assert main(["view", str(deck), "--check", "--no-browser"]) == 0
    out = capsys.readouterr().out
    assert "plugins: lattix_view" in out and "/plugins/lattix_view/?token=" in out and "self-test passed" in out


def test_overrides_command_lists_rules_and_assignments(tmp_path, capsys, monkeypatch):
    from tests.test_overrides import cube_glb

    monkeypatch.delenv("LATTIX_VIEW_OVERRIDES", raising=False)
    monkeypatch.setenv("LATTIX_VIEW_CONFIG_DIR", str(tmp_path / "nowhere"))
    deck = deck_path("helix/bend_line.dat")
    (tmp_path / "models").mkdir()
    cube_glb(tmp_path / "models" / "cube.glb")
    rules = tmp_path / "rules.yaml"
    rules.write_text("version: 1\nmodels_dir: models\nrules:\n  - match: {kind: Quadrupole}\n    model: cube.glb\n"
                     "  - match: {kind: Bend}\n    hide: true\n", encoding="utf-8")
    assert main(["overrides", str(deck), "--overrides", str(rules)]) == 0
    out = capsys.readouterr().out
    assert str(rules) in out and "rules: 2" in out and "kind=Quadrupole -> model cube.glb" in out
    assert "assigned: 7" in out and out.count("cube.glb (fit none, anchor centre") == 5 and out.count(": hidden") == 2
    rules.write_text("version: 1\nmodels_dir: models\nrules:\n  - match: {kind: Drift}\n    model: absent.glb\n")
    assert main(["overrides", str(deck), "--overrides", str(rules)]) == 1
    out = capsys.readouterr().out
    assert out.count("error: ") == 1 and "not found" in out and "assigned: 0" in out
    assert main(["overrides", str(deck), "--overrides", str(tmp_path / "missing.yaml")]) == 2
