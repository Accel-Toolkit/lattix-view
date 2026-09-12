# lattix-view

A 3D viewer for accelerator lattices. Every lattice that [lattix](https://github.com/Accel-Toolkit/lattix)
reads, twenty-eight formats, is drawn element by element on its survey coordinates, with a model
per element, a hover label, measurement tools and exports. It runs in the browser as a tab of the
lattix workbench (`lattix ui`) or on its own.

**In development until 0.1.0.** What works today: the scene payload for any deck, the plugin tab
in the workbench, the procedural model library, the camera modes and views, hover labels and
search, the measurement tools, the survey, glTF, OBJ, screenshot and video exports, and glTF
overrides from a site's own files. Level of detail for the largest decks and the release
machinery are what remain.

```bash
pip install lattix-view          # once released; until then: pip install -e . in a checkout
lattix-view view linac.dat        # the 3D page for one deck
lattix ui --root decks/           # the workbench, with a 3D tab
lattix-view scene linac.dat -o scene.json
lattix-view overrides linac.dat --overrides site.yaml   # which of a site's models replace which elements
```

The geometry is lattix's: the position and orientation of every element at its entrance, centre
and exit, and the misaligned body frame, computed by `lattix.ir.frames` and held to MAD-X's,
xtrack's and Bmad's surveys. lattix-view sizes each model from the element's own parameters and
draws it; a site can replace any model with its own glTF.

Licence: BSD-3-Clause. three.js is vendored under its MIT licence (`THIRD_PARTY.md`).
