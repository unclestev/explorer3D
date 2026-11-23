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
/* house looks (owner 2026-11-23: "apply various roof colors… as well as exterior walls… different colors… as you would
   see for siding… all houses are the same color"): every house picks its own siding (or brick) and roof colour from where
   it stands, so neighbours differ and a house looks the same on every visit */
const SIDING=['#f2efe8','#ebe5d8','#e3d8c2','#d6c7aa','#c7b89c','#cfc8bc','#b7b1a7','#a8b0b5','#93a1ab','#7f8f9b','#9ea88f','#87937c',
  '#e7d9a9','#d9c58e','#c4b7a2','#a9a095','#6f7d86','#5f6e62','#8c9fb4','#b8c4c9','#e9e2cf','#bfa98c'];
const BRICK=['#9b5e4a','#8a4f3f','#a86a52','#b07a5e','#7c4a3c','#a2735f','#c49a7a','#8f6b5a'];
const ROOFC=['#3a3c41','#46484d','#55585e','#62656b','#5b4a3c','#6a5c4d','#4a3f38','#3f4654','#6e6a63','#7b6f61','#5c3a33',
  '#2f3a33','#7a4b3a','#86898d','#4d4a46','#695849'];
const LOWC=['#d8d2c4','#c9c0ae','#b5a48c','#a7a29a','#c2b8a3','#9e6b55','#d0c9bd','#b9bcbf','#cfc6b4','#a58f78'];
const seedOf=(cx,cy)=>(Math.floor(cx*1e5)^Math.floor(cy*1e5))>>>0;
function houseLook(seed){ const brick=hash(seed,51)<.2;
  return {brick, wall:brick?BRICK[Math.floor(hash(seed,53)*BRICK.length)]:SIDING[Math.floor(hash(seed,53)*SIDING.length)],
    roof:ROOFC[Math.floor(hash(seed,57)*ROOFC.length)]}; }
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
  if(!map.getSource('walls')){
    /* nearby buildings redrawn one by one (owner 2026-11-23: "i've noticed roofs floating above the building"): with 3D
       terrain MapLibre stands each map feature on the ground height at that feature's middle, and OpenFreeMap often
       makes a whole street or subdivision one feature, so on a slope its houses were raised or sunk by metres while each
       pitched roof (its own feature) sat on the ground at its own house. Here every building is its own feature, so wall
       and roof stand on the same ground; the map's own copies of those groups are left out (js/game.js applyHides). */
    map.addSource('walls',{type:'geojson',data:{type:'FeatureCollection',features:[]},maxzoom:18,tolerance:0,buffer:16});
    map.addLayer({id:'wall-3d',type:'fill-extrusion',source:'walls',
      paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-base':['get','b'],'fill-extrusion-height':['get','h'],'fill-extrusion-opacity':1}},before);
    map.addLayer({id:'wall-cap',type:'fill-extrusion',source:'walls',
      paint:{'fill-extrusion-color':['get','cc'],'fill-extrusion-base':['get','h'],'fill-extrusion-height':['+',['get','h'],.35],'fill-extrusion-vertical-gradient':false}},before);
    for(const id of ['wall-3d','wall-cap']){ hideIds.push(id); origFilters[id]=null; }
    blockIds.push('wall-3d');                                        // you still bump into them (screen check without terrain)
    if(destroyed.length||HIDE.walk!=null) applyHides(['wall-3d','wall-cap']);
  }
  if(!map.getSource('roofs')){
    map.addSource('roofs',{type:'geojson',data:{type:'FeatureCollection',features:[]},maxzoom:19,tolerance:0,buffer:16,promoteId:'gk'});
    // garage doors (prop gk) roll up by feature state o (0 shut .. 1 open, js/enh/garage.js): the panel's bottom rises gr metres
    map.addLayer({id:'roof-3d',type:'fill-extrusion',source:'roofs',
      paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-base':['+',['get','b'],['*',['coalesce',['feature-state','o'],0],['coalesce',['get','gr'],0]]],'fill-extrusion-height':['get','h'],'fill-extrusion-vertical-gradient':false}},before);
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

/* ---------- 1b. walls of the buildings near the car, one feature each (see 'walls' in addCaps) ----------
   Every map group with a piece within RW metres is taken over whole (the map can only leave a group out by its id):
   all its pieces in the loaded tiles are drawn here, each cut back to its own tile so pieces from two tiles don't
   overlap. Groups already taken stay taken until they are RW+150 m away, so the list doesn't flip back and forth. */
const W={sig:'',hid:new Set(),n:0,ms:0};
const tileBox=(z,x,y)=>{ const n=2**z, lat=v=>Math.atan(Math.sinh(Math.PI*(1-2*v/n)))*180/Math.PI; return [x/n*360-180, lat(y+1), (x+1)/n*360-180, lat(y)]; };
function clipRing(r,b){                                           // Sutherland-Hodgman against a lng/lat box; closed ring in and out
  let P=r.slice(0,-1);
  const edges=[[q=>q[0]>=b[0],(a,c)=>[b[0],a[1]+(c[1]-a[1])*(b[0]-a[0])/(c[0]-a[0])]],[q=>q[0]<=b[2],(a,c)=>[b[2],a[1]+(c[1]-a[1])*(b[2]-a[0])/(c[0]-a[0])]],
    [q=>q[1]>=b[1],(a,c)=>[a[0]+(c[0]-a[0])*(b[1]-a[1])/(c[1]-a[1]),b[1]]],[q=>q[1]<=b[3],(a,c)=>[a[0]+(c[0]-a[0])*(b[3]-a[1])/(c[1]-a[1]),b[3]]]];
  for(const [inn,cut] of edges){ if(P.length<3) return null; const out=[];
    for(let i=0;i<P.length;i++){ const a=P[(i+P.length-1)%P.length], c=P[i], ia=inn(a), ic=inn(c);
      if(ic){ if(!ia) out.push(cut(a,c)); out.push(c); } else if(ia) out.push(cut(a,c)); }
    P=out; }
  if(P.length<3) return null; P.push(P[0]); return P;
}
function buildWalls(fs,kx,ky,RW,gone){
  const t0=performance.now(), minD=new Map();
  for(const f of fs){ if(f.id==null||gone.has(f.id)) continue; const g=f.geometry; if(!g) continue;
    const pls=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
    let m=minD.has(f.id)?minD.get(f.id):1e9;
    for(const pl of pls){ const r=pl[0]; if(!r||r.length<4) continue; const q=r[0], d=Math.hypot((q[0]-S.lng)*kx,(q[1]-S.lat)*ky); if(d<m) m=d; }
    minD.set(f.id,m); }
  const hid=new Set(); for(const [id,d] of minD) if(d<RW||(W.hid.has(id)&&d<RW+150)) hid.add(id);
  const feats=[], seen=new Set(), tiles=new Set();
  for(const f of fs){ if(!hid.has(f.id)) continue; const T=f.tile||{z:f._z,x:f._x,y:f._y}; if(T.z==null) continue;
    const tk=T.z+'/'+T.x+'/'+T.y; tiles.add(tk); const box=tileBox(T.z,T.x,T.y), g=f.geometry;
    const pls=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[], pr=f.properties||{};
    const h=+(pr.render_height!=null?pr.render_height:pr.height!=null?pr.height:6), b0=+(pr.render_min_height||pr.min_height||0);
    for(const pl of pls){ const r=pl[0]; if(!r||r.length<4) continue;
      const sk=tk+':'+r.length+':'+r[0][0]+','+r[0][1]; if(seen.has(sk)) continue; seen.add(sk);
      const outer=clipRing(r,box); if(!outer) continue;
      let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const q of r){ if(q[0]<x0)x0=q[0]; if(q[0]>x1)x1=q[0]; if(q[1]<y0)y0=q[1]; if(q[1]>y1)y1=q[1]; }
      const cx=(x0+x1)/2, cy=(y0+y1)/2, A=Math.abs(area(r.slice(0,-1).map(q=>[(q[0]-cx)*kx,(q[1]-cy)*ky]))), seed=seedOf(cx,cy);
      const house=h<=12&&b0===0&&A>=25&&A<=450, L=house?houseLook(seed):null;
      const c=house?L.wall:h<=12?LOWC[Math.floor(hash(seed,59)*LOWC.length)]:h<=30?['#c8c4bc','#b3b8be','#d2c8b5','#bdb7ad','#a89f93'][seed%5]:['#9fb3c6','#8b9fb2','#a7b4bf'][seed%3];
      const rings=[outer]; for(const hr of pl.slice(1)){ const c2=clipRing(hr,box); if(c2) rings.push(c2); }
      feats.push({type:'Feature',id:f.id,properties:{c,cc:house?L.roof:FLAT[seed%2],b:b0,h},geometry:{type:'Polygon',coordinates:rings}}); } }
  const sig=[...hid].sort().join(',')+'|'+[...tiles].sort().join(',');
  if(sig!==W.sig){ W.sig=sig; W.hid=hid; W.n=feats.length;
    safe('walls',()=>map.getSource('walls').setData({type:'FeatureCollection',features:feats}));
    // the map's own copies go once the new walls are in (a moment later), so nothing blinks out in between
    const ids=[...hid]; clearTimeout(W.tm); W.tm=setTimeout(()=>{ HIDE.vec=ids; applyHides(['building-3d','roof-cap']); },350); }
  W.ms=performance.now()-t0;
}

/* ---------- 2 + 3. pitched roofs and rooftop units near the car ---------- */
function build(){
  if(!map.getSource('roofs')) return;
  const CKV=!!(window.COCKPIT&&COCKPIT.on);                         // cockpit view: you see walls, not roofs from afar — closer, richer
  const radius=CKV?Q3(160,210,250):Q3(200,260,320), maxHouses=Q3(110,170,240), maxBig=Q3(25,40,60), slices=Q3(5,6,8), maxFac=CKV?Q3(45,150,200):Q3(80,110,150);   // windows on the nearest maxFac
  const kx=111320*Math.cos(S.lat*Math.PI/180), ky=111320, gone=new Set(destroyed), seen=new Set();
  let parts=[];
  const reuse=R.pending&&R.parts&&R.pAt&&meters(R.pAt[1],R.pAt[0],S.lat,S.lng)<40&&R.n===destroyed.length;
  if(reuse) parts=R.parts; else {
  let fs=[]; try{ fs=map.querySourceFeatures(bSrc,{sourceLayer:'building'}); }catch(e){ return; }
  if(map.getSource('walls')) safe('walls',()=>buildWalls(fs,kx,ky,radius+60,gone));
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
  parts.sort((a,b)=>a.d-b.d); R.parts=parts; R.pAt=[S.lng,S.lat]; }
  if(CACHE.size>4000) CACHE.clear();
  // new work is limited by time (not count) per tick, so the phone never stalls; results are only sent to the map
  // when the set of buildings shown actually changed, and at most every 2.5 s while still catching up
  const out=[], sig=[], reg=[], t0=performance.now(), tb=POWER?6:10; let nh=0, nb=0, nf=0, budget=1e9, near=0; R.pending=false;
  // roofs are stacked slices (map extrusions can't slope): the nearest houses get thin slices, so up close the slope reads
  // as a smooth roof rather than a staircase (owner 2026-11-23: "sharpen the roofs so that they don't look like jagged shapes")
  const fine=Q3(14,20,26), nFine=Q3(20,35,50);
  for(const P of parts){
    if(P.b0>0||P.holes||crossesTile(P.bb)) continue;              // building parts, courtyards, tile-clipped pieces: flat
    const sl=P.h<=12&&near++<nFine&&P.d<130?fine:slices;
    const key=P.cx.toFixed(6)+','+P.cy.toFixed(6)+','+P.h+','+sl;
    let C=CACHE.get(key);
    if(!C){ if(performance.now()-t0>tb){ R.pending=true; continue; } C=roofFor(P,kx,ky,sl); tagId(C.feats,P); CACHE.set(key,C); }   // spread new work over ticks
    if(!C.fac&&nf<maxFac){ if(performance.now()-t0>tb){ R.pending=true; } else { safe('facades',()=>facades(P,kx,ky,C)); if(!C.fac) C.fac=[]; tagId(C.fac,P); } }
    if(C.house){ if(nh>=maxHouses) continue; nh++; } else if(C.feats.length||C.fac&&C.fac.length){ if(nb>=maxBig) continue; nb++; }
    for(const f of C.feats) out.push(f);
    let w=0; if(C.fac&&C.fac.length&&nf<maxFac){ nf++; w=1; for(const f of C.fac) out.push(f); if(C.bld) reg.push(C.bld); }
    if(C.feats.length||w) sig.push(key+w);
  }
  const now=performance.now(), key=sig.join(';');
  if(key!==R.last&&!(R.pending&&R.count&&now-(R.setT||0)<2500)){
    const s=map.getSource('roofs'); if(s) s.setData({type:'FeatureCollection',features:out}); R.last=key; R.setT=now; R.count=out.length; }
  R.at=[S.lng,S.lat]; R.t=now; R.n=destroyed.length; R.tiles=false; R.reg=reg;
}
// roof pieces carry rf:1 (js/enh/snowcover.js whitens only those when snow settles); every roof / facade piece carries its own building's key (prop bk, its middle), so walking inside one can hide just
// that building's pieces (not by id: OpenFreeMap gives a whole group of neighbouring buildings one id)
function tagId(fs,P){ const bk=P.cx.toFixed(6)+','+P.cy.toFixed(6); for(const f of fs) f.properties.bk=bk; }
// one building's roof features (cached by position, so each is only worked out once)
const CACHE=new Map();
function roofFor(P,kx,ky,slices){ return roofParts(P,kx,ky,slices); }
function roofParts(P,kx,ky,slices){
  const out=[], res={house:false,feats:out};
  {
    let p=clean(P.ring.map(q=>[(q[0]-P.cx)*kx,(q[1]-P.cy)*ky])); if(p.length<3) return res;
    if(area(p)<0) p.reverse();
    const A=area(p), toLL=q=>[+(P.cx+q[0]/kx).toFixed(7),+(P.cy+q[1]/ky).toFixed(7)], top=P.h+.35;
    const idn=Math.abs(Number(P.f.id)||0), seed=Math.floor(P.cx*1e5)^Math.floor(P.cy*1e5), house=P.h<=12&&A>=25&&A<=450;
    if(house){
      if(p.length>40) return res;
      res.house=true;
      const c=houseLook(seedOf(P.cx,P.cy)).roof;
      const B=obb(p), L=B.u1-B.u0, Wd=B.v1-B.v0, rect=A/((L*Wd)||1), pitch=.5+.14*hash(seed,7);
      const half=Wd/2, rise=Math.min(4.2,half*pitch), um=(B.u0+B.u1)/2, vm=(B.v0+B.v1)/2;
      if(rect>=.85){                                              // gable (most) or hip on the box, 0.3 m eaves
        const gable=hash(seed,3)<.62&&L/Wd>1.15, oh=.3;
        for(let k=0;k<slices;k++){ const t=k/slices, hv=(half+oh)*(1-t), hu=gable?L/2+oh:Math.max(hv,L/2+oh-(half+oh)*t);
          if(hv<.15) break;
          const ring=boxRing(B,um-hu,um+hu,vm-hv,vm+hv).map(toLL); ring.push(ring[0]);
          out.push({type:'Feature',properties:{c,rf:1,b:top+rise*t,h:top+rise*(k+1)/slices},geometry:{type:'Polygon',coordinates:[ring]}}); }
      } else {                                                    // hip roof following the real outline
        let lo=0, hi=half;                                        // how far the outline can shrink before a wing closes up
        for(let it=0;it<10;it++){ const m=(lo+hi)/2; if(inset(p,m)) lo=m; else hi=m; }
        if(lo<.6) return res;
        const rise2=Math.min(4.2,lo*pitch); let q=p;
        for(let k=0;k<slices&&q;k++){ const t=k/slices;
          const ring=q.map(toLL); ring.push(ring[0]);
          out.push({type:'Feature',properties:{c,rf:1,b:top+rise2*t,h:top+rise2*(k+1)/slices},geometry:{type:'Polygon',coordinates:[ring]}});
          q=inset(p,lo*(k+1)/slices); }
      }
      return res;
    }
    if(!house&&A>=350&&p.length<=80){                              // stores, schools, offices: rooftop units
      const B=obb(p), n=Math.min(POWER?5:10,Math.floor(A/350));
      if(P.h<=12&&Math.abs(Number(P.f.id)||0)%8<6){                // the vector cap guessed shingles: lay a flat grey roof over it
        const ring=p.map(toLL); ring.push(ring[0]);
        out.push({type:'Feature',properties:{c:FLAT[idn%2],rf:1,b:top-.01,h:top+.12},geometry:{type:'Polygon',coordinates:[ring]}}); }
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

/* ---------- 4. windows, doors and garage doors (owner's choice 2026-10-01, "B for the performance") ----------
   Real-size shapes standing just proud of the walls of the same nearby buildings: no textures, so they never change
   size with the camera zoom and cost little to draw; each building's set is worked out once and cached with its roof.
   Houses: windows along every wall on each floor (white frames, not in battery saver), a front door and — on the wall
   facing the nearest road, if it's long enough — a garage door. Stores/schools (up to 12 m): a glass storefront with
   mullions on the street side. Taller buildings: a ribbon of windows on every floor of every wall. The map doesn't
   say where real windows and doors are, so placement is a sensible guess. After dark about half the windows glow. */
const GLASS='#27313e', FRAME='#eef0f1', DOORS=['#6b2f2a','#2f3e55','#3a3a3c','#5a4632','#f1efe9','#4d5b45'], GARAGE=['#f1efe9','#e5dfd3','#d8d3c9','#c9c2b6'];
function streetDir(P){                                            // unit vector from the building toward its nearest road
  if(typeof roadGeo==='undefined'||typeof rebuildRoadGeo!=='function') return null;
  if(!roadGeo.segs||meters(roadGeo.lat,roadGeo.lng,S.lat,S.lng)>350) rebuildRoadGeo();
  const segs=roadGeo.segs; if(!segs||!segs.length) return null;
  const kx=111320*Math.cos(roadGeo.lat*Math.PI/180), px=(P.cx-roadGeo.lng)*kx, py=(P.cy-roadGeo.lat)*111320;
  let best=1e9, bx=0, by=0;
  for(const [x1,y1,x2,y2] of segs){ const dx=x2-x1, dy=y2-y1, L2=dx*dx+dy*dy, t=L2?Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/L2)):0;
    const ex=x1+t*dx-px, ey=y1+t*dy-py, d=ex*ex+ey*ey; if(d<best){ best=d; bx=ex; by=ey; } }
  best=Math.sqrt(best); return best>2&&best<70?[bx/best,by/best]:null;
}
function facades(P,kx,ky,res){
  if(P.b0>0) return;
  let p=clean(P.ring.map(q=>[(q[0]-P.cx)*kx,(q[1]-P.cy)*ky])); if(p.length<3||p.length>80) return;
  if(area(p)<0) p.reverse();
  const A=area(p), house=P.h<=12&&A>=25&&A<=450, seed=(Math.floor(P.cx*1e5)^Math.floor(P.cy*1e5))>>>0, out=res.fac=[];
  if(!house&&A<80) return;                                        // sheds and kiosks: plain
  const toLL=q=>[+(P.cx+q[0]/kx).toFixed(7),+(P.cy+q[1]/ky).toFixed(7)], frames=!POWER;
  // one shape standing out from a wall: along the wall from s0 to s1 (m), o0..o1 m out from it, z from b to h
  const put=(E,s0,s1,o0,o1,b,h,c,lit)=>{ const a=[E.a[0]+E.ux*s0,E.a[1]+E.uy*s0], z=[E.a[0]+E.ux*s1,E.a[1]+E.uy*s1];
    const ring=[[a[0]+E.nx*o0,a[1]+E.ny*o0],[z[0]+E.nx*o0,z[1]+E.ny*o0],[z[0]+E.nx*o1,z[1]+E.ny*o1],[a[0]+E.nx*o1,a[1]+E.ny*o1]].map(toLL); ring.push(ring[0]);
    const pr={c,b:+b.toFixed(2),h:+h.toFixed(2)}; if(lit!=null) pr.lit=lit; out.push({type:'Feature',properties:pr,geometry:{type:'Polygon',coordinates:[ring]}}); };
  const window1=(E,s,w,b,h,k)=>{ if(frames) put(E,s-w/2-.08,s+w/2+.08,.01,.05,b-.08,h+.08,FRAME);
    put(E,s-w/2,s+w/2,.02,.08,b,h,GLASS,hash(seed,k)<(house?.45:.7)?1:0); };
  const edges=[];
  for(let i=0;i<p.length;i++){ const a=p[i], b=p[(i+1)%p.length], ex=b[0]-a[0], ey=b[1]-a[1], L=Math.hypot(ex,ey);
    if(L<2.4) continue; edges.push({a,L,ux:ex/L,uy:ey/L,nx:ey/L,ny:-ex/L}); }   // outward normal (outline runs counter-clockwise)
  if(!edges.length) return;
  // the doors you can walk through (js/enh/walk.js): local metres around (cx,cy), on the outline p (counter-clockwise)
  const doors=[], garages=[]; let dn=0;
  const door=(E,s0,s1)=>{ const d={ei:p.indexOf(E.a),s0,s1,x0:E.a[0]+E.ux*s0,y0:E.a[1]+E.uy*s0,x1:E.a[0]+E.ux*s1,y1:E.a[1]+E.uy*s1,nx:E.nx,ny:E.ny,dk:seed*8+(dn++)};
    doors.push(d); return d.dk; };
  // glass entrance doors (stores, lobbies): dark frame, two glass leaves, push bars
  const entrance=(E,s)=>{ const dk=door(E,s-.95,s+.95);
    putD(E,s-.95,s+.95,.085,.105,0,2.45,'#3b4048',dk);
    for(const z of [-1,1]){ putD(E,z<0?s-.87:s+.05,z<0?s-.05:s+.87,.1,.125,.06,2.37,GLASS,dk); putD(E,z<0?s-.4:s+.1,z<0?s-.1:s+.4,.125,.16,1,1.06,'#c7ccd1'); } };
  const putD=(E,s0,s1,o0,o1,b,h,c,dk)=>{ put(E,s0,s1,o0,o1,b,h,c); if(dk!=null) out[out.length-1].properties.dk=dk; };
  if(P.f.id!=null) res.bld={key:P.cx.toFixed(6)+','+P.cy.toFixed(6),id:P.f.id,cx:P.cx,cy:P.cy,kx,ky,p,h:P.h,house,doors,garages,bb:P.bb};
  const sd=streetDir(P);
  let front=edges[0]; for(const E of edges){ const sc=(sd?E.nx*sd[0]+E.ny*sd[1]:0)+.02*Math.min(E.L,12), fs=(sd?front.nx*sd[0]+front.ny*sd[1]:0)+.02*Math.min(front.L,12); if(sc>fs) front=E; }
  let k=0;
  if(house){
    const floors=P.h<5.2?1:P.h<8.6?2:3, fh=Math.min(3.1,(P.h-.4)/floors), busy=[];
    // garage door at one end of the street side, front door in what's left
    if(front.L>=9&&hash(seed,31)<.75){ const gw=front.L>=13?4.9:2.7, left=hash(seed,37)<.5, s0=left?.7:front.L-.7-gw;
      // a garage you can open (js/enh/garage.js): the dark inside shows behind the panel as it rolls up
      const gk=seed*4+1, a=[front.a[0]+front.ux*s0,front.a[1]+front.uy*s0], mx=a[0]+front.ux*gw/2, my=a[1]+front.uy*gw/2;
      let depth=0; for(const q of p) depth=Math.max(depth,-((q[0]-mx)*front.nx+(q[1]-my)*front.ny));
      garages.push({ei:p.indexOf(front.a),s0,s1:s0+gw,x0:a[0],y0:a[1],x1:a[0]+front.ux*gw,y1:a[1]+front.uy*gw,nx:front.nx,ny:front.ny,gk,col:GARAGE[seed&3],D:Math.max(4,Math.min(7.5,depth-.3))});
      put(front,s0+.05,s0+gw-.05,.004,.016,0,2.1,'#141518');
      put(front,s0,s0+gw,.02,.1,0,2.15,GARAGE[seed&3]); Object.assign(out[out.length-1].properties,{gk,gr:1.95}); busy.push([s0-.5,s0+gw+.5]); }
    { const free=busy.length?(busy[0][0]>front.L/2?[.8,busy[0][0]-.3]:[busy[0][1]+.3,front.L-.8]):[.8,front.L-.8];
      if(free[1]-free[0]>=1.6){ const s=(free[0]+free[1])/2+(busy.length?0:(hash(seed,41)-.5)*front.L*.3);
        const dk=door(front,s-.6,s+.6);
        if(frames) put(front,s-.6,s+.6,.01,.05,0,2.3,FRAME);
        putD(front,s-.48,s+.48,.02,.09,0,2.1,DOORS[seed%DOORS.length],dk); busy.push([s-.9,s+.9]); } }
    for(const E of edges) for(let f=0;f<floors;f++){
      const n=Math.floor((E.L-1.2)/2.9); if(n<1) continue; const step=(E.L)/(n+1), big=E===front&&f===0;
      for(let i=1;i<=n;i++){ const s=i*step, w=big?1.4:.95;
        if(E===front&&f===0&&busy.some(z=>s+w/2>z[0]&&s-w/2<z[1])) continue;
        window1(E,s,w,f*fh+.9,f*fh+.9+(big?1.4:1.25),k++); } }
  } else if(P.h<=12){
    // storefront: glass band on the street side (the middle 60% of very long walls), mullions every ~1.6 m
    const E=front, s0=E.L>40?E.L*.2:1, s1=E.L>40?E.L*.8:E.L-1;
    if(s1-s0>2){ put(E,s0,s1,.02,.08,.3,2.9,GLASS,hash(seed,5)<.8?1:0);
      if(frames) for(let s=s0;s<=s1+.01;s+=1.6) put(E,s-.05,s+.05,.08,.12,.3,2.9,'#b9bec4');
      put(E,s0-.2,s1+.2,.02,.5,2.9,3.2,'#d6d8da');                 // canopy fascia above the glass
      if(s1-s0>=2.4) entrance(E,(s0+s1)/2); }                       // the way in, in the middle of the glass
    for(const F of edges){ if(F===E||F.L<12||hash(seed,F.L|0)<.5) continue;   // a few high windows on some side walls
      const n=Math.min(6,Math.floor(F.L/8)); for(let i=1;i<=n;i++) window1(F,i*F.L/(n+1),1.6,P.h*.55,P.h*.55+1,k++); }
  } else {
    // taller buildings: a ribbon of windows on every floor of every wall
    const floors=Math.min(12,Math.max(2,Math.round(P.h/3.6))), fh=P.h/floors;
    for(const E of edges){ if(E.L<3) continue;
      for(let f=0;f<floors;f++) put(E,.6,E.L-.6,.02,.08,f*fh+.9,f*fh+.9+Math.min(1.6,fh-1.2),GLASS,hash(seed+f,E.L|0)<.65?1:0); }
    if(front.L>=3) entrance(front,front.L/2);                       // a lobby entrance on the street side
  }
}
// after dark, the windows marked lit glow warm (a paint switch, nothing is rebuilt)
let night=null, openDk=null;
function paintRoofs(){ if(!map.getLayer('roof-3d')) return;
  let c=night?['case',['==',['get','lit'],1],'#ffd27f',['get','c']]:['get','c'];
  if(openDk!=null) c=['case',['==',['coalesce',['get','dk'],-1],openDk],'#16181b',c];          // an open doorway: dark inside
  safe('roof colours',()=>map.setPaintProperty('roof-3d','fill-extrusion-color',c)); }
function setNight(on){ if(on===night||!map.getLayer('roof-3d')) return; night=on; paintRoofs(); }
function openDoor(dk){ dk=dk==null?null:dk; if(dk===openDk) return; openDk=dk; paintRoofs(); }
onTick(2000,function litTick(){ const A=YD.AT; setNight(!!(A&&A.k>.55)); });

onReady(function buildings(){
  safe('roof caps',addCaps);
  map.on('sourcedata',e=>{ if(e.sourceId===bSrc&&e.tile) R.tiles=true; });
  setTimeout(()=>safe('roofs',build),1500);
});
onTick(700,function roofTick(){
  if(!map.getSource('roofs')) return;
  if(mode==='glider'){ if(R.count){ safe('roofs off',()=>map.getSource('roofs').setData({type:'FeatureCollection',features:[]})); R.count=0; R.at=null; R.last=''; } return; }
  const moved=R.at?meters(R.at[1],R.at[0],S.lat,S.lng):1e9, age=performance.now()-R.t;
  if(moved>(POWER?160:120)||destroyed.length!==R.n||(R.tiles&&age>(POWER?8000:5000))||R.pending) safe('roofs',build);
});
const prev=window.onPowerChange;
window.onPowerChange=(on)=>{ if(prev) prev(on); R.at=null; R.last=''; R.parts=null; CACHE.clear(); };   // slice count / unit count change
window.ROOFS={build,state:R,walls:W,doorsNear:()=>R.reg||[],openDoor};
})();
