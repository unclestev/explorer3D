/* On foot: get out of the car and walk or run around as a person, then get back in.
   🚶 button (or F key) gets out when you're stopped (not on the water, in the air or during a police chase); the car,
   tractor or photo car stays parked where you left it, engine off. On foot the same controls drive the person:
   steering turns (on the spot too), GAS walks — press higher up the pedal to jog and run — and BRAKE steps back.
   Buildings and water stop you (you don't plow through like the car). The button turns into 🚗 and lights up green
   when you're close enough to get back in; the HUD says where the car is when you've wandered off. You can also take
   off in the hang glider on foot; landing puts you back on foot, with the car still where you parked it.
   Movement uses the same 3x world speed-up as driving, so the mph and miles on foot agree with the rest of the game.
   The person is a simple original 3D figure drawn in the car layer at real size, and so is the parked car while you're on
   foot (owner 2026-11-23: at the old 1.6x the person was taller than the doors and the car twice the garage), whatever
   the car-size setting; the camera comes in closer instead (WX).
   Doors (owner 2026-11-22: "enter buildings through doors, and not just walk through the walls"): the front doors and
   glass entrances that js/enh/buildings.js draws on nearby buildings can be walked through — the door shows open (dark)
   when you're at it, and walking at a wall near a door slides you into the doorway. Inside, that one building is hidden
   and drawn cut away instead — a floor, waist-high walls with the doorways and their frames — and the camera looks
   down more steeply, so you can see the inside (empty for now). Its walls keep you in; leave through a door. Only the
   ground floor; buildings without a drawn door (sheds, buildings split across map tiles, far away) stay solid. */
(()=>{
'use strict';
const {safe}=YD;
const btn=document.getElementById('walkBtn');
const PK={mode:null,lat:0,lng:0,hdg:0};                          // the parked vehicle while you're on foot
const W={v:0,phase:0,amp:0,run:0,order:0,blockT:0,near:false,lastAnim:false};
const WALKV=1.4, RUNV=5.4, BACKV=.9;                              // m/s on the speedometer (3.1 / 12 / 2 mph)

/* ---------- the person (metres, front = -z, feet on y = 0) ---------- */
function buildPerson(pal){
  pal=pal||{};
  const mat=c=>new THREE.MeshLambertMaterial({color:c,transparent:true,opacity:1});   // transparent: drawn in order with the car photo
  const skin=mat(pal.skin||0xc98f6a), hair=mat(pal.hair||0x3b2a1e), top=mat(pal.top||0x6f7780), jeans=mat(pal.jeans||0x2c3a52), shoe=mat(0xe8e6e1), sole=mat(0x6b6b6b);
  const cyl=(rt,rb,h,m,seg)=>new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg||10),m);
  const root=new THREE.Group(), fig=new THREE.Group(); root.add(fig);
  const parts={};
  // legs: hip -> knee -> shoe
  for(const s of [-1,1]){
    const hip=new THREE.Group(); hip.position.set(s*.095,.96,0); fig.add(hip);
    const th=cyl(.08,.066,.46,jeans); th.position.y=-.22; hip.add(th);
    const knee=new THREE.Group(); knee.position.y=-.44; hip.add(knee);
    const sh=cyl(.062,.048,.44,jeans); sh.position.y=-.22; knee.add(sh);
    const ft=new THREE.Mesh(new THREE.BoxGeometry(.11,.075,.27),shoe); ft.position.set(0,-.48,-.05); knee.add(ft);
    const so=new THREE.Mesh(new THREE.BoxGeometry(.115,.02,.28),sole); so.position.set(0,-.515,-.05); knee.add(so);
    parts[s<0?'hipL':'hipR']=hip; parts[s<0?'kneeL':'kneeR']=knee;
  }
  // upper body leans from the hips
  const up=new THREE.Group(); up.position.y=.96; fig.add(up); parts.up=up;
  const pel=new THREE.Mesh(new THREE.BoxGeometry(.32,.17,.2),jeans); pel.position.y=.03; up.add(pel);
  const tor=cyl(.205,.165,.52,top,14); tor.scale.z=.62; tor.position.y=.36; up.add(tor);
  const sho=cyl(.11,.205,.08,top,14); sho.scale.z=.62; sho.position.y=.66; up.add(sho);
  const hood=new THREE.Mesh(new THREE.TorusGeometry(.085,.035,6,14),top); hood.rotation.x=Math.PI/2; hood.position.set(0,.7,.03); up.add(hood);
  const neck=cyl(.05,.055,.1,skin); neck.position.y=.72; up.add(neck);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.112,16,12),skin); head.scale.set(.9,1.08,1); head.position.y=.86; up.add(head);
  const hr=new THREE.Mesh(new THREE.SphereGeometry(.12,16,10,0,Math.PI*2,0,Math.PI*.58),hair); hr.scale.set(.92,1.05,1.04);
  hr.rotation.x=.55; hr.position.set(0,.875,.012); up.add(hr);                  // covers the top and back of the head
  // arms: shoulder -> elbow -> hand
  for(const s of [-1,1]){
    const sh=new THREE.Group(); sh.position.set(s*.225,.62,0); up.add(sh);
    const ua=cyl(.054,.047,.3,top); ua.position.y=-.14; sh.add(ua);
    const el=new THREE.Group(); el.position.y=-.29; sh.add(el);
    const fa=cyl(.046,.04,.26,top); fa.position.y=-.12; el.add(fa);
    const hd=new THREE.Mesh(new THREE.SphereGeometry(.046,10,8),skin); hd.scale.set(.8,1.15,1); hd.position.y=-.29; el.add(hd);
    sh.rotation.z=s*.07;
    parts[s<0?'shL':'shR']=sh; parts[s<0?'elL':'elR']=el;
  }
  const sh=new THREE.Mesh(new THREE.PlaneGeometry(.95,.75),shadow.material); sh.rotation.x=-Math.PI/2; sh.position.y=.02; root.add(sh);
  root.userData=parts; root.userData.fig=fig; root.visible=false;
  return root;
}
const person=buildPerson(); scene.add(person);
function setOrder(n){ if(W.order===n) return; W.order=n; person.traverse(o=>{ if(o.isMesh) o.renderOrder=n; }); }
setOrder(12);

// walk / run cycle: swing the legs and arms, bend the knees on the forward swing, bob and lean when running
function pose(){
  const P=person.userData, a=W.amp, r=W.run, s=Math.sin(W.phase), c=Math.cos(W.phase);
  P.hipL.rotation.x=s*a; P.hipR.rotation.x=-s*a;
  const kb=a*(1.1+r*.9);
  P.kneeL.rotation.x=-kb*Math.max(0,c)-.05; P.kneeR.rotation.x=-kb*Math.max(0,-c)-.05;
  P.shL.rotation.x=-s*a*(.75+r*.2); P.shR.rotation.x=s*a*(.75+r*.2);
  const el=.15+a*.4+r*1.0; P.elL.rotation.x=el; P.elR.rotation.x=el;
  P.up.rotation.x=-.04-.16*r*(a>.05?1:0);
  P.fig.position.y=a*(.025+.06*r)*Math.abs(Math.sin(W.phase*2+.6))-a*.02;
}
pose();

/* ---------- helpers ---------- */
const cosLat=()=>Math.cos(rad(S.lat));
// a point `r` metres right and `f` metres ahead of (lat, lng) facing heading h
function offsetPt(lat,lng,h,r,f){ const e=Math.sin(h)*f+Math.cos(h)*r, n=Math.cos(h)*f-Math.sin(h)*r;
  return [lat+n/111320, lng+e/(111320*Math.cos(rad(lat)))]; }
function inBuilding(lat,lng){
  if(!styleReady||!blockIds.length) return false;
  if(QGEO()) return geoBlocks(lng,lat).some(f=>contains(f.geometry,lng,lat));   // terrain on: from the data (no GPU read-back)
  const p=map.project([lng,lat]); return hit(p.x,p.y,6,blockIds).some(f=>contains(f.geometry,lng,lat)); }
function inWater(lat,lng){
  if(!inAny(landCache.water,lng,lat)) return false;
  if(QGEO()){ const r=geoRoads(lng,lat,0); return !(r&&r.some(f=>f.properties.brunnel==='bridge')); }
  const p=map.project([lng,lat]); return !hit(p.x,p.y,5,bridgeIds).length; }
const vehName=()=>PK.mode==='tractor'?'tractor':PK.mode==='boat'?'boat':(CARSPEC&&CARSPEC.name?CARSPEC.name.replace(/^\S+\s/,''):'car');
const WX=1;                                                        // on foot everything is drawn real size
const reach=()=>4.2;                                               // close enough to get in (metres)
function carInfo(){
  const d=meters(S.lat,S.lng,PK.lat,PK.lng);
  const dy=(PK.lat-S.lat)*111320, dx=(PK.lng-S.lng)*111320*cosLat();
  const rel=((Math.atan2(dx,dy)*180/Math.PI-S.hdg)%360+540)%360-180;
  const where=Math.abs(rel)<35?'ahead':Math.abs(rel)>145?'behind you':rel>0?'to your right':'to your left';
  const ft=d*3.281; const dist=ft<1000?Math.round(ft/10)*10+' ft':(YD.fmtDist?YD.fmtDist(d):Math.round(d)+' m');
  return {d,where,dist};
}
function setPedals(onFoot){
  const g=document.querySelector('#sp span'), b=document.querySelector('#brake span');
  if(g) g.textContent=onFoot?'WALK':'GAS'; if(b) b.textContent=onFoot?'BACK':'BRAKE';
}
function updateBtn(){
  if(!btn) return;
  const foot=mode==='walk'||(mode==='glider'&&PK.mode);
  btn.textContent=foot?'🚗':'🚶';
  btn.title=foot?'Get back in':'Get out of the car';
  btn.classList.toggle('on',mode==='walk'&&W.near);
}

/* ---------- doors and insides ---------- */
const IN={rec:null,key:null,ip:68,told:false,open:null};
const WALL=1.05, TH=.18;                                            // cut-away wall height and thickness (m)
const loc=(r,lat,lng)=>[(lng-r.cx)*r.kx,(lat-r.cy)*r.ky];
function inP(p,x,y){ let c=false; for(let i=0,j=p.length-1;i<p.length;j=i++){ const a=p[i],b=p[j]; if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])) c=!c; } return c; }
const inRec=(r,lat,lng)=>{ const q=loc(r,lat,lng); return inP(r.p,q[0],q[1]); };
function recsNear(lat,lng){                                       // buildings with walk-in doors around you
  const out=[]; if(!window.ROOFS||!ROOFS.doorsNear) return out;
  const mlat=14/111320, mlng=14/(111320*cosLat());
  for(const r of ROOFS.doorsNear()){ const b=r.bb; if(lng<b[0]-mlng||lng>b[2]+mlng||lat<b[1]-mlat||lat>b[3]+mlat) continue; out.push(r); }
  if(IN.rec&&!out.includes(IN.rec)) out.push(IN.rec);
  return out; }
// does the step from a to b (lat,lng) pass through one of r's doorways? (a little wider than the frame, for comfort)
const gOpen=g=>!!(window.GARAGE&&GARAGE.openness(g.gk)>.85);                 // an open garage door is a way in too
const ways=r=>r.garages&&r.garages.length?r.doors.concat(r.garages.filter(gOpen)):r.doors;
function doorCross(r,a,b){ const A=loc(r,a[0],a[1]), B=loc(r,b[0],b[1]);
  for(const d of ways(r)){ const L=Math.hypot(d.x1-d.x0,d.y1-d.y0)||1, ux=(d.x1-d.x0)/L, uy=(d.y1-d.y0)/L, w=.15;
    const cx=d.x0-ux*w, cy=d.y0-uy*w, ex=d.x1+ux*w-cx, ey=d.y1+uy*w-cy, rx=B[0]-A[0], ry=B[1]-A[1], den=rx*ey-ry*ex;
    if(Math.abs(den)<1e-9) continue;
    const t=((cx-A[0])*ey-(cy-A[1])*ex)/den, u=((cx-A[0])*ry-(cy-A[1])*rx)/den;
    if(t>=0&&t<=1&&u>=0&&u<=1) return d; }
  return null; }
// the nearest doorway to where you stand: {r,d,lat (along the wall from its middle), off (out from the wall)}
function nearDoor(recs,lat,lng){ let best=null;
  for(const r of recs){ const q=loc(r,lat,lng);
    for(const d of ways(r)){ const L=Math.hypot(d.x1-d.x0,d.y1-d.y0)||1, ux=(d.x1-d.x0)/L, uy=(d.y1-d.y0)/L, mx=(d.x0+d.x1)/2, my=(d.y0+d.y1)/2;
      const al=(q[0]-mx)*ux+(q[1]-my)*uy, off=(q[0]-mx)*d.nx+(q[1]-my)*d.ny, dist=Math.hypot(Math.max(0,Math.abs(al)-L/2),off);
      if(!best||dist<best.dist) best={r,d,al,off,dist,ux,uy,half:L/2}; } }
  return best; }
