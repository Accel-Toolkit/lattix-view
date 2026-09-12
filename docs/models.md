# The model library

Every element is drawn by one of twenty procedural archetypes, built in the browser from the
element's own parameters. The lattix intermediate representation knows apertures, lengths, bend
angles, RF frequencies and field strengths, and nothing about the outside of the hardware, so the
outer dimensions come from rules that are typical of real machines. Every such rule is written
here; a number marked **guess** is a typical-hardware default and nothing in the deck supports it.
A site that wants true shapes replaces any model with its own glTF (`overrides.md`).

## Frames and placement

The model frame is the element's **body frame**: the element centre after any misalignment, `+z`
along the beam, `+y` up, `+x` to the left looking downstream. This is lattix's survey frame
(`lattix survey`, `docs/conventions.md` in lattix), so a glTF authored in it drops in without a
transform. A bend's body frame sits at the arc midpoint, and the model is swept along the arc; a
misalignment (`Element.shift`) moves the body frame and the model with it, never the reference
orbit. A reversed placement swaps the pole faces and negates the angle. A superposition is
expanded into its children by the server, each on the parent's axis at its own offset.

## Bore

Every model starts from the bore, the beam-pipe half-widths `(a_x, a_y)`:

1. the element's own aperture when the deck gives one (elliptical, or rectangular with a
   rectangular pipe);
2. else the nearest apertured element within twelve elements, upstream first;
3. else the median half-width of the deck's apertures;
4. else 30 mm.

The scene payload records which one applied (`boresrc`), and the tooltip of an element sized by
a borrowed bore says so. A quadrupole given TraceWin's `gfr` and no aperture takes `1.25·gfr`.

## Sizes

`a = max(a_x, a_y)`, `L` the element length, `λ` the RF wavelength of the element's clock
(`c/f`), `β` the reference velocity at the entrance, `g` a dipole's full gap. All in metres.

