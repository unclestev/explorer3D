/* Engine sounds and the ⚙️ Sound switch.
   - Sound switch (saved as ydAudio, on by default). Phones only allow sound after a tap, so it starts on your first touch.
   - Each car has its own synthesized engine (js/enh/engine-worklet.js; no recordings are used):
       Explorer ST  3.0 L twin-turbo EcoBoost V6, 10-speed automatic, turbo whistle and boost
       AMC Javelin  401 V8 with dual exhaust, 3-speed automatic
   - Engine speed comes from a model of each car's drivetrain (gear ratios, axle, tyre size, torque converter, shift
     points that rise with how hard you press the gas, kickdown when you floor it).
   - Nothing runs while sound is off, you're in the boat/tractor/glider, or the app is hidden. */
(()=>{
'use strict';
const btn=document.getElementById('audioBtn');
let on=true; try{ on=localStorage.getItem('ydAudio')!=='0'; }catch(e){}

// drivetrains. shiftUp/Down: rpm thresholds at light throttle, plus how much they rise at full throttle.
const ENG={
  ecoboost30:{                                                   // 2020+ Explorer ST: 10R60 10-speed, 3.73 axle, 275/45R21
    gears:[4.70,2.99,2.15,1.80,1.52,1.28,1.00,.85,.69,.64], axle:3.73, tyre:.781*Math.PI,
    idle:650, redline:6250, up:[1500,4300], down:[1050,1700], kick:5200, flare:[1100,2000], gain:.30, skip:true},
  amc401:{                                                       // Javelin: 3-speed TorqueCommand, 3.15 axle, 26.5" tyres
    gears:[2.45,1.45,1.0], axle:3.15, tyre:.673*Math.PI,
    idle:700, redline:5200, up:[1700,3000], down:[1050,1300], kick:4200, flare:[1500,2400], gain:.32, skip:false}
};
const A={ctx:null,nodes:{},ready:false,failed:false,rpm:700,gear:0,shiftT:0,boost:0,gainNow:{},key:null};
const engKey=()=>typeof CARSPEC!=='undefined'?CARSPEC.sound:null;
function wanted(){ return on&&!document.hidden&&!!ENG[engKey()]&&mode==='car'; }

// iPhone only lets sound start inside a tap, so the context is created and resumed right in the tap handler;
// the engines (an AudioWorklet module) load a moment later.
function start(){
  if(A.ctx||A.failed) return;
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC){ A.failed=true; return; }
  try{ A.ctx=new AC({latencyHint:'interactive'}); A.ctx.resume().catch(()=>{}); }catch(e){ A.failed=true; return; }
  if(!A.ctx.audioWorklet){ A.failed=true; console.warn('engine sound: AudioWorklet not supported'); return; }
  A.ctx.audioWorklet.addModule('js/enh/engine-worklet.js?v=2').then(()=>{
    for(const k of Object.keys(ENG)){
      const n=new AudioWorkletNode(A.ctx,k,{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
      n.connect(A.ctx.destination); A.nodes[k]=n; A.gainNow[k]=0; }
    A.ready=true;
  }).catch(e=>{ A.failed=true; console.warn('engine sound',e); });
}
function unlock(){ if(!wanted()) return; start(); if(A.ctx&&A.ctx.state!=='running') A.ctx.resume().catch(()=>{}); }
for(const t of ['pointerdown','touchend','click','keydown']) document.addEventListener(t,unlock,{passive:true});

// drivetrain model -> engine rpm, load and (EcoBoost) turbo boost
function engine(E,dt){
  const v=Math.abs(S.v||0), gas=Math.max(0,S.gas||0), shaft=v/E.tyre*60*E.axle, G=E.gears;
  const inGear=g=>shaft*G[g];
  if(S.v<-.2) A.gear=0;                                          // reverse: low ratio
  else{
    const up=E.up[0]+gas*E.up[1], down=E.down[0]+gas*E.down[1]; A.shiftT-=dt;
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

// called every frame by the game loop; never asks for a redraw
FRAME_HOOKS.push(function engineSound(dt){
  if(!A.ready) return false;
  const want=wanted(), key=engKey(), t=A.ctx.currentTime;
  if(key!==A.key){ A.key=key; const E=ENG[key]; A.rpm=E?E.idle:700; A.gear=0; A.boost=0; }
  const e=ENG[key]?engine(ENG[key],dt||.016):null;
  for(const k of Object.keys(A.nodes)){
    const P=A.nodes[k].parameters, g=(want&&k===key)?ENG[k].gain:0;
    if(g>0&&e){ P.get('rpm').setTargetAtTime(e.rpm,t,.03); P.get('load').setTargetAtTime(e.load,t,.05);
      const b=P.get('boost'); if(b) b.setTargetAtTime(e.boost,t,.05); }
    if(Math.abs(g-A.gainNow[k])>.001){ P.get('gain').setTargetAtTime(g,t,g>A.gainNow[k]?.15:.25); A.gainNow[k]=g; }
  }
  // let the phone rest when there's nothing to play
  if(!want&&A.ctx.state==='running'){ clearTimeout(A.sus); A.sus=setTimeout(()=>{ if(!wanted()&&A.ctx) A.ctx.suspend().catch(()=>{}); },800); }
  else if(want&&A.ctx.state==='suspended'){ clearTimeout(A.sus); A.ctx.resume().catch(()=>{}); }
  return false;
});
document.addEventListener('visibilitychange',()=>{ if(!A.ctx) return; if(document.hidden) A.ctx.suspend().catch(()=>{}); else if(wanted()) A.ctx.resume().catch(()=>{}); });

function setOn(v){ on=v; try{ localStorage.setItem('ydAudio',v?'1':'0'); }catch(e){} if(btn) btn.classList.toggle('on',on); if(on) unlock(); }
if(btn){ btn.classList.toggle('on',on); btn.addEventListener('click',e=>{ e.stopPropagation(); setOn(!on); }); }
const prev=window.onCarChange;
window.onCarChange=(k)=>{ if(prev) prev(k); if(wanted()) unlock(); };
window.SOUND={setOn,get on(){ return on; },state:A,ENG};
})();
