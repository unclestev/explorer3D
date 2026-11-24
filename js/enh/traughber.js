/* Traughber Junior High, built to the owner's aerial photo (owner 2026-11-23: "make Traughber layout like this with the same
   color"). The game's buildings come from the map tiles, which I can't see from the build machine, so this fits a plan traced
   from the photo onto the real footprint at run time: find the map point named Traughber, gather the big buildings around it,
   take their smallest enclosing rectangle, and lay the traced wings into it — whichever of the 8 ways round (turned / flipped)
   overlaps the real footprint best. Then the map's own copies are hidden and the traced wings drawn instead: tan-orange brick
   walls under dark flat roofs, the gym and halls taller than the connecting wings. If the footprint can't be found, or the plan
   doesn't fit it, nothing changes. window.TRJ.off() puts the map's own building back. */
(()=>{
'use strict';
const {safe,onReady,onTick}=YD;
const WALL='#b88862', ROOF='#2c2e34';
// the wings, in photo pixels [x0,y0,x1,y1, height m] (the photo is looked at from the south-east, so this is a flattened plan)
// traced from the owner's aerial photo: its roof outline cut into rectangles (photo pixels x0,y0,x1,y1) with each one's height in metres
const PLAN0=[[528,84,552,144,5],[612,84,624,120,5],[516,96,528,144,5],[552,96,612,144,5],[624,96,636,108,5],[420,108,516,348,8],[624,108,636,360,8],[408,120,420,372,8],[612,120,624,360,8],[636,120,744,360,8],[384,132,408,360,8],[744,132,756,372,8],[348,144,384,360,8],[516,144,612,300,6],[756,144,804,372,8],[324,156,348,360,8],[804,156,816,372,8],[312,168,324,360,8],[816,168,828,372,8],[300,192,312,360,8],[288,204,300,360,8],[276,252,288,360,8],[264,288,276,360,8],[828,288,840,372,8],[516,300,612,516,6.4],[420,348,432,360,8],[432,348,516,576,6.4],[420,360,432,456,6.4],[612,360,660,384,6.4],[660,360,744,372,8],[612,384,648,516,6.4],[648,420,672,456,6.4],[36,444,48,756,11],[204,444,216,768,11],[48,456,60,756,11],[168,456,204,768,11],[216,456,240,768,11],[336,456,432,768,11],[648,456,660,516,6.4],[660,456,720,516,5.2],[24,468,36,756,11],[60,468,168,756,11],[240,468,336,768,11],[720,468,792,516,5.2],[792,480,948,516,5.2],[12,492,24,756,11],[948,504,960,552,5.2],[516,516,600,576,6.4],[600,516,888,552,10],[888,516,948,552,5.2],[960,516,972,540,5.2],[0,528,12,744,11],[972,528,984,768,10.4],[960,540,972,768,10.4],[984,540,1044,768,10.4],[600,552,864,768,10],[864,552,960,768,10.4],[1044,552,1056,768,10.4],[1056,564,1092,768,10.4],[432,576,600,864,6.6],[1092,612,1104,768,10.4],[1104,648,1116,768,10.4],[1116,696,1128,768,10.4],[1128,744,1140,768,10.4],[120,756,168,768,11],[120,768,132,780,11],[132,768,360,852,6.2],[360,768,432,852,6.6],[600,768,1140,792,7],[120,780,132,804,6.2],[600,792,1128,888,7],[1128,828,1140,924,7],[180,852,360,864,6.2],[360,852,372,864,6.6],[180,864,312,888,4],[312,864,360,876,6.2],[1140,864,1152,924,7],[312,876,324,888,4],[192,888,312,912,4],[612,888,1128,900,7],[1152,888,1164,924,7],[720,900,1128,912,7],[204,912,216,924,4],[240,912,312,924,4],[720,912,840,948,4.2],[840,912,852,924,7],[900,912,1128,924,7],[840,924,852,948,4.2]];
const X0=0,X1=1164,Y0=84,Y1=948;
// the other wings are cut back where they reach into the gym box, so nothing stands inside the room
const cutOut=(b,G)=>{ if(b[2]<=G[0]||b[0]>=G[2]||b[3]<=G[1]||b[1]>=G[3]) return [b]; const o=[];
  if(b[1]<G[1]) o.push([b[0],b[1],b[2],G[1],b[4]]); if(b[3]>G[3]) o.push([b[0],G[3],b[2],b[3],b[4]]);
  const y0=Math.max(b[1],G[1]), y1=Math.min(b[3],G[3]); if(b[0]<G[0]) o.push([b[0],y0,G[0],y1,b[4]]); if(b[2]>G[2]) o.push([G[2],y0,b[2],y1,b[4]]); return o; };
const PLAN=(G=>PLAN0.filter(b=>!(b[4]>=10.9&&b[2]<=440)).flatMap(b=>cutOut(b,G)).concat([G]))(gymBox()), GYM=PLAN.length-1;
const T={ids:[],sig:'',fit:null,tries:0,at:0,ver:0,keys:null,ll:null,bb:null};
const N=48;
let off=false; try{ off=localStorage.getItem('ydTrjOff')==='1'; }catch(e){}

const rkey=r=>r.length+':'+r[0][0]+','+r[0][1];                     // a ring as the map tiles give it (js/enh/buildings.js skips these)
// the gym: one tall box made of the plan's 11 m wings on its left (photo px x0,y0,x1,y1); drawn as that single box, so its walls
// are exactly the walls of the room you walk into
function gymBox(){ let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const b of PLAN0) if(b[4]>=10.9&&b[2]<=440){ x0=Math.min(x0,b[0]); y0=Math.min(y0,b[1]); x1=Math.max(x1,b[2]); y1=Math.max(y1,b[3]); } return [x0,y0,x1,y1,11]; }
const inPoly=(p,x,y)=>{ let c=false; for(let i=0,j=p.length-1;i<p.length;j=i++){ const a=p[i],b=p[j]; if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])) c=!c; } return c; };
function hull(pts){ pts=pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]); if(pts.length<3) return pts;
  const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]), lo=[], up=[];
  for(const p of pts){ while(lo.length>1&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0) lo.pop(); lo.push(p); }
  for(let i=pts.length-1;i>=0;i--){ const p=pts[i]; while(up.length>1&&cr(up[up.length-2],up[up.length-1],p)<=0) up.pop(); up.push(p); }
  lo.pop(); up.pop(); return lo.concat(up); }