| archetype | outer half-extents `(hx, hy, hz)` | parts | notes |
|---|---|---|---|
| pipe (Drift) | `a + max(2 mm, 0.05 a)`, `L/2` | tube of the bore profile, wall `max(2 mm, 0.05 a)`, flanges at both ends when `L > 0.25` | flange radius `1.5 a + 10 mm`, 20 mm thick (guess) |
| multipole (Quadrupole, Sextupole, Octupole, Multipole, FieldMap quad) | quad `R = max(4.5 a, 0.12)`; sext, oct `max(4 a, 0.10)`; `hz = L/2` | `2n` poles from tip radius `1.15 a` to the yoke, a `2n`-gon yoke from `0.72 R` to `R` over `max(L − a, 0.6 L)`, one racetrack coil per pole, the bore tube | the first pole sits between the axes (a normal quadrupole in the MAD convention); a skew multipole is rolled by its `tilt`; coil overhang is clamped to 0.45 of the free gap; the 4.5 and 4 bore radii and the 0.12 m floor are guesses |
| multipole, thin (`L = 0`) | `R = 2.5 a`, `hz` = 5 mm | a disc with `2n` pole marks | drawn length 10 mm, clamped to 0.9 of the smaller free gap |
| dipole (Bend) | `W/2, H/2, chord/2` with `W = w_p + 2 w_c + 2 t`, `H = g + 2 h_p + 2 t` | an H-frame yoke (two return legs, two yoke bars, two poles) swept along the arc (sector) or extruded on the chord (rectangular), two racetrack coils around the poles, the bore tube swept along the arc | `g = 2·hgap`, else `2 a_y`; pole width `w_p = max(2 a_x + 2 g, 0.08)`; pole height `h_p = max(1.2 g, 0.05)`; coil window `w_c = max(g, 0.04)`; return yoke `t = max(1.5 g, 0.05)`; the yoke is rolled by `tilt_ref` (a vertical bend stands its poles sideways); the ratios are guesses |
| solenoid (Solenoid, FieldMap solenoid) | `R = max(3 a, 0.08)`, `hz = L_eff/2 + 0.02` | coil from `1.3 a + 5 mm` to `max(coil_in + 0.4 a + 0.02, 1.8 a)`, an iron shell to `R` with 20 mm end plates, the bore tube | `|B| ≥ 3 T` draws a cryostat (`R = max(4 a, 0.15)`) instead of the coil; a field map uses its effective length centred; guesses throughout |
| cavity, elliptical (RFCavity, FieldMap rf with `β ≥ 0.5`) | `R = min(max(0.38 λ, 0.05), 1) + 0.03`, `hz = L/2` | a lathe of `n_cell` cells at pitch `βλ/2` with equator `0.38 λ` and iris = bore (else `0.15 λ`), beam tubes, a translucent vessel | `n_cell` from the deck, else `L_active/(βλ/2)` rounded and clamped to 1..9; no RF clock at all gives a translucent box |
| cavity, low-β (`β < 0.5`) | `R = min(max(0.25 λ, 0.05), 1) + 0.03` | spoke: a cylinder along the beam with a transverse spoke of radius `0.05 λ` when `L ≥ 0.35 λ`; else a half-wave resonator, a vertical cylinder of height `0.5 λ` and radius `max(0.12 λ, 2 a)` | the spoke/HWR split by length is a guess |
| cavity, travelling-wave (`tw`) | `R = min(max(0.40 λ, 0.05), 1) + 0.03` | a disc-loaded cylinder with a rib every `βλ/3` (at most 60), two coupler boxes of side `0.12 λ` | guesses |
| gap (RFCavity, `L = 0`) | `1.8 a`, drawn length 20 mm | a torus of major radius `1.5 a` and two drift-tube nose stubs | |
| dtl (NCells) | `R = min(max(0.30 λ, 0.05), 1) + 0.03` | the tank, `n_cells` drift tubes of radius `clamp(4 a, 0.03, 0.6 R)` filling 75 % of each cell, a stem per tube | `n_cells` from the deck, else `L/(βλ)`; the 0.30 λ tank and the 75 % fill are guesses |
| rfq (RFQCell) | `w = 0.20 λ` (else `max(6 a, 0.10)`) | a translucent tank and four vane tips modulated as `r(z) = r0 (1 + ((m − 1)/(m + 1)) cos(2πz/L + φ))`, opposite vanes in antiphase | `r0` in millimetres when the deck's value exceeds 1 |
| corrector (Kicker; families corrector_h, corrector_v, chopper) | `w = max(3 a, 0.08)`, `hz` = `L/2` or 50 mm | a window-frame yoke with saddle coils on the sides the kick needs (`hkick` on the top and bottom, `vkick` on the left and right, both when unknown), the bore tube | electric: a plate pair `a + 10 mm` from the axis (guess) |
| collimator (Collimator; families collimator, absorber) | `R = max(3 a, 0.08)`, `hz` = `L/2` or 10 mm | rectangular limits: four jaws of thickness `max(20 mm, 0.5 a)`; elliptical: a plate with the elliptical hole; unknown size: a translucent plate at the run bore | |
| foil (Foil) | `w = 2 a + 10 mm`, `hz` = 2.5 mm | a frame with a translucent sheet | |
| bpm (families bpm, bpm_h, bpm_v, phase) | `a + 0.02`, `hz` = `L/2` or 40 mm | a pipe section, a housing ring, button feedthroughs of radius 8 mm: four at 45°, two at ±x, two at ±y, or one phase probe | |
| profile (families profile, wire, screen, laser, emittance, cup) | `a + 0.02, 3 a + 0.06, hz` | a six-way cross: the vertical chamber, a side port, an actuator (screen box, wire fork, cup), a second port for laser and emittance devices | the 125 mm actuator is a guess |
| current (families current, current_gap) | `2.9 a + 0.04`, `hz` = `L/2` or 30 mm | a toroid of major radius `2.5 a + 0.02` in a translucent housing; a ceramic gap ring for `current_gap` | |
| sidedetector (family loss) | fixed `0.29, 0.04, 0.075` | a chamber beside the pipe on a bracket, 250 mm to the left | a loss monitor's position is a guess |
| valve (family valve) | `2 a + 0.03, 2 a + 0.06, 0.03` | a gate slab above the pipe, an actuator, a short pipe section | |
| generic (any other instrument) | `a + 0.02, a + 0.08, hz` | a pipe section, a port and a box | |
| abstract (Taylor with `L > 0`, Superposition envelopes, a cavity without a clock) | the server's half-extents | a translucent box | |
| ring (Marker, thin Taylor) | `a + 0.01`, 1 mm | a thin torus around the pipe | |
| triad (Patch) | `max(0.1, 3 a)` arms | the local axes and a knob at the origin | |
| flag (ReferenceChange, Freq) | | a stem with a small flag | |
| mapextent (FieldMap of another kind) | `r_max` from the map, else the server's size | a translucent cylinder over the map's extent | |

