/* The snow plow (tools/make-snowplow.py, CARS.snowplow in js/game.js).
   - Amber lights (materials Beacon and BeaconB) flash in turn while the engine runs, like a real plow's strobes.
   - The blade turns (owner 2026-11-23: "make the plow blade in the middle of the truck and … able to turn the plow blade
     with a button"): the model's node PlowBlade swings about its pivot, up to 32° either way. Hold ◀ / ▶ on the screen
     (or Z / X; tap for a small step), N or the middle button straightens it; on the G29 the red dial turns it while you're
     in the plow (it skips songs in the other cars); by voice, "angle the plow left / right", "straighten the plow".
     Angled right = the left end leads and the snow goes off to the right (the curb), and the other way round.
   - Snow (owner: "step up your game"): when it's snowing (real weather or ⚙️ Weather) and the plow is moving, snow curls
     off the trailing end of the blade and sprays out to that side, more the faster you go; a straight blade throws a
     little to both sides.
   - The rubber deflector on top of the blade (owner: "can you make the top black part dangle?"): the node 'Deflector',
     hinged along the blade's top edge, hangs a little forward when parked, swings forward when you brake and back when you
     pull away, is blown back more the faster you go, and flutters — a damped spring.
   - Up and down (owner 2026-11-23: "can you make the plow able to go up and down?"): the blade lifts 32 cm on its ram
     (▲▼ on the screen, U, or "raise / lower the plow"); raised, it doesn't throw snow or clear the road.
   - The wing plow (owner 2026-11-23: "make it so I can put down the side plows"): the long side blade folded up along the
     driver's side swings down and out beside the truck (about 3 s; "Wing" button, J, or "lower / raise the wing"); down,
     it throws snow off its rear end and clears a second lane beside the truck.
   - Salt (owner 2026-11-23: "turn on the salt in the back and leave grains of salt on the roads"): "Salt" button, Y, or
     "turn on the salt": while the engine runs and the truck moves, the spinner at the back spins and flings salt out
     behind in a fan, and the road it covers is left speckled with grains (and wet and dark where there's snow; js/enh/
     snowcover.js draws that).
   window.PLOW = {turn(dir), step(dir), straight(), lift(up?), wing(down?), salt(on?), salting, wingDown, angle (degrees, + = snow to the right), down, flap} */
(()=>{
'use strict';
const isPlow=()=>typeof CARKEY!=='undefined'&&CARKEY==='snowplow';
const say=(m,ms)=>{ if(typeof toast==='function') toast(m,ms||1400); };
const MAXA=32, RATE=34;                                         // degrees, degrees a second
let ang=0, want=0, hold=0, up=0, upWant=0, wg=0, wgWant=0, saltOn=false;         // wg: 0 folded up … 1 down and out                      // up: 0 down … 1 raised                                      // ang: + = left end ahead, snow off to the right
try{ saltOn=localStorage.getItem('ydPlowSalt')==='1'; upWant=up=localStorage.getItem('ydPlowUp')==='1'?1:0; wgWant=wg=localStorage.getItem('ydPlowWing')==='1'?1:0; }catch(e){}
try{ const v=+localStorage.getItem('ydPlowAng'); if(isFinite(v)) ang=want=Math.max(-MAXA,Math.min(MAXA,v)); }catch(e){}
const save=()=>{ try{ localStorage.setItem('ydPlowAng',String(Math.round(want))); }catch(e){} };

// ---------- flashing lights ----------
let A=null, B=null, was=null;
setInterval(()=>{
  const M=typeof MODELS!=='undefined'&&MODELS.snowplow; if(!M) return;
  if(!A){ for(const m of M.mats||[]){ if(m.name==='Beacon') A=m; else if(m.name==='BeaconB') B=m; } if(!A) return; }
  const on=isPlow()&&!!(window.IGN&&(IGN.state==='on'||IGN.state==='crank'));
  const ph=on?(Math.floor(performance.now()/260)%4):-1;           // A A B B
  const key=ph<0?'off':ph<2?'a':'b'; if(key===was) return; was=key;
  for(const [m,lit] of [[A,key==='a'],[B,key==='b']]) if(m&&m.emissive) m.emissive.setRGB(lit?2.6:0,lit?1.1:0,lit?.05:0);
  if(typeof dirty!=='undefined') dirty=true;
},60);

// ---------- turning the blade ----------
function turn(dir){ hold=dir; }                                  // hold: -1 left, 1 right, 0 stop
function step(dir){ want=Math.max(-MAXA,Math.min(MAXA,Math.round((want+dir*8)/4)*4)); save(); }
function straight(){ want=0; hold=0; save(); }
function lift(u){ upWant=u==null?(upWant?0:1):(u?1:0); try{ localStorage.setItem('ydPlowUp',upWant?'1':'0'); }catch(e){} return upWant; }
const LIFT=.32, RAM0=[0,1.28,3.86];
function salt(on){ saltOn=on==null?!saltOn:!!on; try{ localStorage.setItem('ydPlowSalt',saltOn?'1':'0'); }catch(e){} return saltOn; }
const salting=()=>saltOn&&isPlow()&&mode==='car'&&!!(window.IGN&&IGN.state==='on')&&Math.abs((typeof S!=='undefined'&&S.v)||0)>.8;
function wing(d){ wgWant=d==null?(wgWant?0:1):(d?1:0); try{ localStorage.setItem('ydPlowWing',wgWant?'1':'0'); }catch(e){} return wgWant; }
// the wing's two positions (model metres): folded (as built) and down beside the truck, angled back ~45°
const MX=1.30, MZ=.40, WA=[MX+.16,2.55,MZ-.12], WB=[MX+.42,.62,-2.30];
const WL=Math.hypot(WB[0]-WA[0],WB[1]-WA[1],WB[2]-WA[2]), PF=[MX+.32,.48,MZ-.12];
let W0=null, W1=null, Wn=null, WR=null, WBr=null;
function wingPoses(){ const V=THREE.Vector3, d1=new V(2.15,-.02,-2.05).normalize();
  const basis=(fwd,side)=>{ const z=fwd.clone().negate().normalize(), x=side.clone().sub(z.clone().multiplyScalar(side.dot(z))).normalize(), y=new V().crossVectors(z,x);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z)); };
  W0={p:new V(...WA),q:Wn.quaternion.clone(),d:new V(WB[0]-WA[0],WB[1]-WA[1],WB[2]-WA[2]).normalize()};
  W1={p:new V(...PF),q:basis(d1,new V(.75,0,.66)),d:d1}; }
