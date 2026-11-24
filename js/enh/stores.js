/* Meijer stores (owner 2026-11-23, photos of a Meijer: the ceiling lights inside, the pharmacy side of the building, and
   the sign lit up at night: "inside Meijer make the lights look like this and make the building look like this and put
   the sign on the building and make the sign light up like that").
   Which buildings: a map point (the tiles' poi layer, or OpenStreetMap via Overpass) named Meijer, and the big building
   it stands in (or the big one nearest it). For each:
   - outside: pale beige block walls (js/enh/buildings.js asks STORES.look), a blue metal band along the top of every wall,
     and over the entrance a canopy on two brick piers with a blue standing-seam roof, like the photo;
   - the sign: the store's name in big red channel letters high on the front wall, lit — bright red with a red glow after
     dark. It's the name as the map writes it in a plain bold face, not the store's logo;
   - inside (js/enh/walk.js asks STORES.at when you walk in): a high dropped ceiling of speckled white tiles with rows of
     2×4 ft parabolic-louvre fluorescent troffers, and a pale tile floor.
   window.STORES = {list, look(lng,lat), at(key), add(ring,name)} */
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
  const s=Object.assign({ring,name:name||'Meijer'},k); ST.list.push(s); changed(); found(s); return s; }
// the building a point stands in (or the biggest one within 90 m), from the map tiles
function buildingFor(lng,lat){ let fs=[]; try{ fs=map.querySourceFeatures(bSrc,{sourceLayer:'building'}); }catch(e){ return null; }
  const kx=111320*Math.cos(lat*Math.PI/180); let best=null, bd=1e9;
  for(const f of fs){ const g=f.geometry, pls=!g?[]:g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
    for(const pl of pls){ const r=pl[0]; if(!r||r.length<4) continue; const A=areaM(r,kx); if(A<2500) continue;
      if(inRing(r,lng,lat)) return r;
      let d=1e9; for(const q of r) d=Math.min(d,Math.hypot((q[0]-lng)*kx,(q[1]-lat)*111320)); if(d<90&&d-A/1e4<bd){ bd=d-A/1e4; best=r; } } }
  return best; }
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
// a store was found: the walls get repainted (js/enh/buildings.js) and the outside pieces drawn
function changed(){ ST.dirty=true; try{ const R=window.ROOFS; if(R){ R.walls.cache.clear(); R.walls.sig=''; R.state.at=null; } }catch(e){} }
// js/enh/buildings.js: the wall look for the building whose middle is (lng,lat)
function look(lng,lat){ for(const s of ST.list) if(lng>=s.bb[0]&&lng<=s.bb[2]&&lat>=s.bb[1]&&lat<=s.bb[3]&&inRing(s.ring,lng,lat)) return {c:'#d6cfbf',pat:'cw-bk2'}; return null; }
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
const recKey=s=>{ const regs=window.ROOFS&&ROOFS.doorsNear?ROOFS.doorsNear():[]; return regs.find(r=>r.key===s.key)||regs.find(r=>at(r.key)===s)||null; };

