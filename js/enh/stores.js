/* Meijer and Walmart stores (owner 2026-11-23 asked for Walmart too, with a greeter at the door, and a setting to switch its voice off;
   Meijer started it: a photo of the lights inside a Meijer — "inside Meijer make the lights look like this";
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
const NAME=/\b(meijer|walmart)\b/i, NOT=/gas|fuel|express|station|car ?wash|distribution|warehouse|office|drive|road|avenue|street|pharmacy|vision|optical|photo|auto care|tire|bank|mobile|money|fulfil+ment|pickup|grocery pickup/i;
const brandOf=n=>/walmart/i.test(n||'')?'Walmart':'Meijer';   // the name the greeter welcomes you to
const inRing=(r,x,y)=>{ let c=false; for(let i=0,j=r.length-1;i<r.length;j=i++){ const a=r[i], b=r[j]; if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) c=!c; } return c; };
const keyOf=r=>{ let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const q of r){ if(q[0]<x0)x0=q[0]; if(q[0]>x1)x1=q[0]; if(q[1]<y0)y0=q[1]; if(q[1]>y1)y1=q[1]; }
  return {key:((x0+x1)/2).toFixed(6)+','+((y0+y1)/2).toFixed(6),bb:[x0,y0,x1,y1],cx:(x0+x1)/2,cy:(y0+y1)/2}; };
const areaM=(r,kx)=>{ let a=0; for(let i=0,j=r.length-1;i<r.length;j=i++) a+=(r[j][0]-r[i][0])*kx*(r[j][1]+r[i][1])*111320; return Math.abs(a/2); };

function add(ring,name){ if(!ring||ring.length<4) return null; const k=keyOf(ring);
  if(ST.list.some(s=>s.key===k.key)) return null;
  const s=Object.assign({ring,name:name||'Meijer',brand:brandOf(name),id:ring.id!=null?ring.id:null,keys:ring.keys||[]},k); ST.list.push(s); changed(); found(s); return s; }
// the building a point stands in (or the biggest one within 90 m), from the map tiles. A big building cut by a tile edge
// comes in pieces with the same id: they are joined into one outline (union, below).
// the outline of several buildings that touch (owner 2026-11-23: a convex hull took in the shops next door, so their
// windows stood inside the store and the doors floated off the walls). Works on pieces that share walls, as tile-cut
// pieces and entrances drawn onto a store do: walls the pieces share cancel out, the rest chain into one outline.
// Returns null when the pieces don't join cleanly (then they're left apart).
function union(rings,lng0,lat0){
  const kx=111320*Math.cos(lat0*Math.PI/180), ky=111320, V=[], vid=(x,y)=>{ for(let i=0;i<V.length;i++) if(Math.abs(V[i][0]-x)<.35&&Math.abs(V[i][1]-y)<.35) return i; V.push([x,y]); return V.length-1; };
  const polys=rings.map(r=>{ let p=r.slice(0,-1).map(q=>vid((q[0]-lng0)*kx,(q[1]-lat0)*ky)); p=p.filter((v,i)=>v!==p[(i+1)%p.length]);
    let a=0; for(let i=0;i<p.length;i++){ const A=V[p[i]], B=V[p[(i+1)%p.length]]; a+=A[0]*B[1]-B[0]*A[1]; } if(a<0) p.reverse(); return {p,a:Math.abs(a)/2}; });
  // every wall, cut wherever another piece's corner lies on it
  let E=[]; for(const P of polys) for(let i=0;i<P.p.length;i++) E.push([P.p[i],P.p[(i+1)%P.p.length]]);
  const split=[]; for(const [a,b] of E){ const A=V[a], B=V[b], dx=B[0]-A[0], dy=B[1]-A[1], L2=dx*dx+dy*dy; if(!L2) continue; const cut=[];
    for(let k=0;k<V.length;k++){ if(k===a||k===b) continue; const t=((V[k][0]-A[0])*dx+(V[k][1]-A[1])*dy)/L2; if(t<=.001||t>=.999) continue;
      if(Math.hypot(A[0]+dx*t-V[k][0],A[1]+dy*t-V[k][1])<.3) cut.push([t,k]); }
    cut.sort((x,y)=>x[0]-y[0]); let s0=a; for(const [,k] of cut){ split.push([s0,k]); s0=k; } split.push([s0,b]); }
  // a wall two pieces share runs both ways: it's inside, drop it
  const key=(a,b)=>a+'>'+b, cnt=new Map(); for(const [a,b] of split) cnt.set(key(a,b),(cnt.get(key(a,b))||0)+1);
  const out=new Map(); for(const [a,b] of split){ if(cnt.has(key(b,a))) continue; if(!out.has(a)) out.set(a,[]); if(!out.get(a).includes(b)) out.get(a).push(b); }
  // chain the rest into rings; the biggest is the outline
  let best=null, ba=0; const used=new Set();
  for(const [s0] of out){ for(const n0 of out.get(s0)){ if(used.has(key(s0,n0))) continue; const ring=[s0]; let a=s0, b=n0, guard=0;
      while(guard++<5000){ used.add(key(a,b)); ring.push(b); if(b===s0) break; const nx=(out.get(b)||[]).filter(c=>!used.has(key(b,c)));
        if(!nx.length) break; let pick=nx[0];
        if(nx.length>1){ const ang=c=>{ const h1=Math.atan2(V[b][1]-V[a][1],V[b][0]-V[a][0]), h2=Math.atan2(V[c][1]-V[b][1],V[c][0]-V[b][0]); let d=h2-h1; while(d<=-Math.PI) d+=2*Math.PI; while(d>Math.PI) d-=2*Math.PI; return d; };
          pick=nx.reduce((m,c)=>ang(c)>ang(m)?c:m,nx[0]); }                       // keep to the outside: the leftmost turn
        a=b; b=pick; }
      if(ring[ring.length-1]!==s0||ring.length<4) continue;
      let ar=0; for(let i=0;i<ring.length-1;i++){ const A=V[ring[i]], B=V[ring[i+1]]; ar+=A[0]*B[1]-B[0]*A[1]; } ar/=2;
      if(ar>ba){ ba=ar; best=ring; } } }
  const sum=polys.reduce((t,P)=>t+P.a,0); if(!best||Math.abs(ba-sum)>Math.max(4,sum*.005)) return null;   // pieces overlapping or apart: no clean join
  return best.map(i=>[lng0+V[i][0]/kx,lat0+V[i][1]/ky]); }
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
  // the entrance pieces: small buildings stuck onto it (vestibules, the roof over the doors), mapped on their own.
  // Inside they'd stand as a wall between the doors and the store (owner 2026-11-23), so they become part of it.
  let pieces=[best,...parts]; let ring0=parts.length?union(pieces.map(o=>o.r),best.r[0][0],best.r[0][1]):best.r;
  if(!ring0){ pieces=[best]; ring0=best.r; }                        // the tile-cut pieces didn't join: just the biggest
  const mainA=areaM(ring0,kx);
  const touch=o=>{ const A=areaM(o.r,kx); if(A>Math.min(2500,mainA*.12)) return false;
    for(const q of o.r){ if(inRing(ring0,q[0],q[1])) return true; for(let i=1;i<ring0.length;i++){ const a=ring0[i-1], b=ring0[i];
      const ax=(a[0]-q[0])*kx, ay=(a[1]-q[1])*111320, bx=(b[0]-q[0])*kx, by=(b[1]-q[1])*111320, dx=bx-ax, dy=by-ay, L2=dx*dx+dy*dy, t=L2?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/L2)):0;
      if(Math.hypot(ax+dx*t,ay+dy*t)<1.5) return true; } } return false; };
  // each entrance piece joins only if it shares a wall cleanly with the store
  let ring=ring0; const joined=[];
  for(const o of all.filter(o=>o!==best&&!parts.includes(o)&&touch(o))){ const u=union([ring,o.r],ring[0][0],ring[0][1]); if(u){ ring=u; joined.push(o); } }
  if(ring===best.r) ring=best.r.slice();
  const ids=[...new Set([...pieces,...joined].map(o=>o.f.id).filter(i=>i!=null))];
  ring.id=ids.length>1?ids:best.f.id; ring.keys=[...pieces,...joined].map(o=>keyOf(o.r).key); return ring; }
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
  try{ const j=await ovFetch(`[out:json][timeout:25];(nwr["name"~"meijer|walmart",i]${bb};nwr["brand"~"meijer|walmart",i]${bb};);out geom qt;`);
    for(const el of (j&&j.elements)||[]){ const t=el.tags||{}, n=t.name||t.brand||'Meijer'; if(!NAME.test(n)||NOT.test(n)||t.highway||t.amenity==='fuel') continue;
      const ring=el.type==='way'&&el.geometry&&el.geometry.length>3?el.geometry.map(p=>[+p.lon,+p.lat]):null;
      const c=el.type==='node'?[el.lon,el.lat]:el.bounds?[(el.bounds.minlon+el.bounds.maxlon)/2,(el.bounds.minlat+el.bounds.maxlat)/2]:null; if(!c) continue;
      addPt(+c[0],+c[1],n.replace(/\s*\(.*\)\s*$/,''),ring&&t.building&&ring[0][0]===ring[ring.length-1][0]?ring:null); } }
  catch(e){ console.warn('stores overpass',e); } ST.busy=false; resolvePts(); }
// the place search (Nominatim), as a second source
async function scanSearch(){ ST.nsAt=[S.lng,S.lat]; const vb=[S.lng-.07,S.lat+.05,S.lng+.07,S.lat-.05].map(v=>v.toFixed(4)).join(',');
  for(const q of ['Meijer','Walmart']){
    try{ const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10&bounded=1&viewbox='+vb+'&q='+q); if(!r.ok) continue;
      for(const x of await r.json()){ const n=(x.name||x.display_name||'').split(',')[0]; if(!NAME.test(n)||NOT.test(n)||x.category==='highway'||x.type==='fuel') continue; addPt(+x.lon,+x.lat,n); } }
    catch(e){} }
  resolvePts(); }
// "this is Meijer": the big building nearest you (or the one you're looking at) becomes one, remembered on this device
function markHere(brand){ brand=brand||'Meijer'; const h=S.hdg*Math.PI/180, kx=111320*Math.cos(S.lat*Math.PI/180);
  for(const ah of [0,40,80,120]){ const lng=S.lng+Math.sin(h)*ah/kx, lat=S.lat+Math.cos(h)*ah/111320, r=buildingFor(lng,lat);
    if(r){ const k=keyOf(r); let sv=[]; try{ sv=JSON.parse(localStorage.getItem(SAVE)||'[]'); }catch(e){} sv.push([+k.cx.toFixed(6),+k.cy.toFixed(6),brand]);
      try{ localStorage.setItem(SAVE,JSON.stringify(sv.slice(-30))); }catch(e){} addPt(k.cx,k.cy,brand,r,true); resolvePts(); return true; } }
  return false; }
/* The greeter standing inside the doors (js/enh/walk.js draws the person) says "Welcome to Meijer" / "Welcome to Walmart" when
   you walk in. ⚙️ A/V → Store greeter turns the voice off (the greeter still stands there); saved as ydGreeter on this device. */
