/* Autopilot: drives the active route for you. Steers along it (pure pursuit), keeps to the speed limit, slows for
   bends and turns, stops at stop signs and red lights on the route, and stops at the destination. Touching the
   steering, gas or handbrake hands control straight back. Works for the SUV and the tractor, not the boat or glider. */
(()=>{
'use strict';
const {ENH,safe,onTick,psd}=YD;
const btn=document.getElementById('navAuto');
const B=6;                                      // planned braking, game m/s^2 (full brakes are ~28)
const CAN=()=>mode==='car'||mode==='tractor';
const A={on:false,i:0,route:null,oxAt:null,stops:[],passed:new Set(),waitT:0,lastTarget:0};

// the game's own steering limit (js/game.js steerLock); the car turns at world speed: heading rate = v*SPEEDUP/WB*tan(steer)
// fastest speed (game m/s) that can still hold a curve of curvature kap (1/world m), with 15% steering in reserve
function vCurve(kap){ if(kap<.002) return 1e9;
  const need=Math.atan(WB*kap)/.85; let lo=0, hi=60;
  if(steerLock(0)<need) return 2;                                     // tighter than the car can turn: crawl
  for(let i=0;i<18;i++){ const m=(lo+hi)/2; if(steerLock(m)>=need) lo=m; else hi=m; }
  const byGrip=Math.sqrt(10/kap)/SPEEDUP;                             // keep sideways force sensible
  return Math.max(2.5,Math.min(lo,byGrip)); }
function pointAt(s,hint){ const c=YD.NAV.cum, P=YD.NAV.pts; let j=Math.max(0,Math.min(hint|0,P.length-2));
  while(j>0&&c[j]>s) j--; while(j<P.length-2&&c[j+1]<s) j++;
  const L=(c[j+1]-c[j])||1, t=Math.max(0,Math.min(1,(s-c[j])/L));
  return [P[j][0]+(P[j+1][0]-P[j][0])*t,P[j][1]+(P[j+1][1]-P[j][1])*t,j]; }

// stop signs and traffic lights that sit on the route itself (within ~3.5 m of its centre line, so a cross
// street's stop sign beside the road doesn't count), as distances along the route
function findStops(){
  const N=YD.NAV, P=N.pts, OX=YD.OX||{stops:[],sigs:[]}, out=[];
  const bb=[1e18,1e18,-1e18,-1e18]; for(const p of P){ if(p[0]<bb[0])bb[0]=p[0]; if(p[1]<bb[1])bb[1]=p[1]; if(p[0]>bb[2])bb[2]=p[0]; if(p[1]>bb[3])bb[3]=p[1]; }
  const scan=(list,kind)=>{ for(const o of list){ if(o.x<bb[0]-5||o.x>bb[2]+5||o.y<bb[1]-5||o.y>bb[3]+5) continue;
    let bd=1e9, at=0; for(let i=0;i<P.length-1;i++){ const [d,t]=psd(o.x,o.y,P[i][0],P[i][1],P[i+1][0],P[i+1][1]); if(d<bd){ bd=d; at=N.cum[i]+t*(N.cum[i+1]-N.cum[i]); } }
    if(bd<3.5) out.push({id:kind+o.id,kind,at,ph:hash(Math.round(o.x/60),Math.round(o.y/60))<.5?0:1}); } };
  scan(OX.stops||[],'stop'); scan(OX.sigs||[],'sig');
  out.sort((a,b)=>a.at-b.at);
  // one stop per intersection: signals are often mapped on every approach
  A.stops=out.filter((s,k)=>k===0||s.at-out[k-1].at>12||s.kind!==out[k-1].kind);
  A.route=N.pts; A.oxAt=OX.at; A.passed.clear();
}
function lightState(ph){ const t=(Date.now()/1000)%30, a=t<12?'g':t<15?'y':'r', b=t<15?'r':t<27?'g':'y'; return ph===0?a:b; }   // same cycle as the signs

function control(dt){
  const N=YD.NAV;
  if(!N.pts||!CAN()){ stop(N.pts?'Autopilot only drives the SUV and tractor':null); return {st:0,gas:0}; }
  if(A.route!==N.pts||A.oxAt!==(YD.OX&&YD.OX.at)) { findStops(); A.i=0; }
  const P=N.pts, x=S.lng*MLNG, y=S.lat*MLAT;
  // where are we along the route?
  let bi=A.i, bd=1e18, bt=0;
  for(let i=Math.max(0,A.i-3);i<Math.min(P.length-1,A.i+60);i++){ const [d,t]=psd(x,y,P[i][0],P[i][1],P[i+1][0],P[i+1][1]); if(d<bd){ bd=d; bi=i; bt=t; } }
  if(bd>60) for(let i=0;i<P.length-1;i++){ const [d,t]=psd(x,y,P[i][0],P[i][1],P[i+1][0],P[i+1][1]); if(d<bd){ bd=d; bi=i; bt=t; } }
  A.i=bi; const along=N.cum[bi]+bt*(N.cum[bi+1]-N.cum[bi]), v=S.v, vw=Math.abs(v)*SPEEDUP;

  // steering: aim at a point a little way ahead on the route
  const Ld=Math.max(10,Math.min(45,8+vw*.35)), tp=pointAt(along+Ld,bi);
  const h=rad(S.hdg), fx=Math.sin(h), fy=Math.cos(h), dx=tp[0]-x, dy=tp[1]-y;
  const alpha=-Math.atan2(fx*dy-fy*dx,fx*dx+fy*dy);                   // + = target to the right
  const k=2*Math.sin(alpha)/Math.max(Ld,Math.hypot(dx,dy));
  const st=Math.max(-1,Math.min(1,Math.atan(WB*k)/steerLock(v)));

  // speed: the lowest of the speed limit, what each bend ahead allows, and any stop ahead, allowing room to brake
  const lim=(YD.limit||30)/2.237;
  let target=bd>40?Math.min(lim,5):lim;
  target=Math.min(target,vCurve(Math.abs(k)));                        // how hard we're turning right now
  if(Math.abs(alpha)>1.2) target=Math.min(target,3);                  // pointing the wrong way: creep round
  const D=Math.min(300,40+vw*2.5), cap=(vc,ds)=>Math.sqrt(vc*vc+2*B*Math.max(0,ds)/SPEEDUP);
  let p0=pointAt(along-8,bi), p1=pointAt(along,bi), h0=Math.atan2(p1[0]-p0[0],p1[1]-p0[1]);   // starts just behind, so a corner being taken still counts
  for(let s=0;s<=D;s+=8){
    const p2=pointAt(along+s+8,p1[2]), h1=Math.atan2(p2[0]-p1[0],p2[1]-p1[1]);
    const dh=Math.abs(((h1-h0+3*Math.PI)%(2*Math.PI))-Math.PI);
    if(dh>.03) target=Math.min(target,cap(vCurve(dh/8),s));
    p1=p2; h0=h1;
  }
  const endAt=N.total-6; target=Math.min(target,cap(0,endAt-along));   // stop at the destination
  for(const s of A.stops){
    if(A.passed.has(s.id)||s.at<along-15) continue;
    const ds=s.at-6-along; if(ds>D) break;                       // stop line a few metres before the sign or light
    if(ds<-2&&v>2){ A.passed.add(s.id); continue; }                     // already rolled through it (e.g. on yellow): keep going
    if(s.kind==='stop'){
      if(ds<10&&Math.abs(v)<.4){ if(!A.waitT) A.waitT=performance.now(); if(performance.now()-A.waitT>1500){ A.passed.add(s.id); A.waitT=0; continue; } }
      target=Math.min(target,cap(0,ds)); break; }
    const ls=lightState(s.ph), stopDist=v*v/(2*B)*SPEEDUP;
    if(ls==='r'||(ls==='y'&&ds>stopDist*.8)){ target=Math.min(target,cap(0,ds)); break; }
    if(ds<2) A.passed.add(s.id);                                        // green and at the line: go
  }
  A.lastTarget=target;

  // throttle and brake
  let gas=0; const err=target-v;
  if(target<.3&&v<.6) gas=0;                                          // hold still; rolling resistance stops the last bit
  else if(err>.4) gas=Math.min(1,.25+err*.2);
  else if(err<-.6) gas=Math.max(-1,err*.12);
  return {st,gas};
}

function paint(){ btn.classList.toggle('on',A.on); btn.textContent=A.on?'AUTO ●':'AUTO'; }
// keep the screen awake while autopilot drives (Screen Wake Lock). The browser drops the lock whenever the app goes
// to the background, so it's taken again on return if autopilot is still on.
const WL={lock:null,warned:false};
async function wakeOn(){
  if(!A.on||WL.lock||document.hidden) return;
  if(!('wakeLock' in navigator)){ if(!WL.warned){ WL.warned=true; toast('This browser can\u2019t keep the screen on. Raise the auto-lock time in your phone settings',3500); } return; }
  try{ WL.lock=await navigator.wakeLock.request('screen'); WL.lock.addEventListener('release',()=>{ WL.lock=null; }); }
  catch(e){ console.warn('wake lock',e&&e.message||e); }
}
function wakeOff(){ const l=WL.lock; WL.lock=null; if(l) l.release().catch(()=>{}); }
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) wakeOn(); });

