# Rework of the owner's Javelin AMX v2 model (2026-10-02). Usage: python3 tools/fix-javelin-v2.py <v2.glb> <out.glb>
import sys,copy; sys.path.insert(0,'.')
from glbtool import *
g=GLB(sys.argv[1]); j=g.j   # the owner's v2 file with its flake texture shrunk to a 256px JPEG
BP,BN,BUV,BI=g.get('Body')
R4=lambda a:np.round(a,4)
# ---- stations of the main loft (4 verts per side: bottom, mid, shoulder, top by height)
st={}
for i,p in enumerate(BP):
    st.setdefault(round(float(p[2]),3),[]).append(i)
main={z:sorted([i for i in ids if BP[i,0]>0],key=lambda i:BP[i,1]) for z,ids in st.items() if len([i for i in ids if BP[i,0]>0])==4}
def ring(z): ids=main[z]; return {'b':BP[ids[0]],'m':BP[ids[1]],'s':BP[ids[2]],'t':BP[ids[3]]}
ZONES=[dict(za=-1.85,zb=-0.85,zc=-1.397,r=.43),dict(za=.85,zb=2.05,zc=1.397,r=.375)]
YC=.332; YBOT=.16
def zst(za,zb): return [z for z in sorted(main) if za-1e-6<=z<=zb+1e-6]
def xside(y,z,zs):
    # straight (un-pinched) side: per station linear bottom->shoulder, linear in z between stations
    for a,b in zip(zs,zs[1:]):
        if a-1e-6<=z<=b+1e-6: break
    def at(zz):
        R=ring(zz); xb,yb=R['b'][0],R['b'][1]; xs,ys=R['s'][0],R['s'][1]
        t=np.clip((y-yb)/(ys-yb),0,1); return xb+(xs-xb)*t
    t=(z-a)/(b-a) if b!=a else 0; return at(a)+(at(b)-at(a))*t
def yshoulder(z,zs):
    for a,b in zip(zs,zs[1:]):
        if a-1e-6<=z<=b+1e-6: break
    t=(z-a)/(b-a); return ring(a)['s'][1]+(ring(b)['s'][1]-ring(a)['s'][1])*t
# ---- 1. delete the side triangles (bottom/mid/shoulder bands) inside each wheel zone, both sides
T=BP[BI]; n=np.cross(T[:,1]-T[:,0],T[:,2]-T[:,0]); n/=np.linalg.norm(n,axis=1)[:,None]
role={}
for z,ids in main.items():
    for k,i in zip('bmst',ids): role[i]=k
    # mirrored (-x) vertices
    for k,i in zip('bmst',ids):
        mi=np.where((np.abs(BP[:,0]+BP[i,0])<1e-5)&(np.abs(BP[:,1]-BP[i,1])<1e-5)&(np.abs(BP[:,2]-BP[i,2])<1e-5))[0]
        for m in mi: role[m]=k
keep=[]
for ti,t in enumerate(BI):
    zz=BP[t,2]; drop=False
    for Z in ZONES:
        if np.all(zz>=Z['za']-1e-4)&np.all(zz<=Z['zb']+1e-4) and all(role.get(int(v)) in ('b','m','s') for v in t) and abs(n[ti,0])>.3: drop=True
    keep.append(not drop)
keep=np.array(keep); print('side tris removed',(~keep).sum())
newP=[];newN=[];newUV=[];newI=[]
def addtri(a,b,c,outward=None):
    a,b,c=map(np.asarray,(a,b,c)); nn=np.cross(b-a,c-a); L=np.linalg.norm(nn)
    if L<1e-10: return
    nn/=L
    if outward is not None and np.dot(nn,outward)<0: b,c=c,b; nn=-nn
    base=len(newP); newP.extend([a,b,c]); newN.extend([nn]*3); newUV.extend([[a[2],a[1]],[b[2],b[1]],[c[2],c[1]]]); newI.append([base,base+1,base+2])
def poly_param(pts):
    pts=np.asarray(pts,float); d=np.r_[0,np.cumsum(np.linalg.norm(np.diff(pts,axis=0),axis=1))]; return pts,d/d[-1]
def at_param(pts,u,s):
    k=np.searchsorted(u,s,side='right')-1; k=min(max(k,0),len(u)-2); t=(s-u[k])/(u[k+1]-u[k]) if u[k+1]>u[k] else 0
    return pts[k]+(pts[k+1]-pts[k])*t
