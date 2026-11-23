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
function buildPerson(){
  const mat=c=>new THREE.MeshLambertMaterial({color:c,transparent:true,opacity:1});   // transparent: drawn in order with the car photo
  const skin=mat(0xc98f6a), hair=mat(0x3b2a1e), top=mat(0x6f7780), jeans=mat(0x2c3a52), shoe=mat(0xe8e6e1), sole=mat(0x6b6b6b);
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
  const id=r?r.id:null, ids=id==null||destroyed.includes(id)?destroyed.slice():destroyed.concat([id]), f=ids.length?['!',['in',['id'],['literal',ids]]]:null;
  for(const lid of hideIds){ if(!map.getLayer(lid)) continue;
    const of=origFilters[lid], nf=f?(of?['all',of,f]:f):(of||null);
    try{ map.setFilter(lid,nf); if(f&&of&&JSON.stringify(map.getFilter(lid))!==JSON.stringify(nf)) map.setFilter(lid,f); }catch(e){ console.warn('inside filter',e); } }
  if(map.getLayer('roof-3d')) safe('inside roofs',()=>map.setFilter('roof-3d',r?['!=',['coalesce',['get','bk'],''],r.key]:null));
  // the rest of the group
  REST.features=[];
  if(r&&!destroyed.includes(id)){ const seen=new Set(), lim=800/111320, kx=Math.cos(rad(S.lat));
    let fs=[]; try{ fs=map.querySourceFeatures(bSrc,{sourceLayer:'building'}); }catch(e){}
    for(const q of fs){ if(q.id!==id) continue; const g=q.geometry, pls=!g?[]:g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
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
  map.getSource('interior').setData({type:'FeatureCollection',features:r?interiorFeatures(r):[]});
}
function setInside(r){
  IN.rec=r; IN.key=r?r.key:null;
  safe('inside hide',()=>hideBuilding(r));
  safe('inside draw',()=>drawInterior(r));
  person.traverse(o=>{ if(o.isMesh&&o.material!==shadow.material) o.material.depthTest=!r; });   // never hidden by the walls round you
  if(window.TRAFFIC&&TRAFFIC.occRebuild) TRAFFIC.occRebuild();                                    // and drop it from the car layer's building blockers
  step.cam=null; dirty=true; step.surf=null;
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
  const dm=W.v*dt*SPEEDUP, h=rad(S.hdg);
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

  // camera: closer than driving, follows where you face
  const dB=((S.hdg+LOOK.yaw-S.camB+540)%360)-180; S.camB+=dB*(1-Math.exp(-dt*4));
  const tz=Math.min(22.4,21.2+zoomOff+(IN.rec?.4:0));                   // closer than before: the person is real size now S.zoom+=(tz-S.zoom)*Math.min(1,dt*2.5);
  IN.ip+=((IN.rec?48:68)-IN.ip)*Math.min(1,dt*3);                   // inside: look down more steeply, over the cut-away walls
  const Wd=innerWidth,H=innerHeight,padTop=H*.34, cm0=step.cam||{}, PIT=viewPitch(Math.round(IN.ip));
  const camMoved=dirty||Wd!==cm0.W||H!==cm0.H||PIT!==cm0.p||Math.abs(S.lng-cm0.lng)>1e-8||Math.abs(S.lat-cm0.lat)>1e-8||Math.abs(S.camB-cm0.b)>.005||Math.abs(S.zoom-cm0.z)>.0003;
  if(camMoved){ step.cam={lng:S.lng,lat:S.lat,b:S.camB,z:S.zoom,W:Wd,H,p:PIT};
    map.jumpTo({center:[S.lng,S.lat],bearing:S.camB,zoom:S.zoom,pitch:PIT,padding:{top:padTop,bottom:0,left:0,right:0}}); }
  if(Wd!==step.W||H!==step.H||PIT!==step.pit){ step.W=Wd; step.H=H; step.pit=PIT;
    renderer.setSize(Wd,H,false); camera.aspect=Wd/H; camera.setViewOffset(Wd,H,0,-padTop/2,Wd,H);
    aimCam3D(H,PIT); placeGlider(); }

  // car layer: you at the centre, the parked vehicle where you left it (same projection as the traffic)
  const m=mpp(S.lat,S.zoom), sc=WX/m, b=rad(S.camB), sb=Math.sin(b), cb=Math.cos(b);
  person.scale.setScalar(sc); person.rotation.y=-rad(S.hdg-S.camB);
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
window.WALK={step:(dt,st,gas,now)=>{ try{ walkStep(dt,st,gas,now); }catch(e){ console.warn('walk',e); renderer.render(scene,camera); } },
  parked:()=>PK.mode, getOut:()=>safe('walk',getOut), toggle:()=>safe('walk',getOut), state:W, person, parkedAt:PK,   /* toggle: the F key (js/enh/controls.js) */
  insideId:()=>IN.rec?IN.rec.id:null, inside:IN,
  setInside:r=>safe('inside',()=>{ if((r?r.key:null)!==IN.key) setInside(r); }), redrawInside:()=>{ if(IN.rec) safe('inside draw',()=>drawInterior(IN.rec)); }, inRec};
updateBtn();
})();
