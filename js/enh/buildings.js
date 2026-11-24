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
   Houses = up to 12 m tall, no business point inside, sized by land use (residential or unmapped up to 900 m², commercial only tiny, school/industrial never; isHouseA); split across map tiles or "building:part" pieces stay flat-roofed.
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
/* Traughber Junior High (owner 2026-11-23, an aerial photo): tan-orange brick walls under dark flat roofs */
const TRJ={wall:'#c58a5c',roof:'#2c2e34'};
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
  const brickPaint=x=>{ const r=(a,b)=>{ let h=(a*73856093^b*19349663)>>>0; return (h%1000)/1000; };
    for(let y=0;y<32;y+=4) for(let v=-8;v<32;v+=8){ const o=(y/4)%2?4:0; x.fillStyle=`rgba(${r(y,v)<.5?0:255},${r(y,v)<.5?0:220},${r(y,v)<.5?0:200},${.05+.08*r(v,y)})`; x.fillRect(v+o,y,8,4); }
    x.fillStyle='rgba(225,220,210,.55)'; for(let y=0;y<32;y+=4){ x.fillRect(0,y+3,32,1); for(let v=0;v<32;v+=8) x.fillRect(v+((y/4)%2?4:0),y,1,3); } };
  BRICK.forEach((c,i)=>mk('hw-br'+i,c,brickPaint)); mk('hw-trj',TRJ.wall,brickPaint);   // Traughber's tan-orange brick
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
      paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-base':['get','b'],'fill-extrusion-height':['get','h'],'fill-extrusion-opacity':1,'fill-extrusion-vertical-gradient':false}},before);
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
/* windows, doors and rooms are placed on the outline, so it must stay on the real wall: clean() above drops corners that
   turn less than ~3.4 degrees, which on a long wall (Meijer) moves the edge up to ~1 m off the wall — windows then sat
   inside the wall or hung out from it (owner 2026-11-23). This one only drops a corner that lies within 4 cm of the line
   between its neighbours, and never two in a row, so nothing can drift. */
function cleanTight(ring){
  let p=ring.slice(0,ring.length-1).filter((q,i,a)=>{ const r=a[(i+a.length-1)%a.length]; return Math.hypot(q[0]-r[0],q[1]-r[1])>.05; });
  for(let pass=0;pass<4&&p.length>3;pass++){ let gone=false;
    p=p.filter((q,i,a)=>{ if(gone){ gone=false; return true; } const r=a[(i+a.length-1)%a.length], t=a[(i+1)%a.length], ex=t[0]-r[0], ey=t[1]-r[1], l=Math.hypot(ex,ey);
      if(!l||Math.abs((q[0]-r[0])*ey-(q[1]-r[1])*ex)/l>.04) return true; gone=true; return false; }); }
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
let ZONES=[], SCHOOLS=[], POIS=[], ZSIG='';
/* map points that sit in a business or institution building (the OpenMapTiles poi classes seen round Yorkville and Joliet; gates, bollards,
   pools, parking, pitches and the like are points too, but not buildings) */
const BLDCLS=new Set(['shop','grocery','fast_food','restaurant','cafe','bar','pub','bank','pharmacy','dentist','doctors','clinic','hospital','office','car','car_repair','car_wash','fuel','hairdresser','beauty','laundry','library','post','town_hall','fire_station','police','courthouse','music','art_gallery','ice_cream','beer','alcohol_shop','clothing_store','department_store','bakery','butcher','florist','jewelry','furniture','hardware','convenience','lodging','hotel','motel','cinema','theatre','museum','veterinary','place_of_worship','fitness_centre','gym','bicycle','books','electronics','mobile_phone','optician','travel_agent','real_estate','insurance','marketplace','community_centre','social_facility','childcare','castle']);
function zones(kx,ky,R){ const out=[], sp=[];
  /* school points too: many school grounds aren't mapped as land use (Yorkville Grade School isn't), but the school is a map point */
  try{ for(const f of map.querySourceFeatures(bSrc,{sourceLayer:'poi',filter:['match',['get','class'],['school','college','university','kindergarten'],true,false]})){
      const c=f.geometry&&f.geometry.coordinates; if(c&&Math.abs(c[0]-S.lng)*kx<R&&Math.abs(c[1]-S.lat)*ky<R) sp.push([c[0],c[1],(f.properties&&(f.properties.name||f.properties['name:latin']))||'']); } }catch(e){}
  SCHOOLS=sp;
  /* what the buildings are used for, from the same map tiles every region has (owner 2026-11-24: "apply new features as broadly across
     the globe as possible"): shop / restaurant / bank / office points sitting in a footprint, and residential / commercial land use */
  const pp=[], seenP=new Set();
  try{ for(const f of map.querySourceFeatures(bSrc,{sourceLayer:'poi'})){ const c=f.geometry&&f.geometry.coordinates, k=f.properties&&f.properties.class;
      if(!c||typeof c[0]!=='number'||!BLDCLS.has(k)) continue; if(Math.abs(c[0]-S.lng)*kx>R||Math.abs(c[1]-S.lat)*ky>R) continue;
      const key=c[0].toFixed(6)+','+c[1].toFixed(6); if(seenP.has(key)) continue; seenP.add(key); pp.push([c[0],c[1],k]); } }catch(e){}
  POIS=pp;
  try{ for(const f of map.querySourceFeatures(bSrc,{sourceLayer:'landuse',filter:['match',['get','class'],['school','college','university','kindergarten','education','industrial','commercial','retail','residential','suburb','neighbourhood','quarter'],true,false]})){
      const cl=f.properties.class, z=cl==='industrial'?'industrial':(cl==='commercial'||cl==='retail')?'commercial':(cl==='residential'||cl==='suburb'||cl==='neighbourhood'||cl==='quarter')?'residential':'school', g=f.geometry, pls=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
      for(const pl of pls){ const r=pl[0]; if(!r) continue; let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const q of r){ if(q[0]<x0)x0=q[0]; if(q[0]>x1)x1=q[0]; if(q[1]<y0)y0=q[1]; if(q[1]>y1)y1=q[1]; }
        if(x1<S.lng-R/kx||x0>S.lng+R/kx||y1<S.lat-R/ky||y0>S.lat+R/ky) continue; out.push({z,r,bb:[x0,y0,x1,y1]}); } } }catch(e){}
  ZONES=out;
  const zs=ZONES.length+'/'+POIS.length+'/'+ZONES.reduce((a,o)=>a+o.r.length,0); if(zs!==ZSIG){ const first=ZSIG===''; ZSIG=zs; if(!first) try{ W.cache.clear(); W.sig=''; CACHE.clear(); R.at=null; R.last=''; R.parts=null; }catch(e){} }   // the classification changed as tiles streamed in: rebuild
  /* the school buildings round you, for the heights (owner 2026-11-23: "make a structure 2 story and even the gymnasium ceiling
     the proper height for schools"): a school is two storeys (the map's default 5 m is one), and the gymnasium — the one
     compact 700-3500 m2 building beside a school at least 2.5 times as big, the data doesn't say which one it is — is tall */
  SB=[]; GYM=new Set();
  try{ for(const f of map.querySourceFeatures(bSrc,{sourceLayer:'building'})){ const g=f.geometry, pls=!g?[]:g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
      for(const pl of pls){ const r=pl[0]; if(!r||r.length<4) continue; let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const q of r){ if(q[0]<x0)x0=q[0]; if(q[0]>x1)x1=q[0]; if(q[1]<y0)y0=q[1]; if(q[1]>y1)y1=q[1]; }
        const cx=(x0+x1)/2, cy=(y0+y1)/2; if(Math.abs(cx-S.lng)*kx>R||Math.abs(cy-S.lat)*ky>R) continue;
        const A=Math.abs(area(r.slice(0,-1).map(q=>[(q[0]-cx)*kx,(q[1]-cy)*ky]))); if(A<700||(f.properties&&+f.properties.render_min_height>0)) continue;
        if(zoneAt(cx,cy,A,kx,ky)!=='school') continue; const k=cx.toFixed(5)+','+cy.toFixed(5); if(SB.some(e=>e.k===k)) continue; SB.push({k,cx,cy,A,n:r.length-1}); } } }catch(e){}
  for(const e of SB){ if(e.A>3500||e.n>26) continue; if(!SB.some(b=>b!==e&&b.A>=e.A*2.5&&Math.hypot((b.cx-e.cx)*kx,(b.cy-e.cy)*ky)<250)) continue;
    if(SB.some(o=>o!==e&&o.A<=3500&&o.A>=700&&o.n<=26&&o.A>e.A&&Math.hypot((o.cx-e.cx)*kx,(o.cy-e.cy)*ky)<200)) continue; GYM.add(e.k); }
  const sg=SB.map(e=>e.k+(GYM.has(e.k)?'g':'')).sort().join(';'); if(sg!==SBSIG){ SBSIG=sg; try{ W.cache.clear(); W.sig=''; }catch(e){} } }