// hide the building you're in (its extrusion, roof cap, pitched roof, windows and doors); null = show it again.
// OpenFreeMap gives a whole group of neighbouring buildings one id (often a whole subdivision), and the map can only hide
// by id — so, like smashing (js/game.js addSurvivors), the group is hidden and every other building of it within ~800 m
// is redrawn from its own outline (layers 'inrest-3d' + its roof cap), leaving out only the one you're in.
const REST={type:'FeatureCollection',features:[]};
function restLayers(){
  if(map.getSource('inrest')) return;
  map.addSource('inrest',{type:'geojson',data:REST,tolerance:0});
  const before=map.getLayer('hn-big')?'hn-big':undefined, pp=id=>{ const L=map.getStyle().layers.find(l=>l.id===id); return L&&L.paint?JSON.parse(JSON.stringify(L.paint)):null; };
  const bp=pp('building-3d')||{'fill-extrusion-color':'#d6dbe2','fill-extrusion-height':['coalesce',['get','render_height'],6],'fill-extrusion-base':['coalesce',['get','render_min_height'],0]};
  bp['fill-extrusion-opacity']=1;
  map.addLayer({id:'inrest-3d',type:'fill-extrusion',source:'inrest',paint:bp},before);
  const cp=pp('roof-cap'); if(cp) map.addLayer({id:'inrest-cap',type:'fill-extrusion',source:'inrest',paint:cp},before);
}
function hideBuilding(r){
  const id=r?r.id:null;
  if(window.TRJ&&TRJ.hide) safe('trj hide',()=>TRJ.hide(!!(r&&r.key==='trj-gym')));
  HIDE.walk=id; applyHides();                                       // js/game.js: with the smashed ones and the redrawn groups
  if(map.getLayer('roof-3d')) safe('inside roofs',()=>map.setFilter('roof-3d',r?['!',['in',['coalesce',['get','bk'],''],['literal',(r.keys||[]).concat([r.key])]]]:null));
  // the rest of the group
  REST.features=[];
  const idl=id==null?[]:Array.isArray(id)?id:[id];
  if(r&&idl.some(i=>!destroyed.includes(i))){ const seen=new Set(), lim=800/111320, kx=Math.cos(rad(S.lat));
    let fs=[]; try{ fs=map.querySourceFeatures(bSrc,{sourceLayer:'building'}); }catch(e){}
    for(const q of fs){ if(!idl.includes(q.id)) continue; const g=q.geometry, pls=!g?[]:g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
      for(const pl of pls){ const ring=pl[0]; if(!ring||ring.length<4) continue;
        let x=0,y=0; const n=ring.length-1; for(let i=0;i<n;i++){ x+=ring[i][0]; y+=ring[i][1]; } x/=n; y/=n;
        if(Math.abs(y-S.lat)>lim||Math.abs(x-S.lng)*kx>lim) continue;
        const key=ring.length+':'+ring[0][0].toFixed(6)+','+ring[0][1].toFixed(6); if(seen.has(key)) continue; seen.add(key);   // the same piece from two tiles
        if(inRec(r,y,x)) continue;                                                               // the one you're in
        REST.features.push({type:'Feature',properties:q.properties||{},geometry:{type:'Polygon',coordinates:pl}}); } } }
  safe('inside rest',()=>{ restLayers(); map.getSource('inrest').setData(REST); });
  for(const lid of ['inrest-3d']) if(r&&!blockIds.includes(lid)) blockIds.push(lid);              // the redrawn ones still stop you (and the car)
}
// the cut-away inside: floor, waist-high walls with gaps at the doors, door frames
function interiorFeatures(r){
  const out=[], toLL=q=>[+(r.cx+q[0]/r.kx).toFixed(7),+(r.cy+q[1]/r.ky).toFixed(7)];
  const poly=(pts,c,b,h)=>{ const ring=pts.map(toLL); ring.push(ring[0]); out.push({type:'Feature',properties:{c,b,h},geometry:{type:'Polygon',coordinates:[ring]}}); };
  poly(r.p,r.house?'#b48a5c':'#d9d6cf',0,.05);                                                    // wood floor in houses, pale tile elsewhere
  const p=r.p;
  for(let i=0;i<p.length;i++){ const a=p[i], b=p[(i+1)%p.length], L=Math.hypot(b[0]-a[0],b[1]-a[1]); if(L<.05) continue;
    const ux=(b[0]-a[0])/L, uy=(b[1]-a[1])/L, nx=uy, ny=-ux;                                     // outward normal (counter-clockwise outline)
    const at=(s,o)=>[a[0]+ux*s-nx*o,a[1]+uy*s-ny*o];                                               // s along the wall, o in from it
    const strip=(s0,s1,o0,o1,c,b0,h)=>{ if(s1-s0>.01) poly([at(s0,o0),at(s1,o0),at(s1,o1),at(s0,o1)],c,b0,h); };
    const gar=(r.garages||[]).filter(d=>d.ei===i);
    const gaps=r.doors.concat(gar).filter(d=>d.ei===i).map(d=>[d.s0,d.s1]).sort((x,y)=>x[0]-y[0]);
    for(const g of gar){ const o=window.GARAGE?GARAGE.openness(g.gk):0, b0=.05+o*1.95;      // the garage door, cut away like the walls; it rolls up
      strip(g.s0,g.s1,.02,.1,g.col||'#ece6da',b0,Math.max(WALL,b0+.15)); }
    let s=0; for(const g of gaps.concat([[L,L]])){ strip(s,Math.max(s,g[0]),0,TH,'#ece6da',.05,WALL); strip(s,Math.max(s,g[0]),0,TH,'#8f877c',WALL,WALL+.04); s=Math.max(s,g[1]); }
    for(const g of gaps){                                                                          // door frame: two posts, a head, a sill
      strip(g[0]-.12,g[0],-.02,TH+.02,'#f4f1ea',.05,2.2); strip(g[1],g[1]+.12,-.02,TH+.02,'#f4f1ea',.05,2.2);
      strip(g[0]-.12,g[1]+.12,-.02,TH+.02,'#f4f1ea',2.05,2.2); strip(g[0],g[1],0,TH,'#7a6a58',.05,.07); } }
  return out; }
function drawInterior(r){
  if(!map.getSource('interior')){
    map.addSource('interior',{type:'geojson',data:{type:'FeatureCollection',features:[]},maxzoom:20,tolerance:0,buffer:8});
    map.addLayer({id:'interior-3d',type:'fill-extrusion',source:'interior',
      paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-base':['get','b'],'fill-extrusion-height':['get','h'],'fill-extrusion-vertical-gradient':false}},
      map.getLayer('hn-big')?'hn-big':undefined); }
  map.getSource('interior').setData({type:'FeatureCollection',features:r&&mode!=='walk'?interiorFeatures(r):[]});   // on foot: the real room (ROOM) instead
  if(r&&mode==='walk') buildRoom(r); else dropRoom();
}
/* ---------- first person indoors (owner 2026-11-23: "could the building stay and the doors just open to let you in, and when
   you are inside you see the walls and the roof if you look up?") ----------
   On foot inside a building the camera goes to your eyes (1.62 m) and the room is built in the car layer at real size:
   full-height walls with the doorways cut through (and their jambs), the ceiling, the floor, the door leaves — they swing
   open as you come up to them and close behind you — and the garage door, rolling up with the opener. The map building
   itself stays hidden (you're inside it); through an open doorway you see the street. Drag to look round and up. */
const ROOM={g:null,key:null,leaves:[],gar:[],r:null};
const FPV={on:false,fov:58};
const MATS={};
function rmat(k,c,emi){ if(!MATS[k]) MATS[k]=new THREE.MeshLambertMaterial({color:c,emissive:emi||0x000000,side:THREE.DoubleSide}); return MATS[k]; }
const to3=(x,y)=>[x,-y];                                           // local (east, north) metres -> car-layer (x, z)
function quad(pos,a,b,y0,y1){ const [ax,az]=to3(a[0],a[1]), [bx,bz]=to3(b[0],b[1]); pos.push(ax,y0,az, bx,y0,bz, bx,y1,bz, ax,y0,az, bx,y1,bz, ax,y1,az); }
function meshOf(pos,mat,uv){ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); if(uv) g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.computeVertexNormals(); return new THREE.Mesh(g,mat); }
/* ---------- what the rooms look like (owner 2026-11-23: "floors and walls and ceiling textures inside the buildings, only loaded
   when you enter... use your best judgement for the building type... the same textures when you enter it multiple times").
   Nothing here exists until you walk into a building: its textures are painted on a small canvas the first time they're
   asked for (a handful of 256 px ones, shared by every building of that look, thrown away when too many pile up) and the
   room's own meshes are dropped when you leave. Which look a building gets comes only from its key (where it stands) —
   a seeded pick, not Math.random — so the same building looks the same on every visit and on every device.
   Kinds: house (wood, laminate or carpet floors, painted walls, stippled ceiling), shop (vinyl tile / concrete / wood-look
   floors, painted drywall, dropped ceiling), school (speckled or checked vinyl tile, painted block walls with a darker
   lower band, dropped ceiling), office (carpet tile, drywall, dropped ceiling), industrial (sealed concrete, ribbed metal
   walls, exposed deck), Meijer (js/enh/stores.js: its own tiles). Every non-house gets the troffer lights that were made
   for Meijer (troffers() below). */