const GREET={key:'ydGreeter',last:{}};
const greeterOn=()=>{ try{ return localStorage.getItem(GREET.key)!=='off'; }catch(e){ return true; } };
function greet(s,delay){ if(!s||!greeterOn()) return false; const now=performance.now(), k=s.key; if(now-(GREET.last[k]||-1e9)<45000) return false;   // not again on a quick step out and in
  GREET.last[k]=now; const t='Welcome to '+(s.brand||brandOf(s.name))+'.';
  setTimeout(()=>{ if(!greeterOn()) return;                                  // a short pause first: you've just stepped in, the greeter notices you, then speaks
    if(typeof toast==='function') toast('👋 '+t,2600);
    try{ if(window.speechSynthesis){ speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(t); u.lang='en-US'; u.rate=.98;
        const vs=speechSynthesis.getVoices(); u.voice=vs.find(v=>/en[-_]US/i.test(v.lang)&&/Google|Natural|Aria|Jenny|Guy/i.test(v.name))||vs.find(v=>/^en/i.test(v.lang))||null; if(!u.voice) delete u.voice;
        const d=on=>{ for(const f of [()=>window.MUSIC&&MUSIC.duck&&MUSIC.duck(on),()=>window.SOUND&&SOUND.duck&&SOUND.duck(on)]) try{ f(); }catch(e){} };
        d(true); u.onend=u.onerror=()=>setTimeout(()=>d(false),200); setTimeout(()=>d(false),4000); speechSynthesis.speak(u); } }catch(e){} },delay==null?1300:delay);
  return true; }
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
function ownRec(s){ const kx=111320*Math.cos(s.cy*Math.PI/180), ky=111320;
  let p=s.ring.slice(0,-1).map(q=>[(q[0]-s.cx)*kx,(q[1]-s.cy)*ky]); let a=0; for(let i=0,j=p.length-1;i<p.length;j=i++) a+=(p[j][0]-p[i][0])*(p[j][1]+p[i][1]); if(a<0) p.reverse();   // counter-clockwise
  const E=frontOf(s,p); if(!E) return null; const sm=E.L/2;
  // two pairs of glass doors either side of a tall pillar (owner's photo of the Oswego Meijer: entrance on the left, exit on the right)
  const mk=(s0,s1,k)=>({ei:E.ei,s0,s1,x0:E.a[0]+E.ux*s0,y0:E.a[1]+E.uy*s0,x1:E.a[0]+E.ux*s1,y1:E.a[1]+E.uy*s1,nx:E.nx,ny:E.ny,dk:9e8+ST.list.indexOf(s)*2+k});
  const d=mk(sm-2.6,sm-.5,0), d2=mk(sm+.5,sm+2.3,1);       // the left pair a little wider, as in the photo
  // the doors js/enh/buildings.js drew on the store's pieces work too, where they lie on the outline
  // a big overhead garage door (a loading door) on the parking-lot wall, left of the entrance, that opens with the garage opener and lets you drive in
  /* The door goes where a loading door would: left of the entrance on the front wall when that wall is long enough, else on
     the longest other wall (owner 2026-11-23: it didn't open at the Oswego Meijer — its front wall is short, so no door was
     made). No driveway is needed: a store's opener works from anywhere in front of the door (js/enh/garage.js). */
  const garages=[]; { const gw=4, cand=[];
    if(sm-12.5>1.2) cand.push({ei:E.ei,a:E.a,ux:E.ux,uy:E.uy,nx:E.nx,ny:E.ny,s0:sm-12.5});
    const others=[]; for(let i=0;i<p.length;i++){ if(i===E.ei) continue; const a=p[i], b=p[(i+1)%p.length], ex=b[0]-a[0], ey=b[1]-a[1], L=Math.hypot(ex,ey); if(L>=12) others.push({ei:i,a,ux:ex/L,uy:ey/L,nx:ey/L,ny:-ex/L,s0:L/2-gw/2,L}); }
    others.sort((u,v)=>v.L-u.L); for(const o of others) cand.push(o);
    const F=cand[0]; if(F){ const gs0=F.s0, gs1=gs0+gw; let depth=0; const mx=F.a[0]+F.ux*(gs0+gw/2), my=F.a[1]+F.uy*(gs0+gw/2); for(const q of p) depth=Math.max(depth,-((q[0]-mx)*F.nx+(q[1]-my)*F.ny));
      garages.push({ei:F.ei,s0:gs0,s1:gs1,x0:F.a[0]+F.ux*gs0,y0:F.a[1]+F.uy*gs0,x1:F.a[0]+F.ux*gs1,y1:F.a[1]+F.uy*gs1,nx:F.nx,ny:F.ny,gk:8e8+ST.list.indexOf(s),col:'#e7e4dc',D:Math.max(6,Math.min(70,depth-.4))}); } }
  const doors=[d,d2], base=window.ROOFS&&ROOFS.st0?ROOFS.st0():[];
  for(const r of base){ if(!covers(r)) continue;
    for(const q of r.doors||[]){ const mx=(q.x0+q.x1)/2, my=(q.y0+q.y1)/2, lng=r.cx+mx/r.kx, lat=r.cy+my/r.ky, X=(lng-s.cx)*kx, Y=(lat-s.cy)*ky, hw=Math.hypot(q.x1-q.x0,q.y1-q.y0)/2;
      for(let i=0;i<p.length;i++){ const a=p[i], b=p[(i+1)%p.length], L=Math.hypot(b[0]-a[0],b[1]-a[1]); if(L<2) continue; const ux=(b[0]-a[0])/L, uy=(b[1]-a[1])/L;
        const t=(X-a[0])*ux+(Y-a[1])*uy, off=(X-a[0])*uy-(Y-a[1])*ux; if(t<hw+.2||t>L-hw-.2||Math.abs(off)>.8) continue;
        if(doors.some(o=>o.ei===i&&Math.abs((o.s0+o.s1)/2-t)<3.5)) break;
        doors.push({ei:i,s0:t-hw,s1:t+hw,x0:a[0]+ux*(t-hw),y0:a[1]+uy*(t-hw),x1:a[0]+ux*(t+hw),y1:a[1]+uy*(t+hw),nx:uy,ny:-ux,dk:q.dk}); break; } } }
  return {key:s.key,keys:s.keys,id:s.id,cx:s.cx,cy:s.cy,kx,ky,p,h:s.h||hOf(s),house:false,doors,garages,bb:s.bb,store:true,brand:s.brand,E,sm}; }