let SB=[], GYM=new Set(), SBSIG='';
const isGym=(cx,cy)=>GYM.has(cx.toFixed(5)+','+cy.toFixed(5));
// a school's height: two storeys where the map has the one-storey default, the gymnasium taller
function schoolH(cx,cy,A,h,b0,kx,ky){ if(b0>0||A<700||!SB.length) return h; if(isGym(cx,cy)) return Math.max(h,11.5);
  if(h>7||zoneAt(cx,cy,A,kx,ky)!=='school') return h; return 8.2; }
/* school colours (owner 2026-11-23): Oswego High School's accent lights are its colours, orange shining up and navy down.
   up / dn = wash slice colours from the fixture outward. Matched by the school's map-point name near the building. */
const SCHCOL=[{re:/oswego (east |community )?high/i,up:['#ff8a1a','#ff7a00','#f06400','#c24d00'],dn:['#3b63ff','#2d50f0','#2342c8','#1a3290']}];
function schoolCols(x,y,kx,ky){ for(const q of SCHOOLS){ if(!q[2]||Math.hypot((q[0]-x)*kx,(q[1]-y)*ky)>300) continue; for(const c of SCHCOL) if(c.re.test(q[2])) return c; } return null; }
const TRJS=r=>{ const T=window.TRJ; return !!(T&&T.skip&&T.skip(r)); }, TRJV=()=>{ const T=window.TRJ; return (HIDE.pin||[]).length+'|'+(T&&T.ver?T.ver():0); };   // (window.TRJ: this file's own TRJ is the colours)   // Traughber's own pieces (js/enh/traughber.js)
function isTrj(x,y,kx,ky){ for(const q of SCHOOLS) if(q[2]&&/traughber/i.test(q[2])&&Math.hypot((q[0]-x)*kx,(q[1]-y)*ky)<240) return true; return false; }
function zoneAt(x,y,A,kx,ky){ let z=null;
  if(A>500){ const reach=Math.max(40,Math.sqrt(A)*.8); for(const q of SCHOOLS) if(Math.hypot((q[0]-x)*kx,(q[1]-y)*ky)<reach) return 'school'; } for(const o of ZONES){ if(x<o.bb[0]||x>o.bb[2]||y<o.bb[1]||y>o.bb[3]) continue; let c=false, r=o.r;
    for(let i=0,j=r.length-1;i<r.length;j=i++){ const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1]; if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi)) c=!c; }
    if(c){ if(o.z==='school') return 'school'; if(z==null||ZR[o.z]>ZR[z]) z=o.z; } } return z; }
const ZR={residential:1,commercial:2,industrial:3};
/* a business or institution point in (or at the door of) this footprint */
function poiAt(x,y,A,kx,ky){ const rad=Math.sqrt(A)*.5+3; for(const q of POIS) if(Math.abs((q[0]-x)*kx)<rad&&Math.abs((q[1]-y)*ky)<rad&&Math.hypot((q[0]-x)*kx,(q[1]-y)*ky)<rad) return true; return false; }
// a house: up to 12 m, 25-450 m2, or up to 900 m2 where no school/shop/industrial zone covers it (owner 2026-11-24: a 486 m2 house
// with many wings, 353 Emily Ct, got a flat roof and rooftop units)
/* a house: up to 12 m, no business point in it, and sized by what the land around it is used for (owner 2026-11-24: a 486 m2 house with
   many wings, 353 Emily Ct, got a flat roof and rooftop units; now land use and shop points decide, not size alone):
   residential land use up to 900 m2; unmapped land use up to 900 m2; commercial land use only the tiny ones; school / industrial grounds never. */
const isHouseA=(h,b0,A,cx,cy,kx,ky)=>{ if(h>12||b0!==0||A<25) return false;
  const z=zoneAt(cx,cy,A,kx,ky); if(z==='school'||z==='industrial') return false;
  if(A>100&&poiAt(cx,cy,A,kx,ky)) return z==='residential'&&A<=250;     // a home office or a corner shop in a house block
  if(z==='commercial') return A<=120;
  return A<=900; };
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
      if(TRJS(r)) continue;                                            // a piece of Traughber: js/enh/traughber.js draws its own
      const old=W.cache.get(sk); if(old!==undefined){ if(old){ old.id=f.id; feats.push(old); } continue; }
      const outer=clipRing(r,box); if(!outer){ W.cache.set(sk,null); continue; }
      let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const q of r){ if(q[0]<x0)x0=q[0]; if(q[0]>x1)x1=q[0]; if(q[1]<y0)y0=q[1]; if(q[1]>y1)y1=q[1]; }
      const cx=(x0+x1)/2, cy=(y0+y1)/2, A=Math.abs(area(r.slice(0,-1).map(q=>[(q[0]-cx)*kx,(q[1]-cy)*ky]))), seed=seedOf(cx,cy), hS=schoolH(cx,cy,A,h,b0,kx,ky);
      const house=isHouseA(h,b0,A,cx,cy,kx,ky), L=house?houseLook(seed):null;
      const c=house?L.wall:h<=12?LOWC[Math.floor(hash(seed,59)*LOWC.length)]:h<=30?['#c8c4bc','#b3b8be','#d2c8b5','#bdb7ad','#a89f93'][seed%5]:['#9fb3c6','#8b9fb2','#a7b4bf'][seed%3];
      const rings=[outer]; for(const hr of pl.slice(1)){ const c2=clipRing(hr,box); if(c2) rings.push(c2); }
      const trj=!house&&A>=60&&isTrj(cx,cy,kx,ky);
      const pr2={c:trj?TRJ.wall:c,cc:house?L.roof:trj?TRJ.roof:FLAT[seed%2],b:b0,h:hS}; if(!POWER) pr2.pat=house?L.pat:trj?'hw-trj':otherLook(seed,h,zoneAt(cx,cy,A,kx,ky));
      const ft={type:'Feature',id:f.id,properties:pr2,geometry:{type:'Polygon',coordinates:rings}};
      W.cache.set(sk,ft); feats.push(ft); } }
  if(W.cache.size>20000) W.cache.clear();
  const sig=[...hid].sort().join(',')+'|'+[...tiles].sort().join(',')+'|'+TRJV();
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
  const kx=111320*Math.cos(S.lat*Math.PI/180), ky=111320, gone=new Set(destroyed), seen=new Set(), seenP=new Map();
  let parts=[];
  const reuse=R.pending&&R.parts&&R.pAt&&meters(R.pAt[1],R.pAt[0],S.lat,S.lng)<40&&R.n===destroyed.length&&R.pin===TRJV();
  if(reuse) parts=R.parts; else {
  let fs=[]; try{ fs=map.querySourceFeatures(bSrc,{sourceLayer:'building'}); }catch(e){ return; }
  const geo=fs.map(f=>f.geometry);
  if(map.getSource('walls')) safe('walls',()=>{ zones(kx,ky,radius+120); buildWalls(fs,geo,kx,ky,radius+60,gone); });
  safe('driveways',()=>{ const ds=[], wk=[]; for(const f of map.querySourceFeatures(bSrc,{sourceLayer:'transportation'})){ const pr=f.properties||{};
      const walk=pr.class==='path'&&pr.subclass!=='cycleway', drv=pr.class==='service'&&(pr.service==='driveway'||(!pr.service&&true))||(pr.class==='path'&&pr.subclass==='footway'&&pr.service==='driveway');
      if(!walk&&!drv) continue; const g=f.geometry, ls=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
      for(const l of ls){ if(l.length<2) continue; let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9,len=0; for(let i=0;i<l.length;i++){ const q=l[i]; if(q[0]<x0)x0=q[0]; if(q[0]>x1)x1=q[0]; if(q[1]<y0)y0=q[1]; if(q[1]>y1)y1=q[1]; if(i) len+=Math.hypot((q[0]-l[i-1][0])*kx,(q[1]-l[i-1][1])*ky); }
        if(Math.hypot(((x0+x1)/2-S.lng)*kx,((y0+y1)/2-S.lat)*ky)>=radius+150) continue;
        if(walk) wk.push({l,bb:[x0,y0,x1,y1]});
        else if(pr.service==='driveway'||pr.class==='path'||len<=40) ds.push({l,bb:[x0,y0,x1,y1],sf:pr.surface||''}); } }    // an untagged short service way is most often a driveway
    DRIVES=ds; WALKS=wk; });
  for(let i=0;i<fs.length;i++){ const f=fs[i];
    if(f.id!=null&&gone.has(f.id)) continue;
    const pr=f.properties||{}; if(pr.hide_3d) continue;
    let h=+(pr.render_height!=null?pr.render_height:pr.height!=null?pr.height:6); const b0=+(pr.render_min_height||pr.min_height||0), h0=h;
    const G=geo[i]; if(!G) continue; const polys=G.type==='Polygon'?[G.coordinates]:G.type==='MultiPolygon'?G.coordinates:[];
    for(const pl of polys){ const ring=pl[0]; if(!ring||ring.length<4||TRJS(ring)) continue;
      let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const q of ring){ if(q[0]<x0)x0=q[0]; if(q[0]>x1)x1=q[0]; if(q[1]<y0)y0=q[1]; if(q[1]>y1)y1=q[1]; }
      const cx=(x0+x1)/2, cy=(y0+y1)/2, d=Math.hypot((cx-S.lng)*kx,(cy-S.lat)*ky); if(d>radius) continue;
      h=h0; if(b0===0&&h<=12&&SB.length) h=schoolH(cx,cy,Math.abs(area(ring.slice(0,-1).map(q=>[(q[0]-cx)*kx,(q[1]-cy)*ky]))),h,b0,kx,ky);   // schools: two storeys, a tall gym
      const key=cx.toFixed(6)+','+cy.toFixed(6); if(seen.has(key)){ const o=seenP.get(key); if(o&&o.ring.length===ring.length) o.intact=true; continue; } seen.add(key);     // same building in two tiles
      /* intact: two tiles each hold the whole outline (same corners), so it only crosses a tile edge — it isn't a clipped fragment
         (a school 140 m wide on a tile edge got no windows, doors or lights: owner 2026-11-23, Traughber Junior High) */
      const part={f,ring,h,b0,cx,cy,d,bb:[x0,y0,x1,y1],holes:pl.length>1}; seenP.set(key,part); parts.push(part);
      { const T=f.tile||{z:f._z,x:f._x,y:f._y};                 // or all of it lies within a hair of its own tile (inside the tile's buffer): a piece cut off at the buffer edge reaches 1.0156 or more
        if(T&&T.z!=null){ const n=1<<T.z, u0=(x0+180)/360*n-T.x, u1=(x1+180)/360*n-T.x, sy=la=>{ const sn=Math.sin(la*Math.PI/180); return (.5-Math.log((1+sn)/(1-sn))/(4*Math.PI))*n-T.y; }, v0=sy(y1), v1=sy(y0);
          if(Math.min(u0,v0)>-.0125&&Math.max(u1,v1)<1.0125) part.intact=true; } } }
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
    if(P.b0>0||P.holes||(crossesTile(P.bb)&&!P.intact)) continue;              // building parts, courtyards, tile-clipped pieces: flat
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
  R.at=[S.lng,S.lat]; R.t=now; R.n=destroyed.length; R.pin=TRJV(); R.tiles=false; R.reg=reg;
}
// roof pieces carry rf:1 (js/enh/snowcover.js whitens only those when snow settles); every roof / facade piece carries its own building's key (prop bk, its middle), so walking inside one can hide just
// that building's pieces (not by id: OpenFreeMap gives a whole group of neighbouring buildings one id)
function tagId(fs,P){ const bk=P.cx.toFixed(6)+','+P.cy.toFixed(6); for(const f of fs) f.properties.bk=bk; }
// one building's roof features (cached by position, so each is only worked out once)
const CACHE=new Map();
/* a house with wings (an L, a T, a garage jutting out): the outline is cut into the biggest rectangles that fit inside it
   (all outline edges must run along the long axis or across it), and every rectangle gets its own gable or hip roof, its ridge
   along its long side, the same pitch everywhere. The roofs are stacked slices, so where two wings meet the higher one wins
   and the valley between them forms by itself. Returns features, or null (angled walls, too many wings: the old shrinking roof). */
