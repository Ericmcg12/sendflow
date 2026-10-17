"""
v2: Curved telemetry case using the silhouette from the uploaded "Flexi" design
(Flexi_Entwurf_...3mf), bent into a moto-plate style dome.

IMPORTANT: only the OUTER SHAPE (silhouette) of the uploaded file is reused here.
The uploaded file's printed graphics (brand logos, text) are NOT reproduced -
this output is a plain, unbranded case. Re-measure your own bike/fork and tweak
the parameters below before printing.

Axis convention: X = left-right (width), Z = up-down (height), Y = front-back (depth).
Y increases toward the front (curved) face; the flat back sits at Y = Y_back.
"""

import math
import os
import numpy as np
import cadquery as cq
from shapely.geometry import Polygon

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "stl")
os.makedirs(OUT, exist_ok=True)

# Outline silhouette (X = left-right, Y-column = up-down), traced from the
# outer edge of the uploaded "Flexi" plate design and re-centered/scaled to
# CASE_WIDTH=180mm below. Only the SHAPE is reused -- none of that file's
# printed graphics/logos are reproduced anywhere in this design.
OUTLINE_180MM = [
    (63.846, 78.730), (66.968, 78.653), (85.975, 60.823), (90.000, 12.902),
    (81.460, -16.117), (77.521, -19.645), (79.840, -25.163), (72.186, -45.252),
    (68.316, -46.179), (31.273, -75.951), (0.252, -79.017), (-30.995, -76.112),
    (-68.088, -46.452), (-71.847, -45.673), (-79.429, -25.309), (-77.138, -20.259),
    (-80.944, -17.044), (-90.000, 10.412), (-85.769, 60.700), (-66.395, 79.017),
    (-63.079, 78.356), (-60.232, 73.512), (-47.733, 72.268), (-44.249, 75.489),
    (-0.021, 71.369), (43.170, 75.416), (48.106, 72.366), (58.988, 73.398),
]

# =========================================================================
# USER-EDITABLE PARAMETERS (mm)
# =========================================================================
CASE_WIDTH   = 180.0     # target overall width; imported outline is scaled to this
CURVE_RADIUS = 220.0     # front curve radius (bigger = flatter)
DEPTH_FRONT  = 32.0      # apex position (front tip), local coord
MIN_EDGE_DEPTH = 14.0    # minimum front-to-back depth left at the widest points
WALL_T       = 3.0       # shell wall thickness
FILLET_R     = 1.2       # small edge softening

PERFBOARD_W = 100.0
PERFBOARD_H = 70.0
BOSS_OD, BOSS_H, BOSS_HOLE_D = 6.0, 6.0, 2.5

CASE_SCREW_CLR_D, CASE_SCREW_PILOT_D, CASE_BOSS_OD = 3.2, 2.5, 8.0
FIX_POSITIONS = [(-70, 50), (70, 50), (-70, 0), (70, 0), (-45, -50), (45, -50)]

MOUNT_PATTERN, MOUNT_HOLE_D = 40.0, 4.5
BRACKET_PLATE, BRACKET_T = 62.0, 6.0

CROWN_SADDLE_R, CROWN_SADDLE_WIDTH = 35.0, 60.0
STRAP_SPACING, STRAP_CHANNEL_W, STRAP_SLOT_H, STRAP_LOOP_STAND = 40.0, 22.0, 5.0, 16.0

BAR_DIAMETER, CLAMP_LEN, CLAMP_WALL = 31.8, 40.0, 5.0
CLAMP_SCREW_D, CLAMP_BOSS_OD = 4.2, 10.0

# =========================================================================
# Load + fit the imported silhouette  (X = width, "Z-ish" column = height)
# =========================================================================
raw = np.array(OUTLINE_180MM)
if abs(CASE_WIDTH - 180.0) > 1e-6:
    raw = raw * (CASE_WIDTH / 180.0)

