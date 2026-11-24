/* Hang gliding level of detail (owner 2026-11-23: "not use all of the 3D models, it is a performance problem").
   While you fly:
   - satellite view is forced on (js/enh/satellite.js SAT.glide): from up high the photo already shows the buildings and
     trees, so the 3D shapes aren't needed. It goes back to what it was before takeoff when you land (on stays on, off
     goes off), and the saved choice (localStorage ydSat) is never touched;
   - the 3D map shapes (fill-extrusions) come back in steps as you come down, nearest-to-the-ground detail last:
       above ~220 m  none at all (clouds, thermals and the water towers stay)
       below ~220 m  building walls and caps only (flat colours, no textures)
       below ~110 m  + pitched roofs, wall textures, stores
       below ~45 m   + trees, pins, anything else that is small and fussy
   - the steps shrink in battery saver (x0.6) and shrink further on their own if the frame rate drops while flying
     (down to x0.35), then grow back when it is smooth again. Each layer has a little hysteresis so it doesn't flicker.
   Only layers this module hid are ever shown again by it. window.GLIDELOD.treesOn() lets game.js skip building tree data
   while the trees aren't drawn. */
(()=>{
'use strict';
const {safe}=YD;
const KEEP=new Set(['clouds','thermals','tower-3d']);
const hid=new Set();                              // layers we switched off
let ids=[], active=false, adapt=1, ema=.016, t=0, lastAdj=0;

// the altitude (metres above the ground) below which a layer is drawn
function ceilOf(id){
  if(KEEP.has(id)) return Infinity;
  if(/^(tree-|poi-pin|rs-|snow)/.test(id)) return 45;            // trees, pins, roadside bits, snow banks, snowmen
  if(/roof|^wall-pat|^stores-|accent/.test(id)) return 110;      // roofs, wall textures, stores
  return 220;                                                    // building walls: building-3d, wall-3d, wall-cap, rebuilt-3d
}
function collect(){ ids=[]; for(const l of map.getStyle().layers) if(l.type==='fill-extrusion'&&!KEEP.has(l.id)) ids.push(l.id); }
function scale(){ return (POWER?.6:1)*adapt; }
function vis(id){ return (map.getLayoutProperty(id,'visibility')||'visible')==='visible'; }
function update(){
  const alt=G.alt, k=scale();
  for(const id of ids){
    if(!map.getLayer(id)) continue;
    const c=ceilOf(id)*k;
    if(hid.has(id)){ if(alt<c*.85){ hid.delete(id); safe('glide lod show',()=>map.setLayoutProperty(id,'visibility','visible')); }
                     else if(vis(id)) safe('glide lod hide',()=>map.setLayoutProperty(id,'visibility','none')); }   // something else showed it again
    else if(alt>c&&vis(id)){ hid.add(id); safe('glide lod hide',()=>map.setLayoutProperty(id,'visibility','none')); }
  }
  if(typeof dirty!=='undefined') dirty=true;
}
function begin(){ if(active) return; active=true; adapt=1; ema=.016; t=0; lastAdj=0; safe('glide lod',()=>{ collect(); update(); }); if(window.SAT) SAT.glide(true); }
function end(){ if(!active) return; active=false;
  for(const id of hid) safe('glide lod restore',()=>{ if(map.getLayer(id)) map.setLayoutProperty(id,'visibility','visible'); });
  hid.clear(); if(window.SAT) SAT.glide(false); if(typeof dirty!=='undefined') dirty=true; }

{ const prev=window.onModeChange; window.onModeChange=(m,was)=>{ if(prev) prev(m,was); if(m==='glider') begin(); else if(was==='glider') end(); }; }

// per flying frame: keep a smoothed frame time, and re-check the steps four times a second
FRAME_HOOKS.push(function glideLod(dt){
  if(mode!=='glider'||!active) return;
  if(dt>0&&dt<.25) ema+=(dt-ema)*.05;                            // long gaps (hidden tab, hitches) are ignored
  t+=dt; if(t<.25) return; t=0;
  const now=performance.now()/1000;
  if(ema>.036&&adapt>.35&&now-lastAdj>2.5){ adapt=Math.max(.35,adapt*.8); lastAdj=now; }              // under ~28 fps: bring the steps closer to the ground
  else if(ema<.022&&adapt<1&&now-lastAdj>8){ adapt=Math.min(1,adapt*1.15); lastAdj=now; }             // smooth again: let detail back in slowly
  safe('glide lod',update);
});
window.GLIDELOD={treesOn:()=>!active||!hid.has('tree-crown'), get adapt(){ return adapt; }, get hidden(){ return [...hid]; }};
})();
