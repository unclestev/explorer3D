/* Starts every enhancement module once the map style is ready. Load this last. */
(()=>{
'use strict';
const {ENH,inits,ticks,safe}=YD;
function boot(){
  if(ENH.booted) return; ENH.booted=true;
  for(const f of inits) safe(f.name||'init',f);
  // background jobs: every job runs 2.5x less often on Low graphics (1.5x on Medium), and nothing runs while the page is hidden
  const run=()=>{ if(!document.hidden){ const now=performance.now(), f=Q3(2.5,1.5,1);
      for(const t of ticks){ if(now-t.t>=t.ms*f){ t.t=now; safe(t.fn.name||'tick',t.fn); } } }
    setTimeout(run,POWER?250:100); };
  run();
}
// start once js/game.js has set the map up (styleReady). Polled as well as on 'load': on a slow start the map's 'load' could
// fire before this file ran while map.loaded() was still false (tiles pending), and then nothing ever started (2026-11-23)
const go=()=>{ if(ENH.booted) return; if(typeof styleReady!=='undefined'&&styleReady) boot(); else setTimeout(go,250); };
map.once('load',()=>setTimeout(go,0)); go();
})();