function minRect(pts){ const H=hull(pts); let best=null;
  for(let i=0;i<H.length;i++){ const a=H[i], b=H[(i+1)%H.length], L=Math.hypot(b[0]-a[0],b[1]-a[1]); if(L<1e-6) continue;
    const ux=(b[0]-a[0])/L, uy=(b[1]-a[1])/L; let u0=1e9,u1=-1e9,v0=1e9,v1=-1e9;
    for(const p of H){ const u=p[0]*ux+p[1]*uy, v=-p[0]*uy+p[1]*ux; if(u<u0)u0=u; if(u>u1)u1=u; if(v<v0)v0=v; if(v>v1)v1=v; }
    const A=(u1-u0)*(v1-v0); if(!best||A<best.A) best={A,ux,uy,u0,u1,v0,v1}; }
  if(!best) return null;
  const um=(best.u0+best.u1)/2, vm=(best.v0+best.v1)/2;
  return {cx:best.ux*um-best.uy*vm, cy:best.uy*um+best.ux*vm, ux:best.ux, uy:best.uy, vx:-best.uy, vy:best.ux, W:best.u1-best.u0, H:best.v1-best.v0}; }

// the 8 ways the plan can sit in the rectangle: transpose, flip across, flip up
const TR=[]; for(let t=0;t<2;t++) for(let fx=0;fx<2;fx++) for(let fy=0;fy<2;fy++) TR.push([t,fx,fy]);
const tf=(u,v,[t,fx,fy])=>{ if(t){ const q=u; u=v; v=q; } return [fx?1-u:u, fy?1-v:v]; };
const norm=b=>[(b[0]-X0)/(X1-X0),1-(b[3]-Y0)/(Y1-Y0),(b[2]-X0)/(X1-X0),1-(b[1]-Y0)/(Y1-Y0)];   // x0,y0(south),x1,y1(north) in 0..1

