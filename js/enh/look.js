/* Look around: drag one finger on the map to turn the camera round your car, person or glider.
   Left/right orbits round you (the view keeps following as you turn, just offset); up/down tilts between almost
   straight down and a low view toward the horizon. Two fingers still pinch-zoom (js/enh/settings.js). While the view
   is panned, the compass gets a blue ring and a ↺ badge: tap it (or double-tap the map) to look straight ahead again.
   Works in every mode (car, tractor, boat, on foot, hang glider). The offsets live in LOOK (js/game.js), which the
   cameras in game.js / walk.js add to the follow bearing and to each mode's tilt. */
(()=>{
'use strict';
const compass=document.getElementById('compass');
const pts=new Map(); let drag=null, lastTap=0, easing=0;
const panned=()=>Math.abs(LOOK.yaw)>2||Math.abs(LOOK.pitch)>2;
function show(){ if(compass) compass.classList.toggle('look',panned()); }

mapEl.addEventListener('pointerdown',e=>{
  pts.set(e.pointerId,true);
  drag=pts.size===1?{id:e.pointerId,x:e.clientX,y:e.clientY,on:false}:null;   // a second finger = pinch, not look
});
mapEl.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id||pts.size!==1) return;
  const dx=e.clientX-drag.x, dy=e.clientY-drag.y;
  if(!drag.on){ if(Math.hypot(dx,dy)<8) return; drag.on=true; easing=0; }   // small wobbles stay taps
  drag.x=e.clientX; drag.y=e.clientY;
  const dYaw=dx*300/Math.max(innerWidth,320);                     // a swipe across the screen turns ~300 degrees
  LOOK.yaw=((LOOK.yaw+dYaw)%360+540)%360-180;
  S.camB=((S.camB+dYaw)%360+360)%360;                             // move right away (the follow lag would feel sluggish)
  LOOK.pitch=Math.max(-55,Math.min(12,LOOK.pitch-dy*.25));         // finger up = look up toward the horizon
  dirty=true; show();
});
const lift=e=>{
  if(!pts.delete(e.pointerId)) return;
  if(drag&&drag.id===e.pointerId){
    if(!drag.on){ const t=performance.now(); if(t-lastTap<320){ reset(); lastTap=0; } else lastTap=t; }   // double tap
    drag=null; }
};
mapEl.addEventListener('pointerup',lift); mapEl.addEventListener('pointercancel',lift);

// back to straight ahead: ease over ~0.4 s
function reset(){
  if(!panned()) return;
  const y0=LOOK.yaw, p0=LOOK.pitch, t0=performance.now(), my=++easing;
  (function tick(now){
    if(my!==easing) return;                                       // a new drag took over
    const k=Math.min(1,(now-t0)/400), e=1-Math.pow(1-k,3);
    const ny=y0*(1-e), dYaw=ny-LOOK.yaw; LOOK.yaw=ny; S.camB=((S.camB+dYaw)%360+360)%360;
    LOOK.pitch=p0*(1-e); dirty=true;
    if(k<1) requestAnimationFrame(tick); else { LOOK.yaw=0; LOOK.pitch=0; show(); }
  })(performance.now());
}
if(compass) compass.addEventListener('click',e=>{ e.stopPropagation(); reset(); });
window.LOOKAROUND={reset,state:LOOK};
})();
