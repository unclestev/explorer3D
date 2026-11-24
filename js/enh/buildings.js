/* More realistic buildings (owner's choice 2026-09-30: roofs in their own colours, pitched roofs on nearby houses,
   equipment on commercial roofs). Everything is built from the map's own building footprints; nothing is downloaded.
   1. Roof caps — a thin layer on top of every building (vector layer, all distances): shingle colours on most
      house-sized buildings, light grey on the rest and on anything taller than 12 m. Cheap; on in battery saver.
   2. Pitched roofs on houses near the car — within 320 m (200 m in battery saver), nearest 240 (110 in saver).
      Rectangular houses get a gable or hip roof on their oriented outline with a small overhang; other shapes get a
      hip roof made by shrinking the real outline inward. Built from stacked slices (8, or 5 in saver), so up close
      the slopes show small steps. The map data doesn't say what shape real roofs are, so the shape is a guess.
   3. Rooftop units (air conditioners, vents) on stores, schools and offices near the car.
   1b. (2026-11-23) Near the car every building is redrawn as its own feature ('walls'), with each house's own siding /
      brick texture and roof colour, and the map's grouped copies left out — see buildWalls.
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
/* every other building gets a wall texture too (owner 2026-11-23: "siding textures on all of the buildings… schools should be
   brick"): shops and offices brick, split-face block or stucco; industrial ribbed metal or block; mid-rise brick or precast
   panels; towers glass. Anything standing on school / college / university grounds is brick. */
const BLOCK=['#c9c3b6','#b8b2a6','#d4cbb8','#a9a49b','#c2b49c','#9d9a94'], STUCCO=['#e2d6bf','#d8c9ad','#efe7d6','#cdbfa6','#e6dcc8','#c8bfb1'],
  METAL=['#b9bec2','#a3abb1','#d2d4d2','#8e9aa4','#c4b9a2','#7f8f84'], PANEL=['#c8c4bc','#b3b8be','#d2c8b5','#bdb7ad','#a89f93'], CURTAIN=['#9fb3c6','#8b9fb2','#a7b4bf'];
function otherLook(seed,h,zone){
  const pick=(a,k)=>a[Math.floor(hash(seed,k)*a.length)], i=k=>Math.floor(hash(seed,k)*8);
  if(zone==='school') return 'hw-br'+i(61);
  if(h>30) return 'cw-gl'+Math.floor(hash(seed,62)*CURTAIN.length);
  if(h>12) return hash(seed,63)<.5?'hw-br'+i(61):'cw-pc'+Math.floor(hash(seed,64)*PANEL.length);
  const r=hash(seed,65);
  if(zone==='industrial') return r<.6?'cw-mt'+Math.floor(hash(seed,66)*METAL.length):'cw-bk'+Math.floor(hash(seed,67)*BLOCK.length);
  return r<.35?'hw-br'+i(61):r<.7?'cw-bk'+Math.floor(hash(seed,67)*BLOCK.length):'cw-st'+Math.floor(hash(seed,68)*STUCCO.length);
}
const seedOf=(cx,cy)=>(Math.floor(cx*1e5)^Math.floor(cy*1e5))>>>0;
function houseLook(seed){ const brick=hash(seed,51)<.2, i=Math.floor(hash(seed,53)*(brick?BRICK.length:SIDING.length));
  return {brick, wall:brick?BRICK[i]:SIDING[i], pat:brick?'hw-br'+i:(hash(seed,55)<.2?'hw-bb':'hw-lap')+i,
    roof:ROOFC[Math.floor(hash(seed,57)*ROOFC.length)]}; }
/* wall textures for houses, one per colour, drawn in code: lap siding (boards ~20 cm apart from the chase camera),
   board and batten, and brick courses with light mortar. 32 px tiles, so they repeat seamlessly along any wall. */