// the store's pieces come in as their tiles load: look again (at most every 4 s) and grow the outline to take them in
function regrow(s){ const now=performance.now(); if(now-(s.gT||0)<4000) return; s.gT=now;
  const r=buildingFor(s.cx,s.cy); if(!r) return; const k=keyOf(r); const kk=(r.keys||[]).join('|');
  if(kk===(s.keys||[]).join('|')) return;
  s.ring=r; s.bb=k.bb; s.keys=r.keys||[]; s.id=r.id!=null?r.id:s.id; s.rec=null; s.fd=null; }
// is this walk-in building (from js/enh/buildings.js) one of a store's pieces? Then the store's own way in stands for it
function covers(r){ for(const s of ST.list){ if((s.keys||[]).includes(r.key)) return true; if(r.cx>=s.bb[0]&&r.cx<=s.bb[2]&&r.cy>=s.bb[1]&&r.cy<=s.bb[3]&&inRing(s.ring,r.cx,r.cy)) return true; } return false; }
function recs(){ const out=[], kx0=111320*Math.cos(S.lat*Math.PI/180);
  for(const s of ST.list){ if(Math.hypot((s.cx-S.lng)*kx0,(s.cy-S.lat)*111320)>600) continue;
    regrow(s);
    if(!s.rec||s.rec.fdN!==s.fdN||performance.now()-s.rec.t>5000) { s.rec=ownRec(s); if(s.rec){ s.rec.fdN=s.fdN; s.rec.t=performance.now(); } }
    if(s.rec) out.push(s.rec); }
  return out; }
