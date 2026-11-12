/* Graphics quality: the ⚙️ Graphics picker (Auto / Low / Medium / High), automatic level choice from measured
   frame times, adaptive sharpness, the ⚙️ Realistic driving switch, and the ?fps=1 frame meter.

   game.js owns the levels themselves (QL, QMODE, QAUTO, applyQuality, setQuality, setPRScale, CAP30) and calls
   QUAL.frame(now, ran, cost) from its loop on every animation frame: ran = false when the 30 fps cap skipped the
   frame, cost = milliseconds spent in step().

   How it decides (only frames while moving count - a parked car doesn't redraw the map):
   - time is cut into 3 s windows of driving. A window is SLOW when the average time between drawn frames is over
     42 ms with the 30 fps cap (under ~24 fps) or over 30 ms without it; it is FAST when drawn frames come on time and
     under 6% of animation frames arrive late (later than 1.5 screen refreshes).
   - adaptive sharpness (every mode, also a level picked by hand): one slow window -> map resolution x0.85, another ->
     x0.72. Stopped for 2 s -> full sharpness again until you drive off. 30 s of fast windows -> one step back up
     (at most twice a session).
   - Auto only: three more slow windows at the lowest sharpness -> one level down, and that level is never tried again
     on this device (QAUTO.cap). Two fast windows at full sharpness -> one level up, up to the cap (phones: Medium).
   - tapping Auto in the picker clears that memory, so a level given up on (say, on a hot day) gets another try.
   - nothing is judged in the first 10 s, for 5 s after any change, or across pauses (tab hidden, long hitch). */
