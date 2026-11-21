# Builds models/model-y.glb: a 2023 Tesla Model Y Long Range (Pearl White, 20" black Induction-style aero wheels),
# made from the owner's photos (2026-11-21) and the car's published size. Usage: python3 tools/make-model-y.py models/model-y.glb
# Units metres, front +z, ground y = 0, car centre at the origin (half way along its 4.75 m). The game's model loader
# (js/game.js loadModel) wants: wheels as nodes named Wheel_* with their centre at the node origin; lamp meshes on their own
# with materials named Headlight / Taillight (it lights them, and pushes them 3.5 cm out from the car's end, so they're
# built 3.5 cm in); glass and trim materials named Glass / Trim (drawn over the paint without flicker).
import sys, os, json, struct, math
import numpy as np
from scipy.interpolate import PchipInterpolator as Pchip

L = 4.751; ZF, ZR = L/2, -L/2                  # front and rear bumper
WB = 2.890; ZA_F = 1.475; ZA_R = ZA_F-WB        # axles (front overhang ~0.90 m)
TRACK = 1.636; TYRE_R = .356; TYRE_W = .255     # 255/40R20 (the owner's Goodyears) on 20" wheels
HW = .955                                       # half the 1.92 m body width (no mirrors)

# ---------- side profile (z, y) ----------
top = Pchip([ZR, -2.355, -2.33, -2.29, -2.22, -2.08, -1.80, -1.55, -1.10, -.45, .10, .55, 1.15, 1.45, 1.85, 2.15, 2.28, 2.34, ZF],
            [.55,  .80,   1.02, 1.10, 1.15, 1.185, 1.32,  1.45,  1.585, 1.624, 1.59, 1.40, 1.10, 1.06, 1.005, .945, .865, .76, .58])
belt = Pchip([-2.4, -1.9, -1.0, 0., 1.15, 2.4], [1.13, 1.115, 1.085, 1.06, 1.045, 1.04])
bot = Pchip([ZR, -2.25, -1.95, -1.6, 1.6, 1.95, 2.25, ZF], [.30, .27, .25, .215, .215, .27, .30, .34])

def hw(z):                                       # plan view: half width at the widest point of the section
    h = HW - .014*math.exp(-((z+.25)/.9)**2) + .006*math.exp(-((z-ZA_R)/.45)**2)      # slight waist at the doors, rear haunch
    if z > 1.92: u = min(1, (z-1.92)/(ZF-1.92)); h *= (1-u**2.6)**(1/2.6)                    # rounded nose
    if z < -2.0: u = min(1, (-2.0-z)/(-2.0-ZR)); h *= (1-u**4.5)**(1/4.5)                 # squarer tail
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
RA = .42; XW = .70
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
    if zc < -1.9 and y < .45: return 'Trim'                              # the big black rear diffuser (owner's rear photo)
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
ZG0 = max(-1.97, float(zz[hasH.index(True)])); ZG1 = float(zz[len(hasH)-1-hasH[::-1].index(True)])
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
            if z is None: z = (1.3 if sgn > 0 else -1.3)
            n = surf_normal(x, y, z, sgn); row.append((x+n[0]*push, y+n[1]*push, z+n[2]*push+shift))
        pts.append(row)
    for side in (1, -1):
        idx = [[m.v((side*p[0], p[1], p[2])) for p in row] for row in pts]
        for i in range(nu):
            for j in range(nv):
                a, b, c, d = idx[i][j], idx[i+1][j], idx[i][j+1], idx[i+1][j+1]
                if (side*sgn) > 0: m.tri(mat, a, b, c); m.tri(mat, b, d, c)
                else: m.tri(mat, a, c, b); m.tri(mat, b, c, d)
# headlights: a narrow swept "eye" under the hood edge, thin at the inboard end, taller and higher outboard
heads = Mesh('Headlights')
def wmax(y, z): return max(halfwidth(z, y), .1)
def headf(u, v):                                   # owner's front photo: a pointed tip up by the hood seam inboard,
    top_ = .905-.04*u**1.4; low = .895-.14*u**1.15+.02*u**6   # deep and rounded at the outboard corner
    y = low+(top_-low)*v
    return (.40+.585*u**.9)*wmax(y, 1.7), y
