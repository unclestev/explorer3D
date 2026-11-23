# Builds models/snowplow.glb: a municipal snow plow (owner 2026-11-23, with a photo of a state DOT plow truck: "can you
# add in Vehicle? Snow plow, can you make the snow plow look like this? can you make the truck orange?") — a tandem-
# axle dump truck in highway orange: a conventional cab and hood with a black grille, an angled curved plow blade on a
# push frame up front with plow lights on posts over the hood, an amber light bar on the cab roof, a dump body with a
# cab shield, a salt spreader with a spinner at the back, dual rear wheels, mud flaps, big mirrors and an exhaust stack.
# Not a copy of any maker's truck: it's built here from boxes, curves and lathed parts.
# Usage: python3 tools/make-snowplow.py models/snowplow.glb
# Conventions as tools/make-expedition.py and the game's loader (js/game.js loadModel): metres, front +z, ground y 0,
# wheels are nodes named Wheel_*; lamps use materials Headlight / Taillight; the light bar's lenses use Beacon (they
# flash, js/enh/plow.js).
import sys, json, struct, math
import numpy as np

ZA_F, ZA_R, ZA_R2 = 2.35, -1.45, -2.82           # front axle and the two rear axles (tandem, like the photo)
TRACK_F, TRACK_R = 2.04, 1.84
TYRE_R = .53
HW = 1.22                                        # half width of the cab / body (2.44 m)

class Mesh:
    def __init__(s, name): s.name = name; s.P = []; s.prims = {}
    def v(s, p): s.P.append(tuple(float(c) for c in p)); return len(s.P)-1
    def tri(s, mat, a, b, c): s.prims.setdefault(mat, []).extend((a, b, c))
    def quad(s, mat, a, b, c, d): s.tri(mat, a, b, c); s.tri(mat, a, c, d)

def box(m, mat, c, s, both=False):               # axis box: centre c, size s; both: also the mirror image in x
    for sx in ((1, -1) if both else (1,)):
        cx, cy, cz = c[0]*sx, c[1], c[2]; hx, hy, hz = s[0]/2, s[1]/2, s[2]/2
        V = [m.v((cx+dx*hx, cy+dy*hy, cz+dz*hz)) for dx in (-1, 1) for dy in (-1, 1) for dz in (-1, 1)]
        i = lambda dx, dy, dz: V[(dx > 0)*4+(dy > 0)*2+(dz > 0)]
        for f in (((-1,-1,-1),(-1,-1,1),(-1,1,1),(-1,1,-1)), ((1,-1,-1),(1,1,-1),(1,1,1),(1,-1,1)),
                  ((-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1)), ((-1,1,-1),(-1,1,1),(1,1,1),(1,1,-1)),
                  ((-1,-1,-1),(-1,1,-1),(1,1,-1),(1,-1,-1)), ((-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1))):
            m.quad(mat, *[i(*p) for p in f])
def slab(m, mat, pts, t):                        # a flat 4-corner panel (pts in order) given thickness t along its normal
    P = np.array(pts, float); n = np.cross(P[1]-P[0], P[3]-P[0]); n /= np.linalg.norm(n) or 1
    A = [m.v(p+n*t/2) for p in P]; B = [m.v(p-n*t/2) for p in P]
    m.quad(mat, *A); m.quad(mat, B[3], B[2], B[1], B[0])
    for k in range(4): j = (k+1) % 4; m.quad(mat, A[k], B[k], B[j], A[j])
def cyl(m, mat, a, b, r, n=18, caps=True):      # cylinder from point a to point b
    a, b = np.array(a, float), np.array(b, float); d = b-a; d /= np.linalg.norm(d)
    u = np.cross(d, [0, 1, 0] if abs(d[1]) < .9 else [1, 0, 0]); u /= np.linalg.norm(u); w = np.cross(d, u)
    ring = lambda c: [m.v(c+r*(math.cos(k/n*2*math.pi)*u+math.sin(k/n*2*math.pi)*w)) for k in range(n)]
    A, B = ring(a), ring(b)
    for k in range(n): j = (k+1) % n; m.quad(mat, A[k], A[j], B[j], B[k])
    if caps:
        ca, cb = m.v(a), m.v(b)
        for k in range(n): j = (k+1) % n; m.tri(mat, ca, A[j], A[k]); m.tri(mat, cb, B[k], B[j])

