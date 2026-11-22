# Builds models/expedition.glb: a 2025 Ford Expedition (Stealth-look: light blue-grey paint, gloss black roof rails,
# mirrors, pillars and tailgate band, 22" dark multi-spoke wheels with red calipers), made from the photos the owner shared
# (2026-11-22) and the car's published size. Nothing from the photos is copied into the model: it's all built here.
# Usage: python3 tools/make-expedition.py models/expedition.glb
# Same conventions as tools/make-model-y.py (and the game's loader, js/game.js loadModel): metres, front +z, ground y 0,
# centre at the origin; wheels are nodes named Wheel_*; lamps are their own meshes with materials Headlight / Taillight,
# built 3.5 cm in (the loader pushes them out); thin layers on the paint use Glass / Trim.
import sys, os, json, struct, math
import numpy as np
from scipy.interpolate import PchipInterpolator as Pchip

L = 5.334; ZF, ZR = L/2, -L/2                  # 210.0 in
WB = 3.112; ZA_F = ZF-.968; ZA_R = ZA_F-WB      # 122.5 in wheelbase, 38.1 in front overhang, 49.3 in rear (Ford 2025 spec sheet)
TRACK = 1.730; TYRE_R = .4165; TYRE_W = .275     # 275/50R22
HW = 1.012                                      # half the 2.024 m body width (no mirrors)

# ---------- side profile (z, y): a tall box — flat roof, upright tailgate, long flat hood, square nose ----------
top = Pchip([ZR, -2.662, -2.648, -2.56, -2.47, -2.40, -2.25, -1.0, .30, .62, .90, 1.20, 1.46, 1.60, 2.10, 2.45, 2.56, 2.63, ZF],
            [.56, 1.05,   1.36,   1.62,  1.84,  1.90,  1.920, 1.925, 1.92, 1.89, 1.75, 1.565, 1.40, 1.385, 1.375, 1.365, 1.35, 1.31, 1.24])   # hood: flat, then a short round-over to a high, blunt front edge   # flat hood right to a blunt front edge
belt = Pchip([-2.7, -2.2, -1.0, 0., 1.2, 1.40, 1.52, 2.7], [1.34, 1.34, 1.33, 1.325, 1.32, 1.33, 1.42, 1.42])   # up over the hood ahead of the windshield (the hood is body, not glass)
bot = Pchip([ZR, -2.5, -2.2, -1.95, 1.95, 2.3, 2.55, ZF], [.55, .50, .46, .42, .42, .45, .48, .52])

def hw(z):
    h = HW*(1-.030*ease(0, 1, (z-1.95)/.70)**2)        # fenders curve in toward the nose (plan view)
    if z > 2.58: u = min(1, (z-2.58)/(ZF-2.58)); h *= (1-u**7)**(1/7)          # square, upright nose with tight corners (photo)
    if z < -2.60: u = min(1, (-2.60-z)/(-2.60-ZR)); h *= (1-u**6)**(1/6)      # flat tailgate, tight corners
    return max(h, 1e-4)
def ease(a, b, t): t = min(1, max(0, t)); return a+(b-a)*t*t*(3-2*t)
def expo(z):                                     # (nu: side panel fullness, mu: shoulder roundness) — rounder over the hood and fenders,
    k = ease(0, 1, (z-1.10)/.45)                  # gently curved doors, tighter at the tailgate
    return ease(7.5, 5.0, k), ease(4.6, 3.0, k)
GB = .935                                        # glass base at 93.5% of the half width (little shoulder, upright glass)

def section(z):
    yb = float(bot(z)); yt0 = float(top(z)); bl = float(belt(z)); h = hw(z); nu, mu = expo(z)
    yw = min(max(.80, yb+.3*(yt0-yb)), yb+.55*(yt0-yb))
    phi = math.acos(GB**(nu/2)); frac = math.sin(phi)**(2/mu)
    yt = min(yt0, yw+(bl-yw)/frac)
    return dict(z=z, yb=yb, yt=yt, ytop=yt0, belt=bl, hw=h, nu=nu, mu=mu, yw=yw, frac=frac)
def sec_pt(S, phi):
    if phi >= 0:
        c, s = math.cos(phi), math.sin(phi); x = S['hw']*c**(2/S['nu']); y = S['yw']+(S['yt']-S['yw'])*s**(2/S['mu'])
        x *= 1-.022*min(1, max(0, (y-1.13)/.018))                                 # shoulder line at 1.13 m: a crisp step in above it (photo)
    else:
        c, s = math.cos(phi), -math.sin(phi); x = S['hw']*c**(2/10.); y = S['yw']-(S['yw']-S['yb'])*s**(2/9.)
        t = (S['yw']-y)/max(1e-6, S['yw']-S['yb']); x *= 1-.035*t**3                  # flat to the sill, then tucked under
    return x, y
def halfwidth(z, y):
    S = section(z)
    if y > S['yt'] or y < S['yb']: return -1
    lo, hi = (0, math.pi/2) if y >= S['yw'] else (-math.pi/2, 0)
    for _ in range(40):
        m = (lo+hi)/2; _, ym = sec_pt(S, m)
        lo, hi = (m, hi) if ym < y else (lo, m)
    return sec_pt(S, (lo+hi)/2)[0]

