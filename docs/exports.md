# Exports

The `export` button opens the panel. Everything is written by the browser and saved through its
download dialog; the survey table alone comes from the workbench server, so that Python remains the
single source of the geometry.

## Survey table (CSV, JSON)

The workbench route `GET /api/session/<sid>/survey?at=all&children=1&format=csv|json` with the
site pose from the panel. It is the same table as `lattix survey DECK --at all --children --csv`:

```
# lattix 0.2.0 survey of csr_chicane.dat (tracewin): 25 rows
# frames: all; misalignments applied to the body frame; superposition children expanded
# start pose (MAD-X SURVEY x0 y0 z0 theta0 phi0 psi0; m, rad): 0 0 0 0 0 0
# units: m and rad; theta, phi, psi are MAD-X survey angles, theta continuous along the line
i,name,kind,parent,s_in,s_out,L,in_X,in_Y,in_Z,in_theta,in_phi,in_psi,c_X,…,out_…,body_…,angle,tilt_ref
```

One row per placed element (children of a superposition as their own rows with `parent` set),
the entrance (`in_`), centre (`c_`), exit (`out_`) and misaligned body (`body_`) frames as
`X Y Z` and the MAD-X survey angles `theta phi psi`, then the bend `angle` and `tilt_ref`.
Floats carry 12 significant digits. The JSON form is `{"at": "all", "rows": [...]}` with the same
keys. See `docs/conventions.md` in lattix for the frame definitions.

## Scene (glTF, OBJ)

- **glTF**: a binary `.glb` from three's exporter. One node per element, named after the
  element (`name@index` when a name repeats, characters outside `[A-Za-z0-9_.-]` replaced),
  holding one mesh per material slot (`QF1:yoke`, `QF1:coil`, ...), with the element's `index`,
  `name`, `kind`, `sub`, `s_in`, `s_out` and `L` as the node's `extras`; materials named
  `<slot>_<Kind>` in the kind colours; the reference orbit as a `LINE_STRIP` named
  `reference_orbit`. Positions are world coordinates in metres (the site frame when a pose is set),
  always at full detail regardless of the level shown on screen. Overlays, labels and measurements
  are not exported.
- **OBJ**: a zip holding `<deck>.obj` and `<deck>.mtl`, written by the page (no library): one
  `o` per element, `usemtl <slot>_<Kind>`, vertex normals, and a comment line naming the deck and the
  frame. Store-only zip, so any unzip reads it.

A glTF re-imports into the page as an override (`overrides.md`), and both formats open in Blender,
FreeCAD, CATIA's and NX's glTF/OBJ importers, and the usual web viewers.

## Screenshot (PNG)

`PNG 1× 2× 4×` renders the current view at one, two or four times the canvas size into a
multisampled offscreen target (at most 64 megapixels and the GPU's largest renderbuffer), composes
a caption (deck, format, element count, length, lattix-view version and time) and saves a PNG. The
drawing buffer is never preserved, so screenshots cost nothing while idle.

## Video

- **turntable**: the camera circles the lattice once in 8 s at 30 frames per second, eased.
- **fly-through**: rides the reference orbit from start to end in 12 s.
- **PNG frames**: the fly-through as at most 300 PNG frames in a zip, with a `README.txt` carrying
  the `ffmpeg` line that stitches them.

The clips record through `MediaRecorder` on the canvas stream, WebM (VP9, else VP8) or MP4 where
the browser offers it; the panel shows the recorder the browser has, and `PNG frames` is the
route when it has none. Frame paths are generated at a fixed time step, so a slow machine produces
the same frames. Hover tints, the section plane and the outline are left alone during a capture;
clear the selection first for a clean clip.

## Sizes and limits

A glTF of a 2500-element deck is about 40 MB; the OBJ zip about the same. Screenshots at 4× of a
1600×900 canvas are 6400×3600. Video recording is real time: a 12 s fly-through takes 12 s.