function fit(P,kx,ky){
  /* the school's own pieces only (owner 2026-11-24: cars drove through the school): OpenFreeMap gives the school and the whole
     subdivision round it one id, and a house 130 m away once stretched the plan over the street and the bus loop. So: pieces
     of at least ~1800 m2 near the school point (townhouse rows nearby are ~1000), plus any smaller piece touching one of them (a tile cut or an annex). */
  const ids=new Set(), keys=new Set(), cand=[];
  const fs=map.querySourceFeatures(bSrc,{sourceLayer:'building'});
  for(const f of fs){ if(f.id==null) continue; const g=f.geometry; if(!g) continue;
    const pls=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
    for(const pl of pls){ const r=pl[0]; if(!r||r.length<4) continue;
      const ring=r.map(q=>[(q[0]-P[0])*kx,(q[1]-P[1])*ky]); let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9; for(const q of ring){ x0=Math.min(x0,q[0]); x1=Math.max(x1,q[0]); y0=Math.min(y0,q[1]); y1=Math.max(y1,q[1]); }
      if(Math.hypot((x0+x1)/2,(y0+y1)/2)>170) continue;
      let A=0; for(let i=0,j=ring.length-1;i<ring.length;j=i++) A+=(ring[j][0]-ring[i][0])*(ring[j][1]+ring[i][1]);
      cand.push({id:f.id,ring,bb:[x0,y0,x1,y1],A:Math.abs(A/2),key:rkey(r),on:false}); } }
  for(const c of cand) if(c.A>=1800) c.on=true;
  for(let more=true,it=0;more&&it<6;it++){ more=false;
    for(const c of cand){ if(c.on||c.A<40) continue; const b=c.bb;
      if(cand.some(o=>o.on&&b[0]<o.bb[2]+1&&b[2]>o.bb[0]-1&&b[1]<o.bb[3]+1&&b[3]>o.bb[1]-1)){ c.on=true; more=true; } } }
  const polys=[]; let pts=[];
  const sbb=[1e9,1e9,-1e9,-1e9];
  for(const c of cand) if(c.on){ ids.add(c.id); keys.add(c.key); polys.push(c.ring); pts=pts.concat(c.ring); sbb[0]=Math.min(sbb[0],c.bb[0]); sbb[1]=Math.min(sbb[1],c.bb[1]); sbb[2]=Math.max(sbb[2],c.bb[2]); sbb[3]=Math.max(sbb[3],c.bb[3]); }
  const sll=[P[0]+(sbb[0]-3)/kx,P[1]+(sbb[1]-3)/ky,P[0]+(sbb[2]+3)/kx,P[1]+(sbb[3]+3)/ky];     // the school's pieces lie in here (lng/lat, 3 m spare)
  if(polys.length<1||pts.length<4) return null;
  const R=minRect(pts); if(!R||R.W<40||R.H<40||R.W>400||R.H>400) return null;
  const real=new Uint8Array(N*N); let nReal=0;
  for(let i=0;i<N;i++) for(let j=0;j<N;j++){ const u=(i+.5)/N-.5, v=(j+.5)/N-.5, x=R.cx+R.ux*u*R.W+R.vx*v*R.H, y=R.cy+R.uy*u*R.W+R.vy*v*R.H;
    for(const p of polys) if(inPoly(p,x,y)){ real[i*N+j]=1; nReal++; break; } }
  const fits=[];
  for(const T8 of TR){ const pl=new Uint8Array(N*N); let nPl=0;
    for(const b of PLAN){ const n=norm(b); for(let i=0;i<N;i++) for(let j=0;j<N;j++){ if(pl[i*N+j]) continue; const [u,v]=tf((i+.5)/N,(j+.5)/N,T8);
      if(u>=n[0]&&u<=n[2]&&v>=n[1]&&v<=n[3]){ pl[i*N+j]=1; nPl++; } } }
    let inter=0; for(let k=0;k<N*N;k++) if(pl[k]&&real[k]) inter++;
    fits.push({iou:inter/Math.max(1,nPl+nReal-inter),T8}); }
  /* two ways round often fit almost equally well; then the one with the gym to the south-west wins (the gym and music suite
     are the school's south-west wing) */
  const top=Math.max(...fits.map(f=>f.iou)), G=gymBox(), gu=((G[0]+G[2])/2-X0)/(X1-X0), gv=1-((G[1]+G[3])/2-Y0)/(Y1-Y0);
  let best=null;
  for(const f of fits){ if(f.iou<top-.04) continue; const [t,fx,fy]=f.T8, [u,v]=t?[fy?1-gv:gv,fx?1-gu:gu]:[fx?1-gu:gu,fy?1-gv:gv], uu=u-.5, vv=v-.5;
    const x=R.ux*uu*R.W+R.vx*vv*R.H, y=R.uy*uu*R.W+R.vy*vv*R.H; f.sw=-(x+y);
    if(!best||f.sw>best.sw) best=f; }
  return {R,ids:[...ids],keys,sll,iou:best.iou,T8:best.T8,nReal}; }

