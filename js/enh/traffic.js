/* Traffic: simple AI cars on the real road network around you.
   - Roads come from the map tiles already loaded (no extra downloads). One-way streets are respected.
   - Drivers keep to the right: on two-way roads they drive in the right-hand half, in the middle of their lane.
   - They follow the road shape, choose turns at real intersections (mostly straight on), slow for turns, keep a gap
     to the car ahead (and to you), stop at stop signs, and stop for red lights (same light cycle the signs show).
   - Drawn in the car layer; a car is hidden while a building stands between it and the camera.
   Battery saver: fewer cars and fewer checks. Toggle in Settings (saved on this device). */
(()=>{
'use strict';
const {safe,onReady,onTick}=YD;

const CLASS_SPEED={motorway:65,trunk:55,primary:45,secondary:40,tertiary:35,minor:30};   // mph: the same typical limits the speed sign shows when a road has none posted (signs.js)
const CLASS_WIDTH={motorway:14,trunk:12,primary:12,secondary:10,tertiary:10,minor:8};    // metres, same as roads.js
const PAINT=[0xf1f3f5,0x1f2328,0xaab2bb,0x6b7280,0xb91c1c,0x1d4ed8,0x1e3a8a,0x14532d,0xd6c7a1,0x7c2d12,0x0f766e];
const T={on:true,nodes:null,grid:null,segs:[],builtAt:null,builtT:0,tilesDirty:true,agents:[],group:null,parts:null,moved:false};
try{ T.on=localStorage.getItem('ydTraffic')!=='0'; }catch(e){}
const MAXCARS=()=>POWER?5:12;
const mph2w=m=>m/2.237*SPEEDUP;                                   // mph on the speedo -> world metres per second
const BB=()=>6*SPEEDUP, ACCF=()=>2.6*SPEEDUP;                     // planning braking / acceleration, world m/s^2 (SPEEDUP can change: cockpit real speed)

/* ---------- road graph from the vector tiles ---------- */
// vertices shared by two roads (intersections) or two tiles (tile seams) are merged when within 0.9 m
function build(){
  const nodes=[], grid=new Map(), segs=[], seen=new Set();
  const cell=(x,y)=>Math.floor(x)+','+Math.floor(y);
  const node=(x,y)=>{ const cx=Math.floor(x), cy=Math.floor(y);
    for(let i=-1;i<=1;i++) for(let j=-1;j<=1;j++){ const a=grid.get((cx+i)+','+(cy+j)); if(a) for(const n of a) if(Math.abs(n.x-x)<.9&&Math.abs(n.y-y)<.9) return n; }
    const n={x,y,out:[],deg:0,sig:null,stop:false,id:nodes.length}; nodes.push(n); const k=cell(x,y); let a=grid.get(k); if(!a) grid.set(k,a=[]); a.push(n); return n; };
  let feats=[]; try{ feats=map.querySourceFeatures(bSrc,{sourceLayer:'transportation'}); }catch(e){ return false; }
  const cx=S.lng*MLNG, cy=S.lat*MLAT, R=1600;
  for(const f of feats){
    const p=f.properties||{}, cls=p.class; if(!CLASS_SPEED[cls]) continue;
    const g=f.geometry, lines=!g?[]:g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
    const ow=+p.oneway||0, ramp=+p.ramp===1, w=ramp?6:CLASS_WIDTH[cls], mph=ramp?35:CLASS_SPEED[cls];
    for(const ln of lines){ let prev=null;
      for(const c of ln){ const x=c[0]*MLNG, y=c[1]*MLAT;
        if(Math.abs(x-cx)>R||Math.abs(y-cy)>R){ prev=null; continue; }
        const n=node(x,y);
        if(prev&&prev!==n){
          const key=prev.id<n.id?prev.id+'-'+n.id:n.id+'-'+prev.id;
          if(!seen.has(key)){ seen.add(key); prev.deg++; n.deg++;
            const add=(a,b)=>{ const dx=b.x-a.x, dy=b.y-a.y, L=Math.hypot(dx,dy); if(L<.3) return;
              const s={a,b,len:L,ux:dx/L,uy:dy/L,off:ow?0:w/4,v:mph2w(mph),mph,est:mph,cls,stop:false,sig:null}; a.out.push(s); segs.push(s); };
            if(ow>=0) add(prev,n); if(ow<=0) add(n,prev); } }
        prev=n; } } }
  T.nodes=nodes; T.grid=grid; T.segs=segs; T.builtAt=[S.lng,S.lat]; T.builtT=performance.now(); T.tilesDirty=false;
  markControls(); return segs.length>0;
}
function nearNode(x,y,r){ if(!T.grid) return null; const cx=Math.floor(x), cy=Math.floor(y), k=Math.ceil(r); let best=null, bd=r;
  for(let i=-k;i<=k;i++) for(let j=-k;j<=k;j++){ const a=T.grid.get((cx+i)+','+(cy+j)); if(a) for(const n of a){ const d=Math.hypot(n.x-x,n.y-y); if(d<bd){ bd=d; best=n; } } }
  return best; }
// stop signs and traffic lights from signs.js (OpenStreetMap): at an intersection node they apply to every approach;
// on an approach road they apply only to traffic heading toward that intersection
function markControls(){
  const OX=YD.OX; if(!OX||!T.segs.length) return;
  postedLimits(OX);
  const put=(o,kind)=>{
    const ph=hash(Math.round(o.x/60),Math.round(o.y/60))<.5?0:1;          // same phase the sign icons use
    const n=nearNode(o.x,o.y,3.5);
    if(n&&n.deg>=3){ if(kind==='sig') n.sig={ph}; else n.stop=true; return; }
    let best=null, bd=5;
    for(const s of T.segs){ if(Math.abs(s.a.x-o.x)>80||Math.abs(s.a.y-o.y)>80) continue;
      const dx=o.x-s.a.x, dy=o.y-s.a.y, t=Math.max(0,Math.min(s.len,dx*s.ux+dy*s.uy)), d=Math.hypot(dx-s.ux*t,dy-s.uy*t);
      if(d<bd&&s.b.deg>=3){ bd=d; best=s; } }
    if(best){ if(kind==='sig') best.sig={ph}; else best.stop=true; } };
  for(const o of OX.stops||[]) put(o,'stop');
  for(const o of OX.sigs||[]) put(o,'sig');
  T.oxAt=OX.at;
}
// drive the posted limit (owner 2026-11-21: "make the traffic cars go the speed limit"): each road piece takes the
// limit of the OpenStreetMap way it lies on (the one your speed sign reads), else the typical limit for its class
function postedLimits(OX){ const W=OX.speeds||[];
  const pd=(pts,x,y)=>{ let b=1e9; for(let i=1;i<pts.length;i++){ const ax=pts[i-1][0], ay=pts[i-1][1], dx=pts[i][0]-ax, dy=pts[i][1]-ay, L=dx*dx+dy*dy||1, t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/L)); b=Math.min(b,Math.hypot(x-ax-dx*t,y-ay-dy*t)); } return b; };
  for(const s of T.segs){ const x=(s.a.x+s.b.x)/2, y=(s.a.y+s.b.y)/2; let best=9, mph=null;
    for(const w of W){ if(x<w.bb[0]-10||x>w.bb[2]+10||y<w.bb[1]-10||y>w.bb[3]+10) continue; const d=pd(w.pts,x,y); if(d<best){ best=d; mph=w.mph; } }
    const m=mph||s.est; if(m!==s.mph){ s.mph=m; s.v=mph2w(m); } } }
