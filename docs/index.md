# lattix-view

The 3D viewer of the lattix family. It reads the lattice through lattix, places every element on
the survey frames lattix computes (`lattix survey` gives the same numbers as a table), sizes a
model for each element from its own parameters, and draws the result with three.js in the
browser, as a tab of `lattix ui` or standalone through `lattix-view view`.

- `standalone.md`: running it, inside the workbench and on its own; the command line; the scene
  payload; files, environment variables and page parameters; the keys.
- `models.md`: the model library, one archetype per element kind and instrument family, with the
  bore resolution, the sizing rules and what each one is a guess about; levels of detail;
  materials.
- `overrides.md`: replacing a model with a site's own glTF, re-parameterising an archetype, hiding
  an element; where the rule files live and how they are checked.
- `measure.md`: snapping, the tools, the records and their precision, the section plane, the site
  pose.
- `exports.md`: the survey table, glTF and OBJ scenes, screenshots and video.

## How it fits together

```
deck ──lattix.formats.read──▶ IR ──lattix.ir.frames──▶ frames per element
                                        │
              lattix_view.scene ◀───────┘   (bores, sizes, families, runs, orbit)
                     │  lattix-view.scene/1 (JSON, gzip)
                     ▼
   browser: models/ builds parts ─▶ scene.js merges per chunk and level ─▶ three.js
            tools/ measure on the frames      export/ survey · glTF · OBJ · PNG · video
```

Geometry is computed once, in Python, by lattix; the page never re-derives a survey with its own
conventions. The one piece of geometry the page evaluates itself, `frameAt(element, s)` for
snapping and the ride mode, mirrors `lattix.ir.frames` and is pinned to it by test.

## Testing

`pytest` runs the Python suite (the payload, sizing, families, routes, overrides, the command
line, the static policy) and, when node is installed, the JavaScript tests under node's own runner
(geometry, every builder over a parameter grid, chunks and levels, measurement maths, the OBJ and
zip writers, the override fit). `pytest tests/e2e` runs the browser suite when the `browser`
extra and a Chromium are installed (`pip install -e ".[browser]" && playwright install chromium`):
three decks on every push, every public deck nightly, with the screenshot goldens in
`tests/e2e/screens/`.
