# Builds models/javelin-amx-v3.glb: a 1972 AMC Javelin AMX in black with the gold "T" stripe, made from the owner's photo
# (2026-11-23: "flare the wheel wells and make it more resemble this image overall") and the car's published size.
# Nothing from the photo is copied in; there are no badges or lettering. Replaces the owner's v2 file as the Javelin's model
# (the v2 body ran across the bottom of the wheel openings; this one has real open arches with flared lips).
# Usage: python3 tools/make-javelin.py models/javelin-amx-v3.glb
# Same conventions as tools/make-expedition.py and js/game.js loadModel: metres, front +z, ground y 0, centre at the
# origin; wheels are nodes named Wheel_*; lamp lenses use materials Headlight / Taillight and are built 3.5 cm in (the
# loader pushes them out); thin layers on the paint use Glass / Trim / Stripe.
import sys, json, struct, math
import numpy as np
from scipy.interpolate import PchipInterpolator as Pchip

L = 4.872; ZF, ZR = L/2, -L/2                   # 191.8 in
WB = 2.794; ZA_F = ZF-.93; ZA_R = ZA_F-WB       # 110 in wheelbase; long rear overhang
TYRE_R = .352                                    # (owner 2026-11-23: "big aggressive wheels that fill the wheel well nicely... fat tires")
WF, WR = .280, .320                              # fat tyres, wider at the back, on 15" deep-dish five-spokes
XF, XR = 1.02-WF/2, 1.02-WR/2                    # pushed out so the tyre's outer face sits almost flush with the flare
TRACK = 2*XF
HW = .955                                       # half the 75.1 in body width

def ease(a, b, t): t = min(1, max(0, t)); return a+(b-a)*t*t*(3-2*t)
# ---------- side profile (z, y): low nose, long hood, short fastback roof, flat deck with a lip ----------
ZW = .42                                         # foot of the windshield
top = Pchip([ZR, -2.42, -2.37, -2.31, -2.22, -2.13, -2.02, -1.80, -1.52, -1.24, -.75, -.15, .05, .25, ZW, .60, 1.20, 1.90, 2.25, 2.38, ZF],
            [.80, .950, .995, .975, .966, .975, 1.030, 1.140, 1.230, 1.290, 1.305, 1.305, 1.270, 1.120, .940, .905, .880, .850, .825, .80, .74])
# (2026-11-23 owner: the real car's trunk is much shorter, then "still a little smaller and/or shorter" — the fastback glass
# runs down to z -2.13, the deck is ~22 cm long, a little lower, and ends in a ducktail lip)
belt = Pchip([ZR, -2.25, -1.85, -1.50, -1.18, -.92, 0., ZW, .6, ZF], [.92, .968, .992, .990, .945, .925, .915, .925, .93, .90])   # the waist kicks up sharply over the rear wheels
bot = Pchip([ZR, -2.3, -2.0, -1.7, 1.75, 2.1, 2.35, ZF], [.36, .30, .25, .22, .22, .25, .30, .36])

def hw(z):
    h = HW*(1-.045*ease(0, 1, (z-1.60)/.84)**2)               # fenders draw in a little toward the nose
    h *= 1-.022*ease(0, 1, (-.30-z)/.9)*ease(0, 1, (z+2.45)/.6)*0   # (straight sides)
    if z > 2.30: u = min(1, (z-2.30)/(ZF-2.30)); h *= (1-u**6)**(1/6)          # flat nose, tight corners
    if z < -2.25: u = min(1, (-2.25-z)/(-2.25-ZR)); h *= (1-u**4)**(1/4)      # rounder tail corners
    return max(h, 1e-4)
def expo(z): return 5.2, 3.4                     # side fullness, shoulder roundness: a rounded 70s body side
GB = .90                                         # glass base at 90% of the half width (a real shoulder: tumblehome)

def section(z):
    yb = float(bot(z)); yt0 = float(top(z)); bl = float(belt(z)); h = hw(z); nu, mu = expo(z)
    yw = min(max(.50, yb+.35*(yt0-yb)), yb+.6*(yt0-yb))
    phi = math.acos(GB**(nu/2)); frac = math.sin(phi)**(2/mu)
    yt = min(yt0, yw+(bl-yw)/frac)
    return dict(z=z, yb=yb, yt=yt, ytop=yt0, belt=bl, hw=h, nu=nu, mu=mu, yw=yw, frac=frac)
def sec_pt(S, phi):
    if phi >= 0:
        c, s = math.cos(phi), math.sin(phi); x = S['hw']*c**(2/S['nu']); y = S['yw']+(S['yt']-S['yw'])*s**(2/S['mu'])
    else:
        c, s = math.cos(phi), -math.sin(phi); x = S['hw']*c**(2/6.); y = S['yw']-(S['yw']-S['yb'])*s**(2/5.)
        t = (S['yw']-y)/max(1e-6, S['yw']-S['yb']); x *= 1-.07*t**2                   # sides tuck in toward the sill
    return x, y
def halfwidth(z, y):
    S = section(z)
    if y > S['yt'] or y < S['yb']: return -1
    lo, hi = (0, math.pi/2) if y >= S['yw'] else (-math.pi/2, 0)
    for _ in range(40):
        m = (lo+hi)/2; _, ym = sec_pt(S, m)
        lo, hi = (m, hi) if ym < y else (lo, m)
    return sec_pt(S, (lo+hi)/2)[0]

class Mesh:
    def __init__(s, name): s.name = name; s.P = []; s.prims = {}
    def v(s, p): s.P.append(p); return len(s.P)-1
    def tri(s, mat, a, b, c): s.prims.setdefault(mat, []).extend((a, b, c))