function wallImages(){
  const mk=(id,base,draw)=>{ if(map.hasImage(id)) return; const c=document.createElement('canvas'); c.width=c.height=32; const x=c.getContext('2d');
    x.fillStyle=base; x.fillRect(0,0,32,32); draw(x); map.addImage(id,x.getImageData(0,0,32,32),{pixelRatio:1}); };
  SIDING.forEach((c,i)=>{
    mk('hw-lap'+i,c,x=>{ for(let y=0;y<32;y+=4){ x.fillStyle='rgba(0,0,0,.2)'; x.fillRect(0,y+3,32,1); x.fillStyle='rgba(255,255,255,.16)'; x.fillRect(0,y,32,1); } });
    mk('hw-bb'+i,c,x=>{ for(let v=0;v<32;v+=8){ x.fillStyle='rgba(0,0,0,.2)'; x.fillRect(v+2,0,1,32); x.fillStyle='rgba(255,255,255,.14)'; x.fillRect(v,0,2,32); } }); });
  BLOCK.forEach((c,i)=>mk('cw-bk'+i,c,x=>{ for(let y=0;y<32;y+=8) for(let v=0;v<32;v+=16){ const o=(y/8)%2?8:0;   // split-face block, 40 x 20 cm
      x.fillStyle=`rgba(0,0,0,${.03+.05*((y*7+v*13)%5)/5})`; x.fillRect((v+o)%32,y,16,8); x.fillStyle='rgba(255,255,255,.08)'; x.fillRect((v+o)%32,y,16,1); }
    x.fillStyle='rgba(60,55,50,.28)'; for(let y=0;y<32;y+=8){ x.fillRect(0,y+7,32,1); for(let v=0;v<32;v+=16) x.fillRect((v+((y/8)%2?8:0))%32,y,1,7); } }));
  STUCCO.forEach((c,i)=>mk('cw-st'+i,c,x=>{ for(let k=0;k<160;k++){ const a=(k*97)%32, b=(k*61+k*k)%32; x.fillStyle=k%2?'rgba(0,0,0,.06)':'rgba(255,255,255,.08)'; x.fillRect(a,b,1,1); }
    x.fillStyle='rgba(0,0,0,.16)'; x.fillRect(0,31,32,1); x.fillStyle='rgba(255,255,255,.12)'; x.fillRect(0,30,32,1); }));      // EIFS reveal every ~3.5 m
  METAL.forEach((c,i)=>mk('cw-mt'+i,c,x=>{ for(let v=0;v<32;v+=4){ x.fillStyle='rgba(0,0,0,.18)'; x.fillRect(v+3,0,1,32); x.fillStyle='rgba(255,255,255,.18)'; x.fillRect(v,0,1,32); } }));
  PANEL.forEach((c,i)=>mk('cw-pc'+i,c,x=>{ x.fillStyle='rgba(0,0,0,.2)'; x.fillRect(0,31,32,1); x.fillRect(31,0,1,32);              // precast panels with a dark window band
    x.fillStyle='rgba(40,55,70,.55)'; x.fillRect(0,12,32,9); x.fillStyle='rgba(255,255,255,.15)'; x.fillRect(0,12,32,1); }));
  CURTAIN.forEach((c,i)=>mk('cw-gl'+i,c,x=>{ x.fillStyle='rgba(255,255,255,.10)'; x.fillRect(0,0,16,32);                           // curtain wall: mullions, spandrels
    x.fillStyle='rgba(30,40,50,.35)'; for(let v=0;v<32;v+=8) x.fillRect(v,0,1,32); x.fillRect(0,26,32,3); }));
  BRICK.forEach((c,i)=>mk('hw-br'+i,c,x=>{ const r=(a,b)=>{ let h=(a*73856093^b*19349663)>>>0; return (h%1000)/1000; };
    for(let y=0;y<32;y+=4) for(let v=-8;v<32;v+=8){ const o=(y/4)%2?4:0; x.fillStyle=`rgba(${r(y,v)<.5?0:255},${r(y,v)<.5?0:220},${r(y,v)<.5?0:200},${.05+.08*r(v,y)})`; x.fillRect(v+o,y,8,4); }
    x.fillStyle='rgba(225,220,210,.55)'; for(let y=0;y<32;y+=4){ x.fillRect(0,y+3,32,1); for(let v=0;v<32;v+=8) x.fillRect(v+((y/4)%2?4:0),y,1,3); } }));
}
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
    wallImages();
    origFilters['wall-3d']=['!',['has','pat']]; origFilters['wall-pat']=['has','pat'];
    map.addLayer({id:'wall-3d',type:'fill-extrusion',source:'walls',filter:origFilters['wall-3d'],
      paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-base':['get','b'],'fill-extrusion-height':['get','h'],'fill-extrusion-opacity':1}},before);
    // houses: their siding / brick texture (no colour of their own, the texture carries it)
    map.addLayer({id:'wall-pat',type:'fill-extrusion',source:'walls',filter:origFilters['wall-pat'],
      paint:{'fill-extrusion-pattern':['get','pat'],'fill-extrusion-base':['get','b'],'fill-extrusion-height':['get','h'],'fill-extrusion-opacity':1}},before);
    map.addLayer({id:'wall-cap',type:'fill-extrusion',source:'walls',
      paint:{'fill-extrusion-color':['get','cc'],'fill-extrusion-base':['get','h'],'fill-extrusion-height':['+',['get','h'],.35],'fill-extrusion-vertical-gradient':false}},before);
    origFilters['wall-cap']=null; for(const id of ['wall-3d','wall-pat','wall-cap']) hideIds.push(id);
    blockIds.push('wall-3d','wall-pat');                             // you still bump into them (screen check without terrain)
    if(destroyed.length||HIDE.walk!=null) applyHides(['wall-3d','wall-pat','wall-cap']);
  }
  if(!map.getSource('roofs')){
    map.addSource('roofs',{type:'geojson',data:{type:'FeatureCollection',features:[]},maxzoom:19,tolerance:0,buffer:16,promoteId:'gk'});
    // garage doors (prop gk) roll up by feature state o (0 shut .. 1 open, js/enh/garage.js): the panel's bottom rises gr metres
    // garage door panels (gt: the opening's top) slide up together and fold away at the top, like a sectional door
    const up=['*',['coalesce',['feature-state','o'],0],['coalesce',['get','gr'],0]], gt=['coalesce',['get','gt'],1e4];
    map.addLayer({id:'roof-3d',type:'fill-extrusion',source:'roofs',
      paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-base':['min',['+',['get','b'],up],gt],'fill-extrusion-height':['min',['+',['get','h'],up],gt],'fill-extrusion-vertical-gradient':false}},before);
  }
  /* the pools of light the accent fixtures throw on school and shop walls (owner 2026-11-23): a night-only layer of thin
     slices hugging the wall, so by day there is nothing to see */
  if(!map.getSource('accent-wash')){
    map.addSource('accent-wash',{type:'geojson',data:{type:'FeatureCollection',features:[]},maxzoom:19,tolerance:0});
    map.addLayer({id:'accent-wash',type:'fill-extrusion',source:'accent-wash',layout:{visibility:night&&!POWER?'visible':'none'},
      paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-base':['get','b'],'fill-extrusion-height':['get','h'],'fill-extrusion-opacity':.85,'fill-extrusion-vertical-gradient':false}},before);
  }
  // after dark, a soft warm pool of light on the ground under each lit porch / garage light (owner 2026-11-23). Radius
  // in metres: prop r is metres / cos(latitude), turned into pixels by zoom (a map pixel is 2x smaller each zoom level)
  if(!map.getSource('porch-glow')){
    map.addSource('porch-glow',{type:'geojson',data:{type:'FeatureCollection',features:[]},maxzoom:19,tolerance:0});
    const ppm=z=>512*2**z/40075017, rad=['interpolate',['exponential',2],['zoom'],12,['*',['get','r'],ppm(12)],22,['*',['get','r'],ppm(22)]];
    map.addLayer({id:'porch-glow',type:'circle',source:'porch-glow',minzoom:15,filter:['>',['get','r'],0],layout:{visibility:night&&!POWER?'visible':'none'},
      paint:{'circle-radius':rad,'circle-color':'#ffcf80','circle-opacity':.5,'circle-blur':1,'circle-pitch-alignment':'map','circle-pitch-scale':'map'}},
      map.getLayer('wall-3d')?'wall-3d':'roof-3d');
  }
}

/* ---------- geometry helpers (local metres around a reference point) ---------- */
function hash(a,b){ let h=(a*374761393+b*668265263)>>>0; h=Math.imul(h^(h>>>13),1274126177)>>>0; return ((h^(h>>>16))>>>0)/4294967296; }
const DORS=seed=>DOORS[seed%DOORS.length];
function shade(hex,k){ const n=parseInt(hex.slice(1),16), f=c=>Math.max(0,Math.min(255,Math.round(c+(k>0?(255-c)*k:c*k)))).toString(16).padStart(2,'0');
  return '#'+f(n>>16)+f((n>>8)&255)+f(n&255); }
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
const W={sig:'',hid:new Set(),n:0,ms:0,cache:new Map()};
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
/* school / industrial grounds near the car (vector landuse), for otherLook; refreshed with each build */
let ZONES=[], SCHOOLS=[];
function zones(kx,ky,R){ const out=[], sp=[];
  /* school points too: many school grounds aren't mapped as land use (Yorkville Grade School isn't), but the school is a map point */
  try{ for(const f of map.querySourceFeatures(bSrc,{sourceLayer:'poi',filter:['match',['get','class'],['school','college','university','kindergarten'],true,false]})){
      const c=f.geometry&&f.geometry.coordinates; if(c&&Math.abs(c[0]-S.lng)*kx<R&&Math.abs(c[1]-S.lat)*ky<R) sp.push([c[0],c[1]]); } }catch(e){}
  SCHOOLS=sp;
  try{ for(const f of map.querySourceFeatures(bSrc,{sourceLayer:'landuse',filter:['match',['get','class'],['school','college','university','kindergarten','education','industrial'],true,false]})){
      const z=f.properties.class==='industrial'?'industrial':'school', g=f.geometry, pls=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
      for(const pl of pls){ const r=pl[0]; if(!r) continue; let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const q of r){ if(q[0]<x0)x0=q[0]; if(q[0]>x1)x1=q[0]; if(q[1]<y0)y0=q[1]; if(q[1]>y1)y1=q[1]; }
        if(x1<S.lng-R/kx||x0>S.lng+R/kx||y1<S.lat-R/ky||y0>S.lat+R/ky) continue; out.push({z,r,bb:[x0,y0,x1,y1]}); } } }catch(e){}
  ZONES=out; }
function zoneAt(x,y,A,kx,ky){ let z=null;
  if(A>500){ const reach=Math.max(40,Math.sqrt(A)*.8); for(const q of SCHOOLS) if(Math.hypot((q[0]-x)*kx,(q[1]-y)*ky)<reach) return 'school'; } for(const o of ZONES){ if(x<o.bb[0]||x>o.bb[2]||y<o.bb[1]||y>o.bb[3]) continue; let c=false, r=o.r;
    for(let i=0,j=r.length-1;i<r.length;j=i++){ const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1]; if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi)) c=!c; }
    if(c){ if(o.z==='school') return 'school'; z=o.z; } } return z; }
