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

def prism(m, mat, outline, d, t):                                # a flat outline (3D points in a plane) extruded +-t/2 along d
    d = np.asarray(d, float)*t/2; A = [m.v(p+d) for p in outline]; B = [m.v(p-d) for p in outline]; n = len(outline)
    for k in range(1, n-1): m.tri(mat, A[0], A[k], A[k+1]); m.tri(mat, B[0], B[k+1], B[k])
    for k in range(n): j = (k+1) % n; m.quad(mat, A[k], B[k], B[j], A[j])
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
    box(lamps, 'Amber', (sx*1.02, 1.42, 3.30), (.16, .08, .10))                        # marker lamps on the fender tops
# headlights (owner 2026-11-23: "can you make the headlights the same"): like the photo's, a swept composite
# housing in each fender corner — a rounded trapezoid lens with a chrome bezel that wraps round onto the side, two round
# lamps in chrome reflectors side by side, and an amber turn / side-marker lamp at the outer corner
def hl_outline(sx, z):                                           # front outline, outer end raised (x outward)
    P = [(.83, .94), (1.17, .93), (1.225, .99), (1.225, 1.12), (1.15, 1.18), (.83, 1.16)]
    return [np.array((sx*x, y, z)) for x, y in P]
for sx in (1, -1):
    O = hl_outline(sx, 3.444); cen = np.mean(O, 0)
    prism(trim, 'Chrome', [cen+(p-cen)*np.array((1.06, 1.12, 1)) for p in O], (0, 0, 1), .008)   # chrome bezel round the edge
    prism(lamps, 'Lens', [p+(0, 0, .004) for p in O], (0, 0, 1), .006)                          # the dark housing behind the lamps
    for k, x in enumerate((.92, 1.07)):                                                # two round lamps
        c = np.array((sx*x, 1.045, 3.452))
        cyl(trim, 'Chrome', c-(0, 0, .03), c, .068, 20)                                 # reflector bowl
        cyl(lamps, 'Headlight', c, c+(0, 0, .006), .052 if k else .058, 20)
        for r0, r1 in ((.040, .046), (.020, .024)):                                    # chrome rings inside the lens
            for q in range(20):
                a0, a1 = q/20*2*math.pi, (q+1)/20*2*math.pi
                P0 = [c+(math.cos(t)*r, math.sin(t)*r, .0075) for t, r in ((a0, r0), (a1, r0), (a1, r1), (a0, r1))]
                prism(lamps, 'Headlight', P0, (0, 0, 1), .002) if False else prism(trim, 'Chrome', P0, (0, 0, 1), .002)
        cyl(trim, 'Chrome', c+(0, 0, .004), c+(0, 0, .011), .012, 12)                  # the bulb
    prism(lamps, 'Amber', [np.array((sx*1.165, .95, 3.462)), np.array((sx*1.215, 1.0, 3.462)), np.array((sx*1.215, 1.11, 3.462)), np.array((sx*1.165, 1.13, 3.462))], (0, 0, 1), .008)
    prism(lamps, 'Amber', [np.array((sx*1.236, .99, 3.43)), np.array((sx*1.236, .99, 3.24)), np.array((sx*1.236, 1.10, 3.26)), np.array((sx*1.236, 1.11, 3.43))], (1, 0, 0), .01)   # wraps onto the side
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
# ---------- details after the owner's photo of a working plow truck (2026-11-23: "make the lights and the body, and all
# the details the same") ----------
# west-coast mirrors on chrome arms from the door, with an amber lamp on each arm; round convex mirrors on stalks on the
# fenders
for sx in (1, -1):
    for y0, y1 in ((2.42, 2.44), (1.86, 1.95)): cyl(trim, 'Chrome', (sx*1.21, y0, 2.02), (sx*1.50, y1, 2.06), .016, 8)
    cyl(trim, 'Chrome', (sx*1.50, 1.92, 2.06), (sx*1.50, 2.46, 2.06), .016, 8)
    box(trim, 'Chrome', (sx*1.56, 2.18, 2.06), (.10, .58, .22))
    box(trim, 'MirrorGlass', (sx*1.56, 2.20, 1.94), (.08, .52, .02))
    box(lamps, 'Amber', (sx*1.56, 2.50, 2.06), (.07, .05, .14))
    a = np.array((sx*1.10, 1.40, 3.12)); cyl(trim, 'Chrome', a, a+(sx*.10, .42, .14), .014, 6)   # hood mirror stalk
    c = a+(sx*.12, .46, .16); cyl(trim, 'Chrome', c-(0, 0, .03), c+(0, 0, .02), .10, 18)
    cyl(trim, 'MirrorGlass', c+(0, 0, .02), c+(0, 0, .03), .088, 18)
