/* Road-name labels and route shields off the map (owner 2026-11-23: "road name labels are printing constantly on the road
   when in chase mode, at least on rt 34. i thought we disabled that for performance?").
   Until now only the cockpit hid map labels (cockpit.js labels(); the repeated US 34 shields cost ~80 ms a frame there);
   the chase view still drew them along every road. Every symbol layer fed by the tiles' `transportation_name` layer (street
   names and highway shields) is now hidden in all views. Town / place names, POIs and our own signs (sg-*) stay; the HUD
   and the 3D street-name blades already name the road. cockpit.js labels() only restores the layers it hid itself, so these
   stay hidden when you leave the cockpit. Bring them back with localStorage ydRoadLabels=1. */
(()=>{
'use strict';
const {onReady,safe}=YD;
let keep=false; try{ keep=localStorage.getItem('ydRoadLabels')==='1'; }catch(e){}
let busy=false;
function hide(){
  if(keep||busy) return; busy=true;
  try{
    for(const l of map.getStyle().layers){
      if(l.type!=='symbol'||/^sg-|^nav-/.test(l.id)||l['source-layer']!=='transportation_name') continue;
      if((map.getLayoutProperty(l.id,'visibility')||'visible')==='visible') map.setLayoutProperty(l.id,'visibility','none');
    }
  }catch(e){ console.warn('road labels',e); }
  busy=false;
}
onReady(()=>{ hide(); let t=0; map.on('styledata',()=>{ clearTimeout(t); t=setTimeout(()=>safe('roadlabels',hide),400); }); });
window.ROADLABELS={hide};
})();