function buildWalls(fs,geo,kx,ky,RW,gone){                          // geo[i]: fs[i].geometry, decoded once (each read decodes it again)
  const t0=performance.now(), minD=new Map();
  for(let i=0;i<fs.length;i++){ const f=fs[i]; if(f.id==null||gone.has(f.id)) continue; const g=geo[i]; if(!g) continue;
    const pls=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
    let m=minD.has(f.id)?minD.get(f.id):1e9;
    for(const pl of pls){ const r=pl[0]; if(!r||r.length<4) continue; const q=r[0], d=Math.hypot((q[0]-S.lng)*kx,(q[1]-S.lat)*ky); if(d<m) m=d; }
    minD.set(f.id,m); }
  const hid=new Set(); for(const [id,d] of minD) if(d<RW||(W.hid.has(id)&&d<RW+150)) hid.add(id);
  const feats=[], seen=new Set(), tiles=new Set();
  for(let i=0;i<fs.length;i++){ const f=fs[i]; if(!hid.has(f.id)) continue; const T=f.tile||{z:f._z,x:f._x,y:f._y}; if(T.z==null) continue;
    const tk=T.z+'/'+T.x+'/'+T.y; tiles.add(tk); const box=tileBox(T.z,T.x,T.y), g=geo[i]; if(!g) continue;
    const pls=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[], pr=f.properties||{};
    const h=+(pr.render_height!=null?pr.render_height:pr.height!=null?pr.height:6), b0=+(pr.render_min_height||pr.min_height||0);
    for(const pl of pls){ const r=pl[0]; if(!r||r.length<4) continue;
      const sk=tk+':'+r.length+':'+r[0][0]+','+r[0][1]+':'+h; if(seen.has(sk)) continue; seen.add(sk);
      const old=W.cache.get(sk); if(old!==undefined){ if(old){ old.id=f.id; feats.push(old); } continue; }
      const outer=clipRing(r,box); if(!outer){ W.cache.set(sk,null); continue; }
      let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const q of r){ if(q[0]<x0)x0=q[0]; if(q[0]>x1)x1=q[0]; if(q[1]<y0)y0=q[1]; if(q[1]>y1)y1=q[1]; }
      const cx=(x0+x1)/2, cy=(y0+y1)/2, A=Math.abs(area(r.slice(0,-1).map(q=>[(q[0]-cx)*kx,(q[1]-cy)*ky]))), seed=seedOf(cx,cy);
      const house=h<=12&&b0===0&&A>=25&&A<=450, L=house?houseLook(seed):null;
      const c=house?L.wall:h<=12?LOWC[Math.floor(hash(seed,59)*LOWC.length)]:h<=30?['#c8c4bc','#b3b8be','#d2c8b5','#bdb7ad','#a89f93'][seed%5]:['#9fb3c6','#8b9fb2','#a7b4bf'][seed%3];
      const rings=[outer]; for(const hr of pl.slice(1)){ const c2=clipRing(hr,box); if(c2) rings.push(c2); }
      const pr2={c,cc:house?L.roof:FLAT[seed%2],b:b0,h}; if(!POWER) pr2.pat=house?L.pat:otherLook(seed,h,zoneAt(cx,cy,A,kx,ky));
      if(!house&&window.STORES&&STORES.list.length){ const sl=STORES.look(cx,cy); if(sl){ pr2.c=sl.c; if(!POWER) pr2.pat=sl.pat; } }   // a Meijer (js/enh/stores.js)
      const ft={type:'Feature',id:f.id,properties:pr2,geometry:{type:'Polygon',coordinates:rings}};
      W.cache.set(sk,ft); feats.push(ft); } }
  if(W.cache.size>20000) W.cache.clear();
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
  const geo=fs.map(f=>f.geometry);
  if(map.getSource('walls')) safe('walls',()=>{ zones(kx,ky,radius+120); buildWalls(fs,geo,kx,ky,radius+60,gone); });
  safe('driveways',()=>{ const ds=[]; for(const f of map.querySourceFeatures(bSrc,{sourceLayer:'transportation'})){ const pr=f.properties||{};
      if(pr.class!=='service'||pr.service!=='driveway') continue; const g=f.geometry, ls=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
      for(const l of ls){ if(l.length<2) continue; let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const q of l){ if(q[0]<x0)x0=q[0]; if(q[0]>x1)x1=q[0]; if(q[1]<y0)y0=q[1]; if(q[1]>y1)y1=q[1]; }
        if(Math.hypot(((x0+x1)/2-S.lng)*kx,((y0+y1)/2-S.lat)*ky)<radius+150) ds.push({l,bb:[x0,y0,x1,y1]}); } }
    DRIVES=ds; });
  for(let i=0;i<fs.length;i++){ const f=fs[i];
    if(f.id!=null&&gone.has(f.id)) continue;
    const pr=f.properties||{}; if(pr.hide_3d) continue;
    const h=+(pr.render_height!=null?pr.render_height:pr.height!=null?pr.height:6), b0=+(pr.render_min_height||pr.min_height||0);
    const G=geo[i]; if(!G) continue; const polys=G.type==='Polygon'?[G.coordinates]:G.type==='MultiPolygon'?G.coordinates:[];
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
  const out=[], sig=[], reg=[], glow=[], wsh=[], t0=performance.now(), tb=POWER?6:10; let nh=0, nb=0, nf=0, budget=1e9, near=0; R.pending=false;
  // roofs are stacked slices (map extrusions can't slope): the nearest houses get thin slices, so up close the slope reads
  // as a smooth roof rather than a staircase (owner 2026-11-23: "sharpen the roofs so that they don't look like jagged shapes")
  const fine=Q3(14,20,26), nFine=Q3(20,35,50);
  for(const P of parts){
    if(P.b0>0||P.holes||crossesTile(P.bb)) continue;              // building parts, courtyards, tile-clipped pieces: flat
    const sl=P.h<=12&&near++<nFine&&P.d<130?fine:slices;
    const key=P.cx.toFixed(6)+','+P.cy.toFixed(6)+','+P.h+','+sl;
    let C=CACHE.get(key);
    if(!C){ if(performance.now()-t0>tb){ R.pending=true; continue; } C=roofFor(P,kx,ky,sl); tagId(C.feats,P); CACHE.set(key,C); }   // spread new work over ticks
    if(!C.fac&&nf<maxFac){ if(performance.now()-t0>tb){ R.pending=true; } else { safe('facades',()=>facades(P,kx,ky,C,sl===fine)); if(!C.fac) C.fac=[]; tagId(C.fac,P); } }
    if(C.house){ if(nh>=maxHouses) continue; nh++; } else if(C.feats.length||C.fac&&C.fac.length){ if(nb>=maxBig) continue; nb++; }
    for(const f of C.feats) out.push(f);
    let w=0; if(C.fac&&C.fac.length&&nf<maxFac){ nf++; w=1; for(const f of C.fac) out.push(f); if(C.bld) reg.push(C.bld); if(C.glow) for(const g of C.glow) glow.push(g); if(C.wash) for(const g of C.wash) wsh.push(g); }
    if(C.feats.length||w) sig.push(key+w);
  }
  const now=performance.now(), key=sig.join(';');
  if(key!==R.last&&!(R.pending&&R.count&&now-(R.setT||0)<2500)){
    const s=map.getSource('roofs'); if(s) s.setData({type:'FeatureCollection',features:out});
    const g=map.getSource('porch-glow'); if(g) safe('porch glow',()=>g.setData({type:'FeatureCollection',features:glow}));
    const aw=map.getSource('accent-wash'); if(aw) safe('accent wash',()=>aw.setData({type:'FeatureCollection',features:wsh}));
    safe('lamp glow',()=>lampsSet(glow)); R.last=key; R.setT=now; R.count=out.length; }
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
let DRIVES=[];
const SHUTTER=['#2b3440','#1f2a24','#3a2622','#2a2a2c','#4a3a2c','#33465a','#5a3030','#f1efe9'];
const LAMP=['#1d1e20','#1d1e20','#3a2c22','#2e3236','#ece9e2'], LGL='#e6dfc8';   // porch / garage light fixtures: black, bronze, charcoal, white; frosted glass
const GLASS='#27313e', FRAME='#eef0f1', DOORS=['#6b2f2a','#2f3e55','#3a3a3c','#5a4632','#f1efe9','#4d5b45'], GARAGE=['#f1efe9','#e5dfd3','#d8d3c9','#c9c2b6'];
function streetDir(P){                                            // unit vector from the building toward its nearest road
  if(typeof roadGeo==='undefined'||typeof rebuildRoadGeo!=='function') return null;
  if(!roadGeo.segs||meters(roadGeo.lat,roadGeo.lng,S.lat,S.lng)>350) rebuildRoadGeo();
  const segs=roadGeo.segs; if(!segs||!segs.length) return null;
  const kx=111320*Math.cos(roadGeo.lat*Math.PI/180), px=(P.cx-roadGeo.lng)*kx, py=(P.cy-roadGeo.lat)*111320;
  let best=1e9, bx=0, by=0;
  for(const [x1,y1,x2,y2] of segs){ const dx=x2-x1, dy=y2-y1, L2=dx*dx+dy*dy, t=L2?Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/L2)):0;
    const ex=x1+t*dx-px, ey=y1+t*dy-py, d=ex*ex+ey*ey; if(d<best){ best=d; bx=ex; by=ey; } }
  best=Math.sqrt(best); return best>2&&best<70?Object.assign([bx/best,by/best],{d:best}):null;   // .d: metres to that road
}
/* the garage goes where a driveway reaches the house (owner 2026-11-23: "make sure that garage doors line up with the
   driveways"): OpenStreetMap often maps driveways (service=driveway) up to the house. The driveway end nearest the house
   picks the wall and the spot along it. Returns {E,s} (E: a wall from edges, s: metres along it) or null. */