# black flares over the front wheel arches, a black louvred vent in each side of the hood
for sx in (1, -1):
    R = [[trim.v((sx*(1.04+dx), TYRE_R+math.cos(a)*(.64+dr), ZA_F+math.sin(a)*(.64+dr))) for dx, dr in ((-.03, .0), (.21, .0), (.21, .10), (-.03, .10))]
         for a in np.linspace(-1.45, 1.45, 17)]
    for A, B in zip(R, R[1:]):
        for k in range(4): q = (k+1) % 4; trim.quad('Flare', A[k], B[k], B[q], A[q])
    for k in range(5): box(trim, 'Grille', (sx*.965, 1.52-k*.07, 2.55), (.02, .035, .48))
# plow lights on brackets above the hood corners: a chrome housing with a clear lamp and an amber turn lamp
for sx in (1, -1):
    cyl(trim, 'Frame', (sx*.90, 1.66, 3.28), (sx*.90, 1.98, 3.32), .025, 8)
    box(trim, 'Chrome', (sx*.90, 2.04, 3.34), (.44, .17, .16))
    box(lamps, 'Headlight', (sx*.97, 2.04, 3.425), (.22, .12, .02))
    box(lamps, 'Amber', (sx*.78, 2.04, 3.425), (.12, .10, .02))
# fuel tank and air tank under the doors, diamond-plate steps
cyl(trim, 'Tank', (1.02, .74, 1.95), (1.02, .74, .95), .26, 22)                      # aluminium fuel tank (driver's side)
for z in (1.10, 1.80): cyl(trim, 'Frame', (1.02, .74, z), (1.02, .74, z+.04), .275, 22)  # its straps
cyl(trim, 'Tank', (-1.02, .72, 1.75), (-1.02, .72, 1.05), .17, 18)                   # air tank
for y in (.52, .84): box(trim, 'Step', (1.10, y, 1.45), (.30, .03, .55), both=True)
# exhaust stack behind the cab (passenger side)
cyl(trim, 'Chrome', (-1.08, 1.05, .56), (-1.08, 3.05, .56), .075, 16)
# amber marker lamps along the front edge of the cab roof (five of them)
for x in (-.70, -.35, 0., .35, .70): cyl(lamps, 'Amber', (x, 2.74, 2.10), (x, 2.74, 2.16), .035, 10)
box(trim, 'Trim', (0, 2.80, 1.60), (.70, .05, .30))                                   # truck number plate on the roof
box(trim, 'Plate', (0, 2.86, 1.75), (.62, .12, .02))
# ---------- the dump body: a rounded stainless tub with a cab shield, as in the photo ----------
DB0, DB1 = -3.42, .42
def tub(z, inset=0.):                                            # cross-section: straight sides, big round bottom corners
    pts = []; hw, top, bot, r = 1.22-inset, 2.40, 1.18+inset, .55
    pts.append((hw, top))
    for a in np.linspace(0, math.pi/2, 9): pts.append((hw-r+r*math.cos(a), bot+r-r*math.sin(a)))
    for a in np.linspace(math.pi/2, math.pi, 9): pts.append((-hw+r+r*math.cos(a), bot+r-r*math.sin(a)))
    pts.append((-hw, top)); return [(x, y, z) for x, y in pts]
TZ = np.linspace(DB0, DB1, 12)
TR = [[body.v(p) for p in tub(z)] for z in TZ]
for A, B in zip(TR, TR[1:]):
    for k in range(len(A)-1): body.quad('Steel', A[k], A[k+1], B[k+1], B[k])
for zz, R_ in ((DB1, TR[-1]), (DB0, TR[0])):                     # front wall and tailgate
    c = body.v((0, 1.80, zz))
    for k in range(len(R_)-1): body.tri('Steel', c, R_[k], R_[k+1])
    body.tri('Steel', c, R_[-1], R_[0])