(()=>{
'use strict';
const {onReady,safe}=YD;
const LABEL=['Low','Medium','High'], SCALES=[1,.85,.72];
const Q={vs:0, any:0, ran:0, mT:0, n:0, late:0, rN:0, rT:0, wMin:1e9, slowN:0, fastN:0, stage:0, shown:0, rec:0,
         graceUntil:0, stopT:0, t0:performance.now(), lastWin:null};
const fpsOn=/[?&]fps=1\b/.test(location.search);
const F={el:null, n:0, sum:0, worst:0, cost:0, costMax:0, map:0, mapN:0, t:0};

function saveAuto(){ try{ localStorage.setItem('ydQAuto',JSON.stringify(QAUTO)); }catch(e){} }
function resetWin(){ Q.mT=0; Q.n=0; Q.late=0; Q.rN=0; Q.rT=0; Q.wMin=1e9; }
function grace(ms){ Q.graceUntil=performance.now()+ms; Q.slowN=0; Q.fastN=0; resetWin(); }
function showScale(i){ if(i===Q.shown) return; Q.shown=i; setPRScale(SCALES[i]); }
function level(lvl,why){
  QAUTO.lvl=lvl; if(why==='down') QAUTO.cap=Math.min(QAUTO.cap,lvl); saveAuto();
  Q.stage=0; Q.shown=0; applyQuality(lvl); grace(6000); paint();
  toast('Graphics: '+LABEL[lvl]+(why==='down'?' — keeping it smooth':''),2600);
}
function moving(){ return mode==='glider'||Math.abs(S.v)>2; }

function windowDone(now){
  const avg=Q.rN?Q.rT/Q.rN:0, lateF=Q.n?Q.late/Q.n:1, cap=CAP30();
  if(Q.wMin<Q.vs||!Q.vs) Q.vs=Math.max(4,Q.wMin);
  const slow=avg>(cap?42:30), fast=!slow&&lateF<.06&&avg<(cap?36:Q.vs*1.3);
  Q.lastWin={avg,lateF,slow,fast}; resetWin();
  if(slow){ Q.slowN++; Q.fastN=0; } else { Q.slowN=0; Q.fastN=fast?Q.fastN+1:0; }
  if(slow&&Q.stage<2){ Q.stage++; showScale(Q.stage); grace(3000); return; }
  if(QMODE==='auto'){
    if(Q.slowN>=3&&Q.stage===2&&QL>0){ level(QL-1,'down'); return; }
    if(Q.fastN>=2&&Q.stage===0&&QL<QAUTO.cap){ level(QL+1,'up'); return; }
  }
  if(Q.fastN>=10&&Q.stage>0&&Q.rec<2){ Q.rec++; Q.stage--; showScale(Q.stage); grace(3000); }
}

function frame(now,ran,cost){
  const dAny=now-Q.any; Q.any=now;
  if(fpsOn) meter(now,ran,cost,dAny);
  if(dAny>250||dAny<=0||document.hidden){ Q.ran=now; resetWin(); return; }      // pause or hitch: don't judge across it
  if(dAny<Q.wMin) Q.wMin=dAny;
  if(!Q.vs&&now-Q.t0>1500&&Q.wMin<1e8) Q.vs=Math.max(4,Q.wMin);                 // screen refresh interval, seen while parked
  const mv=moving();
  // sharp while stopped, the reduced scale while moving
  if(Q.stage>0){ if(mv){ Q.stopT=0; showScale(Q.stage); } else if(Math.abs(S.v)<.5){ Q.stopT+=dAny; if(Q.stopT>2000) showScale(0); } }
  if(ran){ const dRan=now-Q.ran; Q.ran=now; if(mv&&dRan<250){ Q.rN++; Q.rT+=dRan; } }
  if(!mv||now<Q.graceUntil||now-Q.t0<10000||!Q.vs) return;
  Q.n++; Q.mT+=dAny; if(dAny>Q.vs*1.5) Q.late++;
  if(Q.mT>=3000) windowDone(now);
}

/* ---------- ⚙️ Graphics picker + Realistic driving switch ---------- */
const pick=document.getElementById('qualPick'), stat=document.getElementById('qualStat'), realBtn=document.getElementById('realBtn');
function paint(){
  if(pick) for(const b of pick.querySelectorAll('button')) b.classList.toggle('on',b.dataset.q===QMODE);
  if(stat) stat.textContent = QMODE==='auto' ? 'Auto: '+LABEL[QL]+' on this device'
    : QL===0 ? 'Lowest battery use · flat ground, fewer trees' : QL===1 ? 'Hills on, mid detail' : 'Everything on · uses the most battery';
  if(realBtn) realBtn.classList.toggle('on',REAL);
}
if(pick) pick.addEventListener('click',e=>{ e.stopPropagation(); const b=e.target.closest('button[data-q]'); if(!b) return;
  if(b.dataset.q==='auto'){ QAUTO.cap=QMAX_AUTO; saveAuto(); }                  // picking Auto (again) lets it retry levels it had given up on
  setQuality(b.dataset.q); Q.stage=0; Q.shown=0; Q.rec=0; setPRScale(1); grace(5000); paint(); });
if(realBtn) realBtn.addEventListener('click',e=>{ e.stopPropagation(); REAL=!REAL; try{ localStorage.setItem('ydReal',REAL?'1':'0'); }catch(_){}
  paint(); toast(REAL?'Realistic driving on: real acceleration, top speed and wet-road grip':'Realistic driving off',2600); });
paint();
// a level change made elsewhere (auto) keeps the panel text right
const prev=window.onPowerChange;
window.onPowerChange=(on)=>{ if(prev) prev(on); paint(); };

/* ---------- ?fps=1 frame meter ---------- */
function meter(now,ran,cost,dAny){
  if(!F.el){ F.el=document.createElement('pre'); F.el.id='fpsMeter';
    F.el.style.cssText='position:fixed;left:calc(env(safe-area-inset-left,0px) + 6px);top:46%;z-index:40;margin:0;padding:5px 7px;border-radius:8px;background:rgba(2,6,23,.72);color:#e2e8f0;font:11px/1.35 ui-monospace,Menlo,monospace;pointer-events:none;white-space:pre';
    document.body.appendChild(F.el); F.t=now; }
  if(ran){ F.n++; F.cost+=cost; if(cost>F.costMax) F.costMax=cost; }
  if(dAny>0&&dAny<1000&&dAny>F.worst) F.worst=dAny;
  if(now-F.t<1000) return;
  const sec=(now-F.t)/1000, w=Q.lastWin;
  F.el.textContent=(F.n/sec).toFixed(0)+' fps  worst '+F.worst.toFixed(0)+' ms\n'
    +'game '+(F.n?F.cost/F.n:0).toFixed(1)+' ms (max '+F.costMax.toFixed(0)+')\n'
    +'map  '+(F.mapN?(F.map/F.mapN).toFixed(1)+' ms x'+F.mapN:'idle')+'\n'
    +LABEL[QL]+(QMODE==='auto'?' (auto)':'')+(CAP30()?' cap30':'')+'\n'
    +'res '+(map.getPixelRatio?map.getPixelRatio():0).toFixed(2)+'x  sharp '+Math.round(SCALES[Q.shown]*100)+'%\n'
    +(w?(w.slow?'slow':w.fast?'fast':'ok')+' '+w.avg.toFixed(0)+' ms late '+Math.round(w.lateF*100)+'%':'measuring…');
  F.n=0; F.cost=0; F.costMax=0; F.worst=0; F.map=0; F.mapN=0; F.t=now;
}
// meter only: time the map's own draw call (a MapLibre internal, so guarded; nothing else depends on it)
if(fpsOn) onReady(function fpsMeter(){ safe('fps meter',()=>{ const r=map._render;
  if(typeof r==='function') map._render=function(){ const t=performance.now(); try{ return r.apply(this,arguments); } finally{ F.map+=performance.now()-t; F.mapN++; } }; }); });

window.QUAL={frame:(now,ran,cost)=>{ try{ frame(now,ran,cost); }catch(e){ if(!Q.err){ Q.err=1; console.warn('[quality]',e); } } }, state:Q, paint};
})();
