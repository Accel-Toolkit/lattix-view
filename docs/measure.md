# Measurement

All measurements are taken on lattix's frames, not on the drawn models: the entrance, centre and
exit of every element and the reference orbit between them come from the scene payload, computed by
`lattix.ir.frames`, and the page's own `frameAt(element, s)` mirrors that computation (a straight
element advances along its `z`, a bend follows its arc rolled by `tilt_ref`) and is pinned to it by
test. Values are metres and radians, in the survey frame: `+Z` downstream at the start, `+Y` up,
`+X` to the left looking downstream (MAD-X `SURVEY`), or in the site frame when a site pose is set.

## Snapping

The cursor snaps in screen space, so a zoom never changes what a click means. Within 12 px of the
cursor, in order:

1. **frame points** of the element under the cursor and its two neighbours on each side: entrance,
   centre, exit, and the body centre of a misaligned element (amber mark);
2. **the beam axis**: the closest approach of the pick ray to the reference orbit inside those
   elements, on the true arc through a bend (cyan mark);
3. **the surface** the cursor points at;
4. **the floor plane** (`floor_y` of the scene);
5. else a free point at the distance of the camera target.

The mark under the cursor shows the tier; the tooltip names it (`centre of QF1`, `beam axis in
B1`, `floor`). Frame points carry their element's path position `s`; any other point is projected
onto the orbit (a polyline projection refined by two Newton steps on the true arc) to get its `s`
and its transverse offsets `x, y` in the local frame there.

## Tools

| tool | key | clicks | record |
|---|---|---|---|
| distance | `m` | two snapped points A, B | chord `|B − A|`; `ΔX ΔY ΔZ`; the local `Δx Δy Δs` in A's frame; the path length along the orbit and the sagitta ratio `path/chord − 1` when both points have an `s` |
| gap | `y` | two elements | free space `s_in(later) − s_out(earlier)`; centre-to-centre along `s`; entrance-to-entrance; the straight-line centre distance; the number of elements between |
| angle | `a` | two elements | the angle between their centre-frame `s` axes `atan2(|a × b|, a · b)`; the heading, elevation and roll differences `Δθ Δφ Δψ` |
| heading | `h` | the selection | the MAD-X survey angles `θ φ ψ` of its centre frame |
| probe | `p` | one snapped point | global `X Y Z`; local `s x y`; the element it lies in |
| section | `c`, `Shift+C` | the selection | a clipping plane through its centre with its local `s`, `x` or `y` axis as normal; the slider moves the plane along that axis within the element's half-extent |

`Esc` leaves a tool (or clears a pending first click), `Delete` removes the last record, `Shift+L`
opens the list. Records are drawn with depth-test-off lines and marks, so they stay visible inside
magnets, and each carries a label with its number and its text.

## The list

The `list` panel shows every record with its text, locates it (`go`) and deletes it. **Copy TSV**
and **Copy JSON** give the full-precision numbers (12 significant digits, never the displayed
rounding); the TSV has one row per record:

```
id  type  element_a  element_b  value_m_or_rad  dX  dY  dZ  ds  text
```

with `value` the chord, the free gap, the angle, the heading `θ`, or the probe's `X`.

Displayed lengths switch to millimetres below 1 m and micrometres below 1 mm; displayed angles are
degrees, with milliradians added below 1°.

## The site pose

The `export` panel's site pose (`x0 y0 z0` in metres, `theta0 phi0 psi0` in degrees) is the
start of the line in the site frame, the MAD-X `SURVEY` start. Applying it re-requests the scene
from lattix with that start frame, so positions, frames, labels, snapping and every measurement read
in site coordinates, and the survey export carries the same pose.
