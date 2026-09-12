"""Outer dimensions.  The lattix IR knows apertures and nothing else about hardware size, so the
viewer sizes every model from its bore with per-kind heuristics: a quadrupole's yoke is a few
bore radii, a cavity's cell radius follows its frequency, a dipole's gap is twice ``hgap``.  The
numbers are typical of real machines and are documented in ``docs/models.md``; a site that wants
true shapes supplies glTF overrides."""
from __future__ import annotations

import statistics

from lattix.ir.elements import Element

C_LIGHT = 299_792_458.0

DEFAULT_BORE = 0.030          # m, when a deck has no aperture anywhere
NEIGHBOUR_REACH = 12          # how far (in elements) a bore is borrowed from

#: source of a resolved bore: the element's own aperture, a neighbour's, the deck median, the default
BORE_SOURCES = ("aperture", "neighbour", "deck_median", "default")

#: drawn length [m] of zero-length hardware, before the free-gap clamp
THIN_LENGTH: dict[str, float] = {
    "Kicker": 0.10, "Instrument": 0.08, "Collimator": 0.02, "RFCavity": 0.02, "Multipole": 0.010,
    "Marker": 0.002, "Foil": 0.005, "Taylor": 0.02,
}


def own_bore(e: Element) -> tuple[float, float, int] | None:
    """``(half_x, half_y, shape)`` of an element's own aperture (shape 1 = elliptical, 2 = rectangular),
    or None; a missing axis copies the other."""
    ap = e.aperture
    if ap is None:
        return None
    hx, hy = ap.half_x, ap.half_y
    if hx is None and hy is None:
        return None
    hx = hx if hx is not None else hy
    hy = hy if hy is not None else hx
    if not (hx > 0 and hy > 0):
        return None
    return float(hx), float(hy), 2 if ap.shape == "RECTANGULAR" else 1


def resolve_bores(elements: list[Element]) -> tuple[list[tuple[float, float, int, int]], float | None]:
    """A bore for every element: its own, else the nearest neighbour's (upstream first, within
    ``NEIGHBOUR_REACH``), else the deck median of the half-widths, else ``DEFAULT_BORE``.  Returns
    ``(bores, median)`` with each bore ``(half_x, half_y, shape, source_index)``."""
    own = [own_bore(e) for e in elements]
    widths = [b[0] for b in own if b is not None]
    median = statistics.median(widths) if widths else None
    out: list[tuple[float, float, int, int]] = []
    for i, b in enumerate(own):
        if b is not None:
            out.append((b[0], b[1], b[2], 0))
            continue
        found = None
        for d in range(1, NEIGHBOUR_REACH + 1):
            for j in (i - d, i + d):
                if 0 <= j < len(own) and own[j] is not None:
                    found = own[j]
                    break
            if found is not None:
                break
        if found is not None:
            out.append((found[0], found[1], found[2], 1))
        elif median is not None:
            out.append((median, median, 1, 2))
        else:
            out.append((DEFAULT_BORE, DEFAULT_BORE, 1, 3))
    return out, median


def wavelength(freq_hz: float | None) -> float | None:
    return C_LIGHT / freq_hz if freq_hz else None


def thin_length(kind: str, clear_in: float, clear_out: float) -> float:
    """The drawn length of a zero-length element: its nominal length clamped to the free gap."""
    nominal = THIN_LENGTH.get(kind, 0.02)
    gap = 0.9 * min(clear_in, clear_out)
    return max(0.004, min(nominal, gap)) if gap > 0 else 0.004