# ---------- mesh helpers ----------
class Mesh:
    def __init__(s, name): s.name = name; s.P = []; s.prims = {}
    def v(s, p): s.P.append(p); return len(s.P)-1
    def tri(s, mat, a, b, c): s.prims.setdefault(mat, []).extend((a, b, c))
def mirror_grid(m, G, matf, close_ends=False):  # G[i][j] right-half points; adds the mirrored left half, faces by matf(i,j)
    ni, nj = len(G), len(G[0])
    R = [[m.v(p) for p in row] for row in G]
    Lf = [[m.v((-p[0], p[1], p[2])) for p in row] for row in G]
    for i in range(ni-1):
        for j in range(nj-1):
            mt = matf(i, j)
            if mt is None: continue
            a, b, c, d = R[i][j], R[i+1][j], R[i][j+1], R[i+1][j+1]
            m.tri(mt, a, c, b); m.tri(mt, b, c, d)
            a, b, c, d = Lf[i][j], Lf[i+1][j], Lf[i][j+1], Lf[i+1][j+1]
            m.tri(mt, a, b, c); m.tri(mt, b, d, c)
    return R, Lf

# ---------- body ----------
NZ, NP = 180, 44
t = np.linspace(0, 1, NZ)
zs = ZR+(ZF-ZR)*((.5-.5*np.cos(np.pi*t))*.6+t*.4)
phis = np.linspace(-math.pi/2, math.pi/2, NP)
SECS = [section(float(z)) for z in zs]
body = Mesh('Body')
G = np.array([[[*sec_pt(S, float(ph)), S['z']] for ph in phis] for S in SECS])
def dome(x, z): return .028*ease(0, 1, (.40-abs(x))/.06)*ease(0, 1, (z-1.62)/.12)*ease(0, 1, (2.52-z)/.10)
G[:, :, 1] += np.where(G[:, :, 1] > 1.30, np.vectorize(dome)(G[:, :, 0], G[:, :, 2]), 0)   # raised centre of the hood
RA = .50; XW = .78                               # wheel arches round the 22" wheels
for za in (ZA_F, ZA_R):                          # flares: the panel swells ~2 cm in a band round each arch, fading up the side
    d = np.hypot(G[:, :, 2]-za, G[:, :, 1]-TYRE_R)
    G[:, :, 0] *= 1+.020*np.exp(-((d-RA-.07)/.09)**2)*(G[:, :, 1] < 1.10)*(G[:, :, 0] > .5)
well = np.zeros(G.shape[:2], bool)
for za in (ZA_F, ZA_R):
    dz, dy = G[:, :, 2]-za, G[:, :, 1]-TYRE_R; d = (np.abs(dz)**3.2+np.abs(np.maximum(dy, 0)*1.08)**3.2+np.abs(np.minimum(dy, 0))**3.2)**(1/3.2)   # squared-off arches, flatter on top (photo)
    k = (d < RA) & (G[:, :, 0] > XW-.001)
    edge = k.copy(); inner = np.zeros_like(k)
    inner[1:-1, 1:-1] = k[1:-1, 1:-1] & k[:-2, 1:-1] & k[2:, 1:-1] & k[1:-1, :-2] & k[1:-1, 2:]
    inner |= k & (dy < -.03)
    edge &= ~inner
    sc = np.where(edge, RA/np.maximum(d, 1e-6), 1.)
    G[:, :, 2] = np.where(edge, za+dz*sc, G[:, :, 2]); G[:, :, 1] = np.where(edge, TYRE_R+dy*sc, G[:, :, 1])
    G[:, :, 0] = np.where(inner, XW, G[:, :, 0]); well |= inner
def body_mat(i, j):
    zc = (zs[i]+zs[i+1])/2; y = G[i:i+2, j:j+2, 1].mean()
    if well[i:i+2, j:j+2].any(): return 'Trim'
    if j < 7: return 'Trim'                                   # underside
    if ZA_R+RA < zc < ZA_F-RA and y < .52: return 'Trim'      # black rocker
    return 'Paint'
mirror_grid(body, G.tolist(), body_mat)

# ---------- greenhouse: side glass with black pillars, painted roof, windshield, tailgate glass ----------
gh = Mesh('Glasshouse')
def gpt(z, u):
    S = section(z)
    x0 = GB*S['hw']; y0 = S['yw']+(S['yt']-S['yw'])*S['frac'] - .004
    H = max(0., S['ytop']-y0); r = min(.055, .45*H); rw = max(x0-.17*(H-r), .55*x0)
    if u <= .5: q = u/.5; return [x0+(rw-x0)*q, y0+(H-r)*q, z]
    a = (u-.5)/.5*math.pi/2; return [rw*math.cos(a)**(2/9.0), y0+(H-r)+r*math.sin(a)**(2/2.6), z]   # tight roof edge, flat top
zz = np.linspace(-2.66, 1.7, 900)
def has(z): S = section(float(z)); return float(top(z)) > S['yw']+(S['yt']-S['yw'])*S['frac']+.006
hasH = [has(z) for z in zz]
ZG0 = float(zz[hasH.index(True)]); ZG1 = float(zz[len(hasH)-1-hasH[::-1].index(True)])
def gh_h(z): S = section(float(z)); return float(top(z))-(S['yw']+(S['yt']-S['yw'])*S['frac'])
ZW = max(float(z) for z in zz if gh_h(z) > .07)    # the windshield's foot: ahead of it the 'greenhouse' is only hood skin
def ggrid(u0, u1, z0f, z1f, nz, nu, mat):
    G = [[gpt(z0f(u)+(z1f(u)-z0f(u))*i/nz, u) for u in np.linspace(u0, u1, nu+1)] for i in range(nz+1)]
    mirror_grid(gh, G, lambda i, j: mat)
