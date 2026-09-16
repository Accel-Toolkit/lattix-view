# Contributing

## Setting up

```bash
git clone https://github.com/Accel-Toolkit/lattix.git      # the public sample decks live there
git clone https://github.com/Accel-Toolkit/lattix-view.git
cd lattix-view
pip install -e ../lattix -e ".[dev]"          # or plain pip install lattix, 0.2.0 or later
export LATTIX_PUBLIC_DECKS=../lattix/tests/data/public       # only when lattix is installed from a wheel
pytest                        # the Python suite (node runs the JavaScript tests when installed)
node --test tests/js
lattix-view check
```

## The rules

- The page is offline and self-contained: no CDN, no inline script, every import a file that
  ships in the wheel. `tests/test_static.py` enforces it.
- three.js is vendored by `tools/vendor_three.py` from a pinned version with a pinned checksum,
  never edited by hand; `THIRD_PARTY.md` names the version.
- Geometry comes from lattix (`lattix.ir.frames`), never recomputed here with different
  conventions; the JavaScript that mirrors it is pinned to the Python by test.
- Every model's dimensions are derived from the element's own parameters through
  `lattix_view/sizing.py`; a heuristic that is a guess about typical hardware says so in
  `docs/models.md`.
- `ruff check lattix_view tests` must pass; lines are at most 120 characters.
- Nothing from a private accelerator project enters the repository or its tests.
