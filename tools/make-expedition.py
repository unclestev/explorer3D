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
WB = 3.112; ZA_F = ZF-.985; ZA_R = ZA_F-WB      # 122.5 in wheelbase, ~0.98 m front overhang
TRACK = 1.72; TYRE_R = .4165; TYRE_W = .275     # 275/50R22
HW = 1.012                                      # half the 2.024 m body width (no mirrors)

# ---------- side profile (z, y): a tall box — flat roof, upright tailgate, long flat hood, square nose ----------
top = Pchip([ZR, -2.66, -2.645, -2.62, -2.56, -2.40, -1.0, .30, .62, .90, 1.20, 1.46, 1.60, 2.10, 2.50, 2.62, ZF],
            [.56, 1.05,  1.50,  1.76,  1.86,  1.895, 1.905, 1.90, 1.875, 1.74, 1.56, 1.40, 1.375, 1.355, 1.32, 1.26, .70])
belt = Pchip([-2.7, -2.2, -1.0, 0., 1.2, 1.40, 1.52, 2.7], [1.34, 1.34, 1.33, 1.325, 1.32, 1.33, 1.42, 1.42])   # up over the hood ahead of the windshield (the hood is body, not glass)
bot = Pchip([ZR, -2.5, -2.2, -1.95, 1.95, 2.3, 2.55, ZF], [.55, .50, .46, .42, .42, .45, .48, .52])

def hw(z):
    h = HW
    if z > 2.50: u = min(1, (z-2.50)/(ZF-2.50)); h *= (1-u**3.2)**(1/3.2)      # square nose, rounded corners
    if z < -2.58: u = min(1, (-2.58-z)/(-2.58-ZR)); h *= (1-u**3.5)**(1/3.5)  # flat tailgate
    return max(h, 1e-4)
def ease(a, b, t): t = min(1, max(0, t)); return a+(b-a)*t*t*(3-2*t)
def expo(z): return 7.0, 3.4                    # boxy section: slab sides, a shoulder radius at the belt
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
    else:
        c, s = math.cos(phi), -math.sin(phi); x = S['hw']*c**(2/7.); y = S['yw']-(S['yw']-S['yb'])*s**(2/6.)
        t = (S['yw']-y)/max(1e-6, S['yw']-S['yb']); x *= 1-.03*t*t
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
RA = .50; XW = .78                               # wheel arches round the 22" wheels
well = np.zeros(G.shape[:2], bool)
for za in (ZA_F, ZA_R):
    dz, dy = G[:, :, 2]-za, G[:, :, 1]-TYRE_R; d = np.hypot(dz, dy)
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
    H = max(0., S['ytop']-y0); r = min(.09, .45*H); rw = max(x0-.17*(H-r), .55*x0)
    if u <= .5: q = u/.5; return [x0+(rw-x0)*q, y0+(H-r)*q, z]
    a = (u-.5)/.5*math.pi/2; return [rw*math.cos(a)**(2/5.0), y0+(H-r)+r*math.sin(a)**(2/2.4), z]
zz = np.linspace(-2.66, 1.7, 900)
def has(z): S = section(float(z)); return float(top(z)) > S['yw']+(S['yt']-S['yw'])*S['frac']+.006
hasH = [has(z) for z in zz]
ZG0 = float(zz[hasH.index(True)]); ZG1 = float(zz[len(hasH)-1-hasH[::-1].index(True)])
def ggrid(u0, u1, z0f, z1f, nz, nu, mat):
    G = [[gpt(z0f(u)+(z1f(u)-z0f(u))*i/nz, u) for u in np.linspace(u0, u1, nu+1)] for i in range(nz+1)]
    mirror_grid(gh, G, lambda i, j: mat)