body, glass, trim, lamps, blade = Mesh('Body'), Mesh('Glass'), Mesh('Trim'), Mesh('Lamps'), Mesh('Plow')

# ---------- frame, bumper, fenders ----------
box(trim, 'Frame', (.42, .78, .30), (.12, .26, 7.9), both=True)                       # frame rails
box(trim, 'Frame', (0, .70, 3.62), (2.30, .30, .22))                                  # front bumper
box(trim, 'Frame', (0, .62, -3.55), (2.30, .16, .16))                                 # rear bumper bar
# ---------- hood and cab (shapes after the owner's photo: a long hood that slopes down to a tall chrome grille, fenders
# rounded over the front wheels with the lamps in their front faces, a one-piece windshield) ----------
def rring(cx, w, yb, yt, z, n=4, k=20):           # a rounded-rectangle ring (round top corners, flat bottom), right to left
    pts = []
    for t in range(k+1):
        a = -math.pi/2+math.pi*t/k                    # -90..90 degrees: bottom right -> top right... then mirrored
        c, s_ = math.cos(a), math.sin(a)
        x = w*(abs(c)**(2/n)); y = (yb+yt)/2+(yt-yb)/2*math.copysign(abs(s_)**(2/n), s_)
        pts.append((cx+x, max(yb, y), z))
    return pts+[(cx-p[0]+cx, p[1], p[2]) for p in reversed(pts)]
def loft(m, mat, rings, cap=True):
    R = [[m.v(p) for p in r] for r in rings]
    for a, b in zip(R, R[1:]):
        for k in range(len(a)-1): m.quad(mat, a[k], b[k], b[k+1], a[k+1])
        m.quad(mat, a[-1], b[-1], b[0], a[0])
    if cap:
        for r, f in ((R[0], 1), (R[-1], -1)):
            c = m.v(np.mean([m.P[q] for q in r], 0))
            for k in range(len(r)): j = (k+1) % len(r); (m.tri(mat, c, r[k], r[j]) if f > 0 else m.tri(mat, c, r[j], r[k]))
HZ = np.linspace(2.10, 3.52, 9)
loft(body, 'Paint', [rring(0, .97-.08*((z-2.10)/1.42)**2, .95, 1.86-.18*((z-2.10)/1.42)**1.4, z, 7) for z in HZ])   # hood: slopes and narrows to the front
for sx in (1, -1):                                                                     # fenders, rounded over the wheels
    FZ = np.linspace(1.72, 3.44, 9)
    loft(body, 'Paint', [rring(sx*1.02, .21, 1.10, 1.62-.26*((z-1.72)/1.72)**1.3, z, 5, 10) for z in FZ])
    box(body, 'Paint', (sx*1.02, 1.02, 3.30), (.42, .36, .28))                          # fender front down to the bumper
    box(trim, 'Fender', (sx*1.02, 1.08, 2.35), (.42, .05, 1.10))                       # black liner over the tyre
    for k, y in ((0, 1.02), (1, 1.02)):                                                # two round headlights in each fender front
        cyl(lamps, 'Headlight', (sx*(.96+k*.17), y, 3.445), (sx*(.96+k*.17), y, 3.47), .068, 16)
        cyl(trim, 'Chrome', (sx*(.96+k*.17), y, 3.44), (sx*(.96+k*.17), y, 3.455), .082, 16)
    box(lamps, 'Amber', (sx*1.04, 1.24, 3.445), (.30, .09, .04))                       # turn lamps above them
    box(lamps, 'Amber', (sx*1.02, 1.42, 3.30), (.16, .08, .10))                        # marker lamps on the fender tops
box(trim, 'Grille', (0, 1.28, 3.53), (1.24, .74, .04))                                # dark behind the grille
for x0, y0, w, h in ((0, 1.67, 1.36, .08), (0, .89, 1.36, .07), (.65, 1.28, .07, .85), (-.65, 1.28, .07, .85)):
    box(trim, 'Chrome', (x0, y0, 3.55), (w, h, .05))                                   # tall chrome surround
