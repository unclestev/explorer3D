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
// the Explorer's flare after it fires (owner's 2022 Explorer video): up in ~0.2 s, held high for about a second, then down
// to idle within ~0.6 s
function HOLD(u){ return Math.min(1,u*5)*(u<1?1:Math.exp(-(u-1)*3.2)); }
window.IGN=IGN;
const say=(m,ms)=>{ if(typeof toast==='function') toast(m,ms||1600); };
const kind=()=>mode==='tractor'?'diesel':(typeof CARKEY==='string'&&CARKEY==='modely')?'ev':/^javelin/.test(CARKEY||'')?'v8':CARKEY==='navigator'?'lux':'gas';
const CRANK={gas:.35,v8:1.3,diesel:1.6,ev:0,lux:0};                // the Navigator: no starter sound, just the chime
                                                                  // as the engine comes quietly to life (owner 2026-11-21)                       // seconds of cranking before it catches
IGN.drive=()=>IGN.state==='on';
IGN.button=function(){
  if(mode!=='car'&&mode!=='tractor') return;
  if(IGN.state==='on'||IGN.state==='crank'){
    if(Math.abs(S.v||0)>2.3){ say('Slow down to switch the engine off'); return; }
    IGN.state='stop'; IGN.t=0; if(window.AUTO&&AUTO.on) AUTO.takeover();
    say(kind()==='ev'?'⏻ Model Y off':'🔑 Engine off'); }
  else { const k=kind();
    if(k==='ev'){ IGN.state='on'; say('⏻ Model Y on — ready to drive'); }
    else { IGN.state='crank'; IGN.t=0; const own=custom();             // your own start-up sound (⚙️), if you chose one, replaces the chimes
      if(k==='gas'){ startLayer(); if(!own) explorerChime(); } else if(k!=='lux') starter(CRANK[k],k); if(!own&&k==='lux') welcome(); say('🔑 Starting…',1000); } }
  show();
};
// how the engine's revs compare with a running engine's (sound.js multiplies its idle by this while starting/stopping):
// cranking ~250 rpm with a lumpy beat, then it catches and flares ~1.6x idle before settling
IGN.rpm=function(idle){ const k=kind(), c=CRANK[k];
  if(IGN.state==='off') return 60;
  if(IGN.state==='stop') return Math.max(60,idle*(1-IGN.t/.7));            // winds down (the sound fades with it)
  if(IGN.state==='crank'){ if(IGN.t<c) return 200+60*Math.sin(IGN.t*2*Math.PI*(k==='diesel'?4:5));
    const u=IGN.t-c;
    // Explorer (owner 2026-11-21, a video of a 2022 Explorer starting): a short, quiet crank, then it fires hard, flares to
    // about twice idle within ~0.2 s and settles back over a second and a half to a slightly fast cold idle
    if(k==='gas') return idle*(1.06+.95*HOLD(u));
    return idle*(1+(c?.7:.2)*Math.exp(-u*2.2)*Math.min(1,u*(c?8:3))); }
  return null; };
// the throttle the engine sound should use while starting: a little while cranking; the Explorer fires hard (as loud as
// a good push on the gas) and quietens as it settles, the way it does in the owner's video
IGN.load=function(){ if(IGN.state!=='crank') return 0; const k=kind(), c=CRANK[k];
  if(IGN.t<c) return .15; if(k!=='gas') return 0; return .6*HOLD(IGN.t-c); };
FRAME_HOOKS.push(function ignition(dt){
  if(IGN.state==='crank'){ IGN.t+=dt; if(IGN.t>CRANK[kind()]+(kind()==='gas'?2.4:1.2)){ IGN.state='on'; show(); } }
  else if(IGN.state==='stop'){ IGN.t+=dt; if(IGN.t>.8){ IGN.state='off'; show(); } }
  return false;
});
/* getting in (owner 2026-11-22: "when I get in the car, can the car be off?"): climbing back in after a walk, or picking
   another car or the tractor, you find it switched off — press start. The game still opens with the engine running, and
   the boat and the hang glider are always "on". */
let ready=false; setTimeout(()=>{ ready=true; },4000);             // the car chosen while the game loads doesn't count
const parked=()=>{ if(!(mode==='car'||mode==='tractor')) return false; IGN.state='off'; IGN.t=0; show(); return true; };
{ const prev=window.onCarChange; window.onCarChange=k=>{ if(prev) prev(k); if(!(ready&&parked())){ IGN.state='on'; show(); } }; }
{ const prev=window.onModeChange; window.onModeChange=(m,was)=>{ if(prev) prev(m,was); if(!(ready&&was==='walk'&&parked())){ IGN.state='on'; show(); } }; }