def mirror_grid(m, G, matf):
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
NZ, NP = 200, 48
t = np.linspace(0, 1, NZ)
zs = ZR+(ZF-ZR)*((.5-.5*np.cos(np.pi*t))*.6+t*.4)
phis = np.linspace(-math.pi/2, math.pi/2, NP)
SECS = [section(float(z)) for z in zs]
body = Mesh('Body')
G = np.array([[[*sec_pt(S, float(ph)), S['z']] for ph in phis] for S in SECS])
X, Y, Z = G[:, :, 0], G[:, :, 1], G[:, :, 2]
# the hood sits low between raised front fender crowns that run from the nose back to the windshield (photo), with a
# raised centre bulge toward the cowl; behind the doors the rear fenders rise in a hump over the wheels
crown = .062*np.exp(-((X-.79)/.075)**2)*np.clip((Z-ZW)/.20, 0, 1)*np.clip((ZF-.03-Z)/.12, 0, 1)    # peaked front fenders, hood well below
SC0, SC1 = .62, 1.62                                                                                # cowl scoop: open face at SC0 (toward the windshield)
scoop = .058*np.clip(1-(np.abs(X)/.36)**6, 0, 1)*np.clip((Z-SC0)/.03, 0, 1)*np.clip((SC1-Z)/.75, 0, 1)**.6
# blistered fenders: over each wheel the fender swells up and out (owner: "the very pronounced wheel fender flares are
# the trademark of the Javelin's appearance")
BL = lambda za, w: np.exp(-((Z-za)/w)**2)
outer = np.clip((X-.52)/.30, 0, 1)**1.5
blis = .105*BL(ZA_F, .56)*outer+.055*BL(ZA_R, .58)*outer          # (owner: the front ones rise even higher)
up = Y > .70
Y += np.where(up, crown+scoop, 0)+np.where(Y > .55, blis*np.clip((Y-.55)/.25, 0, 1), 0)
X += (.036*BL(ZA_F, .60)+.034*BL(ZA_R, .60))*np.clip((Y-TYRE_R)/.15, 0, 1)*np.clip((1.02-Y)/.12, 0, 1)*(X > .5)
RA = .405; XW = min(XF-WF/2, XR-WR/2)-.015       # open, round wheel arches; the liner just inside the tyres' inner faces
for za in (ZA_F, ZA_R):                          # flared lips: the panel swells ~4.5 cm in a band round each arch
    d = np.hypot(Z-za, Y-TYRE_R)
    band = np.clip((RA+.085-d)/.035, 0, 1)**.7*np.clip((d-RA+.02)/.02, 0, 1)                     # flat band, rounded outer edge
    X += (.062*band+.015*np.exp(-((d-RA-.004)/.010)**2))*(Y > TYRE_R-.16)*(X > .5)
well = np.zeros(G.shape[:2], bool)
for za in (ZA_F, ZA_R):
    dz, dy = Z-za, Y-TYRE_R; d = np.hypot(dz, dy)
    k = (d < RA) & (X > XW-.001)
    inner = np.zeros_like(k)
    inner[1:-1, 1:-1] = k[1:-1, 1:-1] & k[:-2, 1:-1] & k[2:, 1:-1] & k[1:-1, :-2] & k[1:-1, 2:]
    inner |= k & (dy < -.05)
    edge = k & ~inner
    sc = np.where(edge, RA/np.maximum(d, 1e-6), 1.)
    Z[:] = np.where(edge, za+dz*sc, Z); Y[:] = np.where(edge, TYRE_R+dy*sc, Y)
    # below the axle the opening is open to the ground: nothing of the body there, only the liner behind the tyre
    X[:] = np.where(inner, XW, X); well |= inner
def body_mat(i, j):
    zc = (zs[i]+zs[i+1])/2; y = G[i:i+2, j:j+2, 1].mean()
    if well[i:i+2, j:j+2].any():
        if (G[i:i+2, j:j+2, 1] < TYRE_R-.06).all(): return None              # the arch is open at the bottom: no panel there
        return 'Well'
    if j < 8: return 'Trim'                                                  # underside
    return 'Paint'
G0 = G.copy()
mirror_grid(body, G.tolist(), body_mat)
# liner: the inside of each arch, a dark drum from the lip back to the liner plane
for za in (ZA_F, ZA_R):
    m_ = body; rows = []
    for a in np.linspace(math.radians(-6), math.radians(186), 36):
        z, y = za+RA*math.cos(a), TYRE_R+RA*math.sin(a)
        xo = max(halfwidth(z, y), XW+.01) if y > float(bot(z)) else XW+.03
        rows.append([(xo+.03, y, z), (XW-.18, y, z)])
    mirror_grid(body, rows, lambda i, j: 'Well')

# ---------- greenhouse: hardtop (no B pillar): door glass and a small quarter window under a wide sail panel,
# windshield, fastback rear glass; bright frames round the side glass (photo) ----------
gh = Mesh('Glasshouse')
def gpt(z, u):
    S = section(z)
    x0 = GB*S['hw']*.995; y0 = S['yw']+(S['yt']-S['yw'])*S['frac'] - .004
    CR = .028; H = max(0., S['ytop']-CR-y0); r = min(.075, .45*H); rw = max(x0-.40*(H-r), .55*x0)   # side glass leans in ~22 degrees
    if u <= .5: q = u/.5; return [x0+(rw-x0)*q, y0+(H-r)*q, z]
    a = (u-.5)/.5*math.pi/2; x = rw*math.cos(a)**(2/3.4)
    dip = .032*math.exp(-(x/.14)**2)*ease(0, 1, (z-ZRG+.30)/.35)*ease(0, 1, (.02-z)/.22)               # twin-canopy roof: a dip down the middle
    return [x, y0+(H-r)+r*math.sin(a)**(2/2.2)+CR*(1-(x/rw)**2)*min(1, max(0, (H-.10)/.2))-dip, z]