zD = lambda u: -2.52+.13*min(u, .5)/.5             # back of the side glass (a thin body-colour D pillar behind it)
zA = lambda u: ZW-.03-.60*min(u, .5)/.5            # front of the door glass, along the A pillar              # front of the door glass: the A pillar leans back
cz0, cz1 = (lambda u: ZG0), (lambda u: ZG1)
ggrid(0, .5, cz0, zD, 6, 14, 'Paint')              # D pillar
# side windows (photo): rear quarter, rear door and front door glass, with gloss black C and B pillars between them
zC0 = lambda u: -1.23-.06*min(u, .5)/.5; zC1 = lambda u: -1.33-.06*min(u, .5)/.5
zB0 = lambda u: .02-.05*min(u, .5)/.5;   zB1 = lambda u: -.09-.05*min(u, .5)/.5
ggrid(0, .5, zD, zC1, 40, 14, 'Glass')             # rear quarter glass
ggrid(0, .5, zC1, zC0, 3, 14, 'TrimGloss')         # C pillar
ggrid(0, .5, zC0, zB1, 40, 14, 'Glass')            # rear door glass
ggrid(0, .5, zB1, zB0, 3, 14, 'TrimGloss')         # B pillar
ggrid(0, .5, zB0, zA, 40, 14, 'Glass')             # front door glass
ggrid(0, .5, zA, lambda u: ZW, 6, 14, 'TrimGloss') # A pillar: thin, gloss black
ggrid(0, .5, lambda u: ZW, cz1, 4, 14, 'Paint')    # ahead of the windshield: body
ggrid(.5, .54, cz0, lambda u: ZW, 140, 1, 'Paint')          # roof edge
ggrid(.5, .54, lambda u: ZW, cz1, 3, 1, 'Paint')
ggrid(.54, 1, cz0, lambda u: -2.43, 14, 12, 'Glass')         # tailgate glass, leaning forward ~20 degrees
ggrid(.54, 1, lambda u: -2.43, lambda u: .64, 100, 12, 'Paint')   # flat painted roof
ggrid(.54, 1, lambda u: .64, lambda u: ZW, 30, 12, 'Glass')  # windshield
ggrid(.54, 1, lambda u: ZW, cz1, 4, 12, 'Paint')            # cowl / hood behind it

def zfront(x, y, lo=2.40):
    hi = ZF+.01
    if halfwidth(lo, y) < abs(x): return None
    for _ in range(36):
        m = (lo+hi)/2
        if halfwidth(m, y) >= abs(x): lo = m
        else: hi = m
    return lo
def zrear(x, y, hi=-2.50):
    lo = ZR-.01
    if halfwidth(hi, y) < abs(x): return None
    for _ in range(36):
        m = (lo+hi)/2
        if halfwidth(m, y) >= abs(x): hi = m
        else: lo = m
    return hi
def surf_normal(x, y, z, sgn, e=.004):
    # gradient of |x| - halfwidth(z, y): points out of the body (x >= 0 side)
    gy = -(halfwidth(z, y+e)-halfwidth(z, y-e))/(2*e); gz = -(halfwidth(z+e, y)-halfwidth(z-e, y))/(2*e)
    if not all(map(math.isfinite, (gy, gz))) or abs(gy) > 50 or abs(gz) > 50: return (0, 0, sgn)
    l = math.sqrt(1+gy*gy+gz*gz); return (1/l, gy/l, gz/l)
def patch(m, mat, f, nu, nv, push=.004, zfn=zfront, sgn=1, shift=0.):
    # a surface patch: f(u,v) -> (x,y); z found on the body's front (sgn 1) or rear (sgn -1); pushed `push` out along the
    # body's surface normal (so the parts that wrap round a corner onto the side stand off the paint too)
    pts = []
    for i in range(nu+1):
        row = []
        for j in range(nv+1):
            x, y = f(i/nu, j/nv); z = zfn(x, y)
            if z is None: z = (ZF-.02 if sgn > 0 else ZR+.02)
            n = surf_normal(x, y, z, sgn); row.append((x+n[0]*push*(x > 1e-6), y+n[1]*push, z+n[2]*push+shift))
        pts.append(row)
    for side in (1, -1):
        idx = [[m.v((side*p[0], p[1], p[2])) for p in row] for row in pts]
        for i in range(nu):
            for j in range(nv):
                a, b, c, d = idx[i][j], idx[i+1][j], idx[i][j+1], idx[i+1][j+1]
                if (side*sgn) > 0: m.tri(mat, a, b, c); m.tri(mat, b, d, c)
                else: m.tri(mat, a, c, b); m.tri(mat, b, c, d)
