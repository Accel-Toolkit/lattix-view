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
