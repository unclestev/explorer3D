/* More realistic buildings (owner's choice 2026-09-30: roofs in their own colours, pitched roofs on nearby houses,
   equipment on commercial roofs). Everything is built from the map's own building footprints; nothing is downloaded.
   1. Roof caps — a thin layer on top of every building (vector layer, all distances): shingle colours on most
      house-sized buildings, light grey on the rest and on anything taller than 12 m. Cheap; on in battery saver.
   2. Pitched roofs on houses near the car — within 320 m (200 m in battery saver), nearest 240 (110 in saver).
      Rectangular houses get a gable or hip roof on their oriented outline with a small overhang; other shapes get a
      hip roof made by shrinking the real outline inward. Built from stacked slices (8, or 5 in saver), so up close
      the slopes show small steps. The map data doesn't say what shape real roofs are, so the shape is a guess.
   3. Rooftop units (air conditioners, vents) on stores, schools and offices near the car.
   Houses = up to 12 m tall and 25–450 m²; split across map tiles or "building:part" pieces stay flat-roofed.
   Smashed buildings drop their roof too. Pure fill-extrusions, rebuilt only after moving ~120 m or when tiles load. */
(()=>{
'use strict';
const {safe,onReady,onTick}=YD;
const SHINGLE=['#4b4d52','#5b4a3c','#3f4654','#6a5c4d','#55585e','#4a3f38'], FLAT=['#c9ccd0','#d8d9d6'], UNIT=['#b8bcc0','#a7acb1','#c9cccf','#8e949a'];
const H=['coalesce',['get','render_height'],['get','height'],6];
const NID=['%',['abs',['to-number',['id'],0]],8];
const R={at:null,t:0,n:-1,tiles:false,last:''};

/* ---------- 1. roof caps (vector layers) ---------- */
function capColour(h){ return ['case',['>',h,12],['match',['%',NID,2],0,FLAT[0],FLAT[1]],
  ['match',NID,0,SHINGLE[0],1,SHINGLE[1],2,SHINGLE[2],3,SHINGLE[3],4,SHINGLE[4],5,SHINGLE[5],6,FLAT[0],FLAT[1]]]; }
const jsColour=(id,h)=>{ const n=Math.abs(Number(id)||0)%8; return h>12?FLAT[n%2]:n<6?SHINGLE[n]:FLAT[n-6]; };
function addCaps(){
  const before=map.getLayer('hn-big')?'hn-big':undefined;
  const base=map.getLayer('building-3d'), filt=base?map.getFilter('building-3d'):null;
  if(!map.getLayer('roof-cap')){
    const L={id:'roof-cap',type:'fill-extrusion',source:bSrc,'source-layer':'building',minzoom:14,
      paint:{'fill-extrusion-color':capColour(H),'fill-extrusion-base':H,'fill-extrusion-height':['+',H,.35],'fill-extrusion-vertical-gradient':false}};
    const of=origFilters['building-3d']; if(of) L.filter=of;
    map.addLayer(L,before);
    // smashing a building hides its roof cap too (js/game.js destroyBuilding filters every layer in hideIds)
    hideIds.push('roof-cap'); origFilters['roof-cap']=of||null;
    if(destroyed.length){ const f=['!',['in',['id'],['literal',destroyed.slice()]]]; safe('cap filter',()=>map.setFilter('roof-cap',of?['all',of,f]:f)); }
  }
  if(map.getSource('rebuilt')&&!map.getLayer('rebuilt-roof'))           // roofs for redrawn neighbours of a smashed block
    map.addLayer({id:'rebuilt-roof',type:'fill-extrusion',source:'rebuilt',
      paint:{'fill-extrusion-color':capColour(['get','h']),'fill-extrusion-base':['get','h'],'fill-extrusion-height':['+',['get','h'],.35],'fill-extrusion-vertical-gradient':false}},before);
  if(!map.getSource('roofs')){
    map.addSource('roofs',{type:'geojson',data:{type:'FeatureCollection',features:[]},maxzoom:20,tolerance:0,buffer:16});
    map.addLayer({id:'roof-3d',type:'fill-extrusion',source:'roofs',
      paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-base':['get','b'],'fill-extrusion-height':['get','h'],'fill-extrusion-vertical-gradient':false}},before);
  }
}

/* ---------- geometry helpers (local metres around a reference point) ---------- */
function hash(a,b){ let h=(a*374761393+b*668265263)>>>0; h=Math.imul(h^(h>>>13),1274126177)>>>0; return ((h^(h>>>16))>>>0)/4294967296; }
const area=p=>{ let s=0; for(let i=0,j=p.length-1;i<p.length;j=i++) s+=(p[j][0]+p[i][0])*(p[j][1]-p[i][1]); return -s/2; };   // >0 = counter-clockwise
function clean(ring){                                             // drop the closing point, duplicates and straight-through vertices
  let p=ring.slice(0,ring.length-1).filter((q,i,a)=>{ const r=a[(i+a.length-1)%a.length]; return Math.hypot(q[0]-r[0],q[1]-r[1])>.05; });
  for(let pass=0;pass<2&&p.length>3;pass++) p=p.filter((q,i,a)=>{ const r=a[(i+a.length-1)%a.length], s=a[(i+1)%a.length];
    const ax=q[0]-r[0], ay=q[1]-r[1], bx=s[0]-q[0], by=s[1]-q[1], c=(ax*by-ay*bx)/(Math.hypot(ax,ay)*Math.hypot(bx,by)||1);
    return Math.abs(c)>.06; });
  return p;
}
function obb(p){                                                  // smallest box aligned with one of the outline's edges
  let best=null;
  for(let i=0;i<p.length;i++){ const a=p[i], b=p[(i+1)%p.length], ang=Math.atan2(b[1]-a[1],b[0]-a[0]), c=Math.cos(ang), s=Math.sin(ang);
    let u0=1e9,u1=-1e9,v0=1e9,v1=-1e9;
    for(const q of p){ const u=q[0]*c+q[1]*s, v=-q[0]*s+q[1]*c; if(u<u0)u0=u; if(u>u1)u1=u; if(v<v0)v0=v; if(v>v1)v1=v; }
    const A=(u1-u0)*(v1-v0); if(!best||A<best.A) best={A,c,s,u0,u1,v0,v1}; }
  if(best.u1-best.u0<best.v1-best.v0){ const b=best;               // make u the long axis
    best={A:b.A,c:-b.s,s:b.c,u0:b.v0,u1:b.v1,v0:-b.u1,v1:-b.u0}; }
  return best;
}
function boxRing(B,u0,u1,v0,v1){ return [[u0,v0],[u1,v0],[u1,v1],[u0,v1]].map(([u,v])=>[u*B.c-v*B.s,u*B.s+v*B.c]); }
function inset(p,d){                                              // move every edge inward by d (counter-clockwise outline)
  const n=p.length, out=[];
  for(let i=0;i<n;i++){ const a=p[(i+n-1)%n], b=p[i], c=p[(i+1)%n];
    let e1x=b[0]-a[0], e1y=b[1]-a[1], e2x=c[0]-b[0], e2y=c[1]-b[1]; const l1=Math.hypot(e1x,e1y)||1, l2=Math.hypot(e2x,e2y)||1;
    const n1x=-e1y/l1, n1y=e1x/l1, n2x=-e2y/l2, n2y=e2x/l2; let bx=n1x+n2x, by=n1y+n2y; const bl=Math.hypot(bx,by)||1; bx/=bl; by/=bl;
    const k=d/Math.max(.35,bx*n1x+by*n1y); out.push([b[0]+bx*k,b[1]+by*k]); }
  for(let i=0;i<n;i++){ const a=p[i], b=p[(i+1)%n], A=out[i], B=out[(i+1)%n];   // an edge flipped round: this level has collapsed
    if((b[0]-a[0])*(B[0]-A[0])+(b[1]-a[1])*(B[1]-A[1])<=0) return null; }
  return area(out)>.5?out:null;
}
function inside(p,x,y){ let c=false; for(let i=0,j=p.length-1;i<p.length;j=i++){ const xi=p[i][0],yi=p[i][1],xj=p[j][0],yj=p[j][1];
  if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi)) c=!c; } return c; }
const TZ=14, tx=lng=>(lng+180)/360*(1<<TZ), ty=lat=>{ const s=Math.sin(lat*Math.PI/180); return (.5-Math.log((1+s)/(1-s))/(4*Math.PI))*(1<<TZ); };
const crossesTile=(b)=>Math.floor(tx(b[0]))!==Math.floor(tx(b[2]))||Math.floor(ty(b[1]))!==Math.floor(ty(b[3]));

/* ---------- 2 + 3. pitched roofs and rooftop units near the car ---------- */
function build(){
  if(!map.getSource('roofs')) return;
  const radius=POWER?200:320, maxHouses=POWER?110:240, maxBig=POWER?25:60, slices=POWER?5:8;
  let fs=[]; try{ fs=map.querySourceFeatures(bSrc,{sourceLayer:'building'}); }catch(e){ return; }
  const kx=111320*Math.cos(S.lat*Math.PI/180), ky=111320, gone=new Set(destroyed), seen=new Set(), parts=[];
  for(const f of fs){
    if(f.id!=null&&gone.has(f.id)) continue;
    const pr=f.properties||{}; if(pr.hide_3d) continue;
    const h=+(pr.render_height!=null?pr.render_height:pr.height!=null?pr.height:6), b0=+(pr.render_min_height||pr.min_height||0);
    const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[];
    for(const pl of polys){ const ring=pl[0]; if(!ring||ring.length<4) continue;
      let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const q of ring){ if(q[0]<x0)x0=q[0]; if(q[0]>x1)x1=q[0]; if(q[1]<y0)y0=q[1]; if(q[1]>y1)y1=q[1]; }
      const cx=(x0+x1)/2, cy=(y0+y1)/2, d=Math.hypot((cx-S.lng)*kx,(cy-S.lat)*ky); if(d>radius) continue;
      const key=cx.toFixed(6)+','+cy.toFixed(6); if(seen.has(key)) continue; seen.add(key);     // same building in two tiles
      parts.push({f,ring,h,b0,cx,cy,d,bb:[x0,y0,x1,y1],holes:pl.length>1}); }
  }
  parts.sort((a,b)=>a.d-b.d);
  if(CACHE.size>4000) CACHE.clear();
  const out=[]; let nh=0, nb=0;
  for(const P of parts){
    if(P.b0>0||P.holes||crossesTile(P.bb)) continue;              // building parts, courtyards, tile-clipped pieces: flat
    const key=P.cx.toFixed(6)+','+P.cy.toFixed(6)+','+P.h;
    let C=CACHE.get(key); if(!C){ C=roofFor(P,kx,ky,slices); CACHE.set(key,C); }
    if(C.house){ if(nh>=maxHouses) continue; nh++; } else if(C.feats.length){ if(nb>=maxBig) continue; nb++; }
    for(const f of C.feats) out.push(f);
  }
  const s=map.getSource('roofs'); if(s) s.setData({type:'FeatureCollection',features:out});
  R.at=[S.lng,S.lat]; R.t=performance.now(); R.n=destroyed.length; R.tiles=false; R.count=out.length;
}
// one building's roof features (cached by position, so each is only worked out once)
const CACHE=new Map();
function roofFor(P,kx,ky,slices){
  const out=[], res={house:false,feats:out};
  {
    let p=clean(P.ring.map(q=>[(q[0]-P.cx)*kx,(q[1]-P.cy)*ky])); if(p.length<3) return res;
    if(area(p)<0) p.reverse();
    const A=area(p), toLL=q=>[+(P.cx+q[0]/kx).toFixed(7),+(P.cy+q[1]/ky).toFixed(7)], top=P.h+.35;
    const idn=Math.abs(Number(P.f.id)||0), seed=Math.floor(P.cx*1e5)^Math.floor(P.cy*1e5), house=P.h<=12&&A>=25&&A<=450;
    if(house){
      if(p.length>40) return res;
      res.house=true;
      const c=jsColour(P.f.id,P.h)===FLAT[0]||jsColour(P.f.id,P.h)===FLAT[1]?SHINGLE[idn%6]:jsColour(P.f.id,P.h);
      const B=obb(p), L=B.u1-B.u0, Wd=B.v1-B.v0, rect=A/((L*Wd)||1), pitch=.5+.14*hash(seed,7);
      const half=Wd/2, rise=Math.min(4.2,half*pitch), um=(B.u0+B.u1)/2, vm=(B.v0+B.v1)/2;
      if(rect>=.85){                                              // gable (most) or hip on the box, 0.3 m eaves
        const gable=hash(seed,3)<.62&&L/Wd>1.15, oh=.3;
        for(let k=0;k<slices;k++){ const t=k/slices, hv=(half+oh)*(1-t), hu=gable?L/2+oh:Math.max(hv,L/2+oh-(half+oh)*t);
          if(hv<.15) break;
          const ring=boxRing(B,um-hu,um+hu,vm-hv,vm+hv).map(toLL); ring.push(ring[0]);
          out.push({type:'Feature',properties:{c,b:top+rise*t,h:top+rise*(k+1)/slices},geometry:{type:'Polygon',coordinates:[ring]}}); }
      } else {                                                    // hip roof following the real outline
        let lo=0, hi=half;                                        // how far the outline can shrink before a wing closes up
        for(let it=0;it<10;it++){ const m=(lo+hi)/2; if(inset(p,m)) lo=m; else hi=m; }
        if(lo<.6) return res;
        const rise2=Math.min(4.2,lo*pitch); let q=p;
        for(let k=0;k<slices&&q;k++){ const t=k/slices;
          const ring=q.map(toLL); ring.push(ring[0]);
          out.push({type:'Feature',properties:{c,b:top+rise2*t,h:top+rise2*(k+1)/slices},geometry:{type:'Polygon',coordinates:[ring]}});
          q=inset(p,lo*(k+1)/slices); }
      }
      return res;
    }
    if(!house&&A>=350&&p.length<=80){                              // stores, schools, offices: rooftop units
      const B=obb(p), n=Math.min(POWER?5:10,Math.floor(A/350));
      if(P.h<=12&&Math.abs(Number(P.f.id)||0)%8<6){                // the vector cap guessed shingles: lay a flat grey roof over it
        const ring=p.map(toLL); ring.push(ring[0]);
        out.push({type:'Feature',properties:{c:FLAT[idn%2],b:top-.01,h:top+.12},geometry:{type:'Polygon',coordinates:[ring]}}); }
      const placed=[];
      for(let k=0,tries=0;k<n&&tries<n*6;tries++){
        const u=B.u0+(B.u1-B.u0)*(.12+.76*hash(seed+tries,11)), v=B.v0+(B.v1-B.v0)*(.12+.76*hash(seed+tries,13));
        const w=2.4+2*hash(seed+tries,17), dd=1.8+1.2*hash(seed+tries,19), hh=1.1+1*hash(seed+tries,23);
        if(placed.some(q=>Math.abs(q[0]-u)<(w+q[2])/2+1&&Math.abs(q[1]-v)<(dd+q[3])/2+1)) continue;   // keep units apart
        const box=boxRing(B,u-w/2,u+w/2,v-dd/2,v+dd/2); if(!box.every(q=>inside(p,q[0],q[1]))) continue; placed.push([u,v,w,dd]);
        const ring=box.map(toLL); ring.push(ring[0]); k++;
        out.push({type:'Feature',properties:{c:UNIT[(seed+tries)&3],b:top+.12,h:top+.12+hh},geometry:{type:'Polygon',coordinates:[ring]}});
      }
    }
  }
  return res;
}

onReady(function buildings(){
  safe('roof caps',addCaps);
  map.on('sourcedata',e=>{ if(e.sourceId===bSrc&&e.tile) R.tiles=true; });
  setTimeout(()=>safe('roofs',build),1500);
});
onTick(700,function roofTick(){
  if(!map.getSource('roofs')) return;
  if(mode==='glider'){ if(R.count){ safe('roofs off',()=>map.getSource('roofs').setData({type:'FeatureCollection',features:[]})); R.count=0; R.at=null; } return; }
  const moved=R.at?meters(R.at[1],R.at[0],S.lat,S.lng):1e9, age=performance.now()-R.t;
  if(moved>(POWER?160:120)||destroyed.length!==R.n||(R.tiles&&age>3000)) safe('roofs',build);
});
const prev=window.onPowerChange;
window.onPowerChange=(on)=>{ if(prev) prev(on); R.at=null; CACHE.clear(); };   // slice count / unit count change
window.ROOFS={build,state:R};
})();