def side_patch(m, mat, f, nu, nv, push=.003):
    for side in (1, -1):
        idx = []
        for i in range(nu+1):
            row = []
            for j in range(nv+1):
                z, y = f(i/nu, j/nv); x = max(halfwidth(z, max(y, float(bot(z))+.012)), .3)+push
                row.append(m.v((side*x, y, z)))
            idx.append(row)
        for i in range(nu):
            for j in range(nv):
                a, b, c, d = idx[i][j], idx[i+1][j], idx[i][j+1], idx[i+1][j+1]
                if side > 0: m.tri(mat, a, c, b); m.tri(mat, b, c, d)
                else: m.tri(mat, a, b, c); m.tri(mat, b, d, c)
# ---------- front: wide black grille with three heavy bars, the headlamps in its outer corners, the thin light line that
# runs over each lamp, round its outer end and full width under the grille; black lower bumper with a mesh intake ----------
heads = Mesh('Headlights'); trim = Mesh('Details'); plate = Mesh('Plate')
def box(m, mat, c, s):                             # an axis box, centre c, size s, mirrored to both sides when c[0] > 0
    for side in ((1, -1) if c[0] > 0 else (1,)):
        cx, cy, cz = side*c[0], c[1], c[2]; hx, hy, hz = s[0]/2, s[1]/2, s[2]/2
        V = [m.v((cx+dx*hx, cy+dy*hy, cz+dz*hz)) for dx in (-1, 1) for dy in (-1, 1) for dz in (-1, 1)]
        for a, b, c_, d in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            m.tri(mat, V[a], V[b], V[c_]); m.tri(mat, V[a], V[c_], V[d])
W = lambda y, z=2.55: max(halfwidth(z, y), .1)
# (front detail pass, owner 2026-11-22: "enhance the detail of the headlights, grille and bumper so it looks realistic")
def zf(x, y): z = zfront(abs(x), y); return z if z is not None else ZF-.02
def fbox(m, mat, x, y, w, h, d, out=0., both=True):      # a box sitting on the front face: centre x (>=0), y; width w, height h, depth d; `out` stands proud
    z = zf(x, y)+out-d/2
    box(m, mat, (x if both and x > 0 else 0.0001 if x == 0 else x, y, z), (w, h, d)) if x > 0 or x == 0 else None
# grille: a recess (very dark) in a gloss black frame, five chunky stepped bars, a lattice of short dividers behind them
GY0, GY1 = .905, 1.225
gx = lambda y: (.74+.05*(y-GY0)/(GY1-GY0))*W(y)                          # half width: a touch wider at the top
patch(trim, 'Well', lambda u, v: (gx(GY0+(GY1-GY0)*v)*u, GY0+(GY1-GY0)*v), 16, 6, push=.0035)
patch(trim, 'TrimGloss', lambda u, v: ((gx(GY1)+.018)*u, GY1+.004+.018*v), 16, 1, push=.006)        # frame: top
patch(trim, 'TrimGloss', lambda u, v: ((gx(GY0)+.018)*u, GY0-.022+.018*v), 16, 1, push=.006)        # bottom
patch(trim, 'TrimGloss', lambda u, v: (gx(GY0+(GY1-GY0)*u)+.018*v, GY0+(GY1-GY0)*u), 8, 1, push=.006)   # sides
for k, yb in enumerate((.935, .995, 1.055, 1.115, 1.175)):
    hw_ = gx(yb)-.01
    fbox(trim, 'Bar', 0, yb, 2*hw_, .030, .05, out=.018)                                       # the bar
    fbox(trim, 'Chrome', 0, yb+.0135, 2*hw_, .003, .045, out=.0185)                            # a thin satin edge on top of it (light catches it)
    if k < 4:
        for j in range(9):                                                                     # dividers between this bar and the next, staggered
            x = (j+.5+(.5 if k % 2 else 0))/9.5*hw_
            if x < hw_-.02: fbox(trim, 'Grille', x, yb+.03, .012, .032, .03, out=.005)
# headlamps: in the grille's outer top corners — a dark housing standing proud, two wide projector modules stacked,
# each with a satin surround and a lit lens, and the amber indicator in the top outer corner
patch(trim, 'TrimGloss', lambda u, v: ((gx(1.03+.20*v)+(.975*W(1.03+.20*v)-gx(1.03+.20*v))*u), 1.03+.20*v), 6, 4, push=.005)   # the black runs out round the lamps
for yc in (1.085, 1.165):
    x0, x1 = .815*W(yc), .955*W(yc); xc = (x0+x1)/2
    fbox(trim, 'Grille', xc, yc, x1-x0+.03, .062, .03, out=.004)                              # housing cell
    fbox(trim, 'Chrome', xc, yc, x1-x0, .05, .02, out=.010)                                    # surround
    fbox(heads, 'Headlight', xc, yc, x1-x0-.016, .036, .02, out=.013-.035)                     # lens (lit; the loader pushes it out 3.5 cm)
fbox(trim, 'Amber', .945*W(1.205), 1.205, .03, .022, .02, out=.012)
# the light line: one continuous strip over each lamp, round its outer end and full width under the grille
LP = [(.79, 1.240), (.93, 1.240)]+[(.93+.035*math.sin(a), 1.205+.035*math.cos(a)) for a in np.linspace(.2, math.pi/2, 4)] \
     +[(.968, .945)]+[(.928+.04*math.cos(a), .905-.04*math.sin(a)) for a in np.linspace(0, math.pi/2, 4)]+[(.0, .866)]
