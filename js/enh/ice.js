/* Frozen water (owner 2026-11-24: "when walking and you come across water you should start swimming if the temp is above
   freezing; at or below freezing the water should appear as ice and you should start ice skating with hockey skates").
   ICE.frozen is true when the real temperature (js/enh/atmos.js AT.temp, deg F) is 32 or below. While it is, every water
   polygon is covered by a pale ice layer ('ice-fill': just under the roads and above the satellite photo, so it shows in
   either view) and js/enh/walk.js lets you skate on it instead of swim in it. The ripple texture is switched off under it.
   For testing: ?temp=20 (or any number) pretends it is that many degrees F. */
(()=>{
'use strict';
const {safe,onReady,onTick}=YD;
const q=new URLSearchParams(location.search), FORCE=q.get('temp')!=null&&isFinite(+q.get('temp'))?+q.get('temp'):null;
const ICE={frozen:false,get temp(){ return FORCE!=null?FORCE:(YD.AT&&YD.AT.temp!=null?YD.AT.temp:null); }};
const LAYER='ice-fill';
function beforeId(){ const all=map.getStyle().layers; const r=all.find(l=>l['source-layer']==='transportation'||l.source==='roads-smooth'); return r&&map.getLayer(r.id)?r.id:undefined; }
function ensure(){
  if(map.getLayer(LAYER)) return true;
  if(!map.getSource(bSrc)) return false;
  map.addLayer({id:LAYER,type:'fill',source:bSrc,'source-layer':'water',minzoom:10,layout:{visibility:'none'},
    paint:{'fill-color':['interpolate',['linear'],['zoom'],10,'#cfe3f0',17,'#dcebf5'],'fill-opacity':.97,'fill-outline-color':'#f4fafe'}},beforeId());
  return true;
}
// satellite.js puts its photo just under the roads too: it calls this afterwards so the ice stays on top of the photo
ICE.raise=()=>safe('ice raise',()=>{ if(map.getLayer(LAYER)) map.moveLayer(LAYER,beforeId()); });
function apply(){
  const f=ICE.temp!=null&&ICE.temp<=32;
  if(f===ICE.frozen&&map.getLayer(LAYER)) return;
  ICE.frozen=f;
  if(!f&&!map.getLayer(LAYER)) return;
  if(!ensure()) return;
  map.setLayoutProperty(LAYER,'visibility',f?'visible':'none');
  if(map.getLayer('tx-water')) map.setLayoutProperty('tx-water','visibility',f?'none':(POWER?'none':'visible'));   // ripples: not on ice (and still off in battery saver)
  if(typeof dirty!=='undefined') dirty=true;
}
onReady(function ice(){ safe('ice',apply); });
onTick(3000,function iceTick(){ safe('ice',apply); });
window.ICE=ICE;
})();
