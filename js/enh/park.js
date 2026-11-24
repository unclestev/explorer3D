/* Active Park Assist for the Explorer and the Expedition (owner 2026-11-23, a photo of the G29's PlayStation button and a
   video of the real Explorer's screen: "make the Explorer and Expedition use park assist with this button and make the
   self park and make me hold the button down. On the screen do whatever it is doing on the screen").
   1. Tap the PS button (or 0) while driving slowly: the centre screen shows "Perpendicular Park — Scanning. Use turn
      signal. Please drive forward" with the green arrow and the car sweeping for a space.
   2. After you've rolled forward ~8 m, a space is found on the side your turn signal points to (right if none): "Stop",
      then "Release brake to start. Hold Park Button".
   3. Hold the PS button (or 0, or the on-screen Ⓟ): the car pulls forward turning away from the space, then backs into it
      turning in, then straightens up — steering, gas and brake all by itself, at walking pace. The screen splits like the
      real one: a camera view on top (rear while reversing) with the 360° top view beside it, and below "Shift to Cancel /
      Attention / Check Surroundings" with the arrow — green the way it's moving, white while it waits. Let go and it
      stops; hold again to carry on. The gas pedal or steering cancels it; the brake pauses it.
   4. "Park Assist Complete". Tap the button again any time to cancel.
   js/game.js asks PARK.control(dt, your inputs) each frame while it's on; js/enh/cockpit.js draws PARK.draw on the
   centre screen. window.PARK = {active, state, start(), cancel(), control, draw} */
