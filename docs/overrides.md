# Overrides: a site's own models

Every element is drawn from a procedural model sized by its own parameters (`models.md`). An
override file replaces that model for a kind, an instrument family, a definition or a named element
with a glTF file of the site's own, re-parameterises a procedural archetype, or hides the element.
Nothing else changes: the element keeps its survey frame, its label, its place in the pipe run, the
measurement snap points and the exports.

## Where the files are found

Files are read in this order, and among rules that match equally well the later file wins:

1. `$XDG_CONFIG_HOME/lattix-view/overrides.yaml` (`~/.config/lattix-view/overrides.yaml`), or
   `$LATTIX_VIEW_CONFIG_DIR/overrides.yaml` when that variable is set;
2. every path in `LATTIX_VIEW_OVERRIDES` (separated like `PATH`);
3. beside the deck: `<deck>.view.yaml` (`linac.dat.view.yaml`) and `<stem>.view.yaml` (`linac.view.yaml`);
4. `lattix-view view --overrides FILE` (may repeat).

Missing files are skipped silently; a file that does not parse is reported and skipped, and the
others still apply. The page lists the files it used under the `models` button.

## The file

```yaml
version: 1
models_dir: ./models           # model paths in the rules are relative to this directory (relative to the file)
defaults:                      # applied to every rule of this file that does not say otherwise
  units: m                     # m | cm | mm: the unit the files were authored in
  up: +y                       # the file's up axis and beam axis, mapped onto the body frame's +y and +z
  forward: +z
  anchor: centre               # centre | entrance | exit | chord
  fit: none                    # none | length | bore | box
rules:
  - match: {kind: Quadrupole}
    model: quad_generic.glb
    fit: length
    materials: kind
  - match: {kind: Instrument, family: bpm}
    model: bpm_button.glb
    anchor: entrance
    offset: [0, 0, 0.05]
  - match: {name: "QD*"}
    model: qd_series.glb
    scale: 0.001               # a file authored in millimetres, when the file's defaults say metres
    rotate: [0, 0, 90]
  - match: {name: "CAV_HWR_*"}
    archetype: cavity
    params: {n_cell: 2}
  - match: {name: "I?MW*"}
    family: wire
  - match: {name: BPM01}
    hide: true
```

### `match`

All given keys must hold. `name` and `def` are case-insensitive globs (`*`, `?`, `[...]`) on the
placed name and the definition name; `kind` is a lattix kind (`Quadrupole`, `Bend`, `RFCavity`,
`Instrument`, ...); `sub` a sub-kind as the payload reports it (`sector`, `rect`, `sw`, `tw`, `solenoid`,
`quad`, `rf`, `n1`...); `family` an instrument family after normalisation (`bpm`, `profile`, `loss`,
`current`, `valve`, ...) or the deck's own family keyword; `format` the source format
(`madx`, `tracewin`, `bmad`, ...); `original_type` the element type in the source deck (`MONITOR`,
`SBEND`, `DIAG_POSITION`, ...).

Precedence is by specificity first, order second: an exact `name` beats a `name` or `def` glob,
which beats `kind` with `sub` or `family`, which beats `kind`, `family` or `original_type` alone.
Among rules of the same specificity the later one wins, across files in the discovery order above.
One rule applies per element.

### The action: exactly one of

- `model: FILE`: a `.glb`, or a `.gltf` whose buffers and images are embedded. The path is resolved
  under `models_dir` and must stay inside it. External `.bin` files, Draco meshes and KTX2 textures
  are not served, and the page reports such a file as failed.
