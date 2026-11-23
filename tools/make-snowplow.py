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
# ---------- hood and cab ----------
box(body, 'Paint', (0, 1.30, 2.83), (2.02, .90, 1.42))                                # hood
box(body, 'Paint', (0, 1.76, 2.83), (1.86, .06, 1.38))                                # hood top, a little narrower (rounded look)
box(trim, 'Grille', (0, 1.27, 3.555), (1.36, .78, .04))                               # dark behind the grille
for x0, y0, w, h in ((0, 1.66, 1.46, .07), (0, .88, 1.46, .07), (.70, 1.27, .07, .85), (-.70, 1.27, .07, .85)):
    box(trim, 'Chrome', (x0, y0, 3.585), (w, h, .05))                                  # chrome surround
for k in range(13): box(trim, 'Chrome', (-.60+k*.10, 1.27, 3.585), (.035, .74, .035))  # vertical chrome bars
box(trim, 'Chrome', (0, 1.27, 3.59), (1.36, .03, .03))                                 # centre bar
for sx in (1, -1):                                                                    # front fenders over the wheels
    slab(trim, 'Fender', [(sx*1.02, 1.18, 3.20), (sx*1.18, 1.18, 3.20), (sx*1.18, 1.18, 1.62), (sx*1.02, 1.18, 1.62)], .03)
    slab(trim, 'Fender', [(sx*1.02, 1.18, 3.20), (sx*1.18, 1.18, 3.20), (sx*1.18, .86, 3.48), (sx*1.02, .86, 3.48)], .03)
box(body, 'Paint', (0, 1.85, 1.38), (2.40, 1.70, 1.50))                               # cab
box(body, 'Paint', (0, 2.73, 1.38), (2.30, .08, 1.42))                                # cab roof cap
# windshield (two panes, slightly raked) and side windows
for sx in (1, -1):
    slab(glass, 'Glass', [(sx*.04, 1.98, 2.15), (sx*1.10, 1.98, 2.15), (sx*1.08, 2.58, 2.06), (sx*.04, 2.58, 2.06)], .02)
    slab(glass, 'Glass', [(sx*1.205, 1.96, 2.02), (sx*1.205, 1.96, 1.02), (sx*1.205, 2.56, 1.06), (sx*1.205, 2.56, 1.96)], .02)
    slab(glass, 'Glass', [(sx*1.205, 1.96, .94), (sx*1.205, 1.96, .70), (sx*1.205, 2.56, .70), (sx*1.205, 2.56, .94)], .02)
box(trim, 'Trim', (0, 2.28, 2.13), (.06, .64, .05))                                   # centre post
box(trim, 'Trim', (0, 1.70, 2.13), (2.36, .07, .04))                                  # cowl
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
# ---------- amber light bar on the cab roof ----------
box(trim, 'Trim', (0, 2.81, 1.50), (1.70, .08, .26))
for x, mat in ((-.70, 'Beacon'), (-.35, 'BeaconB'), (0., 'Trim'), (.35, 'Beacon'), (.70, 'BeaconB')):   # two sets of lenses that flash in turn
    box(lamps if mat != 'Trim' else trim, mat, (x, 2.92, 1.50), (.30, .14, .22))
# ---------- headlights in the bumper corners, plow lights on posts over the hood, turn lamps ----------
for sx in (1, -1):
    box(lamps, 'Headlight', (sx*.88, 1.15, 3.555), (.30, .20, .05))
    box(lamps, 'Amber', (sx*.88, .98, 3.555), (.30, .07, .05))
    box(lamps, 'Amber', (sx*1.06, 1.34, 3.30), (.16, .10, .10))                        # amber marker lamps on the fender tops
    box(lamps, 'Amber', (sx*1.05, 2.79, 2.08), (.14, .07, .08))                        # cab roof marker lamps
    box(lamps, 'Amber', (sx*.35, 2.79, 2.08), (.10, .06, .07))
# ---------- dump body with cab shield, tailgate, salt spreader ----------
DB0, DB1 = -3.42, .42
box(body, 'Paint', (0, 1.18, (DB0+DB1)/2), (2.44, .12, DB1-DB0))                     # floor
box(body, 'Paint', (1.19, 1.82, (DB0+DB1)/2), (.06, 1.16, DB1-DB0), both=True)         # sides
box(body, 'Paint', (0, 1.82, DB1), (2.44, 1.16, .08))                                 # front wall
slab(body, 'Paint', [(-1.22, 2.40, DB1), (1.22, 2.40, DB1), (1.22, 2.70, DB1+.70), (-1.22, 2.70, DB1+.70)], .05)   # cab shield
box(body, 'Paint', (0, 1.82, DB0), (2.40, 1.16, .07))                                 # tailgate
for z in np.linspace(DB0+.4, DB1-.4, 6): box(trim, 'Rib', (1.235, 1.82, z), (.04, 1.10, .07), both=True)   # side ribs
box(trim, 'Rib', (1.235, 2.38, (DB0+DB1)/2), (.05, .06, DB1-DB0), both=True)           # top rails
box(trim, 'Spreader', (0, .98, -3.66), (.90, .36, .40))                                # spreader hopper
cyl(trim, 'Spreader', (0, .74, -3.74), (0, .62, -3.74), .04, 10)
cyl(trim, 'Spinner', (0, .60, -3.74), (0, .57, -3.74), .30, 24)                        # spinner disc
for sx in (1, -1):
    box(trim, 'Flap', (sx*.95, .55, -3.40), (.62, .60, .02))                           # mud flaps behind the tandem
    box(lamps, 'Taillight', (sx*1.10, .82, -3.47), (.20, .16, .05))                    # tail / brake lights
    box(lamps, 'Amber', (sx*.84, .82, -3.47), (.16, .16, .05))
    box(trim, 'Fender', (sx*.95, 1.08, (ZA_R+ZA_R2)/2), (.80, .04, 2.60))               # one long fender over both rear axles