/* ---------- outside: the blue band along the top, the entrance canopy ---------- */
const BLUE='#22509f', BLUE2='#1c4386', BRICK='#8e4c3a', BEIGE='#e3dccb';
function rec(s){ return recKey(s); }
function outside(){
  const feats=[], kx0=111320*Math.cos(S.lat*Math.PI/180);
  for(const s of ST.list){ if(Math.hypot((s.cx-S.lng)*kx0,(s.cy-S.lat)*111320)>900) continue;
    const kx=111320*Math.cos(s.cy*Math.PI/180), ky=111320, toLL=q=>[+(s.cx+q[0]/kx).toFixed(7),+(s.cy+q[1]/ky).toFixed(7)];
    let p=s.ring.slice(0,-1).map(q=>[(q[0]-s.cx)*kx,(q[1]-s.cy)*ky]); let a=0; for(let i=0,j=p.length-1;i<p.length;j=i++) a+=(p[j][0]-p[i][0])*(p[j][1]+p[i][1]); if(a<0) p.reverse();   // counter-clockwise (this sum is +2A for counter-clockwise)
    const R=rec(s), h=s.h||(R&&R.h)||(s.h=hOf(s))||8;
    // the band: the outline pushed out 0.25 m, with the wall's own outline as the hole
    const grow=p.map((q,i)=>{ const A=p[(i+p.length-1)%p.length], B=p[(i+1)%p.length]; let nx=0,ny=0;
      for(const [u,v] of [[A,q],[q,B]]){ const ex=v[0]-u[0], ey=v[1]-u[1], L=Math.hypot(ex,ey)||1; nx+=ey/L; ny+=-ex/L; }
      const L=Math.hypot(nx,ny)||1; return [q[0]+nx/L*.28,q[1]+ny/L*.28]; });
    const ring=o=>{ const r=o.map(toLL); r.push(r[0]); return r; };
    feats.push({type:'Feature',properties:{c:BLUE,b:h-1.1,h:h+.25},geometry:{type:'Polygon',coordinates:[ring(grow),ring(p.slice().reverse())]}});
    // the canopy over the way in: the middle of the front wall (where js/enh/buildings.js puts the doors), and on a long
    // front a second one, like the pharmacy / garden-centre end in the photo
    const E=frontOf(s,p); s.front=null; s.E=E; s.p=p;
    if(E){ const ins=E.L>90?[E.L*.5,E.L*.85]:[E.L/2];
      for(const sm of ins){ const mx=E.a[0]+E.ux*sm, my=E.a[1]+E.uy*sm, ux=E.ux, uy=E.uy, nx=E.nx, ny=E.ny;
        if(!s.front) s.front={mx,my,ux,uy,nx,ny,sm,rc:{cx:s.cx,cy:s.cy,kx,ky}};
        const at=(al,out)=>[mx+ux*al+nx*out,my+uy*al+ny*out], box=(a0,a1,o0,o1,b,hh,c)=>feats.push({type:'Feature',properties:{c,b,h:hh},
          geometry:{type:'Polygon',coordinates:[ring([at(a0,o0),at(a1,o0),at(a1,o1),at(a0,o1)])]}});
        const HW=4.2, D=4.6, top=Math.min(4.4,h-1.4);
        for(const z of [-1,1]){ box(z*HW-.38,z*HW+.38,D-.76,D,0,top-.55,BRICK); box(z*HW-.48,z*HW+.48,D-.86,D+.1,0,.35,'#b9b2a4'); }   // brick piers on a stone base
        box(-HW-.6,HW+.6,0,D+.5,top-.55,top,BEIGE);                                                          // the canopy's beam / soffit
        box(-HW-.7,HW+.7,0,D+.6,top,top+.22,BLUE2);                                                          // blue fascia
        for(let k=0;k<6;k++){ const t=k/6, w=(HW+.7)*(1-t*.55), o1=(D+.6)*(1-t*.75);                        // blue standing-seam hip roof, in slices
          box(-w,w,0,o1,top+.22+t*1.5,top+.22+(k+1)/6*1.5,BLUE); } } }
  }
  safe('stores',()=>{ const src=map.getSource('stores'); if(src) src.setData({type:'FeatureCollection',features:feats}); });
  signs();
}
function hOf(s){ let h=0; try{ for(const f of map.querySourceFeatures(bSrc,{sourceLayer:'building'})){ const pr=f.properties||{}, g=f.geometry; if(!g||g.type!=='Polygon') continue;
  const r=g.coordinates[0]; if(r&&r.length===s.ring.length&&Math.abs(r[0][0]-s.ring[0][0])<1e-7) h=Math.max(h,+(pr.render_height||pr.height||0)); } }catch(e){} return h||8; }