function light(ph){ const t=(Date.now()/1000)%30, a=t<12?'g':t<15?'y':'r', b=t<15?'r':t<27?'g':'y'; return ph===0?a:b; }

/* ---------- cars ---------- */
// vehicle designs live in js/enh/vehicles.js
function makeParts(){ return YD.VEH.mats(); }
function carMesh(){ const g=YD.VEH.build(shadow.material); g.visible=false; T.group.add(g); return g; }
function place(a,seg,s){ a.hold=0; a.path=[seg]; a.s=s; a.v=seg.v; a.stopDone=null; a.waitT=0;
  const p=pos(a); a.px=p[0]; a.py=p[1]; a.hd=Math.atan2(seg.ux,seg.uy); a.fade=0; }
function pos(a){ const s=a.path[0], cx=s.a.x+s.ux*a.s, cy=s.a.y+s.uy*a.s, o=s.off*(typeof driveSide==='function'?driveSide():1); return [cx+s.uy*o, cy-s.ux*o]; }   // its lane: the right-hand half (normal (uy,-ux)), or the left where they drive on the left
function spawn(a,minD,maxD){
  const px=S.lng*MLNG, py=S.lat*MLAT;
  for(let tries=0;tries<40;tries++){
    const s=T.segs[Math.floor(Math.random()*T.segs.length)]; if(!s) return false;
    const d=Math.hypot((s.a.x+s.b.x)/2-px,(s.a.y+s.b.y)/2-py); if(d<minD||d>maxD) continue;
    if(T.agents.some(o=>o!==a&&o.path&&Math.hypot(o.px-s.a.x,o.py-s.a.y)<25)) continue;
    place(a,s,Math.random()*s.len); a.f=1; return true; }   // right on the limit
  return false;
}
function nextSeg(seg){
  let n=seg.b; if(n.out===undefined||!T.nodes||T.nodes[n.id]!==n){ n=nearNode(seg.b.x,seg.b.y,1.2); if(!n) return null; }   // graph was rebuilt
  let outs=n.out.filter(o=>Math.hypot(o.b.x-seg.a.x,o.b.y-seg.a.y)>.9);                          // no U-turns...
  if(!outs.length) outs=bridge(n,seg);                                                            // a tile seam the merge missed: carry on along the road just across it
  if(!outs.length) return null;                                                                   // ...a real dead end / edge of the loaded map ends the trip
  const w=outs.map(o=>{ const c=o.ux*seg.ux+o.uy*seg.uy; return c>.87?5:c>-.2?1:.15; });         // mostly straight on
  let r=Math.random()*w.reduce((x,y)=>x+y,0); for(let i=0;i<outs.length;i++){ r-=w[i]; if(r<=0) return outs[i]; } return outs[0];
}
function bridge(n,seg){ const out=[], cx=Math.floor(n.x), cy=Math.floor(n.y);
  for(let i=-4;i<=4;i++) for(let j=-4;j<=4;j++){ const a=T.grid&&T.grid.get((cx+i)+','+(cy+j)); if(a) for(const m of a){ if(m===n||Math.hypot(m.x-n.x,m.y-n.y)>4) continue;
    for(const o of m.out) if(o.ux*seg.ux+o.uy*seg.uy>.7) out.push(o); } }
  return out; }