Elements that are not drawn: `Directive`, a `Taylor` that stands in for RF focusing
(`meta.rf_focusing_of`), and a `Superposition` itself (its children are drawn). Hidden elements
keep their frames, so they can still be selected, labelled and measured.

**Zero-length hardware** is drawn centred on its position with a nominal length (kicker 100 mm,
instrument 80 mm, collimator 20 mm, RF gap 20 mm, thin multipole 10 mm, foil 5 mm, marker 2 mm,
Taylor 20 mm), clamped to 0.9 of the smaller free gap on either side and never below 4 mm.
**Overhang**: coil heads and other parts that extend beyond `[0, L]` are clamped to 0.45 of the
free drift on that side, so neighbours never interpenetrate.

## Levels of detail

The scene is cut into chunks of consecutive elements (at most about forty chunks, each at most
48 elements or 25 m, more on big decks). Every chunk carries three levels:

- **level 0**, the parts above at full detail (24 segments around, 16 over 500 elements, 12 over
  1500; 3° arc steps, 6° over 1500 elements; flanges up to 500 elements, cavity vessels up to 800);
- **level 1**, the schematic parts: the same shapes without coils and vessels, 12 segments, in the
  kind colour;
- **level 2**, one box per element in the kind colour, no pipes.

A chunk shows the level its distance to the camera asks for: level 1 beyond 12 m and level 2
beyond 60 m, both stretched by `max(1, total_length / 200)`. A scene under 400 000 triangles at
level 0 stays at level 0 everywhere. Scenes over 3000 elements build level 0 on demand and keep the
32 most recently used chunks. The `schematic` button forces level 1 everywhere. The diagnostics
(help panel) show the levels in use and the switching distances.

## Materials

Every part lands in one material slot; the vertex colour is the slot's base mixed with the
element's kind colour from the workbench palette (`--k-<Kind>`, both themes), so the colour language
of the 2D pages carries over:

| slot | base | kind mix | used for |
|---|---|---|---|
| yoke | grey steel, rough | 55 % | magnet yokes and poles, flanges, jaws, frames, drift tubes |
| coil | copper, metallic | 0 | coils, plates, toroids |
| cavity | niobium, polished | 0 | cavity walls, tanks, vessels' ports, cryostats |
| pipe | steel, 40 % opaque | 30 % | beam tubes |
| ceramic | off-white | 0 | feedthroughs, screens, gap rings |
| glass | blue, 18 % opaque | 100 % | vessels, abstract boxes, unknown collimators, map extents |
| kind | flat | 100 % | markers, triads, flags, schematic and box levels |

Hovering lightens the element's vertices; selection lightens them more and pins its label; the
`x-ray` button makes yokes, cavities, coils and ceramics translucent.