function toLL(F,P,kx,ky,px,py){        // a photo-plan point -> lng/lat, through the fitted rectangle
  const [t,fx,fy]=F.T8, pu=(px-X0)/(X1-X0), pv=1-(py-Y0)/(Y1-Y0);
  const [u,v]=t?[fy?1-pv:pv,fx?1-pu:pu]:[fx?1-pu:pu,fy?1-pv:pv], uu=u-.5, vv=v-.5;
  const x=F.R.cx+F.R.ux*uu*F.R.W+F.R.vx*vv*F.R.H, y=F.R.cy+F.R.uy*uu*F.R.W+F.R.vy*vv*F.R.H;
  return [+(P[0]+x/kx).toFixed(7),+(P[1]+y/ky).toFixed(7)]; }
function polysM(F){                     // the plan's wings as rings in metres (from the school point), with their heights
  const out=[], [t,fx,fy]=F.T8;
  const back=(pu,pv)=>t?[fy?1-pv:pv,fx?1-pu:pu]:[fx?1-pu:pu,fy?1-pv:pv];    // the plan point -> the rectangle point (undoing tf)
  PLAN.forEach((b,k)=>{ const n=norm(b), corners=[[n[0],n[1]],[n[2],n[1]],[n[2],n[3]],[n[0],n[3]]];
    const ring=corners.map(([pu,pv])=>{ const [u,v]=back(pu,pv), uu=u-.5, vv=v-.5;
      return [F.R.cx+F.R.ux*uu*F.R.W+F.R.vx*vv*F.R.H, F.R.cy+F.R.uy*uu*F.R.W+F.R.vy*vv*F.R.H]; });
    out.push({ring,h:b[4],b}); });
  return out; }
function polysOf(F,P,kx,ky){            // ... as lng/lat rings
  return polysM(F).map(o=>{ const ring=o.ring.map(([x,y])=>[+(P[0]+x/kx).toFixed(7),+(P[1]+y/ky).toFixed(7)]); ring.push(ring[0]); return {ring,h:o.h}; }); }

/* the walls' details, after the owner's front photo (a Junior High of the same design): dark red-brick base, a red band under the
   roof edge, rows of small square windows high on the walls (two rows on the two-storey wings), and three recessed entrances with
   brick canopies and red doors on the parking-lot side. Drawn flat on the faces of the wings, and only where no other wing
   covers the wall, so nothing floats. */