zz = np.linspace(-2.2, 1.0, 900)
def gh_h(z): S = section(float(z)); return float(top(z))-(S['yw']+(S['yt']-S['yw'])*S['frac'])
hasH = [gh_h(z) > .006 for z in zz]
ZG0 = float(zz[hasH.index(True)]); ZG1 = float(zz[len(hasH)-1-hasH[::-1].index(True)])
def ggrid(u0, u1, z0f, z1f, nz, nu, mat):
    G_ = [[gpt(z0f(u)+(z1f(u)-z0f(u))*i/nz, u) for u in np.linspace(u0, u1, nu+1)] for i in range(nz+1)]
    mirror_grid(gh, G_, lambda i, j: mat)
zA = lambda u: ZW-.02-.50*min(u, .5)/.5          # front of the door glass along the raked A pillar
zQ = lambda u: -1.00-.12*min(u, .5)/.5           # back of the door glass (a thin seam, no B pillar)
zS = lambda u: -1.78+.46*min(u, .5)/.5           # back of the quarter window: its rear edge slants forward up the sail
cz0 = lambda u: ZG0
ggrid(0, .5, cz0, zS, 10, 14, 'Paint')           # sail panel (C pillar), wide and body colour
ggrid(0, .5, zS, lambda u: zQ(u)-.008, 30, 14, 'Glass')   # quarter window
ggrid(0, .5, lambda u: zQ(u)-.008, zQ, 1, 14, 'Chrome')   # the seam between the two glasses
ggrid(0, .5, zQ, zA, 60, 14, 'Glass')            # door glass
ggrid(0, .5, zA, lambda u: ZW, 6, 14, 'Paint')   # A pillar, body colour
ZRG = -1.24                                       # back edge of the roof: the fastback glass from here down to the deck
ggrid(.5, .54, cz0, lambda u: ZW, 160, 1, 'Paint')        # roof edge
ggrid(.54, 1, lambda u: ZRG, lambda u: -.12, 40, 12, 'Paint')   # roof
ggrid(.54, 1, cz0, lambda u: ZRG, 40, 12, 'Glass')        # fastback rear glass
ggrid(.54, 1, lambda u: -.12, lambda u: ZW, 30, 12, 'Glass')   # windshield
gtr = Mesh('WindowTrim')
def gtrim(u0, u1, z0f, z1f, nz, push, mat='Chrome'):
    G_ = []
    for i in range(nz+1):
        row = []
        for u in (u0, u1):
            z = z0f(u)+(z1f(u)-z0f(u))*i/nz; p = gpt(z, u); row.append([p[0]+push, p[1]+push*.3, p[2]])
        G_.append(row)
    mirror_grid(gtr, G_, lambda i, j: mat)
gtrim(.47, .5, zS, zA, 140, .006)                # bright frame along the top of the side glass
gtrim(0., .02, zS, zA, 140, .006)                # and its foot (belt moulding)
for zf_ in (zA, zS):                              # up the front and back edges
    G_ = []
    for k in range(13):
        u = .5*k/12; z = zf_(u); p = gpt(z, u); s = 1 if zf_ is zA else -1
        G_.append([[p[0]+.006, p[1], z], [p[0]+.006, p[1], z+s*.022]])
    mirror_grid(gtr, G_, lambda i, j: 'Chrome')
def ring_trim(z0f, z1f, n=40):                    # bright surround on the windshield / rear glass edges
    for zf_ in (z0f, z1f):
        G_ = [[gpt(zf_(0), u), [*gpt(zf_(0), u)[:2], zf_(0)+(.02 if zf_ is z1f else -.02)]] for u in np.linspace(.52, 1, n)]
        for r in G_: r[0] = [r[0][0], r[0][1]+.004, r[0][2]]; r[1] = [r[1][0], r[1][1]+.004, r[1][2]]
        mirror_grid(gtr, G_, lambda i, j: 'Chrome')
ring_trim(lambda u: -.12, lambda u: ZW-.005)
ring_trim(lambda u: ZG0+.01, lambda u: ZRG)

# ---------- surface helpers ----------
def zfront(x, y, lo=2.15):
    hi = ZF+.01
    if halfwidth(lo, y) < abs(x): return None
    for _ in range(36):
        m = (lo+hi)/2
        if halfwidth(m, y) >= abs(x): lo = m
        else: hi = m
    return lo
def zrear(x, y, hi=-2.15):
    lo = ZR-.01
    if halfwidth(hi, y) < abs(x): return None
    for _ in range(36):
        m = (lo+hi)/2
        if halfwidth(m, y) >= abs(x): hi = m
        else: lo = m
    return hi
def patch(m, mat, f, nu, nv, push=.004, zfn=zfront, sgn=1, shift=0.):
    pts = []
    for i in range(nu+1):
        row = []
        for j in range(nv+1):
            x, y = f(i/nu, j/nv); z = zfn(x, y)
            if z is None: z = (ZF-.02 if sgn > 0 else ZR+.02)
            row.append((x, y, z+sgn*push+shift))
        pts.append(row)
    for side in (1, -1):
        idx = [[m.v((side*p[0], p[1], p[2])) for p in row] for row in pts]
        for i in range(nu):
            for j in range(nv):
                a, b, c, d = idx[i][j], idx[i+1][j], idx[i][j+1], idx[i+1][j+1]
                if (side*sgn) > 0: m.tri(mat, a, b, c); m.tri(mat, b, d, c)
                else: m.tri(mat, a, c, b); m.tri(mat, b, c, d)
