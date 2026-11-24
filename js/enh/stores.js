/* Meijer stores (owner 2026-11-23: a photo of the lights inside a Meijer — "inside Meijer make the lights look like this";
   then "just forget about the outside … in front of the door there's a wall so I can't get in").
   Which buildings: anything named Meijer near you — a map point in the tiles, OpenStreetMap (Overpass), the place search —
   or a building you marked by saying "this is Meijer"; the big building it stands in (or the big one nearest it).
   Outside it stays the map's own building. To get in: if js/enh/buildings.js gave the building a walk-in door, that's the
   way in; if it didn't (a store this big often lies across two map tiles, and those get no doors), this file gives it one
   — glass double doors in the middle of the wall facing its parking lot — and the walk-in record js/enh/walk.js uses.
   Inside (js/enh/walk.js asks STORES.at): a high dropped ceiling of speckled white tiles with rows of 2×4 ft
   parabolic-louvre fluorescent troffers, like the photo, and a pale tile floor.
   window.STORES = {list, at(key), recs(), add(ring,name), markHere()} */
(()=>{
'use strict';
const {safe,onReady,onTick}=YD;
const ST={list:[],at:null,busy:false,ovAt:null,ovT:0};
const NAME=/\bmeijer\b/i, NOT=/gas|fuel|express|station|car ?wash|distribution|warehouse|office|drive|road|avenue|street/i;
const inRing=(r,x,y)=>{ let c=false; for(let i=0,j=r.length-1;i<r.length;j=i++){ const a=r[i], b=r[j]; if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) c=!c; } return c; };
const keyOf=r=>{ let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const q of r){ if(q[0]<x0)x0=q[0]; if(q[0]>x1)x1=q[0]; if(q[1]<y0)y0=q[1]; if(q[1]>y1)y1=q[1]; }
  return {key:((x0+x1)/2).toFixed(6)+','+((y0+y1)/2).toFixed(6),bb:[x0,y0,x1,y1],cx:(x0+x1)/2,cy:(y0+y1)/2}; };
const areaM=(r,kx)=>{ let a=0; for(let i=0,j=r.length-1;i<r.length;j=i++) a+=(r[j][0]-r[i][0])*kx*(r[j][1]+r[i][1])*111320; return Math.abs(a/2); };

function add(ring,name){ if(!ring||ring.length<4) return null; const k=keyOf(ring);
  if(ST.list.some(s=>s.key===k.key)) return null;
  const s=Object.assign({ring,name:name||'Meijer',id:ring.id!=null?ring.id:null},k); ST.list.push(s); changed(); found(s); return s; }
// the building a point stands in (or the biggest one within 90 m), from the map tiles. A big building cut by a tile edge
// comes in pieces with the same id: they're joined into one outline (their convex hull; stores are near enough boxes).
function hull(pts){ const P=pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]), cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]), lo=[], up=[];
  for(const p of P){ while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0) lo.pop(); lo.push(p); }
  for(let i=P.length-1;i>=0;i--){ const p=P[i]; while(up.length>=2&&cr(up[up.length-2],up[up.length-1],p)<=0) up.pop(); up.push(p); }
  const h=lo.slice(0,-1).concat(up.slice(0,-1)); h.push(h[0]); return h; }