# ---------- the plow: an A-frame from the bumper, a curved moldboard angled to the right, a steel cutting edge ----------
ANG = math.radians(16)                           # blade angled: left end ahead, right end back (snow goes to the curb)
BW, BH, CX, CZ = 3.50, .98, 0., 4.30             # blade width, height, centre
def bpt(u, v):                                   # u -1..1 across, v 0..1 up: the moldboard curls forward toward the top
    x = u*BW/2; y = .14+v*BH; zc = -.20*math.sin(v*math.pi*.85)+.10*v*v
    return (CX+x*math.cos(ANG), y, CZ+zc+x*math.sin(ANG))
NU, NV = 24, 10
G = [[blade.v(bpt(-1+2*i/NU, j/NV)) for j in range(NV+1)] for i in range(NU+1)]
Gb = [[blade.v(np.array(bpt(-1+2*i/NU, j/NV))-np.array((math.sin(ANG)*.0, 0, .04))) for j in range(NV+1)] for i in range(NU+1)]
for i in range(NU):
    for j in range(NV):
        blade.quad('Blade', G[i][j], G[i+1][j], G[i+1][j+1], G[i][j+1])
        blade.quad('BladeBack', Gb[i][j], Gb[i][j+1], Gb[i+1][j+1], Gb[i+1][j])
for j in range(NV):                                                                    # blade ends
    blade.quad('BladeBack', G[0][j], G[0][j+1], Gb[0][j+1], Gb[0][j]); blade.quad('BladeBack', G[NU][j], Gb[NU][j], Gb[NU][j+1], G[NU][j+1])
for i in range(NU):                                                                    # top and bottom edges
    blade.quad('BladeBack', G[i][NV], G[i+1][NV], Gb[i+1][NV], Gb[i][NV]); blade.quad('Edge', G[i][0], Gb[i][0], Gb[i+1][0], G[i+1][0])
E0, E1 = np.array(bpt(-1, 0)), np.array(bpt(1, 0))                                     # steel cutting edge
slab(blade, 'Edge', [E0+(0, 0, .03), E1+(0, 0, .03), E1+(0, .12, .02), E0+(0, .12, .02)], .03)
for u in (-.78, -.26, .26, .78):                                                       # ribs on the back of the blade
    a, b = np.array(bpt(u, .05)), np.array(bpt(u, .95))
    slab(blade, 'BladeBack', [a-(0, 0, .05), a-(0, 0, .17), b-(0, 0, .14), b-(0, 0, .05)], .05)
T0, T1 = np.array(bpt(-1, 1)), np.array(bpt(1, 1))                                     # orange rail along the top
slab(blade, 'PlowPaint', [T0+(0, -.07, -.02), T1+(0, -.07, -.02), T1+(0, .02, -.05), T0+(0, .02, -.05)], .07)
for i0 in (0, NU):                                                                     # orange end plates
    for j in range(NV):
        a, b = np.array(bpt(-1+2*i0/NU, j/NV)), np.array(bpt(-1+2*i0/NU, (j+1)/NV)); o = (.03 if i0 else -.03)*np.array((math.cos(ANG), 0, math.sin(ANG)))
        slab(blade, 'PlowPaint', [a+o, b+o, b+o-(0, 0, .16), a+o-(0, 0, .16)], .02)
for u in (-.97, .97):                                                                  # tall orange snow markers at the ends
    a = np.array(bpt(u, 1.)); cyl(blade, 'MarkerTip', a-(0, .2, .08), a+(0, 1.15, -.10), .014, 6, False)
PIV = np.array((0, .50, CZ-.62))                                                      # the pivot, behind the middle of the blade
for sx in (1, -1):                                                                     # A-frame push arms
    cyl(trim, 'Frame', (sx*.55, .62, 3.70), PIV, .05, 10)
box(trim, 'Frame', tuple(PIV), (.40, .14, .30))
box(trim, 'Frame', (0, .95, 3.80), (1.70, .52, .14))                                   # hitch / lift frame on the bumper
cyl(trim, 'Chrome', (0, 1.12, 3.86), PIV+(0, .16, 0), .045, 10)                         # lift cylinder
for u in (-.45, .45):                                                                  # angle cylinders, from the pivot to the back of the blade
    e = np.array(bpt(u, .25))-np.array((0, 0, .16))
    cyl(trim, 'Chrome', PIV+(0, .06, 0), e, .035, 8)

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
 'Spreader':  dict(c=[.30, .31, .33, 1], m=.7, r=.5),
 'Spinner':   dict(c=[.10, .10, .11, 1], m=.5, r=.5),
 'Flap':      dict(c=[.012, .012, .013, 1], m=0, r=.9),
 'Blade':     dict(c=[.016, .016, .018, 1], m=.35, r=.4),    # black moldboard, as in the photo
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
