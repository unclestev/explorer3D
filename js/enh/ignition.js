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
    else { IGN.state='crank'; IGN.t=0; starter(CRANK[k],k); if(CARKEY==='navigator') welcome(); say('🔑 Starting…',1000); } }
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

/* Lincoln Navigator: the start-up chime (owner 2026-11-21, a recording of starting a 2025 Navigator). Measured from it
   and re-synthesized, not the recording: about two seconds of soft bells over a warm pad, in F-sharp major — a high
   A#6 bell with F#5 over an F#3/F#4/C#5 chord, moving to G#4/A#4/C#5 with an A#5 bell, a C#6 bell on top, and a brief
   E5/A4 colour at the end before it fades. Bells: a few inharmonic partials with long soft decays; the pad swells in. */
const NOTE=n=>440*Math.pow(2,(n-69)/12);                            // MIDI note -> Hz
let CHIME=null;
function chimeBuf(ctx){ if(CHIME&&CHIME.sampleRate===ctx.sampleRate) return CHIME;
  const sr=ctx.sampleRate, len=2.6, n=Math.round(sr*len), b=ctx.createBuffer(2,n,sr), L=b.getChannelData(0), R=b.getChannelData(1);
  const bell=(t0,m,g,pan)=>{ const f=NOTE(m), parts=[[1,1,1.4],[2.01,.45,.7],[2.76,.22,.45],[5.4,.1,.2]], i0=Math.round(t0*sr);
    for(const [r,a,d] of parts){ const w=2*Math.PI*f*r/sr, dec=Math.exp(-1/(d*sr)); let e=a*g;
      for(let i=i0;i<n;i++){ const k=i-i0, at=Math.min(1,k/(sr*.004)), v=Math.sin(w*k)*e*at; L[i]+=v*(1-pan*.4); R[i]+=v*(1+pan*.4); e*=dec; } } };
  const pad=(t0,t1,ms,g)=>{ for(const m of ms){ const f=NOTE(m); for(const det of [-.003,.003]){ const w=2*Math.PI*f*(1+det)/sr;
      for(let i=Math.round(t0*sr);i<Math.min(n,Math.round((t1+.6)*sr));i++){ const t=i/sr, up=Math.min(1,(t-t0)/.35), down=t>t1?Math.max(0,1-(t-t1)/.6):1;
        const v=(Math.sin(w*i)+.25*Math.sin(2*w*i))*g*up*up*down; L[i]+=v*(det<0?1.1:.9); R[i]+=v*(det<0?.9:1.1); } } } };
  pad(0,.8,[54,66,73],.05); pad(.8,1.45,[68,70,73],.045); pad(1.45,1.75,[69,76],.035); pad(1.75,2.0,[54,66,73],.035);   // F#3 F#4 C#5 / G#4 A#4 C#5 / A4 E5 / F#
  bell(.02,94,.22,.3); bell(.06,78,.3,-.2); bell(.14,73,.22,.1); bell(.82,82,.24,-.3); bell(1.04,70,.2,.2); bell(1.28,85,.2,.35); bell(1.5,76,.14,-.1); bell(1.78,78,.18,0);
  let pk=0; for(let i=0;i<n;i++) pk=Math.max(pk,Math.abs(L[i]),Math.abs(R[i]));
  for(let i=0;i<n;i++){ const f=Math.min(1,(n-i)/(sr*.3)); L[i]=L[i]/pk*.8*f; R[i]=R[i]/pk*.8*f; }
  return CHIME=b; }
function welcome(){ const A=window.SOUND&&SOUND.state; if(!A||!A.ctx||!A.bus||!SOUND.on||A.ctx.state!=='running') return;
  try{ const src=A.ctx.createBufferSource(); src.buffer=chimeBuf(A.ctx); const g=A.ctx.createGain(); g.gain.value=window.COCKPIT&&COCKPIT.on?.55:.3;
    src.connect(g); g.connect(A.ctx.destination); src.start(); }catch(e){ console.warn('chime',e); } }   // straight out: it's the car's speakers, not muffled

/* I key and the ⏻ button */
addEventListener('keydown',e=>{ if(!e.repeat&&e.key.toLowerCase()==='i'&&!(e.target&&e.target.tagName==='INPUT')) IGN.button(); });
const b=document.createElement('button'); b.id='ignBtn'; b.setAttribute('aria-label','Engine start / stop'); b.textContent='⏻';
const box=document.getElementById('sigBtns'); if(box) box.insertBefore(b,box.firstChild);
b.addEventListener('pointerdown',e=>e.stopPropagation()); b.addEventListener('click',e=>{ e.stopPropagation(); IGN.button(); });
function show(){ b.classList.toggle('off',IGN.state==='off'||IGN.state==='stop'); if(typeof dirty!=='undefined') dirty=true; }
show();
})();