const ITX={}, IMT={};
function seedOf(k){ let h=2166136261; k=String(k); for(let i=0;i<k.length;i++){ h^=k.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
function prng(s){ return ()=>{ s=(s+0x6D2B79F5)|0; let t=Math.imul(s^(s>>>15),1|s); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }
const pickOf=(a,R)=>a[Math.floor(R()*a.length)%a.length];
const gray=v=>'rgb('+(v|0)+','+(v|0)+','+(v|0)+')';
// name: [pixels w, pixels h, metres w, metres h, draw(ctx,w,h,rnd,a,b), clampV]
const TXM={
  planks:[256,256,1.2,1.2,(x,w,h,R)=>{ x.fillStyle='#e6e6e6'; x.fillRect(0,0,w,h); const rows=8, rh=h/rows;
    for(let i=0;i<rows;i++){ let px=-R()*128; while(px<w){ const L=96+R()*96; x.fillStyle=gray(205+R()*50); x.fillRect(px,i*rh,L,rh);
      x.strokeStyle='rgba(0,0,0,.24)'; x.lineWidth=1; x.strokeRect(px+.5,i*rh+.5,L,rh);
      x.strokeStyle='rgba(60,60,60,.13)'; for(let g=0;g<3;g++){ const gy=i*rh+4+R()*(rh-8); x.beginPath(); x.moveTo(px,gy); x.lineTo(px+L,gy+(R()-.5)*3); x.stroke(); }
      px+=L; } } }],
  carpet:[128,128,1,1,(x,w,h,R)=>{ x.fillStyle='#d2d2d2'; x.fillRect(0,0,w,h); for(let i=0;i<2600;i++){ x.fillStyle=gray(150+R()*105); x.globalAlpha=.4; x.fillRect(R()*w,R()*h,1.4,1.4); } x.globalAlpha=1; }],
  ctile:[256,256,1,1,(x,w,h,R)=>{ for(let i=0;i<4;i++){ const X=(i%2)*128, Y=(i>>1)*128; x.fillStyle=gray(198+R()*30); x.fillRect(X,Y,128,128);
      for(let j=0;j<500;j++){ x.fillStyle=gray(140+R()*115); x.globalAlpha=.35; x.fillRect(X+R()*128,Y+R()*128,1.5,1.5); } x.globalAlpha=1; }
    x.fillStyle='rgba(0,0,0,.28)'; for(const v of [0,128]){ x.fillRect(v,0,1,h); x.fillRect(0,v,w,1); } }],
  vct:[256,256,.61,.61,(x,w,h,R,mode)=>{ for(let i=0;i<4;i++){ const X=(i%2)*128, Y=(i>>1)*128; x.fillStyle=mode==='chk'?((i===1||i===2)?gray(168):gray(246)):gray(222+R()*18); x.fillRect(X,Y,128,128);
      for(let j=0;j<(mode==='chk'?40:170);j++){ x.fillStyle=gray(90+R()*110); x.globalAlpha=.3; x.fillRect(X+R()*128,Y+R()*128,2+R()*2,1+R()); } x.globalAlpha=1; }
    x.fillStyle='rgba(0,0,0,.2)'; for(const v of [0,128]){ x.fillRect(v,0,1,h); x.fillRect(0,v,w,1); } }],
  concrete:[256,256,2.4,2.4,(x,w,h,R)=>{ x.fillStyle='#d6d6d6'; x.fillRect(0,0,w,h);
    for(let i=0;i<70;i++){ const cx=R()*w, cy=R()*h, r=14+R()*40, g=x.createRadialGradient(cx,cy,0,cx,cy,r), d=R()<.5; g.addColorStop(0,d?'rgba(90,90,90,.16)':'rgba(255,255,255,.2)'); g.addColorStop(1,'rgba(128,128,128,0)'); x.fillStyle=g; x.fillRect(cx-r,cy-r,2*r,2*r); }
    for(let i=0;i<900;i++){ x.fillStyle=gray(120+R()*130); x.globalAlpha=.25; x.fillRect(R()*w,R()*h,1.3,1.3); } x.globalAlpha=1;
    x.fillStyle='rgba(0,0,0,.4)'; x.fillRect(0,0,2,h); x.fillRect(0,0,w,2); }],
  drywall:[128,128,2,2,(x,w,h,R)=>{ x.fillStyle='#fbfbfa'; x.fillRect(0,0,w,h); for(let i=0;i<500;i++){ x.fillStyle=gray(228+R()*27); x.globalAlpha=.5; x.fillRect(R()*w,R()*h,2,2); } x.globalAlpha=1; }],
  stipple:[128,128,1,1,(x,w,h,R)=>{ x.fillStyle='#f6f6f4'; x.fillRect(0,0,w,h); for(let i=0;i<2600;i++){ x.fillStyle=R()<.5?'rgba(150,150,145,.3)':'rgba(255,255,255,.8)'; x.fillRect(R()*w,R()*h,1.6,1.6); } }],
  // painted concrete block: courses of 0.2 x 0.4 m; the picture is 3.2 m tall, floor at the bottom, a darker band 1.2 m high (a, b = upper, lower colour)
  block:[256,512,1.6,3.2,(x,w,h,R,a,b)=>{ x.fillStyle=a; x.fillRect(0,0,w,h); const wh=Math.round(1.2*160); x.fillStyle=b; x.fillRect(0,h-wh,w,wh);
    x.fillStyle='rgba(0,0,0,.28)'; x.fillRect(0,h-wh-5,w,5);                                                 // the stripe where the two colours meet
    for(let r=0;r<16;r++){ const Y=r*32, off=r&1?32:0; for(let c=-1;c<5;c++){ x.fillStyle=R()<.5?'rgba(0,0,0,.05)':'rgba(255,255,255,.06)'; x.fillRect(c*64+off,Y,64,32); }
      x.fillStyle='rgba(0,0,0,.2)'; x.fillRect(0,Y,w,2); for(let c=0;c<5;c++) x.fillRect(c*64+off,Y,2,32); } },1],
  metal:[256,256,1.6,1.6,(x,w,h)=>{ for(let i=0;i<16;i++){ const g=x.createLinearGradient(i*16,0,i*16+16,0); g.addColorStop(0,'#c8c8c8'); g.addColorStop(.35,'#f4f4f4'); g.addColorStop(.7,'#dcdcdc'); g.addColorStop(1,'#a8a8a8'); x.fillStyle=g; x.fillRect(i*16,0,16,h); } }],
  deck:[256,256,1.6,1.6,(x,w,h)=>{ for(let i=0;i<8;i++){ x.fillStyle=i&1?'#bdbdbd':'#e8e8e8'; x.fillRect(i*32,0,32,h); x.fillStyle='rgba(0,0,0,.18)'; x.fillRect(i*32,0,2,h); } }]
};
function itex(name,a,b){ const k=name+'|'+(a||'')+'|'+(b||''); if(ITX[k]) return ITX[k];
  const D=TXM[name], c=document.createElement('canvas'); c.width=D[0]; c.height=D[1]; D[4](c.getContext('2d'),D[0],D[1],prng(seedOf(k)),a,b);
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; if(D[5]) t.wrapT=THREE.ClampToEdgeWrapping; t.repeat.set(1/D[2],1/D[3]); t.anisotropy=8; return ITX[k]=t; }
function imat(name,tint,a,b,glow){ const k=name+'|'+tint+'|'+(a||'')+'|'+(b||''); if(IMT[k]) return IMT[k]; const t=itex(name,a,b), col=new THREE.Color(tint);
  return IMT[k]=new THREE.MeshLambertMaterial({color:col.clone().multiplyScalar(.7),map:t,emissive:col.clone().multiplyScalar(glow||.22),emissiveMap:t,side:THREE.DoubleSide}); }
function itexTrim(){ if(Object.keys(ITX).length<=14) return; for(const k in IMT) IMT[k].dispose(); for(const k in ITX) ITX[k].dispose(); for(const k in IMT) delete IMT[k]; for(const k in ITX) delete ITX[k]; }
const WALLS_HOUSE=['#f3eee3','#e9dfcc','#d9e2dc','#dfe6ee','#efe3cf','#e6d6d0','#d8dfc9','#f4f1ea'], FLOORS_HOUSE=[['planks','#d8b27f'],['planks','#8a5a36'],['planks','#b9b3a7'],['carpet','#cdbfa8'],['carpet','#9ba1a9'],['planks','#c99a62']];
function roomKind(r,SH){ if(SH) return 'store'; if(r.house) return 'house'; if(r.zone==='school') return 'school'; if(r.zone==='industrial') return 'industrial'; return (r.h||0)>12?'office':'shop'; }
// the look of one building's room, picked from its key alone: {kind, HC (ceiling height), wallM, floorM, ceilM, trof}
function roomLook(r,SH){
  const kind=roomKind(r,SH), R=prng(seedOf(r.key)), H=r.h||3, L={kind,trof:kind!=='house'};
  if(kind==='house'){ const f=pickOf(FLOORS_HOUSE,R); L.HC=Math.max(2.4,Math.min(2.7,H-.3));
    L.wallM=imat('drywall',pickOf(WALLS_HOUSE,R)); L.floorM=imat(f[0],f[1],0,0,.18); L.ceilM=imat('stipple','#f7f6f2'); }
  else if(kind==='store'){ L.HC=Math.max(3.6,Math.min(5,H-1.4)); L.wallM=imat('drywall','#ddd5c0'); L.floorM=storeMat('floor'); L.ceilM=storeMat('ceil'); }
  else if(kind==='school'){ const w=pickOf([['#efe7cf','#c8b58d'],['#e9eef0','#7f9db5'],['#efe9dd','#8aa58a']],R), chk=R()<.4; L.HC=Math.max(2.6,Math.min(3.6,H-.4));                  // the ground floor of a two-storey school
    L.wallM=imat('block','#ffffff',w[0],w[1]); L.floorM=imat('vct','#ffffff',chk?'chk':'spk',0,.18); L.ceilM=storeMat('ceil');
    if(r.gym){ L.trof=false; L.HC=Math.max(6,Math.min(9.5,H-.9)); L.floorM=imat('planks','#e0b070',0,0,.2); L.ceilM=imat('deck','#e4e4e4'); } }   // the gymnasium: a varnished wood floor under a high roof deck
  else if(kind==='office'){ L.HC=3; L.wallM=imat('drywall',pickOf(['#f4f3f0','#e6e8ea','#eee9df'],R)); L.floorM=imat('ctile',pickOf(['#9aa0a6','#7b8794','#a39d92','#6a6e73'],R),0,0,.18); L.ceilM=storeMat('ceil'); }
  else if(kind==='industrial'){ L.HC=Math.max(3.4,Math.min(5,H-.6)); L.wallM=imat('metal',pickOf(['#cfd3d6','#d8d0bf','#b9c3cc'],R)); L.floorM=imat('concrete','#d4d4d0',0,0,.18); L.ceilM=imat('deck','#dcdcdc'); }
  else { const f=pickOf([['vct','#ffffff','chk'],['vct','#efe4cc','spk'],['concrete','#d0d0cc'],['planks','#dcc7a6']],R); L.HC=Math.max(2.6,Math.min(3.3,H-.4));   // shop
    L.wallM=imat('drywall',pickOf(['#f3f1ec','#e3e5e6','#ece2cf','#dbe6ef'],R)); L.floorM=f[0]==='vct'?imat('vct',f[1],f[2],0,.18):imat(f[0],f[1],0,0,.18); L.ceilM=storeMat('ceil'); }
  return L; }
/* the gymnasium (owner 2026-11-23, two photos of Traughber's gym): tan block walls with a dark stripe under white upper walls with
   tall black acoustic panels, tall narrow windows high up, a black wall pad, banners, a flag, folded bleachers along a wall, a
   scoreboard, a maple floor with the court lines, hoops, and white steel roof trusses with round high-bay lights hung from them */
function gymDecor(g,p,HC,r,TH2){
  const o=TH2+.014, tan=[], stripe=[], panel=[], pad=[], win=[], ban=[], gold=[], dfr=[], dgl=[];
  const gaps=i=>(r.doors||[]).filter(d=>d.ei===i).map(d=>[d.s0-.15,d.s1+.15]).sort((a,b)=>a[0]-b[0]);
  let best=0, bi=0, minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9, cx=0, cy=0;
  for(const q of p){ minx=Math.min(minx,q[0]); maxx=Math.max(maxx,q[0]); miny=Math.min(miny,q[1]); maxy=Math.max(maxy,q[1]); cx+=q[0]; cy+=q[1]; } cx/=p.length; cy/=p.length;
  for(let i=0;i<p.length;i++){ const a=p[i], b=p[(i+1)%p.length], L=Math.hypot(b[0]-a[0],b[1]-a[1]); if(L>best){ best=L; bi=i; } }
  const PH=Math.min(HC-1.2,7.6);
  for(let i=0;i<p.length;i++){ const a=p[i], b=p[(i+1)%p.length], L=Math.hypot(b[0]-a[0],b[1]-a[1]); if(L<3) continue;
    const ux=(b[0]-a[0])/L, uy=(b[1]-a[1])/L, nx=uy, ny=-ux, at=(t,off)=>[a[0]+ux*t-nx*off,a[1]+uy*t-ny*off];
    const spans=[]; { let t=.2; for(const [g0,g1] of gaps(i)){ if(g0>t) spans.push([t,g0]); t=Math.max(t,g1); } if(L-.2>t) spans.push([t,L-.2]); }
    for(const [t0,t1] of spans){ quad(tan,at(t0,o),at(t1,o),0,2.9); quad(stripe,at(t0,o),at(t1,o),2.9,3.25); }
    const free=(s0,s1)=>(r.doors||[]).every(d=>d.ei!==i||s1<d.s0-.3||s0>d.s1+.3);
    for(let s=2.4,k=0;s+1.3<L-1;s+=4.2,k++){ if(!free(s,s+1.3)) continue; quad(panel,at(s,o+.004),at(s+1.3,o+.004),3.5,PH);                        // the tall black panels
      if(k%2===0&&s+3.4<L-1&&free(s+2.1,s+3.3)) quad(win,at(s+2.1,o+.004),at(s+3.3,o+.004),4.2,PH-.2); }                                       // a tall window between a pair of them
    if(i===bi||i===(bi+2)%p.length) for(const f of [.28,.72]){ const s=L*f-1; if(!free(s-.3,s+2.3)) continue;                                      // the pair of red-framed glass doors, on both long sides (as in the photo)
      for(const k of [0,1]){ const a0=s+k*1.05; quad(dfr,at(a0,o+.016),at(a0+.95,o+.016),0,2.15); quad(dgl,at(a0+.09,o+.024),at(a0+.86,o+.024),.1,2.05); quad(dfr,at(a0+.09,o+.03),at(a0+.86,o+.03),1.05,1.14); } }
    if(i===bi){ const m=L/2; quad(pad,at(m-6,o+.004),at(m+6,o+.004),.15,2.7); }                                                                  // the black wall pad
    if(i===(bi+2)%p.length||i===bi) for(let s=3;s+.9<L-2;s+=1.7) if(free(s,s+.9)){ quad(ban,at(s,o+.006),at(s+.9,o+.006),3.5,4.6); quad(gold,at(s+.2,o+.008),at(s+.7,o+.008),3.85,4.3); }   // black and gold banners
  }
  const mk=(arr,col,emi)=>{ if(arr.length){ const m=rmat('gym'+col,col,emi||0x000000); (GYMM.list=GYMM.list||[]).includes(m)||GYMM.list.push(m); g.add(meshOf(arr,m)); } };
  mk(tan,0xc9a468,0x4a3c20); mk(stripe,0x1d2026,0x08090b); mk(panel,0x14161a,0x040405); mk(pad,0x111317,0x030304);
  if(win.length){ const m=new THREE.MeshBasicMaterial({color:0xc9def0,side:THREE.DoubleSide}); g.add(meshOf(win,m)); }                              // daylight in the windows
  mk(dfr,0x8a2020,0x2a0808); mk(dgl,0x27383d,0x0c1316);
  mk(ban,0x15171b,0x050506); mk(gold,0xd7b24a,0x4a3c10);
  // the floor: court lines on the maple, along the room's long side
  const W=maxx-minx, Hh=maxy-miny, a0=p[bi], a1=p[(bi+1)%p.length], ang=Math.atan2(a1[1]-a0[1],a1[0]-a0[0]), CL=Math.min(28,best-4), CW=Math.min(15,(Math.min(W,Hh)>0?Math.min(W,Hh):15)-3);
  { const c=document.createElement('canvas'); c.width=1024; c.height=Math.round(1024*CW/CL); const x=c.getContext('2d'), sx=c.width/CL, sy=c.height/CW;
    x.strokeStyle='#1d1a16'; x.fillStyle='rgba(0,0,0,0)'; x.lineWidth=5; x.strokeRect(4,4,c.width-8,c.height-8);
    x.beginPath(); x.moveTo(c.width/2,0); x.lineTo(c.width/2,c.height); x.stroke();
    x.beginPath(); x.arc(c.width/2,c.height/2,1.8*sx,0,7); x.stroke();
    for(const e of [0,1]){ const X=e?c.width:0, d=e?-1:1; x.strokeRect(e?X-5.8*sx:X,c.height/2-2.45*sy,5.8*sx,4.9*sy);
      x.beginPath(); x.arc(X+d*5.8*sx,c.height/2,1.8*sx,e?Math.PI/2:-Math.PI/2,e?Math.PI*1.5:Math.PI/2); x.stroke();
      x.beginPath(); x.arc(X+d*1.6*sx,c.height/2,6.0*sx,e?Math.PI*.64:-Math.PI*.36,e?Math.PI*1.36:Math.PI*.36); x.stroke(); }
    const t=new THREE.CanvasTexture(c); t.anisotropy=8;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(CL,CW),new THREE.MeshBasicMaterial({map:t,transparent:true,opacity:.75,depthWrite:false}));
    m.rotation.x=-Math.PI/2; m.rotation.z=ang; m.position.set(cx,.016,-cy); m.renderOrder=2; g.add(m); }
  // folded bleachers along one long wall, a scoreboard high on a short wall, hoops at each end
  { const i=(bi+2)%p.length, a=p[i], b=p[(i+1)%p.length], L=Math.hypot(b[0]-a[0],b[1]-a[1]), ux=(b[0]-a[0])/L, uy=(b[1]-a[1])/L, nx=uy, ny=-ux;
    const mx=a[0]+ux*L/2-nx*(TH2+.9), my=a[1]+uy*L/2-ny*(TH2+.9), bl=Math.min(L*.7,40);
    const bl3=new THREE.Mesh(new THREE.BoxGeometry(bl,3.2,1.5),rmat('bleach',0x1c2433,0x0a0e16)); bl3.position.set(mx,1.6,-my); bl3.rotation.y=Math.atan2(uy,ux); g.add(bl3);
    for(const y of [.8,1.6,2.4]){ const rl=new THREE.Mesh(new THREE.BoxGeometry(bl,.05,.04),rmat('rail',0x2d5fd0,0x102050)); rl.position.set(mx+nx*.77,y,-(my+ny*.77)); rl.rotation.y=bl3.rotation.y; g.add(rl); } }
  { const sh=(bi+1)%p.length, a=p[sh], b=p[(sh+1)%p.length], L=Math.hypot(b[0]-a[0],b[1]-a[1]), ux=(b[0]-a[0])/L, uy=(b[1]-a[1])/L, nx=uy, ny=-ux;
    const c=document.createElement('canvas'); c.width=256; c.height=96; const x=c.getContext('2d'); x.fillStyle='#0c0d10'; x.fillRect(0,0,256,96); x.fillStyle='#e8a43a'; x.font='bold 30px monospace'; x.fillText('GUEST   HOME',22,36); x.font='bold 36px monospace'; x.fillText(' 00  P1  00',22,80);
    const m=new THREE.Mesh(new THREE.PlaneGeometry(2.6,1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c)})); const q=[a[0]+ux*L/2-nx*(TH2+.03),a[1]+uy*L/2-ny*(TH2+.03)];
    m.position.set(q[0],Math.min(HC-2.2,6.2),-q[1]); m.lookAt(cx,m.position.y,-cy); g.add(m); }
  // the hoops hang up under the trusses on cables; a wall switch lowers them slowly (owner 2026-11-24), another raises them again
  { const list=[], up=Math.max(1.5,HC-1.6-3.6), o0=HOOPO[r.key]||0;
    for(const e of [-1,1]){ const hx=cx+Math.cos(ang)*e*(CL/2-1.2), hy=cy+Math.sin(ang)*e*(CL/2-1.2), H=new THREE.Group(); H.position.set(hx,0,-hy); H.rotation.y=-ang; g.add(H);
      const bb=new THREE.Mesh(new THREE.BoxGeometry(.06,1.05,1.8),rmat('board',0xf0f0f0,0x303030)); bb.position.set(0,3.6,0); H.add(bb);
      const sq=new THREE.Mesh(new THREE.BoxGeometry(.065,.36,.6),rmat('boardsq',0xd9d9d9,0x202020)); sq.position.set(0,3.35,0); H.add(sq);
      const rim=new THREE.Mesh(new THREE.TorusGeometry(.23,.015,6,20),rmat('rim',0xe8571a,0x401808)); rim.rotation.x=Math.PI/2; rim.position.set(-.45*e,3.05,0); H.add(rim);
      const net=new THREE.Mesh(new THREE.CylinderGeometry(.23,.13,.4,12,1,true),new THREE.MeshBasicMaterial({color:0xf4f4f4,wireframe:true})); net.position.set(-.45*e,2.85,0); H.add(net);
      const arm=new THREE.Mesh(new THREE.BoxGeometry(.5,.05,.05),rmat('harm',0x2a2c30,0x08080a)); arm.position.set(-.25*e,3.05,0); H.add(arm);
      const cabs=[-.7,.7].map(z=>{ const c=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,1,6),rmat('hcab',0x1b1c1f,0x050506)); c.position.set(0,0,z); H.add(c); return c; });
      list.push({H,cabs}); }
    ROOM.hoops={list,up,top:HC-1.4,o:o0,t:o0}; hoopPose(); }
  // the roof: white steel trusses across the short way every 6 m, with round high-bay lights hung under them
  { const sp=Math.min(W,Hh)<best?Math.min(W,Hh):W, ux=Math.cos(ang), uy=Math.sin(ang), vx=-uy, vy=ux, nT=Math.max(2,Math.floor(best/6)), span=Math.max(10,Math.min(Math.hypot(maxx-minx,maxy-miny),sp)), yb=HC-1.4, yt=HC-.2, seg=Math.max(4,Math.round(span/2.4));
    const trussM=rmat('truss',0xeeeeea,0x2a2a28), boxG=new THREE.BoxGeometry(1,.09,.09), dm=new THREE.Object3D();
    const chords=new THREE.InstancedMesh(boxG,trussM,nT*2), diags=new THREE.InstancedMesh(boxG,trussM,nT*seg);
    let ci=0, di=0; const bulbs=[];
    for(let k=0;k<nT;k++){ const t=-best/2+(k+.5)*best/nT, px=cx+ux*t, py=cy+uy*t;                                                           // this truss's middle
      for(const y of [yb,yt]){ dm.position.set(px,y,-py); dm.rotation.set(0,Math.atan2(vy,vx),0); dm.scale.set(span,1,1); dm.updateMatrix(); chords.setMatrixAt(ci++,dm.matrix); }
      for(let j=0;j<seg;j++){ const s0=-span/2+j*span/seg, s1=s0+span/seg, up=j%2===0, ya=up?yb:yt, yc=up?yt:yb, ex=px+vx*(s0+s1)/2, ey=py+vy*(s0+s1)/2, L2=Math.hypot(span/seg,yc-ya);
        dm.position.set(ex,(ya+yc)/2,-ey); dm.rotation.set(0,Math.atan2(vy,vx),0); dm.rotateZ(Math.atan2(yc-ya,span/seg)); dm.scale.set(L2,1,1); dm.updateMatrix(); diags.setMatrixAt(di++,dm.matrix);
        if(j%2===1) bulbs.push([ex,ey]); } }
    chords.count=ci; diags.count=di; chords.instanceMatrix.needsUpdate=diags.instanceMatrix.needsUpdate=true; chords.frustumCulled=diags.frustumCulled=false; g.add(chords); g.add(diags);
    // round UFO high-bay lights (owner 2026-11-24, product photo): black finned body with a ring, hook up to the truss, white lens under it, a soft glow
    const lm=new THREE.MeshBasicMaterial({color:0xffffff,map:lensTex(),side:THREE.DoubleSide}), n=Math.max(1,bulbs.length), dark=rmat('ufo',0x16181b,0x050506);
    const body=new THREE.InstancedMesh(ufoBody(),dark,n), hook=new THREE.InstancedMesh(ufoHook(),rmat('ufohook',0xb8bcc2,0x30323a),n),
      lens=new THREE.InstancedMesh(new THREE.CircleGeometry(.31,28),lm,n), knob=new THREE.InstancedMesh(new THREE.CylinderGeometry(.07,.075,.07,16),lm,n),
      halo=new THREE.InstancedMesh(new THREE.CircleGeometry(1.5,20),new THREE.MeshBasicMaterial({map:roundGlow(),transparent:true,opacity:.5,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false}),n);
    bulbs.forEach(([bx,by],i)=>{ const y=yb-.7;
      dm.rotation.set(0,(i*1.7)%6.28,0); dm.scale.set(1,1,1); dm.position.set(bx,y,-by); dm.updateMatrix(); body.setMatrixAt(i,dm.matrix); hook.setMatrixAt(i,dm.matrix);
      dm.rotation.set(Math.PI/2,0,0); dm.position.set(bx,y+.025,-by); dm.updateMatrix(); lens.setMatrixAt(i,dm.matrix);
      dm.rotation.set(0,0,0); dm.position.set(bx,y-.01,-by); dm.updateMatrix(); knob.setMatrixAt(i,dm.matrix);
      dm.rotation.set(Math.PI/2,0,0); dm.position.set(bx,y-.15,-by); dm.updateMatrix(); halo.setMatrixAt(i,dm.matrix); });
    for(const o of [body,hook,lens,knob,halo]){ o.instanceMatrix.needsUpdate=true; o.frustumCulled=false; g.add(o); } halo.renderOrder=1;
    ROOM.glow=[[halo]];
    ROOM.tro=[lm]; }
}
function buildRoom(r){
  if(ROOM.key===r.key&&ROOM.g) return; dropRoom();
  const SH=window.STORES&&STORES.own?STORES.own(r):null;      // a Meijer (js/enh/stores.js): high dropped ceiling, troffer lights
  itexTrim(); const LK=roomLook(r,SH);                           // floor, wall and ceiling textures for this kind of building, picked from its key
  const g=new THREE.Group(), p=r.p, HC=LK.HC, DH=2.12, TH2=.2;
  const wallM=LK.wallM, ceilM=LK.ceilM, trimM=rmat('trim',0xfbfaf7,0x3a3a3a), floorM=LK.floorM;
  // floor and ceiling from the outline
  const sh=new THREE.Shape(p.map(q=>new THREE.Vector2(q[0],q[1])));
  const fl=new THREE.Mesh(new THREE.ShapeGeometry(sh),floorM); fl.rotation.x=-Math.PI/2; fl.position.y=.01; g.add(fl);   // shape (x, y=north) -> (x, z=-north)
  const ce=new THREE.Mesh(new THREE.ShapeGeometry(sh),ceilM); ce.rotation.x=-Math.PI/2; ce.position.y=HC; g.add(ce);
  // walls along the outline, with the doorways (and garage openings) cut out; jambs give them depth
  const wall=[], wuv=[], trim=[], wq=(a,b,y0,y1,u0,u1)=>{ quad(wall,a,b,y0,y1); wuv.push(u0,y0,u1,y0,u1,y1,u0,y0,u1,y1,u0,y1); }, ways=r.doors.map(d=>({d,h:DH,gar:false})).concat((r.garages||[]).map(d=>({d,h:2.2,gar:true})));
  for(let i=0;i<p.length;i++){ const a=p[i], b=p[(i+1)%p.length], L=Math.hypot(b[0]-a[0],b[1]-a[1]); if(L<.05) continue;
    const ux=(b[0]-a[0])/L, uy=(b[1]-a[1])/L, nx=uy, ny=-ux, at=(t,o)=>[a[0]+ux*t-nx*o,a[1]+uy*t-ny*o];
    const gaps=ways.filter(w=>w.d.ei===i).map(w=>({s0:w.d.s0,s1:w.d.s1,h:w.h})).sort((x,y)=>x.s0-y.s0);
    const E=TH2+.03;                                                 // walls run on past the corners, so inside corners close up
    const WN=(LK.kind==='store'?[]:(r.win||[]).filter(w=>w.ei===i&&w.b<HC-.4)).map(w=>({s0:w.s0,s1:w.s1,b:Math.max(.05,w.b),h:Math.min(w.h,HC-.12)})).sort((x,y)=>x.s0-y.s0);
    // a stretch of wall with the window openings cut out of it (the map building is hidden while you're in, so you see the outside through them)
    const solid=(a0,a1)=>{ let c=a0; for(const w of WN){ if(w.s0<c-.001||w.s1>a1+.001) continue;
        wq(at(c,TH2),at(w.s0,TH2),0,HC,c,w.s0); wq(at(w.s0,TH2),at(w.s1,TH2),0,w.b,w.s0,w.s1); wq(at(w.s0,TH2),at(w.s1,TH2),w.h,HC,w.s0,w.s1);
        wq(at(w.s0,0),at(w.s0,TH2),w.b,w.h,0,TH2); wq(at(w.s1,0),at(w.s1,TH2),w.b,w.h,0,TH2);   // reveals
        for(const [u0,u1,y0,y1] of [[w.s0-.07,w.s0,w.b-.07,w.h+.07],[w.s1,w.s1+.07,w.b-.07,w.h+.07],[w.s0-.07,w.s1+.07,w.h,w.h+.07],[w.s0-.1,w.s1+.1,w.b-.07,w.b]]) quad(trim,at(u0,TH2+.012),at(u1,TH2+.012),y0,y1);   // casing and sill
        c=w.s1; }
      if(a1>c+.001) wq(at(c,TH2),at(a1,TH2),0,HC,c,a1); };
    let t=-E; for(const q of gaps){ if(q.s0>t) solid(t,q.s0); wq(at(q.s0,TH2),at(q.s1,TH2),q.h,HC,q.s0,q.s1);   // wall up to the gap, header over it
      wq(at(q.s0,0),at(q.s0,TH2),0,q.h,0,TH2); wq(at(q.s1,0),at(q.s1,TH2),0,q.h,0,TH2);                                   // jambs
      { const P=at(q.s0,0), Q=at(q.s1,0), R2=at(q.s1,TH2), S2=at(q.s0,TH2); const [px,pz]=to3(...P),[qx,qz]=to3(...Q),[rx,rz]=to3(...R2),[sx,sz]=to3(...S2);
        wall.push(px,q.h,pz, qx,q.h,qz, rx,q.h,rz, px,q.h,pz, rx,q.h,rz, sx,q.h,sz); wuv.push(0,0,0,0,0,0,0,0,0,0,0,0); }                                    // underside of the header
      for(const [s0,s1] of [[q.s0-.1,q.s0],[q.s1,q.s1+.1]]) quad(trim,at(s0,TH2+.01),at(s1,TH2+.01),0,q.h+.1);                // casing round the opening
      quad(trim,at(q.s0-.1,TH2+.01),at(q.s1+.1,TH2+.01),q.h,q.h+.1);
      t=Math.max(t,q.s1); }
    if(L+E>t) solid(t,L+E);
    quad(trim,at(0,TH2+.005),at(L,TH2+.005),0,.09);                 // skirting board
  }
  g.add(meshOf(wall,wallM,wuv)); g.add(meshOf(trim,trimM));
  if(r.gym) safe('gym',()=>gymDecor(g,p,HC,r,TH2));
  LKEY=r.key; { const sv=LSWS[r.key]; LSW[0]=sv?sv[0]:true; LSW[1]=sv?sv[1]:true; }     // each building keeps its own switch positions
  ROOM.dimM=[wallM,floorM,ceilM]; ROOM.gm=r.gym&&GYMM.list?GYMM.list.concat([rmat('truss',0xeeeeea,0x2a2a28)]):null;
  if(LK.trof){ troffers(g,p,HC); switches(g,r,HC,2); if(SH) greeterFig(g,r,SH); }
  else { let cx=0,cy=0; for(const q of p){ cx+=q[0]; cy+=q[1]; } cx/=p.length; cy/=p.length;       // a ceiling light in the middle of the room
    if(inP(p,cx,cy)&&!r.gym){ const [x3,z3]=to3(cx,cy);
      const base=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.03,24),trimM); base.position.set(x3,HC-.015,z3); g.add(base);
      const globe=new THREE.Mesh(new THREE.SphereGeometry(.17,20,10,0,Math.PI*2,Math.PI/2,Math.PI/2),new THREE.MeshBasicMaterial({color:0xfff6df,side:THREE.DoubleSide}));
      globe.position.set(x3,HC-.03,z3); g.add(globe); ROOM.tro=[globe.material]; }          // one light, one switch by the door
    switches(g,r,HC,1);
    if(r.gym&&ROOM.hoops&&ROOM.sw&&ROOM.sw[0]){ const lv=ROOM.sw[0].lv, th=lv.rotation.y, ax=Math.cos(th), az=-Math.sin(th);             // a second, blue-levered plate beside the light switch: the hoop winch
      const pl=new THREE.Mesh(new THREE.BoxGeometry(.1,.13,.012),rmat('swplate',0xf6f5f1,0x55544f)); pl.position.set(lv.position.x+ax*.22,1.2,lv.position.z+az*.22); pl.rotation.y=th; g.add(pl);
      const hl=new THREE.Mesh(new THREE.BoxGeometry(.022,.045,.02),rmat('swlever2',0x3a7bd5,0x1a3a6a)); hl.position.set(pl.position.x+ax*.013*0,1.2,pl.position.z); hl.position.x+=Math.sin(th)*.013; hl.position.z+=Math.cos(th)*.013; hl.rotation.y=th; g.add(hl);
      const q0=ROOM.sw[0].pos; ROOM.hs=[q0[0]+ax*.22,q0[1]-az*.22]; } }
  // door leaves, hinged at the jamb; double doors on the wide glass entrances
  ROOM.leaves=[];
  const SEE=()=>STX.see||(STX.see=new THREE.MeshLambertMaterial({color:0x9db4c6,transparent:true,opacity:.22,depthWrite:false,side:THREE.DoubleSide}));   // clear glass
  const AUTO=!!r.store;                                              // store entrances are automatic: no knobs, they open by themselves
  for(const d of r.doors){ const W0=d.s1-d.s0, two=W0>1.5, lw=two?(W0-.06)/2:W0-.04, glass=two||AUTO;
    const leafM=glass?rmat('glassdoor',0x2f3e4e,0x0a1420):rmat('door',0x7a5236,0x1a120c);
    const L=Math.hypot(d.x1-d.x0,d.y1-d.y0)||1, ux=(d.x1-d.x0)/L, uy=(d.y1-d.y0)/L;
    for(const side of two?[0,1]:[0]){
      const hx=side?d.x1-ux*.02:d.x0+ux*.02, hy=side?d.y1-uy*.02:d.y0+uy*.02;    // hinge point on the jamb
      const cdx=side?-ux:ux, cdy=side?-uy:uy;                        // closed: along the wall, from the hinge
      const pv=new THREE.Group(); const [hx3,hz3]=to3(hx-d.nx*.06,hy-d.ny*.06); pv.position.set(hx3,0,hz3);
      const leaf=new THREE.Mesh(new THREE.BoxGeometry(lw,2.04,.045),AUTO?rmat('alu',0xdfe2e4,0x282a2c):leafM); leaf.position.set(lw/2,1.03,0); pv.add(leaf);
      if(AUTO){ const gl=new THREE.Mesh(new THREE.BoxGeometry(lw-.16,1.5,.05),SEE()); gl.position.set(lw/2,1.3,0); pv.add(gl);   // a white aluminium door round dark glass...
        for(const [y,h,w] of [[.85,.07,lw-.16],[.2,.14,lw-.1]]){ const bar=new THREE.Mesh(new THREE.BoxGeometry(w,h,.07),rmat('blackbar',0x16181b,0x050505)); bar.position.set(lw/2,y,0); pv.add(bar); }
        const st=new THREE.Mesh(new THREE.BoxGeometry(.18,.18,.056),new THREE.MeshBasicMaterial({color:0xf1d21c})); st.position.set(lw/2,1.3,0); pv.add(st); }   // ...with the photo's two black bars
      else { const kn=new THREE.Mesh(new THREE.SphereGeometry(.03,8,6),rmat('knob',0xc9a14a,0x30240c)); kn.position.set(lw-.08,1.0,.04); pv.add(kn);
        const kn2=kn.clone(); kn2.position.z=-.04; pv.add(kn2); }
      const angC=Math.atan2(-to3(cdx,cdy)[1],cdx), angO=Math.atan2(-to3(-d.nx,-d.ny)[1],-d.nx);   // rotation.y for a leaf pointing along / in
      let dA=angO-angC; dA=((dA+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
      pv.rotation.y=angC; g.add(pv); ROOM.leaves.push({pv,angC,dA,d,o:0,auto:AUTO}); } }
  // lit EXIT signs on the inside, over every way out (owner 2026-11-23). Unlit-material boxes: they are not part of ROOM.tro /
  // ROOM.dimM, so the light switches never touch them — always on, like the real ones on their own circuit.
  for(const d of r.doors){ const a=p[d.ei], b=p[(d.ei+1)%p.length], L=Math.hypot(b[0]-a[0],b[1]-a[1])||1, ux=(b[0]-a[0])/L, uy=(b[1]-a[1])/L, nx=uy, ny=-ux, t=(d.s0+d.s1)/2;
    const [x3,z3]=to3(a[0]+ux*t-nx*(TH2+.026),a[1]+uy*t-ny*(TH2+.026)), [dx3,dz3]=to3(-nx,-ny), y3=Math.min(DH+.3,HC-.13), ry=Math.atan2(dx3,dz3);   // facing into the room
    const sg=new THREE.Mesh(new THREE.BoxGeometry(.36,.16,.05),exitMats()); sg.position.set(x3,y3,z3); sg.rotation.y=ry; g.add(sg);
    const gl=new THREE.Mesh(new THREE.PlaneGeometry(.95,.6),exitGlow()); gl.position.set(x3+dx3*.04,y3,z3+dz3*.04); gl.rotation.y=ry; gl.renderOrder=4; g.add(gl); }
  // the garage door: a panel across the opening that rolls up with the opener
  ROOM.gar=[];
  for(const q of r.garages||[]){ const [ax,az]=to3(q.x0-q.nx*.08,q.y0-q.ny*.08), [bx,bz]=to3(q.x1-q.nx*.08,q.y1-q.ny*.08), W0=Math.hypot(bx-ax,bz-az);
    const m=new THREE.Mesh(new THREE.BoxGeometry(W0,1,.05),rmat('gar'+q.col,new THREE.Color(q.col||'#e5dfd3').getHex(),0x202020));
    m.position.set((ax+bx)/2,0,(az+bz)/2); m.rotation.y=-Math.atan2(bz-az,bx-ax); g.add(m); ROOM.gar.push({m,q}); }
  for(const o of g.children) o.traverse(c=>{ if(c.isMesh){ if(!c.renderOrder) c.renderOrder=1; c.frustumCulled=false; } });
  scene.add(g); ROOM.g=g; ROOM.key=r.key; ROOM.r=r; garUpdate(); }
/* exit signs: a white-faced box with red EXIT letters and a faint red halo, drawn unlit so it glows in a dark room too */
let EXM=null, EXG=null;
function exitMats(){ if(EXM) return EXM;
  const c=document.createElement('canvas'); c.width=256; c.height=112; const x=c.getContext('2d');
  x.fillStyle='#f6f3ee'; x.fillRect(0,0,256,112); x.strokeStyle='#8f1d1d'; x.lineWidth=5; x.strokeRect(4,4,248,104);
  x.fillStyle='#e0141b'; x.font='bold 84px Arial, Helvetica, sans-serif'; x.textAlign='center'; x.textBaseline='middle'; x.fillText('EXIT',128,60);
  const tex=new THREE.CanvasTexture(c); tex.anisotropy=4;
  const side=new THREE.MeshBasicMaterial({color:0xb7b3ab}), face=new THREE.MeshBasicMaterial({map:tex,toneMapped:false});
  EXM=[side,side,side,side,face,side]; return EXM; }
function exitGlow(){ if(EXG) return EXG;
  const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'), gr=x.createRadialGradient(32,32,2,32,32,32);
  gr.addColorStop(0,'rgba(255,40,40,.55)'); gr.addColorStop(.45,'rgba(255,30,30,.18)'); gr.addColorStop(1,'rgba(255,0,0,0)'); x.fillStyle=gr; x.fillRect(0,0,64,64);
  EXG=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide}); return EXG; }
