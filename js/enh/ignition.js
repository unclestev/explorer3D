/* Engine start / stop (owner 2026-11-21: "make it so I can start and stop my vehicles with that button" — the Enter
   button in the middle of the Logitech G29's red dial; js/enh/wheel.js calls IGN.button(), and ⚙️ Wheel → Start button
   picks another). Also the I key and the ⏻ button beside the turn-signal buttons.
   - The game starts with the engine running, as before. Press to switch it off (only below ~5 mph, like a push-button
     start that won't shut down at speed); press again to start it.
   - Engine off: the gas does nothing (the brakes still work and the car rolls to a stop), the engine sound winds down,
     the rev counter drops to 0, and the autopilot lets go.
   - Starting: the starter motor turns the engine over for a moment — longer for the 1970s V8 and the tractor diesel —
     then it catches, flares up and settles to idle (the engine sound follows; js/enh/sound.js reads IGN.rpmFactor).
     The Model Y has no engine: it just switches on and off, silently, like the real car.
   window.IGN = {state ('on','off','crank','stop'), drive(), button(), rpm(base) } */
(()=>{
'use strict';
const IGN={state:'on',t:0};
window.IGN=IGN;
const say=(m,ms)=>{ if(typeof toast==='function') toast(m,ms||1600); };
const kind=()=>mode==='tractor'?'diesel':(typeof CARKEY==='string'&&CARKEY==='modely')?'ev':/^javelin/.test(CARKEY||'')?'v8':'gas';
const CRANK={gas:.8,v8:1.3,diesel:1.6,ev:0};                       // seconds of cranking before it catches
IGN.drive=()=>IGN.state==='on';
IGN.button=function(){
  if(mode!=='car'&&mode!=='tractor') return;
  if(IGN.state==='on'||IGN.state==='crank'){
    if(Math.abs(S.v||0)>2.3){ say('Slow down to switch the engine off'); return; }
    IGN.state='stop'; IGN.t=0; if(window.AUTO&&AUTO.on) AUTO.takeover();
    say(kind()==='ev'?'⏻ Model Y off':'🔑 Engine off'); }
  else { const k=kind();
    if(k==='ev'){ IGN.state='on'; say('⏻ Model Y on — ready to drive'); }
    else { IGN.state='crank'; IGN.t=0; starter(CRANK[k],k); say('🔑 Starting…',1000); } }
  show();
};
// how the engine's revs compare with a running engine's (sound.js multiplies its idle by this while starting/stopping):
// cranking ~250 rpm with a lumpy beat, then it catches and flares ~1.6x idle before settling
IGN.rpm=function(idle){ const k=kind(), c=CRANK[k];
  if(IGN.state==='off') return 60;
  if(IGN.state==='stop') return Math.max(60,idle*(1-IGN.t/.7));            // winds down (the sound fades with it)
  if(IGN.state==='crank'){ if(IGN.t<c) return 200+60*Math.sin(IGN.t*2*Math.PI*(k==='diesel'?4:5));
    const u=IGN.t-c; return idle*(1+.7*Math.exp(-u*2.2)*Math.min(1,u*8)); }
  return null; };
FRAME_HOOKS.push(function ignition(dt){
  if(IGN.state==='crank'){ IGN.t+=dt; if(IGN.t>CRANK[kind()]+1.2){ IGN.state='on'; show(); } }
  else if(IGN.state==='stop'){ IGN.t+=dt; if(IGN.t>.8){ IGN.state='off'; show(); } }
  return false;
});
// a new car or the tractor arrives running
{ const prev=window.onCarChange; window.onCarChange=k=>{ if(prev) prev(k); IGN.state='on'; show(); }; }
{ const prev=window.onModeChange; window.onModeChange=(m,was)=>{ if(prev) prev(m,was); IGN.state='on'; show(); }; }

/* the starter motor: a geared whine rising as it spins up, with a grinding edge, through the engine sound's cabin filter */
function starter(len,k){
  const A=window.SOUND&&SOUND.state; if(!A||!A.ctx||!A.bus||!SOUND.on||A.ctx.state!=='running') return;
  try{ const sr=A.ctx.sampleRate, n=Math.round(sr*(len+.05)), b=A.ctx.createBuffer(1,n,sr), d=b.getChannelData(0);
    const f0=k==='diesel'?170:k==='v8'?210:260; let ph=0, ph2=0, s=99, lp=0;
    for(let i=0;i<n;i++){ const t=i/sr, f=f0*(.55+.45*Math.min(1,t/.25)); ph+=2*Math.PI*f/sr; ph2+=2*Math.PI*f*7.3/sr;
      s=(s*1664525+1013904223)>>>0; lp+=((s/4294967296-.5)-lp)*.25;
      const pulse=.75+.25*Math.sin(2*Math.PI*t*(k==='diesel'?4:5));                   // the compression strokes load it
      const env=Math.min(1,t/.03)*Math.min(1,(len+.05-t)/.05);
      d[i]=(Math.sin(ph)*.5+Math.sin(ph*2)*.25+Math.sin(ph2)*.12+lp*.6)*pulse*env*.5; }
    const src=A.ctx.createBufferSource(); src.buffer=b; const g=A.ctx.createGain(); g.gain.value=window.COCKPIT&&COCKPIT.on?.8:.45;
    src.connect(g); g.connect(A.bus); src.start(); }catch(e){ console.warn('starter',e); } }

/* I key and the ⏻ button */
addEventListener('keydown',e=>{ if(!e.repeat&&e.key.toLowerCase()==='i'&&!(e.target&&e.target.tagName==='INPUT')) IGN.button(); });
const b=document.createElement('button'); b.id='ignBtn'; b.setAttribute('aria-label','Engine start / stop'); b.textContent='⏻';
const box=document.getElementById('sigBtns'); if(box) box.insertBefore(b,box.firstChild);
b.addEventListener('pointerdown',e=>e.stopPropagation()); b.addEventListener('click',e=>{ e.stopPropagation(); IGN.button(); });
function show(){ b.classList.toggle('off',IGN.state==='off'||IGN.state==='stop'); if(typeof dirty!=='undefined') dirty=true; }
show();
})();
