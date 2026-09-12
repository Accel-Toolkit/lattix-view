# lattix-view

The 3D viewer of the lattix family. It reads the lattice through lattix, places every element on
the survey frames lattix computes (`lattix survey` gives the same numbers as a table), sizes a
model for each element from its own parameters, and draws the result with three.js in the
browser, as a tab of `lattix ui` or standalone through `lattix-view view`.

Pages:

- `models.md`: the model library, one archetype per element kind and instrument family, with the
  sizing rules and what each one is a guess about.
- `overrides.md`: replacing a model with a site's own glTF.
- `measure.md`: the measurement tools.
- `exports.md`: survey tables, scene files, screenshots and video.
- `standalone.md`: running the viewer without the workbench.

These pages are written as the corresponding milestones land.
