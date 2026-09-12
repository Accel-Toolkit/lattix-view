"""Instrument families.  ``Instrument.family`` in lattix is an open set: sixteen format-neutral
names, the TraceWin diagnostic card names, and any unknown label-only keyword.  The viewer draws a
closed set of archetypes, so every family folds onto one of these, with ``generic`` for the rest."""
from __future__ import annotations

FAMILIES: list[str] = [
    "", "bpm", "bpm_h", "bpm_v", "phase", "profile", "wire", "screen", "laser", "emittance",
    "current", "current_gap", "loss", "valve", "chopper", "corrector_h", "corrector_v", "corrector",
    "collimator", "absorber", "cup", "pump", "generic",
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


#: words a deck uses in names, comments and MAD-style types for the devices a marker stands for
_WORDS: dict[str, str] = {
    "BPM": "bpm", "MONITOR": "bpm", "HMONITOR": "bpm_h", "VMONITOR": "bpm_v", "PICKUP": "bpm", "BPMS": "bpm",
    "PHASE": "phase", "BLM": "loss", "LOSS": "loss", "LOSSMONITOR": "loss",
    "WS": "wire", "WIRE": "wire", "WIRESCANNER": "wire", "MW": "wire", "MWS": "wire", "MULTIWIRE": "wire",
    "HARP": "wire", "SEM": "wire", "SCREEN": "screen", "OTR": "screen", "YAG": "screen",
    "VIEWER": "screen", "PROFILE": "profile", "PROFILEMONITOR": "profile", "EMITTANCE": "emittance",
    "EMIT": "emittance", "SLIT": "emittance", "LASER": "laser", "LASERWIRE": "laser",
    "FC": "cup", "CUP": "cup", "FARADAY": "cup", "FARADAYCUP": "cup",
    "ACCT": "current", "DCCT": "current", "BCM": "current", "TOROID": "current", "CURRENT": "current",
    "RWCM": "current_gap", "WCM": "current_gap",
    "PUMP": "pump", "IONPUMP": "pump", "IP": "pump", "NEG": "pump", "GETTER": "pump",
    "VALVE": "valve", "GV": "valve", "GATEVALVE": "valve", "FASTVALVE": "valve",
    "KICKER": "corrector", "CORRECTOR": "corrector", "CORR": "corrector", "STEERER": "corrector",
    "STEER": "corrector",
    "HKICKER": "corrector_h", "HKICK": "corrector_h", "HCOR": "corrector_h", "HCORR": "corrector_h",
    "XCOR": "corrector_h",
    "HSTEER": "corrector_h", "HSTEERER": "corrector_h", "DCH": "corrector_h",
    "VKICKER": "corrector_v", "VKICK": "corrector_v", "VCOR": "corrector_v", "VCORR": "corrector_v",
    "YCOR": "corrector_v",
    "VSTEER": "corrector_v", "VSTEERER": "corrector_v", "DCV": "corrector_v",
    "CHOPPER": "chopper", "COLLIMATOR": "collimator", "COLL": "collimator", "SCRAPER": "collimator",
    "JAW": "collimator",
    "ABSORBER": "absorber", "DUMP": "absorber", "BEAMSTOP": "absorber", "STOP": "absorber",
}


def family_from_words(words) -> str:
    """The family the first recognised word names (a deck's own device vocabulary, such as the type
    words of a TraceWin trailing comment or a marker's name), or "" when none is recognised."""
    for w in words or ():
        fam = _WORDS.get(str(w).strip().upper().split("=")[0])
        if fam:
            return fam
    return ""