for k in range(11): box(trim, 'Chrome', (-.55+k*.11, 1.28, 3.555), (.04, .72, .04))    # vertical chrome bars
box(trim, 'Frame', (0, 1.75, 3.47), (.10, .06, .04))                                  # the badge spot left plain
# cab: rounded roof edges and front corners (sections narrow a little at the front and back edges)
CZS = [.62, .66, .72, 1.0, 1.6, 1.98, 2.06, 2.12, 2.15]
CWS = [1.12, 1.17, 1.20, 1.20, 1.20, 1.20, 1.19, 1.16, 1.11]
loft(body, 'Paint', [rring(0, w, 1.00, 2.78 if .66 <= z <= 2.10 else 2.74, z, 9, 14) for z, w in zip(CZS, CWS)])
# door seams, window frames and the drip rail on both sides
for sx in (1, -1):
    X = sx*1.207
    for a, b in (((1.03, 1.05), (1.03, 2.62)), ((2.03, 1.05), (2.03, 2.62)), ((1.03, 1.05), (2.03, 1.05))):
        box(trim, 'Seam', (X, (a[1]+b[1])/2, (a[0]+b[0])/2), (.01, abs(b[1]-a[1])+.012, abs(b[0]-a[0])+.012))
    for z0, z1 in ((1.02, 2.02), (.70, .94)):                                         # window frames
        for y in (1.95, 2.57): box(trim, 'Trim', (X, y, (z0+z1)/2), (.012, .03, z1-z0+.03))
        for z in (z0, z1): box(trim, 'Trim', (X, 2.26, z), (.012, .64, .03))
    box(trim, 'Trim', (X*.99, 2.70, 1.38), (.03, .03, 1.48))                           # drip rail
# one-piece windshield, raked, and side windows
slab(glass, 'Glass', [(-1.06, 1.96, 2.165), (1.06, 1.96, 2.165), (1.03, 2.62, 2.162), (-1.03, 2.62, 2.162)], .012)
for x0, y0, w, h in ((0, 1.95, 2.16, .04), (0, 2.63, 2.10, .04), (1.065, 2.29, .04, .70), (-1.065, 2.29, .04, .70)):
    box(trim, 'Trim', (x0, y0, 2.166), (w, h, .02))                                    # windshield frame
box(trim, 'Trim', (.0, 2.60, 2.17), (.02, .02, .01))
for sx in (1, -1):
    slab(glass, 'Glass', [(sx*1.205, 1.96, 2.02), (sx*1.205, 1.96, 1.02), (sx*1.205, 2.56, 1.06), (sx*1.205, 2.56, 1.96)], .02)
    slab(glass, 'Glass', [(sx*1.205, 1.96, .94), (sx*1.205, 1.96, .70), (sx*1.205, 2.56, .70), (sx*1.205, 2.56, .94)], .02)
box(body, 'Paint', (0, 1.04, 1.38), (2.40, .12, 1.50))                                # cab floor / sill
box(trim, 'Step', (1.16, .80, 1.55), (.18, .06, .55), both=True)                      # steps
box(trim, 'Trim', (1.21, 1.75, 1.55), (.03, .05, .30), both=True)                     # door handles
# big mirrors on arms
for sx in (1, -1):
    cyl(trim, 'Chrome', (sx*1.20, 2.30, 2.05), (sx*1.48, 2.42, 2.10), .018, 8)
    cyl(trim, 'Chrome', (sx*1.20, 1.80, 2.05), (sx*1.48, 1.95, 2.10), .018, 8)
    box(trim, 'Trim', (sx*1.52, 2.15, 2.10), (.07, .62, .22))
    box(trim, 'MirrorGlass', (sx*1.52, 2.15, 2.02), (.05, .56, .02))
# exhaust stack behind the cab (driver's side) and the air tank
cyl(trim, 'Chrome', (-1.08, 1.05, .52), (-1.08, 3.05, .52), .075, 16)
cyl(trim, 'Tank', (.98, .95, .30), (.98, .95, -.35), .19, 18)
# ---------- amber lights on the cab roof, as in the photo: one at each front corner and a beacon in the middle ----------
for sx in (1, -1):
    cyl(trim, 'Trim', (sx*.98, 2.76, 1.98), (sx*.98, 2.82, 1.98), .10, 16)
    cyl(lamps, 'BeaconB', (sx*.98, 2.82, 1.98), (sx*.98, 2.95, 1.98), .08, 16)        # flash in turn with the beacon
    ellipsoid_top = (sx*.98, 2.95, 1.98)
    cyl(lamps, 'BeaconB', ellipsoid_top, (sx*.98, 2.98, 1.98), .05, 12)
    for x in (.20, .45): cyl(lamps, 'Amber', (sx*x, 2.77, 2.11), (sx*x, 2.77, 2.15), .035, 10)   # small roof marker lamps