const BW=3.70, PIV=[0,.42,4.00], C0=[0,.08-.42,.62];          // blade width; pivot; blade centre seen from the pivot (model metres)

// ---------- snow spray and the dangling deflector ----------
const N=700, P=new Float32Array(N*3), V=new Float32Array(N*3), L=new Float32Array(N);
let pts=null, emit=0, WS=null, last=0, D=null, Bn=null, Rm=null, Sp=null, spinA=0, salts=null, sEmit=0, base=null, th=.12, w=0, vPrev=0, gust=0, gT=0;
function make(g){ const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(P,3));
  const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'), gr=x.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.45,'rgba(250,252,255,.85)'); gr.addColorStop(1,'rgba(240,246,255,0)'); x.fillStyle=gr; x.fillRect(0,0,64,64);
  const mat=new THREE.PointsMaterial({color:0xffffff,map:new THREE.CanvasTexture(c),size:.42,sizeAttenuation:true,transparent:true,opacity:.95,depthWrite:false});   // soft round flakes
  pts=new THREE.Points(geo,mat); pts.frustumCulled=false; pts.name='PlowSpray'; for(let i=0;i<N;i++){ L[i]=0; P[i*3+1]=-50; } g.add(pts); WS=new THREE.Vector3(); }
function snowing(){ const W=window.YD&&YD.AT&&YD.AT.wx; return !!(W&&W.type==='snow'); }
// a point on the blade (u -1 right end … 1 left end, from its centre), in the model's metres, with the blade turned
function onBlade(u,y){ const a=ang*Math.PI/180, lx=C0[0]+u*BW/2, lz=C0[2];
  return [PIV[0]+lx*Math.cos(a)-lz*Math.sin(a), y, PIV[2]+lx*Math.sin(a)+lz*Math.cos(a)]; }   // the node turns by -ang about y