function driveSpot(P,edges,toLoc){
  const m=12/111320, B=P.bb; let best=null;
  for(const D of DRIVES){ const b=D.bb; if(b[2]<B[0]-m*1.4||b[0]>B[2]+m*1.4||b[3]<B[1]-m||b[1]>B[3]+m) continue;
    for(const end of [D.l[0],D.l[D.l.length-1]]){ const q=toLoc(end);
      for(const E of edges){ const dx=q[0]-E.a[0], dy=q[1]-E.a[1], s=dx*E.ux+dy*E.uy, out=dx*E.nx+dy*E.ny;
        if(s<-1||s>E.L+1||out<-3||out>9) continue;                // in front of this wall (or just inside it)
        const d=Math.abs(out); if(!best||d<best.d) best={E,s,d}; } } }
  return best;
}
/* a spot in the front yard (js/enh/snowmen.js): between the street-side wall and the road, clear of the garage, the
   front door's walk and any mapped driveway. Local metres around the house middle, plus the way to the street. */
function yardSpot(P,E,sd,free,seed,kx,ky){
  if(!sd||!sd.d) return null; const nd=E.nx*sd[0]+E.ny*sd[1]; if(nd<.6) return null;
  const wall=E.a[0]*E.nx+E.a[1]*E.ny, yard=sd.d/nd-wall-6.5;        // 6.5 m: half the street and the sidewalk
  if(yard<3.5) return null;
  const out=Math.min(9,Math.max(2.2,yard*(.35+.3*hash(seed,81))));
  const near=DRIVES.filter(D=>{ const b=D.bb, m=25/111320; return !(b[2]<P.bb[0]-m*1.4||b[0]>P.bb[2]+m*1.4||b[3]<P.bb[1]-m||b[1]>P.bb[3]+m); })
    .map(D=>D.l.map(q=>[(q[0]-P.cx)*kx,(q[1]-P.cy)*ky]));
  const clear=(x,y)=>{ for(const l of near) for(let i=1;i<l.length;i++){ const [x1,y1]=l[i-1],[x2,y2]=l[i], dx=x2-x1, dy=y2-y1, L2=dx*dx+dy*dy,
      t=L2?Math.max(0,Math.min(1,((x-x1)*dx+(y-y1)*dy)/L2)):0; if(Math.hypot(x1+t*dx-x,y1+t*dy-y)<2.8) return false; } return true; };
  for(const f of [.15+.7*hash(seed,83),.2,.8,.35,.65]){ const s=E.L*f;
    if(s<.8||s>E.L-.8||!free(E,s-.9,s+.9)) continue;
    const x=E.a[0]+E.ux*s+E.nx*out, y=E.a[1]+E.uy*s+E.ny*out; if(!clear(x,y)) continue;
    const tw=(hash(seed,87)-.5)*.9, c=Math.cos(tw), sn=Math.sin(tw);     // turned a little, not all square to the street
    return {x,y,fx:E.nx*c-E.ny*sn,fy:E.nx*sn+E.ny*c}; }
  return null;
}
function facades(P,kx,ky,res,rich){
  if(P.b0>0) return;
  let p=clean(P.ring.map(q=>[(q[0]-P.cx)*kx,(q[1]-P.cy)*ky])); if(p.length<3||p.length>80) return;
  if(area(p)<0) p.reverse();
  const A=area(p), house=P.h<=12&&A>=25&&A<=450, seed=(Math.floor(P.cx*1e5)^Math.floor(P.cy*1e5))>>>0, out=res.fac=[];
  if(!house&&A<80) return;                                        // sheds and kiosks: plain
  res.glow=[]; res.wash=[];
  const zone=house?null:zoneAt(P.cx,P.cy,A,kx,ky), school=zone==='school', industrial=zone==='industrial';
  const toLL=q=>[+(P.cx+q[0]/kx).toFixed(7),+(P.cy+q[1]/ky).toFixed(7)], frames=!POWER, fine=frames&&rich;                  // fine: the nearest houses get the small trim too
  // one shape standing out from a wall: along the wall from s0 to s1 (m), o0..o1 m out from it, z from b to h
  const put=(E,s0,s1,o0,o1,b,h,c,lit,arr)=>{ const a=[E.a[0]+E.ux*s0,E.a[1]+E.uy*s0], z=[E.a[0]+E.ux*s1,E.a[1]+E.uy*s1];
    const ring=[[a[0]+E.nx*o0,a[1]+E.ny*o0],[z[0]+E.nx*o0,z[1]+E.ny*o0],[z[0]+E.nx*o1,z[1]+E.ny*o1],[a[0]+E.nx*o1,a[1]+E.ny*o1]].map(toLL); ring.push(ring[0]);
    const pr={c,b:+b.toFixed(2),h:+h.toFixed(2)}; if(lit!=null) pr.lit=lit; (arr||out).push({type:'Feature',properties:pr,geometry:{type:'Polygon',coordinates:[ring]}}); };
  const window1=(E,s,w,b,h,k,tc)=>{ if(frames) put(E,s-w/2-.08,s+w/2+.08,.01,.05,b-.08,h+.08,tc||FRAME);
    put(E,s-w/2,s+w/2,.02,.08,b,h,GLASS,hash(seed,k)<(house?.45:.7)?1:0); };
  const edges=[];
  for(let i=0;i<p.length;i++){ const a=p[i], b=p[(i+1)%p.length], ex=b[0]-a[0], ey=b[1]-a[1], L=Math.hypot(ex,ey);
    if(L<2.4) continue; edges.push({a,L,ux:ex/L,uy:ey/L,nx:ey/L,ny:-ex/L}); }   // outward normal (outline runs counter-clockwise)
  if(!edges.length) return;
  /* accent lights (owner 2026-11-23): schools and commercial buildings, every one lit after dark. A fixture is a small
     dark body with a warm lens on the side it shines to, plus a scalloped pool of light on the wall (night-only layer
     'accent-wash', slices that widen away from the fixture) and a bright point in the car layer (see lampsSet). */
  const clA=Math.cos(P.cy*Math.PI/180), fxc=['#1d1e20','#2a2b2e','#3a2c22','#2e3236'][Math.floor(hash(seed,101)*4)], WASH=['#ffd48a','#f2c479','#d9a85e','#b8884a'];
  const wash=(E,s,w,b,h,i)=>put(E,s-w/2,s+w/2,.012,.03,b,h,WASH[Math.min(i,3)],null,res.wash);
  const gpt=(E,s,z,o,r)=>{ const L=toLL([E.a[0]+E.ux*s+E.nx*.34,E.a[1]+E.uy*s+E.ny*.34]), q=toLL([E.a[0]+E.ux*s+E.nx*o,E.a[1]+E.uy*s+E.ny*o]);
    res.glow.push({type:'Feature',properties:{r:+(r/clA).toFixed(2),lx:L[0],ly:L[1],z},geometry:{type:'Point',coordinates:q}}); };
  // z: fixture middle height; up / dn: slices of light above / below it (sh m tall each, widths ws); pool: ground pool radius at po m out
  const accent=(E,s,z,o)=>{ if(!frames||s<.35||s>E.L-.35) return;
    const up=o.up||0, dn=o.dn||0, sh=o.sh||.3, bw=o.bw||.07, bh=o.bh||.14, ws=o.ws||[.26,.6,1,1.4];
    put(E,s-bw,s+bw,0,.13,z-bh,z+bh,fxc);
    if(up) put(E,s-bw*.7,s+bw*.7,.03,.1,z+bh,z+bh+.04,LGL,2);
    if(dn) put(E,s-bw*.7,s+bw*.7,.03,.1,z-bh-.04,z-bh,LGL,2);
    for(let i=0;i<up;i++) wash(E,s,ws[i],z+bh+.04+i*sh,z+bh+.04+(i+1)*sh,i);
    for(let i=0;i<dn;i++) wash(E,s,ws[i],z-bh-.04-(i+1)*sh,z-bh-.04-i*sh,i);
    gpt(E,s,z,o.po||0,o.pool||0); };
  // a gooseneck light over a shop sign: an arm out from the wall, the lamp head shining down onto the wall below
  const gooseneck=(E,s,zt)=>{ if(!frames||s<.5||s>E.L-.5) return;
    put(E,s-.03,s+.03,0,.5,zt-.03,zt+.03,fxc); put(E,s-.13,s+.13,.3,.58,zt-.1,zt+.04,fxc); put(E,s-.1,s+.1,.34,.54,zt-.13,zt-.1,LGL,2);
    for(let i=0;i<3;i++){ const hh=zt-.13-i*.24, bb=Math.max(3.2,hh-.24); if(hh-bb>.04) wash(E,s,[.8,1.5,2.3][i],bb,hh,i); }
    gpt(E,s,zt-.1,1.4,0); };
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
    const floors=P.h<5.2?1:P.h<8.6?2:3, fh=Math.min(3.1,(P.h-.4)/floors), busy=new Map(), occupy=(E,a,b)=>{ let l=busy.get(E); if(!l) busy.set(E,l=[]); l.push([a,b]); };
    const free=(E,a,b)=>!(busy.get(E)||[]).some(z=>b>z[0]&&a<z[1]);
    /* porch and garage lights (owner 2026-11-23): one carriage-lantern style per house, so the porch light matches the
       ones beside the garage door; about 9 houses in 10 have them on after dark (lit 2), the rest are dark */
    const fx=LAMP[Math.floor(hash(seed,93)*LAMP.length)], on=hash(seed,97)<.9, cl=Math.cos(P.cy*Math.PI/180); res.glow=[];
    const lamp=(E,s,z,o,r)=>{ if(!frames||s-.13<.05||s+.13>E.L-.05) return;
      put(E,s-.07,s+.07,0,.03,z-.24,z+.2,fx);                       // wall plate
      put(E,s-.1,s+.1,.03,.21,z-.17,z-.13,fx);                      // lantern bottom
      put(E,s-.085,s+.085,.045,.195,z-.13,z+.1,LGL,on?2:0);         // glass
      if(fine) for(const d of [-.09,.07]) put(E,s+d,s+d+.02,.04,.2,z-.13,z+.1,fx);   // corner posts
      put(E,s-.125,s+.125,.02,.235,z+.1,z+.15,fx);                  // roof
      put(E,s-.035,s+.035,.1,.135,z+.15,z+.21,fx);                  // finial
      if(on){ const x=E.a[0]+E.ux*s+E.nx*o, y=E.a[1]+E.uy*s+E.ny*o, L=toLL([E.a[0]+E.ux*s+E.nx*.34,E.a[1]+E.uy*s+E.ny*.34]);
        res.glow.push({type:'Feature',properties:{r:+(r/cl).toFixed(2),lx:L[0],ly:L[1],z},geometry:{type:'Point',coordinates:toLL([x,y])}}); } };
    const trim=hash(seed,61)<.18?'#3b3f44':FRAME, shut=hash(seed,67)<.38?SHUTTER[Math.floor(hash(seed,71)*SHUTTER.length)]:null;
    // garage: where the driveway meets the house, else (most houses) at one end of the street side
    const ds=driveSpot(P,edges,q=>[(q[0]-P.cx)*kx,(q[1]-P.cy)*ky]);
    let gE=null, gs0=0, gw=0;
    if(ds&&ds.E.L>=3.4){ gE=ds.E; gw=ds.E.L>=8&&hash(seed,43)<.6?4.9:2.7; if(gw>gE.L-.8) gw=2.7; gs0=Math.max(.4,Math.min(gE.L-.4-gw,ds.s-gw/2)); }
    else if(front.L>=9&&hash(seed,31)<.75){ gE=front; gw=front.L>=13?4.9:2.7; gs0=hash(seed,37)<.5?.7:front.L-.7-gw; }
    if(gE){ const E=gE, s0=gs0, gcol=GARAGE[seed&3], GT=2.15;
      // a garage you can open (js/enh/garage.js): the dark inside shows behind the panels as they roll up
      const gk=seed*4+1, a=[E.a[0]+E.ux*s0,E.a[1]+E.uy*s0], mx=a[0]+E.ux*gw/2, my=a[1]+E.uy*gw/2;
      let depth=0; for(const q of p) depth=Math.max(depth,-((q[0]-mx)*E.nx+(q[1]-my)*E.ny));
      garages.push({ei:p.indexOf(E.a),s0,s1:s0+gw,x0:a[0],y0:a[1],x1:a[0]+E.ux*gw,y1:a[1]+E.uy*gw,nx:E.nx,ny:E.ny,gk,col:gcol,D:Math.max(4,Math.min(7.5,depth-.3))});
      put(E,s0+.05,s0+gw-.05,.004,.016,0,GT-.05,'#141518');
      // four sectional panels with a thin dark joint between them; some doors have a row of windows in the top panel
      const ph=GT/4, wins=fine&&hash(seed,73)<.35, rp=(f)=>Object.assign(out[out.length-1].properties,{gk,gr:1.95,gt:GT});
      for(let k=0;k<4;k++){ put(E,s0,s0+gw,.02,.1,k*ph+(k?.012:0),(k+1)*ph-.012,gcol); rp();
        if(fine&&!(wins&&k===3)) for(const z of [k*ph+ph*.22,k*ph+ph*.78-.04]){ put(E,s0+.12,s0+gw-.12,.1,.112,z,z+.04,shade(gcol,-.12)); rp(); } }   // raised panel edges
      if(wins){ const n=gw>4?8:4, ww=(gw-.5)/n; for(let i=0;i<n;i++){ const x=s0+.25+i*ww; put(E,x+.06,x+ww-.06,.1,.115,3*ph+.14,3*ph+.4,GLASS); rp(); } }
      if(fine){ put(E,s0-.14,s0,.0,.06,0,GT+.12,trim); put(E,s0+gw,s0+gw+.14,.0,.06,0,GT+.12,trim); put(E,s0-.14,s0+gw+.14,.0,.06,GT,GT+.12,trim);   // trim round the opening
      }
      for(const x of [s0-.42,s0+gw+.42]) lamp(E,x,1.95,1.2,3.2);                                                     // a light on each side of the garage door
      occupy(E,s0-.6,s0+gw+.6); }
    // front door on the street side, in the free part of the wall
    { const E=front, fr=(busy.get(E)||[])[0], span=fr?(fr[0]>E.L/2?[.8,fr[0]-.3]:[fr[1]+.3,E.L-.8]):[.8,E.L-.8];
      if(span[1]-span[0]>=1.6){ const s=(span[0]+span[1])/2+(fr?0:(hash(seed,41)-.5)*E.L*.3);
        const dk=door(E,s-.6,s+.6), dc=DORS(seed);
        if(frames){ put(E,s-.62,s+.62,.0,.06,0,2.32,trim); put(E,s-.74,s+.74,.0,.08,2.32,2.44,trim); }       // casing and head trim
        putD(E,s-.48,s+.48,.02,.09,0,2.1,dc,dk);
        if(fine){ for(const z of [[.25,.95],[1.15,1.85]]) for(const x of [[-.38,-.06],[.06,.38]]) put(E,s+x[0],s+x[1],.09,.105,z[0],z[1],shade(dc,.14));   // four raised panels
          put(E,s+.3,s+.36,.09,.15,.98,1.04,'#c9a64a');                                                                      // brass knob
          put(E,s-.9,s+.9,.0,1.15,0,.17,'#c4c1ba'); }                                                                        // concrete stoop
        lamp(E,s+.9,1.9,1.4,3.6);                                                                                          // porch light, matching the garage ones
        occupy(E,s-1,s+1.15); } }
    for(const E of edges) for(let f=0;f<floors;f++){
      const n=Math.floor((E.L-1.2)/2.9); if(n<1) continue; const step=(E.L)/(n+1), big=E===front&&f===0;
      for(let i=1;i<=n;i++){ const s=i*step, w=big?1.4:.95, b=f*fh+.9, h=b+(big?1.4:1.25);
        if(f===0&&!free(E,s-w/2-(shut?.55:0),s+w/2+(shut?.55:0))) continue;
        window1(E,s,w,b,h,k++,trim);
        if(fine){ put(E,s-.02,s+.02,.08,.1,b,h,trim); put(E,s-w/2,s+w/2,.08,.1,(b+h)/2-.02,(b+h)/2+.02,trim);          // muntins
          put(E,s-w/2-.14,s+w/2+.14,.0,.15,b-.14,b-.06,'#d9dbdc');                                                         // sill
          if(shut&&E===front&&!big) for(const z of [-1,1]){ const x=s+z*(w/2+.13); put(E,Math.min(x,x+z*.42),Math.max(x,x+z*.42),.02,.07,b-.02,h+.02,shut); } } } }
    if(res.bld) res.bld.yard=yardSpot(P,front,sd,free,seed,kx,ky);    // where a snowman could stand (js/enh/snowmen.js)
  } else if(school){
    // schools: a window on every floor of every wall (a pair of them 1.6+ m apart), an up-and-down accent light on the wall
    // between each two windows, glass doors in the middle of the street side with a light on each side of them
    const floors=Math.max(1,Math.round(P.h/3.8)), fh=P.h/floors, mid=front.L/2, sl=fine?3:2;
    for(const E of edges){ if(E.L<5) continue;
      const n=Math.max(1,Math.floor((E.L-1)/3.4)), step=E.L/n, w=Math.min(1.8,step-1.3);
      for(let f=0;f<floors;f++){ const b=f*fh+(fh>=3.3?1:.8), h=b+Math.min(1.6,fh-1.3); if(h<b+.5) continue;
        for(let i=0;i<n;i++){ const s=(i+.5)*step; if(E===front&&f===0&&front.L>=6&&Math.abs(s-mid)<1.7) continue; window1(E,s,w,b,h,k++,FRAME); }
        for(let i=1;i<n;i++){ const s=i*step; if(E===front&&f===0&&front.L>=6&&Math.abs(s-mid)<1.9) continue; accent(E,s,(b+h)/2,{up:sl,dn:sl}); } } }
    if(front.L>=6){ entrance(front,mid); for(const z of [-1,1]) accent(front,mid+z*1.7,2.7,{dn:3,pool:3.5,po:1.6}); }
  } else if(P.h<=12){
    // storefront: glass band on the street side (the middle 60% of very long walls), mullions every ~1.6 m
    const E=front, s0=E.L>40?E.L*.2:1, s1=E.L>40?E.L*.8:E.L-1;
    if(s1-s0>2){ put(E,s0,s1,.02,.08,.3,2.9,GLASS,hash(seed,5)<.8?1:0);
      if(frames) for(let s=s0;s<=s1+.01;s+=1.6) put(E,s-.05,s+.05,.08,.12,.3,2.9,'#b9bec4');
      put(E,s0-.2,s1+.2,.02,.5,2.9,3.2,'#d6d8da');                 // canopy fascia above the glass
      if(s1-s0>=2.4) entrance(E,(s0+s1)/2); }                       // the way in, in the middle of the glass
    for(const F of edges){ if(F===E||F.L<12||hash(seed,F.L|0)<.5) continue;   // a few high windows on some side walls
      const n=Math.min(6,Math.floor(F.L/8)); for(let i=1;i<=n;i++) window1(F,i*F.L/(n+1),1.6,P.h*.55,P.h*.55+1,k++); }
    // accent lights, all on after dark: goosenecks over the sign band, wall packs at the corners and on the long walls
    const zt=Math.min(4.1,P.h-.45);
    if(!industrial&&zt>=3.75&&s1-s0>2){ const gn=Math.max(1,Math.min(10,Math.floor((s1-s0)/(E.L>40?6:4.2)))); for(let i=0;i<gn;i++) gooseneck(E,s0+(i+.5)*(s1-s0)/gn,zt); }
    const pz=Math.min(3.5,P.h-.5), pack=(F,s)=>accent(F,s,pz,{dn:2,bw:.22,bh:.12,pool:5.5,po:2.4,ws:[.8,1.5],sh:.3});
    if(pz>=2.6){ if(E.L>=5){ pack(E,.9); pack(E,E.L-.9); }
      for(const F of edges){ if(F===E||F.L<8) continue; pack(F,F.L/2); if(F.L>=25){ pack(F,F.L*.22); pack(F,F.L*.78); } } }
  } else {
    // taller buildings: a ribbon of windows on every floor of every wall
    const floors=Math.min(12,Math.max(2,Math.round(P.h/3.6))), fh=P.h/floors;
    for(const E of edges){ if(E.L<3) continue;
      for(let f=0;f<floors;f++) put(E,.6,E.L-.6,.02,.08,f*fh+.9,f*fh+.9+Math.min(1.6,fh-1.2),GLASS,hash(seed+f,E.L|0)<.65?1:0); }
    if(front.L>=3) entrance(front,front.L/2);                       // a lobby entrance on the street side
    if(front.L>=6){ const mid=front.L/2, gn=Math.min(12,Math.max(2,Math.floor(front.L/4.5))), st=(front.L-1.6)/gn;   // uplights along the base, a light each side of the lobby
      for(let i=0;i<=gn;i++){ const s=.8+i*st; if(Math.abs(s-mid)<1.4) continue; accent(front,s,.2,{up:4,sh:.55,bw:.1,ws:[.3,.7,1.2,1.8]}); }
      for(const z of [-1,1]) accent(front,mid+z*1.7,2.8,{dn:3,pool:3.5,po:1.6}); }
  }
}
// after dark, the windows marked lit glow warm (a paint switch, nothing is rebuilt)
let night=null, openDk=null;
function paintRoofs(){ if(!map.getLayer('roof-3d')) return;
  let c=night?['match',['coalesce',['get','lit'],0],1,'#ffd27f',2,'#fff4cf',['get','c']]:['get','c'];   // 1: lit windows, 2: porch / garage lights
  if(openDk!=null) c=['case',['==',['coalesce',['get','dk'],-1],openDk],'#16181b',c];          // an open doorway: dark inside
  safe('roof colours',()=>map.setPaintProperty('roof-3d','fill-extrusion-color',c)); }