poly = Polygon(raw)
assert poly.is_valid, "imported outline is not a valid simple polygon"
CASE_HEIGHT = raw[:, 1].max() - raw[:, 1].min()
W2 = CASE_WIDTH / 2.0
print(f"[outline] width={CASE_WIDTH:.1f} height={CASE_HEIGHT:.1f} npts={len(raw)}")

R = CURVE_RADIUS
sagitta = R - math.sqrt(R * R - W2 * W2)
edge_y = DEPTH_FRONT - sagitta
Y_back = edge_y - MIN_EDGE_DEPTH
print(f"[geometry] sagitta={sagitta:.2f} Y_back={Y_back:.2f} "
      f"center_depth={DEPTH_FRONT - Y_back:.2f} edge_depth={edge_y - Y_back:.2f}")


def _poly_wp(plane_wp, pts):
    sk = plane_wp.moveTo(*pts[0])
    for p in pts[1:]:
        sk = sk.lineTo(*p)
    return sk.close()


def curved_blank():
    """Rectangular-bounded curved dome blank: arc front, flat back."""
    half_h = CASE_HEIGHT / 2 + 5
    left, right, apex = (-W2, edge_y), (W2, edge_y), (0.0, DEPTH_FRONT)
    profile = (
        cq.Workplane("XY")
        .moveTo(*left)
        .threePointArc(apex, right)
        .lineTo(W2, Y_back)
        .lineTo(-W2, Y_back)
        .close()
    )
    return profile.extrude(2 * half_h).translate((0, 0, -half_h))


def silhouette_prism():
    """Extrude the imported outline along Y so it spans [y0, y1].

    NOTE: on an "XZ" workplane, workplane(offset=d) places the plane at
    global Y = -d, and extrude(length) moves further in -Y from there.
    So to land a plane at global Y=y and extrude toward smaller Y down to y0,
    we set offset=-y1 and extrude(y1-y0).
    """
    y0, y1 = Y_back - 10, DEPTH_FRONT + 10
    pts = [tuple(p) for p in raw]
    sk = _poly_wp(cq.Workplane("XZ").workplane(offset=-y1), pts)
    return sk.extrude(y1 - y0)  # range [y0, y1]


def curved_shell():
    solid = curved_blank().intersect(silhouette_prism())
    shelled = solid.faces("<Y").shell(-WALL_T)
    try:
        shelled = shelled.edges("|Y").fillet(FILLET_R)
    except Exception as e:
        print("[warn] edge fillet skipped:", e)
    return shelled


def add_case_screw_bosses(shell_wp):
    result = shell_wp
    for (x, z) in FIX_POSITIONS:
        boss = (
            cq.Workplane("XZ").center(x, z).circle(CASE_BOSS_OD / 2)
            .extrude(10.0).translate((0, Y_back + 10.0, 0))
        )
        hole = (
            cq.Workplane("XZ").center(x, z).circle(CASE_SCREW_PILOT_D / 2)
            .extrude(12.0).translate((0, Y_back + 11.0, 0))
        )
        result = result.union(boss).cut(hole)
    return result


def inset_polygon(points, dist):
    p = Polygon(points).buffer(-dist, join_style=1)
    if p.geom_type == "MultiPolygon":
        p = max(p.geoms, key=lambda g: g.area)
    return list(p.exterior.coords)[:-1]


