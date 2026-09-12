"""glTF overrides: a site replaces the procedural model of a kind, an instrument family or a named
element with its own file, through YAML rule files.  Files are found in the user's configuration
directory, in ``LATTIX_VIEW_OVERRIDES``, beside the deck (``<deck>.view.yaml``) and on the command
line, in that order; later files and later rules win among equals, and a more specific match wins
over a less specific one (exact name, then a name or definition glob, then kind with sub-kind or
family, then kind).  Model files are served only through registered handles, never by path."""
from __future__ import annotations

import fnmatch
import hashlib
import os
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, model_validator

ANCHORS = ("centre", "entrance", "exit", "chord")
FITS = ("none", "length", "bore", "box")
MATERIALS = ("keep", "kind", "tint")


class Match(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = None            # placed name, fnmatch glob, case-insensitive
    def_: str | None = Field(default=None, alias="def")
    kind: str | None = None
    sub: str | None = None
    family: str | None = None
    format: str | None = None
    original_type: str | None = None

    def specificity(self) -> int:
        if self.name and not any(c in self.name for c in "*?["):
            return 4
        if self.name or self.def_:
            return 3
        if self.kind and (self.sub or self.family):
            return 2
        if self.kind or self.family or self.original_type:
            return 1
        return 0

    def matches(self, e: dict) -> bool:
        def glob(pat: str | None, value: str | None) -> bool:
            return pat is None or (value is not None and fnmatch.fnmatchcase(value.lower(), pat.lower()))
        family_ok = self.family is None or self.family.lower() == (e.get("family") or "").lower()
        type_ok = self.original_type is None or self.original_type.upper() == (e.get("original_type") or "").upper()
        return (glob(self.name, e.get("name")) and glob(self.def_, e.get("def"))
                and (self.kind is None or self.kind == e.get("kind"))
                and (self.sub is None or self.sub == e.get("sub"))
                and family_ok and (self.format is None or self.format == e.get("format")) and type_ok)


class Rule(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    match: Match
    model: str | None = None                 # a .glb / .gltf relative to models_dir
    archetype: str | None = None             # or a procedural archetype with parameters
    params: dict = Field(default_factory=dict)
    hide: bool = False
    anchor: Literal["centre", "entrance", "exit", "chord"] | None = None
    fit: Literal["none", "length", "bore", "box"] | None = None
    scale: float | list[float] = 1.0
    rotate: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])     # degrees, XYZ, in the body frame
    offset: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])     # metres, body frame, after fitting
    materials: Literal["keep", "kind", "tint"] = "keep"

    @model_validator(mode="after")
    def _one_action(self):
        if sum(bool(x) for x in (self.model, self.archetype, self.hide)) != 1:
            raise ValueError("a rule needs exactly one of model, archetype or hide")
        if len(self.rotate) != 3 or len(self.offset) != 3:
            raise ValueError("rotate and offset take three numbers")
        if isinstance(self.scale, list) and len(self.scale) != 3:
            raise ValueError("scale is a number or three numbers")
        return self


class Defaults(BaseModel):
    model_config = ConfigDict(extra="forbid")
    units: Literal["m", "mm", "cm"] = "m"
    up: Literal["+y", "-y", "+z", "-z", "+x", "-x"] = "+y"
    forward: Literal["+z", "-z", "+x", "-x", "+y", "-y"] = "+z"
    anchor: Literal["centre", "entrance", "exit", "chord"] = "centre"
    fit: Literal["none", "length", "bore", "box"] = "none"


class OverrideFile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = 1
    models_dir: str = "."
    defaults: Defaults = Field(default_factory=Defaults)
    rules: list[Rule] = Field(default_factory=list)


