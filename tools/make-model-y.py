# Builds models/model-y.glb: a 2023 Tesla Model Y Long Range (Pearl White, 20" black Induction-style aero wheels),
# made from the owner's photos (2026-11-21) and the car's published size. Usage: python3 tools/make-model-y.py models/model-y.glb
# Units metres, front +z, ground y = 0, car centre at the origin (half way along its 4.75 m). The game's model loader
# (js/game.js loadModel) wants: wheels as nodes named Wheel_* with their centre at the node origin; lamp meshes on their own
# with materials named Headlight / Taillight (it lights them, and pushes them 3.5 cm out from the car's end, so they're
# built 3.5 cm in); glass and trim materials named Glass / Trim (drawn over the paint without flicker).
import sys, json, struct, math
import numpy as np
from scipy.interpolate import PchipInterpolator as Pchip

L = 4.751; ZF, ZR = L/2, -L/2                  # front and rear bumper
WB = 2.890; ZA_F = 1.475; ZA_R = ZA_F-WB        # axles (front overhang ~0.90 m)
TRACK = 1.636; TYRE_R = .369; TYRE_W = .255     # 255/45R20 on 20" wheels
HW = .955                                       # half the 1.92 m body width (no mirrors)

# ---------- side profile (z, y) ----------
top = Pchip([ZR, -2.355, -2.30, -2.20, -2.12, -2.02, -1.80, -1.55, -1.10, -.45, .10, .55, 1.15, 1.45, 1.85, 2.15, 2.28, 2.34, ZF],
            [.62,  .86,   .98,  1.09, 1.135, 1.17,  1.32,  1.45,  1.585, 1.624, 1.59, 1.40, 1.095, 1.04, .975, .895, .80, .70, .55])
belt = Pchip([-2.4, -1.9, -1.0, 0., 1.15, 2.4], [1.13, 1.115, 1.085, 1.06, 1.045, 1.04])
bot = Pchip([ZR, -2.25, -1.95, -1.6, 1.6, 1.95, 2.25, ZF], [.40, .37, .30, .215, .215, .27, .30, .34])

def hw(z):                                       # plan view: half width at the widest point of the section
    h = HW - .014*math.exp(-((z+.25)/.9)**2) + .006*math.exp(-((z-ZA_R)/.45)**2)      # slight waist at the doors, rear haunch
    if z > 1.92: u = min(1, (z-1.92)/(ZF-1.92)); h *= (1-u**2.6)**(1/2.6)                    # rounded nose
    if z < -1.95: u = min(1, (-1.95-z)/(-1.95-ZR)); h *= (1-u**3.4)**(1/3.4)                 # squarer tail
    return max(h, 1e-4)
def ease(a, b, t): t = min(1, max(0, t)); return a+(b-a)*t*t*(3-2*t)
def expo(z):                                     # section shape: hood/tail boxier, cabin flanks rounder
    k = ease(0, 1, (z-1.1)/.35) + ease(0, 1, (-2.0-z)/.25)
    return ease(2.5, 3.6, k), ease(2.3, 3.4, k)   # nu (upper side), mu (upper top)
GB = .86                                         # glass base sits at 86% of the half width (the shoulder below it)

def section(z):
    yb = float(bot(z)); yt0 = float(top(z)); bl = float(belt(z)); h = hw(z); nu, mu = expo(z)
    yw = min(max(.64, yb+.3*(yt0-yb)), yb+.55*(yt0-yb))           # height of the widest point
    phi = math.acos(GB**(nu/2)); frac = math.sin(phi)**(2/mu)      # at x = GB*h the upper curve is frac of the way up
    yt = min(yt0, yw+(bl-yw)/frac)
    return dict(z=z, yb=yb, yt=yt, ytop=yt0, belt=bl, hw=h, nu=nu, mu=mu, yw=yw, frac=frac)
def sec_pt(S, phi):                              # phi -pi/2 (bottom) .. pi/2 (top), right half
    if phi >= 0:
        c, s = math.cos(phi), math.sin(phi); x = S['hw']*c**(2/S['nu']); y = S['yw']+(S['yt']-S['yw'])*s**(2/S['mu'])
        t = (y-S['yw'])/max(1e-6, S['yt']-S['yw']); x *= 1-.035*t*t                  # a little more tumblehome toward the shoulder
    else:
        c, s = math.cos(phi), -math.sin(phi); x = S['hw']*c**(2/4.); y = S['yw']-(S['yw']-S['yb'])*s**(2/4.5)
        t = (S['yw']-y)/max(1e-6, S['yw']-S['yb']); x *= 1-.05*t*t                   # tucked under at the sills
    return x, y
