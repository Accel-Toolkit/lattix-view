# Changelog

All notable changes to lattix-view are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[PEP 440](https://peps.python.org/pep-0440/).

## [Unreleased]

### Added
- The scene payload (`lattix-view.scene/1`): every element's entrance, centre, exit and body
  frames from lattix's floor frames, a bore for every element (its own aperture, a neighbour's,
  the deck median, a default), outer dimensions from per-kind heuristics, instrument families
  folded onto a closed set of archetypes, beam-pipe runs, the reference orbit, and a headline
  label per element.
- The workbench plugin: a `3D` tab in `lattix ui`, served under `/plugins/lattix_view/` with the
  page's own content policy, kept in step with the workbench through its plugin bridge.
- `lattix-view view` (the 3D page for one deck, on the workbench server), `lattix-view scene`
  (the payload as JSON) and `lattix-view check`.
- A first scene: one box per element on its body frame, coloured by kind, the reference orbit,
  a floor grid, orbit camera, top, side and front views, hover labels, click to select.
- three.js r186 vendored offline (`tools/vendor_three.py`, checksum-verified, minified).
- The model library: twenty procedural archetypes built from each element's own parameters and
  bore (multipole magnets, sector and rectangular dipoles with pole faces, solenoids, cavity
  trains, DTL tanks, RFQ vanes, correctors, collimators, foils, BPMs, profile and current
  monitors, loss monitors, valves, markers, patches and field-map extents), merged per material
  slot with per-vertex colour, in a realistic and a schematic style, both themes.
- Interaction: orbit, fly and ride-the-beam cameras; top, side, front, isometric and beam's-eye
  views matching the 2D floor plan; hover labels and pinned labels; search by name, index or `s`;
  a view gizmo, scale bar and floor grid; x-ray; selection and hover shared with the workbench.
- Measurement: point-to-point distance, element gap, axis angle, heading and elevation, a
  coordinate probe and a section plane, with screen-space snapping to frame points, the beam
  axis, surfaces and the floor; a measurements table copied as TSV or JSON at full precision.
- Exports: the survey table (CSV, JSON) from the workbench route with the site pose applied,
  the scene as glTF binary or OBJ with materials, screenshots at 1 to 4 times the screen, and
  turntable or fly-through video (WebM, or a zip of PNG frames).
- glTF overrides: YAML rule files (in the configuration directory, `LATTIX_VIEW_OVERRIDES`,
  beside the deck, or `--overrides`) replace the model of a kind, family, definition or named
  element with a site's own `.glb`, re-parameterise an archetype, or hide an element; fit by
  length, bore or box, anchor, rotation, offset and material policy; models served only by
  handle; `lattix-view overrides` reports what applies to a deck.