liner=[]
for Z in ZONES:
    za,zb,zc,r=Z['za'],Z['zb'],Z['zc'],Z['r']; zs=zst(za,zb)
    # outer path (z,y): za bottom -> za mid -> za shoulder -> shoulders -> zb shoulder -> zb mid -> zb bottom (original vertices)
    A,B=ring(za),ring(zb)
    outer=[(za,A['b'][1]),(za,A['m'][1]),(za,A['s'][1])]+[(z,ring(z)['s'][1]) for z in zs[1:-1]]+[(zb,B['s'][1]),(zb,B['m'][1]),(zb,B['b'][1])]
    inner=[(zc-r,YBOT),(zc-r,YC)]+[(zc+r*np.cos(a),YC+r*np.sin(a)) for a in np.linspace(np.pi,0,25)[1:-1]]+[(zc+r,YC),(zc+r,YBOT)]
    op,ou=poly_param(outer); ip,iu=poly_param(inner)
    S=np.unique(np.r_[ou,iu])
    O=[at_param(op,ou,s) for s in S]; I_=[at_param(ip,iu,s) for s in S]
    for sgn in (1,-1):
        def P3(zy): z,y=zy; return np.array([sgn*xside(y,z,zs),y,z])
        out=np.array([sgn,0,0.])
        for k in range(len(S)-1):
            a,b,c,d=P3(O[k]),P3(O[k+1]),P3(I_[k+1]),P3(I_[k])
            addtri(a,b,c,out); addtri(a,c,d,out)
        # snap: outer original vertices are exact by construction except x of mid verts (now straightened) -> fine (only used by removed tris)
        liner.append((sgn,zs,inner))
print('arch panel tris',len(newI))
P2=np.r_[BP,np.array(newP,'f4')]; N2=np.r_[BN,np.array(newN,'f4')]; UV2=np.r_[BUV,np.array(newUV,'f4')]
I2=np.r_[BI[keep],np.array(newI)+len(BP)]
g.put('Body',P2,N2,UV2,I2)
# ---- 2. wheel well liners (replace Wheel_Wells): arch tunnel from x_in to the skin + inner wall
LP=[];LN=[];LI=[]
XIN=.60
for sgn,zs,inner in liner:
    pts=[]
    for z,y in inner: pts.append(((sgn*XIN,y,z),(sgn*(xside(y,z,zs)+.004),y,z)))
    for k in range(len(pts)-1):
        a,b=pts[k]; c,d=pts[k+1]
        base=len(LP); LP+= [a,b,d,c]
        nn=np.cross(np.subtract(b,a),np.subtract(c,a)); nn=nn/ (np.linalg.norm(nn)+1e-12)
        LN+=[nn]*4; LI+=[[base,base+1,base+2],[base,base+2,base+3]]
    # inner wall: fan from the arch centre at the bottom
    zc=np.mean([p[0][2] for p in pts]); cen=(sgn*XIN,(YBOT+YC)/2,zc); base=len(LP); LP.append(cen); LN.append((sgn,0,0))
    for k in range(len(pts)): LP.append(pts[k][0]); LN.append((sgn,0,0))
    for k in range(len(pts)-1): LI.append([base,base+1+k,base+2+k])
LP=np.array(LP,'f4'); g.put('Wheel_Wells',LP,np.array(LN,'f4'),LP[:,[2,1]],np.array(LI))
# ---- 3. wheels out to fill the arches
for nd in j['nodes']:
    if nd.get('name','').startswith('Wheel_') and 'translation' in nd: nd['translation'][0]=float(np.sign(nd['translation'][0])*.82)
# ---- 4. glass draped on the cabin + 5. bright trim frames around each window
B2P,_,_,B2I=g.get('Body')
def hit(o,d,far=True):
    o=np.atleast_2d(o).astype(float); d=np.atleast_2d(d).astype(float)
    T=B2P[B2I]; v0=T[:,0][None]; e1=(T[:,1]-T[:,0])[None]; e2=(T[:,2]-T[:,0])[None]; oo=o[:,None]; dd=d[:,None]
    h=np.cross(dd,e2); a=(e1*h).sum(-1); f=1/np.where(np.abs(a)<1e-9,np.nan,a); sv=oo-v0; u=f*(sv*h).sum(-1); q=np.cross(sv,e1); v=f*(dd*q).sum(-1); t=f*(e2*q).sum(-1)
    ok=(u>=-1e-6)&(v>=-1e-6)&(u+v<=1+1e-6)&(t>=0); t=np.where(ok,t,np.nan)
    return np.nanmax(t,1) if far else np.nanmin(t,1)
def top_ring(z):
    zs=sorted(main); 
    for a,b in zip(zs,zs[1:]):
        if a<=z<=b: t=(z-a)/(b-a); A,Bb=ring(a)['t'],ring(b)['t']; return A[0]+(Bb[0]-A[0])*t, A[1]+(Bb[1]-A[1])*t
def shoulder_ring(z):
    zs=sorted(main)
    for a,b in zip(zs,zs[1:]):
        if a<=z<=b: t=(z-a)/(b-a); A,Bb=ring(a)['s'],ring(b)['s']; return A[0]+(Bb[0]-A[0])*t, A[1]+(Bb[1]-A[1])*t