/* store ceilings and lights (owner 2026-11-23, a photo of the lights inside Meijer): 2 x 2 ft speckled ceiling tiles in a
   white grid, and 2 x 4 ft parabolic-louvre troffers — a grid of deep shiny cells, bright where they catch the tubes and
   blue-grey in their shadows — in rows across the store */
const STX={};
function storeMat(k){ if(STX[k]) return STX[k]; const c=document.createElement('canvas'), x=c.getContext('2d');
  if(k==='ceil'){ c.width=c.height=256; x.fillStyle='#e9e7e1'; x.fillRect(0,0,256,256);                    // 2 tiles x 2 tiles = 1.22 m
    for(let i=0;i<900;i++){ x.fillStyle=Math.random()<.5?'rgba(150,145,135,.35)':'rgba(255,255,255,.7)'; x.fillRect(Math.random()*256,Math.random()*256,1.4,1.4); }
    x.fillStyle='#f7f6f2'; for(const v of [0,128]){ x.fillRect(v,0,5,256); x.fillRect(0,v,256,5); } x.fillStyle='rgba(0,0,0,.12)'; for(const v of [5,133]){ x.fillRect(v,0,1,256); x.fillRect(0,v,256,1); } }
  else { c.width=c.height=256; x.fillStyle='#e4e1d8'; x.fillRect(0,0,256,256);                              // 12 in vinyl tile, 2 x 2
    for(let i=0;i<4;i++){ const X=(i%2)*128, Y=(i>>1)*128; x.fillStyle=i===1||i===2?'#ddd9cf':'#e8e5dd'; x.fillRect(X,Y,128,128);
      for(let j=0;j<160;j++){ x.fillStyle='rgba(120,112,100,.18)'; x.fillRect(X+Math.random()*128,Y+Math.random()*128,2,1); } }
    x.fillStyle='rgba(0,0,0,.1)'; for(const v of [0,128]){ x.fillRect(v,0,1,256); x.fillRect(0,v,256,1); } }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1/1.22,1/1.22); t.anisotropy=8;
  STX[k]=new THREE.MeshLambertMaterial({map:t,emissive:k==='ceil'?0x9a9890:0x55524c,emissiveMap:t,side:THREE.DoubleSide}); return STX[k]; }
