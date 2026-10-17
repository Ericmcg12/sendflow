# GnarFlow telemetry case — curved moto-plate style

A free, print-your-own alternative to the paid "ODI-style plate for e-bikes and
dual-crown MTB" model. This is an **original parametric design**, generated
with a CadQuery script (`build_case.py`), not a copy of anyone's paid file.

## What changed from the first draft

You uploaded `Flexi_Entwurf_...3mf` and asked for it curved instead of flat.
That file's **outer silhouette** (the number-plate-style outline) was traced
from its mesh and reused as the shape of this case — but its printed
graphics (the "100%", Alpinestars, and other brand marks baked into the
model's colors) are **not** reproduced anywhere here. What you have is a
plain, unbranded shell with that same outline, bent into a curved dome. Add
your own stickers/decals afterwards if you want that look.

## The parts (all in `stl/` — actually alongside this file)

1. **`01_shell_front_dome.stl`** — the curved front cover. Hollow inside,
   open at the back, wall thickness 3mm. This is what faces forward/outward.
2. **`02_backplate.stl`** — flat lid that closes the case. Its *inner* face
   (faces into the cavity) has 4 standoffs sized for a 100x70mm perfboard/PCB
   (self-tapping M3 pilot holes, 2.5mm). Its *outer* face (faces the bike) has
   a 40x40mm M4 bolt pattern shared by both mounts below.
3. **`03_bracket_dualcrown_fox40_boxxer.stl`** — bolts to the backplate's
   outer face. Has a concave groove sized for a ~35mm-radius crown/steerer
   bulge (Fox 40 / RockShox BoXXer ballpark), flanked by two 5mm holes for a
   zip-tie or hose clamp that wraps over the crown and cinches down.
4. **`04_bracket_handlebar_base.stl`** + **`05_bracket_handlebar_cap.stl`** —
   two-piece clamp for single-crown bikes. Cradle sized for a 31.8mm bar; the
   cap bolts down over it with 2x M4.

Renders (`v_*.png`) show what each part looks like before you commit to a
print.

## Before you print — measure your own bike

The dimensions here are reasonable defaults, not measurements of your actual
fork. Open `build_case.py`, check these numbers against your bike, and
re-run the script (`python3 build_case.py`, needs `pip install cadquery
shapely`):

- `CROWN_SADDLE_R` (35mm) / `CROWN_SADDLE_WIDTH` (60mm) — the curve that seats
  against your Fox 40 / BoXXer crown or steerer. Measure the actual radius
  before printing bracket A.
- `BAR_DIAMETER` (31.8mm) — change to 35.0 if your bar is oversized.
- `PERFBOARD_W` / `PERFBOARD_H` (100 x 70mm) — set to your actual
  OptiRide/FlowTune board size.
- `CASE_WIDTH` (180mm) / `CURVE_RADIUS` (220mm) / `DEPTH_FRONT` (32mm) —
  overall size and how aggressively the front curves. Internal cavity depth
  works out to ~33mm at the center, ~14mm at the edges with the defaults.

## Assembly hardware

- 6x M3 screws (self-tapping into the shell's bosses, or use heat-set M3
  inserts if you want it reusable) — join shell + backplate.
- 4x M3 self-tapping screws — perfboard to backplate standoffs.
- 4x M4 bolts — backplate to whichever mount bracket.
- Dual-crown mount: 1 hose clamp or a Voile-style strap through the two 5mm
  holes.
- Handlebar mount: 2x M4 bolts, cap to base.

## Print settings

Standard FDM: 3-4 perimeters, 15-20% infill, PETG or ABS recommended (this
lives outdoors near a fork). Print the shell with the curved face up (no
supports needed — it's a simple dome). The backplate and brackets are flat
and print without supports too.

## Re-generating / customizing

`build_case.py` is self-contained (embeds the traced outline directly, no
external files needed). All the parameters worth tweaking are collected in
one block near the top under `USER-EDITABLE PARAMETERS`.