def halfwidth(z, y):                             # body half width at height y (for putting lamps and trim on the surface)
    S = section(z)
    if y > S['yt'] or y < S['yb']: return -1
    lo, hi = (0, math.pi/2) if y >= S['yw'] else (-math.pi/2, 0)
    for _ in range(40):
        m = (lo+hi)/2; _, ym = sec_pt(S, m)
        if y >= S['yw']: lo, hi = (m, hi) if ym < y else (lo, m)
        else: lo, hi = (m, hi) if ym < y else (lo, m)
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
NZ, NP = 160, 44
t = np.linspace(0, 1, NZ)
zs = ZR+(ZF-ZR)*((.5-.5*np.cos(np.pi*t))*.55+t*.45)
phis = np.linspace(-math.pi/2, math.pi/2, NP)
SECS = [section(float(z)) for z in zs]
body = Mesh('Body')
G = []
for S in SECS:
    row = []
    for ph in phis:
        x, y = sec_pt(S, float(ph)); row.append([x, y, S['z']])
    G.append(row)
G = np.array(G)
# wheel arches: push the body in to a dark wheel well around each wheel (radius RA in the side view)
RA = .435; XW = .70
well = np.zeros(G.shape[:2], bool)
for za in (ZA_F, ZA_R):
    dz, dy = G[:, :, 2]-za, G[:, :, 1]-TYRE_R; d = np.hypot(dz, dy)
    k = (d < RA) & (G[:, :, 0] > XW-.001)
    edge = k.copy(); inner = np.zeros_like(k)                 # inside vertices with an outside neighbour become the arch edge
    inner[1:-1, 1:-1] = k[1:-1, 1:-1] & k[:-2, 1:-1] & k[2:, 1:-1] & k[1:-1, :-2] & k[1:-1, 2:]
    inner |= k & (dy < -.03)                                  # below the axle the opening runs out under the car: no lip there
    edge &= ~inner
    sc = np.where(edge, RA/np.maximum(d, 1e-6), 1.)
    G[:, :, 2] = np.where(edge, za+dz*sc, G[:, :, 2]); G[:, :, 1] = np.where(edge, TYRE_R+dy*sc, G[:, :, 1])
    G[:, :, 0] = np.where(inner, XW, G[:, :, 0]); well |= inner
# lower the arch lip a touch so the opening reads round (the row just outside the cut keeps its paint)
def body_mat(i, j):
    zc = (zs[i]+zs[i+1])/2; y = G[i:i+2, j:j+2, 1].mean(); S = SECS[i]
    if well[i:i+2, j:j+2].any(): return 'Trim'
    if j < 7: return 'Trim'                                              # underside
    if -1.0 < zc < 1.05 and j < 13: return 'Trim'                        # black sill strip
    if zc > 2.05 and y < .385 and abs(G[i, j, 0]) < .78: return 'Trim'  # lower front intake
    if zc < -1.9 and y < .47: return 'Trim'                              # rear diffuser
    return 'Paint'
mirror_grid(body, G.tolist(), body_mat)
# close the very ends (degenerate already: hw -> 0) — nothing to add.

# ---------- greenhouse: windshield, side glass, glass roof, rear glass; a painted rail along the roof edge ----------
gh = Mesh('Glasshouse')
def gpt(z, u):                                   # u 0 = glass base at the belt, .5 = top of the side glass, 1 = roof centre
    S = section(z)
    x0 = GB*S['hw']; y0 = S['yw']+(S['yt']-S['yw'])*S['frac'] - .004
    H = max(0., S['ytop']-y0); r = min(.11, .45*H); rw = max(x0-.40*(H-r), .55*x0)
    if u <= .5: q = u/.5; return [x0+(rw-x0)*q, y0+(H-r)*q, z]          # side glass: a straight line leaning in
    a = (u-.5)/.5*math.pi/2; return [rw*math.cos(a)**(2/3.2), y0+(H-r)+r*math.sin(a)**(2/2.2), z]   # crown across the roof
zz = np.linspace(-2.3, 1.4, 800)
hasH = [float(top(z)) > section(float(z))['yw']+(section(float(z))['yt']-section(float(z))['yw'])*section(float(z))['frac']+.006 for z in zz]
ZG0 = max(-2.08, float(zz[hasH.index(True)])); ZG1 = float(zz[len(hasH)-1-hasH[::-1].index(True)])
def ggrid(u0, u1, z0f, z1f, nz, nu, mat):
    G = [[gpt(z0f(u)+(z1f(u)-z0f(u))*i/nz, u) for u in np.linspace(u0, u1, nu+1)] for i in range(nz+1)]
    mirror_grid(gh, G, lambda i, j: mat)