function buildingFor(lng,lat){ let fs=[]; try{ fs=map.querySourceFeatures(bSrc,{sourceLayer:'building'}); }catch(e){ return null; }
  const kx=111320*Math.cos(lat*Math.PI/180); let best=null, bd=1e9;
  const all=[]; for(const f of fs){ const g=f.geometry, pls=!g?[]:g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
    for(const pl of pls){ const r=pl[0]; if(r&&r.length>=4) all.push({f,r}); } }
  for(const o of all){ const A=areaM(o.r,kx); if(A<2500) continue;
    if(inRing(o.r,lng,lat)){ best=o; bd=-1; break; }
    let d=1e9; for(const q of o.r) d=Math.min(d,Math.hypot((q[0]-lng)*kx,(q[1]-lat)*111320)); if(d<90&&d-A/1e4<bd){ bd=d-A/1e4; best=o; } }
  if(!best) return null;
  const k=keyOf(best.r), m=3/111320, near=b=>!(b.bb[2]<k.bb[0]-m*1.4||b.bb[0]>k.bb[2]+m*1.4||b.bb[3]<k.bb[1]-m||b.bb[1]>k.bb[3]+m);
  const parts=best.f.id==null?[]:all.filter(o=>o!==best&&o.f.id===best.f.id&&near(keyOf(o.r))&&Math.abs(o.r[0][0]-best.r[0][0])+Math.abs(o.r[0][1]-best.r[0][1])>1e-7);
  const ring=parts.length?hull(best.r.concat(...parts.map(o=>o.r))):best.r;
  ring.id=best.f.id; return ring; }
function scanTiles(){ let ps=[]; try{ ps=map.querySourceFeatures(bSrc,{sourceLayer:'poi'}); }catch(e){ return; }
  for(const p of ps){ const pr=p.properties||{}, n=pr.name||pr['name:latin']||pr.name_en||''; if(!NAME.test(n)||NOT.test(n)) continue;
    const c=p.geometry&&p.geometry.coordinates; if(!c||typeof c[0]!=='number') continue;
    if(ST.list.some(s=>inRing(s.ring,c[0],c[1])||Math.hypot((s.cx-c[0])*80000,(s.cy-c[1])*111320)<120)) continue;
    addPt(c[0],c[1],n.replace(/\s*\(.*\)\s*$/,'')); } resolvePts(); }
// candidate spots (from OpenStreetMap, the search, or ones you marked): each becomes a store once the map tiles round it
// are in and a big building is found there
const PTS=[]; const SAVE='ydStores';
function addPt(lng,lat,name,ring,mine){ if(!isFinite(lng)||!isFinite(lat)) return;
  if(PTS.some(q=>Math.hypot((q.lng-lng)*80000,(q.lat-lat)*111320)<60)) return; PTS.push({lng,lat,name:name||'Meijer',ring:ring||null,mine:!!mine,done:false}); }
try{ for(const q of JSON.parse(localStorage.getItem(SAVE)||'[]')) addPt(q[0],q[1],q[2],null,true); }catch(e){}
function resolvePts(){ const kx=111320*Math.cos(S.lat*Math.PI/180);
  for(const q of PTS){ if(q.done) continue; if(Math.hypot((q.lng-S.lng)*kx,(q.lat-S.lat)*111320)>900) continue;
    if(ST.list.some(s=>inRing(s.ring,q.lng,q.lat))){ q.done=true; continue; }
    const r=buildingFor(q.lng,q.lat)||q.ring; if(r){ q.done=true; const s=add(r,q.name); if(s) found(s); } } }
function found(s){ if(ST.told&&ST.told[s.key]) return; (ST.told=ST.told||{})[s.key]=1; if(typeof toast==='function') toast('🏬 '+s.name+' found',2200); }
// OpenStreetMap: anything named Meijer within ~5 km (the store may be mapped as the building, a point, or without a shop tag)
async function scanOverpass(){ if(ST.busy||typeof ovFetch!=='function') return; ST.busy=true; ST.ovAt=[S.lng,S.lat]; ST.ovT=performance.now();
  const dy=.045, dx=.06, bb=`(${(S.lat-dy).toFixed(4)},${(S.lng-dx).toFixed(4)},${(S.lat+dy).toFixed(4)},${(S.lng+dx).toFixed(4)})`;
  try{ const j=await ovFetch(`[out:json][timeout:25];(nwr["name"~"meijer",i]${bb};nwr["brand"~"meijer",i]${bb};);out geom qt;`);
    for(const el of (j&&j.elements)||[]){ const t=el.tags||{}, n=t.name||t.brand||'Meijer'; if(!NAME.test(n)||NOT.test(n)||t.highway||t.amenity==='fuel') continue;
      const ring=el.type==='way'&&el.geometry&&el.geometry.length>3?el.geometry.map(p=>[+p.lon,+p.lat]):null;
      const c=el.type==='node'?[el.lon,el.lat]:el.bounds?[(el.bounds.minlon+el.bounds.maxlon)/2,(el.bounds.minlat+el.bounds.maxlat)/2]:null; if(!c) continue;
      addPt(+c[0],+c[1],n.replace(/\s*\(.*\)\s*$/,''),ring&&t.building&&ring[0][0]===ring[ring.length-1][0]?ring:null); } }
  catch(e){ console.warn('stores overpass',e); } ST.busy=false; resolvePts(); }
