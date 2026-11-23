/* Snow that settles (owner 2026-11-23: "can you make the snow accumulate?"). While it snows (the real weather or ⚙️ Weather)
   the ground slowly turns white, then the roads (they stay a little darker, like packed snow with tracks); light snow
   settles slowly and never quite covers everything, heavy snow in a few minutes, a blizzard in about a minute. When it
   stops, it melts away over a few minutes. Drawn on the map under the buildings, so it shows from the chase view and from
   the driver's seat.
   The snow plow clears it: where the plow has driven (blade width) the road shows again, until the snow melts or settles
   back over it.
   How deep (owner 2026-11-23: "make it so I can see the accumulation"): the snow has a depth in inches — light snow adds
   about half an inch a minute, heavy snow 2, a blizzard 5, up to 18 in — shown on the weather line ("6 in of snow"),
   and the plow piles what it clears into white snowbanks beside its lane (on the side the blade throws to, or both
   sides when it's straight; the wing's bank on the far side of its lane), as tall as the snow is deep and then some.
   Roofs (owner 2026-11-23: "can you make the snow go on the roof of the house?"): the roof colours (flat roof caps, the
   pitched house roofs near the car, js/enh/buildings.js) are blended toward snow white as it settles — mixed in the
   map's own expression from each roof's own colour, so every roof keeps a hint of its shingles; walls, windows and doors stay.
   The snow layer is also kept under the roads even after a layer (satellite view, …) is added later.
   Salt (js/enh/plow.js): where the plow spreads salt, the road is left speckled with grains across ~6 m, and where
   there's snow that lane is wet and dark. It stays for the drive.
   window.SNOWCOVER = {level (0…1, how white), inches, set(level) for testing} */
(()=>{
'use strict';
const {onReady,onTick,safe,mz}=YD;
let lvl=0, inch=0, ready=false, salt=[], sLast=null, shown=-1, track=[], lastPt=null, trackShown=0, wtrack=[], wOn=false;
const WORLD={type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[-180,-85],[180,-85],[180,85],[-180,85],[-180,-85]]]}}]};
const EMPTY={type:'FeatureCollection',features:[]};
function layers(){ safe('snow cover',()=>{
  if(!map.getSource('snowworld')) map.addSource('snowworld',{type:'geojson',data:WORLD});
  if(!map.getSource('plowtrack')) map.addSource('plowtrack',{type:'geojson',data:EMPTY});
  const all=map.getStyle().layers, road=(all.find(l=>l['source-layer']==='transportation')||{}).id;
  const below=road&&map.getLayer(road)?road:undefined, under=map.getLayer('building')?'building':undefined;
  if(!map.getLayer('snow-ground')) map.addLayer({id:'snow-ground',type:'fill',source:'snowworld',paint:{'fill-color':'#f3f6fa','fill-opacity':0},layout:{visibility:'none'}},below);
  if(!map.getLayer('snow-roads')) map.addLayer({id:'snow-roads',type:'fill',source:'snowworld',paint:{'fill-color':'#e9edf2','fill-opacity':0},layout:{visibility:'none'}},under);
  if(!map.getSource('salttrack')) map.addSource('salttrack',{type:'geojson',data:EMPTY});
  if(!map.hasImage('salt-dots')){ const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d');
    for(let i=0;i<150;i++){ x.fillStyle=Math.random()<.7?'rgba(245,241,232,.95)':'rgba(205,196,178,.9)'; const r=.6+Math.random()*1.1; x.beginPath(); x.arc(Math.random()*64,Math.random()*64,r,0,6.3); x.fill(); }
    map.addImage('salt-dots',x.getImageData(0,0,64,64)); }
  if(!map.getLayer('salt-wet')) map.addLayer({id:'salt-wet',type:'line',source:'salttrack',layout:{'line-cap':'round','line-join':'round'},
    paint:{'line-color':'#4f5257','line-width':mz(6,3),'line-opacity':0}},under);
  if(!map.getLayer('salt-grains')) map.addLayer({id:'salt-grains',type:'line',source:'salttrack',minzoom:14,layout:{'line-cap':'round','line-join':'round'},
    paint:{'line-pattern':'salt-dots','line-width':mz(6,3),'line-opacity':.9}},under);
  if(!map.getSource('snowbanks')) map.addSource('snowbanks',{type:'geojson',data:EMPTY});
  if(!map.getLayer('snow-banks')) map.addLayer({id:'snow-banks',type:'fill-extrusion',source:'snowbanks',layout:{visibility:'none'},
    paint:{'fill-extrusion-color':'#f7f9fc','fill-extrusion-height':['get','h'],'fill-extrusion-base':0,'fill-extrusion-opacity':.97}});   // with the 3D buildings
  if(!map.getLayer('snow-plowed')) map.addLayer({id:'snow-plowed',type:'line',source:'plowtrack',layout:{'line-cap':'round','line-join':'round',visibility:'none'},
    paint:{'line-color':'#5d6066','line-width':((A,B)=>['interpolate',['exponential',2],['zoom'],14,['match',['get','w'],1,A[4],B[4]],24,['match',['get','w'],1,A[6],B[6]]])(mz(2.4,2),mz(3.4,2)),'line-opacity':0}},under);   // w 1: the wing's lane
  shown=-1; ready=true; }); }