function trofferTex(){ if(STX.trof) return STX.trof;
  /* drawn after the owner's photo of a Meijer fixture: 3 columns x 10 rows of parabolic cells in a light metal trim, every
     cell the same bright white */
  const W=512, H=1024, c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
    x.fillStyle='#c9ccce'; x.fillRect(0,0,W,H);                                                   // trim
  x.fillStyle='#262a30'; x.fillRect(14,14,W-28,H-28);                                         // the gap inside the trim
  const m=22, cols=3, rows=10, cw=(W-2*m)/cols, ch=(H-2*m)/rows;
  // each cell like the photo's: a curved mirror, pillow-shaped — bright white where it faces the tubes, a soft grey
  // shadow sweeping into its lower corner, a faint crease down the middle where the two curved halves meet, and a
  // bending highlight across it. Every cell drawn the same and in neutral white/grey (owner: "all the same white").
  const cell=document.createElement('canvas'), CW=Math.round(cw), CH=Math.round(ch); cell.width=CW; cell.height=CH; const y=cell.getContext('2d');
  y.fillStyle='#d9dbdf'; y.fillRect(0,0,CW,CH);                                              // the metal, in its own light
  let g=y.createLinearGradient(0,0,CW,CH); g.addColorStop(0,'rgba(255,255,255,.55)'); g.addColorStop(.6,'rgba(160,164,172,.25)'); g.addColorStop(1,'rgba(95,100,110,.7)');
  y.fillStyle=g; y.fillRect(0,0,CW,CH);                                                       // lit on one side, shadowed into the far corner
  // the rippled reflections: bright white bands bending across the cell, grey between them
  y.filter='blur(5px)';
  const band=(y0,a,w,al)=>{ y.strokeStyle='rgba(255,255,255,'+al+')'; y.lineWidth=w; y.beginPath();
    for(let k=0;k<=24;k++){ const t=k/24, xx=-CW*.05+CW*1.1*t, yy=y0-Math.sin(t*Math.PI*1.3+.3)*a+t*CH*.12; k?y.lineTo(xx,yy):y.moveTo(xx,yy); } y.stroke(); };
  band(CH*.38,CH*.22,CH*.26,1); band(CH*.82,CH*.16,CH*.16,.9); band(CH*.1,CH*.1,CH*.1,.7);
  y.strokeStyle='rgba(110,116,126,.55)'; y.lineWidth=CH*.08; y.beginPath();                  // the grey trough between the two big bands
  for(let k=0;k<=24;k++){ const t=k/24, xx=-CW*.05+CW*1.1*t, yy=CH*.62-Math.sin(t*Math.PI*1.3+.3)*CH*.18+t*CH*.12; k?y.lineTo(xx,yy):y.moveTo(xx,yy); } y.stroke();
  y.filter='blur(2px)'; y.strokeStyle='rgba(120,126,136,.5)'; y.lineWidth=2.5;                // the crease down the middle, where the two curved halves meet
  y.beginPath(); y.moveTo(CW*.5,0); y.quadraticCurveTo(CW*.46,CH*.5,CW*.52,CH); y.stroke(); y.filter='none';
  g=y.createLinearGradient(0,0,0,CH); g.addColorStop(0,'rgba(90,95,104,.5)'); g.addColorStop(.1,'rgba(90,95,104,0)'); g.addColorStop(.92,'rgba(90,95,104,0)'); g.addColorStop(1,'rgba(90,95,104,.45)');
  y.fillStyle=g; y.fillRect(0,0,CW,CH);                                                       // the blades' shade top and bottom
  for(let i=0;i<cols;i++) for(let j=0;j<rows;j++) x.drawImage(cell,m+i*cw,m+j*ch,cw,ch);
  // the blades between the cells: thin bright edges catching the light, with a dark line under each
  for(let j=0;j<=rows;j++){ const y=m+j*ch; x.fillStyle='rgba(120,122,126,.8)'; x.fillRect(m,y-1.5,W-2*m,3); }
  for(let i=0;i<=cols;i++){ const X=m+i*cw; x.fillStyle='rgba(120,122,126,.8)'; x.fillRect(X-1.5,m,3,H-2*m); }
  const t=new THREE.CanvasTexture(c); t.anisotropy=8; STX.trof=t; return t; }
