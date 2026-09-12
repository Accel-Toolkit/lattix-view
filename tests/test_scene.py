"""The scene payload: its schema, its budgets on the large public decks, and the geometry it carries."""
from __future__ import annotations

import gzip
import json
import math
import time

import numpy as np
import pytest
from lattix.ir.elements import ELEMENT_KINDS
from lattix.ui.model import jsonable

from lattix_view.families import FAMILIES, family_of
from lattix_view.scene import F_CHILD, F_HIDDEN, F_SHIFTED, F_SKEW, F_THIN, KINDS, SCHEMA, scene_view
from lattix_view.sizing import outer_size, resolve_bores, thin_length
from tests.conftest import load

PER_ELEMENT = ("name", "def", "kind", "sub", "fam", "i", "parent", "L", "apshape", "boresrc", "beta_in", "brho_in",
               "lambda_in", "strength", "flags", "label", "params")
PER_ELEMENT_3 = ("pin", "pc", "pout", "pb", "pch", "size")
PER_ELEMENT_4 = ("qin", "qc", "qout", "qb", "qch")
PER_ELEMENT_2 = ("s", "arc", "ap", "bore", "clear")


def _payload(rel, fmt=None, **opts):
    lat, placed, rep = load(rel, fmt, **opts)
    return scene_view(lat, placed, fmt=fmt or rep.source_format or "", path=rel), lat, placed


def _check_shape(payload):
    n = payload["lattice"]["n"]
    el = payload["el"]
    for key in PER_ELEMENT:
        assert len(el[key]) == n, key
    for key in PER_ELEMENT_2:
        assert len(el[key]) == 2 * n, key
    for key in PER_ELEMENT_3:
        assert len(el[key]) == 3 * n, key
    for key in PER_ELEMENT_4:
        assert len(el[key]) == 4 * n, key
    for key in PER_ELEMENT_2 + PER_ELEMENT_3 + PER_ELEMENT_4:
        assert all(math.isfinite(v) for v in el[key]), key
    assert payload["schema"] == SCHEMA and payload["kinds"] == list(ELEMENT_KINDS) and payload["families"] == FAMILIES
    assert all(0 <= k < len(KINDS) for k in el["kind"]) and all(0 <= f < len(FAMILIES) for f in el["fam"])
    assert all(0 <= s < len(payload["subkinds"]) for s in el["sub"])
    for k in range(n):
        q = el["qb"][4 * k: 4 * k + 4]
        assert math.hypot(*q) == pytest.approx(1.0, abs=1e-6)
        assert all(v > 0 for v in el["size"][3 * k: 3 * k + 3]), (k, el["name"][k])
        assert el["bore"][2 * k] > 0 and el["bore"][2 * k + 1] > 0
    assert len(payload["orbit"]) >= 2 and all(len(p) == 3 for p in payload["orbit"])
    return el


def test_fodo_cell_payload_is_complete_and_straight():
    payload, lat, placed = _payload("helix/fodo_cell.dat", "tracewin")
    el = _check_shape(payload)
    n = payload["lattice"]["n"]
    assert n == len(placed) and payload["lattice"]["n_children"] == 0
    # a straight line: every frame keeps the identity orientation, positions advance along +Z
    for k in range(n):
        assert el["qin"][4 * k: 4 * k + 4] == el["qout"][4 * k: 4 * k + 4] == [0.0, 0.0, 0.0, 1.0]
        assert el["pout"][3 * k + 2] == pytest.approx(el["s"][2 * k + 1], abs=1e-7)
        assert el["pin"][3 * k] == 0.0 and el["pin"][3 * k + 1] == 0.0
    assert payload["lattice"]["total_length"] == pytest.approx(1.6)
    bbox = payload["lattice"]["bbox"]
    assert bbox["min"][2] == 0.0 and bbox["max"][2] == pytest.approx(1.6, abs=1e-5)
    quads = [k for k in range(n) if KINDS[el["kind"][k]] == "Quadrupole"]
    assert len(quads) == 8 and all("k1 =" in el["label"][k] for k in quads)
    assert max(abs(el["strength"][k]) for k in quads) == 1.0
    assert any(el["flags"][k] & F_HIDDEN for k in range(n) if KINDS[el["kind"][k]] == "Directive")
    assert payload["runs"] and all(r["s_out"] >= r["s_in"] for r in payload["runs"])
    assert payload["lattice"]["reference"]["species"] == "proton"