zC = lambda u: -1.80+.28*min(u, .5)/.5          # rear edge of the rear quarter glass (leans forward toward the top)
zA = lambda u: .97-.80*min(u, .5)/.5            # front edge of the front door glass: the A pillar is ahead of it
cz0, cz1 = (lambda u: ZG0), (lambda u: ZG1)
ggrid(0, .5, cz0, zC, 14, 14, 'Paint')          # C pillar
ggrid(0, .5, zC, zA, 70, 14, 'Glass')           # door and quarter glass (the B pillar is black glass-look on the Model Y)
ggrid(0, .5, zA, cz1, 18, 14, 'Paint')          # A pillar
ggrid(.5, .535, cz0, cz1, 100, 1, 'Paint')      # painted roof rail along the top of the side glass
ggrid(.535, 1, cz0, cz1, 100, 12, 'Glass')      # rear glass, glass roof, windshield

# ---------- things on the surface: lamps, seams, handles ----------
def zfront(x, y, lo=1.7):
    hi = ZF+.01
    if halfwidth(lo, y) < abs(x): return None
    for _ in range(36):
        m = (lo+hi)/2
        if halfwidth(m, y) >= abs(x): lo = m
        else: hi = m
    return lo
def zrear(x, y, hi=-1.75):
    lo = ZR-.01
    if halfwidth(hi, y) < abs(x): return None
    for _ in range(36):
        m = (lo+hi)/2
        if halfwidth(m, y) >= abs(x): hi = m
        else: lo = m
    return hi
def patch(m, mat, f, nu, nv, push=.004, zfn=zfront, sgn=1, shift=0.):
    # a surface patch: f(u,v) -> (x,y); z found on the body's front (sgn 1) or rear (sgn -1); pushed `push` out along z
    for side in (1, -1):
        idx = []
        for i in range(nu+1):
            row = []
            for j in range(nv+1):
                x, y = f(i/nu, j/nv); z = zfn(x, y)
                if z is None: z = (1.3 if sgn > 0 else -1.3)
                row.append(m.v((side*x, y, z+sgn*push+shift)))
            idx.append(row)
        for i in range(nu):
            for j in range(nv):
                a, b, c, d = idx[i][j], idx[i+1][j], idx[i][j+1], idx[i+1][j+1]
                if (side*sgn) > 0: m.tri(mat, a, b, c); m.tri(mat, b, d, c)
                else: m.tri(mat, a, c, b); m.tri(mat, b, c, d)
# headlights: a narrow swept "eye" under the hood edge, thin at the inboard end, taller and higher outboard
heads = Mesh('Headlights')
def wmax(y, z): return max(halfwidth(z, y), .1)
def headf(u, v):
    yc = .752+.05*u**1.6; h = .028+.052*u**1.3
    lower = yc-h/2+.012*math.sin(math.pi*u); y = lower+(yc+h/2-lower)*v
    return (.42+.565*u**.95)*wmax(y, 1.7), y
patch(heads, 'Headlight', lambda u, v: headf(.03+.94*u, .18+.64*v), 26, 4, push=.006, shift=-.035)
hous = Mesh('HeadlightHousings')
def housf(u, v):
    x, y = headf(u, v); return x, y+(v-.5)*.012
patch(hous, 'Trim', housf, 26, 4, push=.0035)
# tail lights: a wedge on each rear corner, pointed inboard on the hatch, deep outboard on the quarter panel
tails = Mesh('Taillights')
def tailf(u, v):
    yt = 1.085-.03*u; yb = yt-(.026+.115*u**1.25); y = yb+(yt-yb)*v
    return (.39+.595*u)*wmax(y, -1.75), y
patch(tails, 'Taillight', tailf, 26, 5, push=.004, zfn=zrear, sgn=-1, shift=.035)
# seams and black details drawn on the surface (Trim)
trim = Mesh('Details')
def strip_front(pts, w, push=.003):
    def f(u, v):
        n = len(pts)-1; k = min(n-1, int(u*n)); q = u*n-k; x = pts[k][0]+(pts[k+1][0]-pts[k][0])*q; y = pts[k][1]+(pts[k+1][1]-pts[k][1])*q
        dx, dy = pts[k+1][0]-pts[k][0], pts[k+1][1]-pts[k][1]; l = math.hypot(dx, dy) or 1
        return x+(-dy/l)*(v-.5)*w, y+(dx/l)*(v-.5)*w
    return f