for z in np.linspace(DB0+.3, DB1-.3, 7):                                               # stiffening hoops
    hp = tub(z, -.02); H = [trim.v(p) for p in hp]; H2 = [trim.v((x, y, z+.06)) for x, y, _ in hp]
    for k in range(len(H)-1): trim.quad('SteelRib', H[k], H[k+1], H2[k+1], H2[k])
box(trim, 'SteelRib', (1.235, 2.40, (DB0+DB1)/2), (.06, .07, DB1-DB0), both=True)      # top rails
slab(body, 'Steel', [(-1.22, 2.40, DB1), (1.22, 2.40, DB1), (1.22, 2.66, DB1+.62), (-1.22, 2.66, DB1+.62)], .05)   # cab shield
for k, z in enumerate(np.arange(DB0+.05, DB1-.05, .30)):                               # red / white reflective strip
    box(trim, 'Reflect' if k % 2 else 'ReflectW', (1.235, 1.95, z+.15), (.01, .08, .30), both=True)
for sx in (1, -1): box(lamps, 'BeaconB', (sx*1.05, 2.74, DB1+.55), (.22, .10, .12))   # amber strobes on the shield corners
# ---------- the wing plow: a mast behind the cab (beacon on top) and a long stainless wing blade, raised and folded
# against the driver's side of the body as in the photo ----------
MX, MZ = 1.30, .40
box(trim, 'Frame', (MX, 1.75, MZ), (.14, 2.10, .14))                                   # mast
box(trim, 'Frame', (MX-.15, 1.0, MZ), (.30, .14, .30))
cyl(trim, 'Trim', (MX, 2.80, MZ), (MX, 2.86, MZ), .10, 16); cyl(lamps, 'Beacon', (MX, 2.86, MZ), (MX, 3.02, MZ), .085, 16)   # beacon
# the wing blade is its own node, WingPlow (owner 2026-11-23: "make it so I can put down the side plows"): built along
# its local -z from its front end (origin), face toward local +x, 0.6 m tall; stored here folded up along the body
# (front end high by the mast, rear end low), js/enh/plow.js swings it down and out beside the truck. Its lift ram
# (WingRam) and rear brace (WingBrace) are 1 m along +z, aimed and stretched by plow.js.
WA, WB = np.array((MX+.16, 2.55, MZ-.12)), np.array((MX+.42, .62, -2.30))              # stowed: top front to low back
WL = float(np.linalg.norm(WB-WA))
wing, wram, wbr = Mesh('WingPlow'), Mesh('WingRam'), Mesh('WingBrace')
slab(wing, 'Steel', [(0, -.30, 0), (0, -.30, -WL), (0, .30, -WL), (0, .30, 0)], .03)
for y0, y1 in ((-.33, -.24), (.24, .33)): slab(wing, 'Frame', [(.03, y0, 0), (.03, y0, -WL), (.03, y1, -WL), (.03, y1, 0)], .03)   # edges
for z in (-.35, -WL/2, -WL+.35): box(wing, 'Frame', (-.05, 0, z), (.08, .56, .06))   # ribs on the back
box(wing, 'Edge', (.04, -.30, -WL/2), (.03, .06, WL))                                  # cutting edge
cyl(wram, 'Frame', (0, 0, 0), (0, 0, .55), .045, 10); cyl(wram, 'Chrome', (0, 0, .5), (0, 0, 1), .028, 8)
cyl(wbr, 'Frame', (0, 0, 0), (0, 0, 1), .05, 8)
def basis_quat(fwd, side):                                       # rotation taking local -z to fwd and local +x toward side
    z = -np.asarray(fwd, float); z /= np.linalg.norm(z); x = np.asarray(side, float); x = x-z*np.dot(x, z); x /= np.linalg.norm(x); y = np.cross(z, x)
    R = np.array([x, y, z]).T; t = R.trace()
    if t > 0: S_ = math.sqrt(t+1)*2; return [(R[2,1]-R[1,2])/S_, (R[0,2]-R[2,0])/S_, (R[1,0]-R[0,1])/S_, .25*S_]
    k = int(np.argmax([R[0,0], R[1,1], R[2,2]])); i_, j_, k_ = k, (k+1) % 3, (k+2) % 3
    S_ = math.sqrt(1+R[i_,i_]-R[j_,j_]-R[k_,k_])*2; q = [0, 0, 0, 0]
    q[i_] = .25*S_; q[j_] = (R[j_,i_]+R[i_,j_])/S_; q[k_] = (R[k_,i_]+R[i_,k_])/S_; q[3] = (R[k_,j_]-R[j_,k_])/S_; return q
