/* Remembers where you are, so reopening (or updating) the app starts you there instead of back at Raging Waves.
   Saved to localStorage 'ydPos' {lng, lat, hdg, t}: every 3 s when you've moved (>2 m) or turned (>5°), and right away
   when the app is hidden or closed. On foot the parked car's spot is saved (you restart in the car, where you left it);
   gliding saves the spot under you (you restart on the ground there — the game picks car/tractor/boat for that spot).
   game.js reads it at start (START). ⚙️ "Start at" picks Last spot (default) or Random place (game.js START_PLACES,
   snapped onto a nearby road here); ⚙️ "Go to" jumps now: a random place, or back to the Raging Waves start. */
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
// ⚙️ Go to now → Raging Waves: forget the saved spot and start again at the Raging Waves start (even if Start at = Random)
const b=document.getElementById('homeBtn');
if(b) b.addEventListener('click',e=>{ e.stopPropagation();
  if(!confirm('Go back to the start by Raging Waves? (Where you are now won\'t be kept.)')) return;
  off=true; try{ localStorage.removeItem(KEY); localStorage.setItem('ydStartOnce','home'); }catch(_){} location.reload(); });
// ⚙️ Start at: Last spot / Random place (saved as 'ydStart'; takes effect next time the game opens)
const pick=document.getElementById('startPick');
function showPick(){ let v='last'; try{ v=localStorage.getItem('ydStart')||'last'; }catch(e){}
  if(pick) for(const x of pick.querySelectorAll('button')) x.classList.toggle('on',x.dataset.start===v); }
if(pick) pick.addEventListener('click',e=>{ e.stopPropagation(); const x=e.target.closest('button[data-start]'); if(!x) return;
  try{ localStorage.setItem('ydStart',x.dataset.start); }catch(_){}
  showPick(); if(typeof toast==='function') toast(x.dataset.start==='random'?'Next time you open the game you\'ll start somewhere new':'Next time you\'ll start where you left off',2600); });
showPick();
const rb=document.getElementById('randomBtn');            // try a random place now
if(rb) rb.addEventListener('click',e=>{ e.stopPropagation();
  if(!confirm('Jump to a random place now? (Where you are now won\'t be kept.)')) return;
  off=true; try{ localStorage.setItem('ydStartOnce','random'); }catch(_){} location.reload(); });

/* Random start: the car begins at the landmark itself; once the map's road data there has loaded, move it onto the
   nearest real road (not motorways, ramps, paths or tunnels) within 1.5 km, 40 m back along that road, pointing along
   it toward the landmark. Tries every 0.5 s for up to 15 s, and gives up if you've already driven off. */
function snapToRoad(P){
  const src=roadGeo.src||(roadIds.length&&map.getLayer(roadIds[0])&&map.getLayer(roadIds[0]).source); if(!src) return false;
  let fs; try{ fs=map.querySourceFeatures(src,{sourceLayer:'transportation'}); }catch(e){ return false; }
  const kx=111320*Math.cos(P.lat*Math.PI/180), OK=/^(trunk|primary|secondary|tertiary|minor)$/;
  let best=null;
  for(const f of fs){ const pr=f.properties||{}; if(!OK.test(String(pr.class||''))||pr.brunnel==='tunnel'||pr.ramp==1) continue;
    const g=f.geometry; if(!g) continue;
    const lines=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
    for(const L of lines) for(let i=1;i<L.length;i++){
      const x1=(L[i-1][0]-P.lng)*kx, y1=(L[i-1][1]-P.lat)*111320, x2=(L[i][0]-P.lng)*kx, y2=(L[i][1]-P.lat)*111320;
      const dx=x2-x1, dy=y2-y1, L2=dx*dx+dy*dy; if(!L2) continue;
      const t=Math.max(0,Math.min(1,-(x1*dx+y1*dy)/L2)), qx=x1+t*dx, qy=y1+t*dy, d=Math.hypot(qx,qy);
      if(d<1500&&(!best||d<best.d)) best={d,L,i,t,qx,qy}; } }
  if(!best) return false;
  // travel along the segment toward the landmark's side if it's ahead, else as the line runs (dir +1 = increasing index)
  const {L,i}=best, xy=k=>[(L[k][0]-P.lng)*kx,(L[k][1]-P.lat)*111320];
  const A=xy(i-1), B=xy(i), ul=Math.hypot(B[0]-A[0],B[1]-A[1]); let ux=(B[0]-A[0])/ul, uy=(B[1]-A[1])/ul, dir=1;
  if(ux*(-best.qx)+uy*(-best.qy)<-1e-6){ ux=-ux; uy=-uy; dir=-1; }
  // start 40 m back along the road (against the travel direction), following its bends
  let px=best.qx, py=best.qy, left=40, k=dir>0?i-1:i;
  while(left>0&&k>=0&&k<L.length){ const Q=xy(k), seg=Math.hypot(Q[0]-px,Q[1]-py);
    if(seg>=left){ px+=(Q[0]-px)*left/seg; py+=(Q[1]-py)*left/seg; break; }
    left-=seg; px=Q[0]; py=Q[1]; k-=dir; }
  S.lng=P.lng+px/kx; S.lat=P.lat+py/111320; S.hdg=S.camB=(Math.atan2(ux,uy)*180/Math.PI+360)%360; S.v=0;
  dirty=true; return true;
}
if(typeof START!=='undefined'&&START.place){
  const P=START.place, t0=Date.now();
  const tryIt=()=>{
    if(typeof S==='undefined'||S.dist>5) return;                        // already driving: leave it
    if(typeof styleReady!=='undefined'&&styleReady&&snapToRoad(P)){ if(typeof toast==='function') toast('📍 '+P.name,3500); save(true); return; }
    if(Date.now()-t0<15000) setTimeout(tryIt,500);
    else if(typeof toast==='function') toast('📍 Near '+P.name,3500);
  };
  setTimeout(tryIt,800);
}
window.SAVEPOS={save,where,snapToRoad};
})();
