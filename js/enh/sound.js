/* Engine sound and the ⚙️ Sound switch.
   - Sound switch (saved as ydAudio, on by default). Phones only allow sound after a tap, so it starts on your first touch.
   - The AMC Javelin gets a synthesized AMC 401 V8 with dual exhaust (js/enh/engine-worklet.js). The Explorer is silent.
   - Engine speed comes from a model of the Javelin's drivetrain: 3-speed automatic (2.45 / 1.45 / 1.00), 3.15 rear
     axle, 26.5" tyres, a torque converter that lets the revs flare when you floor it from low speed, and shift points
     that rise with how hard you press the gas (kickdown when you floor it).
   - Nothing runs while sound is off, the car has no sound, you're in the boat/tractor/glider, or the app is hidden. */
(()=>{
'use strict';
const btn=document.getElementById('audioBtn');
let on=true; try{ on=localStorage.getItem('ydAudio')!=='0'; }catch(e){}
const A={ctx:null,node:null,ready:false,failed:false,rpm:700,gear:0,shiftT:0,gainNow:0};

function wanted(){ return on&&!document.hidden&&typeof CARSPEC!=='undefined'&&CARSPEC.sound==='amc401'&&mode==='car'; }

// iPhone only lets sound start inside a tap, so the context is created and resumed right in the tap handler;
// the engine itself (an AudioWorklet module) loads a moment later.
function start(){
  if(A.ctx||A.failed) return;
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC){ A.failed=true; return; }
  try{ A.ctx=new AC({latencyHint:'interactive'}); A.ctx.resume().catch(()=>{}); }catch(e){ A.failed=true; return; }
  if(!A.ctx.audioWorklet){ A.failed=true; console.warn('engine sound: AudioWorklet not supported'); return; }
  A.ctx.audioWorklet.addModule('js/enh/engine-worklet.js?v=1').then(()=>{
    A.node=new AudioWorkletNode(A.ctx,'amc401',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
    A.node.connect(A.ctx.destination); A.ready=true;
  }).catch(e=>{ A.failed=true; console.warn('engine sound',e); });
}
function unlock(){ if(!wanted()) return; start(); if(A.ctx&&A.ctx.state!=='running') A.ctx.resume().catch(()=>{}); }
for(const t of ['pointerdown','touchend','click','keydown']) document.addEventListener(t,unlock,{passive:true});

// drivetrain model -> engine rpm and load
const AXLE=3.15, TYRE=.673*Math.PI, GEARS=[2.45,1.45,1.0], IDLE=700, REDLINE=5200;
function engine(dt){
  const v=Math.abs(S.v||0), gas=Math.max(0,S.gas||0), shaft=v/TYRE*60*AXLE;      // driveshaft rpm
  const inGear=g=>shaft*GEARS[g];
  if(S.v<-.2) A.gear=0;                                          // reverse: low ratio
  else{
    const up=1700+gas*3000, down=1050+gas*1300; A.shiftT-=dt;
    if(A.shiftT<=0){
      if(A.gear<2&&inGear(A.gear)>up){ A.gear++; A.shiftT=.6; }
      else if(A.gear>0&&inGear(A.gear)<down&&inGear(A.gear-1)<REDLINE*.85){ A.gear--; A.shiftT=.6; }
      else if(gas>.85&&A.gear>0&&inGear(A.gear-1)<4200){ A.gear--; A.shiftT=.8; }   // kickdown
    }
  }
  const geared=inGear(A.gear)*(1+.05*gas);                     // converter slip under load
  const flare=IDLE+1500*gas*Math.max(0,1-geared/2400);          // revs flare against the converter from a stop
  let target=Math.min(REDLINE,Math.max(IDLE,geared,flare));
  if(v<.3&&gas>.05) target=Math.min(REDLINE,IDLE+2100*gas);     // brake-stand / pulling away
  A.rpm+=(target-A.rpm)*Math.min(1,dt*(target>A.rpm?5:3.5));     // flywheel inertia
  return {rpm:A.rpm, load:gas};
}

// called every frame by the game loop; never asks for a redraw
FRAME_HOOKS.push(function engineSound(dt){
  const want=wanted();
  if(!A.ready){ return false; }
  const e=engine(dt||.016), t=A.ctx.currentTime, P=A.node.parameters;
  const g=want?.32:0;
  if(Math.abs(g-A.gainNow)>.001||want){
    P.get('rpm').setTargetAtTime(e.rpm,t,.03); P.get('load').setTargetAtTime(e.load,t,.05);
    P.get('gain').setTargetAtTime(g,t,g>A.gainNow?.15:.25); A.gainNow=g; }
  // let the phone rest when there's nothing to play
  if(!want&&A.ctx.state==='running'){ clearTimeout(A.sus); A.sus=setTimeout(()=>{ if(!wanted()&&A.ctx) A.ctx.suspend().catch(()=>{}); },800); }
  else if(want&&A.ctx.state==='suspended'){ clearTimeout(A.sus); A.ctx.resume().catch(()=>{}); }
  return false;
});
document.addEventListener('visibilitychange',()=>{ if(!A.ctx) return; if(document.hidden) A.ctx.suspend().catch(()=>{}); else if(wanted()) A.ctx.resume().catch(()=>{}); });

function setOn(v){ on=v; try{ localStorage.setItem('ydAudio',v?'1':'0'); }catch(e){} if(btn) btn.classList.toggle('on',on); if(on) unlock(); }
if(btn){ btn.classList.toggle('on',on); btn.addEventListener('click',e=>{ e.stopPropagation(); setOn(!on); }); }
const prev=window.onCarChange;
window.onCarChange=(k)=>{ if(prev) prev(k); A.rpm=IDLE; A.gear=0; if(wanted()) unlock(); };
window.SOUND={setOn,get on(){ return on; },state:A};
})();
