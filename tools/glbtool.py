import json,struct,numpy as np
CT={5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'}; NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
class GLB:
  def __init__(s,f):
    b=open(f,'rb').read(); L=struct.unpack('<I',b[12:16])[0]
    s.j=json.loads(b[20:20+L]); BL=struct.unpack('<I',b[20+L:24+L])[0]; s.bin=bytearray(b[20+L+8:20+L+8+BL])
  def acc(s,i):
    j=s.j; a=j['accessors'][i]; bv=j['bufferViews'][a['bufferView']]; o=bv.get('byteOffset',0)+a.get('byteOffset',0)
    n=NC[a['type']]; dt=np.dtype(CT[a['componentType']]); d=np.frombuffer(bytes(s.bin[o:o+a['count']*n*dt.itemsize]),dtype=dt).copy()
    return d.reshape(-1,n) if n>1 else d
  def add(s,arr,target=None):
    arr=np.ascontiguousarray(arr); j=s.j
    if arr.dtype.kind in 'ui': arr=arr.astype('<u4').ravel(); ct=5125; typ='SCALAR'
    else: arr=arr.astype('<f4'); ct=5126; typ={1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4'}[arr.shape[1] if arr.ndim>1 else 1]
    while len(s.bin)%4: s.bin.append(0)
    off=len(s.bin); s.bin+=arr.tobytes()
    bv={'buffer':0,'byteOffset':off,'byteLength':arr.nbytes}
    if target: bv['target']=target
    j['bufferViews'].append(bv); a={'bufferView':len(j['bufferViews'])-1,'componentType':ct,'count':len(arr),'type':typ}
    if ct==5126: a['min']=[float(v) for v in np.atleast_2d(arr.reshape(len(arr),-1)).min(0)]; a['max']=[float(v) for v in np.atleast_2d(arr.reshape(len(arr),-1)).max(0)]
    j['accessors'].append(a); return len(j['accessors'])-1
  def mesh(s,name): return [m for m in s.j['meshes'] if m['name']==name][0]
  def get(s,name):
    p=s.mesh(name)['primitives'][0]; P=s.acc(p['attributes']['POSITION']); N=s.acc(p['attributes']['NORMAL'])
    UV=s.acc(p['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in p['attributes'] else np.zeros((len(P),2),'f4')
    I=s.acc(p['indices']) if 'indices' in p else np.arange(len(P))
    return P,N,UV,I.reshape(-1,3)
  def put(s,name,P,N,UV,I):
    p=s.mesh(name)['primitives'][0]
    p['attributes']={'POSITION':s.add(P,34962),'NORMAL':s.add(N,34962),'TEXCOORD_0':s.add(UV,34962)}
    p['indices']=s.add(np.asarray(I,'u4').ravel(),34963)
  def save(s,f):
    # compact: rewrite only bufferViews still referenced
    j=s.j; used=set()
    for a in j['accessors']: used.add(a['bufferView'])
    for im in j.get('images',[]):
      if 'bufferView' in im: used.add(im['bufferView'])
    # drop accessors not referenced by meshes
    ref=set()
    for m in j['meshes']:
      for p in m['primitives']:
        ref|=set(p['attributes'].values());
        if 'indices' in p: ref.add(p['indices'])
    amap={}; acc=[]
    for i,a in enumerate(j['accessors']):
      if i in ref: amap[i]=len(acc); acc.append(a)
    for m in j['meshes']:
      for p in m['primitives']:
        p['attributes']={k:amap[v] for k,v in p['attributes'].items()}
        if 'indices' in p: p['indices']=amap[p['indices']]
    j['accessors']=acc
    used={a['bufferView'] for a in acc}|{im['bufferView'] for im in j.get('images',[]) if 'bufferView' in im}
    out=bytearray(); bmap={}; bvs=[]
    for i,bv in enumerate(j['bufferViews']):
      if i not in used: continue
      d=s.bin[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']]
      while len(out)%4: out.append(0)
      nb=dict(bv); nb['byteOffset']=len(out); out+=d; bmap[i]=len(bvs); bvs.append(nb)
    while len(out)%4: out.append(0)
    for a in acc: a['bufferView']=bmap[a['bufferView']]
    for im in j.get('images',[]):
      if 'bufferView' in im: im['bufferView']=bmap[im['bufferView']]
    j['bufferViews']=bvs; j['buffers'][0]['byteLength']=len(out)
    js=json.dumps(j,separators=(',',':')).encode()
    while len(js)%4: js+=b' '
    open(f,'wb').write(struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(out))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(out),0x004E4942)+bytes(out))
def raycast(P,I,o,d):
  """max t>=0 hit of rays o+t*d (k,3) against triangles; nan if none"""
  T=P[I]; v0=T[:,0][None]; e1=(T[:,1]-T[:,0])[None]; e2=(T[:,2]-T[:,0])[None]
  o=o[:,None]; d=d[:,None]
  h=np.cross(d,e2); a=(e1*h).sum(-1); f=1/np.where(np.abs(a)<1e-9,np.nan,a)
  sv=o-v0; u=f*(sv*h).sum(-1); q=np.cross(sv,e1); v=f*(d*q).sum(-1); t=f*(e2*q).sum(-1)
  ok=(u>=-1e-6)&(v>=-1e-6)&(u+v<=1+1e-6)&(t>=0)
  t=np.where(ok,t,np.nan); return np.nanmax(t,axis=1)
