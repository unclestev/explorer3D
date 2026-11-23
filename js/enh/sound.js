/* Engine sounds and the ⚙️ Sound switch.
   - Sound switch (saved as ydAudio, on by default). Phones only allow sound after a tap, so it starts on your first touch.
   - Each car has its own synthesized engine (js/enh/engine-worklet.js; no recordings are used):
       Explorer ST  3.0 L twin-turbo EcoBoost V6, 10-speed automatic, turbo whistle and boost
       AMC Javelin  401 V8 with dual exhaust, 3-speed automatic
       Navigator    3.5 L twin-turbo EcoBoost V6 (the EcoBoost synth through the Navigator's 10-speed, axle and 22" tyres)
       Model Y      electric (2023 Long Range AWD): no engine — motor whine locked to motor speed through its 9:1 single-speed
                    gearbox, a quieter whine under regen, and the low-speed pedestrian warning hum below 19 mph
       Tractor      John Deere PowerTech 6.8 L inline-six turbo diesel (6R-series style), IVT transmission: the engine
                    speed follows the throttle (850 idle -> 2,100 rated), not the road speed
   - Engine speed comes from a model of each car's drivetrain (gear ratios, axle, tyre size, torque converter, shift
     points that rise with how hard you press the gas, kickdown when you floor it). Shift points grow with the
     pedal squared-and-a-half, so a normal press (0.5-0.7) shifts around 2,000-3,000 rpm like a real automatic and only
     a full press holds the revs high (holding ~4,000 rpm at a normal press made the cars sound like chain saws).
   - Nothing runs while sound is off, you're in the boat/glider/on foot, or the app is hidden. */