patch(heads, 'Headlight', lambda u, v: headf(.03+.94*u, .18+.64*v), 26, 4, push=.006, shift=-.035)
hous = Mesh('HeadlightHousings')
def housf(u, v):
    x, y = headf(u, v); return x, y+(v-.5)*.012
patch(hous, 'Trim', housf, 26, 4, push=.0035)
# tail lights: a wedge on each rear corner, pointed inboard on the hatch, deep outboard on the quarter panel
tails = Mesh('Taillights')
def tailf(u, v):                                   # owner's rear photo: top edge level under the lip, pointed inboard tip,
    yt = 1.085-.012*u; yb = 1.062-.135*u**1.1; y = yb+(yt-yb)*v   # ~14 cm deep at the outboard corner, wrapping onto the side
    return (.47+.515*u)*wmax(y, -1.75), y
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
# the hatch: its sides drop straight down through the tail lights, then round big corners into a low bottom edge
PHOTO_REAR = True                                     # the owner's photos are mapped onto the car (see below)
HP = [(.70, 1.10), (.70, .76)]+[(.56+.14*math.cos(a), .74-.14*math.sin(a)) for a in np.linspace(0, math.pi/2, 7)]+[(.30, .60), (0, .60)]
if not PHOTO_REAR: patch(trim, 'Trim', strip_front(HP, .006), 40, 1, push=.0045, zfn=zrear, sgn=-1)
plate = Mesh('Plate')                                  # the licence plate sits on the hatch (owner's rear photo)
if not PHOTO_REAR: patch(plate, 'Plate', lambda u, v: (.155*u, .69+.152*v), 4, 2, push=.007, zfn=zrear, sgn=-1)   # both halves: patch() mirrors it
if not PHOTO_REAR: patch(trim, 'Trim', lambda u, v: (.170*u, .675+.182*v), 4, 2, push=.005, zfn=zrear, sgn=-1)
if not PHOTO_REAR: patch(plate, 'Reflector', strip_front([(.56, .462), (.80, .462)], .022), 6, 1, push=.004, zfn=zrear, sgn=-1)   # red reflectors on the diffuser
# front: the frunk lid edge, the wide lower intake, the corner slots, the front plate
patch(trim, 'Trim', strip_front([(0, .93), (.35, .925), (.66, .905)], .0035), 14, 1, push=.003, zfn=zfront)
patch(trim, 'Trim', lambda u, v: (.56*u, .305+.085*v-.02*u**4), 12, 2, push=.003, zfn=zfront)
patch(trim, 'Trim', strip_front([(.78, .37), (.84, .40), (.88, .47)], .03), 6, 1, push=.003, zfn=zfront)

# sides: door seams, flush door handles (on the body's side: found along x at a given z, y)
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
def vline(z0, z1, y0, y1, w=.006):
    return lambda u, v: (z0+(z1-z0)*u+(v-.5)*w, y0+(y1-y0)*u)
for zz in (() if PHOTO_REAR else ((1.0, .97, .31, 1.03), (-.24, -.28, .31, 1.06), (-1.32, -1.16, 1.07, .80))):   # front door front edge, B pillar seam, rear door back edge
    side_patch(trim, 'Trim', vline(zz[0], zz[1], zz[2], zz[3]), 10, 1)
if not PHOTO_REAR: side_patch(trim, 'Trim', lambda u, v: (.97+(-.97-.97)*u, .31+(v-.5)*.006), 30, 1)   # door bottoms along the sill
for za in (ZA_F, ZA_R):                                               # matte black arch cladding (owner's wheel photo)
    side_patch(trim, 'Trim', lambda u, v, za=za: (za+math.cos(math.radians(-12+204*u))*(RA-.01+.06*v), TYRE_R+math.sin(math.radians(-12+204*u))*(RA-.01+.06*v)), 40, 2, push=.005)
