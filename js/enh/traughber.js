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
const PLAN=[[528,84,552,132,5],[612,84,624,120,5],[552,96,612,132,5],[420,108,492,348,8],[408,120,420,360,8],[492,120,504,348,8],[612,120,624,132,8],[648,120,744,360,8],[396,132,408,360,8],[744,132,756,372,8],[348,144,372,360,8],[384,144,396,360,8],[504,144,516,348,8],[636,144,648,360,8],[756,144,804,372,8],[324,156,348,348,8],[372,156,384,360,8],[516,156,564,300,6],[624,156,636,360,8],[804,156,816,372,8],[312,168,324,360,8],[564,168,612,300,6],[612,168,624,360,8],[816,168,828,372,8],[300,192,312,360,8],[288,204,300,360,8],[276,252,288,360,8],[264,288,276,360,8],[828,288,840,372,8],[516,300,612,516,6.4],[324,348,336,360,8],[420,348,432,360,8],[432,348,516,360,6.4],[444,360,516,576,6.4],[612,360,660,372,6.4],[660,360,744,372,8],[432,372,444,576,6.4],[612,372,636,384,6.4],[420,384,432,432,6.4],[612,384,624,396,6.4],[648,420,672,432,6.4],[660,432,672,456,6.4],[36,444,48,756,11],[204,444,216,768,11],[612,444,660,516,6.4],[48,456,60,756,11],[168,456,204,768,11],[216,456,240,768,11],[336,456,420,768,11],[660,456,720,516,5.2],[24,468,36,756,11],[60,468,168,756,11],[240,468,336,768,11],[420,468,432,768,11],[720,468,780,516,5.2],[780,480,948,516,5.2],[12,492,24,756,11],[948,504,960,552,5.2],[516,516,600,576,6.4],[600,516,888,552,10],[888,516,948,552,5.2],[960,516,972,540,5.2],[0,528,12,744,11],[996,540,1044,756,10.4],[600,552,864,636,10],[864,552,960,756,10.4],[972,552,996,756,10.4],[1044,552,1056,768,10.4],[960,564,972,756,10.4],[1056,564,1092,768,10.4],[432,576,600,624,6.6],[1092,612,1104,768,10.4],[432,624,552,648,6.6],[576,624,600,636,6.6],[612,636,864,648,10],[432,648,540,864,6.6],[624,648,864,756,10],[1104,648,1116,768,10.4],[540,672,588,696,6.6],[612,672,624,756,10],[540,696,576,864,6.6],[1116,696,1128,768,10.4],[1128,744,1140,768,10.4],[144,756,168,768,11],[576,756,588,768,6.6],[696,756,864,768,10],[864,756,888,768,10.4],[1008,756,1044,768,10.4],[156,768,360,852,6.2],[360,768,432,852,6.6],[144,780,156,852,6.2],[888,780,1128,912,7],[132,792,144,804,6.2],[576,792,600,852,6.6],[624,792,636,900,7],[744,792,888,852,7],[612,804,624,900,7],[636,804,720,888,7],[720,816,732,876,7],[132,828,144,852,6.2],[1128,828,1140,924,7],[204,852,360,864,6.2],[360,852,372,864,6.6],[576,852,588,864,6.6],[768,852,888,864,7],[192,864,312,900,4],[348,864,360,876,6.2],[780,864,888,876,7],[1140,864,1152,924,7],[180,876,192,888,4],[600,876,612,888,7],[792,876,888,912,7],[636,888,708,900,7],[192,900,300,912,4],[720,900,792,912,7],[204,912,216,924,4],[240,912,312,924,4],[720,912,840,948,4.2],[900,912,1128,924,7],[1152,912,1164,924,7],[840,936,852,948,4.2]];
const X0=0,X1=1164,Y0=84,Y1=948;
const T={ids:[],sig:'',fit:null,tries:0,at:0};
const N=48;
let off=false; try{ off=localStorage.getItem('ydTrjOff')==='1'; }catch(e){}

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
  const polys=[], ids=new Set(); let pts=[];
  const fs=map.querySourceFeatures(bSrc,{sourceLayer:'building'});
  for(const f of fs){ if(f.id==null) continue; const g=f.geometry; if(!g) continue;
    const pls=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
    for(const pl of pls){ const r=pl[0]; if(!r||r.length<4) continue;
      const ring=r.map(q=>[(q[0]-P[0])*kx,(q[1]-P[1])*ky]); let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9; for(const q of ring){ x0=Math.min(x0,q[0]); x1=Math.max(x1,q[0]); y0=Math.min(y0,q[1]); y1=Math.max(y1,q[1]); }
      const w=x1-x0, h=y1-y0; if(Math.hypot((x0+x1)/2,(y0+y1)/2)>170||w*h<260) continue;       // big buildings round the school point only
      ids.add(f.id); polys.push(ring); pts=pts.concat(ring); } }
  if(polys.length<1||pts.length<4) return null;
  const R=minRect(pts); if(!R||R.W<40||R.H<40||R.W>400||R.H>400) return null;
  const real=new Uint8Array(N*N); let nReal=0;
  for(let i=0;i<N;i++) for(let j=0;j<N;j++){ const u=(i+.5)/N-.5, v=(j+.5)/N-.5, x=R.cx+R.ux*u*R.W+R.vx*v*R.H, y=R.cy+R.uy*u*R.W+R.vy*v*R.H;
    for(const p of polys) if(inPoly(p,x,y)){ real[i*N+j]=1; nReal++; break; } }
  let best=null;
  for(const T8 of TR){ const pl=new Uint8Array(N*N); let nPl=0;
    for(const b of PLAN){ const n=norm(b); for(let i=0;i<N;i++) for(let j=0;j<N;j++){ if(pl[i*N+j]) continue; const [u,v]=tf((i+.5)/N,(j+.5)/N,T8);
      if(u>=n[0]&&u<=n[2]&&v>=n[1]&&v<=n[3]){ pl[i*N+j]=1; nPl++; } } }
    let inter=0; for(let k=0;k<N*N;k++) if(pl[k]&&real[k]) inter++;
    const iou=inter/Math.max(1,nPl+nReal-inter); if(!best||iou>best.iou) best={iou,T8}; }
  return {R,ids:[...ids],iou:best.iou,T8:best.T8,nReal}; }

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
const PORTALS=[[480,860,'main'],[655,912,'aud'],[75,772,'gym']];      // [photo x, y on a south wall, kind]: found among the wings at run time
function details(F,P,kx,ky){
  const W=polysM(F), feats=[], ll=([x,y])=>[+(P[0]+x/kx).toFixed(7),+(P[1]+y/ky).toFixed(7)];
  const area=r=>{ let a=0; for(let i=0,j=r.length-1;i<r.length;j=i++) a+=(r[j][0]-r[i][0])*(r[j][1]+r[i][1]); return a; };
  const cover=(x,y,self)=>{ let h=0; W.forEach((o,k)=>{ if(k!==self&&o.h>h&&inPoly(o.ring,x,y)) h=o.h; }); return h; };
  const put=(a,u,n,s0,s1,o0,o1,b,h,c)=>{ if(s1-s0<.02||h-b<.02) return;           // a flat box on a wall: along s0..s1, out o0..o1, up b..h
    const P4=[[s0,o0],[s1,o0],[s1,o1],[s0,o1]].map(([s,o])=>ll([a[0]+u[0]*s+n[0]*o,a[1]+u[1]*s+n[1]*o])); P4.push(P4[0]);
    feats.push({type:'Feature',properties:{c,b,h},geometry:{type:'Polygon',coordinates:[P4]}}); };
  W.forEach((w,k)=>{ const r=w.ring, ccw=area(r)<0, H=w.h;
    for(let e=0;e<4;e++){ const a=r[e], b=r[(e+1)%4], L=Math.hypot(b[0]-a[0],b[1]-a[1]); if(L<6) continue;
      const u=[(b[0]-a[0])/L,(b[1]-a[1])/L], n=ccw?[u[1],-u[0]]:[-u[1],u[0]];
      const free=(s,hh)=>{ const c=cover(a[0]+u[0]*s+n[0]*.8,a[1]+u[1]*s+n[1]*.8,k); return c<hh-.3; };   // nothing taller (or as tall) in front of that bit of wall
      for(let s=0;s<L;s+=2){ const s1=Math.min(L,s+2), m=(s+s1)/2;
        if(free(m,.5)) put(a,u,n,s,s1,.02,.07,0,.9,BASE);                                              // the dark red-brick base
        if(free(m,H-.5)) put(a,u,n,s,s1,.02,.08,H-.65,H-.3,BAND); }                                    // the red band under the roof edge
      const cnt=Math.max(1,Math.floor((L-3.6)/3.8)+1), step=cnt>1?(L-3.6)/(cnt-1):0;
      const rows=H<6?[[1.5,2.6]]:H<9?[[1.4,2.5],[4.6,5.7]]:[[H-3.3,H-2.3]];
      for(let i=0;i<cnt;i++){ const s=cnt>1?1.8+i*step:L/2;
        for(const [wb,wt] of rows) if(wt<H-.4&&free(s,wb+.1)) put(a,u,n,s-.5,s+.5,.02,.09,wb,wt,GLASS); }
      if(H>=10&&L>20) for(const f of [.08,.14]) if(free(L*f,3)) put(a,u,n,L*f-.2,L*f+.2,.02,.09,2.2,7.4,GLASS);   // the tall slit windows at a gym's end
    } });
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
  return feats; }