function frame(now){
  requestAnimationFrame(frame);
  const M=typeof MODELS!=='undefined'&&MODELS.snowplow; if(!M||!M.g||!window.THREE) return;
  if(!pts) make(M.g);
  const raw=(now-last)/1000||0, dt=Math.min(.05,raw), dtB=Math.min(1,raw); last=now; if(!dt) return;   // the blade keeps real time even when frames are slow
  // the blade: follow the buttons, ease to where it's going
  if(hold){ want=Math.max(-MAXA,Math.min(MAXA,want+hold*RATE*dtB)); }
  const prevA=ang; ang+=Math.max(-RATE*dtB,Math.min(RATE*dtB,want-ang));
  if(!Bn){ Bn=M.g.getObjectByName('PlowBlade'); if(Bn) Bn.userData.y0=Bn.position.y; Rm=M.g.getObjectByName('LiftRam');
    Wn=M.g.getObjectByName('WingPlow'); WR=M.g.getObjectByName('WingRam'); WBr=M.g.getObjectByName('WingBrace'); if(Wn) wingPoses(); }
  up+=Math.max(-dtB/1.4,Math.min(dtB/1.4,upWant-up));            // about 1.4 s up or down
  // the wing: ease between its two poses; its ram and brace follow
  const wPrev=wg; wg+=Math.max(-dtB/3,Math.min(dtB/3,wgWant-wg));
  if(Wn&&W0&&(wg!==wPrev||!Wn.userData.done)){ Wn.userData.done=true; const e=wg*wg*(3-2*wg);
    Wn.position.lerpVectors(W0.p,W1.p,e); Wn.quaternion.copy(W0.q).slerp(W1.q,e);
    const dir=W0.d.clone().lerp(W1.d,e).normalize(), at=k=>Wn.position.clone().add(dir.clone().multiplyScalar(k));
    for(const [n,from,to] of [[WR,[MX,2.30,MZ],at(.6)],[WBr,[MX+.05,.78,-1.90],at(WL-.3)]]) if(n){ const v=new THREE.Vector3(to.x-from[0],to.y-from[1],to.z-from[2]), L=v.length();
      n.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),v.normalize()); n.scale.set(1,1,Math.max(.05,L)); }
    if(typeof dirty!=='undefined') dirty=true; }
  if(Bn&&(Bn.userData.a!==ang||Bn.userData.u!==up)){ Bn.rotation.set(-up*.10,-ang*Math.PI/180,0,'YXZ'); Bn.position.y=Bn.userData.y0+up*LIFT;   // tips back a little as it rises
    Bn.userData.a=ang; Bn.userData.u=up; if(typeof dirty!=='undefined') dirty=true;
    if(Rm){ const tx=PIV[0], ty=PIV[1]+.78+up*LIFT, tz=PIV[2], d=new THREE.Vector3(tx-RAM0[0],ty-RAM0[1],tz-RAM0[2]), L=d.length();   // the ram reaches the post top
      Rm.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),d.normalize()); Rm.scale.set(1,1,Math.max(.05,L)); } }
  if(ang!==prevA&&isPlow()&&window.SOUND&&SOUND.click&&Math.floor(now/180)!==Math.floor((now-dt*1000)/180)) try{ SOUND.click(); }catch(e){}
  // snow off the trailing end(s)
  const v=Math.abs((typeof S!=='undefined'&&S.v)||0), mph=v*2.237;
  const active=isPlow()&&mode==='car'&&snowing()&&S.v>.8&&up<.2;   // a raised blade throws nothing
  const sides=Math.abs(ang)<6?[-1,1]:[ang>0?-1:1];               // which end trails: + angle -> the right end (u = -1)
  if(wg>.95&&active) sides.push(2);                               // 2: the wing's rear end
  let alive=false; if(active) emit+=dt*Math.min(1400,mph*34)*(sides.length>1?.6:1);
  for(let i=0;i<N;i++){
    if(L[i]<=0&&active&&emit>=1){ emit-=1; const k=i*3, sd0=sides[i%sides.length], wingEnd=sd0===2, sd=wingEnd?1:sd0, s=Math.min(1.6,.4+mph/28), u=sd*(.72+Math.random()*.28);
      const p=wingEnd&&W1?[W1.p.x+W1.d.x*WL*(.75+Math.random()*.25),.15+Math.random()*.4,W1.p.z+W1.d.z*WL*(.75+Math.random()*.25)]:onBlade(u,.12+Math.random()*.6);
      P[k]=p[0]; P[k+1]=p[1]; P[k+2]=p[2];
      V[k]=sd*(3.5+Math.random()*4.5)*s;                                       // out past that end (+x is the truck's left)
      V[k+1]=(2.2+Math.random()*3.2)*s; V[k+2]=(Math.random()*1.6-.1)*s;
      L[i]=.9+Math.random()*.9; }
    if(L[i]>0){ alive=true; const k=i*3; L[i]-=dt; V[k+1]-=9.8*.55*dt; V[k]*=1-dt*.9; V[k+2]-=v*.25*dt;
      P[k]+=V[k]*dt; P[k+1]+=V[k+1]*dt; P[k+2]+=V[k+2]*dt; if(P[k+1]<.02){ P[k+1]=.02; V[k+1]=0; V[k]*=.6; }
      if(L[i]<=0) P[k+1]=-50; }
  }
  if(alive||active){ M.g.getWorldScale(WS); pts.material.size=.42*WS.x;            // the world is scaled (~15 units a metre)
    pts.geometry.attributes.position.needsUpdate=true; if(typeof dirty!=='undefined') dirty=true; }
  if(emit>40) emit=40;
  // the deflector: hinged along the blade's length (its local x)
  if(!D){ D=M.g.getObjectByName('Deflector'); if(D){ base=D.quaternion.clone(); D.userData.ax=new THREE.Vector3(1,0,0); } }
  if(D){ const here=isPlow(), sv=here?((typeof S!=='undefined'&&S.v)||0):0, acc=Math.max(-8,Math.min(8,(sv-vPrev)/dt)); vPrev=sv;
    if(now>gT){ gT=now+120+Math.random()*260; gust=(Math.random()*2-1)*Math.min(1,mph/25); }      // buffeting
    const target=.12-.55*Math.pow(Math.min(1,Math.abs(sv)*2.237/40),1.4)*Math.sign(sv||1);      // hangs forward; the wind lays it back
    w+=(60*(target-th)-3.2*w-acc*.55+gust*14)*dt; th+=w*dt; th=Math.max(-.9,Math.min(.6,th));  // braking swings it forward
    D.quaternion.copy(base).multiply(new THREE.Quaternion().setFromAxisAngle(D.userData.ax,th));
    if(here&&(Math.abs(w)>.01||Math.abs(sv)>.5)&&typeof dirty!=='undefined') dirty=true; }
}
requestAnimationFrame(frame);

