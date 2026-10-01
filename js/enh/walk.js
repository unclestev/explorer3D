/* On foot: get out of the car and walk or run around as a person, then get back in.
   🚶 button (or F key) gets out when you're stopped (not on the water, in the air or during a police chase); the car,
   tractor or photo car stays parked where you left it, engine off. On foot the same controls drive the person:
   steering turns (on the spot too), GAS walks — press higher up the pedal to jog and run — and BRAKE steps back.
   Buildings and water stop you (you don't plow through like the car). The button turns into 🚗 and lights up green
   when you're close enough to get back in; the HUD says where the car is when you've wandered off. You can also take
   off in the hang glider on foot; landing puts you back on foot, with the car still where you parked it.
   Movement uses the same 3x world speed-up as driving, so the mph and miles on foot agree with the rest of the game.
   The person is a simple original 3D figure drawn in the car layer at the same exaggerated scale as the car (EXAG). */
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
  const p=map.project([lng,lat]); return hit(p.x,p.y,6,blockIds).some(f=>contains(f.geometry,lng,lat)); }
function inWater(lat,lng){
  if(!inAny(landCache.water,lng,lat)) return false;
  const p=map.project([lng,lat]); return !hit(p.x,p.y,5,bridgeIds).length; }
const vehName=()=>PK.mode==='tractor'?'tractor':PK.mode==='boat'?'boat':(CARSPEC&&CARSPEC.name?CARSPEC.name.replace(/^\S+\s/,''):'car');
const reach=()=>4.2*EXAG;                                          // close enough to get in (world metres, car drawn EXAG x)
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
  const h=rad(S.hdg), half=(mode==='tractor'?1.15:((CARSPEC&&CARSPEC.W)||2.35)/2)*EXAG, side=half+.55*EXAG, end=3.4*EXAG;
  const spots=[[-side,0],[side,0],[0,-end],[0,end]];
  let at=offsetPt(S.lat,S.lng,h,spots[0][0],spots[0][1]);
  for(const [r,f] of spots){ const p=offsetPt(S.lat,S.lng,h,r,f); if(!safe('walk spot',()=>inBuilding(p[0],p[1])||inWater(p[0],p[1]))){ at=p; break; } }
  S.lat=at[0]; S.lng=at[1]; S.v=0; S.steer=0; S.roll=S.pitch=0;
  Object.assign(W,{v:0,phase:0,amp:0,run:0,near:true});
  setMode('walk');
  step.cam=null; step.mph=-1; dirty=true;
  toast('On foot: steer to turn · WALK to walk, press higher to run · tap 🚗 by the '+vehName()+' to get back in',4500);
}
function getIn(){
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
addEventListener('keydown',e=>{ if(!e.repeat&&e.key.toLowerCase()==='f'&&!(e.target&&e.target.tagName==='INPUT')) safe('walk',getOut); });

// mode changes (here, the glider, anything else): show/hide the person, relabel the pedals and the button
const prevMode=window.onModeChange;
window.onModeChange=(m,was)=>{ if(prevMode) prevMode(m,was);
  person.visible=(m==='walk'); setPedals(m==='walk'||m==='glider'&&!!PK.mode);
  if(m!=='walk'&&m!=='glider') PK.mode=null;                       // back in a vehicle
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
  if(dm){
    const n=offsetPt(S.lat,S.lng,h,0,dm), probe=offsetPt(n[0],n[1],h,0,Math.sign(dm)*.3*EXAG);
    if(!landCache.at||every('landcache',3)||meters(landCache.at[1],landCache.at[0],S.lat,S.lng)>400) safe('land',rebuildLandCache);
    const block=safe('walk block',()=>(inBuilding(probe[0],probe[1])&&!inBuilding(S.lat,S.lng))||(inWater(probe[0],probe[1])&&!inWater(S.lat,S.lng)));
    if(block){ W.v=0; if(now-W.blockT>4000){ W.blockT=now; toast(inAny(landCache.water,probe[1],probe[0])?"Water ahead: you can't swim here":'A building is in the way',1600); } }
    else { S.lat=n[0]; S.lng=n[1]; }
  }
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
  if(every('compass',POWER?.12:.05)) updateCompass();
  if(every('towers',5) && !towerBusy && towerAt && meters(towerAt[1],towerAt[0],S.lat,S.lng)>15000) loadTowers();
  if(every('decor',.5) && styleReady && (!decorAt || meters(decorAt[1],decorAt[0],S.lat,S.lng)>250)) buildDecor();
  if(every('walkhud',.3)){
    if(styleReady){ const p=map.project([S.lng,S.lat]), f=hitRoad(p.x,p.y,8);
      const nm=f&&f.find(x=>x.properties&&x.properties.name); roadName=nm?nm.properties.name:'';
      roadEl.textContent=nm?'On foot · '+roadName:'On foot'; roadEl.className=''; }
    const st2=Math.abs(W.v)<.05?'Standing':W.v<0?'Stepping back':W.run>.6?'Running':W.run>.15?'Jogging':'Walking';
    if(st2!==step.surf){ step.surf=st2; surfEl.textContent=st2; surfEl.style.color=''; }
    const c=carInfo(); W.near=c.d<=reach();
    nearEl.textContent=W.near?'Tap 🚗 to get back in':(PK.mode==='tractor'?'🚜':'🚗')+' Your '+vehName()+': '+c.dist+' '+c.where;
    step.near=null; updateBtn();
  }

  // camera: closer than driving, follows where you face
  const dB=((S.hdg+LOOK.yaw-S.camB+540)%360)-180; S.camB+=dB*(1-Math.exp(-dt*4));
  const tz=Math.min(22,20.5+zoomOff); S.zoom+=(tz-S.zoom)*Math.min(1,dt*2.5);
  const Wd=innerWidth,H=innerHeight,padTop=H*.34, cm0=step.cam||{}, PIT=viewPitch(68);
  const camMoved=dirty||Wd!==cm0.W||H!==cm0.H||PIT!==cm0.p||Math.abs(S.lng-cm0.lng)>1e-8||Math.abs(S.lat-cm0.lat)>1e-8||Math.abs(S.camB-cm0.b)>.005||Math.abs(S.zoom-cm0.z)>.0003;
  if(camMoved){ step.cam={lng:S.lng,lat:S.lat,b:S.camB,z:S.zoom,W:Wd,H,p:PIT};
    map.jumpTo({center:[S.lng,S.lat],bearing:S.camB,zoom:S.zoom,pitch:PIT,padding:{top:padTop,bottom:0,left:0,right:0}}); }
  if(Wd!==step.W||H!==step.H||PIT!==step.pit){ step.W=Wd; step.H=H; step.pit=PIT;
    renderer.setSize(Wd,H,false); camera.aspect=Wd/H; camera.setViewOffset(Wd,H,0,-padTop/2,Wd,H);
    aimCam3D(H,PIT); placeGlider(); }

  // car layer: you at the centre, the parked vehicle where you left it (same projection as the traffic)
  const m=mpp(S.lat,S.zoom), sc=EXAG/m, b=rad(S.camB), sb=Math.sin(b), cb=Math.cos(b);
  person.scale.setScalar(sc); person.rotation.y=-rad(S.hdg-S.camB);
  const dx=(PK.lng-S.lng)*111320*cosLat(), dy=(PK.lat-S.lat)*111320, f=dx*sb+dy*cb, r=dx*cb-dy*sb;
  car.visible=true; car.position.set(r/m,0,-f/m); car.scale.setScalar(sc); car.rotation.y=-(rad(PK.hdg)-b);
  body.rotation.set(0,0,0); tractorG.rotation.set(0,0,0); debris.scale.setScalar(sc);
  tails.forEach(t=>t.material=tailOff);
  placePhoto(false);
  setOrder(car.position.z>0&&Math.hypot(r,f)<12*EXAG?9:12);       // the car photo covers you only when it's nearer the camera
  const traffic=(window.TRAFFIC?TRAFFIC.frame(dt):false)|runFrameHooks(dt);
  const live=updateFx(dt,0,0);
  if(camMoved||anim||W.lastAnim||live>0||shake>0||traffic) renderer.render(scene,camera);
  W.lastAnim=anim; dirty=false;
  const mph=Math.round(Math.abs(W.v)*2.237); if(mph!==step.mph){ step.mph=mph; mphEl.textContent=mph; }
}
window.WALK={step:(dt,st,gas,now)=>{ try{ walkStep(dt,st,gas,now); }catch(e){ console.warn('walk',e); renderer.render(scene,camera); } },
  parked:()=>PK.mode, getOut:()=>safe('walk',getOut), state:W, person, parkedAt:PK};
updateBtn();
})();