// a soft glow round a fixture (brightness bleeding onto the ceiling) and its reflection on the shiny floor
// one UFO high-bay light, like the product photo: a black ring, 28 curved cooling fins stepping up to a round housing with a SET UP cap, a silver hook ring on top
let UFOB=null, UFOH=null, LENST=null;
function mergeGeo(parts){ const pos=[], nor=[]; for(const [geo,m] of parts){ const gg=geo.index?geo.toNonIndexed():geo; gg.applyMatrix4(m); pos.push(...gg.attributes.position.array); const nm=new THREE.Matrix3().getNormalMatrix(m), nn=gg.attributes.normal.array; for(let i=0;i<nn.length;i+=3){ const v=new THREE.Vector3(nn[i],nn[i+1],nn[i+2]).applyMatrix3(nm).normalize(); nor.push(v.x,v.y,v.z); } }
  const G=new THREE.BufferGeometry(); G.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); G.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3)); return G; }
function ufoBody(){ if(UFOB) return UFOB; const M=new THREE.Matrix4(), parts=[];
  const ring=new THREE.LatheGeometry([[.28,0],[.4,0],[.42,.02],[.42,.075],[.38,.1],[.3,.1],[.28,.06]].map(q=>new THREE.Vector2(q[0],q[1])),32); parts.push([ring,M.clone()]);
  const house=new THREE.LatheGeometry([[0,.1],[.3,.1],[.3,.16],[.2,.2],[.17,.3],[.2,.34],[.2,.4],[.14,.42],[0,.42]].map(q=>new THREE.Vector2(q[0],q[1])),24); parts.push([house,M.clone()]);
  const sh=new THREE.Shape(); sh.moveTo(.4,.09); sh.lineTo(.4,.14); sh.quadraticCurveTo(.4,.26,.3,.3); sh.lineTo(.2,.31); sh.lineTo(.2,.18); sh.lineTo(.3,.1); sh.closePath();
  const fin=new THREE.ExtrudeGeometry(sh,{depth:.04,bevelEnabled:false}); fin.translate(0,0,-.02);
  for(let k=0;k<28;k++){ const m=new THREE.Matrix4().makeRotationY(k/28*Math.PI*2); parts.push([fin,m]); }
  const cap=new THREE.BoxGeometry(.12,.04,.07); parts.push([cap,new THREE.Matrix4().makeTranslation(.12,.43,.06)]);
  return UFOB=mergeGeo(parts); }
function ufoHook(){ if(UFOH) return UFOH; const parts=[], tr=new THREE.TorusGeometry(.055,.014,6,14); parts.push([tr,new THREE.Matrix4().makeTranslation(0,.6,0)]);
  parts.push([new THREE.CylinderGeometry(.03,.035,.1,8),new THREE.Matrix4().makeTranslation(0,.47,0)]); return UFOH=mergeGeo(parts); }
function lensTex(){ if(LENST) return LENST; const c=document.createElement('canvas'); c.width=c.height=128; const x=c.getContext('2d'); x.fillStyle='#dfe3e6'; x.fillRect(0,0,128,128);
  for(let r=60;r>8;r-=6){ x.strokeStyle=r%12?'rgba(255,255,255,.95)':'rgba(170,178,184,.7)'; x.lineWidth=3; x.beginPath(); x.arc(64,64,r,0,7); x.stroke(); }
  x.fillStyle='#f6f6f6'; x.beginPath(); x.arc(64,64,12,0,7); x.fill(); return LENST=new THREE.CanvasTexture(c); }