const BASE='#7a4a38', BAND='#8b3a32', GLASS='#1f2a36', RED='#8a1f26', DARK='#3a1a1a', BRICKC='#b88862';
const PORTALS=[[480,860,'main'],[655,912,'aud']];      // [photo x, y on a south wall, kind]: found among the wings at run time
function details(F,P,kx,ky){
  const W=polysM(F), feats=[], ll=([x,y])=>[+(P[0]+x/kx).toFixed(7),+(P[1]+y/ky).toFixed(7)];
  const area=r=>{ let a=0; for(let i=0,j=r.length-1;i<r.length;j=i++) a+=(r[j][0]-r[i][0])*(r[j][1]+r[i][1]); return a; };
  const cover=(x,y,self)=>{ let h=0; W.forEach((o,k)=>{ if(k!==self&&o.h>h&&inPoly(o.ring,x,y)) h=o.h; }); return h; };
  const put=(a,u,n,s0,s1,o0,o1,b,h,c)=>{ if(s1-s0<.02||h-b<.02) return;           // a flat box on a wall: along s0..s1, out o0..o1, up b..h
    const P4=[[s0,o0],[s1,o0],[s1,o1],[s0,o1]].map(([s,o])=>ll([a[0]+u[0]*s+n[0]*o,a[1]+u[1]*s+n[1]*o])); P4.push(P4[0]);
    feats.push({type:'Feature',properties:{c,b,h,g:curG},geometry:{type:'Polygon',coordinates:[P4]}}); };
  let curG=0;                                                        // 1 on the gym's own pieces (hidden while you're inside it)
  W.forEach((w,k)=>{ const r=w.ring, ccw=area(r)<0, H=w.h; curG=k===GYM?1:0;
    for(let e=0;e<4;e++){ const a=r[e], b=r[(e+1)%4], L=Math.hypot(b[0]-a[0],b[1]-a[1]); if(L<6) continue;
      const u=[(b[0]-a[0])/L,(b[1]-a[1])/L], n=ccw?[u[1],-u[0]]:[-u[1],u[0]];
      const free=(s,hh)=>{ const c=cover(a[0]+u[0]*s+n[0]*.8,a[1]+u[1]*s+n[1]*.8,k); return c<hh-.3; };   // nothing taller (or as tall) in front of that bit of wall
      for(let s=0;s<L;s+=2){ const s1=Math.min(L,s+2), m=(s+s1)/2;
        if(free(m,.5)) put(a,u,n,s,s1,.02,.07,0,.9,BASE);                                              // the dark red-brick base
        if(free(m,H-.5)) put(a,u,n,s,s1,.02,.08,H-.65,H-.3,BAND); }                                    // the red band under the roof edge
      if(k===GYM) continue;                                                                          // the gym's windows and doors: from its room record, below
      const cnt=Math.max(1,Math.floor((L-3.6)/3.8)+1), step=cnt>1?(L-3.6)/(cnt-1):0;
      const rows=H<6?[[1.5,2.6]]:H<9?[[1.4,2.5],[4.6,5.7]]:[[H-3.3,H-2.3]];
      for(let i=0;i<cnt;i++){ const s=cnt>1?1.8+i*step:L/2;
        for(const [wb,wt] of rows) if(wt<H-.4&&free(s,wb+.1)) put(a,u,n,s-.5,s+.5,.02,.09,wb,wt,GLASS); }
      if(H<9&&L>=24) for(const f of [.3,.72]) if(free(L*f,2.8)&&free(L*f-1.2,2.8)&&free(L*f+1.2,2.8)){ const q=L*f;      // plain doors flush in the brick, along the longer low walls
        put(a,u,n,q-1.1,q+1.1,.02,.07,0,2.65,DARK); for(const z of [-1,1]){ put(a,u,n,z<0?q-1:q+.04,z<0?q-.04:q+1,.07,.12,.05,2.55,RED); put(a,u,n,z<0?q-.88:q+.16,z<0?q-.16:q+.88,.12,.15,.45,2.35,GLASS); } }
      if(H>=10&&L>20) for(const f of [.08,.14]) if(free(L*f,3)) put(a,u,n,L*f-.2,L*f+.2,.02,.09,2.2,7.4,GLASS);   // the tall slit windows at a gym's end
    } });
  curG=0;
  for(const [px,py,kind] of PORTALS){ let wi=-1, f=0; PLAN.forEach((b,k)=>{ if(Math.abs(b[3]-py)<30&&px>=b[0]+10&&px<=b[2]-10&&b[2]-b[0]>=50&&(wi<0||Math.abs(b[3]-py)<Math.abs(PLAN[wi][3]-py))){ wi=k; f=(px-b[0])/(b[2]-b[0]); } });
    const w=W[wi]; if(!w) continue; const r=w.ring, ccw=area(r)<0, a=r[0], b=r[1], L=Math.hypot(b[0]-a[0],b[1]-a[1]), u=[(b[0]-a[0])/L,(b[1]-a[1])/L], n=ccw?[u[1],-u[0]]:[-u[1],u[0]], s=L*f;
    if(cover(a[0]+u[0]*s+n[0]*2.8,a[1]+u[1]*s+n[1]*2.8,wi)>0) continue;                              // something already stands there
    const hw=kind==='main'?3.2:2.6, hh=kind==='main'?4.6:4, D=2.4;
    // a covered entrance like the photo's: two brick piers and a roof slab over open space, the red doors sit in the brick wall itself
    put(a,u,n,s-hw,s-hw+.8,.05,D,0,hh,BRICKC); put(a,u,n,s+hw-.8,s+hw,.05,D,0,hh,BRICKC);            // the piers
    put(a,u,n,s-hw,s+hw,.05,D,hh-.9,hh,BRICKC); put(a,u,n,s-hw,s+hw,.05,D+.02,hh,hh+.25,'#2c2e34');    // the canopy and its dark roof
    put(a,u,n,s-hw,s+hw,D-.05,D+.03,hh-.5,hh-.15,BAND);                                                 // red band on its edge
    put(a,u,n,s-hw+.8,s+hw-.8,.02,.06,0,2.9,DARK);                                                      // the dark recess on the wall
    for(const z of [-1,1]){ put(a,u,n,z<0?s-1.45:s+.1,z<0?s-.1:s+1.45,.06,.12,.05,2.65,RED); put(a,u,n,z<0?s-1.3:s+.25,z<0?s-.25:s+1.3,.12,.16,.45,2.45,GLASS); }   // two red glass doors flush on the wall
    put(a,u,n,s-hw+.9,s+hw-.9,.06,.12,2.95,3.5,GLASS);                                                  // a window over them
  }
  // the gym's entrances and windows, from the same record the room is built from (js/enh/walk.js), so inside and outside match:
  // each door a recessed bay under a brick canopy with red-framed glass doors (owner 2026-11-24, photo of the gym wall)
  curG=1;
  safe('trj gym doors',()=>{ const G=T.rec; if(!G) return; const gx=(G.cx-P[0])*kx, gy=(G.cy-P[1])*ky, q=G.p;
    const edge=i=>{ const A=q[i], B=q[(i+1)%q.length], L=Math.hypot(B[0]-A[0],B[1]-A[1]), u=[(B[0]-A[0])/L,(B[1]-A[1])/L]; return {a:[gx+A[0],gy+A[1]],u,n:[u[1],-u[0]]}; };
    for(const d of G.doors){ const {a,u,n}=edge(d.ei), c=(d.s0+d.s1)/2, w=(d.s1-d.s0)/2, hw=w+1.1, hh=w>1.2?3.8:3.4, D=1.5;
      put(a,u,n,c-hw,c+hw,-.3,.06,0,2.8,DARK);
      put(a,u,n,c-hw,c-hw+.5,.02,D,0,hh,BRICKC); put(a,u,n,c+hw-.5,c+hw,.02,D,0,hh,BRICKC);
      put(a,u,n,c-hw,c+hw,.02,D,hh-.5,hh,BRICKC); put(a,u,n,c-hw,c+hw,D-.04,D+.02,hh-.5,hh-.2,BAND);
      for(const z of [-1,1]){ const l0=z<0?c-w:c+.03, l1=z<0?c-.03:c+w;                                  // the pair of red-framed glass doors, closed (inside, the room's own leaves swing)
        put(a,u,n,l0,l1,.06,.12,.05,2.2,RED); put(a,u,n,l0+.1,l1-.1,.12,.16,.3,2.05,GLASS); } }
    for(const w of G.win){ const {a,u,n}=edge(w.ei);
      put(a,u,n,w.s0-.1,w.s1+.1,.02,.07,w.b-.1,w.h+.1,DARK); put(a,u,n,w.s0,w.s1,.02,.1,w.b,w.h,GLASS); }
  });
  return feats; }