for (fa, ya), (fb, yb_) in zip(LP, LP[1:]):
    xa, xb = fa*W(ya), fb*W(yb_); n = max(1, int(math.hypot(xb-xa, yb_-ya)/.03))
    for q in range(n):
        x = xa+(xb-xa)*(q+.5)/n; y = ya+(yb_-ya)*(q+.5)/n; sw = abs(xb-xa)/n+.006; sh = abs(yb_-ya)/n+.006
        fbox(heads, 'Headlight', x, y, max(sw, .011), max(sh, .011), .015, out=.014-.035)
# bumper (body colour): a wide black lower intake set in, with three slats; black pockets at the corners; a black skid plate
IY0, IY1 = .60, .80
ix = lambda y: (.55+.08*(y-IY0)/(IY1-IY0))*W(y)
patch(trim, 'Well', lambda u, v: (ix(IY0+(IY1-IY0)*v)*u, IY0+(IY1-IY0)*v), 14, 4, push=.0035)
patch(trim, 'TrimGloss', lambda u, v: ((ix(IY1)+.02)*u, IY1+.003+.02*v), 14, 1, push=.006)
patch(trim, 'TrimGloss', lambda u, v: (ix(IY0+(IY1-IY0)*u)+.02*v, IY0+(IY1-IY0)*u), 6, 1, push=.006)
for yb in (.655, .70, .745): fbox(trim, 'Grille', 0, yb, 2*ix(yb)-.03, .014, .035, out=.008)
for k in range(13): fbox(trim, 'Grille', (k+.5)/13*ix(.70), .70, .008, .13, .03, out=.004)
patch(trim, 'Well', lambda u, v: ((.80+.13*u)*W(.63+.17*v), .63+.17*v), 4, 3, push=.0035)               # corner pockets
patch(trim, 'TrimGloss', lambda u, v: ((.79+.15*u)*W(.80), .80+.016*v), 4, 1, push=.006)
for yb in (.67, .72, .77): fbox(trim, 'Grille', .865*W(yb), yb, .11*W(yb), .012, .03, out=.006)
patch(trim, 'Trim', lambda u, v: (.86*u*W(.48+.10*v), .48+.10*v), 14, 2, push=.004)                       # skid plate
fbox(trim, 'Bar', 0, .585, 2*.86*W(.585), .014, .03, out=.006)
patch(trim, 'Trim', lambda u, v: (.90*u*W(1.30, 2.40), 1.285+.006*v), 16, 1, push=.003, zfn=lambda x, y: 2.40)   # hood seam above the grille (a line)

def ytop_at(z, x):                                   # height of the top surface at (z, x)
    lo, hi = section(z)['yw'], section(z)['yt']
    for _ in range(40):
        m = (lo+hi)/2
        if halfwidth(z, m) > x: lo = m
        else: hi = m
    return lo
for k in range(24):                                                                   # hood shut lines, along the fender tops
    z0 = ZW+.04+(2.60-ZW-.04)*k/24; z1 = ZW+.04+(2.60-ZW-.04)*(k+1)/24; zc = (z0+z1)/2
    box(trim, 'Trim', (.80, ytop_at(zc, .80)+.002, zc), (.006, .004, z1-z0+.002))
# ---------- rear: a gloss black band across the tailgate, tall C-shaped tail lamps at the corners joined by a red line
# along the top of the band, the plate in a recess, black lower bumper with red reflectors ----------
tails = Mesh('Taillights')
Wr = lambda y: max(halfwidth(-2.62, y), .1)
patch(trim, 'TrimGloss', lambda u, v: (.84*u*Wr(1.06+.36*v), 1.06+.36*v), 16, 4, push=.005, zfn=zrear, sgn=-1)       # black band
patch(trim, 'Trim', lambda u, v: (.95*u*Wr(.57+.07*v), .57+.07*v), 20, 1, push=.003, zfn=zrear, sgn=-1)         # black strip along the bottom of the rear bumper
# (rear detail pass) tail lamps: a smoked red lens at each corner wrapping round onto the side, with a lit C on its outer
# edge and top, and a red line running inboard along the top of the black band (photos)
patch(trim, 'RedLens', lambda u, v: ((.80+.195*u)*Wr(1.04+.40*v), 1.04+.40*v), 6, 6, push=.0055, zfn=zrear, sgn=-1)
patch(tails, 'Taillight', lambda u, v: ((.955+.035*u)*Wr(1.06+.36*v), 1.06+.36*v), 2, 8, push=.008, zfn=zrear, sgn=-1, shift=.035)   # outer vertical bar
patch(tails, 'Taillight', lambda u, v: ((.82+.17*u)*Wr(1.405), 1.40+.022*v), 8, 1, push=.008, zfn=zrear, sgn=-1, shift=.035)          # top bar
patch(tails, 'Taillight', lambda u, v: ((.58+.24*u)*Wr(1.41), 1.403+.012*v), 8, 1, push=.008, zfn=zrear, sgn=-1, shift=.035)          # the line inboard
patch(tails, 'Taillight', lambda u, v: ((.82+.13*u)*Wr(1.085), 1.075+.016*v), 6, 1, push=.008, zfn=zrear, sgn=-1, shift=.035)        # lower bar: the C
side_patch(trim, 'RedLens', lambda u, v: (-2.64+.20*u, 1.04+.40*v-.04*u*v), 6, 6, push=.004)                                        # wrapping onto the side
side_patch(tails, 'Taillight', lambda u, v: (-2.64+.035*u, 1.06+.34*v), 2, 6, push=.007)
side_patch(tails, 'Taillight', lambda u, v: (-2.64+.18*u, 1.395+.02*v), 6, 1, push=.007)
patch(trim, 'Trim', lambda u, v: (.18*u, 1.085+.18*v), 4, 2, push=.0065, zfn=zrear, sgn=-1)      # plate recess
patch(plate, 'Plate', lambda u, v: (.16*u, 1.10+.15*v), 4, 2, push=.009, zfn=zrear, sgn=-1)
patch(trim, 'Reflector', lambda u, v: ((.78+.14*u)*Wr(.60), .58+.03*v), 4, 1, push=.006, zfn=zrear, sgn=-1)

