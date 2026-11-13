/* Driving feel: the world pushes back.
   - Surfaces: what the tyres are on (pavement, parking lot, gravel, grass, dirt, woods, sand, mud, rock) sets grip, drag,
     a top speed, how rough the ride is and what gets kicked up. Physics use it only with ⚙️ Realistic driving on
     (js/game.js reads FEEL.surf / FEEL.mu); the bumps, dust and sounds below follow the same switch.
   - Solid things: trees and traffic stop or bump the car (FEEL.hit, called from js/game.js before the car moves);
     buildings are handled in game.js and call FEEL.impact for the thud. No scores or penalties are attached here.
   - Sound (⚙️ Sound): tyre/road noise by surface, wind at speed, skid squeal, impact thumps. Synthesized from filtered
     noise in the engine sound's audio context (js/enh/sound.js); nothing plays outside the car/tractor.
   - Phone buzz on impacts where the browser allows it (Android; iPhone browsers don't). */
(()=>{
'use strict';
// mu: grip x weather grip. drag: per m/s of speed. rr: constant rolling drag. cap: top speed m/s (0 = the car's own).
// rough: ride roughness 0..1. dust: colour kicked up behind (0 = none). hum/grit: tyre noise levels. lp: hum tone (Hz).
const SURF={
  paved: {name:'Pavement',   mu:1,   drag:0,   rr:0,   cap:0,  rough:0,   dust:0,        hum:1,   grit:0,   lp:[170,13]},
  lot:   {name:'Parking lot',mu:.95, drag:0,   rr:0,   cap:34, rough:.05, dust:0,        hum:.9,  grit:.05, lp:[170,13]},
  gravel:{name:'Gravel',     mu:.75, drag:.02, rr:.15, cap:0,  rough:.3,  dust:0xb9a78a, hum:.55, grit:1,   lp:[220,10]},
  grass: {name:'Grass',      mu:.6,  drag:.12, rr:.25, cap:34, rough:.5,  dust:0x7d8a4e, hum:.5,  grit:.2,  lp:[240,6]},
  dirt:  {name:'Dirt',       mu:.55, drag:.18, rr:.3,  cap:30, rough:.7,  dust:0xa0825a, hum:.5,  grit:.55, lp:[220,7]},
  woods: {name:'Forest floor',mu:.55,drag:.25, rr:.3,  cap:22, rough:.85, dust:0x6b5b3a, hum:.45, grit:.5,  lp:[230,7]},
  sand:  {name:'Sand',       mu:.5,  drag:.28, rr:.4,  cap:20, rough:.4,  dust:0xd9c79a, hum:.5,  grit:.35, lp:[260,5]},
  mud:   {name:'Mud',        mu:.4,  drag:.4,  rr:.4,  cap:14, rough:.5,  dust:0x5a4a35, hum:.4,  grit:.25, lp:[200,5]},
  rock:  {name:'Rock',       mu:.65, drag:.1,  rr:.3,  cap:24, rough:1,   dust:0x9aa0a6, hum:.6,  grit:.8,  lp:[240,9]},
  ice:   {name:'Ice',        mu:.3,  drag:.02, rr:.05, cap:34, rough:.1,  dust:0,        hum:.3,  grit:.1,  lp:[300,6]}
};
// map land classes -> surface when you're off the road (anything else: grass)
const LANDS={wood:'woods',sand:'sand',beach:'sand',wetland:'mud',rock:'rock',quarry:'rock',ice:'ice',farmland:'dirt',farmyard:'dirt',
  commercial:'lot',retail:'lot',industrial:'lot',school:'lot',hospital:'lot',university:'lot',college:'lot',stadium:'lot',railway:'gravel',military:'lot'};
const F={surf:SURF.paved,mu:1,SURF,hit,impact};
let rough=0, ph=0, jolt=0, joltT=0, dustT=0, lastKey='paved', fxCool=0, lastTree=-1;

function pick(){
  if(mode==='tractor') return SURF.dirt;
  if(mode!=='car') return SURF.paved;
  if(onRoad) return S.rcls==='gravel'?SURF.gravel:SURF.paved;
  return SURF[LANDS[S.land]||'grass'];
}
// smooth noise in -1..1 along a line
function vn(x){ const i=Math.floor(x), f=x-i, u=f*f*(3-2*f); return (hash(i,7)*(1-u)+hash(i+1,7)*u)*2-1; }
function buzz(ms){ try{ if(navigator.vibrate) navigator.vibrate(ms); }catch(e){} }

/* ---------- impacts ---------- */
// sp: closing speed in speedometer m/s. kind: 'wall' | 'tree' | 'car'
function impact(sp,kind){
  const k=Math.min(1,sp/22);
  shake=Math.max(shake,Math.min(1,.15+k*.85)); jolt=Math.max(jolt,.35+k*.65); joltT=0;
  buzz(Math.round(25+k*110)); thump(k,kind);
}
/* Trees and traffic. Called with where the car is about to be (nLng,nLat), its heading h (radians) and the distance from
   the car's centre to its nose. Returns null, or {v: new speed, turn: degrees to add to the heading, stop: don't move}. */
function hit(nLng,nLat,h,NOSE){
  const sg=S.v<0?-1:1, sh=Math.sin(h), ch=Math.cos(h), sp=Math.abs(S.v);
  const cx=nLng*MLNG, cy=nLat*MLAT, nx=cx+sh*NOSE*sg, ny=cy+ch*NOSE*sg;
  // trees: the trunk stops the nose; a trunk off to one side is a glancing blow that knocks speed off and shoves the car away
  const R=1.5, tp=treePts; let seen=-1;
  for(let i=0;i<tp.length;i+=2){
    const dx=tp[i]-nx; if(dx>R||dx<-R) continue; const dy=tp[i+1]-ny; if(dy>R||dy<-R||dx*dx+dy*dy>R*R) continue;
    const fx=tp[i]-cx, fy=tp[i+1]-cy, fwd=(fx*sh+fy*ch)*sg, lat=fx*ch-fy*sh;      // lat > 0: trunk to the car's right
    if(fwd<=0) continue;                                           // behind the way you're going: you can always pull away
    seen=i;
    if(Math.abs(lat)>.75){ if(lastTree===i) continue; lastTree=i;   // glancing: once per tree
      if(sp>1.5) fx_('tree',sp*.5,sg); return {v:S.v*.65,turn:-Math.sign(lat)*sg*3,stop:false}; }
    lastTree=i; if(sp>1.5) fx_('tree',sp,sg);
    return {v:-sg*Math.min(sp*.2,2.5),stop:true};
  }
  if(seen<0) lastTree=-1;
  // traffic: the other car as a box, yours as three circles (front, middle, rear)
  const T=window.TRAFFIC&&TRAFFIC.state; if(!T||!T.on||!T.agents) return null;
  const E=Math.max(1,EXAG*.85), HL=2.4*E, HW=.9, PR=.9, pvx=sh*S.v*SPEEDUP, pvy=ch*S.v*SPEEDUP;
  for(const a of T.agents){
    if(!a.path||!(a.fade>.5)) continue;
    const dx=a.px-cx, dy=a.py-cy, D2=dx*dx+dy*dy; if(D2>(HL+2.4*E+PR)*(HL+2.4*E+PR)) continue;
    const ah=Math.sin(a.hd), ac=Math.cos(a.hd); let touch=false;
    for(const o of [1.5*E,0,-1.5*E]){ const qx=cx+sh*o-a.px, qy=cy+ch*o-a.py, f=qx*ah+qy*ac, l=qx*ac-qy*ah;
      const ox=Math.max(-HL,Math.min(HL,f)), oy=Math.max(-HW,Math.min(HW,l)); if(Math.hypot(f-ox,l-oy)<PR){ touch=true; break; } }
    if(!touch) continue;
    const D=Math.sqrt(D2)||1, ux=dx/D, uy=dy/D, mine=pvx*ux+pvy*uy, closing=mine-(ah*a.v*ux+ac*a.v*uy);
    if(closing<=.5) continue;                                      // drifting apart: let go
    const imp=closing/SPEEDUP, same=(ah*sh+ac*ch)*sg;                // same > 0: it's going your way
    if(imp>1.5) fx_('car',imp,sg);
    if(mine<=0){ a.v=0; a.hold=1.5; return null; }                   // it ran into you: it stops, you stay put
    if(same>.5){ const av=a.v/SPEEDUP; a.v+=Math.min(6*SPEEDUP,closing*.25); a.hold=0;      // rear-ended it: it gets a shove
      return {v:sg*Math.min(sp,av*.8),stop:true}; }
    a.v*=.3; a.hold=1.2;
    return {v:-sg*Math.min(sp*.2,2.5),stop:true};
  }
  return null;
}
function fx_(kind,sp,sg){
  if(fxCool>0) return; fxCool=.3;
  const dir=sg>0?-1:1;
  if(kind==='tree') spawn(0,Math.min(7,2+Math.floor(sp*.4)),dir,0x4a8a3c);
  else spawn(Math.min(8,Math.floor(sp*.5)),Math.min(5,1+Math.floor(sp*.25)),dir,0xcfd3d8);
  impact(sp,kind);
}

/* ---------- sound ---------- */
const SN={ctx:null,last:{}};
function audio(){
  const A=window.SOUND&&SOUND.state, ctx=A&&A.ctx; if(!ctx) return null;
  if(SN.ctx===ctx) return SN;
  try{
    const len=Math.floor(ctx.sampleRate*2), buf=ctx.createBuffer(1,len,ctx.sampleRate), d=buf.getChannelData(0);
    let s=12345; for(let i=0;i<len;i++){ s=(Math.imul(s,1664525)+1013904223)|0; d[i]=(s>>>8)/8388608-1; }
    const src=ctx.createBufferSource(); src.buffer=buf; src.loop=true;
    const out=ctx.createGain(); out.gain.value=1; out.connect(ctx.destination);
    const chain=(type,f,q)=>{ const b=ctx.createBiquadFilter(); b.type=type; b.frequency.value=f; b.Q.value=q;
      const g=ctx.createGain(); g.gain.value=0; src.connect(b); b.connect(g); g.connect(out); return {f:b.frequency,g:g.gain}; };
    SN.hum=chain('lowpass',300,.7); SN.grit=chain('bandpass',520,1.1); SN.wind=chain('bandpass',480,.5);
    SN.sq1=chain('bandpass',720,16); SN.sq2=chain('bandpass',1080,14);
    src.start(); SN.buf=buf; SN.out=out; SN.ctx=ctx; SN.last={};
  }catch(e){ console.warn('feel sound',e); return null; }
  return SN;
}
function setP(name,param,v,tc){ if(Math.abs((SN.last[name]??-1)-v)<Math.max(.002,Math.abs(v)*.03)) return; SN.last[name]=v; param.setTargetAtTime(v,SN.ctx.currentTime,tc||.08); }
function soundOn(){ return !!(window.SOUND&&SOUND.on)&&!document.hidden&&(mode==='car'||mode==='tractor'); }
function sound(dt,surf,spd){
  const N=audio(); if(!N) return;
  const on=soundOn(), u=Math.min(1,spd/40), sk=on&&mode==='car'?(S.skid||0):0, loose=surf.grit>.3;
  let hum=0, grit=0, wind=0, sq=0;
  if(on&&spd>.5){
    hum=LV.hum*surf.hum*Math.pow(u,.8);
    grit=LV.grit*surf.grit*Math.min(1,spd/14)*(.75+.5*Math.random())+(loose?LV.grit*.9*sk:0);   // crunch flickers; sliding on loose ground scrubs
    wind=LV.wind*u*u;
    sq=loose?0:LV.sq*sk*(wxGrip()<.95?.35:1);                      // wet tyres hiss more than they squeal
  }
  setP('hf',N.hum.f,surf.lp[0]+spd*surf.lp[1],.15); setP('hg',N.hum.g,hum); setP('gg',N.grit.g,grit,.04); setP('wg',N.wind.g,wind,.2);
  setP('wf',N.wind.f,420+spd*7,.3);
  const f=640+Math.min(spd,40)*4+vn(performance.now()/90)*20;
  if(sq>0){ N.sq1.f.setTargetAtTime(f,N.ctx.currentTime,.05); N.sq2.f.setTargetAtTime(f*1.5,N.ctx.currentTime,.05); }
  setP('s1',N.sq1.g,sq,.05); setP('s2',N.sq2.g,sq*.45,.05);
}
// output levels (set against the engine's level in an offline render; see the workflow notes)
const LV={hum:.4,grit:.2,wind:.2,sq:1.3,thump:.7,crunch:.6};
function thump(k,kind){
  const N=audio(); if(!N||!soundOn()) return;
  try{
    const c=N.ctx, t=c.currentTime, o=c.createOscillator(), g=c.createGain();
    o.type='sine'; o.frequency.setValueAtTime(kind==='tree'?210:170,t); o.frequency.exponentialRampToValueAtTime(kind==='tree'?90:60,t+.16);
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(LV.thump*(.3+.7*k),t+.006); g.gain.exponentialRampToValueAtTime(.001,t+.28);
    o.connect(g); g.connect(N.out); o.start(t); o.stop(t+.3);
    const n=c.createBufferSource(), b=c.createBiquadFilter(), ng=c.createGain(); n.buffer=N.buf;
    b.type=kind==='tree'?'bandpass':'lowpass'; b.frequency.value=kind==='tree'?520:kind==='car'?1500:800; b.Q.value=kind==='tree'?1.6:.7;
    ng.gain.setValueAtTime(LV.crunch*(.25+.75*k),t); ng.gain.exponentialRampToValueAtTime(.001,t+(kind==='car'?.22:.14));
    n.connect(b); b.connect(ng); ng.connect(N.out); n.start(t,Math.random()*1.5,.3);
  }catch(e){}
}

/* ---------- every frame ---------- */
FRAME_HOOKS.push(function feel(dt){
  dt=dt||.016; fxCool-=dt;
  const surf=pick(), spd=Math.abs(S.v||0), drive=mode==='car'||mode==='tractor';
  F.surf=surf; F.mu+=(surf.mu-F.mu)*Math.min(1,dt*4);
  const key=surf.name;
  if(!REAL||!drive){ rough=0; jolt=0; S.bx=S.by=S.bz=0; S.bj=0; lastKey=key; sound(dt,surf,drive?spd:0); return false; }
  // dropping off the pavement or climbing back on: one jolt
  if(key!==lastKey){ const a=SURF_BY[lastKey], d=a?Math.abs(surf.rough-a.rough):0; if(d>.2&&spd>2){ jolt=Math.max(jolt,Math.min(1,.25+spd/25)); joltT=0; buzz(18); } lastKey=key; }
  rough+=(surf.rough-rough)*Math.min(1,dt*5);
  const amp=rough*Math.min(1,spd/6);
  if(spd>.2) ph+=dt*Math.min(9,1.5+spd*.8);
  jolt*=Math.exp(-dt*5.5); joltT+=dt; if(jolt<.01) jolt=0;
  const js=Math.sin(joltT*24);
  S.by=amp*.07*(vn(ph)+.6*vn(ph*2.3+5))+jolt*.07*Math.abs(js);
  S.bx=amp*.02*vn(ph*.9+37)+jolt*.045*js;
  S.bz=amp*.028*vn(ph*1.3+71);
  S.bj=jolt;
  // what the tyres throw up: dust on loose ground, smoke from a skid, spray on a wet road
  dustT-=dt;
  if(dustT<=0&&spd>4&&mode==='car'){
    const sk=S.skid||0, wet=wxGrip()<.95, col=surf.dust?surf.dust:sk>.3?0xdcdcdc:wet&&spd>10?0xdfe9f2:0;
    if(col&&(surf.dust?spd>(surf===SURF.grass?11:5):true)){ spawn(0,1,S.v>=0?1:-1,col); dustT=(POWER?.2:.1)/(sk>.3?2:1); }
    else dustT=.1;
  }
  sound(dt,surf,spd);
  return jolt>.02;
});
const SURF_BY={}; for(const k in SURF) SURF_BY[SURF[k].name]=SURF[k];
// frame hooks don't run while gliding: silence the tyres and level the body the moment you leave the car
const prevMode=window.onModeChange;
window.onModeChange=function(m){ if(prevMode) prevMode.apply(this,arguments);
  if(m==='car'||m==='tractor') return;
  S.bx=S.by=S.bz=0; S.bj=0; jolt=0;
  if(SN.ctx){ const t=SN.ctx.currentTime; for(const k of ['hum','grit','wind','sq1','sq2']) SN[k].g.setTargetAtTime(0,t,.1); SN.last={}; } };
window.FEEL=F;
})();