function layers(){ safe('stores layer',()=>{ if(map.getSource('stores')) return;
  map.addSource('stores',{type:'geojson',data:{type:'FeatureCollection',features:[]},maxzoom:19,tolerance:0});
  map.addLayer({id:'stores-3d',type:'fill-extrusion',source:'stores',minzoom:13,paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-base':['get','b'],'fill-extrusion-height':['get','h'],'fill-extrusion-vertical-gradient':false}},
    map.getLayer('hn-big')?'hn-big':undefined); }); }

/* ---------- the sign: red channel letters, lit (car layer, so it can glow) ---------- */
const SG={g:null,o:null,items:[],night:null};
function signTex(text,night,glow){ const H=256, x0=document.createElement('canvas').getContext('2d'); x0.font='800 190px "Arial Black",Arial,Helvetica,sans-serif';
  const W=Math.ceil(x0.measureText(text).width+120), c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
  x.font=x0.font; x.textAlign='center'; x.textBaseline='middle';
  if(glow){ x.shadowColor='rgba(255,40,40,1)'; x.shadowBlur=48; x.fillStyle='rgba(255,40,40,.9)'; for(let i=0;i<3;i++) x.fillText(text,W/2,H/2+8); }
  else { x.fillStyle=night?'#5a0b0b':'#6e1212'; x.fillText(text,W/2+5,H/2+14);                       // the letters' returns (sides), seen a little from below
    if(night){ x.shadowColor='rgba(255,60,60,.95)'; x.shadowBlur=22; }
    x.fillStyle=night?'#ff2b2b':'#d71f26'; x.fillText(text,W/2,H/2+8); x.shadowBlur=0;
    if(night){ x.fillStyle='rgba(255,190,190,.55)'; x.save(); x.beginPath(); x.rect(0,0,W,H/2); x.clip(); x.fillText(text,W/2,H/2+8); x.restore(); } }
  const t=new THREE.CanvasTexture(c); t.anisotropy=4; return {t,ar:W/H}; }
function signs(){ if(typeof THREE==='undefined'||typeof scene==='undefined') return;
  if(!SG.g){ SG.g=new THREE.Group(); SG.g.renderOrder=4; scene.add(SG.g); }
  for(const it of SG.items){ SG.g.remove(it.m); SG.g.remove(it.hal); it.m.geometry.dispose(); }
  SG.items=[]; const night=isNight(); SG.night=night; SG.o=[S.lng*MLNG,S.lat*MLAT];
  for(const s of ST.list){ if(!s.front||!s.E) continue; const h=s.h||8;
    // on the front wall, to one side of the entrance, high up
    const f=s.front, kx=f.rc.kx, E=s.E;
    let al=-Math.min(16,E.L*.22); if(f.sm+al<5) al=Math.min(14,E.L*.22);
    const text=s.name, hgt=Math.max(1.6,Math.min(3.2,h*.3)), T=signTex(text,night,false), G=signTex(text,night,true), wid=hgt*T.ar;
    const wx=f.mx+f.ux*al+f.nx*.32, wy=f.my+f.uy*al+f.ny*.32, z=Math.min(h-1.4-hgt/2,h*.62);
    const lng=f.rc.cx+wx/kx, lat=f.rc.cy+wy/f.rc.ky, px=lng*MLNG-SG.o[0], pz=-(lat*MLAT-SG.o[1]), ry=Math.atan2(f.nx,-f.ny);
    const mat=new THREE.MeshBasicMaterial({map:T.t,transparent:true,depthWrite:false,toneMapped:false}), m=new THREE.Mesh(new THREE.PlaneGeometry(wid,hgt),mat);
    m.position.set(px,z,pz); m.rotation.y=ry; m.renderOrder=4; SG.g.add(m);
    const hm=new THREE.MeshBasicMaterial({map:G.t,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.85,toneMapped:false}), hal=new THREE.Mesh(new THREE.PlaneGeometry(wid*1.06,hgt*1.25),hm);
    hal.position.set(px-f.nx*.12,z,pz+f.ny*.12); hal.rotation.y=ry; hal.renderOrder=3; hal.visible=night; SG.g.add(hal);
    SG.items.push({m,hal,s}); }
  SG.dirty=true; }
function edgeOf(p,i){ const a=p[i], b=p[(i+1)%p.length]; if(!a||!b) return null; const ex=b[0]-a[0], ey=b[1]-a[1], L=Math.hypot(ex,ey)||1; return {a,L,ux:ex/L,uy:ey/L}; }
const isNight=()=>!!(YD.AT&&YD.AT.k>.55);
FRAME_HOOKS.push(function storeSigns(){ const G=SG.g; if(!G||!SG.items.length) return false;
  const want=mode!=='glider'&&!(window.WALK&&WALK.inside&&WALK.inside.rec); let ch=!!SG.dirty; SG.dirty=false;
  if(want!==G.visible){ G.visible=want; ch=true; } if(!want) return ch;
  const px=S.lng*MLNG, py=S.lat*MLAT, m=mpp(S.lat,S.zoom), b=S.camB*Math.PI/180, sb=Math.sin(b), cb=Math.cos(b), e=terrainOn?(map.transform.elevation||0):0;
  const dx=SG.o[0]-px, dy=SG.o[1]-py;
  G.position.set((dx*cb-dy*sb)/m,-e/m,-(dx*sb+dy*cb)/m); G.rotation.set(0,b,0); G.scale.setScalar(1/m);
  return ch; });

onReady(function stores(){ layers(); setTimeout(()=>safe('stores scan',()=>{ scanTiles(); outside(); }),2500); });
onTick(1500,function storeTick(){
  if(isNight()!==SG.night&&SG.items.length) safe('store signs',signs);
  const moved=ST.at?meters(ST.at[1],ST.at[0],S.lat,S.lng):1e9;
  if(moved>250||ST.dirty){ ST.at=[S.lng,S.lat]; ST.dirty=false; safe('stores scan',scanTiles); layers(); safe('stores out',outside); }
  else if(ST.list.some(s=>!s.front)&&performance.now()-(ST.recT||0)>3000){ ST.recT=performance.now(); safe('stores out',outside); }   // waiting for the doors (js/enh/buildings.js)
  const om=ST.ovAt?meters(ST.ovAt[1],ST.ovAt[0],S.lat,S.lng):1e9; if(om>2500&&performance.now()-ST.ovT>60000) scanOverpass();
  const nm=ST.nsAt?meters(ST.nsAt[1],ST.nsAt[0],S.lat,S.lng):1e9; if(nm>3000) scanSearch();
  if(PTS.some(q=>!q.done)) safe('stores pts',resolvePts);
});
window.STORES={list:ST.list,look,at,add,frontDir,markHere,pts:PTS,state:ST,refresh:()=>{ ST.dirty=true; }};
})();