zD = lambda u: -2.50+.02*min(u, .5)/.5             # back of the side glass (a thin body-colour D pillar behind it)
zA = lambda u: ZG1-.04-.62*min(u, .5)/.5              # front of the door glass: the A pillar leans back
cz0, cz1 = (lambda u: ZG0), (lambda u: ZG1)
ggrid(0, .5, cz0, zD, 6, 14, 'Paint')              # D pillar
ggrid(0, .5, zD, zA, 120, 14, 'Glass')             # all the side glass; B and C pillars are gloss black, so glass-look
ggrid(0, .5, zA, cz1, 14, 14, 'Glass')             # A pillar: gloss black
ggrid(.5, .54, cz0, cz1, 140, 1, 'Paint')          # roof edge
ggrid(.54, 1, cz0, lambda u: -2.585, 8, 12, 'Glass')        # tailgate glass (the upright back)
ggrid(.54, 1, lambda u: -2.585, lambda u: .64, 100, 12, 'Paint')   # flat painted roof
ggrid(.54, 1, lambda u: .64, cz1, 30, 12, 'Glass')          # windshield

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
            n = surf_normal(x, y, z, sgn); row.append((x+n[0]*push, y+n[1]*push, z+n[2]*push+shift))
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
patch(trim, 'Grille', lambda u, v: (.80*u*W(.88+.36*v), .88+.36*v), 16, 6, push=.004)          # the grille's gloss black field
for yb in (.95, 1.04, 1.13):                                                                     # three heavy horizontal bars
    patch(trim, 'Bar', lambda u, v, yb=yb: (.74*u*W(yb), yb+.034*v), 14, 1, push=.010)
patch(heads, 'Headlight', lambda u, v: ((.80+.17*u)*W(1.05+.15*v), 1.05+.15*v), 10, 4, push=.006, shift=-.035)   # lamps, outer top corners
patch(heads, 'Headlight', lambda u, v: (.94*u*W(.875), .868+.014*v), 30, 1, push=.008, shift=-.035)            # light line under the grille
patch(heads, 'Headlight', lambda u, v: ((.955+.02*v)*W(.875+.36*u), .875+.36*u), 12, 1, push=.008, shift=-.035) # up round the outer end
patch(heads, 'Headlight', lambda u, v: ((.70+.27*u)*W(1.232), 1.226+.012*v), 10, 1, push=.008, shift=-.035)   # over the lamp
patch(trim, 'Trim', lambda u, v: (.985*u*W(.52+.30*v), .52+.30*v), 20, 4, push=.003)                          # black lower front bumper (photo)
patch(trim, 'Bar', lambda u, v: (.62*u*W(.62), .58+.11*v), 12, 2, push=.006)                    # lower intake mesh
patch(plate, 'Badge', lambda u, v: (.075*u*math.sqrt(max(0, 1-(u*.98)**2))*0+.075*u, 1.06+.03*v+0*u), 4, 2, push=.016)   # plain blue oval (no lettering)
patch(trim, 'Trim', lambda u, v: (.90*u*W(1.30, 2.40), 1.285+.006*v), 16, 1, push=.003, zfn=lambda x, y: 2.40)   # hood seam above the grille (a line)

# ---------- rear: a gloss black band across the tailgate, tall C-shaped tail lamps at the corners joined by a red line
# along the top of the band, the plate in a recess, black lower bumper with red reflectors ----------
tails = Mesh('Taillights')
Wr = lambda y: max(halfwidth(-2.62, y), .1)
patch(trim, 'Glass', lambda u, v: (.84*u*Wr(1.06+.36*v), 1.06+.36*v), 16, 4, push=.005, zfn=zrear, sgn=-1)       # black band
patch(trim, 'Trim', lambda u, v: (.985*u*Wr(.57+.18*v), .57+.18*v), 20, 3, push=.003, zfn=zrear, sgn=-1)        # black lower rear bumper
patch(tails, 'Taillight', lambda u, v: ((.84+.155*u)*Wr(1.0+.46*v), 1.0+.46*v), 6, 8, push=.006, zfn=zrear, sgn=-1, shift=.035)   # corner lamps
patch(tails, 'Taillight', lambda u, v: ((.60+.25*u)*Wr(1.38), 1.375+.03*v), 8, 1, push=.008, zfn=zrear, sgn=-1, shift=.035)      # inboard red line
patch(plate, 'Plate', lambda u, v: (.16*u, 1.10+.15*v), 4, 2, push=.009, zfn=zrear, sgn=-1)
patch(trim, 'Reflector', lambda u, v: ((.78+.14*u)*Wr(.60), .58+.03*v), 4, 1, push=.006, zfn=zrear, sgn=-1)
patch(plate, 'Badge', lambda u, v: (.06*u, 1.47+.025*v), 3, 1, push=.008, zfn=zrear, sgn=-1)       # small oval up on the glass edge

