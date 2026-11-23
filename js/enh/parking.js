/* Parking lots (owner 2026-11-23: "can you make the parking lot visible?"). The map tiles (OpenFreeMap / OpenMapTiles)
   don't carry parking-lot outlines at all — only a 🅿 point — so lots looked like lawn. This asks OpenStreetMap's Overpass
   servers (the same mirrors as the water towers and signs, game.js ovFetch) for the surface lots within ~2.5 km of the
   car, draws them as dark asphalt with painted stalls (the tx-parking texture, js/enh/textures.js) and a light curb line,
   just under the roads, so they show in the chase view and from the driver's seat. Asks again after ~1.5 km of driving.
   Underground, multi-storey and rooftop parking is left out (it's a building or under one). The tyres feel a lot too
   (js/enh/feel.js asks PARKING.at). The last answer for an area is kept on this device for when the servers are slow.
   window.PARKING = {at(lng,lat), state} */
(()=>{
'use strict';
const {onReady,onTick,safe}=YD;
const P={feats:new Map(),polys:[],at:null,busy:false,retry:0,ready:false};
const EMPTY={type:'FeatureCollection',features:[]};

function ringOf(geom){ const r=(geom||[]).map(p=>[+p.lon,+p.lat]).filter(p=>isFinite(p[0])&&isFinite(p[1]));
  if(r.length<4) return null; const a=r[0], b=r[r.length-1]; if(a[0]!==b[0]||a[1]!==b[1]) return null; return r; }
function add(el){ const k=el.type[0]+el.id; if(P.feats.has(k)) return;
  let rings=[];
  if(el.type==='way'){ const r=ringOf(el.geometry); if(r) rings=[r]; }
  else if(el.members){ const outs=[], ins=[];
    for(const m of el.members){ if(m.type!=='way') continue; const r=ringOf(m.geometry); if(!r) continue; (m.role==='inner'?ins:outs).push(r); }
    if(outs.length){ rings=[outs[0],...ins]; for(const o of outs.slice(1)) add({type:'x',id:el.id+'_'+o.length,geometry:o.map(p=>({lon:p[0],lat:p[1]}))}); } }
  if(!rings.length) return;
  const f={type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:rings}}; P.feats.set(k,f);
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const [x,y] of rings[0]){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  P.polys.push({rings,b:[x0,y0,x1,y1]}); }
function inRing(r,x,y){ let c=false; for(let i=0,j=r.length-1;i<r.length;j=i++){ const [xi,yi]=r[i],[xj,yj]=r[j]; if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi) c=!c; } return c; }
function at(lng,lat){ for(const p of P.polys){ const b=p.b; if(lng<b[0]||lng>b[2]||lat<b[1]||lat>b[3]) continue;
    if(inRing(p.rings[0],lng,lat)&&!p.rings.slice(1).some(r=>inRing(r,lng,lat))) return true; } return false; }

function draw(){ safe('parking draw',()=>{ const s=map.getSource('parking'); if(s) s.setData({type:'FeatureCollection',features:[...P.feats.values()]}); }); }
function layers(){ safe('parking layers',()=>{
  if(!map.getSource('parking')) map.addSource('parking',{type:'geojson',data:EMPTY});
  const all=map.getStyle().layers, road=(all.find(l=>l['source-layer']==='transportation')||{}).id, before=road&&map.getLayer(road)?road:undefined;
  if(!map.getLayer('pk-base')) map.addLayer({id:'pk-base',type:'fill',source:'parking',minzoom:12,paint:{'fill-color':'#5f6368','fill-opacity':1}},before);
  if(!map.getLayer('pk-stalls')&&map.hasImage('tx-parking')) map.addLayer({id:'pk-stalls',type:'fill',source:'parking',minzoom:14,paint:{'fill-pattern':'tx-parking','fill-opacity':1}},before);
  if(!map.getLayer('pk-curb')) map.addLayer({id:'pk-curb',type:'line',source:'parking',minzoom:14,layout:{'line-join':'round'},
    paint:{'line-color':'#b9bcc0','line-width':['interpolate',['exponential',2],['zoom'],14,.5,18,2,22,14],'line-opacity':.9}},before);
  draw(); }); }

const KEY=(lat,lng)=>'ydPark:'+lat.toFixed(2)+','+lng.toFixed(2);
function take(j){ if(P.feats.size>4000){ P.feats.clear(); P.polys=[]; }   // a long drive: start over with what's near
  for(const el of (j&&j.elements)||[]) add(el); draw(); }
async function load(){ if(P.busy||typeof ovFetch!=='function') return; P.busy=true;
  const cy=S.lat, cx=S.lng, dy=.023, dx=.031, bb=`(${(cy-dy).toFixed(4)},${(cx-dx).toFixed(4)},${(cy+dy).toFixed(4)},${(cx+dx).toFixed(4)})`;
  const q=`[out:json][timeout:25];(way["amenity"="parking"]["parking"!~"underground|multi-storey|rooftop"]${bb};relation["amenity"="parking"]["type"="multipolygon"]["parking"!~"underground|multi-storey|rooftop"]${bb};);out geom;`;
  const ck=KEY(cy,cx);
  try{ const c=JSON.parse(localStorage.getItem(ck)||'null'); if(c) take(c); }catch(e){}
  try{ const j=await ovFetch(q); take(j); P.at=[cx,cy];
    try{ localStorage.setItem(ck,JSON.stringify({elements:(j.elements||[]).map(e=>({type:e.type,id:e.id,geometry:e.geometry,members:e.members&&e.members.map(m=>({type:m.type,role:m.role,geometry:m.geometry}))}))})); }catch(e){} }
  catch(e){ console.warn('parking',e); P.retry=Date.now()+120000; }
  finally{ P.busy=false; } }

onReady(function parking(){ layers(); P.ready=true; map.on('styledata',()=>{ if(!map.getLayer('pk-base')) layers(); }); });
onTick(2000,function parkingTick(){ if(!P.ready||P.busy||Date.now()<P.retry) return;
  if(!P.at||meters(P.at[1],P.at[0],S.lat,S.lng)>1500) load(); });
window.PARKING={at,state:P};
})();