box(trim, 'Trim', (0, 2.80, 1.80), (.70, .05, .30))                                   # the number plate on the roof
box(trim, 'Plate', (0, 2.86, 1.95), (.62, .12, .02))
cyl(trim, 'Trim', (0, 2.79, 1.55), (0, 2.85, 1.55), .12, 18)
cyl(lamps, 'Beacon', (0, 2.85, 1.55), (0, 3.00, 1.55), .10, 18)                       # beacon dome
# ---------- dump body with cab shield, tailgate, salt spreader ----------
DB0, DB1 = -3.42, .42
box(body, 'Steel', (0, 1.18, (DB0+DB1)/2), (2.44, .12, DB1-DB0))                     # floor
box(body, 'Steel', (1.19, 1.82, (DB0+DB1)/2), (.06, 1.16, DB1-DB0), both=True)         # sides
box(body, 'Steel', (0, 1.82, DB1), (2.44, 1.16, .08))                                 # front wall
slab(body, 'Steel', [(-1.22, 2.40, DB1), (1.22, 2.40, DB1), (1.22, 2.70, DB1+.70), (-1.22, 2.70, DB1+.70)], .05)   # cab shield
box(body, 'Steel', (0, 1.82, DB0), (2.40, 1.16, .07))                                 # tailgate
for z in np.linspace(DB0+.4, DB1-.4, 6): box(trim, 'SteelRib', (1.235, 1.82, z), (.04, 1.10, .07), both=True)   # side ribs
box(trim, 'SteelRib', (1.235, 2.38, (DB0+DB1)/2), (.05, .06, DB1-DB0), both=True)      # top rails
for k, z in enumerate(np.arange(DB0+.05, DB1-.05, .30)):                               # red / white reflective strip
    box(trim, 'Reflect' if k % 2 else 'ReflectW', (1.258, 1.36, z+.15), (.01, .08, .30), both=True)
for sx in (1, -1):                                                                     # tarp arm along the side
    cyl(trim, 'SteelRib', (sx*1.27, 2.36, DB1-.15), (sx*1.27, 1.40, DB1-1.55), .035, 8)
box(trim, 'Spreader', (0, .98, -3.66), (.90, .36, .40))                                # spreader hopper
cyl(trim, 'Spreader', (0, .74, -3.74), (0, .62, -3.74), .04, 10)
cyl(trim, 'Spinner', (0, .60, -3.74), (0, .57, -3.74), .30, 24)                        # spinner disc
for sx in (1, -1):
    box(trim, 'Flap', (sx*.95, .55, -3.40), (.62, .60, .02))                           # mud flaps behind the tandem
    box(lamps, 'Taillight', (sx*1.10, .82, -3.47), (.20, .16, .05))                    # tail / brake lights
    box(lamps, 'Amber', (sx*.84, .82, -3.47), (.16, .16, .05))
    box(trim, 'Fender', (sx*.95, 1.08, (ZA_R+ZA_R2)/2), (.80, .04, 2.60))               # one long fender over both rear axles
# ---------- the plow (owner 2026-11-23, after the photo: "make the plow the same as the picture … step up your game") ----
# A long, low, smoothly curved moldboard, angled so its left end leads, black, with an orange top rail and orange end
# plates cut to the blade's own profile, a steel cutting edge, an orange curb guard at the leading end, ribs and a
# frame on the back, tall orange markers; carried on a push frame (A-frame arms to a pivot), lifted by a ram from a tower
# on the bumper mount and swung by two angle rams.
ANG = math.radians(21)
BW, BH, CX, CZ = 4.00, .82, .42, 4.62
AX = np.array((math.cos(ANG), 0, math.sin(ANG)))                 # along the blade (toward its left, leading end)
NF = np.array((-math.sin(ANG), 0, math.cos(ANG)))                # its forward face normal
UP = np.array((0, 1., 0))
def curl(v): return -.20*math.sin(v*math.pi*.80)+.11*v*v        # the moldboard's curve: hollow low down, lip forward at the top
def bp(u, v, back=0.):                                           # a point on the moldboard (back: metres behind the face)
    return np.array((CX, .08, CZ))+AX*(u*BW/2)+UP*(v*BH)+NF*(curl(v)-back)
