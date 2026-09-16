# lattix-view

A 3D viewer for accelerator lattices. Every lattice that [lattix](https://github.com/Accel-Toolkit/lattix)
reads, twenty-eight formats, is drawn element by element on its survey coordinates, with a model
per element, a hover label, measurement tools and exports. It runs in the browser as a tab of the
lattix workbench (`lattix ui`) or on its own, and loads nothing from the network.

![the CSR chicane: dipoles, quadrupoles and the beam pipe on the survey, with labels](https://raw.githubusercontent.com/Accel-Toolkit/lattix-view/v0.1.0/docs/img/chicane.png)

```bash
pip install lattix-view                # brings lattix 0.2.0 or later with it
lattix ui --root decks/                # the workbench, now with a 3D tab
lattix-view view linac.dat             # the 3D page for one deck
lattix-view scene linac.dat -o scene.json                    # the scene as JSON, no server
lattix-view overrides linac.dat --overrides site.yaml        # which of a site's models replace which elements
```

## What it does

- **Every element on its survey frame.** Positions and orientations at the entrance, centre
  and exit of every element, and the misaligned body frame, come from `lattix.ir.frames`, held to
  the surveys of MAD-X, xtrack and Bmad; vertical bends, rolled bends, patches and misalignments
  included. The site pose (the MAD-X `SURVEY` start) puts the whole scene in site coordinates.
- **A model for every element.** Twenty procedural archetypes sized from the element's own
  parameters: multipole magnets with poles and coils, sector and rectangular dipoles with pole
  faces swept along the arc, solenoids, elliptical, spoke, half-wave and travelling-wave
  cavities, DTL tanks with drift tubes, RFQ vanes, correctors, collimators, foils, BPMs, profile,
  current and loss monitors, valves, markers, patches, field-map extents; the beam pipe through
  everything with the deck's apertures. A site replaces any of them with its own glTF through
  YAML rules (`docs/overrides.md`).
- **Measurement on the frames, not on the pixels.** Distances between snapped frame points or
  beam-axis points, gaps and angles between elements, headings, coordinate probes and a section
  plane, at 12 significant digits in the copied table (`docs/measure.md`).
- **Exports.** The survey table (CSV, JSON) from lattix's own route, the scene as glTF or OBJ
  with one named node per element, screenshots at up to 4×, turntable and fly-through video
  (`docs/exports.md`).
- **Kept in step with the workbench.** Selection, hover, cursor, theme and the per-kind colours
  are shared with the 2D synoptic and floor plan; `b` looks along the beam at the selection,
  `r` rides it.
- **Scale.** Chunks with three levels of detail keep a 2500-element linac at 50 draw calls from
  afar and full detail up close; picking walks only what is on screen.

<p>
<img alt="the measurement tools on the chicane: a distance, an angle and a heading" src="https://raw.githubusercontent.com/Accel-Toolkit/lattix-view/v0.1.0/docs/img/measure.png" width="49%">
<img alt="a DTL section: tanks with drift tubes, quadrupoles and solenoids" src="https://raw.githubusercontent.com/Accel-Toolkit/lattix-view/v0.1.0/docs/img/dtl.png" width="49%">
</p>

![the FRIB linac from above: three segments and two folding sections, 2549 elements](https://raw.githubusercontent.com/Accel-Toolkit/lattix-view/v0.1.0/docs/img/frib_top.png)

## Documentation

`docs/index.md` is the map: running it (`standalone.md`, with the keys), the model library and
its sizing rules (`models.md`), a site's own models (`overrides.md`), the tools (`measure.md`),
the exports (`exports.md`). The conventions of the frames are lattix's (`docs/conventions.md`
there, "Survey frames").

## Development

```bash
git clone https://github.com/Accel-Toolkit/lattix.git       # the public sample decks live there
git clone https://github.com/Accel-Toolkit/lattix-view.git
cd lattix-view && pip install -e ../lattix -e ".[dev,browser]" && playwright install chromium
pytest                     # Python and, with node, the JavaScript tests
pytest tests/e2e           # headless Chromium: three decks, tools, exports, overrides, budgets, goldens
lattix-view check
```

`CONTRIBUTING.md` has the rules. The page is offline and self-contained; three.js r186 is
vendored under its MIT licence (`THIRD_PARTY.md`), pinned by checksum. Licence: BSD-3-Clause.
Cite it with `CITATION.cff`.