function turnCap(s1,s2){ const c=s1.ux*s2.ux+s1.uy*s2.uy; return c>.95?1e9:c>.7?mph2w(22):c>.2?mph2w(15):mph2w(10); }

function drive(a,dt,px,py,pv,ph){ const B=BB(), ACC=ACCF();
  // plan the road ahead far enough to brake for anything on it
  const LA=Math.max(60,a.v*a.v/(2*B)+40);
  let ahead=a.path[0].len-a.s; for(let i=1;i<a.path.length;i++) ahead+=a.path[i].len;
  while(ahead<LA){ const n=nextSeg(a.path[a.path.length-1]); if(!n) break; a.path.push(n); ahead+=n.len; }
  const seg=a.path[0]; let allow=seg.v*a.f; a.endIn=1e9;
  let dist=seg.len-a.s;
  for(let i=0;i<a.path.length;i++){
    const s=a.path[i], nx=a.path[i+1], end=s.b;
    if(nx) allow=Math.min(allow,Math.sqrt(Math.pow(Math.min(turnCap(s,nx),nx.v*a.f),2)+2*B*Math.max(0,dist-3)));
    else a.endIn=dist;                                               // road ends (edge of the loaded map, dead end): no stopping in the lane (owner 2026-11-21) — it drives on and fades away, then turns up elsewhere
    const stopSign=(s.stop||end.stop)&&a.stopDone!==end, sg=s.sig||end.sig;
    if(stopSign){ allow=Math.min(allow,Math.sqrt(2*B*Math.max(0,dist-5)));
      if(i===0&&dist<9&&a.v<1){ a.waitT+=dt; if(a.waitT>1.3){ a.stopDone=end; a.waitT=0; } } }
    if(sg){ const st=light(sg.ph); if(st==='r'||(st==='y'&&dist>a.v*a.v/(2*B)+4)) allow=Math.min(allow,Math.sqrt(2*B*Math.max(0,dist-6))); }
    dist+=nx?nx.len:0; if(!nx||dist>LA) break;
  }
  // keep a gap to anyone ahead in the same lane (other cars and you)
  const [x,y]=pos(a), hx=seg.ux, hy=seg.uy;
  const gap=(ox,oy,ohx,ohy,ov)=>{ const dx=ox-x, dy=oy-y, fd=dx*hx+dy*hy, lat=Math.abs(dx*hy-dy*hx);
    if(fd>0&&fd<70&&lat<3.2&&(ohx*hx+ohy*hy)>.5) allow=Math.min(allow,Math.sqrt(Math.max(0,ov*ov*.8+2*B*Math.max(0,fd-11)))); };
  for(const o of T.agents) if(o!==a&&o.path) gap(o.px,o.py,Math.sin(o.hd),Math.cos(o.hd),o.v);
  gap(px,py,Math.sin(ph),Math.cos(ph),Math.max(0,pv));
  if(a.hold>0){ a.hold-=dt; allow=0; }                             // just been in a bump with you (js/enh/feel.js): stay put a moment
  a.v=a.v<allow?Math.min(allow,a.v+ACC*dt):Math.max(allow,a.v-B*1.6*dt); if(a.v<.05&&allow<.3) a.v=0;
  a.s+=a.v*dt;
  while(a.path.length&&a.s>a.path[0].len){ a.s-=a.path[0].len; a.path.shift(); }
  if(!a.path.length) return false;
  const p=pos(a), k=Math.min(1,dt*8); a.px+=(p[0]-a.px)*k; a.py+=(p[1]-a.py)*k;          // smooth the step at bends
  const th=Math.atan2(a.path[0].ux,a.path[0].uy); let dh=th-a.hd; dh=Math.atan2(Math.sin(dh),Math.cos(dh)); a.hd+=dh*Math.min(1,dt*7);
  return true;
}

