/* Your real location: tap 📍 to get directions from the car to where your phone actually is (a blue dot marks it
   on both maps); press and hold 📍 to jump the car there instead. Location is read once per press, never tracked. */
(()=>{
'use strict';
const {ENH,EMPTY,safe,onReady,onTick}=YD;
const btn=document.getElementById('me');
const ME={at:null,busy:false,miniOk:false};

function meData(){ return ME.at?{type:'Feature',properties:{},geometry:{type:'Point',coordinates:ME.at}}:EMPTY; }
function showMe(){ const d=meData(); safe('me',()=>{ const s=map.getSource('me'); if(s) s.setData(d); });
  safe('me-mini',()=>{ const m=ME.miniOk&&mini&&mini.getSource('me'); if(m) m.setData(d); }); }

function locate(){
  return new Promise((ok,fail)=>{
    if(!('geolocation' in navigator)) return fail(new Error('This browser has no location access'));
    navigator.geolocation.getCurrentPosition(p=>ok([p.coords.longitude,p.coords.latitude]),e=>fail(e),{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
  });
}
function why(e){
  if(e&&e.code===1) return 'Location is blocked. Allow it for this site in your browser settings';
  if(e&&e.code===3) return 'Couldn’t get a GPS fix in time. Try again';
  if(e&&e.code===2) return 'Your location isn’t available right now';
  return (e&&e.message)||'Couldn’t get your location';
}
async function withLocation(fn){
  if(ME.busy) return; ME.busy=true; btn.classList.add('busy'); toast('Finding your location…',1600);
  try{ const at=await locate(); ME.at=at; showMe(); fn(at); }
  catch(e){ toast(why(e),3200); }
  finally{ ME.busy=false; btn.classList.remove('busy'); }
}
function routeToMe(at){
  const d=meters(S.lat,S.lng,at[1],at[0]);
  if(d<40){ toast('You’re already here',1800); return; }
  if(mode==='glider'){ toast('Land first (triple-tap the gas), then tap 📍',2600); return; }
  YD.NAV.dest=at; YD.setDest(at); YD.requestRoute(false);
  if(d>250000) setTimeout(()=>toast('That’s '+YD.fmtDist(d)+' away. Hold 📍 to jump there instead',3500),2800);
}
function jumpToMe(at){
  if(mode==='glider'){ toast('Land first (triple-tap the gas), then hold 📍',2600); return; }
  S.lng=at[0]; S.lat=at[1]; S.v=0; S.steer=0;
  decorAt=null; landCache.at=null; dirty=true;                        // rebuild trees, land and vehicle checks for the new spot
  if(YD.NAV.dest) setTimeout(()=>YD.requestRoute(true),600);           // keep any route, recalculated from here
  toast('📍 Jumped to your location',2200);
}

// short tap = directions, press and hold (0.6 s) = jump there
let holdT=null, held=false;
btn.addEventListener('pointerdown',e=>{ e.stopPropagation(); held=false; clearTimeout(holdT);
  holdT=setTimeout(()=>{ held=true; withLocation(jumpToMe); },600); });
const cancel=()=>clearTimeout(holdT);
btn.addEventListener('pointerup',e=>{ e.stopPropagation(); cancel(); if(!held) withLocation(routeToMe); });
btn.addEventListener('pointerleave',cancel); btn.addEventListener('pointercancel',cancel);
btn.addEventListener('click',e=>e.stopPropagation());
btn.addEventListener('contextmenu',e=>e.preventDefault());

const DOT={'circle-color':'#2563eb','circle-stroke-color':'#ffffff'};
onReady(function meLayers(){
  map.addSource('me',{type:'geojson',data:EMPTY});
  map.addLayer({id:'me-halo',type:'circle',source:'me',paint:{'circle-color':'#3b82f6','circle-opacity':.2,'circle-radius':['interpolate',['linear'],['zoom'],12,10,20,26],'circle-pitch-alignment':'map'}});
  map.addLayer({id:'me-dot',type:'circle',source:'me',paint:Object.assign({'circle-radius':['interpolate',['linear'],['zoom'],12,5,20,11],'circle-stroke-width':3,'circle-pitch-alignment':'map'},DOT)});
});
onTick(1000,function meMini(){
  if(ME.miniOk||!mini||!miniReady) return;
  try{ if(!mini.isStyleLoaded()) return; mini.addSource('me',{type:'geojson',data:meData()});
    mini.addLayer({id:'me-dot',type:'circle',source:'me',paint:Object.assign({'circle-radius':4.5,'circle-stroke-width':2},DOT)}); }
  catch(e){ console.warn('me mini',e); }
  ME.miniOk=true;
});
YD.ME=ME;
})();