# ---------- sides: door seams, body-colour handles, black running boards, black roof rails ----------
def vline(z0, z1, y0, y1, w=.006): return lambda u, v: (z0+(z1-z0)*u+(v-.5)*w, y0+(y1-y0)*u)
for zz_ in ((1.10, 1.06, .52, 1.32), (-.05, -.08, .52, 1.32), (-1.20, -1.02, .80, 1.33)):    # front door front, B pillar, rear door back
    side_patch(trim, 'Trim', vline(*zz_), 10, 1)
side_patch(trim, 'Trim', lambda u, v: (1.10-2.30*u, .53+(v-.5)*.006), 30, 1)
for zc in (.30, -.80):
    side_patch(trim, 'Handle', lambda u, v, zc=zc: (zc-.17*u, 1.16+.03*v), 6, 1, push=.008)
box(trim, 'Trim', (HW-.02, .40, (ZA_F-RA-.10+ZA_R+RA+.10)/2), (.17, .035, (ZA_F-RA-.10)-(ZA_R+RA+.10)))   # running board
for x in (.80,):
    box(trim, 'TrimGloss', (x, 1.962, -.95), (.035, .03, 3.0))                                  # roof rail along the roof's edge
    for zc in (-2.35, .48): box(trim, 'TrimGloss', (x, 1.932, zc), (.045, .05, .16))             # its feet
# ---------- door mirrors: gloss black, square-ish, on the door below the A pillar ----------
mir = Mesh('Mirrors')
box(trim, 'Paint', (0.0001, 1.905, -2.43), (1.52, .03, .12))      # body-colour spoiler on the roof's back edge, over the glass
box(tails, 'Taillight', (0.0001, 1.886, -2.485+.035), (.34, .014, .012))   # high-mounted brake light under it (built 3.5 cm in)
box(trim, 'TrimGloss', (0.0001, 1.45, -2.648), (.07, .04, .02))         # rear wiper: pivot
box(trim, 'TrimGloss', (-.17, 1.48, -2.643), (.34, .016, .012))      # and its arm and blade, lying across the glass
def ellipsoid(m, mat, c, r, nu=14, nv=10, cut=None):
    for side in (1, -1):
        idx = []
        for i in range(nu+1):
            a = i/nu*2*math.pi; row = []
            for j in range(nv+1):
                b = -math.pi/2+j/nv*math.pi; p = (c[0]+r[0]*math.cos(b)*math.cos(a), c[1]+r[1]*math.sin(b), c[2]+r[2]*math.cos(b)*math.sin(a))
                row.append(m.v((side*p[0], p[1], p[2])))
            idx.append(row)
        for i in range(nu):
            for j in range(nv):
                a_, b_, c_, d_ = idx[i][j], idx[i+1][j], idx[i][j+1], idx[i+1][j+1]
                if side > 0: m.tri(mat, a_, c_, b_); m.tri(mat, b_, c_, d_)
                else: m.tri(mat, a_, b_, c_); m.tri(mat, b_, d_, c_)
box(mir, 'TrimGloss', (1.105, 1.445, 1.255), (.19, .165, .085))   # tall, squarish gloss black housing (photo)
ellipsoid(mir, 'TrimGloss', (1.105, 1.445, 1.285), (.095, .083, .03))
box(mir, 'MirrorGlass', (1.105, 1.445, 1.211), (.17, .14, .006))    # the glass, facing back
box(mir, 'TrimGloss', (1.035, 1.39, 1.265), (.07, .06, .11))        # short arm to the door
# ---------- red brake calipers, fixed to the body inside each wheel ----------
brk = Mesh('Brakes')
for za in (ZA_F, ZA_R):
    for side in (1, -1):                                       # brake disc behind the spokes
        c = brk.v((side*(TRACK/2+.002), TYRE_R, za)); ring = [brk.v((side*(TRACK/2+.002), TYRE_R+.205*math.sin(a), za+.205*math.cos(a))) for a in np.linspace(0, 2*math.pi, 33)]
        for a_, b_ in zip(ring, ring[1:]): brk.tri('Rotor', c, a_, b_)
    for k in range(9):                                         # big red caliper over the back of it
        a = math.radians(100+k*10); box(brk, 'Caliper', (TRACK/2+.022, TYRE_R+math.sin(a)*.195, za+math.cos(a)*.195), (.05, .06, .05))

