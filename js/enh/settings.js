/* Settings panel (⚙️) and pinch-to-zoom.
   The panel holds the Graphics picker and Realistic driving switch (js/enh/quality.js), the traffic switch, car size and camera zoom. The buttons keep their
   original ids, so js/game.js still handles battery saver / size / zoom and js/enh/traffic.js the traffic switch;
   this file opens and closes the panel, shows the current values and remembers size and zoom on this device.
   Pinch the map with two fingers to zoom the camera (same range as the zoom buttons). */
(()=>{
'use strict';
const panel=document.getElementById('settings'), gear=document.getElementById('gear'), closeBtn=document.getElementById('setX');
const sizeEl=document.getElementById('carSize'), zoomEl=document.getElementById('zoomVal');
const BASE_EXAG=1.6, ZMIN=-3, ZMAX=2;

// restore size and zoom from last time
try{ const e=parseFloat(localStorage.getItem('ydCarSize')); if(e>=.25&&e<=2.5) EXAG=e;
     const z=parseFloat(localStorage.getItem('ydZoom')); if(z>=ZMIN&&z<=ZMAX) zoomOff=z; }catch(e){}

const EXu=()=>window.COCKPIT&&COCKPIT.on?COCKPIT.exag:EXAG;    // the cockpit view draws everything real size; this is the chase-view car size
function show(){ sizeEl.textContent=Math.round(EXu()/BASE_EXAG*100)+'%'; zoomEl.textContent=Math.pow(2,zoomOff).toFixed(1)+'×'; }
function save(){ try{ localStorage.setItem('ydCarSize',String(EXu())); localStorage.setItem('ydZoom',String(zoomOff)); }catch(e){} }
// game.js's own click handlers run first (they were attached earlier); then show and save the new values
for(const id of ['cp','cm','zi','zo']) document.getElementById(id).addEventListener('click',e=>{ e.stopPropagation(); show(); save(); });

// car picker: Explorer / Javelin / Navigator (setCar in game.js swaps the photo, lights and sound and remembers the choice)
const pick=document.getElementById('carPick');
function showCar(){ if(pick) for(const b of pick.querySelectorAll('button')) b.classList.toggle('on',b.dataset.car==='boat'?mode==='boat':mode!=='boat'&&b.dataset.car===CARKEY); }
if(pick) pick.addEventListener('click',e=>{ e.stopPropagation(); const b=e.target.closest('button[data-car]'); if(b){ if(b.dataset.car==='boat') pickBoat(); else setCar(b.dataset.car); showCar(); } });
{ const prev=window.onModeChange; window.onModeChange=(m,was)=>{ if(prev) prev(m,was); showCar(); }; }   // the Boat button lights while boating
showCar();
function open(){ panel.classList.add('on'); gear.classList.add('on'); show(); }
function close(){ panel.classList.remove('on'); gear.classList.remove('on'); }
gear.addEventListener('click',e=>{ e.stopPropagation(); panel.classList.contains('on')?close():open(); });
closeBtn.addEventListener('click',e=>{ e.stopPropagation(); close(); });
for(const t of ['pointerdown','click']) panel.addEventListener(t,e=>e.stopPropagation());
show();

// ---- pinch to zoom: two fingers on the map ----
const pts=new Map(); let pinch=null;
const spread=()=>{ const [a,b]=[...pts.values()]; return Math.hypot(a.x-b.x,a.y-b.y); };
mapEl.addEventListener('pointerdown',e=>{
  if(panel.classList.contains('on')) close();                       // tapping the map closes the panel
  pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  try{ mapEl.setPointerCapture(e.pointerId); }catch(_){}
  if(pts.size===2) pinch={d:spread(),z:zoomOff};
});
mapEl.addEventListener('pointermove',e=>{
  if(!pts.has(e.pointerId)) return; pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch&&pts.size===2){ const d=spread(); if(pinch.d>10){ zoomOff=Math.max(ZMIN,Math.min(ZMAX,pinch.z+Math.log2(d/pinch.d))); dirty=true; if(panel.classList.contains('on')) show(); } }
});
const lift=e=>{ if(!pts.delete(e.pointerId)) return; if(pinch&&pts.size<2){ pinch=null; save(); show(); } };
mapEl.addEventListener('pointerup',lift); mapEl.addEventListener('pointercancel',lift);
// ⚙️ Location & speed panel (owner 2026-11-21: "add the visual location/speed overlay when in cockpit view too and maybe a
// setting to turn that on and off in any view"): the top-left card, on by default, in every view
{ let on=true; try{ on=localStorage.getItem('ydInfo')!=='off'; }catch(e){}
  const b=document.getElementById('infoBtn'), show=()=>{ document.body.classList.toggle('noinfo',!on); if(b) b.classList.toggle('on',on); };
  if(b) b.addEventListener('click',e=>{ e.stopPropagation(); on=!on; try{ localStorage.setItem('ydInfo',on?'on':'off'); }catch(e){} show(); });
  show(); }
// ⚙️ groups: tap a heading to fold it away; remembered on this device
{ let shut=[]; try{ shut=JSON.parse(localStorage.getItem('ydSetShut')||'[]'); }catch(e){}
  for(const g of panel.querySelectorAll('.setGrp')){ const h=g.querySelector('.setSec'), k=h.textContent.trim();
    const show=()=>{ const s=shut.includes(k); g.classList.toggle('shut',s); h.setAttribute('aria-expanded',s?'false':'true'); };
    h.addEventListener('click',e=>{ e.stopPropagation(); shut=shut.includes(k)?shut.filter(x=>x!==k):shut.concat(k); try{ localStorage.setItem('ydSetShut',JSON.stringify(shut)); }catch(e){} show(); });
    show(); } }
// iPhone Safari: stop its own page-zoom gesture from fighting ours
for(const t of ['gesturestart','gesturechange']) document.addEventListener(t,e=>e.preventDefault(),{passive:false});
})();