/* ---------- is a building between this car and the camera? ---------- */
function hiddenByBuilding(a,camX,camY,camH){
  if(typeof QGEO==='function'&&QGEO()) return hiddenGeo(a,camX,camY,camH);   // terrain on (screen queries stall the GPU) or cockpit (each screen query ~10 ms there: the pitched view covers km of buildings)
  let p; try{ p=map.project([a.px/MLNG,a.py/MLAT]); }catch(e){ return false; }
  if(p.x<-50||p.y<-50||p.x>innerWidth+50||p.y>innerHeight+50) return true;
  const ids=blockIds.filter(id=>map.getLayer(id)); if(!ids.length) return false;
  let fs=[]; try{ fs=map.queryRenderedFeatures([[p.x-3,p.y-3],[p.x+3,p.y+3]],{layers:ids}); }catch(e){ return false; }
  if(!fs.length) return false;
  const dx=camX-a.px, dy=camY-a.py, D=Math.hypot(dx,dy)||1, ux=dx/D, uy=dy/D;
  for(const f of fs){ const pr=f.properties||{}, h=+(pr.render_height??pr.height??pr.h??6)||6;
    const L=Math.min(D,h*D/Math.max(1,camH));                        // how far toward the camera this building can hide things
    for(let t=.12;t<=1.001;t+=.22){ const qx=a.px+ux*L*t, qy=a.py+uy*L*t; if(contains(f.geometry,qx/MLNG,qy/MLAT)) return true; } }
  return false;
}