# ---------- wheels: tyre and a 22" dark multi-spoke wheel (ten twisted twin spokes) ----------
def wheel_mesh(name, outward):
    m = Mesh(name); RIM = .2794
    def lathe(mat, prof, n=44):
        idx = []
        for i in range(n+1):
            a = i/n*2*math.pi; idx.append([m.v((outward*px, pr*math.cos(a), pr*math.sin(a))) for px, pr in prof])
        for i in range(n):
            for j in range(len(prof)-1):
                a_, b_, c_, d_ = idx[i][j], idx[i+1][j], idx[i][j+1], idx[i+1][j+1]
                if outward > 0: m.tri(mat, a_, b_, c_); m.tri(mat, b_, d_, c_)
                else: m.tri(mat, a_, c_, b_); m.tri(mat, b_, c_, d_)
    w = TYRE_W/2
    lathe('Tyre', [(-w*.9, RIM), (-w, RIM+.03), (-w*.98, TYRE_R-.04), (-w*.85, TYRE_R-.007), (-w*.5, TYRE_R), (w*.5, TYRE_R), (w*.85, TYRE_R-.007), (w*.98, TYRE_R-.04), (w, RIM+.03), (w*.9, RIM)])
    lathe('Rim', [(w*.9, RIM), (w*.80, RIM-.008), (w*.74, RIM-.025), (w*.30, RIM-.025)])
    lathe('Well', [(w*.0, RIM-.03), (-w*.2, .19), (-w*.2, 0.)], 24)
    def quad(mat, a_, b_, c_, d_):
        if outward > 0: m.tri(mat, a_, b_, c_); m.tri(mat, b_, d_, c_)
        else: m.tri(mat, a_, c_, b_); m.tri(mat, b_, c_, d_)
    # ten spokes, each splitting into two arms that twist toward the rim (22" Magnetite, Stealth Performance Package);
    # every arm is a solid bar: a ridged face, two side walls and a back, so it has depth from any angle
    for k in range(10):
        for arm in (-1, 1):
            a0 = k/10*2*math.pi; rows = []
            for q in range(10):
                t = q/9; rr = .07+(RIM-.028-.07)*t
                split = arm*.085*min(1, t/.4)**1.3                                   # one root at the hub, two arms toward the rim
                a = a0+split+.07*t                                                    # a slight twist
                wd = (.040-.012*min(1, t/.4))/rr                                      # arm ~2.8 cm wide at the rim, wider at the root
                xo = w*.74+.050*(1-t)**.8                                             # concave: hub stands out
                pts = [(xo+.006*(j == 1), a+(j-1)*wd/2) for j in range(3)]
                face = [m.v((outward*x_, rr*math.cos(a_), rr*math.sin(a_))) for x_, a_ in pts]
                back = [m.v((outward*(xo-.032), rr*math.cos(a+(j-1)*wd/2), rr*math.sin(a+(j-1)*wd/2))) for j in (0, 2)]
                rows.append(face+back)
            for q in range(9):
                r0, r1 = rows[q], rows[q+1]
                quad('Spoke', r0[0], r1[0], r0[1], r1[1]); quad('Spoke', r0[1], r1[1], r0[2], r1[2])     # face
                quad('SpokeSide', r0[3], r1[3], r0[0], r1[0]); quad('SpokeSide', r0[2], r1[2], r0[4], r1[4])   # side walls
    lathe('Spoke', [(w*.74+.050, .095), (w*.74+.056, .082), (w*.74+.058, .05)], 30)                  # hub face
    lathe('Cap', [(w*.74+.0585, .05), (w*.74+.064, .044), (w*.74+.066, 0.)], 24)                    # plain centre cap
    for k in range(6):                                                                               # six lug nuts
        a = k/6*2*math.pi+.26; cy, cz = .068*math.cos(a), .068*math.sin(a)
        prof = [(w*.74+.0585, .0105), (w*.74+.072, .0105), (w*.74+.074, .006), (w*.74+.0745, 0.)]
        idx = []
        for i in range(7):
            b_ = i/6*2*math.pi; idx.append([m.v((outward*px, cy+pr*math.cos(b_), cz+pr*math.sin(b_))) for px, pr in prof])
        for i in range(6):
            for j in range(len(prof)-1): quad('Lug', idx[i][j], idx[i+1][j], idx[i][j+1], idx[i+1][j+1])
    return m
wheels = [(n, x, ZA) for n, x, ZA in (('Wheel_FL', TRACK/2, ZA_F), ('Wheel_FR', -TRACK/2, ZA_F), ('Wheel_RL', TRACK/2, ZA_R), ('Wheel_RR', -TRACK/2, ZA_R))]