function layers(){ if(map.getSource('trj')) return;
  map.addSource('trj',{type:'geojson',data:{type:'FeatureCollection',features:[]},tolerance:0});
  const pat=map.hasImage&&map.hasImage('hw-trj');
  const wall={'fill-extrusion-base':0,'fill-extrusion-height':['get','h'],'fill-extrusion-vertical-gradient':false};
  if(pat) wall['fill-extrusion-pattern']='hw-trj'; else wall['fill-extrusion-color']=WALL;
  map.addLayer({id:'trj-wall',type:'fill-extrusion',source:'trj',minzoom:12,paint:wall},map.getLayer('hn-big')?'hn-big':undefined);
  map.addSource('trjw',{type:'geojson',data:{type:'FeatureCollection',features:[]},tolerance:0});
  map.addSource('trjd',{type:'geojson',data:{type:'FeatureCollection',features:[]},tolerance:0});
  map.addLayer({id:'trj-roof',type:'fill-extrusion',source:'trj',minzoom:12,paint:{'fill-extrusion-color':ROOF,'fill-extrusion-base':['get','h'],'fill-extrusion-height':['+',['get','h'],.12],'fill-extrusion-vertical-gradient':false}},map.getLayer('hn-big')?'hn-big':undefined);
  map.addLayer({id:'trj-win',type:'fill-extrusion',source:'trjw',minzoom:12,paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-base':['get','b'],'fill-extrusion-height':['get','h'],'fill-extrusion-vertical-gradient':false}},map.getLayer('hn-big')?'hn-big':undefined);
  map.addLayer({id:'trj-det',type:'fill-extrusion',source:'trjd',minzoom:14,paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-base':['get','b'],'fill-extrusion-height':['get','h'],'fill-extrusion-vertical-gradient':false}},map.getLayer('hn-big')?'hn-big':undefined); }

function apply(F,P,kx,ky){
  const feats=polysOf(F,P,kx,ky).map(o=>({type:'Feature',properties:{h:o.h},geometry:{type:'Polygon',coordinates:[o.ring]}}));
  layers(); map.getSource('trj').setData({type:'FeatureCollection',features:feats});
  safe('trj details',()=>map.getSource('trjd').setData({type:'FeatureCollection',features:details(F,P,kx,ky)}));
  map.getSource('trjw').setData({type:'FeatureCollection',features:winsOf(F,P,kx,ky).map(o=>({type:'Feature',properties:{b:o.b,h:o.h,c:o.c},geometry:{type:'Polygon',coordinates:[o.ring]}}))});
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
window.TRJ={off:()=>{ try{ localStorage.setItem('ydTrjOff','1'); }catch(e){} location.reload(); },on:()=>{ try{ localStorage.removeItem('ydTrjOff'); }catch(e){} location.reload(); },state:T,fit,PLAN};
})();