/* ---------- buildings as depth-only blockers in the car layer (owner 2026-11-21: "sometimes cars very slightly are
   seen through buildings"). The cars are drawn on their own canvas over the map, so the map's buildings can't hide them
   pixel by pixel; the per-car check only hides a car once it's wholly behind one, a quarter-second at a time. These are
   the nearby buildings' footprints and roofs drawn invisibly (depth only) in the car layer, so any part of a car behind
   a building is cut off exactly where the building is. Rebuilt as you drive on; not with 3D terrain on (the car layer's
   ground is flat there). ---------- */
const OCC={mesh:null,at:null,t:0,o:null,dirty:true,ter:null};
function occFeatures(){ const out=[]; const add=(src,sl,hk,bk)=>{ let fs=[]; try{ fs=map.getSource(src)?map.querySourceFeatures(src,sl?{sourceLayer:sl}:{}):[]; }catch(e){} for(const f of fs) out.push([f,hk,bk]); };
  add(bSrc,'building','b','b'); add('rebuilt',null,'h','b'); add('roofs',null,'h','b');            // footprints, redrawn buildings, and the houses' pitched roofs (stacked slices)
  return out; }
function buildOcc(){ OCC.t=performance.now(); OCC.at=[S.lng,S.lat]; OCC.dirty=false; OCC.ter=terrainOn;
  const ox=S.lng*MLNG, oy=S.lat*MLAT, R=700, pos=[], idx=[], seen=new Set(), e0=terrainOn?(map.transform.elevation||0):0;
  for(const [f,hk] of occFeatures()){ const g=f.geometry; if(!g) continue; const polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
    const pr=f.properties||{}; let h,h0;
    if(hk==='b'){ h=+(pr.render_height??pr.height??6)||6; h0=+(pr.render_min_height??pr.min_height??0)||0; } else { h=+pr.h||0; h0=+pr.b||0; }
    if(h<=h0) continue;
    for(const pl of polys){ const ring=pl[0]; if(!ring||ring.length<4) continue;
      const key=hk+ring.length+':'+ring[0][0].toFixed(6)+','+ring[0][1].toFixed(6)+':'+h0; if(seen.has(key)) continue; seen.add(key);   // the same piece from overlapping tiles
      const P=[]; let near=false, cx=0, cy=0; for(let i=0;i<ring.length-1;i++){ const x=ring[i][0]*MLNG-ox, y=ring[i][1]*MLAT-oy; P.push(new THREE.Vector2(x,y)); cx+=ring[i][0]; cy+=ring[i][1]; if(Math.abs(x)<R&&Math.abs(y)<R) near=true; }
      if(!near||P.length<3) continue;
      // 3D terrain: stand it on the ground where the map does (the terrain height at its middle), kept absolute so it stays put as you drive
      let el=0; if(terrainOn){ try{ el=(map.queryTerrainElevation([cx/P.length,cy/P.length])||0)+e0; }catch(e){} }
      const base=pos.length/3;
      for(const q of P){ pos.push(q.x,h0+el,-q.y, q.x,h+el,-q.y); }                              // a floor and a top point per corner
      for(let i=0;i<P.length;i++){ const j=(i+1)%P.length, a=base+2*i, b=base+2*j; idx.push(a,b,a+1, b,b+1,a+1); }   // walls
      let tri=[]; try{ tri=THREE.ShapeUtils.triangulateShape(P,[]); }catch(e){}
      for(const t of tri) idx.push(base+2*t[0]+1,base+2*t[1]+1,base+2*t[2]+1); } }                       // top
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); geo.setIndex(idx);
  if(!OCC.mesh){ OCC.mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({colorWrite:false,side:THREE.DoubleSide})); OCC.mesh.renderOrder=-10; OCC.mesh.frustumCulled=false; scene.add(OCC.mesh); }
  else { OCC.mesh.geometry.dispose(); OCC.mesh.geometry=geo; }
  OCC.o=[ox,oy]; }