side_patch(trim, 'Trim', lambda u, v: (ZA_F-RA-.03+((ZA_R+RA+.03)-(ZA_F-RA-.03))*u, .225+.075*v), 30, 2, push=.004)   # black rocker
if not PHOTO_REAR: side_patch(trim, 'Glass', lambda u, v: (1.10-.10*u, .80+.035*v*(1-.6*u)+.012*u), 6, 2, push=.006)   # side repeater camera on the front fender
if not PHOTO_REAR: side_patch(trim, 'Glass', lambda u, v: (-2.27+.25*u, (.945+.07*u**1.5)+(.125-.12*u**1.2)*v), 8, 2, push=.005)   # glossy black wrap of the tail light (owner's photo)
if not PHOTO_REAR: side_patch(trim, 'Reflector', lambda u, v: (-2.24+.13*u, (.965+.03*u)+(.045-.035*u)*v), 4, 1, push=.008)
for zc in (() if PHOTO_REAR else (-.02, -1.08)):                       # flush handles (black, like the owner's)
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
    lathe('Rim', [(w*.9, RIM), (w*.80, RIM-.008), (w*.74, RIM-.03), (w*.30, RIM-.03)])                       # outer lip and barrel
    lathe('Well', [(w*.0, RIM-.03), (-w*.2, .17), (-w*.2, 0.)], 24)                                         # dark inside (brake, hub) seen between the spokes
    # turbine blades on the face
    for k in range(10):                                                                                      # 10 swept spokes
        a0 = k/10*2*math.pi; row = []
        for q in range(9):
            t = q/8; rr = .085+(RIM-.075-.085)*t; a = a0+.30*t*t; wd = .36-.06*t                            # widen toward the rim
            xo = w*.74+.028*(1-t)**.6                                                                            # dished: the hub sits further out
            row.append([m.v((outward*xo, rr*math.cos(a+s_*wd/2), rr*math.sin(a+s_*wd/2))) for s_ in (-1, 0, 1)])
            row[-1][1] = m.v((outward*(xo+.008), rr*math.cos(a), rr*math.sin(a)))                              # a ridge down the middle
        for q in range(8):
            for j in range(2):
                a_, b_, c_, d_ = row[q][j], row[q+1][j], row[q][j+1], row[q+1][j+1]
                if outward > 0: m.tri('Spoke', a_, b_, c_); m.tri('Spoke', b_, d_, c_)
                else: m.tri('Spoke', a_, c_, b_); m.tri('Spoke', b_, c_, d_)
    lathe('Spoke', [(w*.74+.026, .092), (w*.74+.034, .08), (w*.74+.040, .05), (w*.74+.042, 0.)], 24)         # centre cap
    return m
wheels = [(n, x, ZA) for n, x, ZA in (('Wheel_FL', TRACK/2, ZA_F), ('Wheel_FR', -TRACK/2, ZA_F), ('Wheel_RL', TRACK/2, ZA_R), ('Wheel_RR', -TRACK/2, ZA_R))]

# ---------- write the .glb ----------
MATS = {
 'Paint':     dict(c=[.31, .315, .315, 1], m=0, r=.55),        # Pearl White multi-coat
 'Glass':     dict(c=[.012, .014, .018, 1], m=.55, r=.06),
 'Trim':      dict(c=[.018, .018, .02, 1], m=.1, r=.55),
 'Headlight': dict(c=[.10, .105, .11, 1], m=.7, r=.1),
 'Plate':     dict(c=[.55, .56, .58, 1], m=0, r=.6),
 'Taillight': dict(c=[.25, .02, .02, 1], m=.2, r=.2),
 'Tyre':      dict(c=[.022, .022, .024, 1], m=0, r=.85),
 'Rim':       dict(c=[.025, .026, .028, 1], m=.15, r=.6),         # matte black Induction wheels
 'Spoke':     dict(c=[.022, .023, .025, 1], m=0, r=.7),        # matte black
 'Well':      dict(c=[.008, .008, .009, 1], m=0, r=.9),
 'Reflector': dict(c=[.35, .02, .02, 1], m=.1, r=.3),
 'PhotoRear': dict(c=[.52, .52, .52, 1], m=0, r=.55, tex='base', ti=0),
 'PhotoTaillight': dict(c=[.52, .52, .52, 1], m=0, r=.6, tex='both', ti=0),
 'PhotoSide': dict(c=[.47, .47, .47, 1], m=0, r=.55, tex='base', ti=1),
 'PhotoFront': dict(c=[.52, .52, .52, 1], m=0, r=.55, tex='base', ti=2),
 'PhotoHeadlight': dict(c=[.52, .52, .52, 1], m=0, r=.2, tex='both', ti=2),
}
matnames = list(MATS)
J = dict(asset=dict(version='2.0', generator='explorer3d tools/make-model-y.py'), scene=0, scenes=[dict(nodes=[0])],
         nodes=[dict(name='Tesla_Model_Y_2023', children=[])], meshes=[], accessors=[], bufferViews=[], buffers=[],
         materials=[dict(name=k, pbrMetallicRoughness=dict(baseColorFactor=v['c'], metallicFactor=v['m'], roughnessFactor=v['r']), doubleSided=True,
                         **(dict(emissiveTexture=dict(index=v['ti']), emissiveFactor=[0, 0, 0]) if v.get('tex') == 'both' else {})) for k, v in MATS.items()])
