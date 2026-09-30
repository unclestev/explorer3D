/* Satellite view (⚙️ → Satellite view). Off by default; the choice is remembered on this device (localStorage ydSat).
   Real aerial photos (Esri World Imagery) are laid under the roads, buildings, markings and signs, so everything
   you drive on stays drawn on top of the photo.
   Kept cheap on purpose:
   - while off, the imagery source doesn't exist at all: no downloads, no GPU memory;
   - photos are fetched no finer than zoom 18 (17 in battery saver) and stretched for the closer camera zooms,
     which cuts the tiles fetched around the car by about 4x (16x in saver) with little visible loss;
   - every map layer the photo covers (land use, grass/wood/sand textures, water, parks, hillshade) is switched off
     while it's on, so the phone isn't drawing ground twice;
   - no fade-in animation, so new tiles don't cause extra redraws.
   Stays available in battery saver (at the lower resolution). */
(()=>{
'use strict';
const {safe,onReady}=YD;
const SRC='sat-src', LAYER='sat-img';
const TILES='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ATTR='Imagery © <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics';
let on=false, hidden=[];                                        // layers we switched off, restored when satellite goes off
try{ on=localStorage.getItem('ydSat')==='1'; }catch(e){}

// the photo goes just under the first road layer: above the ground fills, below roads, bridges, buildings and signs
function beforeId(){ const all=map.getStyle().layers; const r=all.find(l=>l['source-layer']==='transportation'); return r&&map.getLayer(r.id)?r.id:undefined; }

function hideCovered(){
  const all=map.getStyle().layers, i=all.findIndex(l=>l.id===LAYER); if(i<0) return;
  for(const l of all.slice(0,i)){
    if(l.type==='background') continue;                          // stays as the colour you see while photos load
    const vis=map.getLayoutProperty(l.id,'visibility');
    if(vis!=='none'){ map.setLayoutProperty(l.id,'visibility','none'); if(!hidden.includes(l.id)) hidden.push(l.id); }
  }
}
function restoreCovered(){ for(const id of hidden) safe('sat-restore',()=>{ if(map.getLayer(id)) map.setLayoutProperty(id,'visibility','visible'); }); hidden=[]; }

function add(){
  if(map.getSource(SRC)) return;
  map.addSource(SRC,{type:'raster',tiles:[TILES],tileSize:256,minzoom:0,maxzoom:POWER?17:18,attribution:ATTR});
  map.addLayer({id:LAYER,type:'raster',source:SRC,minzoom:12,
    paint:{'raster-fade-duration':0,'raster-contrast':.05,'raster-saturation':-.05}},beforeId());
  hideCovered();
}
function remove(){
  if(map.getLayer(LAYER)) map.removeLayer(LAYER);
  if(map.getSource(SRC)) map.removeSource(SRC);                  // frees the downloaded tiles and their GPU memory
  restoreCovered();
}
function apply(){ safe('satellite',()=>{ if(on) add(); else remove(); }); if(typeof dirty!=='undefined') dirty=true; }

function setOn(v){ on=v; try{ localStorage.setItem('ydSat',v?'1':'0'); }catch(e){}
  if(btn) btn.classList.toggle('on',on); apply(); }
const btn=document.getElementById('satBtn');
if(btn){ btn.classList.toggle('on',on); btn.addEventListener('click',e=>{ e.stopPropagation(); setOn(!on); }); }

// battery saver changes the photo resolution; other modules may also re-show layers under the photo (textures.js)
const prev=window.onPowerChange;
window.onPowerChange=(p)=>{ if(prev) prev(p); if(on) safe('satellite',()=>{ remove(); add(); }); };

onReady(function satellite(){ if(on) apply(); });
window.SAT={setOn,get on(){ return on; }};
})();