// the place search (Nominatim), as a second source
async function scanSearch(){ ST.nsAt=[S.lng,S.lat]; const vb=[S.lng-.07,S.lat+.05,S.lng+.07,S.lat-.05].map(v=>v.toFixed(4)).join(',');
  try{ const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10&bounded=1&viewbox='+vb+'&q=Meijer'); if(!r.ok) return;
    for(const x of await r.json()){ const n=(x.name||x.display_name||'').split(',')[0]; if(!NAME.test(n)||NOT.test(n)||x.category==='highway'||x.type==='fuel') continue; addPt(+x.lon,+x.lat,n); } }
  catch(e){} resolvePts(); }
// "this is Meijer": the big building nearest you (or the one you're looking at) becomes one, remembered on this device
function markHere(){ const h=S.hdg*Math.PI/180, kx=111320*Math.cos(S.lat*Math.PI/180);
  for(const ah of [0,40,80,120]){ const lng=S.lng+Math.sin(h)*ah/kx, lat=S.lat+Math.cos(h)*ah/111320, r=buildingFor(lng,lat);
    if(r){ const k=keyOf(r); let sv=[]; try{ sv=JSON.parse(localStorage.getItem(SAVE)||'[]'); }catch(e){} sv.push([+k.cx.toFixed(6),+k.cy.toFixed(6),'Meijer']);
      try{ localStorage.setItem(SAVE,JSON.stringify(sv.slice(-30))); }catch(e){} addPt(k.cx,k.cy,'Meijer',r,true); resolvePts(); return true; } }
  return false; }
function changed(){ ST.dirty=true; }
// which way the store faces: toward the parking lots round it (area-weighted), else the nearest road that isn't a service
// drive (that's usually the loading dock). js/enh/buildings.js puts the glass and the way in on that side too.
function frontDir(lng,lat){ const s=ST.list.find(q=>lng>=q.bb[0]&&lng<=q.bb[2]&&lat>=q.bb[1]&&lat<=q.bb[3]&&inRing(q.ring,lng,lat)); if(!s) return null;
  if(s.fd&&s.fdN===((window.PARKING&&PARKING.state.polys||[]).length)) return s.fd;
  const kx=111320*Math.cos(s.cy*Math.PI/180); let vx=0, vy=0;
  for(const pl of (window.PARKING&&PARKING.state.polys)||[]){ const r=pl.rings[0]; if(!r) continue; const b=pl.b;
    const cx=(b[0]+b[2])/2, cy=(b[1]+b[3])/2, dx=(cx-s.cx)*kx, dy=(cy-s.cy)*111320, d=Math.hypot(dx,dy); if(d>300||d<1) continue;
    const A=areaM(r,kx); vx+=dx/d*A/(1+d/80); vy+=dy/d*A/(1+d/80); }
  let fd=null; const L=Math.hypot(vx,vy);
  if(L>1500) fd=[vx/L,vy/L];
  else if(typeof roadGeo!=='undefined'&&typeof rebuildRoadGeo==='function'){
    if(!roadGeo.segs||meters(roadGeo.lat,roadGeo.lng,S.lat,S.lng)>350) rebuildRoadGeo();
    const kr=111320*Math.cos(roadGeo.lat*Math.PI/180), px=(s.cx-roadGeo.lng)*kr, py=(s.cy-roadGeo.lat)*111320; let best=1e9, bx=0, by=0;
    for(const g of roadGeo.segs||[]){ if(g[6]==='service'||g[6]==='track') continue; const [x1,y1,x2,y2]=g, dx=x2-x1, dy=y2-y1, L2=dx*dx+dy*dy, t=L2?Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/L2)):0;
      const ex=x1+t*dx-px, ey=y1+t*dy-py, d=ex*ex+ey*ey; if(d<best){ best=d; bx=ex; by=ey; } }
    best=Math.sqrt(best); if(best>1&&best<400) fd=[bx/best,by/best]; }
  if(fd){ fd.d=60; s.fd=fd; s.fdN=((window.PARKING&&PARKING.state.polys||[]).length); } return fd; }
