/* Remembers where you are, so reopening (or updating) the app starts you there instead of back at Raging Waves.
   Saved to localStorage 'ydPos' {lng, lat, hdg, t}: every 3 s when you've moved (>2 m) or turned (>5°), and right away
   when the app is hidden or closed. On foot the parked car's spot is saved (you restart in the car, where you left it);
   gliding saves the spot under you (you restart on the ground there — the game picks car/tractor/boat for that spot).
   game.js reads it at start (START). ⚙️ "Start point" clears it and reloads at the Raging Waves start. */
(()=>{
'use strict';
const KEY='ydPos';
let last=null, off=false;
function where(){
  if(typeof S==='undefined') return null;
  const P=window.WALK&&WALK.parkedAt;
  if(mode==='walk'&&P&&isFinite(P.lat)&&isFinite(P.lng)) return {lng:P.lng,lat:P.lat,hdg:((P.hdg%360)+360)%360};
  return {lng:S.lng,lat:S.lat,hdg:((S.hdg%360)+360)%360};
}
function save(force){
  if(off) return;
  const p=where(); if(!p||!isFinite(p.lat)||!isFinite(p.lng)||!isFinite(p.hdg)) return;
  if(!force&&last&&Math.abs(p.lat-last.lat)<2e-5&&Math.abs(p.lng-last.lng)<2e-5&&Math.abs(p.hdg-last.hdg)<5) return;
  p.t=Date.now(); try{ localStorage.setItem(KEY,JSON.stringify(p)); last=p; }catch(e){}
}
setInterval(()=>save(false),3000);
addEventListener('pagehide',()=>save(true));
document.addEventListener('visibilitychange',()=>{ if(document.hidden) save(true); });
// ⚙️ Start point: forget the saved spot and start again at Raging Waves
const b=document.getElementById('homeBtn');
if(b) b.addEventListener('click',e=>{ e.stopPropagation();
  if(!confirm('Go back to the start by Raging Waves? (Where you are now won\'t be kept.)')) return;
  off=true; try{ localStorage.removeItem(KEY); }catch(_){} location.reload(); });
window.SAVEPOS={save,where};
})();