function placeOcc(px,py,m,b){
  if(!(T.on&&mode!=='glider')){ if(OCC.mesh) OCC.mesh.visible=false; return; }
  const moved=OCC.at?meters(OCC.at[1],OCC.at[0],S.lat,S.lng):1e9, age=performance.now()-OCC.t;
  if(moved>180||OCC.ter!==terrainOn||(OCC.dirty&&age>(POWER?6000:3000))||(!OCC.mesh&&age>1500)) safe('building blockers',buildOcc);
  const M=OCC.mesh; if(!M||!OCC.o) return; M.visible=true;
  const dx=OCC.o[0]-px, dy=OCC.o[1]-py, sb=Math.sin(b), cb=Math.cos(b), e=terrainOn?(map.transform.elevation||0):0;
  M.position.set((dx*cb-dy*sb)/m,-e/m,-(dx*sb+dy*cb)/m); M.rotation.set(0,b,0); M.scale.setScalar(1/m); }

/* ---------- per-frame update + placement in the car layer (called from js/game.js) ---------- */
let occT=0;
function frame(dt){
  if(!T.group) return false;
  if(!T.on||mode==='glider'||!T.segs.length){ if(OCC.mesh) OCC.mesh.visible=false; if(T.group.visible){ T.group.visible=false; return true; } return false; }
  T.group.visible=true;
  const px=S.lng*MLNG, py=S.lat*MLAT, ph=rad(S.hdg), pv=S.v*SPEEDUP, m=mpp(S.lat,S.zoom), b=rad(S.camB), sb=Math.sin(b), cb=Math.cos(b);
  placeOcc(px,py,m,b);
  // camera ground position and height (same geometry as the game's camera), for the building check
  const H=innerHeight, dist=.5*H/Math.tan(rad(camera.fov)/2)*m, tp=rad(map.getPitch()), CE=window.COCKPIT&&COCKPIT.on&&COCKPIT.eyeWorld;   // cockpit: the camera is at the driver's eye
  const camX=CE?CE.x:px-sb*dist*Math.sin(tp), camY=CE?CE.y:py-cb*dist*Math.sin(tp), camH=CE?CE.h:dist*Math.cos(tp);
  const now=performance.now(), doOcc=now-occT>(POWER?600:250); if(doOcc) occT=now;
  const sc=EXAG/m, night=tailOff.color.r>.7;
  T.parts.tail.color.setHex(night?0xd01c24:0x8a1216); T.parts.head.color.setHex(night?0xfffbe0:0xe8ecf2);
  let any=false;
  while(T.agents.length<MAXCARS()){ const a={mesh:carMesh()}; T.agents.push(a); if(!spawn(a,60,420)) a.path=null; }
  while(T.agents.length>MAXCARS()){ const a=T.agents.pop(); T.group.remove(a.mesh); }
  for(const a of T.agents){
    if(!a.path){ if(!spawn(a,180,420)){ a.mesh.visible=false; continue; } }
    if(!drive(a,dt,px,py,pv,ph)||Math.hypot(a.px-px,a.py-py)>560){ a.path=null; a.mesh.visible=false; continue; }
    if(doOcc) a.occ=hiddenByBuilding(a,camX,camY,camH);
    const g=a.mesh; g.visible=!a.occ; if(a.occ) continue;
    const dx=a.px-px, dy=a.py-py, f=dx*sb+dy*cb, r=dx*cb-dy*sb;          // metres ahead / to the right of the camera's view
    a.fade=Math.min(1,(a.fade||0)+dt*2.5); const out=Math.max(0,Math.min(1,(a.endIn-1)/14));   // fading out as its road runs out
    g.position.set(r/m,0,-f/m); g.scale.setScalar(sc*a.fade*out); g.rotation.y=-(a.hd-b);
    // wheels roll with the distance driven; front wheels steer from how fast the car is turning (same bicycle model as yours)
    const u=g.userData, yaw=a.prevHd==null?0:Math.atan2(Math.sin(a.hd-a.prevHd),Math.cos(a.hd-a.prevHd))/Math.max(dt,1e-3); a.prevHd=a.hd;
    u.spin-=a.v/SPEEDUP*dt/u.r; const st=a.v>.5?Math.max(-.55,Math.min(.55,Math.atan(yaw*u.wb/a.v))):u.steer; u.steer+=(st-u.steer)*Math.min(1,dt*6);
    for(const w of u.wheels) w.rotation.x=u.spin; for(const p of u.fronts) p.rotation.y=-u.steer;
    any=true;
  }
  return any;
}