def backplate():
    """NOTE on 'XZ' workplane sign convention (see silhouette_prism docstring):
    workplane(offset=d) sits at global Y=-d; extrude(L) then reaches Y=-d-L.
    To land a plane at global Y=y_plane and extrude down to Y=y_plane-L, use
    offset=-y_plane, extrude(L).
    """
    inset_pts = inset_polygon(raw, WALL_T + 2.5)
    t = 3.0
    y_front = Y_back + t  # inner face, faces into the cavity

    plate = _poly_wp(cq.Workplane("XZ").workplane(offset=-y_front), inset_pts).extrude(t)

    # fixing-screw clearance holes (through the full plate thickness)
    for (x, z) in FIX_POSITIONS:
        hole = (
            cq.Workplane("XZ").workplane(offset=-(y_front + 1))
            .center(x, z).circle(CASE_SCREW_CLR_D / 2).extrude(t + 2)
        )
        plate = plate.cut(hole)

    # perfboard standoffs on the inner face
    hx, hz = PERFBOARD_W / 2, PERFBOARD_H / 2
    for sx in (-1, 1):
        for sz in (-1, 1):
            boss = (
                cq.Workplane("XZ").workplane(offset=-(y_front + BOSS_H))
                .center(sx * hx, sz * hz).circle(BOSS_OD / 2).extrude(BOSS_H)
            )
            hole = (
                cq.Workplane("XZ").workplane(offset=-(y_front + BOSS_H + 1))
                .center(sx * hx, sz * hz).circle(BOSS_HOLE_D / 2).extrude(BOSS_H + 2)
            )
            plate = plate.union(boss).cut(hole)

    # common accessory-mount bolt pattern on the outer face
    mh = MOUNT_PATTERN / 2
    for sx in (-1, 1):
        for sz in (-1, 1):
            hole = (
                cq.Workplane("XZ").workplane(offset=-(y_front + 1))
                .center(sx * mh, sz * mh).circle(MOUNT_HOLE_D / 2).extrude(t + 2)
            )
            plate = plate.cut(hole)

    return plate


def cut_holes_xy(solid, positions, diameter, z0, height):
    """Cut round holes at explicit global (x, y) positions through a Z range.

    NOTE: chaining `.faces(selector).workplane().center(x, y).hole(d)` in a loop
    is NOT safe here -- each cut can shift that face's centroid, so the
    workplane's local origin drifts and later holes in the loop can silently
    land in the wrong place (or land on top of an earlier hole). Cutting
    explicit cylinders in global coordinates avoids that entirely.
    """
    result = solid
    for (x, y) in positions:
        cutter = (
            cq.Workplane("XY").workplane(offset=z0)
            .center(x, y).circle(diameter / 2).extrude(height)
        )
        result = result.cut(cutter)
    return result


def bracket_common_base():
    base = cq.Workplane("XY").rect(BRACKET_PLATE, BRACKET_PLATE).extrude(BRACKET_T)
    base = base.edges("|Z").fillet(8.0)
    mh = MOUNT_PATTERN / 2
    positions = [(sx * mh, sy * mh) for sx in (-1, 1) for sy in (-1, 1)]
    base = cut_holes_xy(base, positions, MOUNT_HOLE_D, -1, BRACKET_T + 2)
    return base


def bracket_dualcrown():
    """Base plate wider than the saddle, with a concave crown/steerer groove in
    the middle and two zip-tie / hose-clamp holes flanking it (through the flat
    part of the base, clear of the groove) so a strap can wrap over the crown
    and cinch down. Simple, robust, and easy to adapt to your exact fork by
    re-measuring CROWN_SADDLE_R / CROWN_SADDLE_WIDTH."""
    base_y = CROWN_SADDLE_WIDTH + 40.0  # extra flat area on each side for the strap holes
    saddle_h = 12.0
    clearance = 2.0  # keeps a sliver of real material at the groove's deepest point

    base = cq.Workplane("XY").rect(BRACKET_PLATE, base_y).extrude(BRACKET_T)
    base = base.edges("|Z").fillet(8.0)
    mh = MOUNT_PATTERN / 2
    mount_positions = [(sx * mh, sy * mh) for sx in (-1, 1) for sy in (-1, 1)]
    base = cut_holes_xy(base, mount_positions, MOUNT_HOLE_D, -1, BRACKET_T + 2)

    saddle = (
        cq.Workplane("XY").workplane(offset=BRACKET_T)
        .box(BRACKET_PLATE, CROWN_SADDLE_WIDTH, saddle_h, centered=(True, True, False))
    )
    cutter_z = BRACKET_T + saddle_h - CROWN_SADDLE_R - clearance
    cutter = (
        cq.Workplane("YZ").workplane(offset=BRACKET_PLATE / 2 + 1)
        .center(0, cutter_z).circle(CROWN_SADDLE_R)
        .extrude(BRACKET_PLATE + 2, both=True)
    )
    result = base.union(saddle.cut(cutter))

    strap_hole_d = 5.0
    y_hole = base_y / 2 - 10.0
    for sy in (-1, 1):
        hole = (
            cq.Workplane("XY").workplane(offset=-1)
            .center(0, sy * y_hole).circle(strap_hole_d / 2)
            .extrude(BRACKET_T + 2)
        )
        result = result.cut(hole)
    return result


