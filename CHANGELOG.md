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