// the front wall and the way in, in metres round the store's middle (the same pick as js/enh/buildings.js makes)
function frontOf(s,p){ const fd=frontDir(s.cx,s.cy); let best=null, bs=-1e9;
  for(let i=0;i<p.length;i++){ const a=p[i], b=p[(i+1)%p.length], ex=b[0]-a[0], ey=b[1]-a[1], L=Math.hypot(ex,ey); if(L<2.4) continue;
    const nx=ey/L, ny=-ex/L, sc=(fd?nx*fd[0]+ny*fd[1]:0)+.02*Math.min(L,12)+(fd?0:L/1e3); if(sc>bs){ bs=sc; best={a,L,ux:ex/L,uy:ey/L,nx,ny,ei:i}; } }
  return best; }
const at=key=>{ if(!key) return null; const e=ST.list.find(s=>s.key===key); if(e) return e; const [x,y]=String(key).split(',').map(Number);
  return ST.list.find(s=>x>=s.bb[0]&&x<=s.bb[2]&&y>=s.bb[1]&&y<=s.bb[3]&&inRing(s.ring,x,y))||null; };

/* ---------- the way in, when buildings.js gave the store none ---------- */
const regs=()=>window.ROOFS&&ROOFS.st0?ROOFS.st0():[];
function ownRec(s){ const kx=111320*Math.cos(s.cy*Math.PI/180), ky=111320;
  let p=s.ring.slice(0,-1).map(q=>[(q[0]-s.cx)*kx,(q[1]-s.cy)*ky]); let a=0; for(let i=0,j=p.length-1;i<p.length;j=i++) a+=(p[j][0]-p[i][0])*(p[j][1]+p[i][1]); if(a<0) p.reverse();   // counter-clockwise
  const E=frontOf(s,p); if(!E) return null; const sm=E.L/2;
  const d={ei:E.ei,s0:sm-.95,s1:sm+.95,x0:E.a[0]+E.ux*(sm-.95),y0:E.a[1]+E.uy*(sm-.95),x1:E.a[0]+E.ux*(sm+.95),y1:E.a[1]+E.uy*(sm+.95),nx:E.nx,ny:E.ny,dk:9e8+ST.list.indexOf(s)};
  return {key:s.key,id:s.id,cx:s.cx,cy:s.cy,kx,ky,p,h:s.h||hOf(s),house:false,doors:[d],garages:[],bb:s.bb,store:true,E,sm}; }
function recs(){ const out=[], kx0=111320*Math.cos(S.lat*Math.PI/180), base=regs();
  for(const s of ST.list){ if(Math.hypot((s.cx-S.lng)*kx0,(s.cy-S.lat)*111320)>600) continue;
    if(base.some(r=>r.key===s.key||(r.doors&&r.doors.length&&inRing(s.ring,r.cx,r.cy)&&r.p.length>2))) { s.rec=null; continue; }   // buildings.js has its door
    if(!s.rec||s.rec.fdN!==s.fdN) { s.rec=ownRec(s); if(s.rec) s.rec.fdN=s.fdN; }
    if(s.rec) out.push(s.rec); }
  return out; }