- `archetype: NAME` with optional `params`: a procedural model built as if the element were of
  that archetype. Archetypes: `pipe`, `multipole` (`params: {n: 2|3|4}` pole pairs), `dipole`
  (`hgap`, `rect`), `solenoid` (`B`, `L_eff`), `cavity` (`n_cell`, `L_active`), `dtl` (`n_cells`),
  `rfq` (`r0`, `modulation`), `corrector` (`hkick`, `vkick`, `electric`), `collimator`, `foil`,
  `bpm`, `profile`, `current`, `sidedetector`, `valve`, `generic`, `abstract`, `ring`, `triad`,
  `flag`, `mapextent` (`r_max`). Parameters not listed come from the element itself.
- `family: NAME`: the element is drawn as a device of that instrument family, at that family's
  size (`bpm`, `bpm_h`, `bpm_v`, `phase`, `profile`, `wire`, `screen`, `laser`, `emittance`, `cup`,
  `current`, `current_gap`, `loss`, `valve`, `pump`, `chopper`, `corrector`, `corrector_h`,
  `corrector_v`, `collimator`, `absorber`, `generic`). This is how a site teaches the viewer its
  own device names when the deck's words say nothing (`match: {name: "I?MW*"}` with
  `family: wire`); see "Markers that name a device" in `models.md`.
- `hide: true`: the element is not drawn. It keeps its survey frames, so its label, its snap
  points and its rows in the survey table stay; the scene exports (glTF, OBJ) leave it out.

### Placement of a `model`

The model frame is the element's **body frame**: the centre of the element after any misalignment,
`+z` along the beam, `+y` up, `+x` to the left looking downstream (lattix's survey frame). A bend's
body frame is the frame at the arc midpoint. The file is placed as

```
position + R(rotate) · basis(up, forward) · (scale · units · p_file)
```

- `units` scales the file first.
- `up` and `forward` name which file axes are the model's up and beam directions; the basis maps
  them onto `+y` and `+z`. glTF is `+y` up by convention, so most files need only `forward`.
- `fit`: `length` scales the model uniformly so its extent along the beam equals the element
  length `L` (for a zero-length element, its drawn length); `bore` so its declared bore, or half
  its smaller transverse extent, equals the element's bore radius; `box` scales each axis to the
  procedural model's outer dimensions; `none` keeps the file's size.
- `scale` (a number or three numbers) multiplies on top of the fit.
- `rotate` `[rx, ry, rz]` in degrees, applied in the body frame in XYZ order.
- `anchor`: where the file's origin sits. `centre` puts it at the body-frame origin; `entrance`
  and `exit` at `-L/2` and `+L/2` along `z`; `chord` is the centre for straight elements and the
  chord midpoint for bends.
- `offset` `[x, y, z]` in metres, in the body frame, after everything else.
- `materials`: `keep` uses the file's materials; `kind` replaces them with the element's kind
  colour from the workbench palette; `tint` blends the file's colours 40 % toward that colour.

A file may declare its own contract instead of being measured: a root node with `extras.lattix`
of `{anchor, length_m, bore_m}` wins over the bounding box for `fit: length` and `fit: bore`, and
its `anchor` wins over the rule's. Author site models with the beam along `+z`, `+y` up, the
origin at the element centre and lengths in metres, and no `defaults` are needed.

Sub-kinds, families and parameters the page uses are visible in the scene payload
(`lattix-view scene deck -o scene.json`).

## Checking a file

```bash
lattix-view overrides linac.dat --overrides site.yaml
```

prints the files that apply, every rule in order, the rule and action of every affected element,
and the errors, and exits 1 when anything went wrong. In the page the `models` button opens the
same report for the loaded deck: each replaced element with its file, fit and measured extent, each
hidden or re-parameterised one, and every failure (`file not found`, `escapes models_dir`, a file
GLTFLoader could not parse). A failed rule keeps the procedural model, so a broken file never blanks
the scene.

## Serving

The page fetches models only through `/plugins/lattix_view/models/<handle>`, where the handle is
derived from the file's path when a rule names it; nothing else on the disk is reachable through
that route, and a rule whose path escapes `models_dir` is refused. Handles are per server process
and carry the workbench token like every other request.