def test_bends_leave_the_axis_and_the_orbit_follows_them():
    payload, lat, placed = _payload("lattix/vertical_bends.madx", "madx", frequency_Hz=352.21e6)
    el = _check_shape(payload)
    n = payload["lattice"]["n"]
    bends = [k for k in range(n) if KINDS[el["kind"][k]] == "Bend"]
    assert len(bends) == 3
    vertical = [k for k in bends if abs(abs(el["arc"][2 * k + 1]) - math.pi / 2) < 1e-6]
    assert len(vertical) == 2
    # a vertical bend moves Y between entrance and exit, and its exit quaternion differs from its entrance
    for k in vertical:
        assert el["pout"][3 * k + 1] != pytest.approx(el["pin"][3 * k + 1], abs=1e-6)
        assert el["qout"][4 * k: 4 * k + 4] != el["qin"][4 * k: 4 * k + 4]
        assert el["params"][k]["tilt_ref"] == pytest.approx(math.pi / 2)
        assert "vertical" in el["label"][k]
    assert payload["lattice"]["bbox"]["min"][1] < 0 < payload["lattice"]["bbox"]["max"][1] or \
        payload["lattice"]["bbox"]["max"][1] != payload["lattice"]["bbox"]["min"][1]
    # the orbit polyline passes through every exit and samples the arcs
    exits = {tuple(round(v, 6) for v in el["pout"][3 * k: 3 * k + 3]) for k in range(n)}
    orbit = {tuple(round(v, 6) for v in p) for p in payload["orbit"]}
    assert exits <= orbit and len(payload["orbit"]) > n + 1
    # the chord frame of a bend sits at its centre
    k = bends[0]
    assert el["pch"][3 * k: 3 * k + 3] == el["pc"][3 * k: 3 * k + 3]
    assert el["size"][3 * k + 2] == pytest.approx(el["params"][k]["chord"] / 2, abs=6e-5)   # sizes carry 4 decimals


def test_misalignment_children_and_flags():
    payload, lat, placed = _payload("lattix/misaligned.bmad", "bmad")
    el = _check_shape(payload)
    n = payload["lattice"]["n"]
    names = el["name"]
    q = names.index("qshift")
    assert el["flags"][q] & F_SHIFTED and el["flags"][q] & F_SKEW
    assert el["pb"][3 * q: 3 * q + 3] != el["pc"][3 * q: 3 * q + 3]
    assert el["flags"][names.index("qroll")] & F_SKEW and payload["subkinds"][el["sub"][names.index("qroll")]] == "skew"
    assert "frame patch" in el["label"][names.index("jump")]
    # ignoring shifts puts the body back on the reference orbit
    plain = scene_view(lat, placed, fmt="bmad", shift=False)
    assert plain["el"]["pb"] == plain["el"]["pc"] and not any(f & F_SHIFTED for f in plain["el"]["flags"])
    assert plain["lattice"]["shift"] is False
    # Superposition children: a synthetic cluster in place, with the parent index
    from lattix.ir import Drift, FieldMap, Lattice, Superposition
    from lattix.ir.walk import propagate

    lat2 = Lattice.from_sequence("l", [Drift(name="d", length=0.5),
                                       Superposition(name="cl", length=1.0, children=[(0.2, "m1"), (0.5, "m2")])],
                                 lat.reference)
    lat2.add_element(FieldMap(name="m1", length=0.3))
    lat2.add_element(FieldMap(name="m2", length=0.4))
    p2 = scene_view(lat2, propagate(lat2), fmt="lattix")
    e2 = _check_shape(p2)
    assert p2["lattice"]["n"] == 4 and p2["lattice"]["n_children"] == 2
    assert e2["parent"] == [-1, -1, 1, 1] and e2["flags"][2] & F_CHILD and e2["name"][2] == "m1"
    assert e2["pin"][3 * 2 + 2] == pytest.approx(0.7) and e2["s"][2 * 3] == pytest.approx(1.0)
    whole = scene_view(lat2, propagate(lat2), fmt="lattix", children=False)
    assert whole["lattice"]["n"] == 2 and not any(f & F_CHILD for f in whole["el"]["flags"])
    assert n >= 10