def xat(z, y):                                    # the body side at (z, y), arches and flares included (from the grid)
    i = int(np.clip(np.searchsorted(zs, z)-1, 0, NZ-2)); f = (z-zs[i])/(zs[i+1]-zs[i])
    def at(col):                                  # only the side of the section (not the shoulder curling over the top)
        c = col[col[:, 0] > XW+.02]
        if len(c) < 3: return HW
        jm = int(np.argmax(c[:, 0])); keep = np.arange(len(c)) <= jm+np.argmax(np.r_[c[jm:, 0] < c[jm, 0]-.07, True])
        c = c[keep]; k = np.argsort(c[:, 1]); return float(np.interp(y, c[k, 1], c[k, 0]))
    return at(G0[i])*(1-f)+at(G0[i+1])*f
def side_grid(m, mat, f, nu, nv, push=.004):      # like side_patch but on the real surface (flares included)
    for side in (1, -1):
        idx = []
        for i in range(nu+1):
            row = []
            for j in range(nv+1):
                z, y = f(i/nu, j/nv); row.append(m.v((side*(xat(z, y)+push), y, z)))
            idx.append(row)
        for i in range(nu):
            for j in range(nv):
                a, b, c, d = idx[i][j], idx[i+1][j], idx[i][j+1], idx[i+1][j+1]
                if side > 0: m.tri(mat, a, c, b); m.tri(mat, b, c, d)
                else: m.tri(mat, a, b, c); m.tri(mat, b, d, c)
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
def flare_lip(m):
    """Round each arch the flare's edge rolls over and curls back in under itself toward the inside of the car
    (owner: "the big fender flares should wrap back down towards the inside of the car a little")."""
    for za in (ZA_F, ZA_R):
        rows = []; A = np.linspace(math.radians(-6), math.radians(186), 64)
        XE = np.array([xat(za+(RA+.02)*math.cos(a), TYRE_R+(RA+.02)*math.sin(a)) for a in A])
        XE = np.convolve(np.pad(XE, 3, mode='edge'), np.ones(7)/7, mode='valid')        # smooth along the arch
        for a, xe in zip(A, XE):
            ca, sa = math.cos(a), math.sin(a)
            prof = [(RA+.020, xe+.001), (RA+.008, xe-.002), (RA-.002, xe-.012), (RA-.010, xe-.030), (RA-.016, xe-.058), (RA-.020, xe-.10), (RA-.022, XW+.01)]
            rows.append([(x, TYRE_R+rr*sa, za+rr*ca) for rr, x in prof])
        mirror_grid(m, rows, lambda i, j: 'Paint' if j < 5 else 'Well')     # the return then runs on in, dark, to the liner