def prism(m, mat, outline, d, t):                                # a flat outline (3D points in a plane) extruded +-t/2 along d
    d = np.asarray(d, float)*t/2; A = [m.v(p+d) for p in outline]; B = [m.v(p-d) for p in outline]; n = len(outline)
    for k in range(1, n-1): m.tri(mat, A[0], A[k], A[k+1]); m.tri(mat, B[0], B[k+1], B[k])
    for k in range(n): j = (k+1) % n; m.quad(mat, A[k], B[k], B[j], A[j])
NU, NV, TH = 30, 14, .03
G = [[blade.v(bp(-1+2*i/NU, j/NV)) for j in range(NV+1)] for i in range(NU+1)]
Gb = [[blade.v(bp(-1+2*i/NU, j/NV, TH)) for j in range(NV+1)] for i in range(NU+1)]
for i in range(NU):
    for j in range(NV):
        blade.quad('Blade', G[i][j], G[i+1][j], G[i+1][j+1], G[i][j+1])
        blade.quad('BladeBack', Gb[i][j], Gb[i][j+1], Gb[i+1][j+1], Gb[i+1][j])
for i in range(NU): blade.quad('BladeBack', G[i][NV], G[i+1][NV], Gb[i+1][NV], Gb[i][NV]); blade.quad('Edge', G[i][0], Gb[i][0], Gb[i+1][0], G[i+1][0])
# after the owner's close-up of a blade (2026-11-23, "make the blade the same as this"): a rust-red moldboard, a black
# rubber snow deflector bolted along the top and standing up past it, a black cutting edge bolted along the bottom, plain
# black end plates
def profile(m, mat, u, depth, t, off=0.):                       # a plate following the blade's curve, depth(v) deep behind it
    for j in range(NV):
        v0, v1 = j/NV, (j+1)/NV; f0, f1 = bp(u, v0, off), bp(u, v1, off)
        prism(m, mat, [f0, f1, f1-NF*depth(v1), f0-NF*depth(v0)], AX, t)   # one convex piece per step: no fan across the curve
for u in (-1, 1): profile(blade, 'BladeBack', u, lambda v: .18+.06*math.sin(v*math.pi), .02, -.005)   # end plates
def bolts(v, off, n, mat='Bolt'):                                 # a row of bolt heads on the face
    for k in range(n):
        u = -1+(k+.5)*2/n; c = bp(u, v)+NF*off; cyl(blade, mat, c, c+NF*.014, .016, 8)
# black cutting edge along the bottom: a band over the lowest ~14 cm of the face, a little proud of it
EB = .17
for i in range(NU):
    u0, u1 = -1+2*i/NU, -1+2*(i+1)/NU
    a0, b0, a1, b1 = bp(u0, 0)+NF*.012-UP*.03, bp(u1, 0)+NF*.012-UP*.03, bp(u0, EB)+NF*.012, bp(u1, EB)+NF*.012
    prism(blade, 'EdgeBlack', [a0, b0, b1, a1], NF, .022)
bolts(EB*.55, .024, 22)
# the rubber deflector on the top: a band down over the top ~22 % of the face and standing ~14 cm up past the top,
# leaning forward, slightly wider than the blade
DV = .80
for i in range(NU):
    u0, u1 = (-1+2*i/NU)*1.01, (-1+2*(i+1)/NU)*1.01
    lo0, lo1 = bp(u0, DV)+NF*.014, bp(u1, DV)+NF*.014
    tp0, tp1 = bp(u0, 1)+NF*.016, bp(u1, 1)+NF*.016
    up0, up1 = tp0+UP*.15+NF*.07, tp1+UP*.15+NF*.07
    prism(blade, 'Rubber', [lo0, lo1, tp1, tp0], NF, .02)
    prism(blade, 'Rubber', [tp0, tp1, up1, up0], NF*.6+UP*-.4, .02)
bolts(.90, .026, 22)
# ribs and a frame on the back
for u in np.linspace(-.85, .85, 7): profile(blade, 'BladeBack', u, lambda v: .14+.08*math.sin(v*math.pi), .035, TH)
for v in (.18, .70):                                             # two horizontal stiffeners
    a, b = bp(-.95, v, TH+.10), bp(.95, v, TH+.10); cyl(blade, 'BladeBack', a, b, .045, 8)