# ---------- write the .glb ----------
MATS = {
 'Paint':     dict(c=[.105, .140, .190, 1], m=.3, r=.38),      # light blue-grey metallic (as in the photos)
 'Glass':     dict(c=[.030, .038, .050, 1], m=.75, r=.04),       # tinted glass, reflective (photo)
 'TrimGloss': dict(c=[.008, .008, .010, 1], m=.4, r=.08),        # gloss black: pillars, tailgate band, mirrors, rails
 'Chrome':    dict(c=[.40, .42, .45, 1], m=1, r=.15),
 'Amber':     dict(c=[.55, .22, .02, 1], m=.2, r=.2),
 'RedLens':  dict(c=[.09, .008, .008, 1], m=.3, r=.08),        # smoked red lens
 'Trim':      dict(c=[.020, .020, .022, 1], m=.1, r=.6),
 'Grille':    dict(c=[.012, .012, .014, 1], m=.4, r=.25),
 'Bar':       dict(c=[.035, .036, .040, 1], m=.5, r=.35),
 'Headlight': dict(c=[.12, .125, .13, 1], m=.7, r=.1),
 'Plate':     dict(c=[.55, .56, .58, 1], m=0, r=.6),
 'Badge':     dict(c=[.02, .05, .20, 1], m=.4, r=.25),
 'Handle':    dict(c=[.105, .140, .190, 1], m=.3, r=.38),
 'MirrorGlass': dict(c=[.25, .28, .32, 1], m=.9, r=.05),
 'Taillight': dict(c=[.25, .02, .02, 1], m=.2, r=.2),
 'Reflector': dict(c=[.35, .02, .02, 1], m=.1, r=.3),
 'Caliper':   dict(c=[.45, .02, .02, 1], m=.2, r=.4),
 'Tyre':      dict(c=[.022, .022, .024, 1], m=0, r=.85),
 'Rim':       dict(c=[.045, .048, .052, 1], m=.45, r=.32),        # Magnetite: a dark metallic grey
 'SpokeSide': dict(c=[.030, .032, .035, 1], m=.45, r=.35),
 'Cap':       dict(c=[.015, .015, .017, 1], m=.5, r=.25),
 'Lug':       dict(c=[.30, .31, .33, 1], m=1, r=.25),
 'Rotor':     dict(c=[.16, .16, .17, 1], m=.9, r=.45),        # dark gunmetal
 'Spoke':     dict(c=[.052, .055, .060, 1], m=.45, r=.30),
 'Well':      dict(c=[.008, .008, .009, 1], m=0, r=.9),
}
matnames = list(MATS)
J = dict(asset=dict(version='2.0', generator='explorer3d tools/make-expedition.py'), scene=0, scenes=[dict(nodes=[0])],
         nodes=[dict(name='Ford_Expedition_2025', children=[])], meshes=[], accessors=[], bufferViews=[], buffers=[],
         materials=[dict(name=k, pbrMetallicRoughness=dict(baseColorFactor=v['c'], metallicFactor=v['m'], roughnessFactor=v['r']), doubleSided=True) for k, v in MATS.items()])
BIN = bytearray()
def add(arr, ctype, typ, target):
    global BIN
    while len(BIN) % 4: BIN.append(0)
    off = len(BIN); b = arr.tobytes(); BIN += b
    J['bufferViews'].append(dict(buffer=0, byteOffset=off, byteLength=len(b), target=target))
    a = dict(bufferView=len(J['bufferViews'])-1, componentType=ctype, count=len(arr), type=typ)
    if typ == 'VEC3': a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    if target is None: del J['bufferViews'][-1]['target']
    J['accessors'].append(a); return len(J['accessors'])-1
def normals(P, prims):
    N = np.zeros_like(P)
    for I in prims.values():
        T = np.array(I).reshape(-1, 3); a, b, c = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
        n = np.cross(b-a, c-a)
        for k in range(3): np.add.at(N, T[:, k], n)
    l = np.linalg.norm(N, axis=1, keepdims=True); l[l == 0] = 1; return (N/l).astype('<f4')
def put(m, translation=None, parent=0, offset=(0, 0, 0)):
    P = np.array(m.P, dtype='<f4')-np.array(offset, dtype='<f4')
    # weld nothing; smooth normals per mesh (shared vertices already shared)
    N = normals(P, m.prims)
    if getattr(m, 'N', None) is not None: N = np.array(m.N, dtype='<f4')
    pa = add(P, 5126, 'VEC3', 34962); na = add(N, 5126, 'VEC3', 34962)
    at = dict(POSITION=pa, NORMAL=na)
    if getattr(m, 'UV', None): at['TEXCOORD_0'] = add(np.array(m.UV, dtype='<f4'), 5126, 'VEC2', 34962)
    if getattr(m, 'COL', None) is not None: at['COLOR_0'] = add(np.array(m.COL, dtype='<f4'), 5126, 'VEC3', 34962)
    prims = []
    for mat, I in m.prims.items():
        ia = add(np.array(I, dtype='<u4' if len(P) > 65535 else '<u2'), 5125 if len(P) > 65535 else 5123, 'SCALAR', 34963)
        prims.append(dict(attributes=at, indices=ia, material=matnames.index(mat)))
    J['meshes'].append(dict(name=m.name, primitives=prims))
    node = dict(name=m.name, mesh=len(J['meshes'])-1)
    if translation: node['translation'] = list(translation)
    J['nodes'].append(node); J['nodes'][parent]['children'].append(len(J['nodes'])-1)
for m in (body, gh, heads, tails, trim, plate, mir, brk):
    if m.prims: put(m)
for name, x, za in wheels:
    put(wheel_mesh(name, 1 if x > 0 else -1), translation=(x, TYRE_R, za))
while len(BIN) % 4: BIN.append(0)
J['buffers'] = [dict(byteLength=len(BIN))]
js = json.dumps(J, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
out = sys.argv[1] if len(sys.argv) > 1 else 'models/expedition.glb'
with open(out, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12+8+len(js)+8+len(BIN)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(BIN), 0x004E4942)); f.write(BIN)
print(out, len(BIN)//1024, 'KB')