/* Explorer start-up layer (owner 2026-11-21: "make it sound like the one I sent you" — a 2022 Explorer starting). The game's
   engine sound is the smooth note of the exhaust; the video also has the starter's low groan and the engine's mechanical
   clatter (valvetrain, injectors, intake) loud as it fires and fading as it settles — much more sound at 250-1000 Hz
   and a ticking above 2 kHz. This adds those, timed to IGN.rpm(): a low, heavy starter for 0.35 s, then the clatter
   pulsing with each firing, strongest at the flare, fading into the idle by ~3 s. Synthesized (no recording); its
   band levels were set against the video's. EXPLORER_START is a pure function so tools can render it offline. */
function EXPLORER_START(sr){
  const len=6.5, n=Math.round(sr*len), out=new Float32Array(n), c=.35, idle=650, W=XW;
  const bp=(fc,q)=>{ const f=2*Math.sin(Math.PI*fc/sr); let lo=0,bd=0; return x=>{ const hi=x-lo-bd/q; bd+=f*hi; lo+=f*bd; return bd; }; };
  const two=(fc,q)=>{ const a=bp(fc,q), b=bp(fc,q); return x=>b(a(x))*.35; };
  const b1=two(380,2), b2=two(780,2), b3=two(3500,1.2), bg=two(900,1.2), b0=bp(55,1.2), bs=bp(150,2), bsub=bp(40,1.5);
  let s=4242, fph=0, sph=0;
  const rnd=()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296-.5; };
  for(let i=0;i<n;i++){ const t=i/sr, w=rnd(); let y=0;
    if(t<c+.04){ // the starter: a low groan loaded by the compression strokes, with the gear's grind on top
      sph+=2*Math.PI*(38+14*Math.min(1,t/.15))/sr; const comp=.55+.45*Math.max(0,Math.sin(2*Math.PI*t*9));
      const env=Math.min(1,t/.02)*Math.min(1,(c+.04-t)/.04);
      y+=(Math.sin(sph)*.6+Math.sin(sph*2)*.25+b0(w)*.6+bs(w)*.08+bg(w)*W.grind)*comp*env*.025; }
    else { const u=t-c, h=HOLD(u), r=idle*(1.06+.95*h);
      fph+=r/60*3/sr; const pc=.5+.5*Math.cos(2*Math.PI*fph), p=pc*pc*pc;           // one knock per firing (V6: 3 a turn)
      const fade=Math.min(1,Math.max(0,(len-t)/1.5));
      y+=( b0(w)*p*(W.sub0+W.sub1*h) + bsub(w)*W.thump*h                             // the low thump of the firings (strong at the flare)
         + b1(w)*(.4+.6*p)*(W.c380f*h+W.c380i)                                       // 380 Hz clatter
         + b2(w)*(.3+.7*p)*(W.c780f*h+W.c780i*(1-h))                                 // 780 Hz: the idle's valvetrain
         + b3(w)*p*p*W.tick*(1-h) )*fade; }                                          // a fine ticking above 2 kHz at idle
    out[i]=y; }
  return out; }
// weights of each part, set by rendering the start and comparing band by band with the owner's video
// (an automatic search over these, 2026-11-21, came out closest to the video — 4.7 dB average difference across eight
// bands in the crank, flare, hold and idle, from 10.2 — with only the starter's grind and a little low knock: the game's
// own engine sound already carries the rest; the other parts stay here at 0 for later tuning)
const XW={grind:2,sub0:.1,sub1:0,thump:0,c380f:0,c380i:0,c780f:0,c780i:0,tick:0};
// Explorer start-up chime (owner 2026-11-21: "make the chime like the video", the dings in their 2022 Explorer video).
// Measured from it, synthesized: each "ding" is really three soft notes, one after the other — A4 (440 Hz), then 0.15 s
// later E5 (661 Hz, with a second tone at 677 Hz beating against it), then 0.30 s after the start a note at 543 Hz — the
// later two ~9 dB under the first, all nearly pure tones dying away ~43 dB a second. A ding every 1.6 s, four of them.
// Plays straight to the speakers (it's the car's own chime speaker).
function EXPLORER_CHIME(sr){
  const len=6, n=Math.round(sr*len), out=new Float32Array(n), tau=.2;
  const NOTES=[[0,440.2,1],[.15,660.6,.35],[.15,676.8,.33],[.15,692.1,.18,.025],[.30,542.7,.36]];   // [delay, Hz, level, decay s]
  for(let k=0;k<4;k++){ const t0=.70+k*1.6;   // ~0.35 s after the engine fires, as in the video
    for(const [dt,f,a,d] of NOTES){ const i0=Math.round((t0+dt)*sr), w=2*Math.PI*f/sr, dec=Math.exp(-1/((d||tau)*sr));
      let e=a; for(let i=i0;i<n&&e>1e-4;i++){ const j=i-i0; out[i]+=Math.sin(w*j)*e*Math.min(1,j/(sr*.004)); e*=dec; } } }
  let pk=0; for(const v of out) pk=Math.max(pk,Math.abs(v)); for(let i=0;i<n;i++) out[i]=out[i]/pk*.7*Math.min(1,(n-i)/(sr*.2));
  return out; }