// ---------- snow on the roofs ----------
const ROOFS=['roof-cap','rebuilt-roof','roof-3d'], ORIG={}; let roofK=-1;
function whiten(c,k){ const ch=i=>['+',['*',['at',i,['to-rgba',c]],1-k],252*k]; return ['rgba',ch(0),ch(1),['+',['*',['at',2,['to-rgba',c]],1-k],255*k],1]; }
function roofs(k){ if(Math.abs(k-roofK)<.04&&!(k===0&&roofK>0)) return; roofK=k;
  for(const id of ROOFS) safe('snow roof',()=>{ if(!map.getLayer(id)) return;
    if(!(id in ORIG)) ORIG[id]=map.getPaintProperty(id,'fill-extrusion-color');
    const o=ORIG[id]; if(o==null) return;
    if(k<.02){ map.setPaintProperty(id,'fill-extrusion-color',o); return; }
    const w=whiten(o,Math.min(.88,k));
    map.setPaintProperty(id,'fill-extrusion-color',id==='roof-3d'?['case',['==',['get','rf'],1],w,o]:w); });   // pitched roofs only: walls, windows, doors keep theirs
  if(typeof dirty!=='undefined') dirty=true; }
// keep the ground snow just under the roads (a layer added later before the first road would otherwise cover it)
function keepOrder(){ safe('snow order',()=>{ const all=map.getStyle().layers, ids=all.map(l=>l.id), i=ids.indexOf('snow-ground'); if(i<0) return;
  const road=(all.find(l=>l['source-layer']==='transportation')||{}).id; if(!road) return; const r=ids.indexOf(road);
  if(r>=0&&(r!==i+1)) map.moveLayer('snow-ground',road); }); }
function paint(){ if(!ready) return; roofs(Math.max(0,Math.min(1,(lvl-.15)*1.3))); const k=Math.round(lvl*100)/100; if(k===shown) return; shown=k;
  safe('snow cover paint',()=>{ const vis=k>0?'visible':'none';
    for(const id of ['snow-ground','snow-roads','snow-plowed','snow-banks']) if(map.getLayer(id)) map.setLayoutProperty(id,'visibility',vis);
    map.setPaintProperty('snow-ground','fill-opacity',Math.min(.93,k*1.15));                 // the ground goes first
    map.setPaintProperty('snow-roads','fill-opacity',Math.max(0,Math.min(.62,(k-.25)*.85))); // then the roads, never quite hidden
    map.setPaintProperty('snow-plowed','line-opacity',Math.min(.9,k*1.4));
    if(map.getLayer('salt-wet')) map.setPaintProperty('salt-wet','line-opacity',Math.min(.6,k*.9));
    if(typeof dirty!=='undefined') dirty=true; }); }