function setNight(on){ if(on===night||!map.getLayer('roof-3d')) return; night=on; paintRoofs(); glowVis(); LG.dirty=true; }
function glowVis(){ for(const id of ['porch-glow','accent-wash']) if(map.getLayer(id)) safe(id,()=>map.setLayoutProperty(id,'visibility',night&&!POWER?'visible':'none')); }
function openDoor(dk){ dk=dk==null?null:dk; if(dk===openDk) return; openDk=dk; paintRoofs(); }
onTick(2000,function litTick(){ const A=YD.AT; setNight(!!(A&&A.k>.55)); });

/* the lit lanterns themselves: the map shades its 3D shapes by its own (dim, bluish) night light, so a lantern drawn as a
   map shape can't look bright. Each lit one also gets a soft warm point of light in the car layer (drawn over the map,
   like the traffic), one draw call for all of them; the building blockers there (js/enh/traffic.js OCC) hide the ones
   behind a house. Positions are kept in metres from where the set was made, and the set is moved with the camera. */
const LG={pts:null,o:null,n:0,dirty:false,vis:false};
function lampTex(){ const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'), g=x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,250,232,1)'); g.addColorStop(.12,'rgba(255,236,180,.95)'); g.addColorStop(.35,'rgba(255,200,110,.35)'); g.addColorStop(1,'rgba(255,170,70,0)');
  x.fillStyle=g; x.fillRect(0,0,64,64); return new THREE.CanvasTexture(c); }
