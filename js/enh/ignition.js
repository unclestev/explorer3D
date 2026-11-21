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
    else { IGN.state='crank'; IGN.t=0; starter(CRANK[k],k); if(!custom()&&CARKEY==='navigator') welcome(); say('🔑 Starting…',1000); } }
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

/* Lincoln Navigator: the start-up chime (owner 2026-11-21, a recording of starting a 2025 Navigator). Transcribed from it
   note by note and played on our own synthesized instruments (not the recording; the exact recording can be loaded in
   ⚙️ → Start-up sound): one 1.77 s phrase in F-sharp major — a high A#6 bell over F#5, a soft F#3 string swell, marimba
   notes G#5 · C#4 · F#4+F#5 (with the bell again) · G#4 · a held C#5 with A#5 on top · A#4 to close. */
const NOTE=n=>440*Math.pow(2,(n-69)/12);                            // MIDI note -> Hz
let CHIME=null;
function chimeBuf(ctx){ if(CHIME&&CHIME.sampleRate===ctx.sampleRate) return CHIME;
  const sr=ctx.sampleRate, len=2.4, n=Math.round(sr*len), b=ctx.createBuffer(2,n,sr), L=b.getChannelData(0), R=b.getChannelData(1);
  const add=(t0,m,g,pan,parts,atk)=>{ const f=NOTE(m), i0=Math.round(t0*sr);
    for(const [r,a,d] of parts){ const w=2*Math.PI*f*r/sr, dec=Math.exp(-1/(d*sr)); let e=a*g;
      for(let i=i0;i<n&&e>1e-5;i++){ const k=i-i0, at=Math.min(1,k/(sr*atk)), v=Math.sin(w*k)*e*at; L[i]+=v*(1-pan*.5); R[i]+=v*(1+pan*.5); e*=dec; } } };
  const bell=(t,m,g,p)=>add(t,m,g,p,[[1,1,1.1],[2.0,.3,.5],[2.76,.18,.3],[5.4,.06,.12]],.002);     // high glassy bell
  const mar=(t,m,g,p)=>add(t,m,g,p,[[1,1,.55],[3.93,.28,.06],[9.2,.06,.02]],.0015);                 // marimba bar
  const str=(t0,t1,m,g)=>{ const f=NOTE(m); for(const det of [-.004,0,.004]){ const w=2*Math.PI*f*(1+det)/sr;   // bowed string swell
      for(let i=Math.round(t0*sr);i<Math.min(n,Math.round((t1+.4)*sr));i++){ const t=i/sr, up=Math.min(1,(t-t0)/.18), dn=t>t1?Math.max(0,1-(t-t1)/.4):1, vib=1+.004*Math.sin(2*Math.PI*5.2*t);
        const v=(Math.sin(w*i*vib)+.45*Math.sin(2*w*i*vib)+.2*Math.sin(3*w*i*vib))*g*up*dn/3; L[i]+=v; R[i]+=v; } } };
  bell(.12,94,.5,.3); mar(.16,78,.35,-.2);                 // A#6 bell over F#5
  str(.3,.62,54,.5);                                       // F#3 string swell
  mar(.38,80,.22,.2); mar(.66,80,.26,.2);                  // G#5
  mar(.74,61,.42,-.3);                                     // C#4
  mar(.82,66,.5,-.1); mar(.82,78,.32,.1); bell(.8,94,.3,.3);   // F#4 + F#5, the bell again
  mar(.94,68,.5,0);                                        // G#4
  str(1.02,1.34,73,.42); mar(1.02,73,.4,0);                 // C#5, held
  mar(1.15,82,.38,.25); bell(1.15,94,.18,.3);              // A#5 on top
  mar(1.48,70,.36,-.15);                                   // A#4 to close
  let pk=0; for(let i=0;i<n;i++) pk=Math.max(pk,Math.abs(L[i]),Math.abs(R[i]));
  for(let i=0;i<n;i++){ const f=Math.min(1,(n-i)/(sr*.3)); L[i]=L[i]/pk*.8*f; R[i]=R[i]/pk*.8*f; }
  return CHIME=b; }