// ---------- salt: the spinner turns and flings grains out behind in a fan ----------
const SN=500, SP=new Float32Array(SN*3), SV=new Float32Array(SN*3), SL=new Float32Array(SN), SPIN=[0,.585,-3.74];
let sLast=0;
function saltFrame(now){
  requestAnimationFrame(saltFrame);
  const M=typeof MODELS!=='undefined'&&MODELS.snowplow; if(!M||!M.g||!window.THREE||!WS) return;
  const dt=Math.min(.05,(now-sLast)/1000||0); sLast=now; if(!dt) return;
  if(!Sp) Sp=M.g.getObjectByName('Spinner');
  if(!salts){ const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(SP,3));
    salts=new THREE.Points(geo,new THREE.PointsMaterial({color:0xece6da,size:.09,sizeAttenuation:true,transparent:true,opacity:.95,depthWrite:false}));
    salts.frustumCulled=false; for(let i=0;i<SN;i++){ SL[i]=0; SP[i*3+1]=-50; } M.g.add(salts); }
  const on=salting(); let alive=false;
  if(Sp&&on){ spinA+=dt*28; Sp.rotation.y=spinA; }
  if(on) sEmit+=dt*420;
  for(let i=0;i<SN;i++){
    if(SL[i]<=0&&on&&sEmit>=1){ sEmit-=1; const k=i*3, a=Math.PI+(Math.random()*2-1)*1.9, sp=4+Math.random()*5;   // a fan behind (-z), ~110° each way
      SP[k]=SPIN[0]; SP[k+1]=SPIN[1]+.05; SP[k+2]=SPIN[2]; SV[k]=Math.sin(a)*sp; SV[k+1]=.6+Math.random()*1.2; SV[k+2]=Math.cos(a)*sp; SL[i]=.35+Math.random()*.35; }
    if(SL[i]>0){ alive=true; const k=i*3; SL[i]-=dt; SV[k+1]-=9.8*dt; SP[k]+=SV[k]*dt; SP[k+1]+=SV[k+1]*dt; SP[k+2]+=SV[k+2]*dt;
      if(SP[k+1]<.02){ SP[k+1]=.02; SV[k]*=.3; SV[k+2]*=.3; SV[k+1]=0; } if(SL[i]<=0) SP[k+1]=-50; } }
  if(sEmit>30) sEmit=30;
  if(alive||on){ salts.material.size=.09*WS.x; salts.geometry.attributes.position.needsUpdate=true; if(typeof dirty!=='undefined') dirty=true; }
}
requestAnimationFrame(saltFrame);