(()=>{
'use strict';
const btn=document.getElementById('audioBtn');
let on=true; try{ on=localStorage.getItem('ydAudio')!=='0'; }catch(e){}

// drivetrains. shiftUp/Down: rpm thresholds at light throttle, plus how much they rise at full throttle.
const ENG={
  ecoboost30:{                                                   // 2020+ Explorer ST: 10R60 10-speed, 3.73 axle, 275/45R21
    gears:[4.70,2.99,2.15,1.80,1.52,1.28,1.00,.85,.69,.64], axle:3.73, tyre:.781*Math.PI,
    idle:650, redline:6250, up:[1500,4300], down:[1050,1700], kick:5200, flare:[1100,2000], gain:.30, skip:true},
  ecoboost35:{proc:'ecoboost30',                                 // 2025+ Navigator: 3.5 L twin-turbo V6 (same EcoBoost voice), 10R80 10-speed,
    gears:[4.70,2.99,2.15,1.80,1.52,1.28,1.00,.85,.69,.64], axle:3.31, tyre:.815*Math.PI,   // 3.31 axle, 285/45R22
    idle:600, redline:6000, up:[1400,3900], down:[1000,1500], kick:5000, flare:[1000,1900], gain:.27, skip:true},
  amc401:{                                                       // Javelin: 3-speed TorqueCommand, 3.15 axle, 26.5" tyres
    gears:[2.45,1.45,1.0], axle:3.15, tyre:.673*Math.PI,
    idle:700, redline:5200, up:[1700,3000], down:[1050,1300], kick:4200, flare:[1500,2400], gain:.32, skip:false},
  jd68:{ivt:true, idle:850, rated:2100, gain:.17},                // John Deere 6R-style tractor (any car: used in the tractor)
  tesla:{ev:true, ratio:9.04, tyre:.737*Math.PI, gain:.42}        // Model Y: 9.04:1 single speed, 255/45R20 tyres (no idle, no gears)
};
const A={ctx:null,nodes:{},ready:false,failed:false,rpm:700,gear:0,shiftT:0,boost:0,gainNow:{},key:null};
const engKey=()=>mode==='tractor'?'jd68':typeof CARSPEC!=='undefined'?CARSPEC.sound:null;
function wanted(){ return on&&!document.hidden&&!!ENG[engKey()]&&(mode==='car'||mode==='tractor')&&!(window.IGN&&IGN.state==='off'); }   // js/enh/ignition.js: engine switched off

// iPhone only lets sound start inside a tap, so the context is created and resumed right in the tap handler;
// the engines (an AudioWorklet module) load a moment later.
function start(){
  if(A.ctx||A.failed) return;
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC){ A.failed=true; return; }
  try{ A.ctx=new AC({latencyHint:'interactive'}); A.ctx.resume().catch(()=>{}); }catch(e){ A.failed=true; return; }
  if(!A.ctx.audioWorklet){ A.failed=true; console.warn('engine sound: AudioWorklet not supported'); return; }
  // everything goes through a "cabin" filter pair: wide open outside; from the cockpit view (js/enh/cockpit.js) the highs are
  // muffled and the low boom comes up a little, the way an engine and the road sound from inside a closed car
  A.bus=A.ctx.createBiquadFilter(); A.bus.type='lowpass'; A.bus.frequency.value=20000; A.bus.Q.value=.5;
  A.boom=A.ctx.createBiquadFilter(); A.boom.type='peaking'; A.boom.frequency.value=110; A.boom.Q.value=.9; A.boom.gain.value=0;
  A.bus.connect(A.boom); A.boom.connect(A.ctx.destination);
  A.ctx.audioWorklet.addModule('js/enh/engine-worklet.js?v=5').then(()=>{
    for(const k of Object.keys(ENG)){
      const n=new AudioWorkletNode(A.ctx,ENG[k].proc||k,{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
      n.connect(A.bus); A.nodes[k]=n; A.gainNow[k]=0; }
    A.ready=true;
  }).catch(e=>{ A.failed=true; console.warn('engine sound',e); });
}
function unlock(){ if(!wanted()) return; start(); if(A.ctx&&A.ctx.state!=='running') A.ctx.resume().catch(()=>{}); }
for(const t of ['pointerdown','touchend','click','keydown']) document.addEventListener(t,unlock,{passive:true});

// drivetrain model -> engine rpm, load and (EcoBoost) turbo boost
function engine(E,dt){
  if(E.ivt) return tractor(E,dt);
  if(E.ev) return electric(E,dt);
  const v=Math.abs(S.v||0), gas=Math.max(0,S.gas||0), shaft=v/E.tyre*60*E.axle, G=E.gears;
  const inGear=g=>shaft*G[g];
  if(S.v<-.2) A.gear=0;                                          // reverse: low ratio
  else{
    const g25=Math.pow(gas,2.5), up=E.up[0]+g25*E.up[1], down=Math.min(E.down[0]+g25*E.down[1],up/1.7); A.shiftT-=dt;   // no hunting between gears
    if(A.shiftT<=0){
      if(A.gear<G.length-1&&inGear(A.gear)>up){ A.gear++; A.shiftT=E.skip?.35:.6; }
      else if(A.gear>0&&inGear(A.gear)<down&&inGear(A.gear-1)<E.redline*.85){ A.gear--; A.shiftT=E.skip?.35:.6; }
      else if(gas>.85&&A.gear>0&&inGear(A.gear-1)<E.kick){       // kickdown (the 10-speed skips straight to the right gear)
        do A.gear--; while(E.skip&&A.gear>0&&inGear(A.gear-1)<E.kick);
        A.shiftT=.8; }
    }
  }
  const geared=inGear(A.gear)*(1+.04*gas);                     // converter slip under load
  const flare=E.idle+E.flare[0]*gas*Math.max(0,1-geared/E.flare[1]);   // revs flare against the converter from a stop
  let target=Math.min(E.redline,Math.max(E.idle,geared,flare));
  if(v<.3&&gas>.05) target=Math.min(E.redline,E.idle+E.flare[1]*gas*.9);
  A.rpm+=(target-A.rpm)*Math.min(1,dt*(target>A.rpm?5:3.5));     // flywheel inertia
  // turbo boost builds with throttle once the engine is off idle, with spool lag; drops fast when you lift
  const want=gas*Math.min(1,Math.max(0,(A.rpm-1300)/1800));
  A.boost+=(want-A.boost)*Math.min(1,dt*(want>A.boost?1.8:6));
  return {rpm:A.rpm, load:gas, boost:A.boost};
}

// tractor: the governor holds the speed the throttle asks for; the IVT transmission handles road speed. Revs rise a
// little with speed when you're coasting, dip briefly under a sudden heavy load (lugging), and the turbo builds slowly.
function tractor(E,dt){
  const v=Math.abs(S.v||0), gas=Math.max(0,S.gas||0);
  const target=Math.min(E.rated,E.idle+(E.rated-E.idle)*Math.min(1,gas*1.15)+Math.min(250,v*9)*(1-gas));
  const lug=Math.max(0,gas-(A.lastGas||0))*260; A.lastGas=gas;
  A.rpm+=(target-A.rpm)*Math.min(1,dt*(target>A.rpm?2.2:1.6)); A.rpm=Math.max(E.idle*.9,A.rpm-lug);
  const want=gas*Math.min(1,Math.max(0,(A.rpm-1100)/800));
  A.boost+=(want-A.boost)*Math.min(1,dt*(want>A.boost?1.2:4));
  return {rpm:A.rpm, load:gas, boost:A.boost};
}

// electric: motor speed is road speed through the one fixed gear; load is the pedal, or minus the regen when you lift
function electric(E,dt){
  const v=Math.abs(S.v||0), gas=Math.max(0,S.gas||0), brk=Math.max(0,-(S.gas||0));
  A.rpm=v/E.tyre*60*E.ratio; A.gear=0;
  const regen=gas<=.05&&v>.3&&CARSPEC&&CARSPEC.regen&&S.sel!=='N'?Math.min(1,(v-.3)/3.5)*.6+.3*brk:0;
  const want=gas>.05?gas:-regen; A.load=(A.load||0)+(want-(A.load||0))*Math.min(1,dt*6);
  return {rpm:A.rpm, load:A.load, boost:0, speed:v};
}

// called every frame by the game loop; never asks for a redraw
FRAME_HOOKS.push(function engineSound(dt){
  if(!A.ready) return false;
  const want=wanted(), key=engKey(), t=A.ctx.currentTime;
  if(key!==A.key){ A.key=key; const E=ENG[key]; A.rpm=E?(E.idle||0):700; A.gear=0; A.boost=0; A.load=0; }
  const e=ENG[key]?engine(ENG[key],dt||.016):null;
  // starting / stopping the engine (js/enh/ignition.js): cranking, catching and winding down override the revs
  if(e&&window.IGN&&!ENG[key].ev){ const r=IGN.rpm(ENG[key].idle||700); if(r!==null){ A.rpm=e.rpm=r; e.load=IGN.load?IGN.load():IGN.state==='crank'?.15:0; e.boost=0; A.boost=0; } }
  for(const k of Object.keys(A.nodes)){
    const P=A.nodes[k].parameters, g=(want&&k===key)?ENG[k].gain:0;
    if(g>0&&e){ P.get('rpm').setTargetAtTime(e.rpm,t,.03); P.get('load').setTargetAtTime(e.load,t,.05);
      const b=P.get('boost'); if(b) b.setTargetAtTime(e.boost,t,.05);
      const sp=P.get('speed'); if(sp) sp.setTargetAtTime(e.speed||0,t,.05); }
    if(Math.abs(g-A.gainNow[k])>.001){ P.get('gain').setTargetAtTime(g,t,g>A.gainNow[k]?.15:.25); A.gainNow[k]=g; }
  }
  // let the phone rest when there's nothing to play
  if(!want&&!H.on&&A.ctx.state==='running'){ clearTimeout(A.sus); A.sus=setTimeout(()=>{ if(!wanted()&&A.ctx) A.ctx.suspend().catch(()=>{}); },800); }
  else if(want&&A.ctx.state==='suspended'){ clearTimeout(A.sus); A.ctx.resume().catch(()=>{}); }
  return false;
});
document.addEventListener('visibilitychange',()=>{ if(!A.ctx) return; if(document.hidden) A.ctx.suspend().catch(()=>{}); else if(wanted()) A.ctx.resume().catch(()=>{}); });

function setOn(v){ on=v; try{ localStorage.setItem('ydAudio',v?'1':'0'); }catch(e){} if(btn) btn.classList.toggle('on',on); if(on) unlock(); }
if(btn){ btn.classList.toggle('on',on); btn.addEventListener('click',e=>{ e.stopPropagation(); setOn(!on); }); }
const prev=window.onCarChange;
window.onCarChange=(k)=>{ if(prev) prev(k); if(wanted()) unlock(); };
function cabin(inside,tractor){ if(!A.bus) return; const t=A.ctx.currentTime;
  A.bus.frequency.setTargetAtTime(inside?(tractor?2600:1700):20000,t,.15); A.boom.gain.setTargetAtTime(inside?(tractor?2:3.5):0,t,.15); }
/* horn (owner 2026-11-22, Controls): held while the key / button is held (js/enh/controls.js 'horn'). Synthesized, no
   recordings: a car horn is two disc horns a musical third or so apart, each a buzzy tone (rich in harmonics) that the
   horn's trumpet narrows round 2-3 kHz. Ford / Lincoln: the usual low-high pair (~410 + 510 Hz); Javelin: an older, lower
   pair; Model Y: one brighter tone; tractor: a single low one. It works with the engine off, like a real car. */
const HORN={explorer:[410,510],expedition:[410,510],navigator:[400,500],tesla:[500],javelin:[350,440],tractor:[300]};
const H={on:false,nodes:null};
function hornTones(){ const k=mode==='tractor'?'tractor':(typeof CARKEY!=='undefined'&&/javelin/.test(CARKEY))?'javelin':(typeof CARSPEC!=='undefined'&&CARSPEC&&CARSPEC.sound==='tesla')?'tesla':(typeof CARKEY!=='undefined'&&HORN[CARKEY])?CARKEY:'explorer'; return HORN[k]; }
function horn(v){ v=!!v&&on&&(mode==='car'||mode==='tractor'); if(v===H.on) return; H.on=v;
  if(v){ start(); if(!A.ctx||A.failed&&!A.ctx) return; if(A.ctx.state!=='running') A.ctx.resume().catch(()=>{}); clearTimeout(A.sus);
    const c=A.ctx, t=c.currentTime, out=c.createGain(); out.gain.setValueAtTime(0,t); out.gain.linearRampToValueAtTime(.16,t+.025);
    const bp=c.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=2400; bp.Q.value=.7;
    const lp=c.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=5000; bp.connect(lp); lp.connect(out); out.connect(A.bus||c.destination);
    const osc=hornTones().map(f=>{ const o=c.createOscillator(); o.type='sawtooth'; o.frequency.value=f; o.detune.value=(Math.random()-.5)*8;
      const g=c.createGain(); g.gain.value=.6; o.connect(g); g.connect(bp); const body=c.createGain(); body.gain.value=.25; o.connect(body); body.connect(lp); o.start(t); return o; });
    H.nodes={out,osc}; }
  else if(H.nodes){ const {out,osc}=H.nodes, t=A.ctx.currentTime; out.gain.cancelScheduledValues(t); out.gain.setValueAtTime(out.gain.value,t); out.gain.linearRampToValueAtTime(0,t+.05);
    for(const o of osc) o.stop(t+.08); setTimeout(()=>out.disconnect(),200); H.nodes=null; } }
// washer pump: a short whirr and the hiss of the jets (js/enh/cockpit.js CK.washer)
function squirt(){ if(!on) return; start(); const c=A.ctx; if(!c) return; if(c.state!=='running') c.resume().catch(()=>{});
  const t=c.currentTime, n=Math.floor(c.sampleRate*.9), buf=c.createBuffer(1,n,c.sampleRate), d=buf.getChannelData(0); for(let i=0;i<n;i++) d[i]=Math.random()*2-1;
  const src=c.createBufferSource(); src.buffer=buf; const bp=c.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=3200; bp.Q.value=.8;
  const g=c.createGain(); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.05,t+.08); g.gain.setValueAtTime(.05,t+.55); g.gain.linearRampToValueAtTime(0,t+.85);
  const m=c.createOscillator(); m.type='triangle'; m.frequency.value=180; const mg=c.createGain(); mg.gain.setValueAtTime(0,t); mg.gain.linearRampToValueAtTime(.025,t+.05); mg.gain.linearRampToValueAtTime(0,t+.7);
  src.connect(bp); bp.connect(g); m.connect(mg); const out=A.bus||c.destination; g.connect(out); mg.connect(out); src.start(t); m.start(t); src.stop(t+.9); m.stop(t+.75); }
// a timer (not a frame hook), so it works parked and in every view
setInterval(()=>horn(window.CTRL&&CTRL.held('horn')),30);
window.SOUND={setOn,get on(){ return on; },state:A,ENG,cabin,horn,squirt,get honking(){ return H.on; }};
})();