# rear: hatch seams (sides of the hatch through the tail lights, and its bottom edge)
patch(trim, 'Trim', strip_front([(.60, .80), (.605, .95), (.61, 1.10)], .006), 12, 1, push=.0045, zfn=zrear, sgn=-1)
patch(trim, 'Trim', strip_front([(0, .80), (.30, .80), (.60, .80)], .006), 12, 1, push=.0045, zfn=zrear, sgn=-1)
plate = Mesh('Plate')
patch(plate, 'Plate', lambda u, v: (.155*u, .515+.155*v), 4, 2, push=.006, zfn=zrear, sgn=-1)   # both halves: patch() mirrors it
patch(trim, 'Trim', lambda u, v: (.168*u, .503+.18*v), 4, 2, push=.004, zfn=zrear, sgn=-1)
# front: lower intake slot and the frunk lid edge line
patch(trim, 'Trim', strip_front([(0, .875), (.35, .87), (.66, .845)], .0035), 14, 1, push=.003, zfn=zfront)
# sides: door seams, flush door handles (on the body's side: found along x at a given z, y)
def side_patch(m, mat, f, nu, nv, push=.003):
    for side in (1, -1):
        idx = []
        for i in range(nu+1):
            row = []
            for j in range(nv+1):
                z, y = f(i/nu, j/nv); x = halfwidth(z, y)+push
                row.append(m.v((side*x, y, z)))
            idx.append(row)
        for i in range(nu):
            for j in range(nv):
                a, b, c, d = idx[i][j], idx[i+1][j], idx[i][j+1], idx[i+1][j+1]
                if side > 0: m.tri(mat, a, c, b); m.tri(mat, b, c, d)
                else: m.tri(mat, a, b, c); m.tri(mat, b, d, c)
def vline(z0, z1, y0, y1, w=.006):
    return lambda u, v: (z0+(z1-z0)*u+(v-.5)*w, y0+(y1-y0)*u)
for zz in ((1.0, .97, .31, 1.03), (-.24, -.28, .31, 1.06), (-1.32, -1.16, 1.07, .80)):   # front door front edge, B pillar seam, rear door back edge
    side_patch(trim, 'Trim', vline(zz[0], zz[1], zz[2], zz[3]), 10, 1)
side_patch(trim, 'Trim', lambda u, v: (.97+(-.97-.97)*u, .31+(v-.5)*.006), 30, 1)   # door bottoms along the sill
for zc in (-.02, -1.08):                                               # flush handles (black, like the owner's)
    side_patch(trim, 'Trim', lambda u, v, zc=zc: (zc-.11*u+.012*math.sin(math.pi*u)*0, .905+.022*(v-.5)*2*(1 if u > .25 else .7)), 8, 1, push=.004)

# ---------- door mirrors: painted caps on black arms at the base of the A pillar ----------
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
ellipsoid(mir, 'Paint', (.975, 1.095, .93), (.095, .05, .05))
ellipsoid(mir, 'Glass', (.975, 1.095, .895), (.086, .043, .02))
ellipsoid(mir, 'Trim', (.89, 1.065, .95), (.075, .028, .06))