def drape(kind,corners,off,sgn=1):
    """corners: 4 param-space points (2D). kind 'top': (x,z) -> y from above; 'side': (z,y) -> x from the centre outward"""
    c=np.asarray(corners,float)
    def edge(i,k): return np.linalg.norm(c[k]-c[i])
    eu=.035/max(edge(0,1),edge(3,2)); ev=.035/max(edge(0,3),edge(1,2))
    us=np.r_[0,eu,np.linspace(eu,1-eu,8)[1:-1],1-eu,1]; vs=np.r_[0,ev,np.linspace(ev,1-ev,5)[1:-1],1-ev,1]
    def pt(u,v,o):
        q=(1-u)*(1-v)*c[0]+u*(1-v)*c[1]+u*v*c[2]+(1-u)*v*c[3]
        if kind=='top':
            x,z=q; t=hit([x,3,z],[0,-1,0],far=False)[0]; return np.array([x,3-t+o,z])
        z,y=q; t=hit([0,y,z],[sgn,0,0])[0]; return np.array([sgn*(t+o),y,z])
    G={};F={}
    for a in range(len(us)-1):
        for b in range(len(vs)-1):
            border=a in (0,len(us)-2) or b in (0,len(vs)-2)
            o=off+(.010 if border else 0)
            quad=[pt(us[a],vs[b],o),pt(us[a+1],vs[b],o),pt(us[a+1],vs[b+1],o),pt(us[a],vs[b+1],o)]
            (F if border else G)[(a,b)]=quad
    return G,F
panels=[]
# windshield: on the slope between the roof's front edge (z -.2) and the cowl (z .42), inset from its sides
zt,zb_=-.12,.37
panels.append(('top',[(-(top_ring(zb_)[0]-.08),zb_),((top_ring(zb_)[0]-.08),zb_),((top_ring(zt)[0]-.07),zt),(-(top_ring(zt)[0]-.07),zt)]))
# rear window: on the fastback slope behind the roof
zt,zb_=-.93,-1.50
panels.append(('top',[((top_ring(zb_)[0]-.08),zb_),(-(top_ring(zb_)[0]-.08),zb_),(-(top_ring(zt)[0]-.07),zt),((top_ring(zt)[0]-.07),zt)]))
# side windows (right side; mirrored below): on the band between the shoulder and the roof edge, A-pillar to C-pillar
def sidepanel():
    fz_b,fz_t,rz_t,rz_b=.30,-.10,-.92,-1.20
    return [(fz_b,shoulder_ring(fz_b)[1]+.035),(rz_b,shoulder_ring(rz_b)[1]+.035),(rz_t,top_ring(rz_t)[1]-.035),(fz_t,top_ring(fz_t)[1]-.035)]
panels.append(('side',sidepanel()))
GLP=[];FRP=[]
def mirror(qs): return [[np.array([-p[0],p[1],p[2]]) for p in q[::-1]] for q in qs]
for kind,cr in panels:
    G,F=drape(kind,cr,.012); GLP+=list(G.values()); FRP+=list(F.values())
    if kind=='side':                                   # the body isn't exactly symmetric: fit the left side's glass to the left side
        G,F=drape(kind,cr,.012,-1); GLP+=list(G.values()); FRP+=list(F.values())
def build(quads):
    P=[];N=[];I=[]
    for q in quads:
        q=[np.asarray(p,float) for p in q]
        if any(np.isnan(p).any() for p in q): continue
        nn=np.cross(q[1]-q[0],q[2]-q[0]); nn/=np.linalg.norm(nn)+1e-12
        cen=np.mean(q,0); outward=cen-np.array([0,.6,cen[2]*.3])
        if np.dot(nn,outward)<0: q=q[::-1]; nn=-nn
        b=len(P); P+=q; N+=[nn]*4; I+=[[b,b+1,b+2],[b,b+2,b+3]]
    P=np.array(P,'f4'); return P,np.array(N,'f4'),P[:,[0,2]],np.array(I)
gp=build(GLP); fp=build(FRP); print('glass quads',len(gp[3])//2,'frame quads',len(fp[3])//2, 'nan glass', sum(np.isnan(np.asarray(q,float)).any() for q in GLP))
g.put('Glass',*gp); g.put('Window_Frames',*fp)
mat={m['name']:i for i,m in enumerate(j['materials'])}
trim=copy.deepcopy(j['materials'][mat['Chrome']]); trim['name']='Window_Trim'; j['materials'].append(trim)
g.mesh('Window_Frames')['primitives'][0]['material']=len(j['materials'])-1    # bright window trim (own material)
j['materials'][mat['Glass']]['pbrMetallicRoughness']['baseColorFactor']=[.05,.09,.12,.85]   # darker tinted glass
# the low side stripe ran through both wheel openings: end it at the arches
SP,SN,SUV,SI=g.get('Hood_T_Stripe')
low=(np.abs(SP[:,0])>.8)&(SP[:,1]<.35)
SP[low,2]=np.clip(SP[low,2],-.93,.98)
g.put('Hood_T_Stripe',SP,SN,SUV,SI)
j['materials'][mat['Wheel_Well']]['doubleSided']=True
j['asset']['extras']={'edited':'2026-10-02: body sides straightened at the wheels and open arches cut, wheel-well liners, wheels moved out to x 0.82, glass draped on the cabin, chrome trim around the windows (Yorkville Driver)'}
g.save(sys.argv[2]); print('saved')
