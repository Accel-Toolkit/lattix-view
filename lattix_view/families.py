"""Instrument families.  ``Instrument.family`` in lattix is an open set: sixteen format-neutral
names, the TraceWin diagnostic card names, and any unknown label-only keyword.  The viewer draws a
closed set of archetypes, so every family folds onto one of these, with ``generic`` for the rest."""
from __future__ import annotations

FAMILIES: list[str] = [
    "", "bpm", "bpm_h", "bpm_v", "phase", "profile", "wire", "screen", "laser", "emittance",
    "current", "current_gap", "loss", "valve", "chopper", "corrector_h", "corrector_v",
    "collimator", "absorber", "cup", "generic",
]

_MAP: dict[str, str] = {
    "BPM": "bpm", "MONITOR": "bpm", "DIAG_POSITION": "bpm",
    "HMONITOR": "bpm_h", "HMON": "bpm_h", "VMONITOR": "bpm_v", "VMON": "bpm_v",
    "DIAG_PHASE": "phase", "PHASE_DUMP": "phase",
    "PROFILE": "profile", "SIZE": "profile", "DIAG_SIZE": "profile",
    "WIRE": "wire", "LASERPROFILE": "laser", "DIAG_EMIT": "emittance", "SLM": "screen",
    "ACCT": "current", "DCCT": "current", "CURRENT": "current", "RWCM": "current_gap",
    "BLM": "loss", "FASTGV": "valve", "CHOPPER": "chopper",
    "XCOR": "corrector_h", "YCOR": "corrector_v",
    "COL": "collimator", "MEBTABSORBER": "absorber", "FFC": "cup",
    "INSTRUMENT": "generic", "PLACEHOLDER": "generic", "DETECTOR": "generic", "WATCH": "generic",
    "ASCN": "generic", "RPU": "generic", "DPI": "generic",
}


def family_of(family: str | None) -> str:
    """The archetype family of an instrument's family keyword (``generic`` when unknown)."""
    if not family:
        return "generic"
    return _MAP.get(str(family).strip().upper(), "generic")