# ---------- sides: door seams, body-colour handles, black running boards, black roof rails ----------
def vline(z0, z1, y0, y1, w=.006): return lambda u, v: (z0+(z1-z0)*u+(v-.5)*w, y0+(y1-y0)*u)
for zz_ in ((1.10, 1.06, .52, 1.32), (-.05, -.08, .52, 1.32), (-1.20, -1.02, .80, 1.33)):    # front door front, B pillar, rear door back
    side_patch(trim, 'Trim', vline(*zz_), 10, 1)
side_patch(trim, 'Trim', lambda u, v: (1.10-2.30*u, .53+(v-.5)*.006), 30, 1)
for zc in (.30, -.80):
    side_patch(trim, 'Handle', lambda u, v, zc=zc: (zc-.17*u, 1.16+.03*v), 6, 1, push=.008)
box(trim, 'Trim', (HW-.02, .40, (ZA_F-RA-.10+ZA_R+RA+.10)/2), (.17, .035, (ZA_F-RA-.10)-(ZA_R+RA+.10)))   # running board
for x in (.70,):
    box(trim, 'Glass', (x, 1.955, -.95), (.045, .035, 3.0))                                     # roof rail
    for zc in (-2.35, .45): box(trim, 'Glass', (x, 1.925, zc), (.05, .05, .14))                  # its feet
# ---------- door mirrors: gloss black, square-ish, on the door below the A pillar ----------
mir = Mesh('Mirrors')
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
ellipsoid(mir, 'Glass', (1.10, 1.43, 1.26), (.12, .085, .065))
ellipsoid(mir, 'MirrorGlass', (1.10, 1.43, 1.205), (.105, .072, .012))
box(mir, 'Glass', (1.03, 1.38, 1.27), (.08, .05, .10))
# ---------- red brake calipers, fixed to the body inside each wheel ----------
brk = Mesh('Brakes')
for za in (ZA_F, ZA_R):
    for k in range(8):
        a = math.radians(105+k*9); box(brk, 'Caliper', (TRACK/2-.11, TYRE_R+math.sin(a)*.20, za+math.cos(a)*.20), (.06, .045, .045))

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
    for k in range(20):                                       # ten pairs: each pair splits from one root near the hub
        a0 = (k//2)/10*2*math.pi+(1 if k % 2 else -1)*.035; tw = .16*(1 if k % 2 else .6); row = []
        for q in range(9):
            t = q/8; rr = .075+(RIM-.03-.075)*t; a = a0+tw*t+(1 if k % 2 else -1)*.09*t; wd = .075+.02*t
            xo = w*.74+.04*(1-t)**.7
            row.append([m.v((outward*xo, rr*math.cos(a+s_*wd/2), rr*math.sin(a+s_*wd/2))) for s_ in (-1, 0, 1)])
            row[-1][1] = m.v((outward*(xo+.010), rr*math.cos(a), rr*math.sin(a)))
        for q in range(8):
            for j in range(2):
                a_, b_, c_, d_ = row[q][j], row[q+1][j], row[q][j+1], row[q+1][j+1]
                if outward > 0: m.tri('Spoke', a_, b_, c_); m.tri('Spoke', b_, d_, c_)
                else: m.tri('Spoke', a_, c_, b_); m.tri('Spoke', b_, c_, d_)
    lathe('Spoke', [(w*.74+.04, .085), (w*.74+.05, .07), (w*.74+.056, .04), (w*.74+.058, 0.)], 24)
    lathe('Trim', [(w*.74+.0585, .035), (w*.74+.0590, 0.)], 16)
    return m
wheels = [(n, x, ZA) for n, x, ZA in (('Wheel_FL', TRACK/2, ZA_F), ('Wheel_FR', -TRACK/2, ZA_F), ('Wheel_RL', TRACK/2, ZA_R), ('Wheel_RR', -TRACK/2, ZA_R))]

# ---------- write the .glb ----------
MATS = {
 'Paint':     dict(c=[.105, .140, .190, 1], m=.3, r=.38),      # light blue-grey metallic (as in the photos)
 'Glass':     dict(c=[.010, .011, .014, 1], m=.55, r=.06),       # also the gloss black pillars, band, mirrors, rails
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
 'Rim':       dict(c=[.022, .023, .026, 1], m=.35, r=.45),        # dark gunmetal
 'Spoke':     dict(c=[.026, .027, .030, 1], m=.35, r=.42),
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