let ECHIME=null;
function explorerChime(){ const A=window.SOUND&&SOUND.state; if(!A||!A.ctx||!SOUND.on||A.ctx.state!=='running') return;
  try{ const sr=A.ctx.sampleRate; if(!ECHIME||ECHIME.sampleRate!==sr){ const d=EXPLORER_CHIME(sr); ECHIME=A.ctx.createBuffer(1,d.length,sr); ECHIME.getChannelData(0).set(d); }
    const src=A.ctx.createBufferSource(); src.buffer=ECHIME; const g=A.ctx.createGain(); g.gain.value=window.COCKPIT&&COCKPIT.on?.35:.21;   // level set against the video
    src.connect(g); g.connect(A.ctx.destination); src.start(); }catch(e){ console.warn('explorer chime',e); } }
let ESTART=null;
function startLayer(){ const A=window.SOUND&&SOUND.state; if(!A||!A.ctx||!A.bus||!SOUND.on||A.ctx.state!=='running') return;
  try{ const sr=A.ctx.sampleRate; if(!ESTART||ESTART.sampleRate!==sr){ const d=EXPLORER_START(sr); ESTART=A.ctx.createBuffer(1,d.length,sr); ESTART.getChannelData(0).set(d); }
    const src=A.ctx.createBufferSource(); src.buffer=ESTART; const g=A.ctx.createGain(); g.gain.value=(window.COCKPIT&&COCKPIT.on?1:.6)*START_GAIN;
    src.connect(g); g.connect(A.bus); src.start(); }catch(e){ console.warn('start layer',e); } }
const START_GAIN=4;                                                // set against the engine sound's level (see EXPLORER_START)
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
    const src=A.ctx.createBufferSource(); src.buffer=b; const g=A.ctx.createGain(); g.gain.value=(window.COCKPIT&&COCKPIT.on?.8:.45)*(k==='gas'?.5:1);   // the Explorer's starter is barely heard
    src.connect(g); g.connect(A.bus); src.start(); }catch(e){ console.warn('starter',e); } }

/* Lincoln Navigator: the start-up chime (owner 2026-11-21, a recording of starting a 2025 Navigator). Transcribed from it
   note by note and played on our own synthesized instruments (not the recording; the exact recording can be loaded in
   ⚙️ → Start-up sound): one 1.77 s phrase in F-sharp major — a high A#6 bell over F#5, a soft F#3 string swell, marimba
   notes G#5 · C#4 · F#4+F#5 (with the bell again) · G#4 · a held C#5 with A#5 on top · A#4 to close. */
const NOTE=n=>440*Math.pow(2,(n-69)/12);                            // MIDI note -> Hz
let CHIME=null;
function chimeBuf(ctx){ if(CHIME&&CHIME.sampleRate===ctx.sampleRate) return CHIME;
  const sr=ctx.sampleRate, len=7, n=Math.round(sr*len), b=ctx.createBuffer(2,n,sr), L=b.getChannelData(0), R=b.getChannelData(1);
  const DOWN=-5;                                                  // owner: "a little deeper" — the whole tune down a fourth (F# -> C# major)
  const add=(t0,m,g,pan,parts,atk)=>{ const f=NOTE(m+DOWN), i0=Math.round(t0*sr);
    for(const [r,a,d] of parts){ const w=2*Math.PI*f*r/sr, dec=Math.exp(-1/(d*sr)); let e=a*g;
      for(let i=i0;i<n&&e>1e-5;i++){ const k=i-i0, at=Math.min(1,k/(sr*atk)), v=Math.sin(w*k)*e*at; L[i]+=v*(1-pan*.5); R[i]+=v*(1+pan*.5); e*=dec; } } };
  const bell=(t,m,g,p)=>add(t,m,g,p,[[1,1,1.1],[2.0,.3,.5],[2.76,.18,.3],[5.4,.06,.12]],.002);     // high glassy bell
  const mar=(t,m,g,p)=>add(t,m,g,p,[[1,1,.55],[3.93,.28,.06],[9.2,.06,.02]],.0015);                 // marimba bar
  const str=(t0,t1,m,g)=>{ const f=NOTE(m); for(const det of [-.004,0,.004]){ const w=2*Math.PI*f*(1+det)/sr;   // bowed string swell
      for(let i=Math.round(t0*sr);i<Math.min(n,Math.round((t1+.4)*sr));i++){ const t=i/sr, up=Math.min(1,(t-t0)/.18), dn=t>t1?Math.max(0,1-(t-t1)/.4):1, vib=1+.004*Math.sin(2*Math.PI*5.2*t);
        const v=(Math.sin(w*i*vib)+.45*Math.sin(2*w*i*vib)+.2*Math.sin(3*w*i*vib))*g*up*dn/3; L[i]+=v; R[i]+=v; } } };
  // owner 2026-11-21: "get rid of the first part dinging and make it seven seconds long" — the opening A#6 bell / F#5 is
  // gone, and the phrase repeats as in the video (every 1.77 s) to fill seven seconds, fading out at the end
  // (the low string swells under the notes, which sounded like background noise, are gone too)
  for(let k=0;k<4;k++){ const o=k*1.77-.36;
    mar(o+.38,80,.22,.2); mar(o+.66,80,.26,.2);                // G#5
    mar(o+.74,61,.42,-.3);                                     // C#4
    mar(o+.82,66,.5,-.1); mar(o+.82,78,.32,.1); bell(o+.8,94,.3,.3);   // F#4 + F#5 with the bell
    mar(o+.94,68,.5,0);                                        // G#4
    mar(o+1.02,73,.4,0);                                       // C#5
    mar(o+1.15,82,.38,.25); bell(o+1.15,94,.18,.3);            // A#5 on top
    mar(o+1.48,70,.36,-.15); }                                 // A#4 to close
  let pk=0; for(let i=0;i<n;i++) pk=Math.max(pk,Math.abs(L[i]),Math.abs(R[i]));
  for(let i=0;i<n;i++){ const f=Math.min(1,(n-i)/(sr*.5)); L[i]=L[i]/pk*.8*f; R[i]=R[i]/pk*.8*f; }
  return CHIME=b; }