WQ = basis_quat(WB-WA, (1, 0, 0))
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
# (owner 2026-11-23: "make the plow blade in the middle of the truck … turn the plow blade with a button"): built straight
# and centred; the whole blade is the node PlowBlade, turning about the pivot behind it (js/enh/plow.js angles it)
ANG = 0.
BW, BH, CX, CZ = 3.70, .82, 0., 4.62
AX = np.array((math.cos(ANG), 0, math.sin(ANG)))                 # along the blade (toward its left, leading end)
NF = np.array((-math.sin(ANG), 0, math.cos(ANG)))                # its forward face normal
UP = np.array((0, 1., 0))
def curl(v): return -.20*math.sin(v*math.pi*.80)+.11*v*v        # the moldboard's curve: hollow low down, lip forward at the top
def bp(u, v, back=0.):                                           # a point on the moldboard (back: metres behind the face)
    return np.array((CX, .08, CZ))+AX*(u*BW/2)+UP*(v*BH)+NF*(curl(v)-back)
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
flap = Mesh('Deflector'); HINGE = bp(0, 1)+NF*.016
# the rubber deflector on the top: a band down over the top ~22 % of the face and standing ~14 cm up past the top,
# leaning forward, slightly wider than the blade
DV = .80
for i in range(NU):
    u0, u1 = (-1+2*i/NU)*1.01, (-1+2*(i+1)/NU)*1.01
    lo0, lo1 = bp(u0, DV)+NF*.014, bp(u1, DV)+NF*.014
    tp0, tp1 = bp(u0, 1)+NF*.016, bp(u1, 1)+NF*.016
    prism(blade, 'Rubber', [lo0, lo1, tp1, tp0], NF, .02)
    # the free part above the top (owner: "can you make the top black part dangle?"): its own node 'Deflector', hinged
    # along the blade's top edge, so js/enh/plow.js can let it flap and sway
    up0, up1 = tp0+UP*.22+NF*.06, tp1+UP*.22+NF*.06
    prism(flap, 'Rubber', [p-HINGE for p in (tp0, tp1, up1, up0)], NF*.4+UP*-.6, .018)
bolts(.90, .026, 22)
for u in (-.66, -.22, .22, .66):                                 # seams between the stainless panels of the face
    for j in range(NV):
        v0, v1 = j/NV, (j+1)/NV
        if v1 < EB or v0 > DV: continue
        f0, f1 = bp(u, max(v0, EB))+NF*.006, bp(u, min(v1, DV))+NF*.006
        prism(blade, 'BladeSeam', [f0-AX*.008, f0+AX*.008, f1+AX*.008, f1-AX*.008], NF, .006)
# ribs and a frame on the back
for u in np.linspace(-.85, .85, 7): profile(blade, 'BladeBack', u, lambda v: .14+.08*math.sin(v*math.pi), .035, TH)
for v in (.18, .70):                                             # two horizontal stiffeners
    a, b = bp(-.95, v, TH+.10), bp(.95, v, TH+.10); cyl(blade, 'BladeBack', a, b, .045, 8)
for u in (-.985, .985):                                          # tall orange markers
    a = bp(u, 1, .06); cyl(blade, 'MarkerTip', a-UP*.15, a+UP*1.15, .013, 6, False)
    cyl(blade, 'Marker', a+UP*1.05, a+UP*1.17, .02, 6)