@pytest.mark.parametrize("rel,fmt,opts", [
    ("flame/ALL_lattice.lat", "flame", {}),
    ("lightwin/example.dat", "tracewin", {"species": "proton", "kinetic_energy_eV": 20e6, "frequency_Hz": 352.2e6}),
])
def test_budgets_on_the_large_decks(rel, fmt, opts):
    lat, placed, rep = load(rel, fmt, **opts)
    t0 = time.perf_counter()
    payload = scene_view(lat, placed, fmt=fmt, path=rel)
    dt = time.perf_counter() - t0
    el = _check_shape(payload)
    n = payload["lattice"]["n"]
    assert n >= 600
    body = json.dumps(jsonable(payload), separators=(",", ":")).encode()
    assert len(body) <= 600 * n, f"{len(body) / n:.0f} B per element"
    assert len(gzip.compress(body, 6)) <= 150 * n, f"{len(gzip.compress(body, 6)) / n:.0f} B per element gzip"
    assert dt < 3.0, f"scene_view took {dt:.2f} s"
    assert sum(1 for f in el["flags"] if f & F_THIN) < n
    assert payload["lattice"]["a_median"] is not None


def test_ring_closes():
    payload, lat, placed = _payload("xtrack/psb.seq", "madx", species="proton", kinetic_energy_eV=160e6)
    pytest.importorskip("cpymad")
    el = _check_shape(payload)
    n = payload["lattice"]["n"]
    np.testing.assert_allclose(el["pout"][3 * (n - 1): 3 * n], [0.0, 0.0, 0.0], atol=1e-5)
    bbox = payload["lattice"]["bbox"]
    assert bbox["max"][0] - bbox["min"][0] > 20 and bbox["max"][2] - bbox["min"][2] > 20     # a 157 m ring
    assert sum(1 for k in el["kind"] if KINDS[k] == "Bend") >= 30


def test_sizing_and_families_helpers():
    from lattix.ir import ApertureP, Drift, Quadrupole

    els = [Drift(name="a", length=1.0, aperture=ApertureP.circle(0.02)), Quadrupole(name="q", length=0.3),
           Drift(name="b", length=1.0), Drift(name="c", length=1.0, aperture=ApertureP.rect(0.03, 0.01))]
    bores, median = resolve_bores(els)
    assert bores[0] == (0.02, 0.02, 1, 0) and bores[1][3] == 1 and bores[1][:2] == (0.02, 0.02)
    assert bores[3] == (0.03, 0.01, 2, 0) and median == pytest.approx(0.025)
    assert resolve_bores([Quadrupole(name="q", length=0.3)])[0][0][3] == 3
    assert thin_length("Kicker", 1.0, 1.0) == 0.10 and thin_length("Kicker", 0.05, 0.05) == pytest.approx(0.045)
    assert thin_length("Marker", 0.0, 0.0) == 0.004
    hx, hy, hz = outer_size("Quadrupole", "", "", 0.3, (0.02, 0.02), {}, None, (1.0, 1.0))
    assert hx == hy == 0.12 and hz == 0.15
    hx, hy, hz = outer_size("Bend", "sector", "", 1.2, (0.03, 0.02), {"hgap": 0.025, "chord": 1.19}, None, (1.0, 1.0))
    assert hy > hx / 2 and hz == pytest.approx(0.595)
    r = outer_size("RFCavity", "sw", "", 1.0, (0.035, 0.035), {"beta": 0.9}, 0.2306, (0.5, 0.5))
    assert r[0] == pytest.approx(0.38 * 0.2306 + 0.03) and r[2] == 0.5
    assert outer_size("Instrument", "", "bpm", 0.0, (0.02, 0.02), {}, None, (0.5, 0.5)) == (0.04, 0.04, 0.04)
    assert family_of("DIAG_SIZE") == "profile" and family_of("hmon") == "bpm_h" and family_of("whatever") == "generic"
    assert family_of(None) == "generic" and family_of("BPM") == "bpm"