onReady(function snowCover(){ layers(); map.on('styledata',()=>{ if(!map.getLayer('snow-ground')) layers(); }); });
// settle / melt, once a second
onTick(1000,function snowSettle(){
  const W=YD.AT&&YD.AT.wx, snowing=!!(W&&W.type==='snow'), it=snowing?(W.int||.5):0;
  const cap=snowing?Math.min(1,.45+it*.55):0;                    // light snow tops out around 2/3 cover
  if(snowing&&lvl<cap) lvl=Math.min(cap,lvl+it/150);             // heavy (1.3) ~2 min, blizzard (2.8) ~55 s, light ~7 min
  else if(!snowing&&lvl>0) lvl=Math.max(0,lvl-1/200);            // melts in ~3 min
  const rate=it>=2?5:it>=1?2:.5;                                  // inches a minute
  if(snowing) inch=Math.min(18,inch+rate/60); else inch=Math.max(0,inch-6/60);   // melts ~6 in a minute
  if(lvl===0) inch=0;
  if(Math.abs(inch-bankH)>.5&&track.length) drawTrack();
  if(lvl===0&&track.length){ track=[]; wtrack=[]; lastPt=null; drawTrack(); }
  if(window.WXHUD) try{ WXHUD(); }catch(e){}
  if(lvl>0) keepOrder();
  paint();
});
// snowbanks: thin strips beside the lanes, extruded as tall as the snow is deep (x1.6, piled), min 15 cm
let bankH=-1;
function banks(lines,wl){ safe('snow banks',()=>{ const src=map.getSource('snowbanks'); if(!src) return;
  const h=Math.max(.15,inch*.0254*1.6); bankH=inch; const F=[];
  const off=(p,hd,m)=>{ const a=hd*Math.PI/180; return [p[0]+Math.sin(a)*m/(111320*Math.cos(p[1]*Math.PI/180)),p[1]+Math.cos(a)*m/110540]; };
  const strip=(pts,sideOf,d0,d1)=>{ for(let i=1;i<pts.length;i++){ const a=pts[i-1], b=pts[i], hd=Math.atan2((b[0]-a[0])*Math.cos(a[1]*Math.PI/180),b[1]-a[1])*180/Math.PI;
      for(const sd of sideOf(a)){ const r=hd+90*sd;                // sd 1: right of travel, -1: left
        F.push({type:'Feature',properties:{h},geometry:{type:'Polygon',coordinates:[[off(a,r,d0),off(b,r,d0),off(b,r,d1),off(a,r,d1),off(a,r,d0)]]}}); } } };
  for(const c of lines) strip(c,p=>p[2]===0?[-1,1]:[p[2]],1.9,2.8);
  for(const c of wl) strip(c,()=>[-1],1.3,2.1);                   // the wing's lane: its bank on the far (left) side
  src.setData({type:'FeatureCollection',features:F}); }); }
// the plow's cleared lane
function drawTrack(){ safe('plow track',()=>{ const s=map.getSource('plowtrack'); if(!s) return;
  const lines=[]; let cur=[]; for(const p of track){ if(p===null){ if(cur.length>1) lines.push(cur); cur=[]; } else cur.push(p); } if(cur.length>1) lines.push(cur);
  const wl=[]; cur=[]; for(const p of wtrack){ if(p===null){ if(cur.length>1) wl.push(cur); cur=[]; } else cur.push(p); } if(cur.length>1) wl.push(cur);
  banks(lines,wl); const plain=c=>c.map(q=>[q[0],q[1]]);
  s.setData({type:'FeatureCollection',features:lines.map(c=>({type:'Feature',properties:{w:0},geometry:{type:'LineString',coordinates:plain(c)}}))
    .concat(wl.map(c=>({type:'Feature',properties:{w:1},geometry:{type:'LineString',coordinates:c}})))}); }); trackShown=track.length; }
onTick(250,function plowTrack(){
  const plowing=typeof CARKEY!=='undefined'&&CARKEY==='snowplow'&&mode==='car'&&lvl>.05&&Math.abs(S.v)>.4&&!(window.PLOW&&!PLOW.down);   // blade raised: no lane
  if(!plowing){ if(lastPt){ track.push(null); lastPt=null; } return; }
  const ag=window.PLOW?PLOW.angle:0, p=[+S.lng.toFixed(7),+S.lat.toFixed(7),Math.abs(ag)<6?0:ag>0?1:-1];   // + angle throws right
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
// the salted road: a line along where the truck spread salt (pieces split where it stopped salting)
function drawSalt(){ safe('salt track',()=>{ const s=map.getSource('salttrack'); if(!s) return; const L=[]; let c=[];
  for(const p of salt){ if(p===null){ if(c.length>1) L.push(c); c=[]; } else c.push(p); } if(c.length>1) L.push(c);
  s.setData({type:'FeatureCollection',features:L.map(q=>({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:q}}))}); if(typeof dirty!=='undefined') dirty=true; }); }
onTick(300,function saltTrack(){ const on=!!(window.PLOW&&PLOW.salting);
  if(!on){ if(sLast){ salt.push(null); sLast=null; } return; }
  // the spinner is ~3.7 m behind the truck's centre
  const h=S.hdg*Math.PI/180, p=[+(S.lng-Math.sin(h)*3.7/(111320*Math.cos(S.lat*Math.PI/180))).toFixed(7),+(S.lat-Math.cos(h)*3.7/110540).toFixed(7)];
  if(sLast&&meters(sLast[1],sLast[0],p[1],p[0])<3) return; if(sLast&&meters(sLast[1],sLast[0],p[1],p[0])>60) salt.push(null);
  salt.push(p); sLast=p; if(salt.length>8000) salt.splice(0,1000); if(salt.length%2===0) drawSalt(); });
window.SNOWCOVER={get level(){ return lvl; },get inches(){ return inch; },set(v,inches){ lvl=Math.max(0,Math.min(1,+v||0)); if(inches!=null) inch=+inches; else if(lvl>0&&inch<1) inch=lvl*8; paint(); }};
})();