function start(){
  const N=YD.NAV;
  if(!N.pts){ toast('Set a destination first: tap 🔍',2200); return; }
  if(!CAN()){ toast('Autopilot only drives the SUV and tractor',2200); return; }
  A.on=true; A.i=0; A.route=null; A.waitT=0; paint(); dirty=true; wakeOn();
  toast('Autopilot on · touch the controls to take over',2600);
}
function stop(msg){ if(!A.on) return; A.on=false; A.waitT=0; paint(); wakeOff(); if(msg) toast(msg,2200); }
btn.addEventListener('click',e=>{ e.stopPropagation(); A.on?stop('Autopilot off'):start(); });
btn.addEventListener('pointerdown',e=>e.stopPropagation());

// the route ended (arrived or cleared) or the vehicle changed
onTick(250,function autoWatch(){ if(!A.on) return;
  if(!YD.NAV.pts) stop(YD.NAV.arrT?null:'Autopilot off: no route');
  else if(!CAN()) stop('Autopilot off'); });

window.AUTO={get on(){ return A.on; }, control:(dt)=>{ try{ return control(dt); }catch(e){ console.warn('autopilot',e); stop('Autopilot hit a problem and switched off'); return {st:0,gas:0}; } },
  takeover:()=>stop('You have control'), state:A};
})();