# push frame: a mount plate on the bumper, A-frame arms to a pivot behind the blade, a lift tower with a ram, angle rams
box(trim, 'Frame', (0, .74, 3.79), (1.12, .38, .10))                                   # mount plate
PIV = np.array((0, .42, CZ-.62))
for sx in (1, -1): cyl(trim, 'Frame', (sx*.50, .58, 3.80), PIV, .055, 10)              # A-frame arms
cyl(trim, 'Frame', PIV-UP*.04, PIV+UP*.10, .12, 14)                                    # pivot
for sx in (1, -1): box(trim, 'Frame', (sx*.22, 1.02, 3.82), (.10, .60, .10))           # lift tower
box(trim, 'Frame', (0, 1.32, 3.82), (.54, .10, .12))
# the blade turns about the pivot: a post on the pivot carries the lift ram's end (on the turning axis, so the ram
# from the fixed tower still meets it), and the angle rams go from the pivot to the blade — all part of the blade node
TOPP = PIV+UP*.78
# the lift ram (owner 2026-11-23: "make the plow able to go up and down"): its own node LiftRam, a 1 m ram along +z from
# the tower; js/enh/plow.js points it at the post top and stretches it as the blade rises and falls
RAM0 = np.array((0, 1.28, 3.86)); ram = Mesh('LiftRam')
cyl(ram, 'Frame', (0, 0, 0), (0, 0, .55), .055, 12); cyl(ram, 'Chrome', (0, 0, .5), (0, 0, 1.0), .032, 10)
cyl(blade, 'BladeBack', PIV, TOPP, .05, 10)                                              # post on the pivot
cyl(blade, 'BladeBack', TOPP, bp(0, .80, TH+.06), .045, 8)                               # from the post to the blade top
for u in (-.40, .40): cyl(blade, 'Chrome', PIV+UP*.05, bp(u, .22, TH+.10), .033, 8)      # angle rams

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
 'Blade':     dict(c=[.58, .60, .62, 1], m=.85, r=.28),      # stainless moldboard, as in the owner's photo of the truck
 'BladeSeam': dict(c=[.20, .21, .22, 1], m=.8, r=.4),
 'EdgeBlack': dict(c=[.014, .014, .016, 1], m=.5, r=.45),
 'Rubber':    dict(c=[.012, .012, .014, 1], m=0, r=.75),
 'Bolt':      dict(c=[.35, .36, .38, 1], m=.9, r=.35),
 'BladeBack': dict(c=[.022, .022, .024, 1], m=.3, r=.55),
 'Edge':      dict(c=[.25, .26, .28, 1], m=.95, r=.35),
 'Marker':    dict(c=[.02, .02, .02, 1], m=0, r=.6),
 'MarkerTip': dict(c=[.90, .16, .01, 1], m=0, r=.45),
 'Headlight': dict(c=[.14, .145, .15, 1], m=.7, r=.1),
 'Lens':      dict(c=[.06, .065, .07, 1], m=.6, r=.06),        # the clear headlight lens over the housing
 'Taillight': dict(c=[.25, .02, .02, 1], m=.2, r=.2),
 'Amber':     dict(c=[.60, .26, .02, 1], m=.2, r=.2),
 'Beacon':    dict(c=[.70, .32, .02, 1], m=.1, r=.2),        # light-bar lenses: flash in turn (js/enh/plow.js)
 'BeaconB':   dict(c=[.70, .32, .02, 1], m=.1, r=.2),
 'Tyre':      dict(c=[.022, .022, .024, 1], m=0, r=.88),
 'Rim':       dict(c=[.82, .82, .80, 1], m=.2, r=.35),      # white steel wheels, as in the photo
 'Flare':     dict(c=[.016, .016, .018, 1], m=0, r=.8),
 'Hole':      dict(c=[.02, .02, .02, 1], m=0, r=.8),
 'Lug':       dict(c=[.60, .61, .63, 1], m=1, r=.25),
 'Hub':       dict(c=[.75, .77, .80, 1], m=1, r=.15),        # chrome hub caps
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
def put(m, translation=None, parent=0):
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
    J['nodes'].append(node); J['nodes'][parent].setdefault('children', []).append(len(J['nodes'])-1); return len(J['nodes'])-1
for m in (body, glass, trim, lamps):
    flat(m); put(m)
J['nodes'].append(dict(name='PlowBlade', translation=[float(c) for c in PIV], children=[])); PB = len(J['nodes'])-1; J['nodes'][0]['children'].append(PB)
blade.P = [tuple(np.array(q)-PIV) for q in blade.P]                                    # the blade in the pivot's coordinates
put(blade, parent=PB)
put(ram, translation=tuple(float(c) for c in RAM0))
put(wing, translation=tuple(float(c) for c in WA)); J['nodes'][-1]['rotation'] = [float(c) for c in WQ]
put(wram, translation=(MX, 2.30, MZ)); put(wbr, translation=(MX+.05, .78, -1.90))   # aimed by plow.js
put(flap, translation=tuple(float(c) for c in HINGE-PIV), parent=PB)   # hinge line through its origin; plow.js turns it about the blade's length
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