function lampsSet(glow){
  if(typeof THREE==='undefined'||typeof scene==='undefined') return;
  if(!LG.pts){ LG.pts=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({map:lampTex(),size:1,sizeAttenuation:true,transparent:true,
      depthWrite:false,blending:THREE.AdditiveBlending,color:0xffffff})); LG.pts.frustumCulled=false; LG.pts.renderOrder=5; LG.pts.visible=false; scene.add(LG.pts); }
  const ox=S.lng*MLNG, oy=S.lat*MLAT, e0=terrainOn?(map.transform.elevation||0):0, pos=[];
  for(const f of glow){ const q=f.properties; let el=0; if(terrainOn){ try{ el=(map.queryTerrainElevation([q.lx,q.ly])||0)+e0; }catch(e){} }
    pos.push(q.lx*MLNG-ox,q.z+el,-(q.ly*MLAT-oy)); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  LG.pts.geometry.dispose(); LG.pts.geometry=g; LG.o=[ox,oy]; LG.n=glow.length; LG.dirty=true;
}
FRAME_HOOKS.push(function lampGlow(){
  const P=LG.pts; if(!P) return false;
  const want=!!night&&!POWER&&LG.n>0&&mode!=='glider'&&!(window.WALK&&WALK.inside&&WALK.inside.rec);
  let changed=LG.dirty; LG.dirty=false;
  if(want!==P.visible){ P.visible=want; changed=true; }
  if(!want) return changed;
  const px=S.lng*MLNG, py=S.lat*MLAT, m=mpp(S.lat,S.zoom), b=rad(S.camB), sb=Math.sin(b), cb=Math.cos(b), e=terrainOn?(map.transform.elevation||0):0;
  const dx=LG.o[0]-px, dy=LG.o[1]-py;
  P.position.set((dx*cb-dy*sb)/m,-e/m,-(dx*sb+dy*cb)/m); P.rotation.set(0,b,0); P.scale.setScalar(1/m);
  P.material.size=1/m/Math.tan(rad(camera.fov)/2);                 // about 1 m across (three.js sizes points by half the screen height, not the lens)
  return changed;
});