function hOf(s){ let h=0; try{ for(const f of map.querySourceFeatures(bSrc,{sourceLayer:'building'})){ if(s.id==null||f.id!==s.id) continue; const pr=f.properties||{}; h=Math.max(h,+(pr.render_height||pr.height||0)); } }catch(e){} return h||8; }
// the glass double doors on the map (dark frame, two glass leaves, push bars), like buildings.js draws its own
function drawDoors(){ const feats=[]; ST.cache=[];
  for(const r of recs()){ const E=r.E, sm=r.sm, toLL=q=>[+(r.cx+q[0]/r.kx).toFixed(7),+(r.cy+q[1]/r.ky).toFixed(7)];
    const o=ST.op[r.key]||0; ST.cache.push({gks:[],key:r.key,lng:r.cx+(E.a[0]+E.ux*sm)/r.kx,lat:r.cy+(E.a[1]+E.uy*sm)/r.ky});
    const put=(s0,s1,o0,o1,b,h,c,g)=>{ if(s1-s0<.02) return; const a=[E.a[0]+E.ux*s0,E.a[1]+E.uy*s0], z=[E.a[0]+E.ux*s1,E.a[1]+E.uy*s1];
      const ring=[[a[0]+E.nx*o0,a[1]+E.ny*o0],[z[0]+E.nx*o0,z[1]+E.ny*o0],[z[0]+E.nx*o1,z[1]+E.ny*o1],[a[0]+E.nx*o1,a[1]+E.ny*o1]].map(toLL); ring.push(ring[0]);
      feats.push({type:'Feature',properties:{c,b,h,g:g?1:0},geometry:{type:'Polygon',coordinates:[ring]}}); };
    const AL='#dfe2e4', GL='#27313e', BK='#16181b', YL='#f1d21c', PANEL='#d3d6d8', SEE='#9db4c6';          // SEE: clear glass, drawn on its own see-through layer
    put(sm-2.75,sm+2.45,.04,.08,0,4.7,PANEL);                                                            // the white storefront, tall like the photo
    for(const [a0,a1] of [[sm-2.6,sm-.55],[sm+.55,sm+2.3]]){ const m=(a0+a1)/2;
      put(a0,a1,.08,.1,2.95,4.35,'#262e36'); put(a0,a1,.1,.12,2.95,4.35,SEE,1); put(m-.03,m+.03,.12,.15,2.95,4.35,AL); put(a0,a1,.12,.15,3.62,3.68,AL);   // two rows of dark glass with a mullion and a rail
      put(a0,a1,.08,.14,2.62,2.95,PANEL); }                                                              // the grey band over the doors
    put(sm-.5,sm+.5,.04,.2,0,4.7,'#c6c9cb');                                                             // the tall pillar between the pairs
    // the automatic doors: each pair's two leaves slide apart towards the jambs as you come up, and close behind you
    for(const [c0,c1] of [[sm-2.6,sm-.5],[sm+.5,sm+2.3]]){ const cm=(c0+c1)/2;
      put(c0,c1,.08,.12,0,2.62,o>.02?'#0d0f12':'#6c737a');                                              // the doorway: dark once they open
      put(cm-.2,cm+.2,.14,.2,2.5,2.6,BK);                                                                // the sensor over each pair
      for(const z of [-1,1]){ const J=cm+z*(c1-c0)/2, lw=(c1-c0)/2-.02, F=J-z*lw*(1-.92*o), A=Math.min(J,F), B=Math.max(J,F);
        put(A,B,.12,.15,.04,2.5,AL);                                                                     // white aluminium frame
        if(B-A>.3){ put(A+.08,B-.08,.15,.17,.5,2.3,SEE,1); put(A+.04,B-.04,.17,.21,.82,.94,BK); put(A+.04,B-.04,.17,.21,.14,.32,BK);   // glass, then the two black bars
          const mm=(A+B)/2; put(mm-.1,mm+.1,.17,.18,1.2,1.4,YL); } }                                      // and the yellow caution sticker
      put(cm-.05,cm+.05,.2,.3,0,.95,BK); }                                                               // black post between each pair's doors
    put(sm+.5,sm+.56,.1,1.9,0,1.05,BK); put(sm+2.3,sm+2.36,.1,1.9,0,1.05,BK);                            // the black gates in front of the exit doors
    put(sm+.56,sm+2.3,1.84,1.9,0,1.05,BK);
    put(sm-2.85,sm+2.85,.06,.9,4.7,4.9,'#c9ccd0');
    for(const q of r.garages){ const go=window.GARAGE?GARAGE.openness(q.gk):0, H=2.4, rise=go*(H-.1), a0=q.s0, a1=q.s1;      // the overhead door rolls up out of the opening
      ST.cache[ST.cache.length-1].gks.push(q.gk);
      put(a0-.2,a1+.2,.03,.14,0,2.75,AL);                                                                // white surround
      put(a0,a1,.05,.1,0,H,'#101215');                                                                   // the dark store behind
      put(a0,a1,.1,.15,rise,H,q.col);                                                                    // the door panel: its bottom rises
      for(let k=1;k<4;k++){ const y=rise+k*.6; if(y<H-.05) put(a0,a1,.15,.17,y,y+.035,'#a7adb3'); }       // the joints between its panels
      put(a0-.55,a0-.4,.7,.85,0,1.05,YL); put(a1+.4,a1+.55,.7,.85,0,1.05,YL); } }                        // yellow bollards each side                                                     // a little canopy edge over them
  safe('stores',()=>{ const src=map.getSource('stores'); if(src) src.setData({type:'FeatureCollection',features:feats}); }); }