for mt, (k, v) in zip(J['materials'], MATS.items()):
    if v.get('tex'): mt['pbrMetallicRoughness']['baseColorTexture'] = dict(index=v['ti'])   # the photo, lit like the paint around it
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
# ---------- the owner's photos on the car (issue #5: "make everything like the picture") ----------
# tools/photos/model-y-photos.json lists the owner's photos used as textures: the straight-on rear photo (licence plate
# blanked) and the left-side photo (also used, mirrored, on the right side), each with the car's outline in the photo,
# the crop kept as the texture image, and the photo's camera fitted to this model by matching outlines
# (tools/fit-model-y-photo.py): position (m), yaw, pitch, roll (rad), focal length (px). Every face of the body, glass and
# mirrors that a camera saw square-on, unhidden and inside the car's outline gets a copy 2 mm out, textured with the
# photo that saw it best; faces inside the tail lights go in their own mesh so the game can light them.
PDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'photos')
PHOTOS = json.load(open(os.path.join(PDIR, 'model-y-photos.json'))) if PHOTO_REAR else {}
def cam_proj(X, CAM, size):
    cx, cy, cz, yaw, pit, rol, f = CAM
    d = X-np.array([cx, cy, cz]); cyw, syw = math.cos(yaw), math.sin(yaw)
    x = cyw*d[:, 0]-syw*d[:, 2]; z = syw*d[:, 0]+cyw*d[:, 2]; y = d[:, 1]
    cp, sp = math.cos(pit), math.sin(pit); y2 = cp*y-sp*z; z2 = sp*y+cp*z
    u = -x/z2*f; v = -y2/z2*f; cr, sr = math.cos(rol), math.sin(rol)
    return cr*u-sr*v+size[0]/2, sr*u+cr*v+size[1]/2, z2