function wingRoof(p,B,slices,pitch,seed,c,top,toLL){
  const U=p.map(q=>[q[0]*B.c+q[1]*B.s,-q[0]*B.s+q[1]*B.c]), n=U.length;
  for(let i=0;i<n;i++){ const a=U[i], b=U[(i+1)%n], dx=b[0]-a[0], dy=b[1]-a[1], l=Math.hypot(dx,dy); if(l>=2.5&&Math.min(Math.abs(dx),Math.abs(dy))/l>.1) return null; }
  const uniq=a=>{ a=a.slice().sort((x,y)=>x-y); const o=[a[0]]; for(const x of a) if(x-o[o.length-1]>.35) o.push(x); return o; };
  const us=uniq(U.map(q=>q[0])), vs=uniq(U.map(q=>q[1])), nu=us.length-1, nv=vs.length-1; if(nu<1||nv<1||nu*nv>420) return null;
  const g=[], P=[]; for(let i=0;i<=nu;i++){ g.push([]); P.push(new Array(nv+1).fill(0)); }
  for(let i=0;i<nu;i++) for(let j=0;j<nv;j++) g[i][j]=inside(U,(us[i]+us[i+1])/2,(vs[j]+vs[j+1])/2)?1:0;
  for(let i=0;i<nu;i++) for(let j=0;j<nv;j++) P[i+1][j+1]=g[i][j]+P[i][j+1]+P[i+1][j]-P[i][j];
  const cnt=(i0,i1,j0,j1)=>P[i1+1][j1+1]-P[i0][j1+1]-P[i1+1][j0]+P[i0][j0], full=(i0,i1,j0,j1)=>cnt(i0,i1,j0,j1)===(i1-i0+1)*(j1-j0+1);
  const rects=[];
  for(let i0=0;i0<nu;i0++) for(let i1=i0;i1<nu;i1++) for(let j0=0;j0<nv;j0++){ if(!full(i0,i1,j0,j0)) continue;
    for(let j1=j0;j1<nv&&full(i0,i1,j0,j1);j1++){
      if((i0>0&&full(i0-1,i1,j0,j1))||(i1<nu-1&&full(i0,i1+1,j0,j1))||(j0>0&&full(i0,i1,j0-1,j1))||(j1<nv-1&&full(i0,i1,j0,j1+1))) continue;   // not the biggest
      rects.push([i0,i1,j0,j1]); } }
  const cov=g.map(r=>r.map(()=>0)), cellA=(i,j)=>(us[i+1]-us[i])*(vs[j+1]-vs[j]), pick=[];
  for(let guard=0;guard<12;guard++){ let best=null, ba=0;
    for(const r of rects){ let a=0; for(let i=r[0];i<=r[1];i++) for(let j=r[2];j<=r[3];j++) if(!cov[i][j]&&g[i][j]) a+=cellA(i,j); if(a>ba+1e-6){ ba=a; best=r; } }
    if(!best||ba<1.2) break; pick.push(best); for(let i=best[0];i<=best[1];i++) for(let j=best[2];j<=best[3];j++) cov[i][j]=1; }
  for(let i=0;i<nu;i++) for(let j=0;j<nv;j++) if(g[i][j]&&!cov[i][j]&&cellA(i,j)>=1.2) return null;       // something left uncovered: don't guess
  if(!pick.length||pick.length>9) return null;
  pick.sort((a,b)=>(b[1]-b[0]+1)*(b[3]-b[2]+1)-(a[1]-a[0]+1)*(a[3]-a[2]+1));
  const out=[], oh=.3;
  pick.forEach((r,idx)=>{ const u0=us[r[0]], u1=us[r[1]+1], v0=vs[r[2]], v1=vs[r[3]+1], Lr=u1-u0, Wr=v1-v0, alongU=Lr>=Wr, lg=Math.max(Lr,Wr), sh=Math.min(Lr,Wr);
    if(sh<2.2) return;                                           // a porch or a bump: leave it flat
    const half=sh/2, rise=Math.min(4.2,half*pitch), gable=lg/sh>1.15&&hash(seed+idx*7,3)<(idx?.9:.62), um=(u0+u1)/2, vm=(v0+v1)/2;
    for(let k=0;k<slices;k++){ const t=k/slices, hv=(half+oh)*(1-t), hu=gable?lg/2+oh:Math.max(hv,lg/2+oh-(half+oh)*t); if(hv<.15) break;
      const ring=(alongU?boxRing(B,um-hu,um+hu,vm-hv,vm+hv):boxRing(B,um-hv,um+hv,vm-hu,vm+hu)).map(toLL); ring.push(ring[0]);
      out.push({type:'Feature',properties:{c:shade(c,-.1+.2*t),rf:1,b:top+rise*t,h:top+rise*(k+1)/slices},geometry:{type:'Polygon',coordinates:[ring]}}); } });
  return out.length?out:null;
}
function roofFor(P,kx,ky,slices){ return roofParts(P,kx,ky,slices); }
function roofParts(P,kx,ky,slices){
  const out=[], res={house:false,feats:out};
  {
    let p=clean(P.ring.map(q=>[(q[0]-P.cx)*kx,(q[1]-P.cy)*ky])); if(p.length<3) return res;
    if(area(p)<0) p.reverse();
    const A=area(p), toLL=q=>[+(P.cx+q[0]/kx).toFixed(7),+(P.cy+q[1]/ky).toFixed(7)], top=P.h+.35;
    const idn=Math.abs(Number(P.f.id)||0), seed=Math.floor(P.cx*1e5)^Math.floor(P.cy*1e5), house=isHouseA(P.h,0,A,P.cx,P.cy,kx,ky);
    if(house){
      if(p.length>80) return res;
      res.house=true;
      const c=houseLook(seedOf(P.cx,P.cy)).roof;
      const B=obb(p), L=B.u1-B.u0, Wd=B.v1-B.v0, rect=A/((L*Wd)||1), pitch=.5+.14*hash(seed,7);
      const half=Wd/2, rise=Math.min(4.2,half*pitch), um=(B.u0+B.u1)/2, vm=(B.v0+B.v1)/2;
      if(rect>=.85){                                              // gable (most) or hip on the box, 0.3 m eaves
        const gable=hash(seed,3)<.62&&L/Wd>1.15, oh=.3;
        for(let k=0;k<slices;k++){ const t=k/slices, hv=(half+oh)*(1-t), hu=gable?L/2+oh:Math.max(hv,L/2+oh-(half+oh)*t);
          if(hv<.15) break;
          const ring=boxRing(B,um-hu,um+hu,vm-hv,vm+hv).map(toLL); ring.push(ring[0]);
          out.push({type:'Feature',properties:{c:shade(c,-.1+.2*t),rf:1,b:top+rise*t,h:top+rise*(k+1)/slices},geometry:{type:'Polygon',coordinates:[ring]}}); }
      } else {                                                    // a house with wings: a roof for each wing, or a hip roof following the real outline
        const wr=wingRoof(p,B,slices,pitch,seed,c,top,toLL); if(wr){ for(const f of wr) out.push(f); return res; }
        if(p.length>40) return res;
        let lo=0, hi=half;                                        // how far the outline can shrink before a wing closes up
        for(let it=0;it<10;it++){ const m=(lo+hi)/2; if(inset(p,m)) lo=m; else hi=m; }
        if(lo<.6) return res;
        const rise2=Math.min(4.2,lo*pitch); let q=p;
        for(let k=0;k<slices&&q;k++){ const t=k/slices;
          const ring=q.map(toLL); ring.push(ring[0]);
          out.push({type:'Feature',properties:{c:shade(c,-.1+.2*t),rf:1,b:top+rise2*t,h:top+rise2*(k+1)/slices},geometry:{type:'Polygon',coordinates:[ring]}});
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
let DRIVES=[], WALKS=[];
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
        const d=Math.abs(out); if(!best||d<best.d) best={E,s,d,sf:D.sf,l:(end===D.l[0]?D.l:D.l.slice().reverse())}; } } }
  return best;
}
/* where a mapped footpath (a sidewalk spur, a path across the lawn or from a parking lot) ends at a wall: that is where the
   door is (owner 2026-11-24: "doors should be placed where sidewalks and driveway pads lead to the building"). Only a way's
   END counts, and only if it runs toward the wall: a sidewalk that runs along the street or past the building says nothing.
   Returns [{E,s,d}] nearest first (E: a wall from edges, s: metres along it, d: metres from the wall). */
function endSpots(P,edges,toLoc,lines){
  const m=14/111320, B=P.bb, res=[];
  for(const D of lines){ const b=D.bb; if(b[2]<B[0]-m*1.4||b[0]>B[2]+m*1.4||b[3]<B[1]-m||b[1]>B[3]+m) continue;
    const l=D.l; for(const [ei,pi] of [[0,1],[l.length-1,l.length-2]]){ const q=toLoc(l[ei]); let r=pi, pq=toLoc(l[r]);
      for(let k=0;k<3&&Math.hypot(q[0]-pq[0],q[1]-pq[1])<3&&r+(pi?1:-1)>=0&&r+(pi?1:-1)<l.length;k++){ r+=pi?1:-1; pq=toLoc(l[r]); }   // look 3 m back along the way
      const vx=q[0]-pq[0], vy=q[1]-pq[1], vl=Math.hypot(vx,vy)||1;
      for(const E of edges){ if(E.L<2.2) continue; const dx=q[0]-E.a[0], dy=q[1]-E.a[1], s=dx*E.ux+dy*E.uy, out=dx*E.nx+dy*E.ny;
        if(s<.4||s>E.L-.4||out<-1.5||out>7) continue;
        if((vx*E.nx+vy*E.ny)/vl>-.35) continue;                      // not heading at this wall
        res.push({E,s,d:Math.abs(out)}); } } }
  return res.sort((a,b)=>a.d-b.d);
}
// the wall that faces a parking lot (js/enh/parking.js), if there is one: the lot is probed 4 and 9 m out from three spots on each wall
function lotFront(P,edges,toLL,fallback){
  if(!window.PARKING||!PARKING.at) return null; let best=null, bs=0;
  for(const E of edges){ if(E.L<6) continue; let sc=0;
    for(const f of [.25,.5,.75]) for(const o of [4,9]){ const q=toLL([E.a[0]+E.ux*E.L*f+E.nx*o,E.a[1]+E.uy*E.L*f+E.ny*o]); if(PARKING.at(q[0],q[1])) sc+=1; }
    sc+=Math.min(E.L,40)/400; if(sc>bs&&sc>=1.1){ bs=sc; best=E; } }
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
  let p=cleanTight(P.ring.map(q=>[(q[0]-P.cx)*kx,(q[1]-P.cy)*ky])); if(p.length<3||p.length>400) return;                          /* was 80: a high school's outline has ~90 corners and got no windows or lights at all */
  if(area(p)<0) p.reverse();
  const A=area(p), house=isHouseA(P.h,0,A,P.cx,P.cy,kx,ky), seed=(Math.floor(P.cx*1e5)^Math.floor(P.cy*1e5))>>>0, out=res.fac=[];
  if(!house&&A<80) return;                                        // sheds and kiosks: plain
  res.glow=[]; res.wash=[];
  const zone=house?null:zoneAt(P.cx,P.cy,A,kx,ky), school=zone==='school', industrial=zone==='industrial';
  const toLL=q=>[+(P.cx+q[0]/kx).toFixed(7),+(P.cy+q[1]/ky).toFixed(7)], frames=!POWER, fine=frames&&rich;                  // fine: the nearest houses get the small trim too
  // one shape standing out from a wall: along the wall from s0 to s1 (m), o0..o1 m out from it, z from b to h
  const put=(E,s0,s1,o0,o1,b,h,c,lit,arr)=>{ const a=[E.a[0]+E.ux*s0,E.a[1]+E.uy*s0], z=[E.a[0]+E.ux*s1,E.a[1]+E.uy*s1];
    const ring=[[a[0]+E.nx*o0,a[1]+E.ny*o0],[z[0]+E.nx*o0,z[1]+E.ny*o0],[z[0]+E.nx*o1,z[1]+E.ny*o1],[a[0]+E.nx*o1,a[1]+E.ny*o1]].map(toLL); ring.push(ring[0]);
    const pr={c,b:+b.toFixed(2),h:+h.toFixed(2)}; if(lit!=null) pr.lit=lit; (arr||out).push({type:'Feature',properties:pr,geometry:{type:'Polygon',coordinates:[ring]}}); };
  const wins=[];                                                   // openings for the room inside (js/enh/walk.js cuts them in its walls)
  const window1=(E,s,w,b,h,k,tc)=>{ wins.push({ei:E.ei,s0:+(s-w/2+E.off).toFixed(2),s1:+(s+w/2+E.off).toFixed(2),b:+b.toFixed(2),h:+h.toFixed(2)}); if(frames) put(E,s-w/2-.08,s+w/2+.08,-.04,.06,b-.08,h+.08,tc||FRAME);
    put(E,s-w/2,s+w/2,-.04,.03,b,h,GLASS,hash(seed,k)<(house?.45:.7)?1:0); };
  // a school window (owner 2026-11-23: "make the windows look more like appropriate windows"): dark aluminium frame, a mullion
  // down the middle, a transom across the top third, tinted glass (the upper lights a shade darker) and a stone sill and head
  const SFR='#43484e', SSILL='#d9d5c9', SGL=['#2d4558','#223645'];
  const swin=(E,s,w,b,h,k)=>{ wins.push({ei:E.ei,s0:+(s-w/2+E.off).toFixed(2),s1:+(s+w/2+E.off).toFixed(2),b:+b.toFixed(2),h:+h.toFixed(2)}); if(!frames) return;
    const lit=hash(seed,k)<.6?1:0, tr=b+(h-b)*.7, f=.07;
    put(E,s-w/2-.1,s+w/2+.1,-.05,.06,b-.1,h+.1,SFR);                                  // frame
    put(E,s-w/2-.16,s+w/2+.16,-.05,.15,b-.17,b-.1,SSILL); put(E,s-w/2-.14,s+w/2+.14,-.05,.1,h+.1,h+.16,SSILL);   // sill, head
    put(E,s-w/2,s-f/2,-.02,.04,b,tr-f/2,SGL[0],lit); put(E,s+f/2,s+w/2,-.02,.04,b,tr-f/2,SGL[0],lit);          // lower panes
    put(E,s-w/2,s+w/2,-.02,.04,tr+f/2,h,SGL[1],lit);                                                            // transom light
    put(E,s-f/2,s+f/2,-.05,.08,b,h,SFR); put(E,s-w/2,s+w/2,-.05,.08,tr-f/2,tr+f/2,SFR); };                     // mullion, transom bar
  /* walls shared with a neighbouring building (a Meijer is several map pieces; shops and townhouses share party walls)
     are inside, not outside: nothing is drawn on them. Each edge is cut to the stretches that open to the outside. */
  const nb=[]; { const m=1.5/111320;
    for(const Q of R.parts||[]){ if(Q===P||Q.b0>0||(Q.cx===P.cx&&Q.cy===P.cy)) continue; const b=Q.bb; if(b[2]<P.bb[0]-m||b[0]>P.bb[2]+m||b[3]<P.bb[1]-m||b[1]>P.bb[3]+m) continue;
      const r=Q.ring.slice(0,-1).map(q=>[(q[0]-P.cx)*kx,(q[1]-P.cy)*ky]); let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const q of r){ if(q[0]<x0)x0=q[0]; if(q[0]>x1)x1=q[0]; if(q[1]<y0)y0=q[1]; if(q[1]>y1)y1=q[1]; }
      nb.push({r,x0,y0,x1,y1}); } }
  const shared=(x,y)=>{ for(const N of nb) if(x>=N.x0&&x<=N.x1&&y>=N.y0&&y<=N.y1&&inside(N.r,x,y)) return true; return false; };
  const edges=[];
  for(let i=0;i<p.length;i++){ const a=p[i], b=p[(i+1)%p.length], ex=b[0]-a[0], ey=b[1]-a[1], L=Math.hypot(ex,ey);
    if(L<2.4) continue; const ux=ex/L, uy=ey/L, nx=ey/L, ny=-ex/L;                    // outward normal (outline runs counter-clockwise)
    if(!nb.length){ edges.push({a,L,ux,uy,nx,ny,ei:i,off:0}); continue; }
    const n=Math.max(1,Math.ceil(L/.5)); let r0=null;                                  // walk along the wall: is a point just outside it inside a neighbour?
    for(let k=0;k<=n;k++){ const t=Math.min(L,k*L/n), open=k<n&&!shared(a[0]+ux*(t+L/n/2)+nx*.35,a[1]+uy*(t+L/n/2)+ny*.35);
      if(open&&r0===null) r0=t; if(!open&&r0!==null){ if(t-r0>=2.4) edges.push(r0<.01&&t>L-.01?{a,L,ux,uy,nx,ny,ei:i,off:0}:{a:[a[0]+ux*r0,a[1]+uy*r0],L:t-r0,ux,uy,nx,ny,ei:i,off:r0}); r0=null; } } } 
  if(!edges.length) return;
  if(edges.length>90){ for(let i=edges.length-1;i>=0;i--) if(edges[i].L<8) edges.splice(i,1); if(!edges.length) return; }   // very ragged outline: only the long walls
  /* accent lights (owner 2026-11-23): schools and commercial buildings, every one lit after dark. A fixture is a small
     dark body with a warm lens on the side it shines to, plus a scalloped pool of light on the wall (night-only layer
     'accent-wash', slices that widen away from the fixture) and a bright point in the car layer (see lampsSet). */
  const clA=Math.cos(P.cy*Math.PI/180), fxc=['#1d1e20','#2a2b2e','#3a2c22','#2e3236'][Math.floor(hash(seed,101)*4)], WASH=['#ffd48a','#f2c479','#d9a85e','#b8884a'];
  const SC=school?schoolCols(P.cx,P.cy,kx,ky):null;
  /* a school's up / down lights: orange up and navy down at Oswego High, plain white anywhere else, each pool fading as it
     climbs or falls (a palette per direction, bright at the fixture) */
  const shade=(h,f)=>'#'+[1,3,5].map(i=>Math.round(parseInt(h.substr(i,2),16)*f).toString(16).padStart(2,'0')).join('');
  const SPAL=!school?null:(()=>{ const base=SC?{up:SC.up[0],dn:SC.dn[0]}:{up:'#fffdf2',dn:'#fffdf2'}, o={}; for(const d of ['up','dn']){ o[d]=[]; for(let i=0;i<10;i++) o[d].push(shade(base[d],1-i*.035)); } return o; })();
  const wash=(E,s,w,b,h,i,dir)=>put(E,s-w/2,s+w/2,.05,.09,b,h,(SPAL&&dir?SPAL[dir][Math.min(i,9)]:WASH[Math.min(i,3)]),null,res.wash);
  const gpt=(E,s,z,o,r,col)=>{ const L=toLL([E.a[0]+E.ux*s+E.nx*.34,E.a[1]+E.uy*s+E.ny*.34]), q=toLL([E.a[0]+E.ux*s+E.nx*o,E.a[1]+E.uy*s+E.ny*o]);
    res.glow.push({type:'Feature',properties:Object.assign({r:+(r/clA).toFixed(2),lx:L[0],ly:L[1],z},col?{k:col}:{}),geometry:{type:'Point',coordinates:q}}); };
  // z: fixture middle height; up / dn: slices of light above / below it (sh m tall each, widths ws); pool: ground pool radius at po m out
  const accent=(E,s,z,o)=>{ if(!frames||s<.35||s>E.L-.35) return;
    const up=o.up||0, dn=o.dn||0, sh=o.sh||.3, bw=o.bw||.07, bh=o.bh||.14, ws=o.ws||[.26,.6,1,1.4];
    put(E,s-bw,s+bw,0,.13,z-bh,z+bh,fxc);
    if(up) put(E,s-bw*.7,s+bw*.7,.03,.1,z+bh,z+bh+.04,LGL,2);
    if(dn) put(E,s-bw*.7,s+bw*.7,.03,.1,z-bh-.04,z-bh,LGL,2);
    for(let i=0;i<up;i++) wash(E,s,ws[i],z+bh+.04+i*sh,z+bh+.04+(i+1)*sh,i,'up');
    for(let i=0;i<dn;i++) wash(E,s,ws[i],z-bh-.04-(i+1)*sh,z-bh-.04-i*sh,i,'dn');
    gpt(E,s,z,o.po||0,o.pool||0); };
  /* the school's accent light (owner 2026-11-23): a louvred housing with a lens strip on top and bottom — coloured at Oswego,
     white elsewhere, nothing in the middle — set between the first and second floor. Its light fills the wall right up to
     the roofline and down to the ground, in slices that widen away from the lens and fade. */
  const sfix=(E,s,z,top)=>{ if(!frames||s<.5||s>E.L-.5) return; const lu=SPAL.up[0], ld=SPAL.dn[0], bw=.13, sh=1.05, ws=i=>Math.min(3.2,.9+i*.42);
    put(E,s-bw-.04,s+bw+.04,0,.05,z-.3,z+.3,fxc);                                       // back plate
    put(E,s-bw,s+bw,.04,.26,z-.24,z+.24,fxc);                                            // housing
    for(const dz of [-.1,.1]) put(E,s-bw-.02,s+bw+.02,.2,.3,z+dz-.015,z+dz+.015,'#55585d');    // louvres
    put(E,s-bw*.8,s+bw*.8,.12,.27,z+.13,z+.22,lu,2); put(E,s-bw*.8,s+bw*.8,.12,.27,z-.22,z-.13,ld,2);   // lens strips
    put(E,s-bw-.02,s+bw+.02,.24,.34,z+.22,z+.25,fxc); put(E,s-bw-.02,s+bw+.02,.24,.34,z-.25,z-.22,fxc);  // hoods
    /* the light itself is a soft cone of colour on the wall, drawn in the car layer (lampsSet) because the map layer can't glow
       at night: a fan that starts at each lens and widens and fades as it goes, up to the roofline and down to the ground */
    const c0=toLL([E.a[0]+E.ux*s+E.nx*.3,E.a[1]+E.uy*s+E.ny*.3]);
    res.glow.push({type:'Feature',properties:{r:0,lx:c0[0],ly:c0[1],z,beam:1,tx:E.ux,ty:E.uy,nx:E.nx,ny:E.ny,top:+(top-.05).toFixed(2),bot:.1,ku:lu,kd:ld},geometry:{type:'Point',coordinates:c0}});
    gpt(E,s,z+.18,0,0,lu); gpt(E,s,z-.18,0,0,ld); };
  // a gooseneck light over a shop sign: an arm out from the wall, the lamp head shining down onto the wall below
  const gooseneck=(E,s,zt)=>{ if(!frames||s<.5||s>E.L-.5) return;
    put(E,s-.03,s+.03,0,.5,zt-.03,zt+.03,fxc); put(E,s-.13,s+.13,.3,.58,zt-.1,zt+.04,fxc); put(E,s-.1,s+.1,.34,.54,zt-.13,zt-.1,LGL,2);
    for(let i=0;i<3;i++){ const hh=zt-.13-i*.24, bb=Math.max(3.2,hh-.24); if(hh-bb>.04) wash(E,s,[.8,1.5,2.3][i],bb,hh,i); }
    gpt(E,s,zt-.1,1.4,0); };
  // the doors you can walk through (js/enh/walk.js): local metres around (cx,cy), on the outline p (counter-clockwise)
  const doors=[], garages=[]; let dn=0;
  const door=(E,s0,s1)=>{ const d={ei:E.ei,s0:s0+E.off,s1:s1+E.off,x0:E.a[0]+E.ux*s0,y0:E.a[1]+E.uy*s0,x1:E.a[0]+E.ux*s1,y1:E.a[1]+E.uy*s1,nx:E.nx,ny:E.ny,dk:seed*8+(dn++)};
    doors.push(d); return d.dk; };
  // glass entrance doors (stores, lobbies): dark frame, two glass leaves, push bars
  const entrance=(E,s)=>{ const dk=door(E,s-.95,s+.95);
    putD(E,s-.95,s+.95,-.04,.05,0,2.45,'#3b4048',dk);
    for(const z of [-1,1]){ putD(E,z<0?s-.87:s+.05,z<0?s-.05:s+.87,-.02,.03,.06,2.37,GLASS,dk); putD(E,z<0?s-.4:s+.1,z<0?s-.1:s+.4,.03,.07,1,1.06,'#c7ccd1'); } };
  const putD=(E,s0,s1,o0,o1,b,h,c,dk)=>{ put(E,s0,s1,o0,o1,b,h,c); if(dk!=null) out[out.length-1].properties.dk=dk; };
  if(P.f.id!=null) res.bld={key:P.cx.toFixed(6)+','+P.cy.toFixed(6),id:P.f.id,cx:P.cx,cy:P.cy,kx,ky,p,h:P.h,house,doors,garages,bb:P.bb,zone,area:A,win:wins,gym:school&&isGym(P.cx,P.cy)};
  const sd=(window.STORES&&STORES.list.length&&STORES.frontDir(P.cx,P.cy))||streetDir(P);   // a Meijer faces its parking lot (js/enh/stores.js)
  let front=edges[0]; for(const E of edges){ const sc=(sd?E.nx*sd[0]+E.ny*sd[1]:0)+.02*Math.min(E.L,12), fs=(sd?front.nx*sd[0]+front.ny*sd[1]:0)+.02*Math.min(front.L,12); if(sc>fs) front=E; }
  const toLoc=q=>[(q[0]-P.cx)*kx,(q[1]-P.cy)*ky], wkSpots=endSpots(P,edges,toLoc,WALKS);       // footpaths that end at a wall
  if(!house){ const lf=lotFront(P,edges,toLL); if(lf) front=lf; if(wkSpots.length&&wkSpots[0].E.L>=6&&!(lf&&lf!==wkSpots[0].E&&wkSpots[0].d>3)) front=wkSpots[0].E; }   // a store or school faces its parking lot, or the wall a path leads to
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
    /* garage (owner 2026-11-24: "based on the size of the garage and the pad that leads up to it, estimate the number of garage
       doors"): where the driveway meets the house, else (most houses) at one end of the street side. The number of bays comes from
       the garage wall's width (a wing that juts out is the garage: its whole face), the width of the paved pad in front of it
       (a mapped lot / the spread of driveway ends), and how big the house is; 3 bays can be three singles or a single and a double. */
    const ds=driveSpot(P,edges,q=>[(q[0]-P.cx)*kx,(q[1]-P.cy)*ky]);
    let gE=null, gC=0, wingG=false;
    if(ds&&ds.E.L>=3.4){ gE=ds.E; gC=ds.s; }
    else if(front.L>=9&&hash(seed,31)<.75){ gE=front; gC=hash(seed,37)<.5?-1:-2; }          // -1: at the left end, -2: at the right
    if(gE){ const E=gE; { const n=p.length, a0=p[(E.ei+n-1)%n], b0=p[(E.ei+2)%n];
        wingG=E.off===0&&Math.abs(E.L-Math.hypot(p[(E.ei+1)%n][0]-p[E.ei][0],p[(E.ei+1)%n][1]-p[E.ei][1]))<.1&&((a0[0]-E.a[0])*E.nx+(a0[1]-E.a[1])*E.ny)<-1.2&&((b0[0]-E.a[0])*E.nx+(b0[1]-E.a[1])*E.ny)<-1.2&&E.L<=14; }
      let pw=0;                                                                                    // width of the paved pad in front of the wall
      if(window.PARKING&&PARKING.at){ let run=0; for(let t=-3;t<=E.L+3;t+=.5){ let hit=false; for(const o of [3,5]){ const q=toLL([E.a[0]+E.ux*t+E.nx*o,E.a[1]+E.uy*t+E.ny*o]); if(PARKING.at(q[0],q[1])){ hit=true; break; } } run=hit?run+.5:0; if(run>pw) pw=run; } }
      { const xs=[]; const m=12/111320, B=P.bb; for(const D of DRIVES){ const b=D.bb; if(b[2]<B[0]-m*1.4||b[0]>B[2]+m*1.4||b[3]<B[1]-m||b[1]>B[3]+m) continue;
          for(const end of [D.l[0],D.l[D.l.length-1]]){ const q=toLoc(end), dx=q[0]-E.a[0], dy=q[1]-E.a[1], o=dx*E.nx+dy*E.ny, t=dx*E.ux+dy*E.uy; if(o>-3&&o<9&&t>-2&&t<E.L+2) xs.push(t); } }
        if(xs.length>1) pw=Math.max(pw,Math.max(...xs)-Math.min(...xs)+2.6); }
      const avail=wingG?E.L-.8:Math.min(E.L-1.6,E.L*(ds?.75:.6)), nWall=Math.max(1,Math.min(4,Math.floor((avail+.8)/3.3)));   // 3.3 m a bay: 2 bays from ~6 m, 3 from ~9 m, 4 from ~12.4 m of wall
      const nPad=pw>=2.4?Math.max(1,Math.min(4,Math.round(pw/3))):0, nArea=A<130?1:A<260?2:A<430?3:4;
      const nB=wingG?nWall:Math.min(nWall,nPad||nArea), r43=hash(seed,43), r44=hash(seed,44), S1=2.7, D1=4.9;
      let ws=nB===1?[S1]:nB===2?(r43<.55?[D1]:[S1,S1]):nB===3?(r43<.35?[S1,S1,S1]:r44<.5?[D1,S1]:[S1,D1]):(r43<.4?[D1,D1]:r43<.7?(r44<.5?[D1,S1,S1]:[S1,S1,D1]):[S1,S1,S1,S1]);
      let tw=ws.reduce((x,y)=>x+y,0)+.5*(ws.length-1);
      while(tw>E.L-.8){ const k=ws.findIndex((x,i)=>x<3&&ws[i+1]<3); if(k<0) break; ws.splice(k,2,D1); tw=ws.reduce((x,y)=>x+y,0)+.5*(ws.length-1); }   // too wide for singles: pair them into doubles
      if(wingG&&tw<(E.L-.8)*.85){ const f=Math.min(1.3,(E.L-.8)/tw); ws=ws.map(x=>x*f); tw=ws.reduce((x,y)=>x+y,0)+.5*(ws.length-1); }   // a wing wider than its doors: fill it
      if(tw>E.L-.8){ const f=(E.L-.8)/tw; ws=ws.map(x=>Math.max(2.2,x*f)); tw=ws.reduce((x,y)=>x+y,0)+.5*(ws.length-1); }
      let st=wingG?(E.L-tw)/2:gC>=0?gC-tw/2:gC===-1?.7:E.L-.7-tw; st=Math.max(.4,Math.min(E.L-.4-tw,st));
      const gcol=GARAGE[seed&3], GT=2.15, GKS=[1,2,3,0], gWins=fine&&hash(seed,73)<.35; let x=st;   // one colour, one panel style and one window choice for every door of the garage (owner 2026-11-24)
      for(let k=0;k<ws.length;k++){ const gw=ws[k], s0=x; x+=gw+.5;
        // a garage you can open (js/enh/garage.js): the dark inside shows behind the panels as they roll up
        const gk=seed*4+GKS[k], a=[E.a[0]+E.ux*s0,E.a[1]+E.uy*s0], mx=a[0]+E.ux*gw/2, my=a[1]+E.uy*gw/2;
        let depth=0; for(const q of p) depth=Math.max(depth,-((q[0]-mx)*E.nx+(q[1]-my)*E.ny));
        garages.push({ei:E.ei,s0:s0+E.off,s1:s0+gw+E.off,x0:a[0],y0:a[1],x1:a[0]+E.ux*gw,y1:a[1]+E.uy*gw,nx:E.nx,ny:E.ny,gk,col:gcol,D:Math.max(4,Math.min(7.5,depth-.3))});
        put(E,s0+.05,s0+gw-.05,-.04,-.02,0,GT-.05,'#141518');
        // four sectional panels with a thin dark joint between them; some doors have a row of windows in the top panel
        const ph=GT/4, wins=gWins, rp=(f)=>Object.assign(out[out.length-1].properties,{gk,gr:1.95,gt:GT});
        for(let q=0;q<4;q++){ put(E,s0,s0+gw,-.04,.06,q*ph+(q?.012:0),(q+1)*ph-.012,gcol); rp();
          if(fine&&!(wins&&q===3)) for(const z of [q*ph+ph*.22,q*ph+ph*.78-.04]){ put(E,s0+.12,s0+gw-.12,.06,.072,z,z+.04,shade(gcol,-.12)); rp(); } }   // raised panel edges
        if(wins){ const n=gw>4?8:4, ww=(gw-.5)/n; for(let q=0;q<n;q++){ const xx=s0+.25+q*ww; put(E,xx+.06,xx+ww-.06,.06,.075,3*ph+.14,3*ph+.4,GLASS); rp(); } }
        if(fine){ put(E,s0-.14,s0,-.04,.06,0,GT+.12,trim); put(E,s0+gw,s0+gw+.14,-.04,.06,0,GT+.12,trim); put(E,s0-.14,s0+gw+.14,-.04,.06,GT,GT+.12,trim); } }   // trim round each opening
      /* the pad in front of the doors (owner 2026-11-24: "continuous asphalt, if it is asphalt"; "gradually widen to the width of the
         garage for long driveways, and for shorter driveways the width of the garage all of the way to the street"): the map draws a
         driveway as a thin asphalt line, so a pad as wide as the row of doors starts at the doors. A short front yard (street kerb
         within ~12 m): it stays that wide right out to the street. A long one: 5 m that wide, then it narrows gradually to the
         mapped line (about 3 m) over up to 9 m, and the line carries on. The kerb strip round it is the grey the map puts round
         driveways. Asphalt unless the tiles say unpaved (gravel): they have no asphalt vs concrete. */
      { const wall=E.a[0]*E.nx+E.a[1]*E.ny; let room=null;
        if(sd&&sd.d){ const nd=E.nx*sd[0]+E.ny*sd[1]; if(nd>.6){ room=sd.d/nd-wall-6.5; } }
        const gr=ds&&ds.E===E&&ds.sf==='unpaved', top=gr?'#a39b8b':'#62656a', o0=.04, W=tw+.7, L=st-.35, Rr=st+tw+.35, short=room!=null&&room<=12, A5=5, TT=Math.min(9,Math.max(4,(room!=null?room:15)-A5-1)), LW=3.2;
        const quad=(q,h,c)=>{ if(q.length<3) return; const ring=q.map(([x,y])=>toLL([x,y])); ring.push(ring[0]); out.push({type:'Feature',properties:{c,b:0,h},geometry:{type:'Polygon',coordinates:[ring]}}); };
        const wl=(x,o)=>[E.a[0]+E.ux*x+E.nx*o,E.a[1]+E.uy*x+E.ny*o];          // wall coordinates -> local metres
        const wd=u=>short?W:u<=A5?W:u>=A5+TT?LW:W+(LW-W)*(u-A5)/TT;            // pad width at u metres out from the doors
        const build=(grow)=>{
          // the apron in front of the doors: out to where the mapped driveway starts (at least 5 m), full width
          const ae=ds&&ds.E===E?Math.max(A5,Math.min(9,ds.d+1.5)):A5, ex=grow;
          quad([wl(L-ex,o0),wl(Rr+ex,o0),wl(Rr+ex,ae),wl(L-ex,ae)],.045-(grow?.005:0),grow?'#9a9a94':top);
          // then along the mapped driveway line itself (so it follows a curve): wide, narrowing gradually unless the yard is short
          if(ds&&ds.E===E&&ds.l&&ds.l.length>1){ const l=ds.l.map(toLoc), pts=[l[0]]; let acc=0;
            for(let i=1;i<l.length;i++){ const dx=l[i][0]-l[i-1][0], dy=l[i][1]-l[i-1][1], sg=Math.hypot(dx,dy), n=Math.max(1,Math.ceil(sg/1.5)); for(let k=1;k<=n;k++) pts.push([l[i-1][0]+dx*k/n,l[i-1][1]+dy*k/n]); }
            const Ls=[], Rs=[]; let u=ds.d; for(let i=0;i<pts.length;i++){ if(i) u+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);
              if(short?(room!=null&&u>room+1.4):u>A5+TT) break; if(u<ae-1.5&&i<pts.length-1) continue;
              const a=pts[Math.max(0,i-1)], b=pts[Math.min(pts.length-1,i+1)], tx=b[0]-a[0], ty=b[1]-a[1], tl=Math.hypot(tx,ty)||1, h=(wd(u)+ex*2)/2;
              Ls.push([pts[i][0]-ty/tl*h,pts[i][1]+tx/tl*h]); Rs.push([pts[i][0]+ty/tl*h,pts[i][1]-tx/tl*h]); }
            if(Ls.length>1) quad(Ls.concat(Rs.reverse()),.045-(grow?.005:0),grow?'#9a9a94':top); }
          else if(ae<(short?Math.max(3,room)+1.4:A5+TT)){ const len=short?Math.max(3,room)+1.4:A5+TT;   // no mapped line: the pad runs straight out
            quad(short?[wl(L-ex,ae),wl(Rr+ex,ae),wl(Rr+ex,len),wl(L-ex,len)]:[wl(L-ex,ae),wl(Rr+ex,ae),wl((L+Rr)/2+LW/2+ex,len),wl((L+Rr)/2-LW/2-ex,len)],.045-(grow?.005:0),grow?'#9a9a94':top); } };
        if(!gr) build(.12); build(0); }
      for(const xx of [st-.42,st+tw+.42]) lamp(E,xx,1.95,1.2,3.2);                                                   // a light on each side of the whole row
      occupy(E,st-.6,st+tw+.6); }
    // front door on the street side, in the free part of the wall
    { let E=front, s=null;
      for(const w of wkSpots){ if(w.E.L<2.6) continue; const cs=Math.max(1.2,Math.min(w.E.L-1.2,w.s)); if(free(w.E,cs-1,cs+1.15)){ E=w.E; s=cs; break; } }   // where the front walk reaches the house
      if(s==null){ const fr=(busy.get(E)||[])[0], span=fr?(fr[0]>E.L/2?[.8,fr[0]-.3]:[fr[1]+.3,E.L-.8]):[.8,E.L-.8];
        if(span[1]-span[0]>=1.6) s=(span[0]+span[1])/2+(fr?0:(hash(seed,41)-.5)*E.L*.3); }
      if(s!=null){
        const dk=door(E,s-.6,s+.6), dc=DORS(seed);
        if(frames){ put(E,s-.62,s+.62,-.04,.06,0,2.32,trim); put(E,s-.74,s+.74,-.04,.08,2.32,2.44,trim); }       // casing and head trim
        putD(E,s-.48,s+.48,-.04,.05,0,2.1,dc,dk);
        if(fine){ for(const z of [[.25,.95],[1.15,1.85]]) for(const x of [[-.38,-.06],[.06,.38]]) put(E,s+x[0],s+x[1],.05,.065,z[0],z[1],shade(dc,.14));   // four raised panels
          put(E,s+.3,s+.36,.05,.11,.98,1.04,'#c9a64a');                                                                      // brass knob
          put(E,s-.9,s+.9,.0,1.15,0,.17,'#c4c1ba'); }                                                                        // concrete stoop
        lamp(E,s+.9,1.9,1.4,3.6);                                                                                          // porch light, matching the garage ones
        occupy(E,s-1,s+1.15); } }
    for(const E of edges) for(let f=0;f<floors;f++){
      const n=Math.floor((E.L-1.2)/2.9); if(n<1) continue; const step=(E.L)/(n+1), big=E===front&&f===0;
      for(let i=1;i<=n;i++){ const s=i*step, w=big?1.4:.95, b=f*fh+.9, h=b+(big?1.4:1.25);
        if(f===0&&!free(E,s-w/2-(shut?.55:0),s+w/2+(shut?.55:0))) continue;
        window1(E,s,w,b,h,k++,trim);
        if(fine){ put(E,s-.02,s+.02,.03,.05,b,h,trim); put(E,s-w/2,s+w/2,.03,.05,(b+h)/2-.02,(b+h)/2+.02,trim);          // muntins
          put(E,s-w/2-.14,s+w/2+.14,.0,.15,b-.14,b-.06,'#d9dbdc');                                                         // sill
          if(shut&&E===front&&!big) for(const z of [-1,1]){ const x=s+z*(w/2+.13); put(E,Math.min(x,x+z*.42),Math.max(x,x+z*.42),.02,.07,b-.02,h+.02,shut); } } } }
    if(res.bld) res.bld.yard=yardSpot(P,front,sd,free,seed,kx,ky);    // where a snowman could stand (js/enh/snowmen.js)
  } else if(school){
    /* schools (owner 2026-11-23: Traughber had a wall of windows and no doors): a main entrance at the middle of the street
       side, then the doors a real school has — at the ends of the wings (where the walls turn), and one every ~35 m along
       the long walls — each with a light either side. Windows are spaced wider (every ~6.4 m on the street side, 5 m round
       the others, in pairs of floors), never over a door, with the up-and-down accent light between each two. The gym
       (the one tall block) gets only a row of high windows under the roof and a couple of doors. */
    const gym=isGym(P.cx,P.cy), floors=gym?1:Math.max(1,Math.round(P.h/3.8)), fh=gym?P.h:P.h/floors, mid=front.L/2, sl=fine?3:2, dpos=new Map(); let nd=0;
    const doorsAt=(E)=>{ const L=[]; if(E.L<9) return L;
      if(E===front&&E.L>=6&&!gym) L.push(mid);
      if(E.L>=14&&!(E===front&&E.L<26)) for(const s0 of [4.5,E.L-4.5]) L.push(s0);
      if(!gym&&E.L>=34){ const n=Math.floor(E.L/35); for(let i=1;i<=n;i++) L.push(E.L*i/(n+1)); }
      L.sort((u,v)=>u-v); const out=[]; for(const s0 of L) if(!out.length||s0-out[out.length-1]>7) out.push(s0); return out; };
    const byLen=edges.slice().sort((u,v)=>v.L-u.L);
    for(const E of byLen){ const L=doorsAt(E); if(gym&&nd>=2) break; const keep=[]; for(const s0 of L){ if(nd>=22||(gym&&nd>=2)) break; keep.push(s0); nd++; } if(keep.length) dpos.set(E,keep); }
    if(!gym) for(const w of wkSpots.slice(0,6)){ const L=dpos.get(w.E)||[]; if(L.some(d=>Math.abs(d-w.s)<5)||nd>=22) continue; L.push(w.s); L.sort((u,v)=>u-v); dpos.set(w.E,L); nd++; }   // a door where a path leads in
    if(!dpos.size&&front.L>=6){ dpos.set(front,[mid]); }
    const nearDoor=(E,s0,m)=>(dpos.get(E)||[]).some(d=>Math.abs(d-s0)<m);
    for(const E of edges){ if(E.L<5) continue;
      const pitch=gym?6:E===front?6.4:5, n=Math.max(1,Math.floor((E.L-1)/pitch)), step=E.L/n, w=Math.min(E===front?2.2:1.8,step-2.2);
      for(let f=0;f<floors;f++){ const b=gym?Math.max(5,P.h-3.6):f*fh+(fh>=3.3?1:.8), h=gym?b+1.6:b+Math.min(1.6,fh-1.3); if(h<b+.5) continue;
        for(let i=0;i<n;i++){ const s=(i+.5)*step; if(f===0&&!gym&&nearDoor(E,s,w/2+1.5)) continue; swin(E,s,w,b,h,k++); }
        if(f===0) for(let i=1;i<n;i++){ const s=i*step; if(nearDoor(E,s,2.6)) continue; if(gym&&i%2) continue; sfix(E,s,gym?P.h*.5:floors>1?fh:P.h*.55,P.h); } } }
    for(const [E,list] of dpos) for(const s0 of list){ entrance(E,s0); for(const z of [-1,1]) accent(E,s0+z*1.7,2.7,{dn:3,pool:3.5,po:1.6}); }
  } else if(P.h<=12){
    // storefront: glass band on the street side (the middle 60% of very long walls), mullions every ~1.6 m
    const E=front, s0=E.L>40?E.L*.2:1, s1=E.L>40?E.L*.8:E.L-1;
    if(s1-s0>2){ put(E,s0,s1,-.04,.03,.3,2.9,GLASS,hash(seed,5)<.8?1:0); wins.push({ei:E.ei,s0:+(s0+E.off).toFixed(2),s1:+(s1+E.off).toFixed(2),b:.3,h:2.9});
      if(frames) for(let s=s0;s<=s1+.01;s+=1.6) put(E,s-.05,s+.05,.03,.08,.3,2.9,'#b9bec4');
      put(E,s0-.2,s1+.2,.02,.5,2.9,3.2,'#d6d8da');                 // canopy fascia above the glass
      if(s1-s0>=2.4){ const w=wkSpots.find(q=>q.E===E&&q.s>s0+1.4&&q.s<s1-1.4); entrance(E,w?w.s:(s0+s1)/2); } }                       // the way in, in the middle of the glass
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
      for(let f=0;f<floors;f++) put(E,.6,E.L-.6,-.04,.03,f*fh+.9,f*fh+.9+Math.min(1.6,fh-1.2),GLASS,hash(seed+f,E.L|0)<.65?1:0); }
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
const LG={pts:null,bm:null,o:null,n:0,dirty:false,vis:false};
function lampTex(){ const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'), g=x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba(255,250,232,1)'); g.addColorStop(.12,'rgba(255,236,180,.95)'); g.addColorStop(.35,'rgba(255,200,110,.35)'); g.addColorStop(1,'rgba(255,170,70,0)');
  x.fillStyle=g; x.fillRect(0,0,64,64); return new THREE.CanvasTexture(c); }