def ytop_at(z, x):                               # height of the body's top surface at (z, x), crowns included
    i = int(np.clip(np.searchsorted(zs, z)-1, 0, NZ-2)); f = (z-zs[i])/(zs[i+1]-zs[i])
    def at(col): c = col[NP//2:][::-1]; return float(np.interp(x, c[:, 0], c[:, 1]))
    return at(G0[i])*(1-f)+at(G0[i+1])*f
def top_patch(m, mat, f, nu, nv, push=.004):     # a patch lying on the hood / deck: f(u,v) -> (x, z)
    pts = [[(lambda x, z: (x, ytop_at(z, x)+push, z))(*f(i/nu, j/nv)) for j in range(nv+1)] for i in range(nu+1)]
    for side in (1, -1):
        idx = [[m.v((side*p[0], p[1], p[2])) for p in row] for row in pts]
        for i in range(nu):
            for j in range(nv):
                a, b, c, d = idx[i][j], idx[i+1][j], idx[i][j+1], idx[i+1][j+1]
                if side > 0: m.tri(mat, a, b, c); m.tri(mat, b, d, c)
                else: m.tri(mat, a, c, b); m.tri(mat, b, c, d)
def box(m, mat, c, s):
    for side in ((1, -1) if c[0] > 0 else (1,)):
        cx, cy, cz = side*c[0], c[1], c[2]; hx, hy, hz = s[0]/2, s[1]/2, s[2]/2
        V = [m.v((cx+dx*hx, cy+dy*hy, cz+dz*hz)) for dx in (-1, 1) for dy in (-1, 1) for dz in (-1, 1)]
        for a, b, c_, d in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            m.tri(mat, V[a], V[b], V[c_]); m.tri(mat, V[a], V[c_], V[d])
def disc(m, mat, c, r, n=24, nz=1, depth=0., both=True, cone=0.):   # a disc facing +z (n segments); depth: a short drum behind it
    for side in ((1, -1) if (both and c[0] > 0) else (1,)):
        cx = side*c[0]; o = m.v((cx, c[1], c[2]+cone)); ring = [m.v((cx+r*math.cos(a), c[1]+r*math.sin(a), c[2])) for a in np.linspace(0, 2*math.pi, n+1)]
        for a_, b_ in zip(ring, ring[1:]): m.tri(mat, o, a_, b_)
        if depth:
            back = [m.v((cx+r*math.cos(a), c[1]+r*math.sin(a), c[2]-depth)) for a in np.linspace(0, 2*math.pi, n+1)]
            for k in range(n): m.tri(mat, ring[k], back[k], ring[k+1]); m.tri(mat, ring[k+1], back[k], back[k+1])
def torus_ring(m, mat, c, r0, r1, depth, n=28):   # a flat bright ring (bezel) facing +z with a lip back of depth
    for side in ((1, -1) if c[0] > 0 else (1,)):
        cx = side*c[0]; A = np.linspace(0, 2*math.pi, n+1)
        inn = [m.v((cx+r0*math.cos(a), c[1]+r0*math.sin(a), c[2])) for a in A]
        out = [m.v((cx+r1*math.cos(a), c[1]+r1*math.sin(a), c[2]-.004)) for a in A]
        bk = [m.v((cx+r1*math.cos(a), c[1]+r1*math.sin(a), c[2]-depth)) for a in A]
        for k in range(n):
            m.tri(mat, inn[k], out[k], inn[k+1]); m.tri(mat, inn[k+1], out[k], out[k+1])
            m.tri(mat, out[k], bk[k], out[k+1]); m.tri(mat, out[k+1], bk[k], bk[k+1])

flare_lip(body)
# ---------- front: a wide recessed mesh grille across the whole nose in a bright surround, the round headlamps at its
# outer ends and round amber parking lamps inboard of them (photo); a full-width chrome bumper under it ----------
trim = Mesh('Details'); heads = Mesh('Headlights'); tails = Mesh('Taillights'); plate = Mesh('Plate')
GY0, GY1 = .505, .715
gz = lambda y: zfront(0, y)
gx = lambda y: .93*max(halfwidth(2.36, y), .3)
patch(trim, 'Grille', lambda u, v: (gx(GY0+(GY1-GY0)*v)*u, GY0+(GY1-GY0)*v), 20, 6, push=-.03)               # the mesh, set back
for k in range(9):                                                                                            # its horizontal bars
    y = GY0+.02+k*(GY1-GY0-.04)/8; patch(trim, 'Bar', lambda u, v, y=y: (gx(y)*u, y+.006*v), 20, 1, push=-.024)
for k in range(28):
    x = (k+.5)/28*gx(.61); patch(trim, 'Bar', lambda u, v, x=x: (x+.005*u, GY0+(GY1-GY0)*v), 1, 6, push=-.026)
patch(trim, 'Chrome', lambda u, v: ((gx(GY1)+.012)*u, GY1+.004+.016*v), 20, 1, push=.003)                    # bright surround: top
patch(trim, 'Chrome', lambda u, v: ((gx(GY0)+.012)*u, GY0-.016+.014*v), 20, 1, push=.003)                    # bottom
patch(trim, 'Chrome', lambda u, v: (gx(GY0+(GY1-GY0)*u)+.012*v, GY0+(GY1-GY0)*u), 6, 1, push=.003)          # ends
patch(trim, 'Trim', lambda u, v: ((gx(GY0+(GY1-GY0)*u)-.003)+.016*v, GY0+(GY1-GY0)*u), 6, 1, push=-.012)    # the recess wall at the ends
HL = (.74, .615)                                                                                              # headlamp centre (x, y)
for (x, y), r, lens, bz in ((HL, .088, 'Headlight', .016), ((.50, .615), .052, 'Amber', .010)):
    z = zfront(x, y) or ZF-.05
    disc(trim, 'Trim', (x, y, z-.03), r+.012, depth=.0)                                                       # dark cup behind
    torus_ring(trim, 'Chrome', (x, y, z+.004), r, r+bz, .03)                                                  # bright bezel
    if lens == 'Headlight': disc(heads, 'Headlight', (x, y, z-.004-.035), r, cone=.022)                      # domed lens (built 3.5 cm in)
    else: disc(trim, 'Amber', (x, y, z-.004), r, cone=.012)
# bumpers: a bright bar along a plan path across the end, round the corners and a little way back along the sides;
# its section is rounded, standing out from the body
def bumper(m, mat, yc, h, out, front=True, back=.20):
    sg = 1 if front else -1
    zfn = (lambda x: zfront(x, yc)) if front else (lambda x: zrear(x, yc))
    xe = .80; rc = .10; path = []
    for x in np.linspace(0, xe, 18): path.append((x, (zfn(x) or sg*(L/2-.05))+sg*out, 0.))
    zc = path[-1][1]-sg*rc
    for a in np.linspace(0, math.pi/2, 8)[1:]: path.append((xe+rc*math.sin(a)+out*math.sin(a)*0, zc+sg*rc*math.cos(a), a))
    xs_ = path[-1][0]
    for k in range(1, 5): path.append((xs_, path[-1][1]-sg*back/4, math.pi/2))
    prof = [(-.035, -h/2), (0, -h/2+.018), (.010, -.01), (.006, h/2-.015), (-.03, h/2)]   # (out, up) round the section
    rows = []
    for (x, z, a) in path:
        nx, nz = math.sin(a), sg*math.cos(a); rows.append([(x+nx*o, yc+u, z+nz*o) for o, u in prof])
    R_ = [[m.v(p) for p in r] for r in rows]; L_ = [[m.v((-p[0], p[1], p[2])) for p in r] for r in rows]
    for i in range(len(rows)-1):
        for j in range(len(prof)-1):
            for idx, flip in ((R_, sg > 0), (L_, sg < 0)):
                a_, b_, c_, d_ = idx[i][j], idx[i+1][j], idx[i][j+1], idx[i+1][j+1]
                if flip: m.tri(mat, a_, b_, c_); m.tri(mat, b_, d_, c_)
                else: m.tri(mat, a_, c_, b_); m.tri(mat, b_, c_, d_)
bumper(trim, 'Chrome', .42, .12, .045, True, .22)
patch(trim, 'Trim', lambda u, v: (.80*u*max(halfwidth(2.25, .30+.06*v), .3), .30+.06*v), 16, 1, push=.004)    # dark valance under it
fdeep = lambda y: zfront(0, y) or ZF
box(trim, 'Grille', (0.0001, .36, ZF-.06), (.55, .06, .06))                                                   # lower intake slot
patch(trim, 'Trim', lambda u, v: (.90*u*max(halfwidth(2.30, .78), .3), .77+.005*v), 16, 1, push=.003)        # hood's front shut line

# ---------- stripe: the gold "T" — a band across the front of the hood that runs back over each fender crown, sweeps
# down the front fender behind the wheel and runs back along the lower side to the rear wheel (photo) ----------
STR = Mesh('Stripe')
def side_band(z):                                 # centre height of the spear along z: under the fender's shoulder at the front, sweeping down at the door
    hi = min(.80+.07*math.exp(-((z-ZA_F)/.62)**2), float(section(z)['yt'])-.07+.13*math.exp(-((z-ZA_F)/.56)**2))   # clears the flare's top      # rides up on the blistered fender, above the flare
    return .555+(hi-.555)*ease(0, 1, (z-.45)/.75)
def band_pt(u, v, z0, z1):
    z = z0+(z1-z0)*u; yc = side_band(z); h = .10-.012*ease(0, 1, (z-.45)/.75); return z, yc-h/2+h*v
side_grid(STR, 'Stripe', lambda u, v: band_pt(u, v, ZA_R+RA+.10, 2.22), 140, 3, push=.006)
# ---------- sides: chrome rocker moulding, wheel-lip trim, door seams, handle, chrome bullet mirror, side markers ----------
side_patch(trim, 'Chrome', lambda u, v: (ZA_R+RA+.10+(ZA_F-RA-.10-(ZA_R+RA+.10))*u, .265+.035*v), 40, 1, push=.012)   # rocker moulding
def vline(z0, z1, y0, y1, w=.005): return lambda u, v: (z0+(z1-z0)*u+(v-.5)*w, y0+(y1-y0)*u)
for zz_ in ((1.02, .98, .33, .90), (-1.02, -.98, .33, .92)):
    side_patch(trim, 'Trim', vline(*zz_), 12, 1)                                                     # door front / back seams
side_patch(trim, 'Chrome', lambda u, v: (-.70-.16*u, .855+.022*v), 6, 1, push=.008)               # door handle
side_patch(trim, 'Amber', lambda u, v: (2.12+.12*u, .52+.035*v), 3, 1, push=.006)                   # front side marker
side_patch(trim, 'RedLens', lambda u, v: (-2.18-.12*u, .62+.035*v), 3, 1, push=.006)                # rear side marker
mir = Mesh('Mirrors')
def ellipsoid(m, mat, c, r, nu=16, nv=10):
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
ellipsoid(mir, 'Chrome', (HW+.07, 1.0, .20), (.045, .040, .075))                                     # bullet mirror on the door
box(mir, 'MirrorGlass', (HW+.07, 1.0, .126), (.07, .06, .004))
box(mir, 'Chrome', (HW+.02, .97, .22), (.07, .02, .03))                                               # its stalk
# ---------- the cowl scoop's open mouth facing the windshield, and the rivets round each bolt-on flare ----------
ys_ = ytop_at(SC0+.06, 0.)
box(trim, 'Grille', (0.0001, ys_-.030, SC0+.012), (.64, .042, .016))
for za in (ZA_F, ZA_R):
    for a in np.linspace(math.radians(-4), math.radians(184), 15):
        z, y = za+(RA+.048)*math.cos(a), TYRE_R+(RA+.048)*math.sin(a)
        ellipsoid(mir, 'Chrome', (xat(z, y)+.002, y, z), (.006, .0075, .0075), 8, 5)
# ---------- rear: a red full-width tail lamp panel between the lamps' bright frame, chrome bumper below, plate,
# and the deck's ducktail lip ----------
Wr = lambda y: max(halfwidth(-2.36, y), .1)
TY0, TY1 = .64, .80
patch(trim, 'Chrome', lambda u, v: (.94*u*Wr(TY1), TY1+.004+.014*v), 20, 1, push=.004, zfn=zrear, sgn=-1)
patch(trim, 'Chrome', lambda u, v: (.94*u*Wr(TY0), TY0-.018+.014*v), 20, 1, push=.004, zfn=zrear, sgn=-1)
patch(trim, 'RedLens', lambda u, v: (.93*u*Wr(TY0+(TY1-TY0)*v), TY0+(TY1-TY0)*v), 20, 4, push=.003, zfn=zrear, sgn=-1)
for x0, x1 in ((.40, .90),):                                                                          # the lit lamps at each end
    patch(tails, 'Taillight', lambda u, v: ((x0+(x1-x0)*u)*Wr(.72), TY0+.02+(TY1-TY0-.04)*v), 8, 2, push=.006, zfn=zrear, sgn=-1, shift=.035)
patch(trim, 'Trim', lambda u, v: (.13*u, TY0+.03+(TY1-TY0-.06)*v), 3, 2, push=.005, zfn=zrear, sgn=-1)   # dark centre
def rbump(m, mat, yc, h, out):
    pts = []
    for x in np.linspace(0, .975*HW, 26):
        zb = (zrear(x, yc) or ZR+.05)-out+.25*max(0, x-.70)**2*4
        pts.append([(x, yc-h/2, zb+.04), (x, yc-h/2+.01, zb), (x, yc+h/2, zb), (x, yc+h/2, zb+.03)])
    R = [[m.v(p) for p in row] for row in pts]; Lf = [[m.v((-p[0], p[1], p[2])) for p in row] for row in pts]
    for i in range(len(pts)-1):
        for j in range(3):
            a, b, c, d = R[i][j], R[i+1][j], R[i][j+1], R[i+1][j+1]; m.tri(mat, a, c, b); m.tri(mat, b, c, d)
            a, b, c, d = Lf[i][j], Lf[i+1][j], Lf[i][j+1], Lf[i+1][j+1]; m.tri(mat, a, b, c); m.tri(mat, b, d, c)
bumper(trim, 'Chrome', .46, .11, .04, False, .24)
patch(plate, 'Plate', lambda u, v: (.16*u, .52+.10*v), 4, 2, push=.007, zfn=zrear, sgn=-1)
patch(trim, 'Trim', lambda u, v: (.80*u*max(halfwidth(-2.25, .33+.06*v), .3), .33+.06*v), 16, 1, push=.004, zfn=zrear, sgn=-1)   # dark valance
top_patch(trim, 'Trim', lambda u, v: (.90*u*max(halfwidth(-2.0, .95), .3), -1.80+.004*v), 16, 1, push=.003)   # trunk shut line

# ---------- wheels: F70-14 tyre with a raised-letter band, 14" rally wheel: grey centre with slots, bright trim ring
# and centre cap, chrome lug nuts ----------
def wheel_mesh(name, outward, W, dish):
    """A fat tyre (W wide) with tread blocks, rounded shoulders, a bulging sidewall and raised plain letters, on a 15"
    deep-dish five-spoke wheel: polished lip, machined spokes standing out from a dark barrel, chrome cap and lug nuts."""
    m = Mesh(name); RIM = .192; w = W/2; Rt = TYRE_R
    def q(mat, a, b, c, d):                       # quad a-b-c-d facing outward along x (flipped for the inner wheels)
        i0 = [m.v((outward*p[0], p[1], p[2])) for p in (a, b, c, d)]
        if outward > 0: m.tri(mat, i0[0], i0[1], i0[2]); m.tri(mat, i0[0], i0[2], i0[3])
        else: m.tri(mat, i0[0], i0[2], i0[1]); m.tri(mat, i0[0], i0[3], i0[2])
    def lathe(mat, prof, n=64):
        idx = []
        for i in range(n+1):
            a = i/n*2*math.pi; idx.append([m.v((outward*px, pr*math.cos(a), pr*math.sin(a))) for px, pr in prof])
        for i in range(n):
            for j in range(len(prof)-1):
                a_, b_, c_, d_ = idx[i][j], idx[i+1][j], idx[i][j+1], idx[i+1][j+1]
                if outward > 0: m.tri(mat, a_, b_, c_); m.tri(mat, b_, d_, c_)
                else: m.tri(mat, a_, c_, b_); m.tri(mat, b_, c_, d_)
    # tyre: bead → bulging sidewall → rounded shoulder → tread with three circumferential grooves → and back
    side = lambda s_: [(s_*w*.88, RIM), (s_*w*.97, RIM+.03), (s_*w*1.02, RIM+.075), (s_*w*1.01, Rt-.055), (s_*w*.97, Rt-.024), (s_*w*.88, Rt-.006)]
    tread = []
    for x0 in (-.80, -.47, -.43, -.02, .02, .43, .47, .80):
        r = Rt-.009 if x0 in (-.47, -.43, -.02, .02, .43, .47) and False else Rt
        tread.append((x0*w, r))
    prof = side(-1)+[(-.80*w, Rt), (-.47*w, Rt), (-.46*w, Rt-.010), (-.44*w, Rt-.010), (-.43*w, Rt), (-.02*w, Rt), (-.01*w, Rt-.008), (.01*w, Rt-.008), (.02*w, Rt),
                     (.43*w, Rt), (.44*w, Rt-.010), (.46*w, Rt-.010), (.47*w, Rt), (.80*w, Rt)]+side(1)[::-1]
    lathe('Tyre', prof, 72)
    # tread blocks: dark lateral grooves across the tread, staggered between the ribs
    NB = 54
    for k in range(NB):
        a = k/NB*2*math.pi; da = .016
        for (x0, x1), off in (((-.80, -.47), 0.), ((-.43, -.02), .5), ((.02, .43), 0.), ((.47, .80), .5)):
            aa = a+off*2*math.pi/NB; r = Rt+.0008
            q('Well', (x0*w, r*math.cos(aa), r*math.sin(aa)), (x1*w, r*math.cos(aa), r*math.sin(aa)),
              (x1*w, r*math.cos(aa+da), r*math.sin(aa+da)), (x0*w, r*math.cos(aa+da), r*math.sin(aa+da)))
    # raised white letters on the outer sidewall: plain blocks in two arcs (no words)
    for k in range(60):
        a = k/60*2*math.pi
        if (k % 30) > 21 or k % 30 in (4, 9, 15): continue
        r0, r1 = RIM+.094, RIM+.114; xx = w*1.028
        q('Letters', (xx, r0*math.cos(a), r0*math.sin(a)), (xx, r1*math.cos(a), r1*math.sin(a)),
          (xx, r1*math.cos(a+.075), r1*math.sin(a+.075)), (xx, r0*math.cos(a+.075), r0*math.sin(a+.075)))
    # wheel: polished lip, then the deep dish down to the spoke face
    xf = w*.88; xs = xf-dish                      # outer bead plane, spoke face
    lathe('Chrome', [(xf, RIM), (xf+.010, RIM+.004), (xf+.012, RIM-.006), (xf+.004, RIM-.016), (xs+.006, RIM-.022), (xs, RIM-.026)], 64)
    lathe('Well', [(xs, RIM-.026), (xs-.012, RIM-.028), (-w*.80, RIM-.028), (-w*.80, .05)], 40)        # dark barrel behind
    lathe('Bar', [(xs-.075, .155), (xs-.070, .150), (xs-.070, .06)], 40)                               # brake drum face
    # five spokes: tapered, standing out of the dish toward a raised hub
    hub = xs+.028
    for k in range(5):
        a = k/5*2*math.pi+math.pi/10
        r0, r1, w0, w1 = .060, RIM-.026, .046, .030
        def P(r, t, depth):                       # point on a spoke: r along it, t across it, depth back from its face
            xface = hub+(xs-hub)*(r-r0)/(r1-r0)
            ca, sa = math.cos(a), math.sin(a)
            return (xface-depth, r*ca-t*sa, r*sa+t*ca)
        f = [P(r0, -w0, 0), P(r1, -w1, 0), P(r1, w1, 0), P(r0, w0, 0)]
        b = [P(r0, -w0, .030), P(r1, -w1, .022), P(r1, w1, .022), P(r0, w0, .030)]
        q('Rim', f[0], f[1], f[2], f[3])
        q('Rim', b[1], b[0], f[0], f[1]) if False else q('Rim', f[1], f[0], b[0], b[1])
        q('Rim', f[3], f[2], b[2], b[3])
        # a bright machined edge along each side of the spoke face
        for t0, t1 in ((-1, -.72), (.72, 1)):
            q('Chrome', P(r0, w0*t0, -.0008), P(r1, w1*t0, -.0008), P(r1, w1*t1, -.0008), P(r0, w0*t1, -.0008))
    lathe('Rim', [(hub, .085), (hub+.006, .070), (hub+.008, .040)], 40)                                 # hub face
    lathe('Chrome', [(hub+.008, .040), (hub+.024, .034), (hub+.032, .018), (hub+.034, 0.)], 32)          # centre cap
    for k in range(5):                                                                                   # lug nuts between the spokes
        a = k/5*2*math.pi; cy, cz = .060*math.cos(a), .060*math.sin(a)
        pr = [(hub+.006, .010), (hub+.020, .010), (hub+.024, .006), (hub+.025, 0.)]
        idx = []
        for i in range(7):
            b_ = i/6*2*math.pi; idx.append([m.v((outward*px, cy+r*math.cos(b_), cz+r*math.sin(b_))) for px, r in pr])
        for i in range(6):
            for j in range(len(pr)-1):
                a_, b_, c_, d_ = idx[i][j], idx[i+1][j], idx[i][j+1], idx[i+1][j+1]
                if outward > 0: m.tri('Chrome', a_, b_, c_); m.tri('Chrome', b_, d_, c_)
                else: m.tri('Chrome', a_, c_, b_); m.tri('Chrome', b_, c_, d_)
    return m
wheels = [('Wheel_FL', XF, ZA_F, WF, .055), ('Wheel_FR', -XF, ZA_F, WF, .055), ('Wheel_RL', XR, ZA_R, WR, .085), ('Wheel_RR', -XR, ZA_R, WR, .085)]

# ---------- write the .glb ----------
MATS = {
 'Paint':     dict(c=[.010, .010, .011, 1], m=.0, r=.22),       # gloss black
 'Stripe':    dict(c=[.48, .32, .085, 1], m=.55, r=.35),        # gold
 'Glass':     dict(c=[.030, .036, .045, 1], m=.75, r=.04),
 'Chrome':    dict(c=[.62, .63, .65, 1], m=1, r=.12),
 'Trim':      dict(c=[.015, .015, .016, 1], m=.1, r=.6),
 'Grille':    dict(c=[.010, .010, .011, 1], m=.2, r=.5),
 'Bar':       dict(c=[.060, .062, .066, 1], m=.6, r=.35),
 'Amber':     dict(c=[.60, .26, .02, 1], m=.2, r=.2),
 'RedLens':   dict(c=[.25, .015, .012, 1], m=.3, r=.12),
 'Headlight': dict(c=[.55, .56, .55, 1], m=.6, r=.1),
 'Taillight': dict(c=[.30, .02, .02, 1], m=.2, r=.2),
 'Plate':     dict(c=[.55, .56, .58, 1], m=0, r=.6),
 'MirrorGlass': dict(c=[.25, .28, .32, 1], m=.9, r=.05),
 'Tyre':      dict(c=[.020, .020, .022, 1], m=0, r=.85),
 'Letters':   dict(c=[.13, .13, .125, 1], m=0, r=.8),
 'Rim':       dict(c=[.20, .21, .22, 1], m=.6, r=.35),
 'Well':      dict(c=[.008, .008, .009, 1], m=0, r=.9),
}
matnames = list(MATS)
J = dict(asset=dict(version='2.0', generator='explorer3d tools/make-javelin.py'), scene=0, scenes=[dict(nodes=[0])],
         nodes=[dict(name='Javelin_AMX_1972', children=[])], meshes=[], accessors=[], bufferViews=[], buffers=[],
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
def put(m, translation=None, parent=0):
    P = np.array(m.P, dtype='<f4'); N = normals(P, m.prims)
    at = dict(POSITION=add(P, 5126, 'VEC3', 34962), NORMAL=add(N, 5126, 'VEC3', 34962))
    prims = []
    for mat, I in m.prims.items():
        big = len(P) > 65535
        ia = add(np.array(I, dtype='<u4' if big else '<u2'), 5125 if big else 5123, 'SCALAR', 34963)
        prims.append(dict(attributes=at, indices=ia, material=matnames.index(mat)))
    J['meshes'].append(dict(name=m.name, primitives=prims))
    node = dict(name=m.name, mesh=len(J['meshes'])-1)
    if translation: node['translation'] = list(translation)
    J['nodes'].append(node); J['nodes'][parent]['children'].append(len(J['nodes'])-1)
for m in (body, gh, gtr, STR, heads, tails, trim, plate, mir):
    if m.prims: put(m)
for name, x, za, W, dish in wheels:
    put(wheel_mesh(name, 1 if x > 0 else -1, W, dish), translation=(x, TYRE_R, za))
while len(BIN) % 4: BIN.append(0)
J['buffers'] = [dict(byteLength=len(BIN))]
js = json.dumps(J, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
out = sys.argv[1] if len(sys.argv) > 1 else 'models/javelin-amx-v3.glb'
with open(out, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12+8+len(js)+8+len(BIN)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(BIN), 0x004E4942)); f.write(BIN)
print(out, len(BIN)//1024, 'KB', sum(len(I)//3 for m in (body, gh, gtr, STR, heads, tails, trim, plate, mir) for I in m.prims.values()), 'body tris')