class LoadedRule(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    rule: Rule
    source: Path
    order: int
    models_dir: Path
    defaults: Defaults


def load_file(path: Path, order: int) -> list[LoadedRule]:
    doc = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    f = OverrideFile.model_validate(doc)
    if f.version != 1:
        raise ValueError(f"{path}: overrides version {f.version} is not supported (1)")
    base = (path.parent / f.models_dir).resolve()
    return [LoadedRule(rule=r, source=path, order=order * 10_000 + k, models_dir=base, defaults=f.defaults)
            for k, r in enumerate(f.rules)]


#: files named on the command line (``lattix-view view --overrides``), applied last
CLI_FILES: list[Path] = []


def discover(deck: Path | None, extra: list[Path] | None = None) -> list[Path]:
    """The override files that apply, earliest first."""
    out: list[Path] = []
    base = os.environ.get("LATTIX_VIEW_CONFIG_DIR")
    cfg = Path(base) if base else Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config") / "lattix-view"
    out.append(cfg / "overrides.yaml")
    for item in (os.environ.get("LATTIX_VIEW_OVERRIDES") or "").split(os.pathsep):
        if item.strip():
            out.append(Path(item.strip()).expanduser())
    if deck is not None:
        out.append(deck.with_suffix(deck.suffix + ".view.yaml"))
        out.append(deck.with_name(deck.stem + ".view.yaml"))
    out.extend(CLI_FILES)
    out.extend(extra or [])
    seen: set[Path] = set()
    found: list[Path] = []
    for p in out:
        rp = p.resolve()
        if rp.is_file() and rp not in seen:
            seen.add(rp)
            found.append(rp)
    return found


def load_all(paths: list[Path], errors: list[str] | None = None) -> list[LoadedRule]:
    rules: list[LoadedRule] = []
    for k, p in enumerate(paths):
        try:
            rules.extend(load_file(p, k))
        except Exception as exc:  # noqa: BLE001 - a bad file is reported, the others still apply
            if errors is not None:
                errors.append(f"{p}: {type(exc).__name__}: {exc}")
    return rules


def resolve(rules: list[LoadedRule], e: dict) -> LoadedRule | None:
    """The rule for one element (``name, def, kind, sub, family, format, original_type``)."""
    best: LoadedRule | None = None
    for lr in rules:
        if not lr.rule.match.matches(e):
            continue
        if best is None or (lr.rule.match.specificity(), lr.order) >= (best.rule.match.specificity(), best.order):
            best = lr
    return best


class ModelRegistry:
    """Model files by handle, so the page can fetch only what a rule named."""

    def __init__(self) -> None:
        self._files: dict[str, Path] = {}

    def register(self, path: Path) -> str:
        rp = path.resolve()
        h = hashlib.sha256(str(rp).encode("utf-8")).hexdigest()[:16]
        self._files[h] = rp
        return h

    def get(self, handle: str) -> Path | None:
        return self._files.get(handle)


def assignments(rules: list[LoadedRule], elements: list[dict], registry: ModelRegistry, prefix: str,
                errors: list[str] | None = None) -> dict:
    """The payload's ``overrides`` block for a list of element dicts (index order): model handles and
    per-element assignments."""
    models: dict[str, dict] = {}
    assign: dict[str, dict] = {}
    seen: set[str] = set()

    def problem(msg: str) -> None:            # one line per file and cause, not one per element
        if errors is not None and msg not in seen:
            seen.add(msg)
            errors.append(msg)

    for i, e in enumerate(elements):
        lr = resolve(rules, e)
        if lr is None:
            continue
        r = lr.rule
        if r.hide:
            assign[str(i)] = {"hide": True, "rule": str(lr.source.name)}
            continue
        entry: dict = {"anchor": r.anchor or lr.defaults.anchor, "fit": r.fit or lr.defaults.fit,
                       "scale": r.scale if isinstance(r.scale, list) else [r.scale] * 3, "rotate": list(r.rotate),
                       "offset": list(r.offset), "materials": r.materials, "units": lr.defaults.units,
                       "up": lr.defaults.up, "forward": lr.defaults.forward, "rule": str(lr.source.name)}
        if r.archetype:
            entry["archetype"] = r.archetype
            entry["params"] = dict(r.params)
        else:
            path = (lr.models_dir / r.model).resolve()
            if lr.models_dir not in path.parents and path != lr.models_dir:
                problem(f"{lr.source}: model {r.model!r} escapes models_dir")
                continue
            if not path.is_file():
                problem(f"{lr.source}: model file not found: {path}")
                continue
            if path.suffix.lower() not in (".glb", ".gltf"):
                problem(f"{lr.source}: {path.name} is not a .glb or .gltf")
                continue
            h = registry.register(path)
            models[h] = {"file": path.name, "url": f"{prefix}/models/{h}", "bytes": path.stat().st_size}
            entry["model"] = h
        assign[str(i)] = entry
    return {"models": models, "assign": assign}
