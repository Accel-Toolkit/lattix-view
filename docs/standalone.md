# Running lattix-view

## Inside the workbench

```bash
pip install lattix lattix-view
lattix ui --root decks/
```

`lattix ui` finds the plugin through its entry point and adds a `3D` tab (the number key after
the built-in tabs switches to it). The tab follows the workbench: the deck read there is the
scene, the selection and hover are shared both ways, the cursor position drives the ride mode, and
the theme and the per-kind colours are the workbench's. `lattix ui --no-plugins` starts without
it, and `lattix ui --check` prints `plugins: lattix_view` when the hook works.

## Standalone

```bash
lattix-view view linac.dat                      # the 3D page for one deck, on the workbench server
lattix-view view ring.seq --format madx --read-option species=proton --read-option kinetic_energy_eV=160e6
lattix-view view linac.dat --overrides site.yaml --port 8765 --no-browser
```

`view` starts lattix's workbench server with the deck read and opens the 3D page first; the
`open in the workbench` link at the top right leads to the 2D pages of the same session. Options:
`--format` and `--read-option KEY=VALUE` as for `lattix convert`; `--overrides FILE` (repeatable,
later files win) for a site's models; `--root DIR` and `--any-path` govern which files the
workbench may open (default: the deck's directory); `--host`, `--port` (default: a free one),
`--no-browser`, `--new-token` (a fresh access token), `--check` (start, self-test, stop).

The server is loopback-only and every request carries an access token, printed in the address it
opens; the token is kept per user in `~/.config/lattix/ui-token`. See `docs/ui.md` in lattix for
the security model.

## Without a server

```bash
lattix-view scene linac.dat -o scene.json        # the scene payload, for another viewer or a script
lattix-view overrides linac.dat --overrides site.yaml   # which rules apply, element by element
lattix-view check                                # lattix's plugin hook, the entry point, three.js
```

The payload (`lattix-view.scene/1`) is columnar JSON: string tables for kinds, sub-kinds and
families; per element the name, definition, kind, sub-kind, family, source index, parent, `s` at
entrance and exit, `L`, the entrance, centre, exit and body positions and quaternions, the chord
frame of a bend, the arc angle and tilt, the outer half-extents, the aperture and its shape, the
resolved bore and where it came from, the free space before and after, `β`, `Bρ` and `λ` at the
entrance, a normalised strength, flags (reversed 1, shifted 2, thin 4, child 8, skew 16,
electric 32, hidden 64, RF focusing 128), a headline label and a small dictionary of the parameters
the model needs; then the pipe runs, the reference orbit sampled every 2° on bends, the lattice
header (name, file, format, side, element count, total length, start pose, bounding box, floor
height, median bore, site pose) and the override block.

## Files and environment

| what | where |
|---|---|
| override rules | `$XDG_CONFIG_HOME/lattix-view/overrides.yaml`, `$LATTIX_VIEW_CONFIG_DIR/overrides.yaml`, `$LATTIX_VIEW_OVERRIDES` (a `PATH`-like list), `<deck>.view.yaml`, `--overrides` |
| the workbench token | `~/.config/lattix/ui-token` |
| public sample decks | lattix's checkout, or `$LATTIX_PUBLIC_DECKS` when lattix came from a wheel |

## Page parameters

The page reads a few query parameters, for embedding and for tests: `token` and `session` (set by
the workbench and by `view`), `embedded=1` (inside the workbench's tab: no header link, keys the
page does not use go to the workbench), `static=1` (no camera easing; screenshots and tests),
`lazy=1` (build full detail on demand whatever the deck size), `lod=<factor>` (stretches the
level-of-detail distances).

## Requirements

A browser with WebGL 2 (any current Chrome, Edge, Firefox or Safari). Without it the page says so
and still links the survey table. The page loads nothing from the network: three.js is vendored in
the wheel, and the content policy forbids remote scripts. Video export needs `MediaRecorder`
(Chrome, Edge, Firefox; Safari records MP4); the PNG-frames route works everywhere.

## Keys

| key | action |
|---|---|
| `/` | find an element: a name substring, `#12` by source index, `s=12.5` by path position |
| `0` `f` | fit the whole lattice, fit the selection |
| `t` `e` `n` `b` | top, side, front, beam's eye at the selection |
| `Space` | fly mode: `W A S D Q E`, drag to look, `Shift` fast, `Ctrl` slow |
| `r` | ride the beam: `j` `k` step (`Shift` 5 m), `Enter` play, `[` `]` speed |
| `m` `a` `y` `p` | measure a distance, an angle, a gap; probe a point |
| `h` `c` `Shift+C` | heading of the selection; section plane through it; cycle its axis |
| `Delete` `Shift+L` | remove the last measurement; the measurements list |
| `v` `x` `l` | schematic models, x-ray, label mode (off, selected, all) |
| `o` `g` | reference orbit, floor grid |
| `←` `→` | previous, next element (`Shift` skips drifts) |
| `?` | the help panel, with `copy diagnostics` |
| `Esc` | clear the selection, leave a tool, fly or ride |

Clicking the corner gizmo snaps to the top, side or front view. The scale bar at the bottom left
reads the length of one grid step; the grid steps by 1, 2 or 5 times a power of ten.