function lampsSet(glow){
  if(typeof THREE==='undefined'||typeof scene==='undefined') return;
  if(!LG.pts){ LG.pts=new THREE.Points(new THREE.BufferGeometry(),new THREE.PointsMaterial({map:lampTex(),vertexColors:true,size:1,sizeAttenuation:true,transparent:true,
      depthWrite:false,blending:THREE.AdditiveBlending,color:0xffffff})); LG.pts.frustumCulled=false; LG.pts.renderOrder=5; LG.pts.visible=false; scene.add(LG.pts); }
  const ox=S.lng*MLNG, oy=S.lat*MLAT, e0=terrainOn?(map.transform.elevation||0):0, pos=[], col=[];
  const BP=[], BC=[], BI=[], hex=k=>[(k>>16&255)/255,(k>>8&255)/255,(k&255)/255];
  for(const f of glow){ const q=f.properties; if(q.beam){ beam(q,ox,oy,e0,BP,BC,BI,hex); continue; } let el=0; if(terrainOn){ try{ el=(map.queryTerrainElevation([q.lx,q.ly])||0)+e0; }catch(e){} }
    pos.push(q.lx*MLNG-ox,q.z+el,-(q.ly*MLAT-oy)); const k=q.k?parseInt(q.k.slice(1),16):0xffffff; col.push((k>>16&255)/255,(k>>8&255)/255,(k&255)/255); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  LG.pts.geometry.dispose(); LG.pts.geometry=g; LG.o=[ox,oy]; LG.n=glow.length; LG.dirty=true;
  if(!LG.bm){ LG.bm=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide})); LG.bm.frustumCulled=false; LG.bm.renderOrder=4; LG.bm.visible=false; scene.add(LG.bm); }
  const bg=new THREE.BufferGeometry(); bg.setAttribute('position',new THREE.Float32BufferAttribute(BP,3)); bg.setAttribute('color',new THREE.Float32BufferAttribute(BC,3)); bg.setIndex(BI);
  LG.bm.geometry.dispose(); LG.bm.geometry=bg;
}
// one light beam on a wall: a fan of 5 columns x rows, bright at the lens and fading with distance, soft at the sides (vertex colours, added to the picture)
function beam(q,ox,oy,e0,BP,BC,BI,hex){
  let el=0; if(terrainOn){ try{ el=(map.queryTerrainElevation([q.lx,q.ly])||0)+e0; }catch(e){} }
  const cx=q.lx*MLNG-ox, cy=q.ly*MLAT-oy, COLS=[-1,-.5,0,.5,1], CI=[0,.55,1,.55,0];
  for(const d of [1,-1]){ const col=hex(parseInt((d>0?q.ku:q.kd).slice(1),16)), z0=q.z+d*.26, z1=d>0?q.top:q.bot, span=Math.abs(z1-z0); if(span<.3) continue;
    const rows=Math.max(3,Math.min(9,Math.ceil(span/1.1))), base=BP.length/3;
    for(let r=0;r<=rows;r++){ const t=r/rows, h=z0+(z1-z0)*t, w=.3+Math.min(3.1,t*span*.34+.2*t), f=Math.pow(1-t,1.25)*.95+.05;
      for(let c=0;c<5;c++){ const o=COLS[c]*w; BP.push(cx+q.tx*o+q.nx*.0,h+el,-(cy+q.ty*o)); const I=CI[c]*f*(r===0?.9:1); BC.push(col[0]*I,col[1]*I,col[2]*I); } }
    for(let r=0;r<rows;r++) for(let c=0;c<4;c++){ const a=base+r*5+c, b=a+1, e=a+5, g=e+1; BI.push(a,b,e,b,g,e); } }
}
FRAME_HOOKS.push(function lampGlow(){
  const P=LG.pts; if(!P) return false;
  const want=!!night&&!POWER&&LG.n>0&&mode!=='glider'&&!(window.WALK&&WALK.inside&&WALK.inside.rec);
  let changed=LG.dirty; LG.dirty=false;
  if(want!==P.visible){ P.visible=want; if(LG.bm) LG.bm.visible=want; changed=true; }
  if(!want) return changed;
  const px=S.lng*MLNG, py=S.lat*MLAT, m=mpp(S.lat,S.zoom), b=rad(S.camB), sb=Math.sin(b), cb=Math.cos(b), e=terrainOn?(map.transform.elevation||0):0;
  const dx=LG.o[0]-px, dy=LG.o[1]-py;
  P.position.set((dx*cb-dy*sb)/m,-e/m,-(dx*sb+dy*cb)/m); P.rotation.set(0,b,0); P.scale.setScalar(1/m);
  const B=LG.bm; if(B){ B.visible=true; B.position.copy(P.position); B.rotation.set(0,b,0); B.scale.setScalar(1/m); }
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
  if(moved>(POWER?160:120)||destroyed.length!==R.n||TRJV()!==R.pin||(R.tiles&&age>(POWER?8000:5000))||R.pending) safe('roofs',build);
});
const prev=window.onPowerChange;
window.onPowerChange=(on)=>{ if(prev) prev(on); R.at=null; R.last=''; R.parts=null; CACHE.clear(); W.cache.clear(); W.sig=''; glowVis(); };   // also: wall textures off in battery saver   // slice count / unit count change
// doorsNear: every walk-in building near you, with a store's own way in when it has no door here (js/enh/stores.js)
window.ROOFS={build,state:R,walls:W,st0:()=>R.reg||[],doorsNear:()=>{ const b=R.reg||[]; const o=window.STORES&&STORES.list.length?b.filter(r=>!STORES.covers(r)).concat(STORES.recs()):b; const T=window.TRJ; return T&&T.recs?o.filter(r=>!(T.covers&&T.covers(r))).concat(T.recs()):o; },openDoor};
})();