for u in (-.985, .985):                                          # tall orange markers
    a = bp(u, 1, .06); cyl(blade, 'MarkerTip', a-UP*.15, a+UP*1.15, .013, 6, False)
    cyl(blade, 'Marker', a+UP*1.05, a+UP*1.17, .02, 6)
# push frame: a mount plate on the bumper, A-frame arms to a pivot behind the blade, a lift tower with a ram, angle rams
box(trim, 'Frame', (0, .74, 3.79), (1.12, .38, .10))                                   # mount plate
PIV = np.array((CX*.5, .42, 0))+np.array((0, 0, CZ-.62))
for sx in (1, -1): cyl(trim, 'Frame', (sx*.50, .58, 3.80), PIV, .055, 10)              # A-frame arms
cyl(trim, 'Frame', PIV-UP*.04, PIV+UP*.10, .12, 14)                                    # pivot
for sx in (1, -1): box(trim, 'Frame', (sx*.22, 1.02, 3.82), (.10, .60, .10))           # lift tower
box(trim, 'Frame', (0, 1.32, 3.82), (.54, .10, .12))
cyl(trim, 'Chrome', (0, 1.28, 3.86), bp(0, .78, TH+.10)+UP*.02, .04, 10)              # lift ram to the back of the blade
for u in (-.40, .40): cyl(trim, 'Chrome', PIV+UP*.05, bp(u, .22, TH+.10), .033, 8)     # angle rams
for sx in (1, -1): cyl(trim, 'Frame', (sx*.40, .60, 3.80), bp(sx*.30, .12, TH+.12), .05, 8)   # struts down to the blade