# ---------- wheels: tyre and a black 20" aero wheel with turbine blades ----------
def wheel_mesh(name, outward):
    m = Mesh(name); RIM = .254
    def lathe(mat, prof, n=40):                 # prof: (x across the tyre, r) points; revolved about the x axis
        idx = []
        for i in range(n+1):
            a = i/n*2*math.pi; idx.append([m.v((outward*px, pr*math.cos(a), pr*math.sin(a))) for px, pr in prof])
        for i in range(n):
            for j in range(len(prof)-1):
                a_, b_, c_, d_ = idx[i][j], idx[i+1][j], idx[i][j+1], idx[i+1][j+1]
                if outward > 0: m.tri(mat, a_, b_, c_); m.tri(mat, b_, d_, c_)
                else: m.tri(mat, a_, c_, b_); m.tri(mat, b_, c_, d_)
    w = TYRE_W/2
    lathe('Tyre', [(-w*.9, RIM), (-w, RIM+.03), (-w*.98, TYRE_R-.035), (-w*.85, TYRE_R-.006), (-w*.5, TYRE_R), (w*.5, TYRE_R), (w*.85, TYRE_R-.006), (w*.98, TYRE_R-.035), (w, RIM+.03), (w*.9, RIM)])
    lathe('Rim', [(w*.9, RIM), (w*.78, RIM-.012), (w*.70, RIM-.03), (w*.72, .06), (w*.80, 0.)])               # outer face: dished aero cover
    lathe('Rim', [(-w*.9, RIM), (-w*.6, RIM-.01), (-w*.6, 0.)], 24)                                          # inner barrel / backing
    # turbine blades on the face
    for k in range(14):
        a0 = k/14*2*math.pi; pts = []
        for q in range(7):
            rr = .07+(RIM-.085)*q/6; a = a0+.55*q/6
            pts.append((rr, a))
        for (r1, a1), (r2, a2) in zip(pts, pts[1:]):
            for da in (0, .045):
                pass
            quad = [(r1, a1), (r2, a2), (r2, a2+.06), (r1, a1+.06)]
            ids = [m.v((outward*(w*.72+.006*(1-(r-.07)/.2)+.004), r*math.cos(a), r*math.sin(a))) for r, a in quad]
            if outward > 0: m.tri('Spoke', ids[0], ids[1], ids[2]); m.tri('Spoke', ids[0], ids[2], ids[3])
            else: m.tri('Spoke', ids[0], ids[2], ids[1]); m.tri('Spoke', ids[0], ids[3], ids[2])
    lathe('Spoke', [(w*.80+.006, .055), (w*.82+.008, .03), (w*.82+.008, 0.)], 24)                              # centre cap
    return m
wheels = [(n, x, ZA) for n, x, ZA in (('Wheel_FL', TRACK/2, ZA_F), ('Wheel_FR', -TRACK/2, ZA_F), ('Wheel_RL', TRACK/2, ZA_R), ('Wheel_RR', -TRACK/2, ZA_R))]

# ---------- write the .glb ----------
MATS = {
 'Paint':     dict(c=[.62, .625, .62, 1], m=.05, r=.35),        # Pearl White multi-coat
 'Glass':     dict(c=[.012, .014, .018, 1], m=.55, r=.06),
 'Trim':      dict(c=[.018, .018, .02, 1], m=.1, r=.55),
 'Headlight': dict(c=[.10, .105, .11, 1], m=.7, r=.1),
 'Plate':     dict(c=[.55, .56, .58, 1], m=0, r=.6),
 'Taillight': dict(c=[.25, .02, .02, 1], m=.2, r=.2),
 'Tyre':      dict(c=[.022, .022, .024, 1], m=0, r=.85),
 'Rim':       dict(c=[.03, .031, .034, 1], m=.5, r=.4),          # black aero wheel
 'Spoke':     dict(c=[.05, .052, .056, 1], m=.2, r=.5),
}
matnames = list(MATS)
J = dict(asset=dict(version='2.0', generator='explorer3d tools/make-model-y.py'), scene=0, scenes=[dict(nodes=[0])],
         nodes=[dict(name='Tesla_Model_Y_2023', children=[])], meshes=[], accessors=[], bufferViews=[], buffers=[],
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
    pa = add(P, 5126, 'VEC3', 34962); na = add(N, 5126, 'VEC3', 34962)
    prims = []
    for mat, I in m.prims.items():
        ia = add(np.array(I, dtype='<u4' if len(P) > 65535 else '<u2'), 5125 if len(P) > 65535 else 5123, 'SCALAR', 34963)
        prims.append(dict(attributes=dict(POSITION=pa, NORMAL=na), indices=ia, material=matnames.index(mat)))
    J['meshes'].append(dict(name=m.name, primitives=prims))
    node = dict(name=m.name, mesh=len(J['meshes'])-1)
    if translation: node['translation'] = list(translation)
    J['nodes'].append(node); J['nodes'][parent]['children'].append(len(J['nodes'])-1)
for m in (body, gh, heads, hous, tails, trim, plate, mir): put(m)
for name, x, za in wheels:
    put(wheel_mesh(name, 1 if x > 0 else -1), translation=(x, TYRE_R, za))
while len(BIN) % 4: BIN.append(0)
J['buffers'] = [dict(byteLength=len(BIN))]
js = json.dumps(J, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
out = sys.argv[1] if len(sys.argv) > 1 else 'models/model-y.glb'
with open(out, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12+8+len(js)+8+len(BIN)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(BIN), 0x004E4942)); f.write(BIN)
nv = sum(len(m.P) for m in (body, gh, heads, hous, tails, trim, plate, mir))
print(out, len(BIN)//1024, 'KB binary,', nv, 'vertices without wheels')