function welcome(){ const A=window.SOUND&&SOUND.state; if(!A||!A.ctx||!A.bus||!SOUND.on||A.ctx.state!=='running') return;
  try{ const src=A.ctx.createBufferSource(); src.buffer=chimeBuf(A.ctx); const g=A.ctx.createGain(); g.gain.value=window.COCKPIT&&COCKPIT.on?.55:.3;
    src.connect(g); g.connect(A.ctx.destination); src.start(); }catch(e){ console.warn('chime',e); } }   // straight out: it's the car's speakers, not muffled

/* ⚙️ Start-up sound: your own sound file for the car you're in (owner 2026-11-21: "make it the same exact thing as the
   video"). Saved only in this browser (localStorage ydStartSnd_<car>), never uploaded or put in the game's files; plays
   when you start that car, along with the starter (in place of the Navigator's built-in chime). Audio or video files up to ~2.5 MB (only the sound is used). */
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
function sndStat(){ const el=document.getElementById('startSndStat'); if(el) el.textContent=stored()?'Your file, for this car':(mode!=='tractor'&&CARKEY==='navigator')?'Built-in chime':'None — just the engine'; }
{ const fb=document.getElementById('startSndBtn'), fi=document.getElementById('startSndFile'), rb=document.getElementById('startSndReset');
  if(fb&&fi){ fb.addEventListener('click',e=>{ e.stopPropagation(); fi.click(); });
    fi.addEventListener('change',()=>{ const f=fi.files&&fi.files[0]; fi.value=''; if(!f) return;
      if(f.size>2.5e6){ say('That file is too big — trim it to a few seconds (under 2.5 MB)',3500); return; }
      const r=new FileReader(); r.onload=()=>{ try{ localStorage.setItem(SKEY(),r.result); sndStat(); say('🔑 Start-up sound set for this car — press start to hear it',3000); }
        catch(e){ say('Not enough room to save that file — try a shorter one',3500); } }; r.readAsDataURL(f); }); }
  if(rb) rb.addEventListener('click',e=>{ e.stopPropagation(); try{ localStorage.removeItem(SKEY()); }catch(_){} sndStat(); say('Start-up sound removed',1600); }); }
{ const prev=window.onCarChange; window.onCarChange=k=>{ if(prev) prev(k); sndStat(); }; }
sndStat();

/* I key and the ⏻ button */
/* the I key: js/enh/controls.js */
const b=document.createElement('button'); b.id='ignBtn'; b.setAttribute('aria-label','Engine start / stop'); b.textContent='⏻';
const box=document.getElementById('sigBtns'); if(box) box.insertBefore(b,box.firstChild);
b.addEventListener('pointerdown',e=>e.stopPropagation()); b.addEventListener('click',e=>{ e.stopPropagation(); IGN.button(); });
function show(){ b.classList.toggle('off',IGN.state==='off'||IGN.state==='stop'); if(typeof dirty!=='undefined') dirty=true; }
show();
})();