onReady(function buildings(){
  safe('roof caps',addCaps);
  map.on('sourcedata',e=>{ if(e.sourceId===bSrc&&e.tile) R.tiles=true; });
  setTimeout(()=>safe('roofs',build),1500);
});
onTick(700,function roofTick(){
  if(!map.getSource('roofs')) return;
  if(mode==='glider'){ if(R.count){ safe('roofs off',()=>{ map.getSource('roofs').setData({type:'FeatureCollection',features:[]}); for(const id of ['porch-glow','accent-wash']){ const g=map.getSource(id); if(g) g.setData({type:'FeatureCollection',features:[]}); } }); R.count=0; R.at=null; R.last=''; } return; }
  const moved=R.at?meters(R.at[1],R.at[0],S.lat,S.lng):1e9, age=performance.now()-R.t;
  if(moved>(POWER?160:120)||destroyed.length!==R.n||(R.tiles&&age>(POWER?8000:5000))||R.pending) safe('roofs',build);
});
const prev=window.onPowerChange;
window.onPowerChange=(on)=>{ if(prev) prev(on); R.at=null; R.last=''; R.parts=null; CACHE.clear(); W.cache.clear(); W.sig=''; glowVis(); };   // also: wall textures off in battery saver   // slice count / unit count change
window.ROOFS={build,state:R,walls:W,doorsNear:()=>R.reg||[],openDoor};
})();