(()=>{
'use strict';
const say=(m,ms)=>{ if(typeof toast==='function') toast(m,ms||1800); };
const OK=()=>typeof CARKEY!=='undefined'&&(CARKEY==='explorer'||CARKEY==='expedition')&&typeof mode!=='undefined'&&mode==='car';
const angd=(a,b)=>((a-b+540)%360)-180;                             // a - b, -180..180
const R={state:'off',side:1,t0:0,start:null,dist:0,last:null,phase:'',h0:0,ht:0,pd:0,stuck:0,held:false,dir:0,msgT:0};

// ---------- the button: the G29's PS button (24), 0 on the keyboard, or Ⓟ on the screen ----------
let sHeld=false, prev=false;
// CTRL (js/enh/controls.js) knows the bindings: PS button (24) on the wheel, 0 on the keyboard, or whatever you set
const padHeld=()=>{ for(const g of navigator.getGamepads?navigator.getGamepads():[]) if(g&&g.connected&&g.buttons&&g.buttons[24]&&/wheel|g29|g923|g27|driving force|logitech/i.test(g.id)) return !!g.buttons[24].pressed; return false; };
const isKey=c=>((window.CTRL&&CTRL.DEFAULTS.keyboard.park)||['Digit0']).includes(c);
let kHeld=false;                                                   // keys straight from the event, so a quick tap never slips between polls
addEventListener('keydown',e=>{ if(!isKey(e.code)||e.repeat||/INPUT|TEXTAREA|SELECT/.test((e.target&&e.target.tagName)||'')) return; kHeld=true; if(!prev){ prev=true; press(); } });
addEventListener('keyup',e=>{ if(isKey(e.code)) kHeld=false; });
addEventListener('blur',()=>{ kHeld=false; });
function held(){ return sHeld||kHeld||(window.CTRL&&CTRL.held?CTRL.held('park'):padHeld()); }
// a tap starts or cancels; while a space is ready, holding drives
function press(){
  if(R.state==='off'){ start(); return; }
  if(R.state==='scan'||R.state==='done'||R.state==='cancel'){ cancel(R.state==='scan'?'Park Assist off':null); return; }
}
setInterval(()=>{ const p=held(); if(p&&!prev&&!sHeld) press(); prev=p; },40);

function start(){ if(!OK()){ say('Park Assist is in the Explorer and the Expedition',2200); return; }
  if(Math.abs(S.v)*2.237>12){ say('Slow down below 10 mph for Park Assist',2000); return; }
  if(window.AUTO&&AUTO.on) AUTO.takeover();
  Object.assign(R,{state:'scan',dist:0,last:[S.lng,S.lat],side:1,t0:performance.now()}); dirtyScreen(); }
function cancel(msg){ if(R.state==='off') return; R.state=msg?'cancel':'off'; R.msgT=performance.now(); if(msg) say('🅿️ '+msg,1800);
  if(msg) setTimeout(()=>{ if(R.state==='cancel'){ R.state='off'; dirtyScreen(); } },2500); dirtyScreen(); }
function dirtyScreen(){ if(typeof dirty!=='undefined') dirty=true; }

// ---------- finding a space ----------
// The painted stalls (js/enh/parking.js) are the spaces: while you drive past, the first empty one beside you on the
// signalled side that you've just passed is picked, and the car parks with its middle on that stall's middle, square
// to its lines. Where no stalls are drawn (no lot in the map here), a space the size of one is assumed beside you.
const SD=5.4;                                                      // stall depth (parking.js)
const kx=()=>111320*Math.cos(S.lat*Math.PI/180);
const toL=(lng,lat,c)=>[(lng-c.lng)*kx(),(lat-c.lat)*111320];    // metres east, north of c
const hv=d=>[Math.sin(d*Math.PI/180),Math.cos(d*Math.PI/180)];      // a compass heading as an east/north unit vector
function findStall(){ const list=window.PARKING&&PARKING.stalls||[], h=hv(S.hdg), sd=[h[1]*R.side,-h[0]*R.side];   // sd: toward the signalled side
  let best=null;
  for(const st of list){ const d=toL(st.lng,st.lat,{lng:S.lng,lat:S.lat}); if(Math.abs(d[0])>20||Math.abs(d[1])>20) continue;
    const iv=hv(st.into); if(iv[0]*sd[0]+iv[1]*sd[1]<.85) continue;    // opens toward the aisle you're in, square to you
    const lat=d[0]*sd[0]+d[1]*sd[1], along=d[0]*h[0]+d[1]*h[1];          // across to it, and how far ahead (- = passed)
    if(lat<5||lat>11||along>-.5||along<-6) continue;
    if(!best||along>best.along) best={lng:st.lng,lat:st.lat,into:st.into,along,real:true}; }
  return best; }
function fakeStall(){ const h=hv(S.hdg), sd=[h[1]*R.side,-h[0]*R.side], o=3.3+SD/2, b=-1.5;
  const e=sd[0]*o+h[0]*b, n=sd[1]*o+h[1]*b; return {lng:S.lng+e/kx(),lat:S.lat+n/111320,into:(S.hdg+R.side*90+360)%360,real:false}; }
setInterval(()=>{
  if(R.state==='off') return;
  if(!OK()){ cancel(null); return; }
  if(R.state==='scan'){
    if(window.SIG&&SIG.dir) R.side=SIG.dir>0?1:-1;                 // the turn signal picks the side
    const d=meters(R.last[1],R.last[0],S.lat,S.lng); R.last=[S.lng,S.lat]; if(S.v>.2) R.dist+=d;
    if(Math.abs(S.v)*2.237>14){ cancel('Too fast — Park Assist off'); return; }
    const hasStalls=!!(window.PARKING&&PARKING.stalls&&PARKING.stalls.length);
    const f=R.dist>2?findStall():null;
    if(f||(R.dist>(hasStalls?40:8))){ R.T=f||fakeStall(); R.state='found'; say('🅿️ Space found — stop',1600); } }
  if(R.state==='found'&&Math.abs(S.v)<.15) R.state='ready';
},100);

// ---------- driving it (called by js/game.js every frame while on) ----------
// The car's position (S) moves like a rear axle, so steering it along a line is "pure pursuit": aim at a point a few
// metres along the line and turn the wheels to arc onto it. Backing in follows the stall's middle line into the
// stall; if it comes in crooked it pulls forward along that line and tries again (up to 3 times), like the real one.
const vSet=()=>1.7/(typeof SPEEDUP!=='undefined'?SPEEDUP:1);       // ~1.7 m/s across the ground (≈4 mph)
const angN=a=>{ while(a>Math.PI) a-=2*Math.PI; while(a<-Math.PI) a+=2*Math.PI; return a; };
function poseAt(px,py,hdg){ const T=R.T, o=hv((T.into+180)%360), a=[o[1],-o[0]];
  return {s:px*o[0]+py*o[1], e:px*a[0]+py*a[1], o, p:[px,py], hdg, th:angd(hdg,(T.into+180)%360)}; }   // s: out from the stall's middle; e: off its centre line; th: heading off "nose out"
function pose(){ const p=toL(S.lng,S.lat,R.T); return poseAt(p[0],p[1],S.hdg); }
// steering (-1..1 of full lock) to follow the stall's centre line, which runs on through the stall so it squares up too
function pursue(P,dir,Ld,lock){ const sL=P.s+dir*Ld, L=[P.o[0]*sL,P.o[1]*sL], d=[L[0]-P.p[0],L[1]-P.p[1]], dist=Math.hypot(d[0],d[1]);
  const m=hv(dir<0?(P.hdg+180)%360:P.hdg), al=angN(Math.atan2(d[0],d[1])-Math.atan2(m[0],m[1])), k=2*Math.sin(al)/dist;
  return Math.max(-1,Math.min(1,Math.atan(WBm()*k)*dir/lock)); }
const WBm=()=>typeof WB!=='undefined'?WB:3.05;
const LD=2.8;
// backing in: full lock round the corner until it's nearly square, then follow the centre line in
const backSteer=(P,lock)=>Math.abs(P.th)>22?Math.sign(P.th):P.s<1.6?Math.max(-1,Math.min(1,.5*pursue(P,-1,LD,lock)+P.th*Math.PI/180*2/lock)):pursue(P,-1,LD,lock);   // last bit: square up
// try the back-in from here (the same steering, a simple car) and see where it ends up in the stall
function alongPast(){ const a=hv(R.h0), p=toL(S.lng,S.lat,R.T); return p[0]*a[0]+p[1]*a[1]; }   // how far past the space, along the aisle
function plan(P0,steer0){ const lock=lockP(), dt=.05, ds=vSet()*(typeof SPEEDUP!=='undefined'?SPEEDUP:1)*dt;
  let x=P0.p[0], y=P0.p[1], h=P0.hdg, sr=steer0||0, yr=0, ok=true;
  for(let i=0;i<500;i++){ const P=poseAt(x,y,h); if(P.s<=0){ P.ok=ok; P.mth=P0.mth; P.me=P0.me; return P; }
    if(P.s<SD/2+.2&&P.s>.8&&(Math.abs(P.e)>.6||Math.abs(P.th)>22)){ ok=false; if(P.s>SD/2-.2){ P0.mth=P.th; P0.me=P.e; } }   // would come in crooked (the B phase's test)
    const st=backSteer(P,lock); sr+=(st*lock-sr)*Math.min(1,dt*9); yr+=(ds/dt/WBm()*Math.tan(sr)-yr)*Math.min(1,dt/.13);
    h-=yr*dt*180/Math.PI; const hr=h*Math.PI/180; x-=Math.sin(hr)*ds; y-=Math.cos(hr)*ds; }
  return null; }
const lockP=()=>typeof steerLock==='function'?steerLock(vSet()):.55;
// the finish chime, like the real car's (owner's video): three soft bell notes, A – E – C#, a beat apart
function chime(){ try{ const A=window.SOUND&&SOUND.state; let c=A&&A.ctx; if(!c){ const AC=window.AudioContext||window.webkitAudioContext; c=chime.c=chime.c||new AC(); }
  if(c.state==='suspended') c.resume(); const t0=c.currentTime+.03, out=c.createGain(); out.gain.value=.22; out.connect(c.destination);
  [[440,0],[659.3,.14],[554.4,.29]].forEach(([f,dt])=>{ for(const [m,g] of [[1,1],[2,.25],[3,.08]]){ const o=c.createOscillator(), e=c.createGain();
    o.type='sine'; o.frequency.value=f*m; e.gain.setValueAtTime(0,t0+dt); e.gain.linearRampToValueAtTime(g,t0+dt+.012); e.gain.exponentialRampToValueAtTime(.0008,t0+dt+(m===1?.75:.35));
    o.connect(e); e.connect(out); o.start(t0+dt); o.stop(t0+dt+.8); } });
}catch(e){} }
function finish(){ R.state='done'; R.msgT=performance.now(); say('🏁 Park Assist finished',2200); chime();
  setTimeout(()=>{ if(R.state==='done'){ R.state='off'; dirtyScreen(); } },4500); return {st:0,gas:0,brake:1}; }
function control(dt,inp){
  if(R.state==='scan'||R.state==='found'||R.state==='off'||R.state==='cancel') return null;   // you drive
  if(R.state==='done') return Math.abs(S.v)>.05?{st:0,gas:0,brake:1}:null;
  // your hands: the gas or the steering cancels; the brake pauses
  if(inp&&(Math.abs(inp.st)>.35||inp.gas>.35)){ cancel('Park Assist cancelled'); return null; }
  const h=held()&&!(inp&&inp.brake>.3); R.held=h;
  if(R.state==='ready'){ if(!h) return {st:0,gas:0,brake:1};
    R.state='move'; R.phase='A'; R.h0=S.hdg; R.pd=0; R.last=[S.lng,S.lat]; R.stuck=0; R.tries=0; R.backs=0;
    if(alongPast()>3) R.phase='Z'; }
  if(!h){ R.dir=0; return {st:R.lastSt||0,gas:0,brake:1}; }       // let go: stop and wait
  const d=meters(R.last[1],R.last[0],S.lat,S.lng); R.last=[S.lng,S.lat]; R.pd+=d;
  const P=pose(), lock=lockP();
  let st=0, vt=0, V=vSet();
  if(R.phase==='Z'){ vt=-V; st=Math.max(-1,Math.min(1,angd(S.hdg,R.h0)/12));   // rolled too far past it: back up along the aisle first
    if(alongPast()<1.2||R.pd>12){ R.phase='A'; R.pd=0; } }
  else if(R.phase==='A'){ vt=V;                                          // pull ahead, angling away, until backing in would land square in the stall
    st=Math.abs(angd(S.hdg,R.h0))<22?-R.side*.55:0;
    const E=plan(P,S.steer); R.plan=E;
    if(E&&E.ok&&Math.abs(E.e)<.2&&Math.abs(E.th)<4){ R.phase='B'; R.pd=0; }
    else if(R.pd>9){ if(R.backs<2){ R.backs++; R.phase='Z'; } else R.phase='B'; R.pd=0; } }
  else if(R.phase==='B'){ vt=-V; st=backSteer(P,lock);              // back in along the stall's centre line
    if(P.s<SD/2+.2&&P.s>.8&&(Math.abs(P.e)>.65||Math.abs(P.th)>24)&&R.tries<3){ R.phase='F'; R.pd=0; R.tries++; }   // coming in crooked: pull up and try again
    if(P.s<=.05) return finish(); }
  else if(R.phase==='F'){ vt=V*.8; st=pursue(P,1,LD,lock);         // forward along the centre line, then back in again
    const E=plan(P,S.steer);
    if((P.s>SD/2+1.2&&E&&E.ok&&Math.abs(E.e)<.12&&Math.abs(E.th)<3)||P.s>SD/2+6||R.pd>7){ R.phase='B'; R.pd=0; } }
  R.dir=Math.sign(vt); R.lastSt=st;
  if(Math.abs(S.v)<.02&&R.pd>0) R.stuck+=dt; else R.stuck=0;
  if(R.stuck>3){ cancel('Park Assist stopped — something is in the way'); return {st:0,gas:0,brake:1}; }
  // a gentle speed hold: gas toward the target speed, brake if it's going too fast or the wrong way
  const err=vt-S.v; let gas=Math.max(-1,Math.min(1,err*.9+Math.sign(vt)*.18)), brake=0;
  if(Math.sign(S.v)===-Math.sign(vt)&&Math.abs(S.v)>.12){ gas=0; brake=.6; }
  return {st,gas,brake};
}
function cancelIfDriving(){ if(R.state!=='off') cancel(null); }


// ---------- the on-screen Ⓟ (hold), shown while Park Assist is on ----------
const css=document.createElement('style'); css.textContent='#parkBtn{position:absolute;right:calc(var(--gap,10px) + 190px);bottom:calc(var(--gap,10px) + 20px);z-index:31;display:none;'+
  'width:64px;height:64px;border-radius:50%;border:3px solid #fff;background:#1d4ed8;color:#fff;font:800 30px system-ui;box-shadow:0 4px 14px rgba(0,0,0,.45);touch-action:none}'+
  '#parkBtn.on{display:block}#parkBtn.scan{background:#0ea5e9}#parkBtn:active,#parkBtn.held{background:#16a34a}'+
  '#parkPanel{position:absolute;left:50%;bottom:calc(var(--gap,10px) + 96px);transform:translateX(-50%);z-index:30;display:none;background:rgba(240,242,250,.96);color:#1b2433;border-radius:14px;'+
  'padding:8px 14px;font:600 14px system-ui;box-shadow:0 4px 16px rgba(0,0,0,.35);text-align:center;max-width:70vw}#parkPanel.on{display:block}#parkPanel small{display:block;font-weight:400;opacity:.7}';
document.head.appendChild(css);
const btn=document.createElement('button'); btn.id='parkBtn'; btn.textContent='P'; btn.title='Park Assist: hold to park'; document.body.appendChild(btn);
btn.addEventListener('pointerdown',e=>{ e.stopPropagation(); e.preventDefault(); if(R.state==='off'||R.state==='scan'||R.state==='done'){ press(); return; } sHeld=true; btn.classList.add('held'); });
for(const ev of ['pointerup','pointerleave','pointercancel']) btn.addEventListener(ev,e=>{ sHeld=false; btn.classList.remove('held'); });
const panel=document.createElement('div'); panel.id='parkPanel'; document.body.appendChild(panel);
setInterval(()=>{ const on=R.state!=='off'; btn.classList.toggle('on',OK()&&(on||Math.abs(S.v)*2.237<8)&&!(window.PLOW&&0)); btn.classList.toggle('scan',R.state==='scan');
  const ck=!!(window.COCKPIT&&COCKPIT.on); const t=texts(); panel.classList.toggle('on',on&&!ck);    // outside view: a small panel instead of the screen
  if(on&&!ck) panel.innerHTML=(t.arrow?'<span style="font-size:20px;color:'+(t.arrowFill?'#16a34a':'#64748b')+'">'+t.arrow+'</span> ':'')+t.lines[0]+(t.lines[1]?'<small>'+t.lines.slice(1).join(' · ')+'</small>':'');
},150);

// ---------- what the screen says ----------
function texts(){ const s=R.state;
  if(s==='scan') return {title:'Perpendicular Park',lines:['Scanning. Use turn signal.','Please drive forward'],arrow:'⬆',arrowFill:true,view:'scan'};
  if(s==='found') return {title:'Perpendicular Park',lines:['Space found.','Stop'],arrow:'',view:'found'};
  if(s==='ready') return {title:'Perpendicular Park',lines:['Release brake to start.','Hold Park Button'],arrow:'',view:'ready'};
  if(s==='move') return {title:'Perpendicular Park',lines:R.held?['Shift to Cancel','Attention','Check Surroundings.']:['Hold Park Button','to continue'],arrow:R.dir<0?'⬇':'⬆',arrowFill:R.held,view:'move'};
  if(s==='done') return performance.now()-R.msgT<2200?{title:'Perpendicular Park',lines:['Finished'],arrow:'🏁',flag:true,view:'move'}:{title:'Perpendicular Park',lines:[''],arrow:'🏁',view:'done'};
  if(s==='cancel') return {title:'Park Assist',lines:['Park Assist Cancelled'],arrow:'',view:'cancel'};
  return {lines:[]}; }

// ---------- drawing the centre screen (js/enh/cockpit.js calls this for the Explorer / Expedition) ----------
function draw(sc){ if(R.state==='off'||!OK()) return false; const x=sc.T.x, W=sc.w, H=sc.h, t=texts(), u=Math.min(W,H)/100, now=performance.now();
  x.save(); x.fillStyle='#eef0f6'; x.fillRect(0,0,W,H); x.textAlign='center'; x.textBaseline='middle'; x.fillStyle='#1b2433';
  const tall=H>W*1.05;
  const title=(y)=>{ x.font='500 '+Math.round(4*u)+'px system-ui,Arial'; x.fillStyle='#3b4252'; x.fillText(t.title||'',W/2,y); };
  const words=(y,size)=>{ x.fillStyle='#1b2433'; x.font='400 '+Math.round(size*u)+'px system-ui,Arial'; t.lines.forEach((l,i)=>x.fillText(l,W/2,y+i*size*u*1.25)); };
  const arrow=(cx,cy,s,dir,fill)=>{ x.save(); x.translate(cx,cy); if(dir<0) x.rotate(Math.PI); x.beginPath();
    x.moveTo(0,-s); x.lineTo(s*.85,0); x.lineTo(s*.35,0); x.lineTo(s*.35,s); x.lineTo(-s*.35,s); x.lineTo(-s*.35,0); x.lineTo(-s*.85,0); x.closePath();
    if(fill){ x.fillStyle='#22c55e'; x.fill(); x.strokeStyle='#15803d'; } else { x.fillStyle='#fff'; x.fill(); x.strokeStyle='#5b6472'; } x.lineWidth=Math.max(2,u*.5); x.stroke(); x.restore(); };
  const flag=(cx,cy,s)=>{ x.save(); x.translate(cx-s*.45,cy-s*.6); const n=5, c=s*1.1/n, r=s*.8/4;   // the chequered finish flag
    x.strokeStyle='#1b2433'; x.lineWidth=Math.max(2,s*.09); x.beginPath(); x.moveTo(0,0); x.lineTo(0,s*1.5); x.stroke();
    for(let i=0;i<n;i++) for(let j=0;j<4;j++){ x.fillStyle=(i+j)%2?'#fff':'#111'; const wv=Math.sin((i/n)*Math.PI*1.6)*s*.08;
      x.fillRect(s*.05+i*c,j*r+wv,c+.5,r+.5); }
    x.strokeStyle='#111'; x.lineWidth=Math.max(1,s*.04); x.strokeRect(s*.05,0,c*n,r*4); x.restore(); };
  const car=(cx,cy,s,rot,waves)=>{ x.save(); x.translate(cx,cy); x.rotate(rot||0);
    x.fillStyle='#4b5563'; rr(x,-s*.42,-s,s*.84,s*2,s*.3); x.fill(); x.fillStyle='#9ca3af'; rr(x,-s*.32,-s*.55,s*.64,s*.45,s*.12); x.fill(); rr(x,-s*.32,s*.35,s*.64,s*.35,s*.1); x.fill();
    if(waves){ x.strokeStyle='#3b82f6'; x.lineWidth=Math.max(2,u*.45); for(const sd of [-1,1]) for(let k=1;k<=2;k++){ const ph=((now/600)+k*.5)%1;
      x.globalAlpha=1-ph*.6; x.beginPath(); x.arc(sd*s*.5,0,s*(.35+k*.3),sd>0?-.6:Math.PI-.6,sd>0?.6:Math.PI+.6); x.stroke(); } x.globalAlpha=1; }
    x.restore(); };
  const parked=(cx,cy,s,side,n,gap)=>{ x.fillStyle='#b8bec9'; for(let i=0;i<n;i++){ if(i===gap) continue; const y=cy+(i-(n-1)/2)*s*1.15; rr(x,cx+side*s*2.2-s*.5,y-s*.45,s*1.0,s*.9,s*.2); x.fill(); } };
  if(t.view==='move'){                                             // the split screen, like the real one
    const T0=Math.round(6.5*u), tall=H>W*1.05, cr=camRect(W,H);
    const cam=[cr[0]*W,cr[1]*H,cr[2]*W,cr[3]*H], top=tall?[W*.6,T0,W*.4,H*.44]:[W*.5,T0,W*.5,(H-T0)*.46],
          inf=tall?[0,T0+H*.44,W,H-T0-H*.44]:[W*.5,T0+(H-T0)*.46,W*.5,(H-T0)*.54];
    // camera: the row of cars behind (or ahead) with the guide lines, bending the way it's steering
    { const [X,Y,w,h]=cam; x.save(); x.beginPath(); x.rect(X,Y,w,h); x.clip();
      const g=x.createLinearGradient(0,Y,0,Y+h); g.addColorStop(0,'#9aa6b6'); g.addColorStop(.38,'#b9c0c9'); g.addColorStop(.39,'#5d636c'); g.addColorStop(1,'#3f444b');
      x.fillStyle=g; x.fillRect(X,Y,w,h); x.fillStyle='rgba(30,33,38,.75)'; for(let i=0;i<4;i++) x.fillRect(X+w*(.04+i*.25),Y+h*.27,w*.17,h*.12);
      const bend=(R.phase==='B'?R.side:R.phase==='A'?-R.side:0)*w*.16;
      x.lineWidth=Math.max(3,u*.8);
      for(const [col,a] of [['#ef4444',.24],['#facc15',.33]]){ x.strokeStyle=col; x.beginPath();
        x.moveTo(X+w*a-w*.1,Y+h); x.quadraticCurveTo(X+w*a+bend*.4,Y+h*.7,X+w*(a+.08)+bend,Y+h*.45);
        x.moveTo(X+w*(1-a)+w*.1,Y+h); x.quadraticCurveTo(X+w*(1-a)+bend*.4,Y+h*.7,X+w*(1-a-.08)+bend,Y+h*.45); x.stroke(); }
      x.fillStyle='rgba(0,0,0,.5)'; x.font='500 '+Math.round(2.8*u)+'px system-ui'; const lab=R.dir>0?'Front camera':'Rear camera', lw=x.measureText(lab).width+3*u;
      rr(x,X+1.5*u,Y+h-5.5*u,lw,4*u,1.2*u); x.fill(); x.fillStyle='#fff'; x.textAlign='left'; x.fillText(lab,X+3*u,Y+h-3.5*u); x.textAlign='center'; x.restore(); }
    // the 360° top view: the stall you're going into (its painted lines) and your car where it really is
    { const [X,Y,w,h]=top; x.save(); x.beginPath(); x.rect(X,Y,w,h); x.clip(); x.fillStyle='#2a2f37'; x.fillRect(X,Y,w,h);
      const P=R.T?pose():{s:6,e:0,th:-R.side*90}, k=Math.min(w/9,h/13), cx=X+w/2, cy=Y+h*.66, hw=1.375, hd=SD/2;
      x.strokeStyle='#e5e7eb'; x.lineWidth=Math.max(2,u*.35);
      for(const e of [-3*hw,-hw,hw,3*hw]){ x.beginPath(); x.moveTo(cx+e*k,cy-hd*k); x.lineTo(cx+e*k,cy+hd*k); x.stroke(); }
      x.beginPath(); x.moveTo(cx-3*hw*k,cy+hd*k); x.lineTo(cx+3*hw*k,cy+hd*k); x.stroke();
      x.strokeStyle='rgba(34,197,94,.9)'; x.setLineDash([u,u]); x.strokeRect(cx-hw*k+3,cy-hd*k+3,2*hw*k-6,2*hd*k-6); x.setLineDash([]);   // the target space
      x.save(); x.translate(cx+P.e*k,cy-P.s*k); x.rotate(P.th*Math.PI/180); x.fillStyle='#d1d5db'; rr(x,-.95*k,-2.45*k,1.9*k,4.9*k,.5*k); x.fill();
      x.fillStyle='#4b5563'; rr(x,-.75*k,-1.2*k,1.5*k,.9*k,.2*k); x.fill(); rr(x,-.75*k,1.1*k,1.5*k,.7*k,.2*k); x.fill(); x.restore();
      x.restore(); }
    // below: the words, the big arrow, the little car
    { const [X,Y,w,h]=inf; const mx=X+w/2; x.fillStyle='#1b2433'; x.font='400 '+Math.round(3.6*u)+'px system-ui';
      t.lines.forEach((l,i)=>x.fillText(l,mx,Y+h*.13+i*4.6*u));
      if(t.flag) flag(mx,Y+h*.55,Math.min(8*u,h*.12)); else arrow(mx,Y+h*.55,Math.min(9*u,h*.13),R.dir||-1,t.arrowFill); car(mx,Y+h*.86,Math.min(5*u,h*.08),0,false); }
    x.fillStyle='#e3e6ee'; x.fillRect(0,0,W,T0); x.fillStyle='#1b2433'; x.font='500 '+Math.round(3.4*u)+'px system-ui'; x.fillText('Perpendicular Park',W/2,T0/2);
  } else {
    title(4*u+6); words(H*(tall?.12:.18),4);
    if(t.view==='scan'){ arrow(W/2,H*(tall?.32:.42),Math.min(8*u,H*.07),1,true); car(W/2,H*(tall?.58:.68),Math.min(6*u,H*.06),0,true); parked(W/2,H*(tall?.62:.72),Math.min(6*u,H*.05),R.side,5,-1); }
    else if(t.view==='found'||t.view==='ready'){
      if(t.view==='ready'){ x.font='800 '+Math.round(9*u)+'px system-ui'; x.fillStyle='#1b2433'; x.fillText('P',W/2-6*u,H*(tall?.30:.40)); x.strokeStyle='#1b2433'; x.lineWidth=u*.9;
        x.beginPath(); x.arc(W/2+5*u,H*(tall?.31:.41),5*u,0,6.3); x.stroke(); x.beginPath(); x.arc(W/2+5*u,H*(tall?.31:.41),1.5*u,0,6.3); x.stroke(); }
      const cy=H*(tall?.58:.68), s=Math.min(6*u,H*.06); car(W/2,cy,s,0,true); parked(W/2,cy+s*1.6,s,R.side,5,2);
      x.strokeStyle='#1b2433'; x.lineWidth=u*.6; x.setLineDash([u*1.5,u*1.2]); x.beginPath(); x.moveTo(W/2,cy+s); x.quadraticCurveTo(W/2,cy+s*2.4,W/2+R.side*s*2.2,cy+s*1.6*0+s*1.6); x.stroke(); x.setLineDash([]); }
    else if(t.view==='done'){ flag(W/2,H*.36,Math.min(8*u,H*.06)); car(W/2,H*.56,Math.min(5*u,H*.05),0,false); }
  }
  x.restore(); sc.T.t.needsUpdate=true; return true; }
// where the camera window sits on the split screen (fractions of the screen): js/enh/cockpit.js puts the real backup camera there
function camRect(W,H){ const u=Math.min(W,H)/100, T0=Math.round(6.5*u)/H; return H>W*1.05?[0,T0,.6,.44]:[0,T0,.5,1-T0]; }
function rr(x,X,Y,w,h,r){ x.beginPath(); x.moveTo(X+r,Y); x.arcTo(X+w,Y,X+w,Y+h,r); x.arcTo(X+w,Y+h,X,Y+h,r); x.arcTo(X,Y+h,X,Y,r); x.arcTo(X,Y,X+w,Y,r); x.closePath(); }

window.PARK={get active(){ return R.state!=='off'; },get state(){ return R.state; },start,cancel:()=>cancel(null),control,draw,camRect,R,pose:()=>R.T&&pose()};
})();