pmeshes = []
if PHOTOS:
    from PIL import Image, ImageDraw, ImageFilter
    np.random.seed(5)
    def scatter(m, CAM, size, ZB, Q):
        V = np.array(m.P)
        for I in m.prims.values():
            T = np.array(I).reshape(-1, 3); A, B, C = V[T[:, 0]], V[T[:, 1]], V[T[:, 2]]
            n = np.ceil(np.linalg.norm(np.cross(B-A, C-A), axis=1)/2/.00004).astype(int).clip(1, 300)
            k = np.repeat(np.arange(len(T)), n); r1 = np.sqrt(np.random.rand(len(k))); r2 = np.random.rand(len(k))
            X = A[k]*(1-r1)[:, None]+B[k]*(r1*(1-r2))[:, None]+C[k]*(r1*r2)[:, None]
            u, v, z = cam_proj(X, CAM, size); ok = (z > .1)&(u >= 0)&(u < size[0])&(v >= 0)&(v < size[1])
            np.minimum.at(ZB, ((v[ok]/Q).astype(int), (u[ok]/Q).astype(int)), z[ok])
    for name, ph in PHOTOS.items():                         # masks and depth for each photo
        W_, H_ = ph['size']; mk = Image.new('L', (W_, H_), 0); ImageDraw.Draw(mk).polygon([tuple(p) for p in ph['outline']], fill=255)
        ph['MASK'] = np.array(mk.filter(ImageFilter.MinFilter(25))) > 128          # ~12 px inside the outline
        ph['OMASK'] = np.array(mk) > 128
        lk = Image.new('L', (W_, H_), 0)
        for L in ph['lamps']: ImageDraw.Draw(lk).polygon([tuple(p) for p in L], fill=255)
        ph['LMASK'] = np.array(lk) > 128
        ph['Q'] = 4; ph['ZB'] = np.full((H_//4+1, W_//4+1), np.inf)
        for m in (body, gh, mir, trim, hous, heads): scatter(m, ph['camera'], ph['size'], ph['ZB'], 4)
    names = list(PHOTOS); pm = {n: Mesh('Photo'+n.capitalize()) for n in names}
    LAMPMAT = {'rear': 'PhotoTaillight', 'front': 'PhotoHeadlight'}            # the photo's own lamps, lit by the game
    for n in names: pm['lamp_'+n] = Mesh(LAMPMAT.get(n, 'Photo')+'s')
    for m in pm.values(): m.UV = []; m.N = []
    PICKS = []
    for src in (body, gh, mir):
        V = np.array(src.P); NV = normals(V.astype('<f4'), src.prims)
        chase = NV@np.array([0, .5, -.866])                           # how square-on the game's chase camera sees it
        S_ = {}
        for name, ph in PHOTOS.items():
            W_, H_ = ph['size']; Vm, Nm = V.copy(), NV.copy()
            if ph['mirror']: sg = np.where(V[:, 0] < 0, -1, 1); Vm[:, 0] *= sg; Nm[:, 0] *= sg   # the right side seen as the left
            u, v, z = cam_proj(Vm, ph['camera'], ph['size']); iu, iv = np.clip(u, 0, W_-1).astype(int), np.clip(v, 0, H_-1).astype(int)
            camp = np.array(ph['camera'][:3]); face = ((camp-Vm)/np.linalg.norm(camp-Vm, axis=1, keepdims=True)*Nm).sum(1)
            seen = (z > .1)&(u >= 0)&(u < W_)&(v >= 0)&(v < H_)&ph['MASK'][iv, iu]&(face > (ph.get('glassface', .42) if src is gh else .3))   # glass: its edges reflect the background
            seen &= np.maximum(chase, 0) < 3.5*face                    # not where the chase camera would see the photo stretched >3.5x
            seen &= z <= ph['ZB'][np.clip(iv//4, 0, H_//4), np.clip(iu//4, 0, W_//4)]+.06
            # looser test for filling gaps next to faces that already have a photo: just in the picture, inside the car's
            # outline (not shrunk), facing the camera at all and not far behind what it saw
            loose = (z > .1)&(u >= 0)&(u < W_)&(v >= 0)&(v < H_)&ph['OMASK'][iv, iu]&(face > .03)
            if src is gh: loose &= False                               # no filling on the glass (its edges show the background)
            loose &= z <= ph['ZB'][np.clip(iv//4, 0, H_//4), np.clip(iu//4, 0, W_//4)]+.15
            S_[name] = (u, v, face, seen, iu, iv, loose)
        T_ = np.concatenate([np.array(I).reshape(-1, 3) for I in src.prims.values()])
        pick = [None]*len(T_)
        for i, t in enumerate(T_):                          # the photo that saw each face best
            for name in PHOTOS:
                face, seen = S_[name][2], S_[name][3]
                if seen[t].all() and (pick[i] is None or face[t].min() > pick[i][1]): pick[i] = (name, face[t].min())
        # fill the gaps: a face with no photo whose neighbours have one takes the photo most of them use, if that photo
        # saw it at all (3 rings: closes the slivers between photos and round the lamps)
        E_ = {}
        for i, t in enumerate(T_):
            for a_, b_ in ((t[0], t[1]), (t[1], t[2]), (t[2], t[0])): E_.setdefault((min(a_, b_), max(a_, b_)), []).append(i)
        nb = [[] for _ in T_]
        for fs in E_.values():
            for i in fs:
                nb[i].extend(j for j in fs if j != i)
        for _ in range(3):
            newp = {}
            for i, t in enumerate(T_):
                if pick[i]: continue
                votes = {}
                for j in nb[i]:
                    if pick[j]: votes[pick[j][0]] = votes.get(pick[j][0], 0)+1
                for name in sorted(votes, key=lambda n: -votes[n]):
                    if S_[name][6][t].all(): newp[i] = (name, S_[name][2][t].min(), 'fill'); break
            if not newp: break
            for i, v_ in newp.items(): pick[i] = v_
        maps = {}; picks = {}
        for i, t in enumerate(T_):
            if not pick[i]: continue
            name = pick[i][0]; ph = PHOTOS[name]; u, v, face, seen, iu, iv, loose = S_[name]
            lamp = bool(ph['lamps']) and ph['LMASK'][int(v[t].mean()), int(u[t].mean())]
            if lamp and name == 'rear' and len(pick[i]) == 2 and (chase[t] > 1.6*face[t]).any(): lamp = False   # glancing: plain rear photo
            key = 'lamp_'+name if lamp else name; dst = pm[key]; C_ = ph['crop']; ids = []
            for vi in t:
                if (key, vi) not in maps:
                    maps[(key, vi)] = dst.v(tuple(V[vi]+NV[vi]*.002)); dst.N.append(NV[vi])
                    dst.UV.append(((u[vi]-C_[0])/(C_[2]-C_[0]), (v[vi]-C_[1])/(C_[3]-C_[1])))
                picks.setdefault(vi, (name, dst.UV[maps[(key, vi)]]))
                ids.append(maps[(key, vi)])
            dst.tri(LAMPMAT[name] if lamp else 'Photo'+name.capitalize(), *ids)
        PICKS.append((src, picks))
    pmeshes = [m for m in pm.values() if m.prims]
    # the paint round the photos takes their colours: each vertex under a photo gets the (blurred) photo colour there, and
    # that colour spreads out over the plain paint, fading back to clean white within ~30 cm — so a photo's edge (its
    # shadows, its exposure) runs smoothly into the paint instead of stopping at a hard line
    BL = {n: np.asarray(Image.open(os.path.join(PDIR, ph['image'])).convert('RGB').filter(ImageFilter.GaussianBlur(4)), dtype=np.float32)/255 for n, ph in PHOTOS.items()}
    GAIN = {n: MATS['Photo'+n.capitalize()]['c'][0]/MATS['Paint']['c'][0] for n in PHOTOS}   # photo material vs paint brightness
    for src, picks in PICKS:
        V = np.array(src.P); n_ = len(V); col = np.zeros((n_, 3), np.float32); cnt = np.zeros(n_, np.float32)
        for vi, (name, uv) in picks.items():
            tx = BL[name]; th, tw = tx.shape[:2]
            col[vi] += tx[min(th-1, max(0, int(uv[1]*th))), min(tw-1, max(0, int(uv[0]*tw)))]*GAIN[name]; cnt[vi] += 1
        fixed = cnt > 0; col[fixed] /= cnt[fixed, None]
        nb = [set() for _ in range(n_)]
        for I in src.prims.values():
            for t in np.array(I).reshape(-1, 3):
                for a_ in t: nb[a_].update(t)
        nb = [np.array(sorted(x)) for x in nb]
        known = fixed.copy(); w = np.where(fixed, 1., 0.)
        for it in range(14):                                    # spread outward one ring at a time, losing strength as it goes
            new_c, new_w, nk = col.copy(), w.copy(), known.copy()
            for i in np.where(~known)[0]:
                k = nb[i][known[nb[i]]]
                if len(k): new_c[i] = col[k].mean(0); new_w[i] = w[k].max()*.8; nk[i] = True
            col, w, known = new_c, new_w, nk
        white = np.ones(3, np.float32)
        src.COL = np.where(known[:, None], col*w[:, None]+white*(1-w[:, None]), white)
    print('photo faces', {m.name: len(next(iter(m.prims.values())))//3 for m in pmeshes})
for m in ((body, gh, *(() if 'front' in PHOTOS else (heads, hous)), trim, plate, mir, *pmeshes) if PHOTOS else (body, gh, heads, hous, tails, trim, plate, mir)):
    if m.prims: put(m)
if PHOTOS:
    J['images'] = []; J['textures'] = []; J['samplers'] = [dict(magFilter=9729, minFilter=9987, wrapS=33071, wrapT=33071)]
    for i, (name, ph) in enumerate(PHOTOS.items()):
        while len(BIN) % 4: BIN.append(0)
        jb = open(os.path.join(PDIR, ph['image']), 'rb').read()
        off = len(BIN); BIN += jb; J['bufferViews'].append(dict(buffer=0, byteOffset=off, byteLength=len(jb)))
        J['images'].append(dict(bufferView=len(J['bufferViews'])-1, mimeType='image/jpeg')); J['textures'].append(dict(source=i, sampler=0))
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
