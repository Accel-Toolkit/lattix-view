"""Shared fixtures: the public sample decks of lattix (a checkout's tests/data/public, or
LATTIX_PUBLIC_DECKS when lattix is installed from a wheel)."""
from __future__ import annotations

from pathlib import Path

import pytest
from lattix.crossval import PUBLIC


def deck_path(rel: str) -> Path:
    p = PUBLIC / rel
    if not p.is_file():
        pytest.skip(f"public deck {rel} not available (set LATTIX_PUBLIC_DECKS to lattix's tests/data/public)")
    return p


def load(rel: str, fmt: str | None = None, **opts):
    from lattix.formats import read
    from lattix.ir.walk import propagate

    lat, rep = read(deck_path(rel), fmt, **opts)
    return lat, propagate(lat), rep