/* the gym is a room you can walk into (js/enh/walk.js furnishes it from the owner's photos): the big block on the left of the plan,
   with a double door at the entrance the plan puts on its south wall */
function planM(F,px,py){ const [t,fx,fy]=F.T8, pu=(px-X0)/(X1-X0), pv=1-(py-Y0)/(Y1-Y0), [u,v]=t?[fy?1-pv:pv,fx?1-pu:pu]:[fx?1-pu:pu,fy?1-pv:pv], uu=u-.5, vv=v-.5;
  return [F.R.cx+F.R.ux*uu*F.R.W+F.R.vx*vv*F.R.H, F.R.cy+F.R.uy*uu*F.R.W+F.R.vy*vv*F.R.H]; }
function gymRec(F,P,kx,ky){
  const W=polysM(F), G=W[GYM]; if(!G) return null;
  let cx=0,cy=0; for(const q of G.ring){ cx+=q[0]/4; cy+=q[1]/4; }
  let p=G.ring.map(q=>[q[0]-cx,q[1]-cy]); let a=0; for(let i=0,j=p.length-1;i<p.length;j=i++) a+=(p[j][0]-p[i][0])*(p[j][1]+p[i][1]); if(a<0) p.reverse();   // counter-clockwise, as js/enh/stores.js does
  // how tall the school is just outside a spot on the gym's wall (0 = open air): doors and windows go only where nothing else stands
  const cover=(x,y)=>{ let h=0; W.forEach((o,k)=>{ if(k!==GYM&&o.h>h&&inPoly(o.ring,x+cx,y+cy)) h=o.h; }); return h; };
  const E=p.map((A,i)=>{ const B=p[(i+1)%4], L=Math.hypot(B[0]-A[0],B[1]-A[1]), ux=(B[0]-A[0])/L, uy=(B[1]-A[1])/L; return {i,A,L,ux,uy,nx:uy,ny:-ux}; });
  const out=(e,s,o)=>cover(e.A[0]+e.ux*s+e.nx*o,e.A[1]+e.uy*s+e.ny*o);
  const open=(e,s0,s1,hh)=>{ for(let s=s0;s<=s1+.01;s+=Math.max(.5,(s1-s0)/6)) for(const o of [.6,2.6]) if(out(e,Math.max(.3,Math.min(e.L-.3,s)),o)>=hh) return false; return true; };
  const doors=[]; let dk=0;
  const door=(e,c,hw)=>{ const s0=c-hw, s1=c+hw; if(s0<1.5||s1>e.L-1.5||doors.some(d=>d.ei===e.i&&s0<d.s1+3&&s1>d.s0-3)) return false;
    doors.push({ei:e.i,s0,s1,x0:e.A[0]+e.ux*s0,y0:e.A[1]+e.uy*s0,x1:e.A[0]+e.ux*s1,y1:e.A[1]+e.uy*s1,nx:e.nx,ny:e.ny,dk:9.5e8+dk++}); return true; };
  // the main double door, on the wall nearest the plan's gym entrance (or the nearest open bit of it)
  const D=planM(F,75,gymBox()[3]+2), dp=[D[0]-cx,D[1]-cy];
  const dist=e=>Math.abs((dp[0]-e.A[0])*e.uy-(dp[1]-e.A[1])*e.ux);
  const me=E.slice().sort((x,y)=>dist(x)-dist(y))[0], t0=Math.max(4,Math.min(me.L-4,(dp[0]-me.A[0])*me.ux+(dp[1]-me.A[1])*me.uy));
  for(let k=0;k<40;k++){ const c=t0+(k%2?1:-1)*Math.ceil(k/2)*1.5; if(c>4&&c<me.L-4&&open(me,c-3.4,c+3.4,.1)&&door(me,c,1.5)) break; }
  // a pair of red-framed glass doors at 28% and 72% of both long sides, where they open to the outside (owner's photo)
  const bi=E.reduce((b,e)=>e.L>b.L?e:b,E[0]).i;
  for(const e of [E[bi],E[(bi+2)%4]]) for(const f of [.28,.72]){ const c=e.L*f; if(open(e,c-2.4,c+2.4,.1)) door(e,c,1); }
  // tall windows high on the walls, the same ones inside (cut through the room's walls) and out (drawn on the brick)
  const win=[], wb=4.2, wt=Math.min(G.h-1.8,7.4);
  for(const e of E) for(let s=4.5;s+1.2<e.L-1;s+=8.4){ const s0=s, s1=s+1.2;
    if(!open(e,s0,s1,wb-.2)) continue; if(doors.some(d=>d.ei===e.i&&s0<d.s1+1.2&&s1>d.s0-1.2)) continue;
    win.push({ei:e.i,s0,s1,b:wb,h:wt}); }
  const lng=P[0]+cx/kx, lat=P[1]+cy/ky, xs=p.map(q=>q[0]), ys=p.map(q=>q[1]);
  return {key:'trj-gym',keys:['trj-gym'],id:null,cx:lng,cy:lat,kx,ky,p,h:G.h,house:false,zone:'school',gym:true,win,doors,garages:[],
    bb:[lng+Math.min(...xs)/kx,lat+Math.min(...ys)/ky,lng+Math.max(...xs)/kx,lat+Math.max(...ys)/ky]}; }