def bracket_handlebar():
    base = bracket_common_base()
    r_out, r_in = BAR_DIAMETER / 2 + CLAMP_WALL, BAR_DIAMETER / 2

    cradle = (
        cq.Workplane("XY").workplane(offset=BRACKET_T)
        .box(CLAMP_LEN, BRACKET_PLATE * 0.9, r_out + 2, centered=(True, True, False))
    )
    bar_cut = (
        cq.Workplane("YZ").workplane(offset=CLAMP_LEN / 2 + 1)
        .center(0, BRACKET_T + r_out + 2).circle(r_in)
        .extrude(CLAMP_LEN + 2, both=True)
    )
    top_cut = (
        cq.Workplane("XY").workplane(offset=BRACKET_T + r_out + 2)
        .rect(CLAMP_LEN + 2, BRACKET_PLATE).extrude(20)
    )
    cradle = cradle.cut(bar_cut).cut(top_cut)

    boss_z = BRACKET_T + r_out + 2 - 4
    flange = cq.Workplane("XY")
    for sy in (-1, 1):
        y = sy * (BRACKET_PLATE * 0.9 / 2 - 6)
        b = (
            cq.Workplane("XY").workplane(offset=BRACKET_T).center(0, y)
            .circle(CLAMP_BOSS_OD / 2).extrude(boss_z)
        )
        h = (
            cq.Workplane("XY").workplane(offset=BRACKET_T - 1).center(0, y)
            .circle(CLAMP_SCREW_D / 2 - 1.2).extrude(boss_z + 2)
        )
        flange = flange.union(b).cut(h)

    base = base.union(cradle).union(flange)

    cap_h = r_out + 6
    cap = cq.Workplane("XY").rect(CLAMP_LEN, BRACKET_PLATE * 0.9).extrude(cap_h)
    cap_bar_cut = (
        cq.Workplane("YZ").workplane(offset=CLAMP_LEN / 2 + 1)
        .center(0, cap_h).circle(r_in).extrude(CLAMP_LEN + 2, both=True)
    )
    cap = cap.cut(cap_bar_cut)
    cap_positions = [(0, sy * (BRACKET_PLATE * 0.9 / 2 - 6)) for sy in (-1, 1)]
    cap = cut_holes_xy(cap, cap_positions, CLAMP_SCREW_D, -1, cap_h + 2)

    return base, cap


if __name__ == "__main__":
    shell = curved_shell()
    shell = add_case_screw_bosses(shell)
    cq.exporters.export(shell, os.path.join(OUT, "01_shell_front_dome.stl"))
    print("shell OK, volume=", shell.val().Volume())

    plate = backplate()
    cq.exporters.export(plate, os.path.join(OUT, "02_backplate.stl"))
    print("backplate OK, volume=", plate.val().Volume())

    ba = bracket_dualcrown()
    cq.exporters.export(ba, os.path.join(OUT, "03_bracket_dualcrown_fox40_boxxer.stl"))
    print("bracket A OK")

    bb_base, bb_cap = bracket_handlebar()
    cq.exporters.export(bb_base, os.path.join(OUT, "04_bracket_handlebar_base.stl"))
    cq.exporters.export(bb_cap, os.path.join(OUT, "05_bracket_handlebar_cap.stl"))
    print("bracket B OK")

    print("Done ->", OUT)
