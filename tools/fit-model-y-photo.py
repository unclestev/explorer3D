# Fits the camera of one of the owner's Model Y photos (tools/photos/model-y-photos.json) to models/model-y.glb by
# matching the car's outline in the photo (traced by hand) with the model's, and saves it back into the json.
# After changing the body in make-model-y.py:
#   python3 tools/make-model-y.py models/model-y.glb
#   python3 tools/fit-model-y-photo.py models/model-y.glb rear     (and: side)
#   python3 tools/make-model-y.py models/model-y.glb
# /tmp/model-y-fit-<name>.png shows the match: red the photo's outline, green the model's, yellow both.
import sys, os, json, math, itertools, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glbtool import GLB
from PIL import Image, ImageDraw
from scipy.optimize import minimize

JS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'photos', 'model-y-photos.json')
ALL = json.load(open(JS)); name = sys.argv[2]; PH = ALL[name]
(W, H), S = PH['size'], 4
m = Image.new('L', (W//S, H//S), 0); ImageDraw.Draw(m).polygon([(x/S, y/S) for x, y in PH['outline']], fill=1); M = np.array(m, bool)

# points scattered densely over every triangle of the model (wheels included), so the outline comes out solid
g = GLB(sys.argv[1]); P = []; np.random.seed(1)
def walk(n, t):
    nd = g.j['nodes'][n]; t = t+np.array(nd.get('translation', [0, 0, 0]))
    if 'mesh' in nd:
        for p in g.j['meshes'][nd['mesh']]['primitives']:
            V = g.acc(p['attributes']['POSITION'])+t; T = g.acc(p['indices']).reshape(-1, 3); A, B, C = V[T[:, 0]], V[T[:, 1]], V[T[:, 2]]
            n_ = np.ceil(np.linalg.norm(np.cross(B-A, C-A), axis=1)/2/.00008).astype(int).clip(1, 400)
            k = np.repeat(np.arange(len(T)), n_); r1 = np.sqrt(np.random.rand(len(k))); r2 = np.random.rand(len(k))
            P.append(A[k]*(1-r1)[:, None]+B[k]*(r1*(1-r2))[:, None]+C[k]*(r1*r2)[:, None])
    for c in nd.get('children', []): walk(c, t)
walk(0, np.zeros(3)); P = np.concatenate(P)

def proj(prm, X):                                   # the same camera model as make-model-y.py cam_proj
    cx, cy, cz, yaw, pit, rol, f = prm
    d = X-np.array([cx, cy, cz]); cyw, syw = math.cos(yaw), math.sin(yaw)
    x = cyw*d[:, 0]-syw*d[:, 2]; z = syw*d[:, 0]+cyw*d[:, 2]; y = d[:, 1]
    cp, sp = math.cos(pit), math.sin(pit); y2 = cp*y-sp*z; z2 = sp*y+cp*z
    u = -x/z2*f; v = -y2/z2*f; cr, sr = math.cos(rol), math.sin(rol)
    return cr*u-sr*v+W/2, sr*u+cr*v+H/2, z2
def mask(prm):
    u, v, z = proj(prm, P); k = z > .1; u = (u[k]/S).astype(int); v = (v[k]/S).astype(int)
    R = np.zeros(M.shape, bool); ok = (u >= 0)&(u < M.shape[1])&(v >= 0)&(v < M.shape[0])
    R[v[ok], u[ok]] = True
    R[1:] |= R[:-1].copy(); R[:, 1:] |= R[:, :-1].copy()
    return R
def loss(prm):
    R = mask(prm); return 1-(R&M).sum()/max(1, (R|M).sum())

best = (loss(PH['camera']), list(PH['camera']))
c0 = PH['camera']
for dd, dh, df in itertools.product((.85, 1, 1.2), (-.3, 0, .3), (.8, 1, 1.25)):     # a coarse search around the saved camera
    p = list(c0); p[0] *= dd; p[2] *= dd; p[1] += dh; p[6] *= df
    l = loss(p)
    if l < best[0]: best = (l, p)
print('start', round(best[0], 4))
r = minimize(loss, best[1], method='Nelder-Mead', options=dict(maxiter=2500, xatol=1e-4, fatol=1e-5))
print('outline mismatch', round(r.fun, 4), [round(float(v), 5) for v in r.x])
PH['camera'] = [round(float(v), 5) for v in r.x]; json.dump(ALL, open(JS, 'w'), indent=1)
R = mask(r.x); im = np.zeros(M.shape+(3,), np.uint8); im[..., 0] = M*255; im[..., 1] = R*255
Image.fromarray(im).save('/tmp/model-y-fit-%s.png' % name)
