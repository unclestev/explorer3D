/* Starts every enhancement module once the map style is ready. Load this last. */
(()=>{
'use strict';
const {ENH,inits,ticks,safe}=YD;
function boot(){
  if(ENH.booted) return; ENH.booted=true;
  for(const f of inits) safe(f.name||'init',f);
  // background jobs: every job runs 2.5x less often in battery saver, and nothing runs while the page is hidden
  const run=()=>{ if(!document.hidden){ const now=performance.now(), f=POWER?2.5:1;
      for(const t of ticks){ if(now-t.t>=t.ms*f){ t.t=now; safe(t.fn.name||'tick',t.fn); } } }
    setTimeout(run,POWER?250:100); };
  run();
}
if(map.loaded()&&map.isStyleLoaded()) boot(); else map.once('load',boot);
})();