function layers(){ if(map.getSource('trj')) return;
  map.addSource('trj',{type:'geojson',data:{type:'FeatureCollection',features:[]},tolerance:0});
  if(typeof blockIds!=='undefined'&&!blockIds.includes('trj-wall')) blockIds.push('trj-wall');           // you can't walk or drive through the school
  const pat=map.hasImage&&map.hasImage('hw-trj');
  const wall={'fill-extrusion-base':0,'fill-extrusion-height':['get','h'],'fill-extrusion-vertical-gradient':false};
  if(pat) wall['fill-extrusion-pattern']='hw-trj'; else wall['fill-extrusion-color']=WALL;
  map.addLayer({id:'trj-wall',type:'fill-extrusion',source:'trj',minzoom:12,paint:wall},map.getLayer('hn-big')?'hn-big':undefined);
  map.addSource('trjd',{type:'geojson',data:{type:'FeatureCollection',features:[]},tolerance:0});
  map.addLayer({id:'trj-roof',type:'fill-extrusion',source:'trj',minzoom:12,paint:{'fill-extrusion-color':ROOF,'fill-extrusion-base':['get','h'],'fill-extrusion-height':['+',['get','h'],.12],'fill-extrusion-vertical-gradient':false}},map.getLayer('hn-big')?'hn-big':undefined);
  map.addLayer({id:'trj-det',type:'fill-extrusion',source:'trjd',minzoom:14,paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-base':['get','b'],'fill-extrusion-height':['get','h'],'fill-extrusion-vertical-gradient':false}},map.getLayer('hn-big')?'hn-big':undefined); }

function apply(F,P,kx,ky){
  T.rec=safe('trj gym',()=>gymRec(F,P,kx,ky))||null;
  const feats=polysOf(F,P,kx,ky).map((o,k)=>({type:'Feature',properties:{h:o.h,g:k===GYM?1:0},geometry:{type:'Polygon',coordinates:[o.ring]}}));
  // the map's own pieces of the school that buildings.js should leave out (only those: the houses sharing their id stay)
  T.keys=F.keys; T.sll=F.sll; T.ll=feats.map(f=>f.geometry.coordinates[0]); let a=1e9,b=1e9,c=-1e9,d=-1e9; for(const r of T.ll) for(const q of r){ a=Math.min(a,q[0]); b=Math.min(b,q[1]); c=Math.max(c,q[0]); d=Math.max(d,q[1]); }
  T.bb=[a,b,c,d]; T.ver++;
  layers(); map.getSource('trj').setData({type:'FeatureCollection',features:feats});
  safe('trj details',()=>map.getSource('trjd').setData({type:'FeatureCollection',features:details(F,P,kx,ky)}));
  HIDE.pin=F.ids.slice(); applyHides(); if(window.ROOFS&&ROOFS.build) safe('trj rebuild',()=>ROOFS.build()); dirty=true; }

function scan(){
  if(off||!styleReady) return;
  let P=null;
  try{ for(const f of map.querySourceFeatures(bSrc,{sourceLayer:'poi'})){ const n=f.properties&&f.properties.name; if(n&&/traughber/i.test(n)&&f.geometry&&f.geometry.type==='Point'){ P=f.geometry.coordinates; break; } } }catch(e){}
  if(!P&&T.P) P=T.P; if(!P) return; T.P=P;
  const kx=111320*Math.cos(P[1]*Math.PI/180), ky=111320;
  if(meters(P[1],P[0],S.lat,S.lng)>700) return;                      // only look when you're near
  const F=fit(P,kx,ky); if(!F) return;
  const sig=F.ids.join(',')+'|'+F.nReal;
  if(sig===T.sig) return; T.sig=sig;                                 // the footprint grew as more tiles loaded: fit again
  if(F.iou<.3){ console.warn('traughber: the plan does not fit the footprint',F.iou); if(!T.fit) return; }
  T.fit=F; apply(F,P,kx,ky); }

onTick(3000,function trjTick(){ safe('traughber',scan); });
// is this ring (lng/lat, as the tiles give it) one of the school's own pieces? Those are drawn by this file instead.
function skip(r){ if(!T.sll||off||!r||!r.length) return false; if(T.keys&&T.keys.has(rkey(r))) return true;
  const b=T.sll; for(const q of r) if(q[0]<b[0]||q[0]>b[2]||q[1]<b[1]||q[1]>b[3]) return false;          // the same piece cut differently by another tile:
  return true; }                                                                                         // wholly inside the school's own area
window.TRJ={skip,ver:()=>T.ver,recs:()=>T.rec?[T.rec]:[],covers:r=>{ const g=T.rec; if(!g||!r||r===g||r.cx==null) return false; const x=(r.cx-g.cx)*g.kx, y=(r.cy-g.cy)*g.ky; let c=false; const P=g.p; for(let i=0,j=P.length-1;i<P.length;j=i++){ if((P[i][1]>y)!==(P[j][1]>y)&&x<(P[j][0]-P[i][0])*(y-P[i][1])/(P[j][1]-P[i][1])+P[i][0]) c=!c; } return c; },hide:on=>{ for(const id of ['trj-wall','trj-roof','trj-det']) if(map.getLayer(id)) map.setFilter(id,on?['!=',['get','g'],1]:null); dirty=true; } /* inside the gym only the gym goes (the room stands in for it); the rest of the school stays outside its windows */,off:()=>{ try{ localStorage.setItem('ydTrjOff','1'); }catch(e){} location.reload(); },on:()=>{ try{ localStorage.removeItem('ydTrjOff'); }catch(e){} location.reload(); },state:T,fit,PLAN};
})();