function welcome(){ const A=window.SOUND&&SOUND.state; if(!A||!A.ctx||!A.bus||!SOUND.on||A.ctx.state!=='running') return;
  try{ const src=A.ctx.createBufferSource(); src.buffer=chimeBuf(A.ctx); const g=A.ctx.createGain(); g.gain.value=window.COCKPIT&&COCKPIT.on?.55:.3;
    src.connect(g); g.connect(A.ctx.destination); src.start(); }catch(e){ console.warn('chime',e); } }   // straight out: it's the car's speakers, not muffled

/* ⚙️ Start-up sound: your own sound file for the car you're in (owner 2026-11-21: "make it the same exact thing as the
   video"). Saved only in this browser (localStorage ydStartSnd_<car>), never uploaded or put in the game's files; plays
   when you start that car, in place of the built-in chime. Audio or video files up to ~2.5 MB (only the sound is used). */
const SKEY=()=>'ydStartSnd_'+(mode==='tractor'?'tractor':CARKEY), DEC={};
function stored(){ try{ return localStorage.getItem(SKEY()); }catch(e){ return null; } }
function custom(){ const d=stored(); if(!d) return false;
  const A=window.SOUND&&SOUND.state; if(!A||!A.ctx||!SOUND.on||A.ctx.state!=='running') return true;
  const play=buf=>{ try{ const src=A.ctx.createBufferSource(); src.buffer=buf; const g=A.ctx.createGain(); g.gain.value=window.COCKPIT&&COCKPIT.on?1:.6;
      src.connect(g); g.connect(A.ctx.destination); src.start(); }catch(e){ console.warn('start sound',e); } };
  if(DEC[d.length+d.slice(-32)]) play(DEC[d.length+d.slice(-32)]);
  else { const bin=atob(d.split(',')[1]), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
    A.ctx.decodeAudioData(u.buffer).then(b=>{ DEC[d.length+d.slice(-32)]=b; play(b); }).catch(e=>{ console.warn('start sound',e); say('That sound file can\'t be played here'); }); }
  return true; }
function sndStat(){ const el=document.getElementById('startSndStat'); if(el) el.textContent=stored()?'Your file, for this car':'Built-in'; }
{ const fb=document.getElementById('startSndBtn'), fi=document.getElementById('startSndFile'), rb=document.getElementById('startSndReset');
  if(fb&&fi){ fb.addEventListener('click',e=>{ e.stopPropagation(); fi.click(); });
    fi.addEventListener('change',()=>{ const f=fi.files&&fi.files[0]; fi.value=''; if(!f) return;
      if(f.size>2.5e6){ say('That file is too big — trim it to a few seconds (under 2.5 MB)',3500); return; }
      const r=new FileReader(); r.onload=()=>{ try{ localStorage.setItem(SKEY(),r.result); sndStat(); say('🔑 Start-up sound set for this car — press start to hear it',3000); }
        catch(e){ say('Not enough room to save that file — try a shorter one',3500); } }; r.readAsDataURL(f); }); }
  if(rb) rb.addEventListener('click',e=>{ e.stopPropagation(); try{ localStorage.removeItem(SKEY()); }catch(_){} sndStat(); say('Built-in start-up sound',1600); }); }
{ const prev=window.onCarChange; window.onCarChange=k=>{ if(prev) prev(k); sndStat(); }; }
sndStat();

/* I key and the ⏻ button */
addEventListener('keydown',e=>{ if(!e.repeat&&e.key.toLowerCase()==='i'&&!(e.target&&e.target.tagName==='INPUT')) IGN.button(); });
const b=document.createElement('button'); b.id='ignBtn'; b.setAttribute('aria-label','Engine start / stop'); b.textContent='⏻';
const box=document.getElementById('sigBtns'); if(box) box.insertBefore(b,box.firstChild);
b.addEventListener('pointerdown',e=>e.stopPropagation()); b.addEventListener('click',e=>{ e.stopPropagation(); IGN.button(); });
function show(){ b.classList.toggle('off',IGN.state==='off'||IGN.state==='stop'); if(typeof dirty!=='undefined') dirty=true; }
show();
})();