function layers(){ safe('stores layer',()=>{ if(map.getSource('stores')) return;
  map.addSource('stores',{type:'geojson',data:{type:'FeatureCollection',features:[]},maxzoom:19,tolerance:0});
  map.addLayer({id:'stores-glass',type:'fill-extrusion',source:'stores',minzoom:13,filter:['==',['get','g'],1],paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-base':['get','b'],'fill-extrusion-height':['get','h'],'fill-extrusion-opacity':.3,'fill-extrusion-vertical-gradient':false}},
    map.getLayer('hn-big')?'hn-big':undefined);                                                       // the glass: see-through
  map.addLayer({id:'stores-3d',type:'fill-extrusion',source:'stores',minzoom:13,filter:['==',['get','g'],0],paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-base':['get','b'],'fill-extrusion-height':['get','h'],'fill-extrusion-vertical-gradient':false}},
    map.getLayer('hn-big')?'hn-big':undefined); }); }

// the doors are automatic: a sensor within 5 m opens every Meijer entrance, in about half a second, and they shut again when you leave
ST.op={}; ST.gop={}; ST.cache=[]; let lastDraw=0;
FRAME_HOOKS.push(function storeDoors(dt){ if(!ST.cache.length) return false; let ch=false;
  for(const c of ST.cache){ const near=meters(c.lat,c.lng,S.lat,S.lng)<8, o0=ST.op[c.key]||0, o=Math.max(0,Math.min(1,o0+(near?1:-1)*dt/.4)); if(o!==o0){ ST.op[c.key]=o; ch=true; } }
  for(const c of ST.cache) for(const gk of c.gks){ const go=window.GARAGE?GARAGE.openness(gk):0; if(go!==ST.gop[gk]){ ST.gop[gk]=go; ch=true; } }
  const now=performance.now(); if(ch&&now-lastDraw>45){ lastDraw=now; safe('store doors',drawDoors); } return false; });
onReady(function stores(){ layers(); setTimeout(()=>safe('stores scan',()=>{ scanTiles(); drawDoors(); }),2500); });
onTick(1500,function storeTick(){
  const moved=ST.at?meters(ST.at[1],ST.at[0],S.lat,S.lng):1e9;
  if(moved>250||ST.dirty){ ST.at=[S.lng,S.lat]; ST.dirty=false; safe('stores scan',scanTiles); layers(); }
  if(PTS.some(q=>!q.done)) safe('stores pts',resolvePts);
  const om=ST.ovAt?meters(ST.ovAt[1],ST.ovAt[0],S.lat,S.lng):1e9; if(om>2500&&performance.now()-ST.ovT>60000) scanOverpass();
  const nm=ST.nsAt?meters(ST.nsAt[1],ST.nsAt[0],S.lat,S.lng):1e9; if(nm>3000) scanSearch();
  if(ST.list.length) safe('store doors',drawDoors);
});
window.STORES={list:ST.list,at,recs,covers,add,frontDir,markHere,greet,greeterOn,brandOf,pts:PTS,state:ST,refresh:()=>{ ST.dirty=true; }};
})();