def outer_size(kind: str, sub: str, fam: str, L: float, bore: tuple[float, float], params: dict,
               lam: float | None, clear: tuple[float, float]) -> tuple[float, float, float]:
    """Half-extents ``(hx, hy, hz)`` [m] of the element's body in its body frame, ``hz`` along s."""
    hx_b, hy_b = bore
    a = max(hx_b, hy_b)
    L_draw = L if L > 0 else thin_length(kind, *clear)
    hz = L_draw / 2.0
    if kind == "Drift":
        r = a + max(0.002, 0.05 * a)
        return r, r, hz
    if kind == "Quadrupole":
        R = max(4.5 * a, 0.12) if L > 0 else 2.5 * a
        return R, R, hz
    if kind in ("Sextupole", "Octupole"):
        R = max(4.0 * a, 0.10) if L > 0 else 2.5 * a
        return R, R, hz
    if kind == "Multipole":
        R = 2.5 * a
        return R, R, hz
    if kind == "Bend":
        hgap = float(params.get("hgap") or 0.0)
        g = 2.0 * hgap if hgap > 0 else 2.0 * hy_b
        w_p = max(2.0 * hx_b + 2.0 * g, 0.08)
        h_p, w_c, t = max(1.2 * g, 0.05), max(1.0 * g, 0.04), max(1.5 * g, 0.05)
        W_y = w_p + 2.0 * w_c + 2.0 * t
        H_y = g + 2.0 * h_p + 2.0 * t
        chord = float(params.get("chord") or L)
        return W_y / 2.0, H_y / 2.0, max(chord / 2.0, 0.01)
    if kind == "Solenoid" or (kind == "FieldMap" and sub == "solenoid"):
        R = max(3.0 * a, 0.08)
        B = abs(float(params.get("B") or params.get("B_eff") or 0.0))
        if B >= 3.0:
            R = max(4.0 * a, 0.15)
        return R, R, hz + 0.02
    if kind in ("RFCavity", "FieldMap", "NCells", "Superposition") or (kind == "FieldMap" and sub == "rf"):
        if kind == "RFCavity" and L <= 0:
            r = 1.8 * a
            return r, r, hz
        if lam is None:
            r = max(2.0 * a, 0.05)
            return r, r, hz
        if kind == "NCells":
            R = 0.30 * lam
        elif sub == "tw":
            R = 0.40 * lam
        else:
            beta = float(params.get("beta") or 1.0)
            R = 0.38 * lam if beta >= 0.5 else 0.25 * lam
        R = min(max(R, 0.05), 1.0) + 0.03
        return R, R, hz
    if kind == "RFQCell":
        w = 0.20 * lam if lam else max(6.0 * a, 0.10)
        return w, w, hz
    if kind == "Kicker" or fam in ("corrector_h", "corrector_v", "chopper"):
        w = max(3.0 * a, 0.08)
        return w, w, hz
    if kind == "Collimator" or fam in ("collimator", "absorber"):
        R = max(3.0 * a, 0.08)
        return R, R, max(hz, 0.01)
    if kind == "Foil":
        w = 2.0 * a + 0.01
        return w, w, max(hz, 0.0025)
    if kind == "Marker":
        r = a + 0.01
        return r, r, 0.001
    if kind == "Instrument":
        if fam in ("bpm", "bpm_h", "bpm_v", "phase"):
            r = a + 0.02
            return r, r, max(hz, 0.02)
        if fam in ("profile", "wire", "screen", "laser", "emittance", "cup"):
            return a + 0.02, 3.0 * a + 0.06, max(hz, 0.05)
        if fam in ("current", "current_gap"):
            r = 2.5 * a + 0.02 + 0.4 * a + 0.02
            return r, r, max(hz, 0.03)
        if fam == "loss":
            return 0.29, 0.04, 0.075
        if fam == "valve":
            return 2.0 * a + 0.03, 2.0 * a + 0.06, 0.03
        return a + 0.02, a + 0.08, max(hz, 0.03)
    if kind == "Taylor":
        w = 2.0 * a
        return w, w, hz
    if kind in ("Patch", "ReferenceChange", "Freq", "Directive"):
        return 0.05, 0.05, 0.001
    r = 2.0 * a
    return r, r, hz
