"""The scene payload: what the page needs to draw a lattice in 3D, in columnar arrays.

Positions and orientations come from ``lattix.ir.frames.frame_survey`` (entrance, centre, exit and
misaligned body of every element, Superposition children in place); sizes from ``sizing``; the
instrument archetype from ``families``.  The schema is ``lattix-view.scene/1``: every ``el`` column
has one entry per element (children included), positions are metres in the survey frame,
quaternions are ``(x, y, z, w)`` as three.js reads them."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from lattix import __version__ as lattix_version
from lattix.ir.elements import ELEMENT_KINDS, Element
from lattix.ir.frames import Frame, PlacedFrames, _arc, frame_survey, rot_s, site_frame
from lattix.ir.lattice import Lattice, Placed
from lattix.ir.walk import energy_gain_eV
from lattix.ui.inspect import derived_numbers

from lattix_view._version import __version__
from lattix_view.families import FAMILIES, family_from_words, family_of
from lattix_view.sizing import BORE_SOURCES, C_LIGHT, outer_size, resolve_bores

SCHEMA = "lattix-view.scene/1"
KINDS: list[str] = list(ELEMENT_KINDS)

#: bits of ``el.flags``
F_REVERSED, F_SHIFTED, F_THIN, F_CHILD, F_SKEW, F_ELECTRIC, F_HIDDEN, F_RF_FOCUSING = (1 << k for k in range(8))

#: kinds that make no hardware of their own and continue a beam-pipe run
PASSIVE = frozenset({"Drift", "Marker", "Directive", "Freq", "ReferenceChange"})

_ORBIT_STEP = math.radians(2.0)


def _q(frame: Frame) -> list[float]:
    return [round(float(v), 7) for v in frame.quaternion()]


def _v(frame: Frame) -> list[float]:
    return [round(float(v), 7) for v in frame.V]


def _sub_kind(e: Element, f: PlacedFrames) -> str:
    k = e.kind
    if k == "Bend":
        return "rect" if e.bend.rect else "sector"
    if k == "Quadrupole":
        return "skew" if f.roll else ""
    if k == "RFCavity":
        if e.length <= 0:
            return "gap"
        return "tw" if e.rf.cavity_type == "TRAVELING_WAVE" else "sw"
    if k == "FieldMap":
        summary = (e.meta or {}).get("map_summary") or {}
        return str(summary.get("kind") or "none")
    if k == "NCells":
        return f"mode{int(e.params.get('mode', 0) or 0)}"
    if k == "Kicker":
        plane = ("h" if e.hkick else "") + ("v" if e.vkick else "")
        return ("electric_" if e.electric else "") + (plane or "hv")
    if k == "Collimator":
        if e.aperture is None:
            return "unknown"
        return "rect" if e.aperture.shape == "RECTANGULAR" else "ellipse"
    if k == "Multipole":
        orders = [n for n, v in {**e.multipole.BnL, **e.multipole.BsL}.items() if v]
        return f"n{max(orders)}" if orders else "n0"
    if k == "Taylor":
        return "rf_focusing" if (e.meta or {}).get("rf_focusing_of") else ""
    return ""


def _params(e: Element, p: Placed, lat: Lattice, d: dict) -> dict:
    """The few numbers a builder needs, beyond the size: bend geometry, cell counts, kicks."""
    k = e.kind
    out: dict = {}
    if k == "Bend":
        b = e.bend
        out.update({"angle": float(b.angle), "e1": float(b.e1), "e2": float(b.e2), "hgap": float(b.hgap),
                    "tilt_ref": float(b.tilt_ref), "rect": bool(b.rect)})
        for key in ("rho_m", "chord_m", "B0_T", "k1"):
            if d.get(key) is not None:
                out[{"rho_m": "rho", "chord_m": "chord", "B0_T": "B0", "k1": "k1"}[key]] = float(d[key])
    elif k in ("Quadrupole", "Sextupole", "Octupole"):
        n = {"Quadrupole": 1, "Sextupole": 2, "Octupole": 3}[k]
        out["G"] = float(e.multipole.Bn.get(n, 0.0))
        if e.multipole.tilt.get(n):
            out["tilt"] = float(e.multipole.tilt[n])
        for key in ("k1", "k2", "k3"):
            if d.get(key) is not None:
                out[key] = float(d[key])
    elif k == "Multipole":
        out["orders"] = sorted({int(n) for n, v in {**e.multipole.BnL, **e.multipole.BsL}.items() if v})
    elif k == "Solenoid":
        out["B"] = float(e.solenoid.Bsol_T)
    elif k in ("RFCavity", "FieldMap", "NCells", "RFQCell", "Superposition"):
        rf = getattr(e, "rf", None)
        if rf is not None:
            f = rf.frequency_Hz or (p.ref_in.rf_frequency_Hz if p.ref_in else None) or lat.reference.rf_frequency_Hz
            out.update({"f": float(f) if f else None, "V": float(d.get("V_eff_V") or 0.0),
                        "phase": float(rf.phase_rad), "gain": float(d.get("gain_eV") or 0.0),
                        "L_active": float(rf.L_active_m) if rf.L_active_m is not None else None,
                        "n_cell": int(rf.n_cell) if rf.n_cell else None,
                        "tw": rf.cavity_type == "TRAVELING_WAVE"})
        if k == "FieldMap":
            s = (e.meta or {}).get("map_summary") or {}
            out.update({"map_kind": s.get("kind"), "L_eff": s.get("L_eff_m"), "B_eff": s.get("B_eff_T"),
                        "integrated": bool(s)})
        if k == "NCells":
            out.update({key: e.params.get(key) for key in ("mode", "n_cells", "beta_g") if key in e.params})
        if k == "RFQCell":
            out.update({key: e.params.get(key) for key in ("r0", "modulation", "a10", "cell_type")
                        if key in e.params})
        if k == "Superposition":
            out["children"] = [[float(z), str(n)] for z, n in e.children]
    elif k == "Kicker":
        out.update({"hkick": float(e.hkick), "vkick": float(e.vkick), "electric": bool(e.electric)})
    elif k == "Collimator":
        nat = (e.native or {}).get("tracewin") or {}
        if "ap_type" in nat:
            out["ap_type"] = nat["ap_type"]
    elif k == "Instrument":
        out["family"] = e.family
    elif k == "Foil":
        out.update({"material": e.material, "thickness_kg_per_m2": float(e.thickness_kg_per_m2)})
    elif k == "Patch":
        out.update({key: float(getattr(e, key))
                    for key in ("x_offset", "y_offset", "z_offset", "x_rot", "y_rot", "tilt")})
    elif k == "Directive":
        out.update({"card": e.card, "role": e.role})
    if p.ref_in is not None:
        out["beta"] = float(p.ref_in.beta)
    return out


def _family(e: Element) -> str:
    """The archetype family of an instrument, or of a marker that names a device (a survey marker read
    from a deck's own comments: its type words and its name), else ""."""
    stem = (e.name or "").split("_")[0]
    words = [stem, stem.rstrip("0123456789")] + list((e.meta or {}).get("tags") or [])   # the name, then the type words
    if e.kind == "Instrument":
        fam = family_of(e.family)
        return fam if fam != "generic" else (family_from_words(words) or fam)
    if e.kind == "Marker":
        return family_from_words(words) if (e.meta or {}).get("comment") else ""
    return ""


def _label(e: Element, d: dict, prm: dict) -> str:
    """One line of headline numbers for the hover label, in the units the 2D page uses."""
    k = e.kind

    def num(v, sig=4):
        return f"{float(v):.{sig}g}"

    if k == "Quadrupole":
        s = f"k1 = {num(d.get('k1', 0))} 1/m²  G = {num(prm.get('G', 0))} T/m"
        return s + ("  skew" if prm.get("tilt") else "")
    if k in ("Sextupole", "Octupole"):
        key = "k2" if k == "Sextupole" else "k3"
        unit = "1/m³" if k == "Sextupole" else "1/m⁴"
        return f"{key} = {num(d.get(key) or 0)} {unit}"
    if k == "Multipole":
        knl = d.get("knl") or {}
        return "  ".join(f"k{n}l = {num(v)}" for n, v in list(knl.items())[:3]) or "thin multipole"
    if k == "Bend":
        s = f"θ = {num(d.get('angle_deg', 0))}°"
        if d.get("rho_m") is not None:
            s += f"  ρ = {num(d['rho_m'])} m"
        if d.get("e1_deg") or d.get("e2_deg"):
            s += f"  e1/e2 = {num(d.get('e1_deg', 0))}°/{num(d.get('e2_deg', 0))}°"
        if abs(float(prm.get("tilt_ref", 0.0))) > 1e-9:
            vertical = abs(abs(prm["tilt_ref"]) - math.pi / 2) < 1e-6
            s += "  vertical" if vertical else f"  tilt {num(prm['tilt_ref'])} rad"
        return s
    if k == "Solenoid":
        return f"B = {num(prm.get('B', 0))} T  ks = {num(d.get('ks') or 0)} 1/m"
    if k in ("RFCavity", "FieldMap", "NCells", "RFQCell", "Superposition"):
        parts = []
        if prm.get("V"):
            parts.append(f"V = {num(prm['V'] / 1e6)} MV")
        if "phase" in prm:
            parts.append(f"φs = {num(math.degrees(prm['phase']))}°")
        if prm.get("f"):
            parts.append(f"f = {num(prm['f'] / 1e6)} MHz")
        if prm.get("gain"):
            parts.append(f"ΔE = {num(prm['gain'] / 1e6)} MeV")
        if k == "FieldMap":
            parts.append(f"map: {prm.get('map_kind') or 'not integrated'}")
        return "  ".join(parts) or k
    if k == "Kicker":
        kicks = f"hkick = {num(prm.get('hkick', 0) * 1e3)} mrad  vkick = {num(prm.get('vkick', 0) * 1e3)} mrad"
        return kicks + ("  electric" if prm.get("electric") else "")
    if k == "Collimator":
        ap = e.aperture
        if ap is not None and ap.half_x is not None:
            hy = ap.half_y if ap.half_y is not None else ap.half_x
            return f"half aperture {num(ap.half_x * 1e3)} × {num(hy * 1e3)} mm ({ap.shape.lower()})"
        return "aperture size unknown"
    if k == "Instrument":
        return f"{e.family}"
    if k == "Foil":
        return f"{e.material}, {num(prm.get('thickness_kg_per_m2', 0) * 100)} mg/cm²"
    if k == "Patch":
        keys = ("x_offset", "y_offset", "z_offset", "x_rot", "y_rot", "tilt")
        return "frame patch: " + " ".join(f"{key}={num(prm[key], 3)}" for key in keys if prm.get(key))
    if k == "Directive":
        return f"{prm.get('card', '')} ({prm.get('role', '')})".strip()
    return ""


def _strength(e: Element, d: dict, prm: dict) -> float:
    k = e.kind
    if k == "Quadrupole":
        return float(prm.get("G", 0.0))
    if k == "Sextupole":
        return float(e.multipole.Bn.get(2, 0.0))
    if k == "Octupole":
        return float(e.multipole.Bn.get(3, 0.0))
    if k == "Multipole":
        orders = [n for n, v in e.multipole.BnL.items() if v]
        return float(e.multipole.BnL.get(max(orders), 0.0)) if orders else 0.0
    if k == "Bend":
        return float(prm.get("angle", 0.0))
    if k == "Solenoid":
        return float(prm.get("B", 0.0))
    if k in ("RFCavity", "FieldMap", "NCells", "RFQCell", "Superposition"):
        return float(prm.get("gain") or prm.get("V") or 0.0)
    if k == "Kicker":
        return math.hypot(float(prm.get("hkick", 0.0)), float(prm.get("vkick", 0.0)))
    return 0.0


def _orbit(frames: list[PlacedFrames], start: Frame) -> list[list[float]]:
    pts = [[round(float(v), 7) for v in start.V]]
    for f in frames:
        if f.parent is not None:
            continue
        if f.angle:
            n = max(1, int(math.ceil(abs(f.angle) / _ORBIT_STEP)))
            L = f.length
            T = rot_s(f.tilt_ref)
            for k in range(1, n):
                dV, R = _arc(L * k / n, f.angle * k / n)
                pts.append([round(float(v), 7) for v in f.entrance.moved(T @ dV, T @ R @ T.T).V])
        pts.append([round(float(v), 7) for v in f.exit.V])
    return pts


def _runs(kinds: list[str], subs: list[str], bores: list, s_in: list[float], s_out: list[float],
          parents: list[int]) -> list[dict]:
    """Maximal runs of consecutive passive elements (drifts, markers, directives, the RF-focusing
    lenses) whose bores agree within 5 %: one beam-pipe tube each."""
    runs: list[dict] = []
    cur: dict | None = None
    for i, k in enumerate(kinds):
        if parents[i] >= 0:
            continue
        passive = k in PASSIVE or (k == "Taylor" and subs[i] == "rf_focusing")
        hx, hy, shape = bores[i][0], bores[i][1], bores[i][2]
        if passive and cur is not None and abs(hx - cur["bore"][0]) <= 0.05 * cur["bore"][0] \
                and abs(hy - cur["bore"][1]) <= 0.05 * cur["bore"][1] and shape == cur["shape"]:
            cur["el"].append(i)
            cur["s_out"] = s_out[i]
            continue
        if cur is not None:
            runs.append(cur)
            cur = None
        if passive:
            cur = {"id": len(runs), "bore": [round(hx, 5), round(hy, 5)], "shape": shape,
                   "s_in": s_in[i], "s_out": s_out[i], "el": [i]}
    if cur is not None:
        runs.append(cur)
    return runs


def scene_view(lat: Lattice, placed: list[Placed], *, fmt: str = "", path: str | Path | None = None,
               side: str = "src", shift: bool = True, children: bool = True,
               start: Frame | None = None) -> dict:
    """The payload for one lattice (its ``placed`` list from ``propagate``)."""
    start = start or site_frame()
    frames = frame_survey(placed, lat=lat, start=start, apply_shift=shift, expand_children=children)
    by_index = {p.index: p for p in placed}
    n = len(frames)
    warnings: list[str] = []

    elements: list[Element] = []
    placed_of: list[Placed] = []
    for f in frames:
        p = by_index[f.index]
        if f.parent is not None:
            c = lat.elements[f.child]
            elements.append(c)
            placed_of.append(Placed(element=c, index=p.index, s_in=f.s_in, s_out=f.s_out,
                                    reversed=p.reversed, path=p.path, ref_in=p.ref_in, ref_out=p.ref_in))
        else:
            elements.append(p.element)
            placed_of.append(p)
    pos_of_index = {f.index: k for k, f in enumerate(frames) if f.parent is None}

    subkinds: list[str] = [""]
    fam_index = {name: k for k, name in enumerate(FAMILIES)}
    kind_index = {name: k for k, name in enumerate(KINDS)}

    def intern(table: list[str], value: str) -> int:
        if value not in table:
            table.append(value)
        return table.index(value)

    bores, a_median = resolve_bores(elements)

    # free drift before and after every element (through zero-length elements), from the thick hardware around it
    exits_before: list[float] = []
    last_exit = frames[0].s_in if frames else 0.0
    for f, e in zip(frames, elements, strict=True):
        exits_before.append(last_exit)
        if f.parent is None and e.length > 0 and e.kind not in PASSIVE:
            last_exit = f.s_out
    entries_after: list[float] = [0.0] * n
    next_entry = frames[-1].s_out if frames else 0.0
    for k in range(n - 1, -1, -1):
        entries_after[k] = next_entry
        f, e = frames[k], elements[k]
        if f.parent is None and e.length > 0 and e.kind not in PASSIVE:
            next_entry = f.s_in

    col: dict[str, list] = {key: [] for key in (
        "name", "def", "kind", "sub", "fam", "i", "parent", "s", "L", "pin", "pc", "pout", "qin", "qc", "qout",
        "pb", "qb", "pch", "qch", "arc", "size", "ap", "apshape", "bore", "boresrc", "clear", "beta_in", "brho_in",
        "lambda_in", "strength", "flags", "label", "params")}
    raw_strength: list[float] = []
    for k, (f, e, p) in enumerate(zip(frames, elements, placed_of, strict=True)):
        ref = p.ref_in or lat.reference
        d = derived_numbers(p, lat)
        prm = _params(e, p, lat, d)
        sub = _sub_kind(e, f)
        fam = _family(e)
        hx_b, hy_b, shape, src = bores[k]
        clear_in = max(0.0, f.s_in - exits_before[k])
        clear_out = max(0.0, entries_after[k] - f.s_out)
        f_rf = prm.get("f") if isinstance(prm.get("f"), float) else None
        lam = C_LIGHT / f_rf if f_rf else (C_LIGHT / ref.rf_frequency_Hz if ref.rf_frequency_Hz else None)
        size_kind = "Instrument" if e.kind == "Marker" and fam else e.kind      # a marker that names a device
        size = outer_size(size_kind, sub, fam, float(e.length), (hx_b, hy_b), prm, lam, (clear_in, clear_out))
        flags = (F_REVERSED if f.reversed else 0) | (F_SHIFTED if f.shifted else 0) | (F_THIN if e.length <= 0 else 0) \
            | (F_CHILD if f.parent is not None else 0) | (F_SKEW if f.roll else 0) \
            | (F_ELECTRIC if getattr(e, "electric", False) else 0)
        if e.kind == "Directive" or sub == "rf_focusing":
            flags |= F_HIDDEN
        if sub == "rf_focusing":
            flags |= F_RF_FOCUSING
        # the chord frame of a bend: the arc's midpoint with the tangent along the chord (the centre frame's
        # tangent is the arc's, which is the chord direction at the midpoint too)
        chord = f.centre
        col["name"].append(f.name)
        col["def"].append(e.name)
        col["kind"].append(kind_index[e.kind])
        col["sub"].append(intern(subkinds, sub))
        col["fam"].append(fam_index[fam])
        col["i"].append(f.index)
        col["parent"].append(pos_of_index.get(f.parent, -1) if f.parent is not None else -1)
        col["s"].extend([round(f.s_in, 7), round(f.s_out, 7)])
        col["L"].append(round(float(e.length), 7))
        for key, frame in (("in", f.entrance), ("c", f.centre), ("out", f.exit), ("b", f.body), ("ch", chord)):
            col["p" + key].extend(_v(frame))
            col["q" + key].extend(_q(frame))
        col["arc"].extend([round(f.angle, 9), round(f.tilt_ref, 9)])
        col["size"].extend([round(max(v, 1e-4), 5) for v in size])      # a micron drift still draws
        ap = e.aperture
        col["ap"].extend([round(float(ap.half_x or 0.0), 5) if ap else 0.0,
                          round(float(ap.half_y or 0.0), 5) if ap else 0.0])
        col["apshape"].append(0 if ap is None else (2 if ap.shape == "RECTANGULAR" else 1))
        col["bore"].extend([round(hx_b, 5), round(hy_b, 5)])
        col["boresrc"].append(src)
        col["clear"].extend([round(clear_in, 5), round(clear_out, 5)])
        col["beta_in"].append(round(float(ref.beta), 7))
        col["brho_in"].append(round(float(ref.brho_signed), 7))
        col["lambda_in"].append(round(lam, 7) if lam else 0.0)
        col["flags"].append(flags)
        col["label"].append(_label(e, d, prm))
        col["params"].append(prm or None)
        raw_strength.append(_strength(e, d, prm))
    # strengths normalised per kind to [-1, 1]
    peak: dict[int, float] = {}
    for kk, v in zip(col["kind"], raw_strength, strict=True):
        peak[kk] = max(peak.get(kk, 0.0), abs(v))
    col["strength"] = [round(v / peak[kk], 4) if peak.get(kk) else 0.0
                       for kk, v in zip(col["kind"], raw_strength, strict=True)]

    orbit = _orbit(frames, start)
    pts = np.array(orbit + [col["pb"][3 * k: 3 * k + 3] for k in range(n)], dtype=float) if n else np.zeros((1, 3))
    lo, hi = pts.min(axis=0), pts.max(axis=0)
    runs = _runs([KINDS[k] for k in col["kind"]], [subkinds[s] for s in col["sub"]], bores,
                 col["s"][0::2], col["s"][1::2], col["parent"])
    n_children = sum(1 for f in frames if f.parent is not None)
    ref0 = lat.reference
    lattice = {
        "name": lat.name, "file": str(path) if path else None, "format": fmt, "side": side,
        "n": n, "n_children": n_children, "total_length": round(float(placed[-1].s_out), 7) if placed else 0.0,
        "units": {"length": "m", "angle": "rad"},
        "start": {"V": _v(start), "q": _q(start), "angles": [round(a, 12) for a in start.angles()]},
        "bbox": {"min": [round(float(v), 6) for v in lo], "max": [round(float(v), 6) for v in hi]},
        "reference": {"species": ref0.species.name, "kinetic_energy_eV": float(ref0.kinetic_energy_eV),
                      "rf_frequency_Hz": ref0.rf_frequency_Hz},
        "a_median": round(a_median, 5) if a_median is not None else None,
        "floor_y": round(min(float(lo[1]), 0.0) - 1.2, 4),
        "shift": shift, "children": children, "warnings": warnings,
    }
    return {"schema": SCHEMA, "versions": {"lattix": lattix_version, "lattix_view": __version__},
            "lattice": lattice, "kinds": KINDS, "subkinds": subkinds, "families": FAMILIES,
            "bore_sources": list(BORE_SOURCES), "el": col, "runs": runs, "orbit": orbit}


def energy_gain_of(e: Element, p: Placed, lat: Lattice) -> float:   # kept for callers that want the walk's rule
    return float(energy_gain_eV(e, p.ref_in or lat.reference))