# ---------- wheels: singles in front, duals at the back ----------
def wheel_mesh(name, outward, dual):
    m = Mesh(name); RIM = .29; TW = .30
    def lathe(mat, prof, n=36):
        idx = [[m.v((outward*px, pr*math.cos(i/n*2*math.pi), pr*math.sin(i/n*2*math.pi))) for px, pr in prof] for i in range(n+1)]
        for i in range(n):
            for j in range(len(prof)-1):
                a_, b_, c_, d_ = idx[i][j], idx[i+1][j], idx[i][j+1], idx[i+1][j+1]
                if outward > 0: m.tri(mat, a_, b_, c_); m.tri(mat, b_, d_, c_)
                else: m.tri(mat, a_, c_, b_); m.tri(mat, b_, c_, d_)
    def tyre(x0):
        w = TW/2
        lathe('Tyre', [(x0-w*.9, RIM), (x0-w, RIM+.04), (x0-w*.97, TYRE_R-.05), (x0-w*.8, TYRE_R-.01), (x0-w*.5, TYRE_R), (x0+w*.5, TYRE_R), (x0+w*.8, TYRE_R-.01), (x0+w*.97, TYRE_R-.05), (x0+w, RIM+.04), (x0+w*.9, RIM)])
        for k in range(18):                                                            # tread blocks
            a = k/18*2*math.pi
            for s in (-1, 1):
                c = np.array((outward*(x0+s*w*.45), (TYRE_R+.006)*math.cos(a), (TYRE_R+.006)*math.sin(a)))
                t = np.array((0, -math.sin(a), math.cos(a))); n = np.array((0, math.cos(a), math.sin(a)))
                ax = np.array((outward*1., 0, 0))
                P = [c+ax*dx*.055+t*dt*.06 for dx, dt in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
                Q = [m.v(p) for p in P]; R2 = [m.v(p-n*.02) for p in P]
                if outward > 0: m.quad('Tyre', *Q)
                else: m.quad('Tyre', Q[3], Q[2], Q[1], Q[0])
                for q in range(4): r = (q+1) % 4; m.quad('Tyre', Q[q], R2[q], R2[r], Q[r]) if outward > 0 else m.quad('Tyre', Q[r], R2[r], R2[q], Q[q])
    xo = .16 if dual else 0.
    tyre(xo);
    if dual: tyre(xo-.33)
    face = xo+.13
    lathe('Rim', [(face, RIM), (face-.01, RIM-.02), (face-.03, .22), (face-.03, .15), (face-.01, .12), (face, .10), (face+.01, .0)])
    for k in range(5):                                                                 # hand holes
        a = k/5*2*math.pi+.3; cy, cz = .185*math.cos(a), .185*math.sin(a)
        prof = [(face-.028, .034), (face-.026, .0)]
        idx = [[m.v((outward*px, cy+pr*math.cos(i/12*2*math.pi), cz+pr*math.sin(i/12*2*math.pi))) for px, pr in prof] for i in range(13)]
        for i in range(12):
            a_, b_, c_ = idx[i][0], idx[i+1][0], idx[i][1]
            if outward > 0: m.tri('Hole', a_, b_, c_)
            else: m.tri('Hole', a_, c_, b_)
    for k in range(10):                                                                # lug nuts
        a = k/10*2*math.pi; cy, cz = .09*math.cos(a), .09*math.sin(a)
        prof = [(face+.004, .012), (face+.03, .012), (face+.032, .0)]
        idx = [[m.v((outward*px, cy+pr*math.cos(i/6*2*math.pi), cz+pr*math.sin(i/6*2*math.pi))) for px, pr in prof] for i in range(7)]
        for i in range(6):
            for j in range(len(prof)-1):
                a_, b_, c_, d_ = idx[i][j], idx[i+1][j], idx[i][j+1], idx[i+1][j+1]
                if outward > 0: m.tri('Lug', a_, b_, c_); m.tri('Lug', b_, d_, c_)
                else: m.tri('Lug', a_, c_, b_); m.tri('Lug', b_, c_, d_)
    lathe('Hub', [(face+.01, .06), (face+.07, .05), (face+.08, .0)], 18)
    return m

MATS = {
 'Paint':     dict(c=[.86, .12, .004, 1], m=.15, r=.45),     # highway orange
 'PlowPaint': dict(c=[.86, .12, .004, 1], m=.15, r=.45),  # the blade's orange trim (its own material: one per mesh)
 'Glass':     dict(c=[.025, .032, .045, 1], m=.7, r=.05),
 'Trim':      dict(c=[.018, .018, .020, 1], m=.2, r=.55),
 'Frame':     dict(c=[.014, .014, .016, 1], m=.3, r=.6),
 'Grille':    dict(c=[.010, .010, .012, 1], m=.4, r=.4),
 'Chrome':    dict(c=[.50, .52, .55, 1], m=1, r=.18),
 'Fender':    dict(c=[.020, .020, .022, 1], m=.1, r=.7),
 'Step':      dict(c=[.35, .36, .38, 1], m=.9, r=.4),
 'MirrorGlass': dict(c=[.25, .28, .32, 1], m=.9, r=.05),
 'Tank':      dict(c=[.40, .42, .44, 1], m=.9, r=.3),
 'Rib':       dict(c=[.66, .09, .004, 1], m=.15, r=.5),
 'Steel':     dict(c=[.55, .57, .60, 1], m=.85, r=.32),      # stainless dump body, as in the photo
 'SteelRib':  dict(c=[.45, .47, .50, 1], m=.85, r=.30),
 'Reflect':   dict(c=[.60, .03, .03, 1], m=.1, r=.3),
 'ReflectW':  dict(c=[.85, .85, .85, 1], m=.1, r=.3),
 'Plate':     dict(c=[.80, .80, .78, 1], m=.1, r=.5),
 'Seam':      dict(c=[.08, .03, .005, 1], m=.1, r=.6),
 'Spreader':  dict(c=[.30, .31, .33, 1], m=.7, r=.5),
 'Spinner':   dict(c=[.10, .10, .11, 1], m=.5, r=.5),
 'Flap':      dict(c=[.012, .012, .013, 1], m=0, r=.9),
 'Blade':     dict(c=[.20, .036, .011, 1], m=.25, r=.40),    # rust-red moldboard, as in the owner's close-up
 'EdgeBlack': dict(c=[.014, .014, .016, 1], m=.5, r=.45),
 'Rubber':    dict(c=[.012, .012, .014, 1], m=0, r=.75),
 'Bolt':      dict(c=[.35, .36, .38, 1], m=.9, r=.35),
 'BladeBack': dict(c=[.022, .022, .024, 1], m=.3, r=.55),
 'Edge':      dict(c=[.25, .26, .28, 1], m=.95, r=.35),
 'Marker':    dict(c=[.02, .02, .02, 1], m=0, r=.6),
 'MarkerTip': dict(c=[.90, .16, .01, 1], m=0, r=.45),
 'Headlight': dict(c=[.14, .145, .15, 1], m=.7, r=.1),
 'Taillight': dict(c=[.25, .02, .02, 1], m=.2, r=.2),
 'Amber':     dict(c=[.60, .26, .02, 1], m=.2, r=.2),
 'Beacon':    dict(c=[.70, .32, .02, 1], m=.1, r=.2),        # light-bar lenses: flash in turn (js/enh/plow.js)
 'BeaconB':   dict(c=[.70, .32, .02, 1], m=.1, r=.2),
 'Tyre':      dict(c=[.022, .022, .024, 1], m=0, r=.88),
 'Rim':       dict(c=[.55, .56, .58, 1], m=.8, r=.3),
 'Hole':      dict(c=[.02, .02, .02, 1], m=0, r=.8),
 'Lug':       dict(c=[.60, .61, .63, 1], m=1, r=.25),
 'Hub':       dict(c=[.25, .26, .27, 1], m=.8, r=.35),
}
matnames = list(MATS)
J = dict(asset=dict(version='2.0', generator='explorer3d tools/make-snowplow.py'), scene=0, scenes=[dict(nodes=[0])],
         nodes=[dict(name='Snow_Plow', children=[])], meshes=[], accessors=[], bufferViews=[], buffers=[],
         materials=[dict(name=k, pbrMetallicRoughness=dict(baseColorFactor=v['c'], metallicFactor=v['m'], roughnessFactor=v['r']), doubleSided=True) for k, v in MATS.items()])
BIN = bytearray()
def add(arr, ctype, typ, target):
    global BIN
    while len(BIN) % 4: BIN.append(0)
    off = len(BIN); b = arr.tobytes(); BIN += b
    J['bufferViews'].append(dict(buffer=0, byteOffset=off, byteLength=len(b), target=target))
    a = dict(bufferView=len(J['bufferViews'])-1, componentType=ctype, count=len(arr), type=typ)
    if typ == 'VEC3': a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    J['accessors'].append(a); return len(J['accessors'])-1
def flat(m):                                      # boxy parts look right with flat shading: un-share vertices per triangle
    P2, prims2 = [], {}
    for mat, I in m.prims.items():
        for k in I: P2.append(m.P[k]); prims2.setdefault(mat, []).append(len(P2)-1)
    m.P, m.prims = P2, prims2
def normals(P, prims):
    N = np.zeros_like(P)
    for I in prims.values():
        T = np.array(I).reshape(-1, 3); a, b, c = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
        n = np.cross(b-a, c-a)
        for k in range(3): np.add.at(N, T[:, k], n)
    l = np.linalg.norm(N, axis=1, keepdims=True); l[l == 0] = 1; return (N/l).astype('<f4')
def put(m, translation=None):
    P = np.array(m.P, dtype='<f4'); N = normals(P, m.prims)
    pa = add(P, 5126, 'VEC3', 34962); na = add(N, 5126, 'VEC3', 34962)
    prims = []
    for mat, I in m.prims.items():
        big = len(P) > 65535
        ia = add(np.array(I, dtype='<u4' if big else '<u2'), 5125 if big else 5123, 'SCALAR', 34963)
        prims.append(dict(attributes=dict(POSITION=pa, NORMAL=na), indices=ia, material=matnames.index(mat)))
    J['meshes'].append(dict(name=m.name, primitives=prims))
    node = dict(name=m.name, mesh=len(J['meshes'])-1)
    if translation: node['translation'] = list(translation)
    J['nodes'].append(node); J['nodes'][0]['children'].append(len(J['nodes'])-1)
for m in (body, glass, trim, lamps):
    flat(m); put(m)
put(blade)
for name, x, za, dual in (('Wheel_FL', TRACK_F/2, ZA_F, False), ('Wheel_FR', -TRACK_F/2, ZA_F, False),
                          ('Wheel_RL', TRACK_R/2, ZA_R, True), ('Wheel_RR', -TRACK_R/2, ZA_R, True),
                          ('Wheel_RL2', TRACK_R/2, ZA_R2, True), ('Wheel_RR2', -TRACK_R/2, ZA_R2, True)):
    put(wheel_mesh(name, 1 if x > 0 else -1, dual), translation=(x, TYRE_R, za))
while len(BIN) % 4: BIN.append(0)
J['buffers'] = [dict(byteLength=len(BIN))]
js = json.dumps(J, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
out = sys.argv[1] if len(sys.argv) > 1 else 'models/snowplow.glb'
with open(out, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12+8+len(js)+8+len(BIN)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(BIN), 0x004E4942)); f.write(BIN)
print(out, len(BIN)//1024, 'KB')