onReady(function trafficInit(){
  T.parts=makeParts(); T.group=new THREE.Group(); scene.add(T.group);
  map.on('sourcedata',e=>{ if(e.sourceId===bSrc&&e.tile){ T.tilesDirty=true; OCC.dirty=true; } else if(e.sourceId==='roofs'||e.sourceId==='rebuilt') OCC.dirty=true; });
});
// rebuild the road graph as you drive into new map tiles
onTick(1500,function trafficGraph(){
  if(!T.on||!T.parts||mode==='glider') return;
  const moved=T.builtAt?meters(T.builtAt[1],T.builtAt[0],S.lat,S.lng):1e9, age=performance.now()-T.builtT;
  if(moved>350||(T.tilesDirty&&age>(POWER?8000:4000))) safe('traffic graph',build);
  else if(YD.OX&&YD.OX.at!==T.oxAt&&T.segs.length) safe('traffic signs',markControls);   // new stop/light data: attach it now
});
function setOn(on){ T.on=on; try{ localStorage.setItem('ydTraffic',on?'1':'0'); }catch(e){}
  if(!on){ for(const a of T.agents){ T.group&&T.group.remove(a.mesh); } T.agents.length=0; } else T.builtAt=null;
  const b=document.getElementById('trafficBtn'); if(b) b.classList.toggle('on',on); dirty=true; }
const btn=document.getElementById('trafficBtn');
if(btn){ btn.classList.toggle('on',T.on); btn.addEventListener('click',e=>{ e.stopPropagation(); setOn(!T.on); }); }
// the same test from the map data: walk from the car toward the camera; a building footprint on the way that is taller
// than the line of sight there hides it
function hiddenGeo(a,camX,camY,camH){ const dx=camX-a.px, dy=camY-a.py, D=Math.hypot(dx,dy)||1, ux=dx/D, uy=dy/D;
  for(let s=4;s<Math.min(D,260);s+=7){ const qx=a.px+ux*s, qy=a.py+uy*s, lng=qx/MLNG, lat=qy/MLAT, line=1+(camH-1)*s/D;
    for(const f of geoBlocks(lng,lat)){ const pr=f.properties||{}, h=+(pr.render_height??pr.height??6)||6; if(h>line&&contains(f.geometry,lng,lat)) return true; } }
  return false; }
window.TRAFFIC={occMesh:()=>OCC.mesh,rescale:(r)=>{ for(const sg of T.segs||[]) sg.v*=r; for(const a of T.agents||[]) a.v*=r; },hidden:(o,x,y,h)=>{ try{ return hiddenByBuilding(o,x,y,h); }catch(e){ return false; } }, frame:(dt)=>{ try{ return frame(dt); }catch(e){ console.warn('traffic',e); return false; } }, state:T, setOn};
})();