function hOf(s){ let h=0; try{ for(const f of map.querySourceFeatures(bSrc,{sourceLayer:'building'})){ if(s.id==null||f.id!==s.id) continue; const pr=f.properties||{}; h=Math.max(h,+(pr.render_height||pr.height||0)); } }catch(e){} return h||8; }
// the glass double doors on the map (dark frame, two glass leaves, push bars), like buildings.js draws its own
function drawDoors(){ const feats=[];
  for(const r of recs()){ const E=r.E, sm=r.sm, toLL=q=>[+(r.cx+q[0]/r.kx).toFixed(7),+(r.cy+q[1]/r.ky).toFixed(7)];
    const put=(s0,s1,o0,o1,b,h,c)=>{ const a=[E.a[0]+E.ux*s0,E.a[1]+E.uy*s0], z=[E.a[0]+E.ux*s1,E.a[1]+E.uy*s1];
      const ring=[[a[0]+E.nx*o0,a[1]+E.ny*o0],[z[0]+E.nx*o0,z[1]+E.ny*o0],[z[0]+E.nx*o1,z[1]+E.ny*o1],[a[0]+E.nx*o1,a[1]+E.ny*o1]].map(toLL); ring.push(ring[0]);
      feats.push({type:'Feature',properties:{c,b,h},geometry:{type:'Polygon',coordinates:[ring]}}); };
    put(sm-1.15,sm+1.15,.06,.1,0,2.65,'#3b4048');
    for(const z of [-1,1]){ put(z<0?sm-.95:sm+.03,z<0?sm-.03:sm+.95,.1,.13,.04,2.45,'#27313e'); put(z<0?sm-.45:sm+.1,z<0?sm-.1:sm+.45,.13,.17,1,1.06,'#c7ccd1'); }
    put(sm-1.6,sm+1.6,.06,.9,2.65,2.85,'#c9ccd0'); }                                                     // a little canopy edge over them
  safe('stores',()=>{ const src=map.getSource('stores'); if(src) src.setData({type:'FeatureCollection',features:feats}); }); }
function layers(){ safe('stores layer',()=>{ if(map.getSource('stores')) return;
  map.addSource('stores',{type:'geojson',data:{type:'FeatureCollection',features:[]},maxzoom:19,tolerance:0});
  map.addLayer({id:'stores-3d',type:'fill-extrusion',source:'stores',minzoom:13,paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-base':['get','b'],'fill-extrusion-height':['get','h'],'fill-extrusion-vertical-gradient':false}},
    map.getLayer('hn-big')?'hn-big':undefined); }); }

onReady(function stores(){ layers(); setTimeout(()=>safe('stores scan',()=>{ scanTiles(); drawDoors(); }),2500); });
onTick(1500,function storeTick(){
  const moved=ST.at?meters(ST.at[1],ST.at[0],S.lat,S.lng):1e9;
  if(moved>250||ST.dirty){ ST.at=[S.lng,S.lat]; ST.dirty=false; safe('stores scan',scanTiles); layers(); }
  if(PTS.some(q=>!q.done)) safe('stores pts',resolvePts);
  const om=ST.ovAt?meters(ST.ovAt[1],ST.ovAt[0],S.lat,S.lng):1e9; if(om>2500&&performance.now()-ST.ovT>60000) scanOverpass();
  const nm=ST.nsAt?meters(ST.nsAt[1],ST.nsAt[0],S.lat,S.lng):1e9; if(nm>3000) scanSearch();
  if(ST.list.length) safe('store doors',drawDoors);
});
window.STORES={list:ST.list,at,recs,add,frontDir,markHere,pts:PTS,state:ST,refresh:()=>{ ST.dirty=true; }};
})();