function roundGlow(){ if(STX.rg) return STX.rg; const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'); const g=x.createRadialGradient(32,32,0,32,32,32); g.addColorStop(0,'rgba(255,255,255,.85)'); g.addColorStop(.3,'rgba(255,255,255,.35)'); g.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=g; x.fillRect(0,0,64,64); return STX.rg=new THREE.CanvasTexture(c); }
function glowTex(k){ if(STX['g'+k]) return STX['g'+k]; const c=document.createElement('canvas'); c.width=128; c.height=256; const x=c.getContext('2d');
  const g=x.createRadialGradient(64,64,0,64,64,64); if(k==='halo'){ g.addColorStop(0,'rgba(255,255,255,.9)'); g.addColorStop(.35,'rgba(255,255,255,.45)'); g.addColorStop(1,'rgba(255,255,255,0)'); }
  else { g.addColorStop(0,'rgba(255,255,255,.85)'); g.addColorStop(.3,'rgba(255,255,255,.35)'); g.addColorStop(1,'rgba(255,255,255,0)'); }
  x.setTransform(1,0,0,2,0,0); x.fillStyle=g; x.fillRect(0,0,128,128); x.setTransform(1,0,0,1,0,0);   // stretched to the fixture's 1:2
  const t=new THREE.CanvasTexture(c); STX['g'+k]=t; return t; }
function troffers(g,p,HC){
  // rows along the building's long side: a 2 x 4 ft fixture every 2.44 m across and 3.66 m along (a common store layout).
  // Two switches (owner 2026-11-23): in a chequerboard pattern, every other light on the first switch and the ones between
  // on the second, so either one alone leaves the store evenly lit. A few (one in sixteen, spread out) are night lights on
  // no switch: they stay on when both switches are off (owner 2026-11-23), like a real store after hours
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const q of p){ x0=Math.min(x0,q[0]); x1=Math.max(x1,q[0]); y0=Math.min(y0,q[1]); y1=Math.max(y1,q[1]); }
  const along=(x1-x0)>=(y1-y0), sx=along?3.66:2.44, sy=along?2.44:3.66, pts=[[],[],[]];
  let xi=0; for(let x=x0+sx/2;x<x1;x+=sx,xi++){ let yi=0; for(let y=y0+sy/2;y<y1;y+=sy,yi++){ if(!inP(p,x,y)) continue; let ok=true;
    for(const [dx,dy] of [[-.8,-.8],[.8,-.8],[.8,.8],[-.8,.8]]) if(!inP(p,x+dx,y+dy)){ ok=false; break; } if(ok) pts[xi%4===1&&yi%4===1?2:(xi+yi)%2].push([x,y]); } }
  ROOM.tro=[]; ROOM.glow=[];
  const geo=new THREE.PlaneGeometry(.61,1.22); geo.rotateX(Math.PI/2); if(along) geo.rotateY(Math.PI/2);   // facing down
  const M=new THREE.Matrix4();
  pts.forEach((P,k)=>{ if(!P.length) return;
    const mat=new THREE.MeshBasicMaterial({map:trofferTex(),side:THREE.DoubleSide,toneMapped:false});
    const lens=new THREE.InstancedMesh(geo,mat,P.length);
    // set into the ceiling (owner 2026-11-23: "make the lights in the ceiling"): flush with the tiles, no box hanging below
    P.forEach(([x,y],i)=>{ const [x3,z3]=to3(x,y); M.makeTranslation(x3,HC-.006,z3); lens.setMatrixAt(i,M); });
    // brightness: a soft glow on the ceiling round each one, and its reflection on the polished floor below
    const hg=new THREE.PlaneGeometry(along?2.1:1.25,along?1.25:2.1); hg.rotateX(Math.PI/2);
    const halo=new THREE.InstancedMesh(hg,new THREE.MeshBasicMaterial({map:glowTex('halo'),transparent:true,opacity:.3,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false}),P.length);
    const fg=new THREE.PlaneGeometry(along?2.2:1.1,along?1.1:2.2); fg.rotateX(-Math.PI/2);
    const spot=new THREE.InstancedMesh(fg,new THREE.MeshBasicMaterial({map:glowTex('floor'),transparent:true,opacity:.32,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),P.length);
    P.forEach(([x,y],i)=>{ const [x3,z3]=to3(x,y); M.makeTranslation(x3,HC-.012,z3); halo.setMatrixAt(i,M); M.makeTranslation(x3,.02,z3); spot.setMatrixAt(i,M); });
    halo.renderOrder=1; spot.renderOrder=2; lens.renderOrder=3; g.add(lens); g.add(halo); g.add(spot); ROOM.tro[k]=mat; (ROOM.glow=ROOM.glow||[])[k]=[halo,spot]; });
}
/* the two light switches: on the wall just inside the way in, at 1.2 m, a white two-gang plate. Walk up to them and a
   button shows (or say "turn off the lights" / "lights on"); each flips its half of the lights (every other one). Remembered while you play. */
const LSW=[true,true], GYMM={list:null};
function switches(g,r,HC,n){ ROOM.sw=[]; const d=r.doors[0]; if(!d){ lightsApply(); return; }
  const p=r.p, a=p[d.ei], b=p[(d.ei+1)%p.length], L=Math.hypot(b[0]-a[0],b[1]-a[1])||1, ux=(b[0]-a[0])/L, uy=(b[1]-a[1])/L, nx=uy, ny=-ux;
  let s=d.s1+.55; if(s+.5>L) s=d.s0-.75;                              // beside the door's latch side, or the other side if it's a corner
  const at=(t,o)=>[a[0]+ux*t-nx*o,a[1]+uy*t-ny*o], ang=Math.atan2(-to3(-nx,-ny)[1],-nx);   // facing into the store
  const plate=new THREE.Mesh(new THREE.BoxGeometry(n===1?.1:.2,.13,.012),rmat('swplate',0xf6f5f1,0x55544f)), [px,pz]=to3(...at(s,.212));
  plate.position.set(px,1.2,pz); plate.rotation.y=ang+Math.PI/2; g.add(plate);
  for(const k of n===1?[0]:[0,1]){ const lv=new THREE.Mesh(new THREE.BoxGeometry(.022,.045,.02),rmat('swlever',0xffffff,0x6a6a66)), off=n===1?0:(k?.045:-.045);
    const [lx,lz]=to3(...at(s+off,.225)); lv.position.set(lx,1.2,lz); lv.rotation.y=ang+Math.PI/2; g.add(lv);
    ROOM.sw.push({lv,k,pos:at(s+off,.6)}); }
  lightsApply(); }
/* the greeter (owner 2026-11-23: "a greeter at the entrance of every Meijer … and every Walmart"): a plain team member in the
   store's colour shirt (no logos) standing just inside the front doors, facing them, who waves when you come in. The welcome
   is spoken by js/enh/stores.js `STORES.greet` when you step inside (⚙️ A/V → Store greeter switches the voice off). */
function greeterFig(g,r,SH){ let d=null, bd=1e9; const me=loc(r,S.lat,S.lng);                    // the door you came in by: the one nearest you as the room is built
  for(const q of r.doors){ const dd=Math.hypot(me[0]-(q.x0+q.x1)/2,me[1]-(q.y0+q.y1)/2); if(dd<bd){ bd=dd; d=q; } }
  if(!d) return;
  const p=r.p, a=p[d.ei], b=p[(d.ei+1)%p.length], L=Math.hypot(b[0]-a[0],b[1]-a[1])||1, ux=(b[0]-a[0])/L, uy=(b[1]-a[1])/L, nx=uy, ny=-ux;
  const at=(t,o)=>[a[0]+ux*t-nx*o,a[1]+uy*t-ny*o], mid=(d.s0+d.s1)/2; let pos=null;
  for(const t of [d.s0-1.1,d.s1+1.1,d.s0-2.2,d.s1+2.2]){ const q=at(t,1.5); if(t>.6&&t<L-.6&&inP(p,q[0],q[1])){ pos=q; break; } }
  if(!pos) return;
  const walmart=(SH.brand||'')==='Walmart', who=buildPerson({top:walmart?0x2a6ab3:0xc4343a,jeans:0x2b2e36,hair:walmart?0x4a3426:0x1f1a17,skin:walmart?0xd7a47c:0xa8714f});
  who.visible=true; who.traverse(o=>{ if(o.isMesh){ o.renderOrder=5; o.frustumCulled=false; if(o.material&&o.material!==shadow.material){ o.material.transparent=false; o.material.opacity=1; } } });   // plain opaque: always drawn with the room
  const [x3,z3]=to3(pos[0],pos[1]), dm=at(mid,0), fx=dm[0]-pos[0], fy=dm[1]-pos[1];
  who.position.set(x3,0,z3); who.rotation.y=Math.atan2(-fx,fy);            // front is -z; face the doors
  const P=who.userData; P.hipL.rotation.x=P.hipR.rotation.x=0; P.kneeL.rotation.x=P.kneeR.rotation.x=0; P.elL.rotation.x=P.elR.rotation.x=.15;
  g.add(who); ROOM.gr={who,P,pos,w:0,t:Math.random()*6}; }
function greeterTick(dt,q){ const G=ROOM.gr; if(!G) return; G.t+=dt; const d=Math.hypot(q[0]-G.pos[0],q[1]-G.pos[1]), want=d<9?1:0;
  G.w+=Math.max(-1,Math.min(1,want-G.w))*dt*2.2; const w=G.w, P=G.P;
  P.shR.rotation.x=.05+w*2.35; P.shR.rotation.z=-.07+Math.sin(G.t*7)*.32*w; P.elR.rotation.x=.15+w*.5+Math.sin(G.t*7)*.12*w;   // the right arm goes up and waves
  P.shL.rotation.x=.04; P.up.rotation.x=-.02; P.up.rotation.y=Math.sin(G.t*.8)*.05*(1-w*.5); }
const LSWS={}; let LKEY=null;                                     // switch positions by building
function lightsApply(){ if(ROOM.sw&&ROOM.sw.length===1) LSW[1]=LSW[0]; if(LKEY) LSWS[LKEY]=LSW.slice();
  for(const k of [0,1]){ const m=ROOM.tro&&ROOM.tro[k]; if(m){ m.color.setHex(LSW[k]?0xffffff:0x3b3f47); m.needsUpdate=true; } for(const o of (ROOM.glow&&ROOM.glow[k])||[]) o.visible=LSW[k]; }
  if(ROOM.gm){ const on0=(LSW[0]?1:0)+(LSW[1]?1:0), ff=on0===2?1:on0===1?.62:.3, mix=.22+.78*ff; for(const m of ROOM.gm){ if(!m.userData.c0){ m.userData.c0=m.color.clone(); m.userData.e0=m.emissive?m.emissive.clone():null; } m.color.copy(m.userData.c0).multiplyScalar(mix); if(m.emissive&&m.userData.e0) m.emissive.copy(m.userData.e0).multiplyScalar(ff); } }
  for(const w of ROOM.sw||[]){ w.lv.position.y=1.2+(LSW[w.k]?.012:-.012); w.lv.rotation.x=LSW[w.k]?-.35:.35; }
  const on=(LSW[0]?1:0)+(LSW[1]?1:0), f=on===2?1:on===1?.62:.3;           // the night lights keep a little light          // the room dims as rows go out
  { const stx=Object.values(STX); for(const m of ROOM.dimM||[]) if(m&&!stx.includes(m)) m.emissiveIntensity=.12+.88*f; }       // the textured walls, floor and ceiling dim with the lights
  for(const k of ['ceil','floor']) if(STX[k]){ STX[k].emissiveIntensity=f; STX[k].color.setScalar(.35+.65*f); }
  if(typeof swLabel==='function'&&swBtn.style.display==='flex') swLabel();
  if(typeof dirty!=='undefined') dirty=true; }
function flipLights(k,on){ if(k==null){ LSW[0]=LSW[1]=on; } else LSW[k]=on==null?!LSW[k]:on; lightsApply(); return LSW.slice(); }
// the button by the switches
const swBtn=document.createElement('div'); swBtn.id='lightSw';
swBtn.style.cssText='position:absolute;left:50%;bottom:calc(var(--gap,10px) + 120px);transform:translateX(-50%);z-index:32;display:none;gap:10px';
for(const k of [0,1]){ const b=document.createElement('button'); b.style.cssText='font:600 15px system-ui;padding:10px 14px;border-radius:12px;border:0;background:rgba(20,24,32,.85);color:#fff;box-shadow:0 3px 10px rgba(0,0,0,.4)';
  b.onclick=e=>{ e.stopPropagation(); flipLights(k); swLabel(); }; swBtn.appendChild(b); }
document.body.appendChild(swBtn);
const hoopBtn=document.createElement('button'); hoopBtn.style.cssText='position:absolute;left:50%;bottom:calc(var(--gap,10px) + 176px);transform:translateX(-50%);z-index:32;display:none;font:600 15px system-ui;padding:10px 14px;border-radius:12px;border:0;background:rgba(20,24,32,.85);color:#fff;box-shadow:0 3px 10px rgba(0,0,0,.4)';
hoopBtn.onclick=e=>{ e.stopPropagation(); const h=ROOM.hoops; if(h){ h.t=h.t>.5?0:1; if(h.o===h.t) h.o=h.t; hoopLabel(); } }; document.body.appendChild(hoopBtn);
function hoopLabel(){ const h=ROOM.hoops; if(!h) return; hoopBtn.textContent=h.o!==h.t?(h.t>h.o?'🏀 Lowering the hoops…  (tap to stop and raise)':'🏀 Raising the hoops…  (tap to lower)'):(h.o>=1?'🏀 Hoops: down. Raise them':'🏀 Hoops: up. Lower them'); }
function swLabel(){ const one=ROOM.sw&&ROOM.sw.length===1; [...swBtn.children].forEach((b,k)=>{ b.style.display=one&&k?'none':''; b.textContent=(LSW[k]?'💡':'⚫')+(one?' Light: ':' Switch '+(k+1)+': ')+(LSW[k]?'on':'off'); }); }
function switchNear(){ const r=ROOM.r; let near=false;
  if(r&&ROOM.sw&&ROOM.sw.length&&mode==='walk'){ const q=loc(r,S.lat,S.lng); near=ROOM.sw.some(w=>Math.hypot(q[0]-w.pos[0],q[1]-w.pos[1])<2.2); }
  { let hn=false; if(r&&ROOM.hs&&ROOM.hoops&&mode==='walk'){ const q=loc(r,S.lat,S.lng); hn=Math.hypot(q[0]-ROOM.hs[0],q[1]-ROOM.hs[1])<2.4; } if(hn!==(hoopBtn.style.display==='block')){ hoopBtn.style.display=hn?'block':'none'; if(hn) hoopLabel(); } }
  if(near!==(swBtn.style.display==='flex')){ swBtn.style.display=near?'flex':'none'; if(near) swLabel(); } }
function dropRoom(){ ROOM.gr=null; ROOM.tro=null; ROOM.glow=null; ROOM.gm=null; ROOM.hoops=null; ROOM.hs=null; ROOM.sw=null; ROOM.dimM=null; LKEY=null; swBtn.style.display='none'; hoopBtn.style.display='none'; if(!ROOM.g) return; scene.remove(ROOM.g); ROOM.g.traverse(o=>{ if(o.geometry) o.geometry.dispose(); }); ROOM.g=null; ROOM.key=null; ROOM.r=null; ROOM.leaves=[]; ROOM.gar=[]; }
function garUpdate(){ for(const G2 of ROOM.gar){ const o=window.GARAGE?GARAGE.openness(G2.q.gk):0, b0=o*1.95, top=2.2, h=Math.max(.15,top-b0);
  G2.m.scale.y=h; G2.m.position.y=b0+h/2; } }
// the room sits round the building's middle, turned with the camera, at the map's scale (like the cars)
function placeRoom(m,b){ const r=ROOM.r; if(!r) return; const kx=111320*cosLat();
  const dx=(r.cx-S.lng)*kx, dy=(r.cy-S.lat)*111320, sb=Math.sin(b), cb=Math.cos(b), f=dx*sb+dy*cb, rr=dx*cb-dy*sb;
  ROOM.g.position.set(rr/m,0,-f/m); ROOM.g.scale.setScalar(1/m); ROOM.g.rotation.y=b; }
// doors swing open when you're within ~1.8 m of them, and shut again behind you
const HOOPO={};
function hoopPose(){ const h=ROOM.hoops; if(!h) return; const e=h.o*h.o*(3-2*h.o);                    // eased
  for(const q of h.list){ q.H.position.y=(1-e)*h.up; const by=q.H.position.y+4.15, len=Math.max(.05,h.top-by); for(const c of q.cabs){ c.scale.y=len; c.position.y=by+len/2; } }
  if(typeof hoopLabel==='function') hoopLabel(); }
function hoopTick(dt){ const h=ROOM.hoops; if(!h||h.o===h.t) return; const st=dt/16; h.o=h.t>h.o?Math.min(h.t,h.o+st):Math.max(h.t,h.o-st); HOOPO[ROOM.r&&ROOM.r.key]=h.o; hoopPose(); dirty=true; }   // 16 s from up to down
function doorSwing(dt){ const r=ROOM.r; if(!r) return; const q=loc(r,S.lat,S.lng);
  greeterTick(dt,q);
  for(const L of ROOM.leaves){ const mx=(L.d.x0+L.d.x1)/2, my=(L.d.y0+L.d.y1)/2, near=Math.hypot(q[0]-mx,q[1]-my)<(L.auto?3.8:1.8);   // automatic doors sense you from further off, and open quicker
    L.o=Math.max(0,Math.min(1,L.o+(near?1:-1)*dt/(L.auto?.45:.7))); L.pv.rotation.y=L.angC+L.dA*.95*(L.o*L.o*(3-2*L.o)); } }
function fpCam(dt){
  if(!FPV.on){ FPV.on=true; step.W=0; LOOK.pitch=0; }
  const W2=innerWidth, H=innerHeight, fov=FPV.fov, DEGR=Math.PI/180;
  S.camB=((S.hdg+LOOK.yaw)%360+360)%360;
  const want=86+LOOK.pitch*.6, p=Math.max(30,Math.min(160,want)), mp=Math.min(p,85), tilt=Math.min(70,Math.max(0,p-85));
  const Dpx=.5*H/Math.tan(fov*DEGR/2), pr=mp*DEGR, eh=1.62;
  const z=Math.min(24,Math.log2(78271.517*Math.cos(S.lat*DEGR)/(eh/(Dpx*Math.cos(pr))))), mm=78271.517*Math.cos(S.lat*DEGR)/Math.pow(2,z);
  S.zoom=z; const b=S.camB*DEGR, camH=Dpx*mm*Math.cos(pr), F=Dpx*mm*Math.sin(pr);
  try{ if(Math.abs(map.transform.fov-fov)>.01) map.transform.fov=fov; }catch(e){}
  map.jumpTo({center:[S.lng+F*Math.sin(b)/(111320*cosLat()),S.lat+F*Math.cos(b)/111320],bearing:S.camB,zoom:z,pitch:mp,padding:{top:0,bottom:0,left:0,right:0}});
  // looking up past the map's 85 degree limit: the room's camera keeps tilting, the map picture slides down to match
  const drop=Math.round(Dpx*Math.tan(tilt*DEGR)); if(drop!==FPV.drop){ FPV.drop=drop; map.getCanvas().style.transform=drop?'translateY('+drop+'px)':''; }
  if(W2!==step.W||H!==step.H){ step.W=W2; step.H=H; renderer.setSize(W2,H,false); }
  camera.clearViewOffset(); camera.fov=fov; camera.aspect=W2/H; camera.near=Math.max(.5,.05/mm); camera.far=4000/mm;
  camera.position.set(0,camH/mm,0); camera.up.set(0,1,0); camera.lookAt(0,camH/mm-Math.cos(pr)*100,-Math.sin(pr)*100);
  if(tilt) camera.rotateX(tilt*DEGR); camera.updateProjectionMatrix();
  step.cam=null; }
function fpOff(){ FPV.on=false; FPV.drop=0; map.getCanvas().style.transform=''; try{ map.transform.fov=36.87; }catch(e){}
  camera.fov=36.87; camera.near=10; camera.far=50000; camera.updateProjectionMatrix(); LOOK.pitch=Math.min(LOOK.pitch,12); step.W=0; step.cam=null; dirty=true; }
function setInside(r){
  IN.rec=r; IN.key=r?r.key:null;
  safe('inside hide',()=>hideBuilding(r));
  safe('inside draw',()=>drawInterior(r));
  person.traverse(o=>{ if(o.isMesh&&o.material!==shadow.material) o.material.depthTest=!r; });   // never hidden by the walls round you
  if(window.TRAFFIC&&TRAFFIC.occRebuild) TRAFFIC.occRebuild();                                    // and drop it from the car layer's building blockers
  step.cam=null; dirty=true; step.surf=null;
  if(r&&window.STORES&&STORES.own){ const st=STORES.own(r); if(st) safe('greeter',()=>STORES.greet(st)); }   // "Welcome to Meijer" / "Welcome to Walmart"
  if(r&&!IN.told){ IN.told=true; toast('Inside: the walls are cut away so you can see in'+(mode==='walk'?'. Walk out through a door to leave':''),3800); }
}
// work out which building you're in (if any), from where you stand
function updInside(recs){
  let r=null; if(IN.rec&&inRec(IN.rec,S.lat,S.lng)) r=IN.rec; else for(const q of recs) if(inRec(q,S.lat,S.lng)){ r=q; break; }
  if((r?r.key:null)!==IN.key) setInside(r);
}

/* ---------- getting out and back in ---------- */
function getOut(){
  if(mode==='walk') return getIn();
  if(mode==='glider'){ toast(PK.mode?'Land first (tap 🪂), then walk back to your '+vehName():'Land first (tap 🪂)',2400); return; }
  if(mode==='boat'){ toast("You can't get out on the water. Head for the shore first",2600); return; }
  if(YD.POLICE&&YD.POLICE.state&&YD.POLICE.state.chase){ toast('🚓 Police are behind you: stop for the ticket or lose them first',2800); return; }
  if(Math.abs(S.v)>1.4){ toast('Stop first, then tap 🚶 to get out',2200); return; }
  if(window.AUTO&&AUTO.on) AUTO.takeover();
  Object.assign(PK,{mode,lat:S.lat,lng:S.lng,hdg:S.hdg});
  // step out of the driver's door (left); the other side, behind or in front if a building is in the way
  const EX=WX;                                                     // the parked car is drawn real size while you're on foot
  const h=rad(S.hdg), half=(mode==='tractor'?1.15:((CARSPEC&&CARSPEC.W)||2.35)/2)*EX, side=half+.55*EX, end=3.4*EX;
  const spots=[[-side,0],[side,0],[0,-end],[0,end]];
  let at=offsetPt(S.lat,S.lng,h,spots[0][0],spots[0][1]);
  const ir=IN.rec&&inRec(IN.rec,S.lat,S.lng)?IN.rec:null;
  if(ir){ at=[S.lat,S.lng];                                       // parked in a garage (js/enh/garage.js): step out beside the car, still inside
    for(const [r,f] of [[-1.5,0],[1.5,0],[-1.1,-1],[1.1,-1],[0,-3],[0,3]]){ const p=offsetPt(S.lat,S.lng,h,r,f); if(inRec(ir,p[0],p[1])){ at=p; break; } } }
  else for(const [r,f] of spots){ const p=offsetPt(S.lat,S.lng,h,r,f); if(!safe('walk spot',()=>inBuilding(p[0],p[1])||inWater(p[0],p[1]))){ at=p; break; } }
  S.lat=at[0]; S.lng=at[1]; S.v=0; S.steer=0; S.roll=S.pitch=0;
  Object.assign(W,{v:0,phase:0,amp:0,run:0,near:true});
  setMode('walk');
  step.cam=null; step.mph=-1; dirty=true;
  toast('On foot: steer to turn · WALK to walk, press higher to run · tap 🚗 by the '+vehName()+' to get back in',4500);
}
function getIn(){
  if(IN.rec&&!inRec(IN.rec,PK.lat,PK.lng)){ toast('Walk out through a door first, then back to your '+vehName(),2600); return; }
  const c=carInfo();
  if(c.d>reach()){ toast('Your '+vehName()+' is '+c.dist+' '+c.where+'. Walk back to it to get in',2800); return; }
  S.lat=PK.lat; S.lng=PK.lng; S.hdg=PK.hdg; S.v=0; S.steer=0; S.roll=S.pitch=0;
  const m=PK.mode||'car'; PK.mode=null;
  car.position.set(0,0,0);
  setMode(m);
  step.cam=null; step.mph=-1; step.detOnce=false; dirty=true;
  toast('Back in the '+(m==='tractor'?'tractor':(CARSPEC&&CARSPEC.name)||'car'),1600);
}
if(btn) btn.addEventListener('click',e=>{ e.stopPropagation(); safe('walk',getOut); });
window.WALK={toggle:()=>safe('walk',getOut)};   /* the F key: js/enh/controls.js */

// mode changes (here, the glider, anything else): show/hide the person, relabel the pedals and the button
const prevMode=window.onModeChange;
window.onModeChange=(m,was)=>{ if(prevMode) prevMode(m,was);
  person.visible=(m==='walk'); setPedals(m==='walk'||m==='glider'&&!!PK.mode);
  if(m!=='walk'&&m!=='glider') PK.mode=null;                       // back in a vehicle
  if(m!=='walk'&&FPV.on) fpOff();
  if(IN.rec&&(m==='walk'||was==='walk')) safe('inside draw',()=>drawInterior(IN.rec));   /* car <-> foot in a garage: cut-away <-> the room */
  if(m!=='walk'){ if(IN.rec&&(m==='glider'||!inRec(IN.rec,S.lat,S.lng))) setInside(null);   /* got back in the car in the garage: stay inside */ if(IN.open!=null&&window.ROOFS){ IN.open=null; ROOFS.openDoor(null); } IN.ip=68; }
  if(m==='walk'){ car.visible=true; W.v=0; S.zoom=Math.max(S.zoom,19.3); }
  updateBtn();
};

/* ---------- every frame on foot (called from js/game.js step()) ---------- */
function walkStep(dt,st,gas,now){
  // speed: any press walks, the upper part of the pedal jogs and runs; brake steps backwards
  let tv=0;
  if(gas>.05) tv=gas<=.55?WALKV:WALKV+(Math.min(gas,.85)-.55)/.3*(RUNV-WALKV);
  else if(gas<-.05) tv=-BACKV;
  W.v+=(tv-W.v)*Math.min(1,dt*(Math.abs(tv)<Math.abs(W.v)?7:3.5));
  if(!tv&&Math.abs(W.v)<.03) W.v=0;
  // turning: on the spot or on the move (a bit wider when running)
  const sp=Math.abs(W.v);
  S.hdg=(S.hdg+st*(sp>3?110:160)*dt+360)%360;
  // move; buildings and water stop you (unless you're already inside one, e.g. got out in a building)
  const dm=W.v*dt*(IN.rec?1:SPEEDUP), h=rad(S.hdg);                // indoors at real walking speed (rooms are small)
  const recs=safe('doors',()=>recsNear(S.lat,S.lng))||[];
  safe('inside',()=>updInside(recs));
  if(dm){
    const n=offsetPt(S.lat,S.lng,h,0,dm), probe=offsetPt(n[0],n[1],h,0,Math.sign(dm)*.3);
    if(!landCache.at||every('landcache',3)||meters(landCache.at[1],landCache.at[0],S.lat,S.lng)>400) safe('land',rebuildLandCache);
    let thru=null; for(const r of recs){ if(doorCross(r,[S.lat,S.lng],probe)){ thru=r; break; } }   // through a doorway: in or out
    const wall=!thru&&IN.rec&&!inRec(IN.rec,probe[0],probe[1]);                                     // inside: its walls keep you in
    const block=!thru&&(wall||safe('walk block',()=>(inBuilding(probe[0],probe[1])&&!inBuilding(S.lat,S.lng))||(inWater(probe[0],probe[1])&&!inWater(S.lat,S.lng))));
    if(block){
      // walking at a wall right by a door: slide along it into the doorway
      const nd=wall||!inAny(landCache.water,probe[1],probe[0])?nearDoor(recs,S.lat,S.lng):null;
      if(nd&&Math.abs(nd.off)<1.3&&Math.abs(nd.al)<nd.half+1.4&&Math.abs(nd.al)>.05){
        const sl=-Math.sign(nd.al)*Math.min(Math.abs(nd.al),1.2*dt*SPEEDUP), ex=nd.ux*sl/nd.r.kx, ey=nd.uy*sl/nd.r.ky;
        S.lng+=ex; S.lat+=ey; W.v*=.9;
      } else {
        W.v=0; if(now-W.blockT>4000){ W.blockT=now; toast(wall?'A wall: walk out through a door':inAny(landCache.water,probe[1],probe[0])?"Water ahead: you can't swim here":'A building is in the way: walk in through a door',1600); } }
    }
    else { S.lat=n[0]; S.lng=n[1]; safe('inside',()=>updInside(recs)); }
  }
  // the door you're at shows open
  if(window.ROOFS&&ROOFS.openDoor){ const nd=recs.length?nearDoor(recs,S.lat,S.lng):null, dk=nd&&nd.dist<2.2?nd.d.dk:null;
    if(dk!==IN.open){ IN.open=dk; ROOFS.openDoor(dk); } }
  S.v=W.v; S.dist+=W.v*dt;
  // walk cycle
  const moving=Math.abs(W.v)>.05, run=Math.max(0,Math.min(1,(Math.abs(W.v)-1.8)/2.6));
  W.run+=(run-W.run)*Math.min(1,dt*5);
  W.amp+=((moving?.4+.42*W.run:0)-W.amp)*Math.min(1,dt*8);
  if(moving) W.phase+=dt*2*Math.PI*(.95+.24*Math.abs(W.v))*Math.sign(W.v);
  else if(W.amp<.02) W.phase=0;
  const anim=W.amp>.004; if(anim) pose();

  // HUD + background jobs (same as driving)
  if(every('place',1)) updatePlace(); if(every('house',.25)) updateHouseFilter(false);
  if(every('compass',POWER?.12:.05)) updateCompass(); if(every('roadx',.25)) updateRoadX();
  if(every('towers',5) && !towerBusy && towerAt && (meters(towerAt[1],towerAt[0],S.lat,S.lng)>15000||towerRetry&&Date.now()>towerRetry)) { towerRetry=0; loadTowers(); }
  if(every('decor',.5) && styleReady && (!decorAt || meters(decorAt[1],decorAt[0],S.lat,S.lng)>250)) buildDecor();
  if(every('walkhud',.3)){
    if(styleReady){ const p=map.project([S.lng,S.lat]), f=QGEO()?geoRoads(S.lng,S.lat,4):hitRoad(p.x,p.y,8);

      roadEl.textContent=IN.rec?'Indoors':'On foot'; roadEl.className=''; /* the street shows next to it: game.js updateRoadX */ }
    const st2=Math.abs(W.v)<.05?'Standing':W.v<0?'Stepping back':W.run>.6?'Running':W.run>.15?'Jogging':'Walking';
    if(st2!==step.surf){ step.surf=st2; surfEl.textContent=st2; surfEl.style.color=''; }
    const c=carInfo(); W.near=c.d<=reach()&&(!IN.rec||inRec(IN.rec,PK.lat,PK.lng));
    nearEl.textContent=W.near?'Tap 🚗 to get back in':IN.rec?'Inside · walk out through a door to leave':W.near?'Tap 🚗 to get back in':(PK.mode==='tractor'?'🚜':'🚗')+' Your '+vehName()+': '+c.dist+' '+c.where;
    step.near=null; updateBtn();
  }

  let camMoved=true;
  if(IN.rec) fpCam(dt);                                             // inside: through your own eyes (see fpCam)
  else {
  if(FPV.on) fpOff();
  // camera: closer than driving, follows where you face
  const dB=((S.hdg+LOOK.yaw-S.camB+540)%360)-180; S.camB+=dB*(1-Math.exp(-dt*4));
  const tz=Math.min(22.4,21.2+zoomOff);   /* closer than before: the person is real size now */ S.zoom+=(tz-S.zoom)*Math.min(1,dt*2.5);
  const Wd=innerWidth,H=innerHeight,padTop=H*.34, cm0=step.cam||{}, PIT=viewPitch(68);
  camMoved=dirty||Wd!==cm0.W||H!==cm0.H||PIT!==cm0.p||Math.abs(S.lng-cm0.lng)>1e-8||Math.abs(S.lat-cm0.lat)>1e-8||Math.abs(S.camB-cm0.b)>.005||Math.abs(S.zoom-cm0.z)>.0003;
  if(camMoved){ step.cam={lng:S.lng,lat:S.lat,b:S.camB,z:S.zoom,W:Wd,H,p:PIT};
    map.jumpTo({center:[S.lng,S.lat],bearing:S.camB,zoom:S.zoom,pitch:PIT,padding:{top:padTop,bottom:0,left:0,right:0}}); }
  if(Wd!==step.W||H!==step.H||PIT!==step.pit){ step.W=Wd; step.H=H; step.pit=PIT;
    renderer.setSize(Wd,H,false); camera.aspect=Wd/H; camera.setViewOffset(Wd,H,0,-padTop/2,Wd,H);
    aimCam3D(H,PIT); placeGlider(); }
  }

  // car layer: you at the centre, the parked vehicle where you left it (same projection as the traffic)
  const m=mpp(S.lat,S.zoom), sc=WX/m, b=rad(S.camB), sb=Math.sin(b), cb=Math.cos(b);
  person.scale.setScalar(sc); person.rotation.y=-rad(S.hdg-S.camB); person.visible=!IN.rec;   /* first person indoors: you're the camera */
  if(ROOM.g){ placeRoom(m,b); doorSwing(dt); hoopTick(dt); }
  switchNear();
  const dx=(PK.lng-S.lng)*111320*cosLat(), dy=(PK.lat-S.lat)*111320, f=dx*sb+dy*cb, r=dx*cb-dy*sb;
  car.visible=true; car.position.set(r/m,0,-f/m); car.scale.setScalar(sc); car.rotation.y=-(rad(PK.hdg)-b);
  body.rotation.set(0,0,0); tractorG.rotation.set(0,0,0); debris.scale.setScalar(sc);
  tails.forEach(t=>t.material=tailOff);
  placePhoto(false);
  setOrder(car.position.z>0&&Math.hypot(r,f)<12?9:12);       // the car photo covers you only when it's nearer the camera
  const traffic=(window.TRAFFIC?TRAFFIC.frame(dt):false)|runFrameHooks(dt);
  const live=updateFx(dt,0,0);
  if(camMoved||anim||W.lastAnim||live>0||shake>0||traffic) renderer.render(scene,camera);
  W.lastAnim=anim; dirty=false;
  const mph=Math.round(Math.abs(W.v)*2.237); if(mph!==step.mph){ step.mph=mph; mphEl.textContent=mph; }
}
window.WALK={inStore:()=>!!(ROOM.sw&&ROOM.sw.length),storeLights:(k,on)=>flipLights(k,on),step:(dt,st,gas,now)=>{ try{ walkStep(dt,st,gas,now); }catch(e){ console.warn('walk',e); renderer.render(scene,camera); } },
  parked:()=>PK.mode, getOut:()=>safe('walk',getOut), toggle:()=>safe('walk',getOut), state:W, person, parkedAt:PK,   /* toggle: the F key (js/enh/controls.js) */
  insideId:()=>IN.rec?IN.rec.id:null, inside:IN,
  setInside:r=>safe('inside',()=>{ if((r?r.key:null)!==IN.key) setInside(r); }), redrawInside:()=>{ if(IN.rec) safe('inside draw',()=>{ if(ROOM.g) garUpdate(); else drawInterior(IN.rec); }); }, inRec};
updateBtn();
})();
