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

const CLASS_SPEED={motorway:65,trunk:55,primary:45,secondary:40,tertiary:35,minor:25};   // mph
const CLASS_WIDTH={motorway:14,trunk:12,primary:12,secondary:10,tertiary:10,minor:8};    // metres, same as roads.js
const PAINT=[0xf1f3f5,0x1f2328,0xaab2bb,0x6b7280,0xb91c1c,0x1d4ed8,0x1e3a8a,0x14532d,0xd6c7a1,0x7c2d12,0x0f766e];
const T={on:true,nodes:null,grid:null,segs:[],builtAt:null,builtT:0,tilesDirty:true,agents:[],group:null,parts:null,moved:false};
try{ T.on=localStorage.getItem('ydTraffic')!=='0'; }catch(e){}
const MAXCARS=()=>POWER?5:12;
const mph2w=m=>m/2.237*SPEEDUP;                                   // mph on the speedo -> world metres per second
const B=6*SPEEDUP, ACC=2.6*SPEEDUP;                               // planning braking / acceleration, world m/s^2

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
              const s={a,b,len:L,ux:dx/L,uy:dy/L,off:ow?0:w/4,v:mph2w(mph),cls,stop:false,sig:null}; a.out.push(s); segs.push(s); };
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
function light(ph){ const t=(Date.now()/1000)%30, a=t<12?'g':t<15?'y':'r', b=t<15?'r':t<27?'g':'y'; return ph===0?a:b; }

/* ---------- cars ---------- */
// vehicle designs live in js/enh/vehicles.js
function makeParts(){ return YD.VEH.mats(); }
function carMesh(){ const g=YD.VEH.build(shadow.material); g.visible=false; T.group.add(g); return g; }
function place(a,seg,s){ a.path=[seg]; a.s=s; a.v=seg.v*.6; a.stopDone=null; a.waitT=0;
  const p=pos(a); a.px=p[0]; a.py=p[1]; a.hd=Math.atan2(seg.ux,seg.uy); a.fade=0; }
function pos(a){ const s=a.path[0], cx=s.a.x+s.ux*a.s, cy=s.a.y+s.uy*a.s; return [cx+s.uy*s.off, cy-s.ux*s.off]; }   // right-hand side: normal (uy,-ux)
function spawn(a,minD,maxD){
  const px=S.lng*MLNG, py=S.lat*MLAT;
  for(let tries=0;tries<40;tries++){
    const s=T.segs[Math.floor(Math.random()*T.segs.length)]; if(!s) return false;
    const d=Math.hypot((s.a.x+s.b.x)/2-px,(s.a.y+s.b.y)/2-py); if(d<minD||d>maxD) continue;
    if(T.agents.some(o=>o!==a&&o.path&&Math.hypot(o.px-s.a.x,o.py-s.a.y)<25)) continue;
    place(a,s,Math.random()*s.len); a.f=.85+Math.random()*.2; return true; }
  return false;
}
function nextSeg(seg){
  let n=seg.b; if(n.out===undefined||!T.nodes||T.nodes[n.id]!==n){ n=nearNode(seg.b.x,seg.b.y,1.2); if(!n) return null; }   // graph was rebuilt
  let outs=n.out.filter(o=>Math.hypot(o.b.x-seg.a.x,o.b.y-seg.a.y)>.9);                          // no U-turns...
  if(!outs.length) return null;                                                                   // ...a dead end ends the trip
  const w=outs.map(o=>{ const c=o.ux*seg.ux+o.uy*seg.uy; return c>.87?5:c>-.2?1:.15; });         // mostly straight on
  let r=Math.random()*w.reduce((x,y)=>x+y,0); for(let i=0;i<outs.length;i++){ r-=w[i]; if(r<=0) return outs[i]; } return outs[0];
}
function turnCap(s1,s2){ const c=s1.ux*s2.ux+s1.uy*s2.uy; return c>.95?1e9:c>.7?mph2w(22):c>.2?mph2w(15):mph2w(10); }

function drive(a,dt,px,py,pv,ph){
  // plan the road ahead far enough to brake for anything on it
  const LA=Math.max(60,a.v*a.v/(2*B)+40);
  let ahead=a.path[0].len-a.s; for(let i=1;i<a.path.length;i++) ahead+=a.path[i].len;
  while(ahead<LA){ const n=nextSeg(a.path[a.path.length-1]); if(!n) break; a.path.push(n); ahead+=n.len; }
  const seg=a.path[0]; let allow=seg.v*a.f;
  let dist=seg.len-a.s;
  for(let i=0;i<a.path.length;i++){
    const s=a.path[i], nx=a.path[i+1], end=s.b;
    if(nx) allow=Math.min(allow,Math.sqrt(Math.pow(Math.min(turnCap(s,nx),nx.v*a.f),2)+2*B*Math.max(0,dist-3)));
    else allow=Math.min(allow,Math.sqrt(2*B*Math.max(0,dist-2)));   // road ends (edge of loaded map): stop, then respawn
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

/* ---------- per-frame update + placement in the car layer (called from js/game.js) ---------- */
let occT=0;
function frame(dt){
  if(!T.group) return false;
  if(!T.on||mode==='glider'||!T.segs.length){ if(T.group.visible){ T.group.visible=false; return true; } return false; }
  T.group.visible=true;
  const px=S.lng*MLNG, py=S.lat*MLAT, ph=rad(S.hdg), pv=S.v*SPEEDUP, m=mpp(S.lat,S.zoom), b=rad(S.camB), sb=Math.sin(b), cb=Math.cos(b);
  // camera ground position and height (same geometry as the game's camera), for the building check
  const H=innerHeight, dist=.5*H/Math.tan(rad(camera.fov)/2)*m, tp=rad(map.getPitch()), camX=px-sb*dist*Math.sin(tp), camY=py-cb*dist*Math.sin(tp), camH=dist*Math.cos(tp);
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
    a.fade=Math.min(1,(a.fade||0)+dt*2.5);
    g.position.set(r/m,0,-f/m); g.scale.setScalar(sc*a.fade); g.rotation.y=-(a.hd-b);
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
  map.on('sourcedata',e=>{ if(e.sourceId===bSrc&&e.tile) T.tilesDirty=true; });
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
window.TRAFFIC={frame:(dt)=>{ try{ return frame(dt); }catch(e){ console.warn('traffic',e); return false; } }, state:T, setOn};
})();
