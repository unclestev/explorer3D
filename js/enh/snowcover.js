/* Snow that settles (owner 2026-11-23: "can you make the snow accumulate?"). While it snows (the real weather or ⚙️ Weather)
   the ground slowly turns white, then the roads (they stay a little darker, like packed snow with tracks); light snow
   settles slowly and never quite covers everything, heavy snow in a few minutes, a blizzard in about a minute. When it
   stops, it melts away over a few minutes. Drawn on the map under the buildings, so it shows from the chase view and from
   the driver's seat.
   The snow plow clears it: where the plow has driven (blade width) the road shows again, until the snow melts or settles
   back over it.
   window.SNOWCOVER = {level (0…1), set(level) for testing} */
(()=>{
'use strict';
const {onReady,onTick,safe,mz}=YD;
let lvl=0, ready=false, shown=-1, track=[], lastPt=null, trackShown=0, wtrack=[], wOn=false;
const WORLD={type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[-180,-85],[180,-85],[180,85],[-180,85],[-180,-85]]]}}]};
const EMPTY={type:'FeatureCollection',features:[]};
function layers(){ safe('snow cover',()=>{
  if(!map.getSource('snowworld')) map.addSource('snowworld',{type:'geojson',data:WORLD});
  if(!map.getSource('plowtrack')) map.addSource('plowtrack',{type:'geojson',data:EMPTY});
  const all=map.getStyle().layers, road=(all.find(l=>l['source-layer']==='transportation')||{}).id;
  const below=road&&map.getLayer(road)?road:undefined, under=map.getLayer('building')?'building':undefined;
  if(!map.getLayer('snow-ground')) map.addLayer({id:'snow-ground',type:'fill',source:'snowworld',paint:{'fill-color':'#f3f6fa','fill-opacity':0},layout:{visibility:'none'}},below);
  if(!map.getLayer('snow-roads')) map.addLayer({id:'snow-roads',type:'fill',source:'snowworld',paint:{'fill-color':'#e9edf2','fill-opacity':0},layout:{visibility:'none'}},under);
  if(!map.getLayer('snow-plowed')) map.addLayer({id:'snow-plowed',type:'line',source:'plowtrack',layout:{'line-cap':'round','line-join':'round',visibility:'none'},
    paint:{'line-color':'#5d6066','line-width':((A,B)=>['interpolate',['exponential',2],['zoom'],14,['match',['get','w'],1,A[4],B[4]],24,['match',['get','w'],1,A[6],B[6]]])(mz(2.4,2),mz(3.4,2)),'line-opacity':0}},under);   // w 1: the wing's lane
  shown=-1; ready=true; }); }
function paint(){ if(!ready) return; const k=Math.round(lvl*100)/100; if(k===shown) return; shown=k;
  safe('snow cover paint',()=>{ const vis=k>0?'visible':'none';
    for(const id of ['snow-ground','snow-roads','snow-plowed']) if(map.getLayer(id)) map.setLayoutProperty(id,'visibility',vis);
    map.setPaintProperty('snow-ground','fill-opacity',Math.min(.93,k*1.15));                 // the ground goes first
    map.setPaintProperty('snow-roads','fill-opacity',Math.max(0,Math.min(.62,(k-.25)*.85))); // then the roads, never quite hidden
    map.setPaintProperty('snow-plowed','line-opacity',Math.min(.9,k*1.4));
    if(typeof dirty!=='undefined') dirty=true; }); }
onReady(function snowCover(){ layers(); map.on('styledata',()=>{ if(!map.getLayer('snow-ground')) layers(); }); });
// settle / melt, once a second
onTick(1000,function snowSettle(){
  const W=YD.AT&&YD.AT.wx, snowing=!!(W&&W.type==='snow'), it=snowing?(W.int||.5):0;
  const cap=snowing?Math.min(1,.45+it*.55):0;                    // light snow tops out around 2/3 cover
  if(snowing&&lvl<cap) lvl=Math.min(cap,lvl+it/150);             // heavy (1.3) ~2 min, blizzard (2.8) ~55 s, light ~7 min
  else if(!snowing&&lvl>0) lvl=Math.max(0,lvl-1/200);            // melts in ~3 min
  if(lvl===0&&track.length){ track=[]; wtrack=[]; lastPt=null; drawTrack(); }
  paint();
});
// the plow's cleared lane
function drawTrack(){ safe('plow track',()=>{ const s=map.getSource('plowtrack'); if(!s) return;
  const lines=[]; let cur=[]; for(const p of track){ if(p===null){ if(cur.length>1) lines.push(cur); cur=[]; } else cur.push(p); } if(cur.length>1) lines.push(cur);
  const wl=[]; cur=[]; for(const p of wtrack){ if(p===null){ if(cur.length>1) wl.push(cur); cur=[]; } else cur.push(p); } if(cur.length>1) wl.push(cur);
  s.setData({type:'FeatureCollection',features:lines.map(c=>({type:'Feature',properties:{w:0},geometry:{type:'LineString',coordinates:c}}))
    .concat(wl.map(c=>({type:'Feature',properties:{w:1},geometry:{type:'LineString',coordinates:c}})))}); }); trackShown=track.length; }
onTick(250,function plowTrack(){
  const plowing=typeof CARKEY!=='undefined'&&CARKEY==='snowplow'&&mode==='car'&&lvl>.05&&Math.abs(S.v)>.4&&!(window.PLOW&&!PLOW.down);   // blade raised: no lane
  if(!plowing){ if(lastPt){ track.push(null); lastPt=null; } return; }
  const p=[+S.lng.toFixed(7),+S.lat.toFixed(7)];
  if(lastPt&&meters(lastPt[1],lastPt[0],p[1],p[0])<3) return;
  if(lastPt&&meters(lastPt[1],lastPt[0],p[1],p[0])>60) track.push(null);   // a jump (teleport): start a new piece
  track.push(p); lastPt=p; if(track.length>6000) track.splice(0,1000);
  // the wing's lane: ~2.6 m to the driver's side of the truck's centre (the left in right-hand traffic)
  const wd=!!(window.PLOW&&PLOW.wingDown);
  if(wd){ const h=(S.hdg-90)*Math.PI/180, dx=Math.sin(h)*2.6, dy=Math.cos(h)*2.6;
    wtrack.push([+(p[0]+dx/(111320*Math.cos(p[1]*Math.PI/180))).toFixed(7),+(p[1]+dy/110540).toFixed(7)]); if(wtrack.length>6000) wtrack.splice(0,1000); }
  else if(wOn) wtrack.push(null);
  wOn=wd;
  if(track.length-trackShown>=2) drawTrack(); });
window.SNOWCOVER={get level(){ return lvl; },set(v){ lvl=Math.max(0,Math.min(1,+v||0)); paint(); }};
})();