// ---------- buttons on the screen (only in the plow) and keys ----------
const css=document.createElement('style'); css.textContent='#plowBtns{position:absolute;left:var(--gap,10px);bottom:calc(var(--gap,10px) + 222px);z-index:31;display:none;gap:6px;align-items:center;flex-wrap:wrap;max-width:min(60vw,420px)}'+
  '#plowBtns.on{display:flex}#plowBtns button{width:46px;height:40px;border:0;border-radius:12px;background:rgba(20,26,38,.86);color:#fff;font:700 15px system-ui;box-shadow:0 2px 8px rgba(0,0,0,.35);touch-action:none}'+
  '#plowBtns button:active{background:#2563eb}#plowBtns b{min-width:62px;text-align:center;color:#fff;font:600 12px system-ui;text-shadow:0 1px 3px #000}';
document.head.appendChild(css);
const box=document.createElement('div'); box.id='plowBtns';
box.innerHTML='<button data-d="-1" aria-label="Angle the plow left">◀</button><b id="plowAng">Plow ⟂</b><button data-d="1" aria-label="Angle the plow right">▶</button><button id="plowUp" aria-label="Raise or lower the plow">▲</button><button id="plowWing" aria-label="Wing plow down or up" style="width:auto;padding:0 10px;font-size:13px">Wing ▼</button><button id="plowSalt" aria-label="Salt on or off" style="width:auto;padding:0 10px;font-size:13px">🧂 Salt</button>';
document.body.appendChild(box);
for(const b of box.querySelectorAll('button[data-d]')){ const d=+b.dataset.d; let t0=0;
  b.addEventListener('pointerdown',e=>{ e.stopPropagation(); e.preventDefault(); t0=performance.now(); turn(d); });
  const up=e=>{ if(!t0) return; e&&e.stopPropagation(); if(performance.now()-t0<220) step(d); turn(0); t0=0; save(); };
  b.addEventListener('pointerup',up); b.addEventListener('pointerleave',up); b.addEventListener('pointercancel',up); }
box.querySelector('b').addEventListener('click',e=>{ e.stopPropagation(); straight(); say('Plow straight'); });
document.getElementById('plowUp').addEventListener('click',e=>{ e.stopPropagation(); say(lift()?'Plow up':'Plow down'); });
document.getElementById('plowWing').addEventListener('click',e=>{ e.stopPropagation(); say(wing()?'Wing plow down':'Wing plow up'); });
document.getElementById('plowSalt').addEventListener('click',e=>{ e.stopPropagation(); say(salt()?'Salt on':'Salt off'); });
box.addEventListener('pointerdown',e=>e.stopPropagation());
setInterval(()=>{ const on=isPlow()&&mode==='car'; box.classList.toggle('on',on);
  document.getElementById('plowWing').textContent=wgWant?'Wing ▲':'Wing ▼';
  const sb=document.getElementById('plowSalt'); sb.textContent=saltOn?'🧂 Salt on':'🧂 Salt'; sb.style.background=saltOn?'#16a34a':'';
  document.getElementById('plowUp').textContent=upWant?'▼':'▲'; document.getElementById('plowUp').title=upWant?'Lower the plow':'Raise the plow';
  const r=Math.round(want); document.getElementById('plowAng').textContent=Math.abs(r)<2?'Plow ⟂':r>0?'Plow '+r+'° ▶':'◀ Plow '+(-r)+'°'; },150);
const KEYS={KeyZ:-1,KeyX:1};
addEventListener('keydown',e=>{ if(!isPlow()||e.repeat||/INPUT|TEXTAREA/.test((e.target&&e.target.tagName)||'')) return;
  if(KEYS[e.code]) turn(KEYS[e.code]); else if(e.code==='KeyU') say(lift()?'Plow up':'Plow down'); else if(e.code==='KeyJ') say(wing()?'Wing plow down':'Wing plow up'); else if(e.code==='KeyY') say(salt()?'Salt on':'Salt off'); });
addEventListener('keyup',e=>{ if(KEYS[e.code]&&hold===KEYS[e.code]){ turn(0); save(); } });

window.PLOW={turn,step,straight,lift,wing,salt,get salting(){ return salting(); },get wingDown(){ return wg>.95; },get wingPos(){ return wg; },get down(){ return up<.2; },get angle(){ return ang; },get flap(){ return th; }};
})();
