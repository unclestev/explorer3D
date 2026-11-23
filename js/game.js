/* Yorkville Driver: map, vehicles, physics, camera, compass, trees, water towers, hang glider. */
/* ---------- GRAPHICS QUALITY (was the on/off battery saver) ----------
   QL: 0 = Low (the old battery saver: 30 fps cap, lower resolution, flat terrain, fewer trees, no redraw while parked),
       1 = Medium (hills on, mid detail; still 30 fps on touch devices to spare the battery), 2 = High (everything).
   QMODE: 'auto' | 'low' | 'med' | 'high' (⚙️ Graphics, localStorage ydQual). In auto, js/enh/quality.js measures real
   frame times while driving and moves the level; phones start Low and may go up to Medium, PCs start High.
   POWER stays as "Low level is on" - every module that asks POWER keeps working. Q3(low,med,high) picks a value. */
const COARSE=(()=>{ try{ return matchMedia('(pointer: coarse)').matches; }catch(e){ return false; } })();
const QNAMES=['low','med','high'], QMAX_AUTO=COARSE?1:2;
let QMODE='auto', QL=COARSE?0:2, QAUTO={lvl:COARSE?0:2,cap:QMAX_AUTO};
try{ let m=localStorage.getItem('ydQual');
  if(!m){ const v=localStorage.getItem('ydPower'); m = v==='0' ? 'high' : (v==='1'&&!COARSE) ? 'low' : 'auto'; }   // carry over an old saver choice
  if(m==='auto'||QNAMES.includes(m)) QMODE=m;
  const a=JSON.parse(localStorage.getItem('ydQAuto')||'null');
  if(a&&a.lvl>=0&&a.lvl<=2&&a.cap>=0&&a.cap<=2) QAUTO={lvl:Math.min(a.lvl,a.cap,QMAX_AUTO),cap:Math.min(a.cap,QMAX_AUTO)};
}catch(e){}
QL = QMODE==='auto' ? QAUTO.lvl : QNAMES.indexOf(QMODE);
let POWER = QL===0;
const Q3=(l,m,h)=>QL===0?l:QL===1?m:h;
const CAP30=()=>QL===0||(QL===1&&COARSE);                          // 30 fps cap
let PRS=1;                                                        // adaptive sharpness: map resolution scale (quality.js)
const mapPR=()=>{ const d=devicePixelRatio||1; return Math.max(Math.min(d,1),Math.min(d,Q3(1.25,1.5,2))*PRS); };
// First start: on Route 47 just south of Raging Waves waterpark, pointed at it. After that: where you were last
// (saved by js/enh/savepos.js as localStorage 'ydPos'; ⚙️ Start point goes back to HOME).
const RAGING_WAVES={lng:-88.44446,lat:41.6989};
const HOME=(()=>{ const lng=-88.4474, lat=41.6955, dN=(RAGING_WAVES.lat-lat)*111320, dE=(RAGING_WAVES.lng-lng)*111320*Math.cos(lat*Math.PI/180);
  return {lng,lat,hdg:(Math.atan2(dE,dN)*180/Math.PI+360)%360}; })();
// ⚙️ Start at: 'last' (default) = where you left off; 'random' = one of these places, a different one each time.
// Coordinates are the landmark itself (Wikipedia / historical-marker / map listings, 2026-10-02); savepos.js then moves
// the car onto the nearest real road a short way before it, pointing along the road.
const START_PLACES=[
  {name:'Raging Waves, Yorkville',lng:-88.44446,lat:41.6989},
  {name:'Kendall County Courthouse, Yorkville',lng:-88.44795,lat:41.64040},
  {name:'Little White School Museum, Oswego',lng:-88.348953,lat:41.682725},
  {name:'Blackberry Farm, Aurora',lng:-88.390971,lat:41.764934},
  {name:'Paramount Theatre, Aurora',lng:-88.31444,lat:41.757667},
  {name:'Aurora Municipal Airport, Sugar Grove',lng:-88.47556,lat:41.77194},
  {name:'Waubonsee Community College, Sugar Grove',lng:-88.458531,lat:41.795358},
  {name:'Farnsworth House, Plano',lng:-88.5357,lat:41.6350},
  {name:'Silver Springs State Park, Yorkville',lng:-88.5225,lat:41.6275},
  {name:'Fermilab, Batavia',lng:-88.25722,lat:41.83194},
  {name:'Fabyan Villa, Geneva',lng:-88.31194,lat:41.87111},
  {name:'Arcada Theatre, St. Charles',lng:-88.3120306,lat:41.913667},
  {name:'Centennial Beach & Riverwalk, Naperville',lng:-88.1540,lat:41.7695},
  {name:'Cantigny Park, Wheaton',lng:-88.1559,lat:41.8546},
  {name:'Morton Arboretum, Lisle',lng:-88.07028,lat:41.81611},
  {name:'Starved Rock State Park, Utica',lng:-88.99028,lat:41.32139}
];
const START=(()=>{
  let how='last'; try{ how=localStorage.getItem('ydStart')||'last';
    const once=localStorage.getItem('ydStartOnce'); if(once){ how=once; localStorage.removeItem('ydStartOnce'); } }catch(e){}   // ⚙️ Go to now (random / home)
  if(how==='home') return HOME;
  if(how==='tp'){ try{ const t=JSON.parse(localStorage.getItem('ydTp')||'null'); localStorage.removeItem('ydTp');   // ⚡ teleport (js/enh/teleport.js)
    if(t&&isFinite(t.lat)&&isFinite(t.lng)) return {lng:t.lng,lat:t.lat,hdg:0,tp:true,place:{name:String(t.name||'Teleported').slice(0,140),lng:t.lng,lat:t.lat,back:+t.back||0}}; }catch(e){} }
  if(how==='random'){
    let lastI=-1; try{ lastI=+localStorage.getItem('ydStartLast'); }catch(e){}
    let i=Math.floor(Math.random()*START_PLACES.length); if(i===lastI) i=(i+1+Math.floor(Math.random()*(START_PLACES.length-1)))%START_PLACES.length;
    try{ localStorage.setItem('ydStartLast',String(i)); }catch(e){}
    const P=START_PLACES[i]; return {lng:P.lng,lat:P.lat,hdg:0,place:P};
  }
  try{ const p=JSON.parse(localStorage.getItem('ydPos')||'null');
    if(p&&[p.lng,p.lat,p.hdg].every(Number.isFinite)&&Math.abs(p.lat)<85&&Math.abs(p.lng)<=180) return {lng:p.lng,lat:p.lat,hdg:p.hdg}; }catch(e){}
  return HOME; })();
/* ---------- MAP ---------- */
const map = new maplibregl.Map({ pixelRatio:mapPR(),
  container:'map', style:'https://tiles.openfreemap.org/styles/liberty',
  center:[START.lng,START.lat], bearing:START.hdg, zoom:19.3, pitch:68, maxPitch:85, maxZoom:24,
  interactive:false, fadeDuration:0, attributionControl:false
});
let roadIds=[], blockIds=[], waterIds=[], bridgeIds=[], hideIds=[];
/* house numbers: only within HOUSE_R metres of the car, never overlapping */
let houseIds=[]; const HOUSE_R=280; let hLat=null,hLng=null;
function updateHouseFilter(force){
  if(!houseIds.length) return;
  if(!force && hLat!==null && meters(hLat,hLng,S.lat,S.lng)<(POWER?120:70)) return;   // each refilter re-lays out every house-number label
  hLat=S.lat; hLng=S.lng;
  const ring=[], dLat=HOUSE_R/111320, dLng=HOUSE_R/(111320*Math.cos(rad(S.lat)));
  for(let i=0;i<=24;i++){ const t=i/24*2*Math.PI; ring.push([S.lng+Math.cos(t)*dLng, S.lat+Math.sin(t)*dLat]); }
  const f=['within',{type:'Polygon',coordinates:[ring]}];
  houseIds.forEach(id=>{ try{ map.setFilter(id,f); }catch(e){ try{ map.setLayoutProperty(id,'visibility','none'); }catch(_){} } });
}
function inRing(x,y,r){ let c=false; for(let i=0,j=r.length-1;i<r.length;j=i++){ const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1]; if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi)) c=!c; } return c; }
function inPoly(x,y,pl){ if(!inRing(x,y,pl[0])) return false; for(let k=1;k<pl.length;k++) if(inRing(x,y,pl[k])) return false; return true; }
function contains(g,x,y){ if(!g) return false; if(g.type==='Polygon') return inPoly(x,y,g.coordinates); if(g.type==='MultiPolygon') return g.coordinates.some(pl=>inPoly(x,y,pl)); return false; }
const destroyed=[];
// The style's own building filter may use legacy syntax (e.g. ["!has","hide_3d"]); it can't be nested inside an
// expression ["all",...] (MapLibre rejects it with a validation error), so convert it to an expression first.
const CMP=['==','!=','<','>','<=','>='];
function isLegacy(f){ if(!Array.isArray(f)) return false; const o=f[0];
  if(o==='all'||o==='any') return f.slice(1).some(isLegacy);
  if(o==='none'||o==='!has') return true;
  if(CMP.includes(o)) return typeof f[1]==='string';
  if(o==='in'||o==='!in') return typeof f[1]==='string' && (o==='!in'||f.length!==3||!Array.isArray(f[2]));
  return false; }
function toExpr(f){ if(!isLegacy(f)) return f; const o=f[0];
  if(o==='all'||o==='any') return [o,...f.slice(1).map(toExpr)];
  if(o==='none') return ['!',['any',...f.slice(1).map(toExpr)]];
  const k=f[1], g=k==='$type'?['geometry-type']:k==='$id'?['id']:['get',k];
  if(o==='has') return k==='$id'?['!=',['id'],null]:['has',k];
  if(o==='!has') return ['!',toExpr(['has',k])];
  if(o==='in'||o==='!in'){ const e=['in',g,['literal',f.slice(2)]]; return o==='in'?e:['!',e]; }
  return [o,g,f[2]]; }
const origFilters={};   // layer id -> original filter (as expression) for every building extrusion layer
/* OpenFreeMap packs many neighbouring buildings into ONE feature (a MultiPolygon with one id).
   Hiding that id would flatten the whole block, so after hiding it we redraw every other building
   of the group from a GeoJSON layer ('rebuilt-3d') and leave out only the one the car hit. */
let bSrc='openmaptiles';
const rebuilt={type:'FeatureCollection',features:[]}, rebuiltKeys=new Set(), holes=[];
let rbSeq=0, rbTimer=null;
const PADDEG=0.000006;                                        // ~0.5 m: touching neighbours don't count as overlap
function bboxOf(r){ let a=[1e9,1e9,-1e9,-1e9]; for(const c of r){ if(c[0]<a[0])a[0]=c[0]; if(c[1]<a[1])a[1]=c[1]; if(c[0]>a[2])a[2]=c[0]; if(c[1]>a[3])a[3]=c[1]; } return a; }
function overlaps(a,b){ return a[0]<b[2]-PADDEG && a[2]>b[0]+PADDEG && a[1]<b[3]-PADDEG && a[3]>b[1]+PADDEG; }
function partsOf(g){ return !g?[]:g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[]; }
function addSurvivors(feats){
  let n=0;
  for(const f of feats){ const pr=f.properties||{};
    for(const pl of partsOf(f.geometry)){
      const bb=bboxOf(pl[0]);
      if(holes.some(h=>overlaps(bb,h))) continue;            // the smashed building (incl. its copies in neighbouring tiles)
      const key=bb.map(v=>v.toFixed(6)).join(',');
      if(rebuiltKeys.has(key)) continue; rebuiltKeys.add(key);
      rbSeq++; rebuilt.features.push({type:'Feature',id:rbSeq,geometry:{type:'Polygon',coordinates:pl},
        properties:{rid:rbSeq,h:+(pr.render_height??pr.height??6)||6,b:+(pr.render_min_height??pr.min_height??0)||0}});
      n++;
    } }
  return n;
}
function refreshRebuilt(){ const s=map.getSource('rebuilt'); if(s) s.setData(rebuilt); }
function collectSurvivors(){
  if(!destroyed.length) return;
  try{ const n=addSurvivors(map.querySourceFeatures(bSrc,{sourceLayer:'building',filter:['in',['id'],['literal',destroyed.slice()]]}));
    if(n) refreshRebuilt(); }catch(e){ console.warn('rebuild',e); }
}
function smashFeature(f,pt){
  const part=partsOf(f.geometry).find(pl=>inPoly(pt[0],pt[1],pl));
  if(part) holes.push(bboxOf(part[0]));
  if(f.layer && f.layer.id==='rebuilt-3d'){                  // hitting a redrawn building: just drop that one
    const rid=f.properties&&f.properties.rid;
    rebuilt.features=rebuilt.features.filter(x=>x.properties.rid!==rid); refreshRebuilt(); return;
  }
  destroyBuilding(f.id);
  collectSurvivors();
}
function destroyBuilding(id){
  // Features with no stable id can't be targeted by filter: skip hiding (the smash effect still plays).
  if(id==null||destroyed.includes(id)) return; destroyed.push(id);
  const f=['!',['in',['id'],['literal',destroyed.slice()]]];   // same id across tiles => split buildings vanish together
  for(const lid of hideIds){
    if(!map.getLayer(lid)) continue;
    const of=origFilters[lid], nf=of?['all',of,f]:f;
    try{ map.setFilter(lid,nf);
      if(of && JSON.stringify(map.getFilter(lid))!==JSON.stringify(nf)) map.setFilter(lid,f); // rejected: drop original
    }catch(e){ console.warn('destroyBuilding',e); }
  }
}
const seen={}; let nSeen=0;
map.on('error',e=>{ const m=((e&&e.error&&(e.error.message||e.error.status))||'unknown map error')+((e&&e.error&&e.error.stack)?'\n'+e.error.stack.split('\n').slice(0,4).join('\n'):''); const k=String(m).slice(0,60);
  console.warn('MAP:',m); if(seen[k]||nSeen>=6)return; seen[k]=1; nSeen++;
  let d=document.getElementById('maperr'); if(!d){d=document.createElement('pre'); d.id='maperr';
    d.style.cssText='position:fixed;left:8px;right:8px;top:70px;z-index:9998;background:#7c2d12;color:#fff;font:11px monospace;padding:8px;white-space:pre-wrap;border-radius:8px;max-height:30%;overflow:auto;pointer-events:none';
    document.body.appendChild(d);} d.textContent+='MAP: '+m+'\n'; });
map.on('load',()=>{ try{ initMini();
  try{ map.setSky({'sky-color':'#7ab8ea','horizon-color':'#eaf3fb','fog-color':'#eaf3fb','sky-horizon-blend':.6,'horizon-fog-blend':.7,'fog-ground-blend':.4}); }catch(e){}
  const layers = map.getStyle().layers;
  const src = layers.find(l=>l['source-layer']==='building')?.source || 'openmaptiles';
  if(!map.getLayer('building-3d') && map.getSource(src)){
    map.addLayer({id:'building-3d',source:src,'source-layer':'building',type:'fill-extrusion',minzoom:14,
      paint:{'fill-extrusion-color':'#d6dbe2','fill-extrusion-height':['coalesce',['get','render_height'],['get','height'],6],
      'fill-extrusion-base':['coalesce',['get','render_min_height'],['get','min_height'],0],'fill-extrusion-opacity':1}});
  }
  const all = map.getStyle().layers;
  roadIds  = all.filter(l=>l['source-layer']==='transportation' && (l.type==='line'||l.type==='fill')).map(l=>l.id);
  bridgeIds= roadIds.filter(id=>!/tunnel|ferry|rail|aeroway/i.test(id));   // tunnels/ferry lines over water don't make it land
  waterIds = all.filter(l=>l['source-layer']==='water' && l.type==='fill').map(l=>l.id);
  blockIds = all.filter(l=>l['source-layer']==='building' && (l.type==='fill-extrusion')).map(l=>l.id);
  // solid buildings (owner 2026-11-21: "the buildings are kind of like windows… everything is visible through them"): the
  // OpenFreeMap style draws them at 80% opacity, so a fifth of the ground and landscape behind showed through, and a
  // translucent extrusion layer costs MapLibre an extra depth pass. The car is drawn on its own canvas on top, so nothing
  // needs to show through a building.
  for(const id of blockIds) try{ map.setPaintProperty(id,'fill-extrusion-opacity',1); }catch(e){}
  try{
    const fl=all.find(l=>l.layout&&l.layout['text-font']);
    const hs=(all.find(l=>l['source-layer']==='housenumber')||{}).source||src;
    if(map.getSource(hs) && !map.getLayer('hn-big')) map.addLayer({id:'hn-big',type:'symbol',source:hs,'source-layer':'housenumber',minzoom:15.5,
      layout:{'text-field':['to-string',['get','housenumber']],'text-font':fl?fl.layout['text-font']:['Noto Sans Regular'],
        'text-size':['interpolate',['linear'],['zoom'],15.5,10,19,18,21,26],'text-allow-overlap':false,'text-ignore-placement':false,'text-padding':6,
        'text-pitch-alignment':'viewport','text-rotation-alignment':'viewport'},
      paint:{'text-color':'#111827','text-halo-color':'rgba(255,255,255,.95)','text-halo-width':2}});
  }catch(e){ console.warn('house numbers:',e&&e.message); }
  houseIds = map.getStyle().layers.filter(l=>l.type==='symbol' && (l['source-layer']==='housenumber' || /housenum/i.test(l.id))).map(l=>l.id);
  houseIds.forEach(id=>{ try{ map.setLayoutProperty(id,'text-allow-overlap',false); map.setLayoutProperty(id,'text-ignore-placement',false); }catch(e){} });
  updateHouseFilter(true);
  hideIds = all.filter(l=>l['source-layer']==='building' && (l.type==='fill-extrusion'||l.type==='fill')).map(l=>l.id);
  hideIds.forEach(lid=>{ try{ const of=map.getFilter(lid); origFilters[lid]=of?toExpr(of):null; }catch(e){ origFilters[lid]=null; } });
  bSrc=src;
  try{
    const b3=blockIds[0], col=b3?map.getPaintProperty(b3,'fill-extrusion-color'):null, op=b3?map.getPaintProperty(b3,'fill-extrusion-opacity'):null;
    map.addSource('rebuilt',{type:'geojson',data:rebuilt});
    map.addLayer({id:'rebuilt-3d',type:'fill-extrusion',source:'rebuilt',
      paint:{'fill-extrusion-color':col||'hsl(35,8%,85%)','fill-extrusion-height':['get','h'],'fill-extrusion-base':['get','b'],
        'fill-extrusion-opacity':(typeof op==='number')?op:1}}, map.getLayer('hn-big')?'hn-big':undefined);
    blockIds.push('rebuilt-3d');
    // tiles that stream in later may contain more of a hidden group: redraw those survivors too
    map.on('sourcedata',e=>{ if(e.sourceId!==bSrc||!e.tile||!destroyed.length) return;
      clearTimeout(rbTimer); rbTimer=setTimeout(collectSurvivors,300); });
  }catch(e){ console.warn('rebuilt layer',e); }
  // ---------- terrain, land cover / land use, trees, POI pins ----------
  const firstRoad=(all.find(l=>l['source-layer']==='transportation')||{}).id;
  const before=firstRoad&&map.getLayer(firstRoad)?firstRoad:undefined;
  try{
    const dem={type:'raster-dem',tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding:'terrarium',tileSize:256,maxzoom:15,attribution:'Terrain: Mapzen / AWS Terrain Tiles'};
    map.addSource('dem',dem); map.addSource('dem-hs',Object.assign({},dem));
    map.addLayer({id:'hillshade',type:'hillshade',source:'dem-hs',layout:{visibility:QL===2?'visible':'none'},
      paint:{'hillshade-exaggeration':.4,'hillshade-shadow-color':'#5a4f3f','hillshade-highlight-color':'#fffaf0'}},before);
    applyTerrain();                                              // Medium and High, per ⚙️ 3D terrain
  }catch(e){ console.warn('terrain',e); }
  try{
    const TW=16, D=new Uint8Array(TW*TW*4);                      // crop-row stripes for farmland
    for(let y=0;y<TW;y++) for(let x=0;x<TW;x++){ const i=(y*TW+x)*4, g=(y%8)<4; D[i]=g?139:214; D[i+1]=g?163:190; D[i+2]=g?82:112; D[i+3]=255; }
    map.addImage('croprows',{width:TW,height:TW,data:D});
    map.addLayer({id:'lu-tint',type:'fill',source:bSrc,'source-layer':'landuse',
      paint:{'fill-color':['match',['get','class'],['commercial','retail'],'#f1c4c4','industrial','#d6cce6',['farmyard','farm'],'#e2cd96','residential','#ebe4d8','#e3e3e3'],'fill-opacity':.35}},before);
    map.addLayer({id:'lc-farm',type:'fill',source:bSrc,'source-layer':'landcover',filter:['==',['get','class'],'farmland'],
      paint:{'fill-pattern':'croprows','fill-opacity':.8}},before);
    // near-invisible layers used only to ask "what land am I on?"
    map.addLayer({id:'lc-detect',type:'fill',source:bSrc,'source-layer':'landcover',paint:{'fill-color':'#000','fill-opacity':.01}},before);
    map.addLayer({id:'lu-detect',type:'fill',source:bSrc,'source-layer':'landuse',paint:{'fill-color':'#000','fill-opacity':.01}},before);
    landIds=['lc-detect','lu-detect'].concat(map.getLayer('park')?['park']:[]);
  }catch(e){ console.warn('landcover',e); }
  try{
    const top=map.getLayer('hn-big')?'hn-big':undefined;
    map.addSource('decor',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    addLeafImages();
    map.addLayer({id:'tree-trunk',type:'fill-extrusion',source:'decor',filter:['==',['get','k'],'trunk'],
      paint:{'fill-extrusion-color':['coalesce',['get','c'],'#5b4636'],'fill-extrusion-height':['get','h'],'fill-extrusion-base':['get','b']}},top);
    map.addLayer({id:'tree-crown',type:'fill-extrusion',source:'decor',filter:['==',['get','k'],'crown'],
      paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-pattern':['coalesce',['get','p'],'lf-386529'],'fill-extrusion-height':['get','h'],'fill-extrusion-base':['get','b']}},top);
    map.addLayer({id:'poi-pin',type:'fill-extrusion',source:'decor',filter:['==',['get','k'],'pin'],
      paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-height':['get','h'],'fill-extrusion-base':['get','b']}},top);
    map.on('sourcedata',e=>{ if(e.sourceId!==bSrc||!e.tile) return;
      if(decorN>60 && performance.now()-decorT<4000) return;       // don't rebuild constantly while tiles stream
      clearTimeout(decorTimer); decorTimer=setTimeout(buildDecor,700); });
  }catch(e){ console.warn('decor',e); }
  try{
    const fl=(all.find(l=>l.layout&&l.layout['text-font'])||{}).layout;
    map.addSource('towers',{type:'geojson',data:towerFC(false)});
    map.addLayer({id:'tower-3d',type:'fill-extrusion',source:'towers',filter:['==',['get','k'],'tw'],
      paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-height':['get','h'],'fill-extrusion-base':['get','b'],'fill-extrusion-vertical-gradient':false}});
    map.addLayer({id:'tower-label',type:'symbol',source:'towers',filter:['==',['get','k'],'lbl'],
      layout:{'text-field':['get','name'],'text-font':fl?fl['text-font']:['Noto Sans Regular'],'text-size':14,'text-anchor':'bottom',
        'text-offset':[0,-.5],'text-allow-overlap':true,'text-ignore-placement':true},
      paint:{'text-color':'#0c4a6e','text-halo-color':'#fff','text-halo-width':2}});
  }catch(e){ console.warn('tower layers',e); }
  // faint rising-air columns under each thermal while gliding (filled by buildClouds, emptied on landing)
  try{ map.addSource('thermals',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    map.addLayer({id:'thermals',type:'fill-extrusion',source:'thermals',
      paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-height':['get','h'],'fill-extrusion-base':['get','b'],'fill-extrusion-opacity':.13,'fill-extrusion-vertical-gradient':false}}); }
  catch(e){ console.warn('thermals',e); }
  try{ map.addSource('clouds',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    map.addLayer({id:'clouds',type:'fill-extrusion',source:'clouds',
      paint:{'fill-extrusion-color':'#ffffff','fill-extrusion-height':['get','h'],'fill-extrusion-base':['get','b'],'fill-extrusion-opacity':.6}}); }
  catch(e){ console.warn('clouds',e); }
  loadTowers();
  setTimeout(()=>toast('Tip: tap 🪂 to take off in a hang glider',5000),1500);
  styleReady=true;
  const ld=document.getElementById('load'); if(ld){ ld.style.opacity=0; setTimeout(()=>ld.remove(),500); }   // (the 6 s backup timer below may already have removed it on a slow load)
  }catch(err){ console.error(err); var d=document.createElement('pre'); d.style.cssText='position:fixed;left:8px;right:8px;top:8px;z-index:9999;background:#7f1d1d;color:#fff;font:12px monospace;padding:10px;white-space:pre-wrap'; d.textContent='LOAD ERROR: '+err.message; document.body.appendChild(d); }
  const ld2=document.getElementById('load'); if(ld2){ld2.style.opacity=0; setTimeout(()=>ld2.remove(),500);}
  startLoop();
});
let started=false, styleReady=false;
// per-frame hooks for add-ons that draw moving things in the car layer (e.g. the police car). Each gets dt and
// returns true when it moved something, which forces a redraw.
const FRAME_HOOKS=[];
function runFrameHooks(dt){ let moved=false; for(const f of FRAME_HOOKS){ try{ moved=f(dt)||moved; }catch(e){ console.warn('frame hook',e); } } return moved; }
function startLoop(){ if(started) return; started=true; last=performance.now(); requestAnimationFrame(loop); }
setTimeout(()=>{const ld=document.getElementById('load'); if(ld){ld.style.opacity=0; setTimeout(()=>ld.remove(),500);} startLoop();},6000);

/* ---------- THREE: EXPLORER-STYLE SUV ---------- */
const cv=document.getElementById('car3d');
const renderer=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:(devicePixelRatio||1)<2,powerPreference:'low-power'});
const carPR=()=>Math.min(devicePixelRatio||1,Q3(1.25,1.5,2));
renderer.setPixelRatio(carPR());
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(36.87,1,10,50000);
scene.add(new THREE.HemisphereLight(0xdfeeff,0x556070,.85));
const sun=new THREE.DirectionalLight(0xfff2dd,.9); sun.position.set(-4,8,3); scene.add(sun);

const PAINT0=0x4d647c, paint=new THREE.MeshPhongMaterial({color:PAINT0,specular:0xbcd0e6,shininess:90});
const glass=new THREE.MeshPhongMaterial({color:0x0b1220,specular:0x8899bb,shininess:120});
const black=new THREE.MeshPhongMaterial({color:0x111214,shininess:30});
const tire =new THREE.MeshPhongMaterial({color:0x141414,shininess:10});
const rim  =new THREE.MeshPhongMaterial({color:0x9aa3ad,specular:0xffffff,shininess:100});
const tailOff=new THREE.MeshBasicMaterial({color:0x8a1216}), tailOn=new THREE.MeshBasicMaterial({color:0xff2a2a});
const headM=new THREE.MeshBasicMaterial({color:0xf4f8ff});

const car=new THREE.Group(); scene.add(car);       // yaw + scale
const body=new THREE.Group(); car.add(body);       // roll + pitch

function profile(pts,w,mat,bevel){
  const s=new THREE.Shape(); pts.forEach((p,i)=>i?s.lineTo(p[0],p[1]):s.moveTo(p[0],p[1]));
  const g=new THREE.ExtrudeGeometry(s,{depth:w-bevel*2,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:3});
  g.translate(0,0,-(w-bevel*2)/2); g.rotateY(Math.PI/2);   // shape +x -> car front (-z)
  const m=new THREE.Mesh(g,mat); body.add(m); return m;
}
// lower body (side profile: x = length, y = height), front is +x
profile([[-2.5,.42],[2.5,.42],[2.58,.72],[2.42,.98],[1.05,1.12],[-.6,1.14],[-2.4,1.14],[-2.55,.9]],2.0,paint,.06);
// cabin glass + roof
profile([[.95,1.1],[.3,1.7],[-2.2,1.72],[-2.48,1.14]],1.84,glass,.04);
const roof=new THREE.Mesh(new THREE.BoxGeometry(1.8,.07,2.55),paint); roof.position.set(0,1.75,.95); body.add(roof);
[-.82,.82].forEach(x=>{const r=new THREE.Mesh(new THREE.BoxGeometry(.05,.05,2.5),black); r.position.set(x,1.81,.95); body.add(r);});
// spoiler lip
const sp=new THREE.Mesh(new THREE.BoxGeometry(1.8,.06,.3),paint); sp.position.set(0,1.72,2.45); body.add(sp);
// front: grille, bumper, headlights
const grille=new THREE.Mesh(new THREE.BoxGeometry(1.1,.3,.06),black); grille.position.set(0,.82,-2.52); body.add(grille);
const fb=new THREE.Mesh(new THREE.BoxGeometry(1.96,.28,.1),black); fb.position.set(0,.52,-2.5); body.add(fb);
[-.78,.78].forEach(x=>{const h=new THREE.Mesh(new THREE.BoxGeometry(.5,.1,.06),headM); h.position.set(x,.93,-2.5); body.add(h);});
// rear: light bar, bumper
const tails=[]; 
[[-.82,.7],[.82,.7]].forEach(([x,w])=>{const t=new THREE.Mesh(new THREE.BoxGeometry(.32,.5,.06),tailOff); t.position.set(x,1.02,2.53); body.add(t); tails.push(t);});
const bar=new THREE.Mesh(new THREE.BoxGeometry(1.2,.05,.05),tailOff); bar.position.set(0,1.1,2.55); body.add(bar); tails.push(bar);
const rb=new THREE.Mesh(new THREE.BoxGeometry(1.96,.3,.1),black); rb.position.set(0,.55,2.52); body.add(rb);
// wheels
const wheels=[]; 
[[-.98,-1.55,1],[.98,-1.55,1],[-.98,1.5,0],[.98,1.5,0]].forEach(([x,z,front])=>{
  const pivot=new THREE.Group(); pivot.position.set(x,.38,z); body.add(pivot);
  const spin=new THREE.Group(); pivot.add(spin);
  const t=new THREE.Mesh(new THREE.CylinderGeometry(.38,.38,.3,24),tire); t.rotation.z=Math.PI/2; spin.add(t);
  const r=new THREE.Mesh(new THREE.CylinderGeometry(.24,.24,.32,10),rim); r.rotation.z=Math.PI/2; spin.add(r);
  wheels.push({pivot,spin,front});
});
// soft ground shadow
const sc=document.createElement('canvas'); sc.width=sc.height=128; const sx=sc.getContext('2d');
const gr=sx.createRadialGradient(64,64,10,64,64,64); gr.addColorStop(0,'rgba(0,0,0,.65)'); gr.addColorStop(1,'rgba(0,0,0,0)');
sx.fillStyle=gr; sx.fillRect(0,0,128,128);
const shadow=new THREE.Mesh(new THREE.PlaneGeometry(3.4,6.6),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(sc),transparent:true,depthWrite:false}));
shadow.rotation.x=-Math.PI/2; shadow.position.y=.03; car.add(shadow);
// the generic SUV parts, grouped so a 3D model car (below) can be shown under body instead
const suv=new THREE.Group(); while(body.children.length) suv.add(body.children[0]); body.add(suv);

/* ---------- PHOTO BODY ----------
   A cut-out photo of a real Explorer ST (img/explorer-rear.webp, the owner's own picture) is shown instead of the
   3D body. The chase camera only ever sees the car from behind and above, so a camera-facing photo that leans as the
   car turns and rolls reads as the real thing. Brake and tail lights glow on top of it, and it darkens at night.
   The 3D body stays underneath as the fallback if the image can't load; the boat, tractor and glider are unchanged.
   Add ?car=3d to the address to use the 3D model instead. */
// The cars you can pick in ⚙️ Settings. Each is a cut-out photo seen from behind and above:
//   W     width of the picture in metres (Explorer and Navigator incl. mirrors; Javelin across the rear fenders)
//   piv   where the car's centre sits, as a fraction of the picture's height from the bottom
//   glow  tail/brake light centres [x, y] (or [x, y, w, h]) as fractions of the picture (x from the left, y from the bottom); gw/gh glow size × W
//   lamp  headlight offset from the centre line (m), front = front bumper distance ahead of the centre (m) — for the beams
//   lights optional mask picture the same size as the photo, lit like the glows (used instead of glow spots)
//   paint colour of the 3D body shown instead of the photo when you look at the car from the front
//   fimg  optional front three-quarter photo (seen from the driver's side; mirrored for the passenger side) used instead of
//         the 3D body from the front; fW its width in metres, fpiv [x, y] the car's centre on the ground as fractions (y from the bottom)
//   sound engine in js/enh/sound.js; vmax top speed in m/s (speedometer units) — cars without one keep the old behaviour
//   model a .glb 3D model (metres, front +z, ground at y 0, wheels as nodes named Wheel_*) drawn instead of a photo
const CARS={
  explorer:{name:'Ford Explorer ST',paint:0x3e4855,img:'img/explorer-rear.webp?v=2',W:2.35,piv:.38,glow:[[.088,.37],[.912,.37]],gw:.26,gh:.3,lamp:.68,front:2.4,sound:'ecoboost30',perf:{t60:5.2,top:143,a0:7.8},
    fimg:'img/explorer-front.webp?v=1',fW:4.4,fpiv:[.525,.141]},     // front: the owner's Explorer ST photo, front-left three-quarter
  // 2026 Lincoln Navigator (the owner's photo, white, lit bar): the red full-width light bar and wrap-around corner lamps
  // glow from a mask cut from the photo's own red pixels (img/navigator-lights.webp), so the light covers all of that red
  navigator:{name:'Lincoln Navigator',paint:0xe6e8ea,img:'img/navigator-rear.webp?v=2',lights:'img/navigator-lights.webp?v=1',W:2.4,piv:.40,glow:[],
    gw:.1,gh:.1,lamp:.74,front:2.67,sound:'ecoboost35',perf:{t60:6.1,top:115,a0:7.2}},
  // AMC Javelin AMX (the only Javelin since 2026-11-23; the photo Javelin and the owner's two .glb versions were removed):
  // built by tools/make-javelin.py from the owner's photos (black with the gold stripe, open flared wheel arches)
  javelin3d2:{name:'AMC Javelin AMX',paint:0x141518,model:'models/javelin-amx-v3.glb?v=9',W:1.96,lamp:.5,front:2.67,sound:'amc401',vmax:120/2.237,perf:{t60:6.8,top:120,a0:6.0}},
  // "70's Muscle Car" (owner, 2026-11-23): a frozen copy of that first rebuild (tools/make-muscle70.py), which he liked but
  // said doesn't look like a Javelin should; same engine and feel, the Javelin's interior, sounds and signals
  muscle70:{name:"70's Muscle Car",paint:0x141518,model:'models/muscle-70s.glb?v=1',W:1.96,lamp:.5,front:2.67,sound:'amc401',vmax:120/2.237,perf:{t60:6.8,top:120,a0:6.0}},
  // 2023 Tesla Model Y Long Range AWD with Acceleration Boost (the owner's car, 2026-11-21, issue #5): a 3D model built by
  // tools/make-model-y.py from the owner's photos (Pearl White, 20" black aero wheels, glass roof). Electric: one gear,
  // instant torque (0-60 mph in 4.2 s with the Boost), regen braking when you lift (regen m/s^2 at speed), motor whine
  // instead of an engine (js/enh/sound.js 'tesla'). Top speed 135 mph.
  modely:{name:'Tesla Model Y',paint:0xeceeee,model:'models/model-y.glb?v=5',W:1.92,lamp:.66,front:2.30,sound:'tesla',ev:true,regen:1.7,
    vmax:135/2.237,perf:{t60:4.2,top:135,a0:9.0}},
  // 2025 Ford Expedition (owner 2026-11-22, photos of a light blue-grey one with the black Stealth-look trim): a 3D model
  // built by tools/make-expedition.py (nothing from the photos copied in). 3.5 L EcoBoost V6, 440 hp: 0-60 in ~5.9 s.
  expedition:{name:'Ford Expedition',paint:0xb4c3d2,model:'models/expedition.glb?v=9',W:2.03,lamp:.80,front:2.67,sound:'ecoboost35',perf:{t60:5.9,top:112,a0:7.4}},
  // the farm tractor as its own choice (owner 2026-11-20: "just another car option… don't change to the tractor automatically
  // when you enter a farm field"): drives in tractor mode (its 3D model, 75% speed, diesel sound) wherever you take it
  tractor:{name:'Farm tractor',tractor:true,paint:0x367c2b,W:2.3,lamp:.55,front:2.1,sound:'jd68'}
};
let CARKEY='explorer'; try{ let k=localStorage.getItem('ydCar'); if(k==='javelin'||k==='javelin3d') k='javelin3d2'; if(CARS[k]) CARKEY=k; }catch(e){}
let CARSPEC=CARS[CARKEY];
const PHOTO={mesh:null,glow:null,lights:null,fm:null,on:!/[?&]car=3d\b/.test(location.search),key:null};
function loadPhoto(key){
  const c=CARS[key]; if(c&&c.model){ loadModel(key); return; }
  if(!PHOTO.on||!c||!c.img) return;                                   // the tractor has its own 3D model, no photo
  new THREE.TextureLoader().load(c.img,tex=>{
    if(key!==CARKEY){ tex.dispose(); return; }                     // switched again while this one was loading
    tex.anisotropy=renderer.capabilities.getMaxAnisotropy?Math.min(4,renderer.capabilities.getMaxAnisotropy()):1;
    const W=c.W, H=W*tex.image.height/tex.image.width, PIV=c.piv;
    const g=new THREE.PlaneGeometry(W,H); g.translate(0,H*(.5-PIV),0);
    const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({map:tex,transparent:true,alphaTest:.04,depthTest:false,depthWrite:false}));
    m.renderOrder=10; m.visible=false; scene.add(m);
    // soft red glow over each tail light (brighter when braking, a faint glow after dark)
    const gc=document.createElement('canvas'); gc.width=gc.height=64; const gx=gc.getContext('2d'), rg=gx.createRadialGradient(32,32,1,32,32,32);
    rg.addColorStop(0,'rgba(255,90,70,1)'); rg.addColorStop(.3,'rgba(255,30,25,.75)'); rg.addColorStop(1,'rgba(255,0,0,0)'); gx.fillStyle=rg; gx.fillRect(0,0,64,64);
    const gm=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(gc),transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0});
    for(const [fx,fy,fw,fh] of c.glow){ const q=new THREE.Mesh(new THREE.PlaneGeometry(W*(fw||c.gw),W*(fh||c.gh)),gm); q.position.set((fx-.5)*W,H*(fy-PIV),.01); q.renderOrder=11; m.add(q); }
    // a light mask the size of the photo (red where the lamps are, with a soft bloom), added over it like the glows
    let lm=null;
    if(c.lights){ lm=new THREE.MeshBasicMaterial({transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0});
      const q=new THREE.Mesh(g,lm); q.position.z=.01; q.renderOrder=11; m.add(q);
      new THREE.TextureLoader().load(c.lights,lt=>{ if(PHOTO.lights!==lm){ lt.dispose(); return; } lm.map=lt; lm.needsUpdate=true; dirty=true; },undefined,e=>console.warn('car light mask',e)); }
    const old=PHOTO.mesh; if(old){ scene.remove(old); old.geometry.dispose(); old.material.map.dispose(); old.material.dispose(); PHOTO.glow.map.dispose(); PHOTO.glow.dispose();
      if(PHOTO.lights){ if(PHOTO.lights.map) PHOTO.lights.map.dispose(); PHOTO.lights.dispose(); } }
    PHOTO.mesh=m; PHOTO.glow=gm; PHOTO.lights=lm; PHOTO.key=key; dirty=true;
  },undefined,e=>console.warn('car photo could not load, using the 3D model',e));
}
// pick a car: swaps the photo, tells the headlights (atmos.js) and the engine sound (sound.js), remembers the choice
// the boat is picked too (owner 2026-11-20: "the boat doesn't switch by default… a vehicle option that we can choose if we
// are in water"): only while the car is in the water; picking any car (or the same one) takes you back out of it
let BOATPICK=false;
function pickBoat(){
  if(mode==='boat') return;
  if(mode!=='car'&&mode!=='tractor'){ toast('🚤 Get in your vehicle and drive into the water first',2600); return; }
  if(!S.inWater){ toast('🚤 The boat is for the water: drive into a lake or river, then pick it',3000); return; }
  BOATPICK=true; setMode('boat'); dirty=true;
}
function setCar(key){
  if(!CARS[key]) return;
  if(mode==='boat'||BOATPICK){ BOATPICK=false; if(mode==='boat') setMode(CARS[key].tractor?'tractor':'car'); if(S.inWater) toast('🌊 Back in the '+(CARS[key].tractor?'tractor':'car')+': wade to the shore',2400); }
  if(key===CARKEY&&PHOTO.key===key) return;
  CARKEY=key; CARSPEC=CARS[key]; try{ localStorage.setItem('ydCar',key); }catch(e){}
  loadPhoto(key); loadFront(key);
  if(mode==='car'||mode==='tractor'){ const m=CARSPEC.tractor?'tractor':'car'; if(m!==mode) setMode(m); }   // the tractor is picked, never switched to by the ground
  try{ if(window.onCarChange) window.onCarChange(key); }catch(e){ console.warn('car change',e); }
  dirty=true;
}
// the front photo (if the car has one): a second camera-facing picture, shown when you look at the car from the front
function loadFront(key){
  const old=PHOTO.fm; if(old){ scene.remove(old); old.geometry.dispose(); old.material.map.dispose(); old.material.dispose(); PHOTO.fm=null; }
  const c=CARS[key]; if(!PHOTO.on||!c||!c.fimg) return;
  new THREE.TextureLoader().load(c.fimg,tex=>{
    if(key!==CARKEY||PHOTO.fm){ tex.dispose(); return; }
    tex.anisotropy=renderer.capabilities.getMaxAnisotropy?Math.min(4,renderer.capabilities.getMaxAnisotropy()):1;
    const W=c.fW, H=W*tex.image.height/tex.image.width;
    const g=new THREE.PlaneGeometry(W,H); g.translate(W*(.5-c.fpiv[0]),H*(.5-c.fpiv[1]),0);
    const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({map:tex,transparent:true,alphaTest:.04,depthTest:false,depthWrite:false,side:THREE.DoubleSide}));
    m.renderOrder=10; m.visible=false; scene.add(m); PHOTO.fm=m; dirty=true;
  },undefined,e=>console.warn('car front photo could not load, using the 3D model',e));
}
/* ---------- 3D MODEL CARS ----------
   A car with `model` is a real 3D model under `body` (so it rolls and pitches like the SUV), loaded only when that car
   is picked (GLTFLoader too, from js/lib). Until it has loaded, the generic SUV shows in the car's paint. glTF faces +z,
   the game's car faces -z, so the model is turned 180°. The renderer has no sRGB output, so the model's colours are
   converted to match the rest of the scene; metal reflects a small sky/ground gradient made once (PMREM). */
const MODELS={};                                   // key -> {g, wheels:[{o,front}], r, tail, head, mats} (kept once loaded)
let ENVTEX=null;
function envTex(){
  if(ENVTEX) return ENVTEX;
  const es=new THREE.Scene(), geo=new THREE.SphereGeometry(10,24,12), pos=geo.attributes.position, col=[], c=new THREE.Color();
  const sky=new THREE.Color(0x7d9ccc), hor=new THREE.Color(0xdde6ef), gnd=new THREE.Color(0x3c3f3c), gh=new THREE.Color(0x8d8f88);
  for(let i=0;i<pos.count;i++){ const y=pos.getY(i)/10; if(y>=0) c.copy(hor).lerp(sky,Math.pow(y,.6)); else c.copy(gh).lerp(gnd,Math.pow(-y,.5)); col.push(c.r,c.g,c.b); }
  geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  es.add(new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide})));
  const pm=new THREE.PMREMGenerator(renderer); ENVTEX=pm.fromScene(es,.04).texture; pm.dispose(); geo.dispose();
  return ENVTEX;
}
function loadModel(key){
  const c=CARS[key]; if(!c||!c.model||MODELS[key]||loadModel.busy===key) return;
  loadModel.busy=key;
  const go=()=>new THREE.GLTFLoader().load(c.model,gl=>{
    loadModel.busy=null;
    const g=new THREE.Group(), root=gl.scene, env=envTex(), mats=new Set(), wheels=[], photos=[]; let tail=null, head=null, r=.33, tailPhoto=false;
    g.rotation.y=Math.PI; g.add(root); g.visible=false;
    root.traverse(o=>{
      // the outermost node of each wheel; not wheel *wells* or arches (v2 has a "Wheel_Wells" part, which was being spun round the car)
      const isW=n=>/^wheel/i.test(n||'')&&!/well|arch|house/i.test(n);
      if(isW(o.name)&&!isW(o.parent&&o.parent.name)&&Math.abs(o.position.x)>.2){ o.rotation.order='YXZ'; wheels.push({o,front:o.position.z>0}); }
      if(!o.isMesh) return;
      const ms=Array.isArray(o.material)?o.material:[o.material];
      // lamps flush with (or just inside) the body would be hidden by the paint: move them 3.5 cm out from the car's end
      if(ms.some(m=>/tail|head/i.test(m.name||''))&&!ms.some(m=>/photo/i.test(m.name||''))){ const bb=new THREE.Box3().setFromObject(o), cz=(bb.min.z+bb.max.z)/2; o.position.z+=Math.sign(cz)*.035; }
      for(const m of ms){ if(mats.has(m)) continue; mats.add(m);
        // near-black colours stay as they are: converted, they turn mid-grey under the scene's lights (black paint looked charcoal)
        if(m.color&&Math.max(m.color.r,m.color.g,m.color.b)>=.05) m.color.convertLinearToSRGB(); if(m.emissive) m.emissive.convertLinearToSRGB();
        for(const t of [m.map,m.emissiveMap]) if(t){ t.encoding=THREE.LinearEncoding; t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy()); }
        // a "Photo…" material is the owner's photo of that part of the car (Model Y: the back), lit like the paint around it
        const ph=/photo/i.test(m.name||''); if(ph){ m.userData.photo=true; photos.push(m); }
        if(m.isMeshStandardMaterial){ m.envMap=env; m.envMapIntensity=1; }
        if(/paint/i.test(m.name||'')&&m.map){ m.map.dispose(); m.map=null; }       // its metal-flake texture streaks across the panels
        if(/glass|trim|stripe|photo/i.test(m.name||'')){ m.polygonOffset=true; m.polygonOffsetFactor=-2; m.polygonOffsetUnits=-4; }   // thin layers on the paint always win the depth test (no flicker)
        if(/tail/i.test(m.name)){ tail=m; if(ph) tailPhoto=true; else { m.color.setRGB(.3,.025,.02); m.emissive.setRGB(1,.04,.02); m.emissiveIntensity=.05; } }   // dark red lens, lit below
        if(/head/i.test(m.name)){ head=m; m.emissive.setRGB(1,.98,.88); m.emissiveIntensity=.35; }
        m.needsUpdate=true; }
    });
    for(const w of wheels){ const bb=new THREE.Box3().setFromObject(w.o); r=Math.max(.15,(bb.max.y-bb.min.y)/2); }
    body.add(g); MODELS[key]={g,wheels,r,tail,head,mats:[...mats],photos,tailPhoto,lit:-1}; dirty=true;
  },undefined,e=>{ loadModel.busy=null; console.warn('car model could not load, using the 3D SUV',e); });
  if(THREE.GLTFLoader) go();
  else{ const s=document.createElement('script'); s.src='js/lib/GLTFLoader.js?v=1'; s.onload=go;
    s.onerror=()=>{ loadModel.busy=null; console.warn('GLTFLoader could not load'); }; document.head.appendChild(s); }
}
// every frame for a model car: show it (or the SUV until it has loaded), spin/steer its wheels, light its lamps
function placeModel(braking,show){
  const md=MODELS[CARKEY];
  if(PHOTO.mesh&&PHOTO.mesh.visible) PHOTO.mesh.visible=false; if(PHOTO.fm&&PHOTO.fm.visible) PHOTO.fm.visible=false;
  for(const k in MODELS) MODELS[k].g.visible=k===CARKEY;
  suv.visible=!md; if(!show) return;
  if(!md){ if(paint.color.getHex()!==CARSPEC.paint) paint.color.setHex(CARSPEC.paint); body.visible=true; return; }
  body.visible=true;
  if(mode==='car') for(const w of md.wheels){ w.o.rotation.x=S.dist/md.r; w.o.rotation.y=w.front?-S.steer:0; }
  const hemi=scene.children.find(o=>o&&o.isHemisphereLight), b=Math.max(.32,Math.min(1,(hemi?hemi.intensity:.85)/.85+.08));
  const night=tailOff.color.r>.7, lit=(braking?2:0)+(night?1:0)+b;              // only touch materials when something changed
  if(Math.abs(lit-md.lit)>.01){ md.lit=lit;
    for(const m of md.mats) if(m.isMeshStandardMaterial) m.envMapIntensity=b;
    if(md.tail&&md.tailPhoto){ const e=braking?[2.4,.42,.34]:night?[1,.16,.13]:[0,0,0]; md.tail.emissive.setRGB(e[0],e[1],e[2]); md.tail.emissiveIntensity=1; }   // the photo's own lamps glow red
    else if(md.tail) md.tail.emissiveIntensity=braking?2.4:night?.6:.05;
    if(md.head) md.head.emissiveIntensity=night?1.6:.35; }
}
loadPhoto(CARKEY); loadFront(CARKEY);
// called every frame after the car transform is set: face the camera, lean with the car's heading and body roll
function placePhoto(braking){
  const walk=mode==='walk', show=mode==='car'||walk&&!!window.WALK&&WALK.parked()==='car';   // on foot: the parked car
  if(window.COCKPIT&&COCKPIT.on&&mode==='car'){ if(PHOTO.mesh) PHOTO.mesh.visible=false; if(PHOTO.fm) PHOTO.fm.visible=false; body.visible=false; return; }   // you're inside it
  if(CARSPEC.model){ placeModel(braking,show); return; }
  if(!suv.visible){ suv.visible=true; for(const k in MODELS) MODELS[k].g.visible=false; }
  const m=PHOTO.mesh; if(!m) return;
  const fm=PHOTO.fm;
  if(!show){ if(m.visible||fm&&fm.visible){ m.visible=false; if(fm) fm.visible=false; body.visible=false; } return; }
  // looking at the car from the front (camera panned round, or walking round it): the car's front photo, or the 3D body
  // in roughly the car's colour for cars without one; the rear photo again from behind (a little hysteresis)
  const hd=walk?WALK.parkedAt.hdg:S.hdg, rel=Math.abs(((hd-S.camB)%360+540)%360-180);
  PHOTO.front=PHOTO.front?rel>95:rel>105;
  const pc=PHOTO.front&&CARSPEC.paint||PAINT0; if(paint.color.getHex()!==pc) paint.color.setHex(pc);
  const hemi=scene.children.find(o=>o&&o.isHemisphereLight), b=Math.max(.32,Math.min(1,(hemi?hemi.intensity:.85)/.85+.08));
  // from the front: the front photo if the car has one (camera on the passenger side → mirrored), else the 3D body
  const useF=PHOTO.front&&!!fm&&PHOTO.key===CARKEY;
  m.visible=!PHOTO.front; body.visible=PHOTO.front&&!useF; if(fm) fm.visible=useF;
  if(useF){ const d=((S.camB-hd)%360+540)%360-180;              // > 0: camera ahead-left of the car (driver's side)
    const sc=car.scale.x; fm.scale.set(d>=0?sc:-sc,sc,sc); fm.position.copy(car.position);
    fm.position.y+=walk?0:(S.by||0)*sc; fm.quaternion.copy(camera.quaternion); fm.rotateZ(walk?0:-(S.roll+S.sr+(S.bz||0))*.8); fm.material.color.setScalar(b); }
  if(PHOTO.front) return;
  m.scale.setScalar(car.scale.x); m.position.copy(car.position); if(!walk) m.position.y+=(S.by||0)*car.scale.x;
  // lean with the car's heading only for the small angles of the chase camera lagging in a turn (up to ~17°); panned
  // further round (look-around, or walking past the parked car) the lean fades back to 0 by ~52°, so the photo stays
  // upright on the ground instead of turning sideways or upside down
  const yw=Math.atan2(Math.sin(car.rotation.y),Math.cos(car.rotation.y)), ay=Math.abs(yw),
        lean=ay<=.3?yw:Math.sign(yw)*.3*Math.max(0,1-(ay-.3)/.6);
  m.quaternion.copy(camera.quaternion); m.rotateZ(lean+(walk?0:(S.roll+S.sr+(S.bz||0))*.8));   // same lean directions as the 3D body (camera looks down the car's z axis)
  m.material.color.setScalar(b);
  PHOTO.glow.opacity=braking?1:(tailOff.color.r>.7?.45:0);        // tailOff turns brighter at night (js/enh/atmos.js)
  if(PHOTO.lights) PHOTO.lights.opacity=PHOTO.lights.map?PHOTO.glow.opacity:0;
}



/* ---------- BASS BOAT (swaps in when the car enters water) ---------- */
const boatG=new THREE.Group(); boatG.visible=false; car.add(boatG);
const hullM=new THREE.MeshPhongMaterial({color:0x0f7a4a,specular:0xd8ffe8,shininess:110});
const trimM=new THREE.MeshPhongMaterial({color:0xf2c14e,shininess:80});
const deckM=new THREE.MeshPhongMaterial({color:0x5b6470,shininess:8});
const seatM=new THREE.MeshPhongMaterial({color:0x1b1f27,shininess:40});
const metalM=new THREE.MeshPhongMaterial({color:0xaeb6c0,specular:0xffffff,shininess:100});
function plan(sx,sy,depth,mat,y0,bev){
  const sh=new THREE.Shape(), L=2.6, B=3.0, W=1.05;
  sh.moveTo(-W*sx,-L*sy); sh.lineTo(W*sx,-L*sy); sh.lineTo(W*sx,.2*sy);
  sh.quadraticCurveTo(.9*sx,1.8*sy,0,B*sy); sh.quadraticCurveTo(-.9*sx,1.8*sy,-W*sx,.2*sy); sh.closePath();
  const g=new THREE.ExtrudeGeometry(sh,{depth:depth,bevelEnabled:bev>0,bevelThickness:bev,bevelSize:bev,bevelSegments:2});
  g.rotateX(-Math.PI/2); const m=new THREE.Mesh(g,mat); m.position.y=y0; boatG.add(m); return m;   // bow points to -z
}
function bx(w,h,d,mat,x,y,z){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z); boatG.add(m); return m; }
plan(1,1,.46,hullM,0,.05); plan(1,1,.05,trimM,.5,0); plan(.9,.93,.05,deckM,.55,0);
bx(1.5,.16,1.2,deckM,0,.72,-1.75); bx(1.75,.16,1.1,deckM,0,.72,1.55);          // casting decks
bx(1.0,.45,.5,hullM,0,.88,-.25);                                                 // console
bx(1.15,.42,.04,glass,0,1.22,-.52).rotation.x=.45;                               // windshield
function seat(x,z){ const c=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.3,8),metalM); c.position.set(x,.85,z); boatG.add(c);
  bx(.5,.14,.5,seatM,x,1.02,z); bx(.5,.42,.1,seatM,x,1.27,z+.24); }
seat(0,-1.85); seat(-.4,.6); seat(.4,.6);
bx(.1,.6,.1,metalM,0,.72,-2.6); bx(.35,.16,.3,seatM,0,1.05,-2.55);               // bow trolling motor
bx(.55,.6,.6,hullM,0,1.1,2.85); bx(.2,.7,.35,metalM,0,.3,2.95);                  // outboard

/* ---------- FARM TRACTOR (⚙️ Car → Tractor; no longer swaps in on farmland by itself) ---------- */
const tractorG=new THREE.Group(); tractorG.visible=false; car.add(tractorG);
const tRed=new THREE.MeshPhongMaterial({color:0x367c2b,specular:0xd9f5c8,shininess:70});   // tractor green
const tCream=new THREE.MeshPhongMaterial({color:0xffde00,shininess:50});                        // yellow wheels & trim
const tGlass=new THREE.MeshPhongMaterial({color:0x9fc3d9,transparent:true,opacity:.35,shininess:120,depthWrite:false});
function tb(w,h,d,mat,x,y,z){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z); tractorG.add(m); return m; }
tb(.9,.78,2.1,tRed,0,1.18,-.78);                        // hood / engine
tb(.7,.35,1.4,black,0,.72,-.9);                          // frame
tb(.84,.58,.08,black,0,1.14,-1.84);                      // grille
[-.46,.46].forEach(x=>tb(.02,.07,2.0,tCream,x,1.38,-.78));   // yellow hood stripes
[-.3,.3].forEach(x=>tb(.18,.12,.05,headM,x,1.4,-1.87));  // headlights
tb(1.3,.55,1.35,tRed,0,1.18,.72);                        // cab base
[-1.0,1.0].forEach(x=>tb(.55,.1,1.7,tRed,x,1.8,.95));    // rear fenders
[[-.62,.18],[.62,.18],[-.62,1.42],[.62,1.42]].forEach(([x,z])=>tb(.07,1.3,.07,black,x,2.1,z));  // cab posts
tb(1.5,.1,1.5,tRed,0,2.8,.8);                            // roof
tb(1.22,1.1,.03,tGlass,0,2.05,.18); tb(1.22,1.1,.03,tGlass,0,2.05,1.42);
tb(.03,1.1,1.2,tGlass,-.62,2.05,.8); tb(.03,1.1,1.2,tGlass,.62,2.05,.8);
tb(.5,.14,.45,black,0,1.62,.95); tb(.5,.5,.1,black,0,1.9,1.18);   // seat
const sw=new THREE.Mesh(new THREE.TorusGeometry(.18,.03,6,16),black); sw.position.set(0,1.95,.42); sw.rotation.x=-1.0; tractorG.add(sw);
const ex=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,1.3,10),black); ex.position.set(.3,2.2,-1.3); tractorG.add(ex);
const tWheels=[];
[[-1.0,.95,.85,.5,0],[1.0,.95,.85,.5,0],[-.72,-1.35,.48,.3,1],[.72,-1.35,.48,.3,1]].forEach(([x,z,r,w,front])=>{
  const pivot=new THREE.Group(); pivot.position.set(x,r,z); tractorG.add(pivot);
  const spin=new THREE.Group(); pivot.add(spin);
  const t=new THREE.Mesh(new THREE.CylinderGeometry(r,r,w,20),tire); t.rotation.z=Math.PI/2; spin.add(t);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(r*.55,r*.55,w+.02,12),tCream); hub.rotation.z=Math.PI/2; spin.add(hub);
  for(let i=0;i<6;i++){ const lug=new THREE.Mesh(new THREE.BoxGeometry(w+.04,.08,r*.25),black); const a=i/6*Math.PI*2;   // tread lugs
    lug.position.set(0,Math.cos(a)*r*.95,Math.sin(a)*r*.95); lug.rotation.x=-a; spin.add(lug); }
  tWheels.push({pivot,spin,front,r});
});

/* ---------- HANG GLIDER (attached to the camera: a chase view from just behind the pilot) ---------- */
scene.add(camera);
const gliderG=new THREE.Group(); gliderG.visible=false; camera.add(gliderG);
const gMdl=new THREE.Group(); gliderG.add(gMdl);
const sailA=new THREE.MeshPhongMaterial({color:0xf97316,side:THREE.DoubleSide,shininess:30});
const sailB=new THREE.MeshPhongMaterial({color:0x1d4ed8,side:THREE.DoubleSide,shininess:30});
const suitM=new THREE.MeshPhongMaterial({color:0x1f2937,shininess:20});
const helmM=new THREE.MeshPhongMaterial({color:0xfacc15,shininess:90});
function wing(sgn,mat,inner){
  const sh=new THREE.Shape();                                    // x = span, y = chord (nose at -y)
  sh.moveTo(0,-2.6); sh.lineTo(sgn*5.2,1.0); sh.lineTo(sgn*4.7,1.35); sh.quadraticCurveTo(sgn*2.4,1.05,0,1.3); sh.closePath();
  const g=new THREE.ExtrudeGeometry(sh,{depth:.04,bevelEnabled:false}); g.rotateX(Math.PI/2);   // chord -> z, nose -z
  const m=new THREE.Mesh(g,mat); m.rotation.z=sgn*.05; gMdl.add(m);                           // a little dihedral
  if(inner){ const s2=new THREE.Shape(); s2.moveTo(0,-2.2); s2.lineTo(sgn*2.2,-.1); s2.lineTo(sgn*1.9,.9); s2.lineTo(0,1.1); s2.closePath();
    const g2=new THREE.ExtrudeGeometry(s2,{depth:.045,bevelEnabled:false}); g2.rotateX(Math.PI/2);
    const m2=new THREE.Mesh(g2,sailB); m2.position.y=.01; m2.rotation.z=sgn*.05; gMdl.add(m2); }
}
wing(1,sailA,true); wing(-1,sailA,true);
function tube(a,b,r,mat){ const A=new THREE.Vector3(...a), B=new THREE.Vector3(...b), d=B.clone().sub(A), L=d.length();
  const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,L,6),mat); m.position.copy(A).add(B).multiplyScalar(.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()); gMdl.add(m); return m; }
tube([0,-.03,-2.6],[0,-.03,1.4],.04,metalM);                     // keel
tube([0,0,-.1],[0,.75,-.1],.03,metalM);                          // king post
tube([0,-.05,-.15],[-.75,-1.5,-.4],.03,metalM); tube([0,-.05,-.15],[.75,-1.5,-.4],.03,metalM);   // A-frame
tube([-.75,-1.5,-.4],[.75,-1.5,-.4],.035,metalM);                // base bar
tube([0,-.1,.3],[0,-1.0,.35],.012,black);                        // hang strap
const pod=new THREE.Mesh(new THREE.CylinderGeometry(.24,.2,1.75,10),suitM); pod.rotation.x=Math.PI/2; pod.position.set(0,-1.12,.45); gMdl.add(pod);
const helm=new THREE.Mesh(new THREE.SphereGeometry(.17,12,10),helmM); helm.position.set(0,-1.05,-.5); gMdl.add(helm);
[-.35,.35].forEach(x=>tube([x*.4,-1.1,-.3],[x,-1.48,-.4],.05,suitM));   // arms on the base bar
function placeGlider(){
  const D=400, visH=2*D*Math.tan(rad(camera.fov)/2), visW=visH*camera.aspect;
  gMdl.scale.setScalar(Math.min(visW*.62,visH*1.05)/10.4);
  gliderG.position.set(0,visH*.05,-D);
}

/* ---------- SMASH EFFECTS ---------- */
const debris=new THREE.Group(); scene.add(debris);
const dMats=[0xb45f4a,0x9a4a3a,0xc9c2b4,0x8b8f96,0x6b5b4b,0xd9d2c5].map(c=>new THREE.MeshPhongMaterial({color:c}));
const boxG=new THREE.BoxGeometry(1,1,1), dustG=new THREE.SphereGeometry(1,8,6);
const parts=[];
for(let i=0;i<90;i++){ const m=new THREE.Mesh(boxG,dMats[i%dMats.length]); m.visible=false; debris.add(m); parts.push({m,dust:false,life:0,max:1,vx:0,vy:0,vz:0,rx:0,ry:0,sz:.4}); }
for(let i=0;i<36;i++){ const m=new THREE.Mesh(dustG,new THREE.MeshBasicMaterial({color:0xd6cfc4,transparent:true,opacity:0,depthWrite:false})); m.visible=false; debris.add(m); parts.push({m,dust:true,life:0,max:1,vx:0,vy:0,vz:0,rx:0,ry:0,sz:1}); }
let shake=0, smashing=false, smashCool=0;
function spawn(nDeb,nDust,dir,col){
  let d=0,u=0;
  for(const q of parts){
    if(q.life>0) continue;
    if(!q.dust && d<nDeb){ d++; q.max=q.life=.9+Math.random()*.8; q.sz=.25+Math.random()*.6;
      q.m.position.set((Math.random()-.5)*2.2,.6+Math.random()*1.4,dir*(2.2+Math.random()*.8));
      q.vx=(Math.random()-.5)*16; q.vy=6+Math.random()*12; q.vz=dir*(4+Math.random()*12)*(Math.random()<.35?-1:1);
      q.rx=(Math.random()-.5)*14; q.ry=(Math.random()-.5)*14; q.m.scale.setScalar(q.sz); q.m.visible=true; }
    else if(q.dust && u<nDust){ u++; q.max=q.life=.8+Math.random()*.7;
      q.m.position.set((Math.random()-.5)*3,.8+Math.random()*1.2,dir*(2.4+Math.random()*1.2));
      q.vx=(Math.random()-.5)*5; q.vy=1.5+Math.random()*3; q.vz=dir*(1+Math.random()*3);
      q.sz=.9; q.m.material.color.setHex(col||0xd6cfc4); q.m.scale.setScalar(q.sz); q.m.material.opacity=.6; q.m.visible=true; }
    else continue;
    // debris lives in scene space, not car space: rotate spawn position/velocity into the car's yaw
    const ry=car.rotation.y, c=Math.cos(ry), s=Math.sin(ry), P=q.m.position, px=P.x, pz=P.z, vx=q.vx, vz=q.vz;
    P.x=px*c+pz*s; P.z=-px*s+pz*c; q.vx=vx*c+vz*s; q.vz=-vx*s+vz*c;
    if(d>=nDeb&&u>=nDust) break;
  }
}
function updateFx(dt,dm,carRotY){
  const k=dm/EXAG, sy=Math.sin(carRotY), cy=Math.cos(carRotY);       // world slides past as the car drives
  let live=0;
  for(const q of parts){
    if(q.life<=0) continue;
    q.life-=dt; if(q.life<=0){ q.m.visible=false; continue; }
    live++;
    const m=q.m;
    if(q.dust){ q.vy*=Math.exp(-dt*1.2); q.sz+=dt*3.2; m.scale.setScalar(q.sz); m.material.opacity=.6*(q.life/q.max); }
    else { q.vy-=32*dt; m.rotation.x+=q.rx*dt; m.rotation.y+=q.ry*dt;
      if(m.position.y<q.sz*.5&&q.vy<0){ m.position.y=q.sz*.5; q.vy*=-.35; q.vx*=.7; q.vz*=.7; } }
    m.position.x+=q.vx*dt+sy*k; m.position.y+=q.vy*dt; m.position.z+=q.vz*dt+cy*k;
  }
  if(shake>0){ shake=Math.max(0,shake-dt*2.2); const a=shake*9, tx=(Math.random()-.5)*a, ty=(Math.random()-.5)*a;
    mapEl.style.transform=cv.style.transform='translate('+tx+'px,'+ty+'px)'; }
  else if(shake===0 && updateFx.on){ mapEl.style.transform=cv.style.transform=''; updateFx.on=false; }
  if(shake>0) updateFx.on=true;
  return live;
}

/* ---------- INPUT ---------- */
let tSteer=0,tGas=0;
// steering: a horizontal slider; the knob follows your thumb and springs back to centre
(function steering(){
  const tr=document.getElementById('st'),kb=document.getElementById('stk'); let pid=null,R=45;
  const upd=e=>{ if(e.pointerId!==pid)return; const r=tr.getBoundingClientRect(); R=Math.max(20,(r.width-kb.offsetWidth)/2);
    tSteer=Math.max(-1,Math.min(1,(e.clientX-(r.left+r.width/2))/R)); kb.style.transform=`translate(calc(-50% + ${tSteer*R}px),-50%)`; };
  const end=e=>{ if(e.pointerId!==pid)return; pid=null; tSteer=0; kb.style.transform=''; };
  tr.addEventListener('pointerdown',e=>{pid=e.pointerId; tr.setPointerCapture(pid); upd(e);});
  tr.addEventListener('pointermove',upd); tr.addEventListener('pointerup',end); tr.addEventListener('pointercancel',end);
})();
// pedals: analog. How hard = where you press (higher up the pedal = harder) and you can slide while holding.
// On screens that report real finger pressure (some iPhones, styluses) the pressure is used instead.
// Brake at a standstill = reverse, like the old slider.
let pGas=0,pBrake=0;
function pedal(id,set){
  const el=document.getElementById(id), fill=el.querySelector('.fill'); let pid=null, force=false;
  const amount=e=>{ const r=el.getBoundingClientRect(), pos=Math.max(0,Math.min(1,1-(e.clientY-r.top)/r.height));
    const p=e.pressure; if(e.pointerType!=='mouse'&&p>0&&p!==.5&&p!==1) force=true;   // this screen reports real pressure
    return force&&p>0?Math.max(.15,Math.min(1,p*1.3)):.3+.7*pos; };
  const show=a=>{ fill.style.height=(a*100).toFixed(0)+'%'; el.style.transform=a?`perspective(260px) rotateX(${(a*18).toFixed(1)}deg)`:''; el.classList.toggle('down',a>0); };
  const upd=e=>{ if(e.pointerId!==pid)return; const a=amount(e); set(a); show(a); };
  const end=e=>{ if(e.pointerId!==pid)return; pid=null; set(0); show(0); };
  el.addEventListener('pointerdown',e=>{ pid=e.pointerId; el.setPointerCapture(pid); upd(e); });
  el.addEventListener('pointermove',upd); el.addEventListener('pointerup',end); el.addEventListener('pointercancel',end);
}
pedal('sp',a=>{ pGas=a; tGas=pGas-pBrake; });
pedal('brake',a=>{ pBrake=a; tGas=pGas-pBrake; });
// 🪂 button (or the G key) launches the hang glider, and lands it again while flying
const glideBtn=document.getElementById('glide');
glideBtn.addEventListener('click',e=>{ e.stopPropagation(); toggleGlider(); });
/* the G key: js/enh/controls.js */
let toastT=null;
function toast(msg,ms){ const el=document.getElementById('toast'); el.textContent=msg; el.classList.add('show');
  clearTimeout(toastT); toastT=setTimeout(()=>el.classList.remove('show'),ms||2600); }
/* keys: js/enh/controls.js (CTRL.held) */ const KH=id=>!!(window.CTRL&&CTRL.held(id));
let kS=0,kG=0; let zoomOff=0;
let dirty=true;
const CKX=()=>window.COCKPIT&&COCKPIT.on;   // cockpit view: the world is real size; the chase-view car size is kept for later
cp.onclick=()=>{ if(CKX()){ COCKPIT.exag=Math.min(COCKPIT.exag*1.25,2.5); return; } EXAG=Math.min(EXAG*1.25,2.5); dirty=true;}; cm.onclick=()=>{ if(CKX()){ COCKPIT.exag=Math.max(COCKPIT.exag/1.25,.25); return; } EXAG=Math.max(EXAG/1.25,.25); dirty=true;};
// switch the graphics level now (0 Low / 1 Medium / 2 High). Called by setQuality (the ⚙️ choice) and by quality.js in auto.
function applyQuality(lvl){
  lvl=Math.max(0,Math.min(2,lvl|0)); QL=lvl; POWER=lvl===0; PRS=1;
  try{ map.setPixelRatio(mapPR()); }catch(e){}
  renderer.setPixelRatio(carPR()); step.W=0;                     // forces canvas resize next frame
  if(styleReady){
    applyTerrain();
    try{ if(map.getLayer('hillshade')) map.setLayoutProperty('hillshade','visibility',QL===2?'visible':'none'); }catch(e){}   // hidden = its elevation tiles aren't downloaded
    decorAt=null;                                               // rebuild trees at the new density
  }
  try{ if(window.onPowerChange) window.onPowerChange(POWER); }catch(e){}   // modules rebuild at the new level (also Medium <-> High)
  dirty=true;
}
// the player's choice in ⚙️ Graphics: 'auto' | 'low' | 'med' | 'high'
function setQuality(mode){
  if(mode!=='auto'&&!QNAMES.includes(mode)) return;
  QMODE=mode; try{ localStorage.setItem('ydQual',mode); }catch(e){}
  const lvl=mode==='auto'?QAUTO.lvl:QNAMES.indexOf(mode); if(lvl!==QL) applyQuality(lvl);
}
// adaptive sharpness: scale the map's resolution (1 = the level's full resolution); quality.js decides when
// ⚙️ 3D terrain (owner 2026-11-21: "add a setting to turn terrain on and off"): 'off' never; 'chase' (default) on Medium/High
// in the chase view only — in the cockpit it made the game ~1 s a frame on the owner's laptop; 'all' also in the cockpit
let TERRMODE=(()=>{ try{ const v=localStorage.getItem('ydTerrain'); return v==='off'||v==='all'?v:'chase'; }catch(e){ return 'chase'; } })();
function terrWant(){ return !POWER&&TERRMODE!=='off'&&!(window.COCKPIT&&COCKPIT.on&&TERRMODE!=='all'); }
function applyTerrain(){ try{ if(!map.getSource('dem')) return; const w=terrWant();
  if(w&&!terrainOn){ map.setTerrain({source:'dem',exaggeration:TERRAIN_X}); terrainOn=true; }
  else if(!w&&terrainOn){ map.setTerrain(null); terrainOn=false; S.sp=0; S.sr=0; } dirty=true; }catch(e){ console.warn('terrain toggle',e); } }
function setTerrainMode(m){ TERRMODE=m; try{ localStorage.setItem('ydTerrain',m); }catch(e){} applyTerrain(); showTerr(); }
function showTerr(){ const p=document.getElementById('terrPick'); if(p) for(const b of p.querySelectorAll('button')) b.classList.toggle('on',b.dataset.t===TERRMODE); }
{ const p=document.getElementById('terrPick'); if(p){ p.addEventListener('click',e=>{ const b=e.target.closest('button[data-t]'); if(!b) return; e.stopPropagation(); setTerrainMode(b.dataset.t);
    if(POWER&&b.dataset.t!=='off') toast('3D terrain shows on Medium or High graphics',2600); }); showTerr(); } }
function setPRScale(k){ k=Math.max(.6,Math.min(1,k)); if(Math.abs(k-PRS)<.005) return; PRS=k; try{ map.setPixelRatio(mapPR()); }catch(e){} dirty=true; }
zi.onclick=()=>{zoomOff=Math.min(zoomOff+.5,2); dirty=true;}; zo.onclick=()=>{zoomOff=Math.max(zoomOff-.5,-3); dirty=true;};

/* ---------- PHYSICS ---------- */
// look around (js/enh/look.js): one-finger drag orbits the camera. yaw = degrees from straight behind (follows the
// vehicle as it turns), pitch = degrees added to each mode's tilt. viewPitch() clamps to what the map allows.
const LOOK={yaw:0,pitch:0};
function viewPitch(base){ return Math.max(18,Math.min(80,base+LOOK.pitch)); }
function aimCam3D(H,pitchDeg){ const dist=.5*H/Math.tan(rad(camera.fov)/2), p=rad(pitchDeg);
  camera.position.set(0,dist*Math.cos(p),dist*Math.sin(p)); camera.lookAt(0,0,0); camera.updateProjectionMatrix(); }
const S={lng:START.lng,lat:START.lat,hdg:START.hdg,v:0,steer:0,camB:START.hdg,zoom:19.3,roll:0,pitch:0,wheel:0,dist:0,sp:0,sr:0};
let boat=false, waterC=0, landC=0, mode='car', farmC=0, offFarmC=0, terrainOn=false, landIds=[];
const TERRAIN_X=1.5, TRACTOR=0.75;   // tractor runs at 75% of car speed
const BOATMAX=48, WB=3.05, MAXV=60, REVMAX=28; let SPEEDUP=3, EXAG=1;   // real size (owner 2026-11-23: the car and person looked far too big next to doors and garages; was 1.6)   // SPEEDUP: world distance per game metre
let last=0,frame=0,onRoad=true,roadName='';
// world speed per speedometer metre: 3 everywhere, except the cockpit with ⚙️ Real speed (1 — the world goes past at what the
// speedometer says; owner 2026-11-20). Everything that moves scales with it; traffic's planned road speeds are rescaled.
function setSpeedScale(k){ if(!(k>0)||k===SPEEDUP) return; const r=k/SPEEDUP; SPEEDUP=k; S.yr=(S.yr||0)*r;
  try{ if(window.TRAFFIC&&TRAFFIC.rescale) TRAFFIC.rescale(r); }catch(e){} try{ const c=YD.POLICE&&YD.POLICE.state&&YD.POLICE.state.chase; if(c) c.v*=r; }catch(e){} dirty=true; }
// steering lock: 40 degrees when crawling (about a 6 m turning circle), easing off with speed so the highway stays calm.
// 25 mph turns on roughly an 18 m radius, 15 mph about 12 m. Autopilot uses the same curve.
const STEER_MAX=40*Math.PI/180;
function steerLock(v){ const a=Math.abs(v), g=grip();           // on a wet or snowy road the front tyres push wide at speed
  return STEER_MAX/(1+a/4.5+(a/12)*(a/12))*(g<1?1-(1-g)*.8*Math.max(0,Math.min(1,(a-6)/14)):1); }
/* ---------- REALISTIC DRIVING (⚙️ switch, localStorage ydReal, on by default; js/enh/quality.js owns the switch) ----------
   Each car pulls like the real one: CARS[..].perf = {t60: real 0-60 mph time in seconds at full pedal, top: top speed mph,
   a0: launch limit m/s^2 (traction)}. Thrust at full pedal = min(a0, pm/v) (traction, then engine power), against
   rolling + air drag sized so the car stops pulling just above its top speed. pm is fitted once per car so the 0-60
   time comes out right (perfOf). Rain and snow cut grip (grip()): longer braking, slower launches, less steering at speed.
   Off = the old arcade formula for every car. Speeds here are speedometer m/s. */
let REAL=true; try{ REAL=localStorage.getItem('ydReal')!=='0'; }catch(e){}
const PERF={};
function perfOf(key){
  if(PERF[key]!==undefined) return PERF[key];
  const c=CARS[key]&&CARS[key].perf; if(!c) return PERF[key]=null;
  const top=c.top/2.237, RR=.18;
  const mk=pm=>({pm,a0:c.a0,top,rr:RR,cd:Math.max(0,(pm/(top*1.04)-RR))/((top*1.04)*(top*1.04))});
  const t60=P=>{ let v=0,t=0; while(v<26.82&&t<60){ v+=(Math.min(P.a0,P.pm/Math.max(v,.5))-P.rr-P.cd*v*v)*.01; t+=.01; } return t; };
  let lo=20, hi=400; for(let i=0;i<30;i++){ const m=(lo+hi)/2; if(t60(mk(m))>c.t60) lo=m; else hi=m; }
  return PERF[key]=mk((lo+hi)/2);
}
// tyre grip from the weather where the car is (js/enh/atmos.js): 1 dry ... about .35 on ice. Only in realistic driving, cars only.
function grip(){ const g=wxGrip(); return window.FEEL&&REAL&&mode==='car'&&!boat?g*FEEL.mu:g; }   // weather x the surface under the tyres (js/enh/feel.js)
function wxGrip(){
  if(!REAL||mode!=='car'||boat) return 1;
  const W=window.YD&&YD.AT&&YD.AT.wx; if(!W||!W.type) return 1;
  const c=W.code, i=Math.max(0,Math.min(1,W.int||0));
  if(c===56||c===57||c===66||c===67) return .35;                   // freezing rain / drizzle: ice
  return W.type==='snow' ? .55-.15*i : .9-.2*i;                    // snow .40-.55, rain .70-.90
}
const rad=d=>d*Math.PI/180;
const CAM_IN=Math.log2(1.6);   // ~0.68 zoom levels: the old car size, as camera distance
const mpp=(lat,z)=>78271.517*Math.cos(rad(lat))/Math.pow(2,z);
let roadFails=0, miss=0;
const hitRoad=(x,y,r)=>{ try{ if(!roadIds.length) return null; return map.queryRenderedFeatures([[x-r,y-r],[x+r,y+r]],{layers:roadIds}); }catch(e){ roadFails++; return null; } };
/* Off-road check that doesn't depend on what's drawn on screen. The screen query above misses real roads now and then
   (tiles being swapped while the camera zooms out with speed, the road drawn a frame behind the car at high speed), and
   "Off road" caps the speed at 76 mph and adds grass drag. So before calling it off-road we measure the distance from
   the car to the actual road centre lines in the loaded map data, allowing each road's half width plus a margin.
   Returns true (on a road), false (clearly away from every road), or null (no road data loaded here: don't punish). */
const ROAD_HALF={motorway:9,trunk:8,primary:7.5,secondary:7,tertiary:6.5,minor:5.5,service:4.5,track:3.5,path:2.5,raceway:6,busway:5};
const ROAD_SKIP=/^(rail|transit|ferry|aerialway|cable_car|pier)$/;
const roadGeo={segs:null,lat:0,lng:0,t:0,src:null};
rebuildRoadGeo.n=0;
function rebuildRoadGeo(){
  roadGeo.lat=S.lat; roadGeo.lng=S.lng; roadGeo.t=performance.now(); roadGeo.segs=null;
  if(!roadGeo.src){ const l=roadIds.length&&map.getLayer(roadIds[0]); roadGeo.src=l?l.source:null; }
  if(!roadGeo.src) return;
  let fs; try{ fs=map.querySourceFeatures(roadGeo.src,{sourceLayer:'transportation'}); }catch(e){ return; }
  const kx=111320*Math.cos(rad(S.lat)), R=700, segs=[];
  for(const f of fs){ const pr=f.properties||{}, cl=String(pr.class||''); if(ROAD_SKIP.test(cl)) continue;
    const g=f.geometry; if(!g) continue;
    const lines=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:null;
    if(!lines) continue;
    const half=ROAD_HALF[cl]||5;
    for(const L of lines){ let along=0; const lid=++rebuildRoadGeo.n;      // along: metres from the line's own start (stable: lines are cut at tile edges)
      for(let i=1;i<L.length;i++){
      const x1=(L[i-1][0]-S.lng)*kx, y1=(L[i-1][1]-S.lat)*111320, x2=(L[i][0]-S.lng)*kx, y2=(L[i][1]-S.lat)*111320, len=Math.hypot(x2-x1,y2-y1);
      if(Math.max(x1,x2)<-R||Math.min(x1,x2)>R||Math.max(y1,y2)<-R||Math.min(y1,y2)>R){ along+=len; continue; }
      segs.push([x1,y1,x2,y2,half,pr.name||'',cl,along,lid,pr.brunnel||'']); along+=len; } } }
  roadGeo.segs=segs;
  // street names live in the map's separate 'transportation_name' layer, not on the road lines above (so roadName was
  // always empty): keep its named lines too, for the panel's "· NE · Main St" (streetHere) and the cockpit
  const names=[], Rn=650;   /* far enough for the next cross street (nextCross) */ let nf=[]; try{ nf=map.querySourceFeatures(roadGeo.src,{sourceLayer:'transportation_name'}); }catch(e){}
  for(const f of nf){ const pr=f.properties||{}, nm=pr['name:en']||pr.name||(pr.ref?String(pr.ref).replace(/;.*/,''):''); if(!nm) continue;
    const g=f.geometry, lines=g&&(g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:null); if(!lines) continue;
    for(const L of lines) for(let i=1;i<L.length;i++){ const x1=(L[i-1][0]-S.lng)*kx, y1=(L[i-1][1]-S.lat)*111320, x2=(L[i][0]-S.lng)*kx, y2=(L[i][1]-S.lat)*111320;
      if(Math.max(x1,x2)<-Rn||Math.min(x1,x2)>Rn||Math.max(y1,y2)<-Rn||Math.min(y1,y2)>Rn) continue; names.push([x1,y1,x2,y2,nm]); } }
  roadGeo.names=names;
}
// the next street crossing the one you're on (owner 2026-11-23: "identifying the upcoming crossroads from further away"):
// look straight ahead up to ~450 m for a named line crossing (or meeting) your path that isn't your own street
function nextCross(cur){ const N=roadGeo.names; if(!N||!N.length) return null;
  const kx=111320*Math.cos(rad(roadGeo.lat)), x=(S.lng-roadGeo.lng)*kx, y=(S.lat-roadGeo.lat)*111320, h=rad(S.hdg), hx=Math.sin(h), hy=Math.cos(h), LA=450;
  let best=null, bd=1e9;
  for(const s of N){ if(!s[4]||s[4]===cur) continue;
    const dx=s[2]-s[0], dy=s[3]-s[1], L=Math.hypot(dx,dy); if(L<.5) continue;
    const den=hx*dy-hy*dx; if(Math.abs(den)/L<.35) continue;                       // running alongside, not across
    const t=((s[0]-x)*dy-(s[1]-y)*dx)/den, u=((s[0]-x)*hy-(s[1]-y)*hx)/den, slack=6/L; // t: metres ahead; u: along the cross street
    if(t<8||t>LA||u<-slack||u>1+slack) continue;
    if(t<bd){ bd=t; best={name:s[4],d:t}; } }
  return best; }
// the street under the car: the nearest named line within 14 m, preferring one that runs the way you're heading
function streetHere(){ const N=roadGeo.names; if(!N||!N.length) return '';
  const kx=111320*Math.cos(rad(roadGeo.lat)), x=(S.lng-roadGeo.lng)*kx, y=(S.lat-roadGeo.lat)*111320, h=rad(S.hdg), hx=Math.sin(h), hy=Math.cos(h);
  let best='', bs=1e9;
  for(const s of N){ const dx=s[2]-s[0], dy=s[3]-s[1], L2=dx*dx+dy*dy; if(!L2) continue; const t=Math.max(0,Math.min(1,((x-s[0])*dx+(y-s[1])*dy)/L2)), d=Math.hypot(s[0]+t*dx-x,s[1]+t*dy-y);
    if(d>14) continue; const al=Math.abs((dx*hx+dy*hy)/Math.sqrt(L2)), sc=d+(1-al)*10; if(sc<bs){ bs=sc; best=s[4]; } }
  return best; }
function nearRoadGeo(){
  if(!roadGeo.segs||meters(roadGeo.lat,roadGeo.lng,S.lat,S.lng)>300||performance.now()-roadGeo.t>(roadGeo.segs.length?15000:1500)) rebuildRoadGeo();   // each rebuild is a 15-65 ms pause: on distance, not every 4 s
  const segs=roadGeo.segs; if(!segs||!segs.length) return null;
  const kx=111320*Math.cos(rad(roadGeo.lat)), px=(S.lng-roadGeo.lng)*kx, py=(S.lat-roadGeo.lat)*111320, M=3.5;   // margin: lane offset, car width, map mismatch
  let any=false, best=null, bd=1e9;
  for(const sg of segs){ const [x1,y1,x2,y2,half]=sg;
    const dx=x2-x1, dy=y2-y1, L2=dx*dx+dy*dy, t=L2?Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/L2)):0;
    const ex=x1+t*dx-px, ey=y1+t*dy-py, d=Math.hypot(ex,ey);
    if(d<half+M&&d-half<bd){ bd=d-half; best=sg; }
    if(d<300) any=true; }
  roadGeo.hit=best?{name:best[5],cls:best[6]}:null;               // nearest road under the car (name/class for the cockpit, speed limits)
  if(best) return true;
  return any?false:null;                                          // nothing loaded within 300 m: data missing, not off-road
}
/* Keep things off the street (owner 2026-11-21: "make sure that objects like trees and signs are not on the street").
   ROAD_DRAWN = half the width each road kind is drawn at (js/enh/roads.js ROAD_W) plus its curb/shoulder edge, metres.
   roadClear(lng,lat) = metres from the nearest drawn road edge (negative: on the road); offRoad(lng,lat,gap) moves a
   point out of every road band until it is `gap` metres past the curb (a corner if two roads meet). Uses roadGeo. */
const ROAD_DRAWN={motorway:7.7,trunk:6.7,primary:6.7,secondary:5.7,tertiary:5.7,minor:4.7,service:3,track:3,path:2,raceway:6.7,busway:4.7};
const RCG={t:-1,grid:null,C:25};
function roadCells(){ if(!roadGeo.segs||meters(roadGeo.lat,roadGeo.lng,S.lat,S.lng)>350) rebuildRoadGeo();
  if(RCG.t===roadGeo.t&&RCG.grid) return RCG.grid; const C=RCG.C, G=new Map(); RCG.t=roadGeo.t; RCG.grid=G;
  for(const s of roadGeo.segs||[]){ const h=ROAD_DRAWN[s[6]]||4.7, m=h+8;
    for(let i=Math.floor((Math.min(s[0],s[2])-m)/C);i<=Math.floor((Math.max(s[0],s[2])+m)/C);i++)
      for(let j=Math.floor((Math.min(s[1],s[3])-m)/C);j<=Math.floor((Math.max(s[1],s[3])+m)/C);j++){ const k=i+','+j; let a=G.get(k); if(!a) G.set(k,a=[]); a.push(s); } }
  return G; }
function roadNear(lng,lat){ const G=roadCells(); if(!G||!roadGeo.segs) return null; const kx=111320*Math.cos(rad(roadGeo.lat)),
    x=(lng-roadGeo.lng)*kx, y=(lat-roadGeo.lat)*111320; let best=null, bc=1e9;
  for(const s of G.get(Math.floor(x/RCG.C)+','+Math.floor(y/RCG.C))||[]){ if(s[6]==='path') continue;   // sidewalks / footpaths are where posts belong: keep clear of drivable roads only
    const dx=s[2]-s[0], dy=s[3]-s[1], L2=dx*dx+dy*dy||1,
      t=Math.max(0,Math.min(1,((x-s[0])*dx+(y-s[1])*dy)/L2)), px=s[0]+t*dx, py=s[1]+t*dy, d=Math.hypot(x-px,y-py), c=d-(ROAD_DRAWN[s[6]]||4.7);
    if(c<bc){ bc=c; best={c,x,y,px,py,d,kx,seg:s}; } }
  return best; }
/* "What's here?" from the map data, never from the screen (owner 2026-11-21: Medium/High "still unplayable" in chase,
   walking and gliding). With 3D terrain on, every queryRenderedFeatures call makes MapLibre read a pixel back from the
   graphics card and wait for it — the game asked several times a frame (road under the car, wall ahead, land, bridge,
   each traffic car, sign and tower), which is what made Medium ~700 ms a frame. QGEO(): use these instead (terrain on,
   or the cockpit, where the car's own spot is off screen). */
const QGEO=()=>terrainOn||!!(window.COCKPIT&&COCKPIT.on);
function geoBlocks(lng,lat){ try{ return window.COCKPIT&&COCKPIT.blocksAt?COCKPIT.blocksAt(lng,lat):[]; }catch(e){ return []; } }
function geoRoads(lng,lat,r){ const G=roadCells(); if(!G) return null; const kx=111320*Math.cos(rad(roadGeo.lat)), x=(lng-roadGeo.lng)*kx, y=(lat-roadGeo.lat)*111320, out=[];
  for(const s of G.get(Math.floor(x/RCG.C)+','+Math.floor(y/RCG.C))||[]){ const dx=s[2]-s[0], dy=s[3]-s[1], L2=dx*dx+dy*dy||1, t=Math.max(0,Math.min(1,((x-s[0])*dx+(y-s[1])*dy)/L2));
    if(Math.hypot(s[0]+t*dx-x,s[1]+t*dy-y)<(ROAD_DRAWN[s[6]]||4.7)+(r||0)) out.push({properties:{class:s[6],name:s[5],brunnel:s[9]}}); }
  return out; }
function geoLand(lng,lat){ const L=landCache.land||[]; let best=null;
  for(const o of L){ if(lng<o.bb[0]||lng>o.bb[2]||lat<o.bb[1]||lat>o.bb[3]||!inPoly(lng,lat,o.pl)) continue; if(!best||o.rank<best.rank) best=o; }
  return best; }
function roadClear(lng,lat){ const r=roadNear(lng,lat); return r?r.c:99; }
function offRoad(lng,lat,gap){ for(let it=0;it<5;it++){ const r=roadNear(lng,lat); if(!r||r.c>=gap) return [lng,lat];
    let nx=r.x-r.px, ny=r.y-r.py; if(r.d<.01){ nx=1; ny=0; } const n=Math.hypot(nx,ny), push=gap-r.c+.05;
    lng+=nx/n*push/r.kx; lat+=ny/n*push/111320; }
  return [lng,lat]; }
const hit=(x,y,r,ids)=>{ try{ return ids.length?map.queryRenderedFeatures([[x-r,y-r],[x+r,y+r]],{layers:ids}):[]; }catch(e){ return []; } };
const roadEl=document.getElementById('road'), mphEl=document.getElementById('mph');
const mapEl=document.getElementById('map');


/* ---------- DRIVING SIDE (owner 2026-11-21: "adhere to the side of the road driving per country, but lets add a setting
   to specify preferred driving side"): Auto follows the country you're in (from the town lookup below); ⚙️ Driving side
   can pin it to Right or Left. +1 = keep right, -1 = keep left; traffic and the autopilot use it ---------- */
const LEFT_CC=new Set(('gb ie im je gg mt cy jp au nz za in pk bd lk np bt th my sg id bn tl hk mo ke ug tz zm zw mw mz bw na sz ls mu sc '+
  'jm tt bb bs gy sr ag dm gd kn lc vc ky vg vi bm tc ai ms fk sh pn fj pg sb to ws ki tv nr ck nu nf mv').split(' '));
let COUNTRY='';
function driveSide(){ let p='auto'; try{ p=localStorage.getItem('ydSide')||'auto'; }catch(e){}
  if(p==='right') return 1; if(p==='left') return -1; return LEFT_CC.has(COUNTRY)?-1:1; }
/* ---------- TOWN / COUNTY ---------- */
let gLat=null,gLng=null,gBusy=false,gTime=0;
function meters(a,b,c,d){ const dy=(c-a)*111320, dx=(d-b)*111320*Math.cos(rad(a)); return Math.hypot(dx,dy); }
function updatePlace(){
  const now=Date.now();
  if(gBusy || now-gTime<4000) return;
  if(gLat!==null && meters(gLat,gLng,S.lat,S.lng)<250) return;
  gBusy=true; gTime=now; const qLat=S.lat,qLng=S.lng;
  const ctl=new AbortController(); const to=setTimeout(()=>ctl.abort(),6000);
  fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&accept-language=en&lat='+qLat+'&lon='+qLng,{signal:ctl.signal})
    .then(r=>r.json()).then(j=>{
      const a=j.address||{}; if(a.country_code) COUNTRY=String(a.country_code).toLowerCase();
      const town=a.city||a.town||a.village||a.hamlet||a.municipality||a.suburb||'Unincorporated';
      const county=a.county||a.state_district||'';
      const st=a.state||'';
      document.getElementById('place').textContent=town+(county?', '+county:'')+(st?', '+st:'');
      gLat=qLat; gLng=qLng;
    }).catch(()=>{}).finally(()=>{ clearTimeout(to); gBusy=false; });
}


/* ---------- COMPASS (replaced the minimap: heading-up, with a marker toward the route destination) ---------- */
let mini=null;                                                    // no minimap any more; kept so older checks stay harmless
function initMini(){}
const compassEl=document.getElementById('compass'), cHdgEl=document.getElementById('cHdg'), cDestEl=document.getElementById('cDest');
const CARD=['N','NE','E','SE','S','SW','W','NW'];
function updateCompass(){
  const h=((S.hdg%360)+360)%360, hs=h.toFixed(1);
  if(hs!==updateCompass.h){ updateCompass.h=hs; compassEl.style.setProperty('--h',hs);
    const t=CARD[Math.round(h/45)%8]+'<small>'+Math.round(h)%360+'\u00b0</small>'; if(t!==updateCompass.t){ updateCompass.t=t; cHdgEl.innerHTML=t; } }
  const d=window.YD&&YD.NAV&&YD.NAV.dest;
  if(d){ const dy=(d[1]-S.lat)*111320, dx=(d[0]-S.lng)*111320*Math.cos(rad(S.lat)); compassEl.style.setProperty('--b',(Math.atan2(dx,dy)*180/Math.PI).toFixed(1)); }
  if(!!d!==updateCompass.d){ updateCompass.d=!!d; cDestEl.classList.toggle('on',!!d); }
}

/* ---------- TREES + POI PINS (built from the map's own data around the car) ---------- */
let decorTimer=null, decorAt=null, decorN=0, decorT=0, pois=[];
let treePts=[];                                                   // trunk positions [x,y,x,y,...] in local metres (lng*MLNG, lat*MLAT), for js/enh/feel.js
const MLAT=111320, MLNG=111320*Math.cos(41.64*Math.PI/180);
const TREEC=['#2f6b2f','#3d7a35','#4a8a3c','#2c5e34','#5b8f3a','#35703a'];
const POIC={fuel:'#dc2626',restaurant:'#f97316',fast_food:'#f97316',cafe:'#f97316',bar:'#f97316',beer:'#f97316',ice_cream:'#f97316',
  shop:'#a855f7',grocery:'#a855f7',clothing_store:'#a855f7',school:'#2563eb',college:'#2563eb',place_of_worship:'#f5f5f4',
  hospital:'#ef4444',doctors:'#ef4444',bank:'#16a34a',lodging:'#0ea5e9',town_hall:'#eab308',library:'#eab308',post:'#eab308',
  police:'#1d4ed8',fire_station:'#b91c1c',car:'#64748b',park:'#22c55e'};
function hash(a,b){ let h=(a*374761393+b*668265263)|0; h=Math.imul(h^(h>>>13),1274126177); return ((h^(h>>>16))>>>0)/4294967296; }
function ngon(lng,lat,r,n,rot){ const k=Math.cos(lat*Math.PI/180)*111320, ring=[];
  for(let i=0;i<=n;i++){ const t=rot+(i%n)/n*2*Math.PI; ring.push([lng+Math.cos(t)*r/k,lat+Math.sin(t)*r/111320]); } return [ring]; }
/* ---------- trees (owner 2026-11-21: "enhance the tree models for realism (round trunks, branches and leaves… maybe some
   different variety) as best we can within performance constraints"). Still map extrusions (cheap, and buildings in front
   hide them properly), but built from pieces: a round 8-sided tapering trunk, a few limbs reaching into the crown, and a
   crown of stacked rounded tiers with two side clumps so the outline isn't a drum. Leaf texture (map patterns lf-*) with
   darker tiers underneath and lighter on top. Four kinds: maple (round), oak (wide, low), spruce (stepped cone), birch
   (white bark, narrow). Leaves follow the real season: green, autumn colours in October–November, bare twigs Dec–March
   (the conifers stay green). Full detail only near the car (TREE_NEAR m); farther away a trunk and two crown tiers. */
const TREE_NEAR=()=>Q3(55,95,140);
const LEAF={summer:['#2c5424','#386529','#467631','#58883b'], fall:['#6e3f19','#9a4e1b','#b97c1e','#8b6b2b'], bare:['#857e74','#8f887d','#9a9286','#a39b8f'],
  pine:['#1c3b25','#23472c','#2c5434','#356040'], birchS:['#5d8a35','#6c9a40','#7aa84a','#88b455'], birchF:['#a88a22','#bf9e2a','#cfae35','#d9bd45']};
function treeSeason(){ const d=new Date(), m=d.getMonth(); return m===9||m===10&&d.getDate()<=10?'fall':m>=10||m<=2?'bare':'summer'; }   // fall colours Oct 1 – Nov 10, bare Nov 11 – Mar 31
function leafPat(tone){ return 'lf-'+tone.slice(1); }
function addLeafImages(){ const all=new Set(); for(const k in LEAF) for(const c of LEAF[k]) all.add(c);
  for(const c of all){ const id=leafPat(c); if(map.hasImage(id)) continue; const cv=document.createElement('canvas'); cv.width=cv.height=64; const x=cv.getContext('2d'), base=new THREE.Color(c);
    x.fillStyle=c; x.fillRect(0,0,64,64); const bare=LEAF.bare.includes(c);
    let r=1; const rnd=()=>{ r=Math.imul(r^(r>>>15),2246822507)+0x6d2b79f5|0; return ((r>>>0)%10000)/10000; };
    if(bare){ for(let i=0;i<90;i++){ const x0=rnd()*64, y0=rnd()*64, a=rnd()*6.3, l=4+rnd()*10;   // twigs over sky-grey gaps
        x.strokeStyle=rnd()<.6?'rgba(52,42,34,.8)':'rgba(200,205,210,.45)'; x.lineWidth=.6+rnd()*1.1; x.beginPath(); x.moveTo(x0,y0); x.lineTo(x0+Math.cos(a)*l,y0+Math.sin(a)*l); x.stroke(); } }
    else for(let i=0;i<150;i++){ const k=.62+rnd()*.75, col=base.clone().multiplyScalar(k);   // overlapping leaves, lighter and darker
      x.fillStyle='#'+col.getHexString(); x.beginPath(); x.ellipse(rnd()*64,rnd()*64,1.6+rnd()*2.6,1+rnd()*1.6,rnd()*3.14,0,7); x.fill(); }
    try{ map.addImage(id,x.getImageData(0,0,64,64)); }catch(e){} } }
// all the pieces of one tree at lng/lat (seed 0..1 picks kind and shape; size ~1), pushed onto out as map features
function treeFeats(lng,lat,seed,size,near,out,kindIn){
  const kx=Math.cos(lat*Math.PI/180)*111320, P=(dx,dy)=>[lng+dx/kx,lat+dy/111320], H2=(a)=>hash(Math.floor(seed*1e6)+a*7919,a*31+3);
  const season=treeSeason(), kind=kindIn||(seed<.48?'maple':seed<.66?'oak':seed<.88?'spruce':'birch');
  const poly=(cx,cy,r,n,rot)=>{ const ring=[]; for(let i=0;i<=n;i++){ const t=rot+(i%n)/n*2*Math.PI; ring.push(P(cx+Math.cos(t)*r,cy+Math.sin(t)*r)); } return [ring]; };
  const F=(k,b,h,geo,c,p)=>out.push({type:'Feature',properties:p?{k,b,h,c,p}:{k,b,h,c},geometry:{type:'Polygon',coordinates:geo}});
  const pal=kind==='spruce'?LEAF.pine:kind==='birch'?(season==='summer'?LEAF.birchS:season==='fall'?LEAF.birchF:LEAF.bare):LEAF[season];
  const bark=kind==='birch'?'#d8d3c6':kind==='spruce'?'#4a3626':kind==='oak'?'#4d3f33':'#5b4636';
  const sz=size*(.85+H2(1)*.35);
  const Ht=kind==='spruce'?(9+H2(2)*7)*sz:kind==='oak'?(9+H2(2)*5)*sz:kind==='birch'?(9+H2(2)*5)*sz:(8+H2(2)*6)*sz;   // overall height (m)
  const R=kind==='spruce'?Ht*.21:kind==='oak'?Ht*.42:kind==='birch'?Ht*.2:Ht*.3;           // crown radius
  const cb=kind==='spruce'?Ht*.12:kind==='oak'?Ht*.3:Ht*.36;                                 // crown base
  const tr=kind==='birch'?.13*sz:kind==='oak'?.3*sz:.2*sz;                                    // trunk radius
  const rot=H2(3)*6.28, bareT=pal===LEAF.bare;
  // trunk: round, two segments tapering; into the crown far enough that it never floats
  if(near){ F('trunk',0,cb*.55+.2,poly(0,0,tr,8,rot),bark); F('trunk',cb*.55,Math.min(Ht*.85,cb+(bareT?Ht*.45:Ht*.18)),poly(0,0,tr*.72,8,rot),bark); }
  else F('trunk',0,cb+Ht*.1,poly(0,0,tr*.85,6,rot),bark);
  if(kind==='spruce'){ const T=near?6:3;
    for(let i=0;i<T;i++){ const f=i/T, b=cb+(Ht-cb)*f, h=cb+(Ht-cb)*(i+1)/T+.01, r=R*Math.pow(1-f,.95)*(1-.12*(i%2));
      F('crown',b,h,poly((H2(10+i)-.5)*.2,(H2(20+i)-.5)*.2,Math.max(.35,r),near?9:7,rot+i),pal[Math.min(3,i*4/T|0)],leafPat(pal[Math.min(3,i*4/T|0)])); }
    return; }
  // limbs: strips from the trunk reaching up under the canopy; when the leaves are down, a whole frame of them
  if(near){ const nL=bareT?4:3; for(let i=0;i<nL;i++){ const a=rot+i*2.39+H2(30+i), l=R*(bareT?.62:.5);
      const z=cb-.25-i*.22, w=Math.max(.06,tr*.4);
      const ex=Math.cos(a)*l, ey=Math.sin(a)*l, nx=-Math.sin(a)*w, ny=Math.cos(a)*w;
      F('trunk',z,z+w*1.4,[[P(nx*.6,ny*.6),P(ex+nx*.25,ey+ny*.25),P(ex-nx*.25,ey-ny*.25),P(-nx*.6,-ny*.6),P(nx*.6,ny*.6)]],bark); } }
  // crown: stacked rounded tiers (an ellipsoid), the top of the tree lighter
  const ell=(cx,cy,r,b,h,T,shift)=>{ for(let i=0;i<T;i++){ const m=((i+.5)/T)*2-1, rr=r*Math.sqrt(Math.max(.08,1-m*m))*(kind==='oak'&&i<T/2?1.08:1);
      const tone=pal[Math.max(0,Math.min(3,Math.round((i/(T-1||1))*3+shift)))];
      F('crown',b+(h-b)*i/T,b+(h-b)*(i+1)/T+.01,poly(cx+(H2(40+i)-.5)*r*.06,cy+(H2(50+i)-.5)*r*.06,Math.max(.3,rr),near?10:7,rot+i*1.3),tone,leafPat(tone)); } };
  const crTop=kind==='oak'?Ht*.92:Ht, crR=bareT?R*.85:R, crB=cb;   // bare: the same outline, as a pale mass of twigs (pattern), a little smaller
  ell(0,0,crR,crB,crTop,near?6:2,0);
  if(near&&kind!=='birch'){ for(let j=0;j<2;j++){ const a=rot+j*2.6+1, d=crR*.55, r=crR*(.5+H2(60+j)*.15), mid=cb+(crTop-cb)*(.35+.2*j);
      ell(Math.cos(a)*d,Math.sin(a)*d,r,mid-r*.8,mid+r*.75,3,-.4); } }
}
function buildDecor(){
  if(!styleReady||!map.getSource('decor')) return;
  const CKV=!!(window.COCKPIT&&COCKPIT.on), DS=CKV?.7:1;            // cockpit view: trees closer in and denser (the far ones are behind the haze)
  const t0=performance.now(), cx=S.lng, cy=S.lat, R=CKV?Q3(250,340,430):Q3(350,500,650), TMAX=Q3(300,1200,2500), feats=[], seenT=new Set();
  const wx0=cx-R/MLNG, wx1=cx+R/MLNG, wy0=cy-R/MLAT, wy1=cy+R/MLAT;
  let trees=0; const tp=[];
  // building footprints near the car (local metres, 20 m grid) so no tree is planted in or against a building
  const BG=new Map(), C=20, bx0=cx*MLNG, by0=cy*MLAT;
  try{
    for(const f of map.querySourceFeatures(bSrc,{sourceLayer:'building'})){
      for(const pl of partsOf(f.geometry)){ const ring=pl[0]; if(!ring||ring.length<4) continue;
        const r=ring.map(q=>[q[0]*MLNG-bx0,q[1]*MLAT-by0]); let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
        for(const q of r){ if(q[0]<x0)x0=q[0]; if(q[0]>x1)x1=q[0]; if(q[1]<y0)y0=q[1]; if(q[1]>y1)y1=q[1]; }
        if(x1<-R-10||x0>R+10||y1<-R-10||y0>R+10) continue;
        const b={r,bb:[x0-6,y0-6,x1+6,y1+6]};
        for(let i=Math.floor(b.bb[0]/C);i<=Math.floor(b.bb[2]/C);i++) for(let j=Math.floor(b.bb[1]/C);j<=Math.floor(b.bb[3]/C);j++){
          const k=i+','+j; let a=BG.get(k); if(!a) BG.set(k,a=[]); a.push(b); } } }
  }catch(e){ console.warn('tree clearance',e); }
  const clear=(lng,lat,cr)=>{ const x=lng*MLNG-bx0, y=lat*MLAT-by0, a=BG.get(Math.floor(x/C)+','+Math.floor(y/C)); if(!a) return true;
    const m=cr*.8+.6;                                            // crown may overhang a little, never into the wall
    for(const b of a){ if(x<b.bb[0]||x>b.bb[2]||y<b.bb[1]||y>b.bb[3]) continue; const r=b.r; let inside=false;
      for(let i=0,j=r.length-1;i<r.length;j=i++){ const [xi,yi]=r[i],[xj,yj]=r[j];
        if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi)) inside=!inside;
        const dx=xj-xi, dy=yj-yi, L=dx*dx+dy*dy, t=L?Math.max(0,Math.min(1,((x-xi)*dx+(y-yi)*dy)/L)):0;
        if(Math.hypot(x-xi-t*dx,y-yi-t*dy)<m) return false; }
      if(inside) return false; }
    return true; };
  try{
    const wood=map.querySourceFeatures(bSrc,{sourceLayer:'landcover',filter:['==',['get','class'],'wood']});
    const park=map.querySourceFeatures(bSrc,{sourceLayer:'park'});
    outer: for(const [list,step0,dens] of Q3([[wood,20,.8],[park,36,.4]],[[wood,15,.85],[park,28,.45]],[[wood,12,.9],[park,22,.5]])){ const step=step0*DS;
      for(const f of list) for(const pl of partsOf(f.geometry)){
        const bb=bboxOf(pl[0]);
        const x0=Math.max(bb[0],wx0), x1=Math.min(bb[2],wx1), y0=Math.max(bb[1],wy0), y1=Math.min(bb[3],wy1);
        if(x0>=x1||y0>=y1) continue;
        const ix0=Math.floor(x0*MLNG/step), ix1=Math.floor(x1*MLNG/step), iy0=Math.floor(y0*MLAT/step), iy1=Math.floor(y1*MLAT/step);
        for(let ix=ix0;ix<=ix1;ix++) for(let iy=iy0;iy<=iy1;iy++){
          const key=step+':'+ix+','+iy; if(seenT.has(key)) continue;
          const r1=hash(ix,iy); if(r1>dens) continue;
          const lng=(ix+hash(iy+11,ix))*step/MLNG, lat=(iy+hash(ix+7,iy+3))*step/MLAT;   // same spot every time
          if(!inPoly(lng,lat,pl)) continue;
          seenT.add(key);
          const cr=2.2+hash(ix+1,iy)*1.8; if(!clear(lng,lat,cr)) continue;
          if(roadClear(lng,lat)<Math.max(1.6,cr*.6)) continue;                // never on a street, and the crown barely over the curb
          const dn=Math.hypot((lng-cx)*MLNG,(lat-cy)*MLAT)<TREE_NEAR();
          treeFeats(lng,lat,hash(ix+3,iy+9),1,dn,feats,list===wood&&hash(ix+5,iy+2)<.3?'spruce':null);
          tp.push(lng*MLNG,lat*MLAT);
          if(++trees>=TMAX || performance.now()-t0>35) break outer;
        }
      }
    }
  }catch(e){ console.warn('trees',e); }
  const np=[];
  try{
    const seenP=new Set();
    for(const f of map.querySourceFeatures(bSrc,{sourceLayer:'poi'})){
      const g=f.geometry, pr=f.properties||{};
      if(!g||g.type!=='Point'||!pr.name) continue;
      let lng=g.coordinates[0], lat=g.coordinates[1];
      if(roadClear(lng,lat)<2.2){ const q=offRoad(lng,lat,2.2); lng=q[0]; lat=q[1]; }   // a pin on the street: stand it beside it
      if(lng<wx0-R/MLNG||lng>wx1+R/MLNG||lat<wy0-R/MLAT||lat>wy1+R/MLAT) continue;
      const key=pr.name+'|'+lng.toFixed(4)+','+lat.toFixed(4); if(seenP.has(key)) continue; seenP.add(key);
      const c=POIC[pr.class]||POIC[pr.subclass]||'#14b8a6';
      np.push({name:pr.name,cls:String(pr.subclass||pr.class||'').replace(/_/g,' '),lng,lat});
      feats.push({type:'Feature',properties:{k:'pin',h:7,b:0,c:'#e5e7eb'},geometry:{type:'Polygon',coordinates:ngon(lng,lat,.45,6,0)}});
      feats.push({type:'Feature',properties:{k:'pin',h:10.5,b:7,c},geometry:{type:'Polygon',coordinates:ngon(lng,lat,1.9,8,.2)}});
    }
  }catch(e){ console.warn('poi',e); }
  treePts=tp; pois=np; decorN=feats.length; decorT=performance.now(); decorAt=[cx,cy];
  try{ map.getSource('decor').setData({type:'FeatureCollection',features:feats}); }catch(e){}
}
const LAND={wood:'Forest',grass:'Grassland',farmland:'Farmland',wetland:'Wetland',sand:'Sand',ice:'Ice',rock:'Rock',
  residential:'Residential',commercial:'Commercial',retail:'Retail',industrial:'Industrial',school:'School grounds',
  cemetery:'Cemetery',hospital:'Hospital',pitch:'Sports field',track:'Track',farmyard:'Farmyard',railway:'Rail yard',
  quarry:'Quarry',military:'Military',university:'Campus',college:'Campus',stadium:'Stadium',zoo:'Zoo',playground:'Playground'};
const surfEl=document.getElementById('surf'), nearEl=document.getElementById('near');
function landHere(p,ll){
  S.land='';
  if(ll&&QGEO()){ const o=geoLand(ll[0],ll[1]); if(!o) return ''; if(o.rank===2){ S.land='park'; return o.name||'Park'; } const c=o.cls; if(!c) return ''; S.land=c;
    return LAND[c]||(c.charAt(0).toUpperCase()+c.slice(1).replace(/_/g,' ')); }
  if(!landIds.length) return '';
  const fs=hit(p.x,p.y,1,landIds);
  const pick=id=>fs.find(f=>f.layer&&f.layer.id===id);
  const f=pick('lc-detect')||pick('lu-detect')||pick('park');
  if(!f) return '';
  if(f.layer.id==='park'){ S.land='park'; return (f.properties&&f.properties.name)||'Park'; }
  const c=f.properties&&f.properties.class; if(!c) return ''; S.land=c;
  return LAND[c]||(c.charAt(0).toUpperCase()+c.slice(1).replace(/_/g,' '));
}
function nearestPoi(){
  let best=null, bd=200;
  for(const q of pois){ const d=meters(S.lat,S.lng,q.lat,q.lng); if(d<bd){ bd=d; best=q; } }
  if(!best) for(const q of towers){ const d=meters(S.lat,S.lng,q.lat,q.lng); if(d<600&&d<(bd===200?1e9:bd)){ bd=d; best=q; } }
  return best?('Near: '+best.name+(best.cls?' ('+best.cls+')':'')+' · '+Math.round(bd)+' m'):'';
}
/* ---------- LAND CACHE: farmland + water polygons near the car ---------- */
let candMode=null, candT=0;
const landCache={farm:[],water:[],at:null};
function rebuildLandCache(){
  try{
    const cx=S.lng, cy=S.lat, R=1500, w=[cx-R/MLNG,cy-R/MLAT,cx+R/MLNG,cy+R/MLAT];
    const pick=feats=>{ const out=[]; for(const f of feats) for(const pl of partsOf(f.geometry)){ const bb=bboxOf(pl[0]);
      if(bb[2]<w[0]||bb[0]>w[2]||bb[3]<w[1]||bb[1]>w[3]) continue; out.push({bb,pl}); } return out; };
    const farm=pick(map.querySourceFeatures(bSrc,{sourceLayer:'landcover',filter:['==',['get','class'],'farmland']}));
    const water=pick(map.querySourceFeatures(bSrc,{sourceLayer:'water'}));
    // land under the car for the HUD, from the data (geoLand): land cover first, then land use, then parks — the same order the screen check used
    // (only when it's used — terrain on or the cockpit — and at most every 10 s / 300 m: it was a 60 ms pause every 3 s)
    if(QGEO()&&(!landCache.landAt||meters(landCache.landAt[1],landCache.landAt[0],cy,cx)>300||performance.now()-landCache.landT>10000)){
    landCache.landAt=[cx,cy]; landCache.landT=performance.now();
    const land=[], R2=450, w2=[cx-R2/MLNG,cy-R2/MLAT,cx+R2/MLNG,cy+R2/MLAT];
    for(const [sl,rank] of [['landcover',0],['landuse',1],['park',2]]) for(const f of map.querySourceFeatures(bSrc,{sourceLayer:sl})){ const pr=f.properties||{};
      for(const pl of partsOf(f.geometry)){ const bb=bboxOf(pl[0]); if(bb[2]<w2[0]||bb[0]>w2[2]||bb[3]<w2[1]||bb[1]>w2[3]) continue; land.push({bb,pl,rank,cls:pr.class,name:pr.name}); } }
    if(land.length||!landCache.land) landCache.land=land; }
    // keep the old lists if tiles are mid-reload and returned nothing
    if(farm.length||!landCache.at) landCache.farm=farm;
    if(water.length||!landCache.at) landCache.water=water;
    landCache.at=[cx,cy];
  }catch(e){ console.warn('land cache',e); }
}
function inAny(list,lng,lat){ for(const q of list){ const b=q.bb; if(lng<b[0]||lng>b[2]||lat<b[1]||lat>b[3]) continue; if(inPoly(lng,lat,q.pl)) return true; } return false; }

/* ---------- WATER TOWERS (OpenStreetMap man_made=water_tower via Overpass, keyless) ---------- */
let towers=[], towerAt=null, towerBusy=false, miniReady=false, towerRetry=0;
const towerSeen=new Set();
// OpenStreetMap's Overpass servers (water towers, stop signs, lights, speed limits, town limits). On 2026-11-21 the main
// one and kumi failed or timed out from the owner's connection while mail.ru answered (slowly), so: four mirrors, 40 s each,
// starting with the one that answered last time (remembered).
const OVERPASS=['https://overpass-api.de/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
async function ovFetch(q){ let first=0; try{ first=Math.max(0,OVERPASS.indexOf(localStorage.getItem('ydOvp'))); }catch(e){}
  for(let n=0;n<OVERPASS.length;n++){ const url=OVERPASS[(first+n)%OVERPASS.length], c=new AbortController(), to=setTimeout(()=>c.abort(),40000);
    try{ const r=await fetch(url,{method:'POST',body:'data='+encodeURIComponent(q),headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:c.signal});
      if(r.ok){ const j=await r.json(); try{ localStorage.setItem('ydOvp',url); }catch(e){} return j; } }catch(e){} finally{ clearTimeout(to); } }
  throw new Error('no Overpass server answered'); }
function loadTowers(){
  if(towerBusy) return; towerBusy=true;
  const cx=S.lng, cy=S.lat, dy=.3, dx=.4;                          // ~33 km x 33 km around the car
  const bb=`(${(cy-dy).toFixed(4)},${(cx-dx).toFixed(4)},${(cy+dy).toFixed(4)},${(cx+dx).toFixed(4)})`;
  const q=`[out:json][timeout:25];(node["man_made"="water_tower"]${bb};way["man_made"="water_tower"]${bb};relation["man_made"="water_tower"]${bb};);out center tags;`;
  // the last answer for this area is kept, so the towers still show when the servers are down
  const ck='ydTw:'+cy.toFixed(1)+','+cx.toFixed(1);
  ovFetch(q).then(j=>{ try{ localStorage.setItem(ck,JSON.stringify({elements:(j.elements||[]).map(e=>({type:e.type,id:e.id,lat:e.lat,lon:e.lon,center:e.center,tags:e.tags}))})); }catch(e){} return j; })
    .catch(e=>{ let c=null; try{ c=JSON.parse(localStorage.getItem(ck)||'null'); }catch(_){} if(c){ towerRetry=Date.now()+120000; return c; } throw e; })
    .then(j=>{
      for(const el of j.elements||[]){
        const lat=el.lat??(el.center&&el.center.lat), lng=el.lon??(el.center&&el.center.lon);
        if(lat==null||lng==null) continue;
        const k=el.type+el.id; if(towerSeen.has(k)) continue; towerSeen.add(k);
        const t=el.tags||{};
        // the same tower is often mapped twice (a point and an outline, or two points): keep one model per spot
        const dup=towers.find(q=>meters(q.lat,q.lng,lat,lng)<45);
        if(dup){ if(!dup.raw&&t.name){ dup.raw=t.name; dup.name=t.name; } if(!dup.op&&t.operator) dup.op=t.operator; continue; }
        towers.push({lng,lat,name:t.name||t['name:en']||(t.operator?t.operator+' water tower':'Water tower'),cls:'water tower',id:k,op:t.operator||'',raw:t.name||'',city:t['addr:city']||''});
      }
      towerAt=[cx,cy]; drawTowers();
    })
    .catch(e=>{ console.warn('towers',e); towerAt=[cx,cy]; towerRetry=Date.now()+120000; })   // try again in 2 minutes, not only after driving 15 km
    .finally(()=>{ towerBusy=false; });
}
function towerFC(pointsOnly){
  const feats=[];
  for(const t of towers){
    feats.push({type:'Feature',properties:{k:'lbl',name:t.name},geometry:{type:'Point',coordinates:[t.lng,t.lat]}});
    if(pointsOnly) continue;
    if(window.TOWER_SHAPE){ let f=null; try{ f=window.TOWER_SHAPE(t); }catch(e){ console.warn('tower shape',e); } if(f){ for(const x of f) feats.push(x); continue; } }   // js/enh/towers.js
    feats.push({type:'Feature',properties:{k:'tw',h:34,b:0,c:'#cfd8e3'},geometry:{type:'Polygon',coordinates:ngon(t.lng,t.lat,2.2,10,0)}});   // stem
    const C=42, R=8;                                                  // spherical tank from stacked rings
    for(let z=C-R+.6;z<C+R;z+=1.6){ const zm=z+.8, r=Math.sqrt(Math.max(0,R*R-(zm-C)*(zm-C)));
      if(r<.6) continue;
      feats.push({type:'Feature',properties:{k:'tw',h:z+1.6,b:z,c:'#e6eef6'},geometry:{type:'Polygon',coordinates:ngon(t.lng,t.lat,r,16,0)}}); }
    feats.push({type:'Feature',properties:{k:'tw',h:C+R+2.5,b:C+R-.4,c:'#9fb3c8'},geometry:{type:'Polygon',coordinates:ngon(t.lng,t.lat,.5,6,0)}});   // finial
  }
  return {type:'FeatureCollection',features:feats};
}
function drawTowers(){
  try{ const src=map.getSource('towers'); if(src) src.setData(towerFC(false)); }catch(e){}
  try{ if(miniReady) mini.getSource('towers').setData(towerFC(true)); }catch(e){}
}

function setMode(m){
  if(m===mode) return;
  const was=mode; mode=m; boat=(m==='boat');
  const vis=m==='walk'?((window.WALK&&WALK.parked())||'car'):m;   // on foot (js/enh/walk.js): show the parked vehicle
  glideBtn.classList.toggle('on',m==='glider');
  body.visible=(vis==='car'); boatG.visible=(vis==='boat'); tractorG.visible=(vis==='tractor'); shadow.visible=(vis!=='boat'&&m!=='glider');
  car.visible=(m!=='glider'); gliderG.visible=(m==='glider'); surfEl.style.color=''; step.surf=null;
  if(m!=='boat') boatG.position.y=boatG.rotation.x=boatG.rotation.z=0;
  if(m==='glider'||m==='walk'||was==='walk'){ /* no ground puff in the air or when getting in/out */ }
  else if(m==='boat'||was==='boat'){ spawn(0,22,-1,0xcfe9ff); shake=Math.max(shake,.5); }
  else { spawn(0,16,-1,0xa0825a); shake=Math.max(shake,.3); }            // puff of field dirt
  roadEl.textContent=m==='boat'?'Boating':m==='walk'?'On foot':'Driving'; roadEl.className='';
  try{ if(window.onModeChange) window.onModeChange(m,was); }catch(e){ console.warn('mode change',e); }
}
function setBoat(v){ setMode(v?'boat':'car'); }

/* ---------- HANG GLIDING ----------
   Weight-shift flying: steering banks the wing (sluggish, slower at speed) and the bank makes you turn;
   gas up = pull the bar in (nose down, faster, more sink), gas down = push out (slower, less sink, stalls
   below ~8 m/s). You always sink a little; thermals under the white clouds lift you. Launch and landing
   are straight up and straight down from where you are. */
const G={alt:0,air:11,bank:0,vs:0,lift:0,phase:'',t:0};
const GP=74, GSPEED=2.2, GVERT=1.6, GTOP=300, GMAX=1100;
function polarSink(v){ return .95+.02*(v-10)*(v-10); }
function thermalAt(i,j){ const C=600; if(hash(i*3+1,j*7+2)>.5) return null;
  return {x:(i+.2+.6*hash(i,j+5))*C, y:(j+.2+.6*hash(i+9,j))*C, r:90+120*hash(i+2,j+2), s:1.6+2.6*hash(i+4,j+1)}; }
function thermalLift(lng,lat){
  const x=lng*MLNG, y=lat*MLAT, ix=Math.floor(x/600), iy=Math.floor(y/600); let L=0;
  for(let di=-1;di<=1;di++) for(let dj=-1;dj<=1;dj++){ const t=thermalAt(ix+di,iy+dj); if(!t) continue;
    const d=Math.hypot(x-t.x,y-t.y); if(d<t.r) L+=t.s*(1-(d/t.r)**2); else if(d<1.7*t.r) L-=.12*t.s; }
  return L;
}
let cloudAt=null;
function buildClouds(force){
  const src=map.getSource&&map.getSource('clouds'); if(!src) return;
  if(!force&&cloudAt&&meters(cloudAt[1],cloudAt[0],S.lat,S.lng)<800) return;
  const x=S.lng*MLNG, y=S.lat*MLAT, ix=Math.floor(x/600), iy=Math.floor(y/600), feats=[], cols=[];
  for(let i=ix-6;i<=ix+6;i++) for(let j=iy-6;j<=iy+6;j++){ const t=thermalAt(i,j); if(!t) continue;
    // a faint column of rising air from the ground to the cloud base, over the thermal's core (where the lift is
    // at least ~half its peak); stronger thermals look a little warmer and brighter
    const k=Math.min(1,(t.s-1.6)/2.6);
    cols.push({type:'Feature',properties:{h:1140,b:15,c:k>.66?'#fff2c2':k>.33?'#f6f1dc':'#e7edf2'},
      geometry:{type:'Polygon',coordinates:ngon(t.x/MLNG,t.y/MLAT,t.r*.75,18,0)}});
    const n=3+Math.floor(hash(i+5,j+5)*3);
    for(let k=0;k<n;k++){ const a=hash(i+k,j-k)*6.28, o=t.r*.6*hash(j+k,i), base=1150+hash(i-k,j+k)*120;
      feats.push({type:'Feature',properties:{h:base+110+t.s*45,b:base},geometry:{type:'Polygon',
        coordinates:ngon((t.x+Math.cos(a)*o)/MLNG,(t.y+Math.sin(a)*o)/MLAT,t.r*(.5+.45*hash(k+3,i+j)),12,a)}}); } }
  try{ src.setData({type:'FeatureCollection',features:feats}); }catch(e){}
  try{ const ts=map.getSource('thermals'); if(ts) ts.setData({type:'FeatureCollection',features:cols}); }catch(e){}
  cloudAt=[S.lng,S.lat];
}
function clearClouds(){ try{ map.getSource('clouds').setData({type:'FeatureCollection',features:[]}); }catch(e){}
  try{ map.getSource('thermals').setData({type:'FeatureCollection',features:[]}); }catch(e){} cloudAt=null; }
// the nearest good thermal (core within ~1.8 km): distance in metres and an arrow relative to where you're heading
function nearestLift(){
  const x=S.lng*MLNG, y=S.lat*MLAT, ix=Math.floor(x/600), iy=Math.floor(y/600); let best=null;
  for(let i=ix-3;i<=ix+3;i++) for(let j=iy-3;j<=iy+3;j++){ const t=thermalAt(i,j); if(!t||t.s<2.2) continue;
    const d=Math.hypot(t.x-x,t.y-y); if(d<1800&&(!best||d<best.d)) best={d,dx:t.x-x,dy:t.y-y}; }
  if(!best) return null;
  const rel=((Math.atan2(best.dx,best.dy)*180/Math.PI-S.hdg)%360+540)%360-180;
  const arrow=['↓','↙','←','↖','↑','↗','→','↘','↓'][Math.round((rel+180)/45)];
  const ft=best.d*3.281, dist=ft<1000?Math.round(ft/50)*50+' ft':(best.d/1609.344).toFixed(1)+' mi';
  return arrow+' '+dist;
}
function toggleGlider(){
  if(mode==='glider'){ if(G.phase!=='land'){ G.phase='land'; toast('Landing: straight down'); } return; }
  Object.assign(G,{alt:0,air:11,bank:0,vs:0,lift:0,phase:'launch',t:0,from:mode});   // from: 'walk' lands you back on foot
  S.v=0; S.steer=0; setMode('glider'); dirty=true; step.W=0; buildClouds(true);
  toast('Taking off…');
}
function touchDown(){
  G.phase=''; setMode(G.from==='walk'&&window.WALK?'walk':'car'); S.v=0; S.zoom=19.3; step.detOnce=false; step.W=0; dirty=true; step.cam=null;
  clearClouds(); shake=Math.max(shake,.4); toast('Landed');
}
function glideStep(dt,st,gas,now){
  G.t+=dt;
  if(G.phase==='launch'){                                        // straight up from where you were
    const k=Math.min(1,G.t/2.8); G.alt=GTOP*(1-Math.pow(1-k,3)); G.vs=GTOP*3*Math.pow(1-k,2)/2.8; G.air=11;
    if(k>=1){ G.phase='fly'; toast('Steer to lean and turn · gas to dive faster · brake to slow · tap 🪂 to land',4500); }
  } else if(G.phase==='land'){                                   // straight down to the spot below you
    const d=Math.max(35,G.alt*1.6)*dt; G.alt=Math.max(0,G.alt-d); G.vs=-d/Math.max(dt,1e-3);
    G.bank*=Math.exp(-dt*3); G.air*=Math.exp(-dt*1.5);
    if(G.alt<=0){ touchDown(); return; }
  } else {
    const tb=st*rad(45);
    G.bank+=(tb-G.bank)*Math.min(1,dt*1.8*11/Math.max(G.air,8));
    const ts=gas>0?11+gas*9:11+gas*3.5; G.air+=(ts-G.air)*Math.min(1,dt*.8);
    let stall=false; if(G.air<8.2){ stall=true; G.air+=dt*2.5; }
    const sink=polarSink(G.air)/Math.pow(Math.cos(G.bank),1.5)+(stall?3:0);
    G.lift=thermalLift(S.lng,S.lat)*(G.alt>GMAX-60?Math.max(0,(GMAX-G.alt)/60):1);
    G.vs=(G.lift-sink)*GVERT; G.alt=Math.min(GMAX,G.alt+G.vs*dt);
    S.hdg=(S.hdg+(9.81*Math.tan(G.bank)/G.air)*dt*180/Math.PI+360)%360;
    const dm=G.air*dt*GSPEED, h=rad(S.hdg);
    S.lat+=Math.cos(h)*dm/111320; S.lng+=Math.sin(h)*dm/(111320*Math.cos(rad(S.lat)));
    if(G.alt<=0){ G.alt=0; touchDown(); return; }
  }
  // camera: at the pilot's height, just behind and above, looking ahead and down
  const dB=((S.hdg+LOOK.yaw-S.camB+540)%360)-180; S.camB+=dB*(1-Math.exp(-dt*2.5));
  const W=innerWidth,H=innerHeight,padTop=H*.34, gp=viewPitch(GP);
  if(W!==step.W||H!==step.H||gp!==step.pit){ step.W=W; step.H=H; step.pit=gp;
    renderer.setSize(W,H,false); camera.aspect=W/H; camera.setViewOffset(W,H,0,-padTop/2,W,H);
    aimCam3D(H,68); placeGlider(); }
  const camAlt=Math.max(6,G.alt+14)*Math.pow(2,-zoomOff*.5), pr=rad(gp), hb=rad(S.camB), fwd=camAlt*Math.tan(pr);
  const cLat=S.lat+Math.cos(hb)*fwd/111320, cLng=S.lng+Math.sin(hb)*fwd/(111320*Math.cos(rad(S.lat)));
  const mppNeed=(camAlt/Math.cos(pr))/(.5*H/Math.tan(rad(36.87)/2));
  const z=Math.max(10,Math.min(21,Math.log2(78271.517*Math.cos(rad(S.lat))/mppNeed)));
  map.jumpTo({center:[cLng,cLat],bearing:S.camB,zoom:z,pitch:gp,padding:{top:padTop,bottom:0,left:0,right:0}});
  // glider attitude as seen from behind: level with the horizon, banked, nose follows the bar
  const bob=Math.sin(now/900)*.02;
  gMdl.rotation.set(rad(90-gp)-(G.phase==='fly'?gas*.12:0)+(G.phase==='land'?-.2:0)+bob, rad(LOOK.yaw)-rad(dB)*.6, -G.bank);
  updateFx(dt,0,0);
  if(window.TRAFFIC) TRAFFIC.frame(dt);                             // hides the AI cars while flying
  runFrameHooks(dt);
  placePhoto(false);                                                // hides the car photo while flying
  renderer.render(scene,camera);
  // HUD + the usual background jobs
  if(every('ghud',.2)){
    const v=G.vs/GVERT;
    roadEl.textContent='Altitude '+Math.round(G.alt*3.281)+' ft'; roadEl.className='';
    surfEl.textContent='Hang glider · '+(v>=0?'▲ ':'▼ ')+Math.abs(v).toFixed(1)+' m/s'; surfEl.style.color=v>=0?'#86efac':'#fca5a5';
    const lift=G.phase==='fly'&&G.lift<=.8?nearestLift():null;   // where to head for the next climb
    nearEl.textContent=G.phase==='fly'&&G.lift>.8?'Thermal! Circle to climb'
      :G.phase==='fly'&&G.alt<60?(lift?'Getting low: lift '+lift+' or tap 🪂 to land':'Getting low: find a thermal or tap 🪂 to land')
      :lift?'Rising air '+lift:nearestPoi();
    const mph=Math.round(G.air*2.237); if(mph!==step.mph){ step.mph=mph; mphEl.textContent=mph; }
  }
  if(every('place',1)) updatePlace(); if(every('house',.25)) updateHouseFilter(false);
  if(every('compass',POWER?.12:.05)) updateCompass(); if(every('roadx',.25)) updateRoadX();
  if(every('clouds',2)) buildClouds(false);
  if(every('decor',.5) && styleReady && (!decorAt || meters(decorAt[1],decorAt[0],S.lat,S.lng)>250)) buildDecor();
}
const tick={};
// next to "On road" in the top-left panel (owner 2026-11-21): · the street you're on (when on a road) · heading N / NE / E…
const roadxEl=document.getElementById('roadx');
function updateRoadX(){ if(!roadxEl) return; const H=['N','NE','E','SE','S','SW','W','NW'][Math.round((((S.hdg%360)+360)%360)/45)%8];
  let st=''; if(mode!=='glider'&&mode!=='boat'&&(onRoad||mode==='walk')&&roadEl.className!=='off'){ if(!roadGeo.segs||meters(roadGeo.lat,roadGeo.lng,S.lat,S.lng)>300) rebuildRoadGeo(); st=streetHere(); }
  roadName=st;                                                        /* the cockpit's cluster and speed-limit signs read this too */
  const t='\u00a0· '+H+(st?' · '+st:'');   /* non-breaking: a flex item drops a plain leading space */ if(roadxEl.textContent!==t) roadxEl.textContent=t;
  if(xnextEl){ const nx=mode!=='glider'&&mode!=='boat'&&st?nextCross(st):null;           /* the next cross street ahead */
    const ft=nx?nx.d*3.281:0, tx=nx?'Next: '+nx.name+' · '+(ft<1000?Math.max(50,Math.round(ft/50)*50)+' ft':(nx.d/1609).toFixed(1)+' mi'):'';
    if(xnextEl.textContent!==tx){ xnextEl.textContent=tx; xnextEl.style.display=tx?'':'none'; } } }
const xnextEl=document.getElementById('xnext');
function every(k,sec){ const t=last/1000; if(tick[k]===undefined||t-tick[k]>=sec){ tick[k]=t; return true; } return false; }
let lastStep=0;
function loop(now){
  if(CAP30() && now-lastStep<30){ if(window.QUAL) QUAL.frame(now,false,0); requestAnimationFrame(loop); return; }   // ~30 fps (Low; Medium on touch devices)
  lastStep=now; const t0=performance.now();
  try{ step(now); }catch(e){ if(!loop.err){loop.err=1; const d=document.createElement('pre'); d.style.cssText='position:fixed;left:8px;right:8px;top:8px;z-index:9999;background:#7f1d1d;color:#fff;font:12px monospace;padding:10px;white-space:pre-wrap;border-radius:8px'; d.textContent='LOOP ERROR: '+e.message+'\n'+(e.stack||'').split('\n').slice(0,4).join('\n'); document.body.appendChild(d);} }
  if(window.QUAL) QUAL.frame(now,true,performance.now()-t0);     // frame timing for auto quality + the ?fps=1 meter (js/enh/quality.js)
  requestAnimationFrame(loop);
}
function step(now){
  const dt=Math.min((now-last)/1000,.05); last=now; frame++;
  // inputs (keyboard eases like an analog stick)
  const ease=(v,p,n)=>{ if(p)v+=dt*4; else if(n)v-=dt*4; else v*=Math.exp(-dt*8); return Math.max(-1,Math.min(1,v)); };
  kS=ease(kS,KH('steerR'),KH('steerL')); kG=ease(kG,KH('gas'),KH('brake'));
  // racing wheel + pedals on a PC (js/enh/wheel.js); the touch controls and keys still win when used
  const WH=window.WHEEL&&WHEEL.read();
  const wS=WH&&Math.abs(kS)<.05?WH.st:kS, wG=WH&&Math.abs(kG)<.05&&(WH.ok||WH.cal)?WH.gas:kG;
  let st=Math.abs(tSteer)>.05?tSteer:wS, gas=Math.abs(tGas)>.05?tGas:wG; const hand=KH('handbrake');
  // the wheel's pedals as an automatic: gas drives the way the selector says, the brake only ever brakes (js/enh/wheel.js)
  let wBrake=0; const WA=!!(WH&&WH.ok&&!WH.cal&&Math.abs(kG)<.05&&Math.abs(tGas)<.05&&mode!=='walk'&&mode!=='glider');
  if(WA){ wBrake=WH.brake||0; gas=WH.sel==='D'?WH.pedal:WH.sel==='R'?-WH.pedal:0; S.sel=WH.sel; } else S.sel=null;
  // autopilot (js/enh/autopilot.js) drives until you touch the steering, gas or handbrake
  // with the wheel motor (js/enh/ffb.js) the wheel turns itself, so only the keys / touch steering count here; holding
  // the wheel away from where autopilot is steering hands over in ffb.js
  if(window.AUTO&&AUTO.on){ const fb=!!(window.FFB&&FFB.driving), stIn=fb?Math.max(Math.abs(kS),Math.abs(tSteer)):Math.abs(st);
    if(stIn>.05||Math.abs(gas)>.05||hand||wBrake>.05) AUTO.takeover(); else { const c=AUTO.control(dt); st=c.st; gas=c.gas; wBrake=0; if(window.FFB) FFB.cmd=c.st; } }
  // engine switched off (js/enh/ignition.js): the gas does nothing; the brakes still work, the car rolls to a stop
  if(window.IGN&&!IGN.drive()&&(mode==='car'||mode==='tractor')){ if(window.AUTO&&AUTO.on) AUTO.takeover(); gas=S.v>.5?Math.min(0,gas):S.v<-.5?Math.max(0,gas):0; }
  S.gas=gas; S.stIn=st;                                            // pedal + steering input for add-ons (engine sound, cockpit wheel)
  if(mode==='glider'){ glideStep(dt,st,gas,now); return; }
  if(mode==='walk'&&window.WALK){ WALK.step(dt,st,gas,now); return; }   // on foot (js/enh/walk.js)

  // longitudinal
  let a=0, braking=false;
  const tractor=(mode==='tractor'), pw=tractor?TRACTOR:1, vmax=MAXV*pw;
  const PF=REAL&&!tractor&&!boat&&perfOf(CARKEY), mu=grip();      // realistic driving: this car's real pull, weather grip
  const vtop=PF?PF.top:!tractor&&!boat&&CARSPEC.vmax;             // a car with a set top speed reaches it at full throttle
  if(gas>0.05){
    if(PF&&S.v>=0){ const r=Math.min(S.v/PF.top,1), t1=Math.min(1,gas*1.25);   // a firm press is full power; near the top
      // speed any press of half the pedal or more counts as full, so the top speed is reachable with a normal press
      a=(t1+(Math.min(1,gas*2)-t1)*r*r)*Math.min(PF.a0*mu,PF.pm/Math.max(S.v,.5)); }
    else if(vtop&&S.v>0){ const r=Math.min(S.v/(vtop*1.012),1);  // power fades toward the top speed, and also covers
      // the drag there, so any firm press (half the pedal or more) keeps pulling to vtop; how hard you press sets how quickly
      a=gas*12*(1-r*r)+Math.min(1,gas*2)*(.35+.0032*vtop*vtop)*r*r; }
    else a=gas*(S.v<0?30*mu:12)*pw*(1-Math.min(S.v/vmax,1)**2); }
  else if(gas<-0.05){ if(S.v>.5){a=-28*(-gas)*mu;braking=true;} else a=gas*14*pw; }
  if(hand){a-=Math.sign(S.v)*30*mu; braking=Math.abs(S.v)>.5;}
  const SF=REAL&&window.FEEL&&!boat&&!tractor?FEEL.surf:null;       // realistic driving: what the tyres are on (js/enh/feel.js)
  const cap=boat?BOATMAX:tractor?vmax:(SF?(SF.cap||Math.max(MAXV,vtop||0)):(onRoad?Math.max(MAXV,vtop||0):34));
  // an electric car's regenerative braking off the pedal (Model Y: about 0.17 g at speed, fading out below ~8 mph, as the real one does);
  // none in neutral (G29 shifter in N, S.sel): the real car coasts
  const regen=CARSPEC.regen&&mode==='car'&&!boat&&S.sel!=='N'&&gas<=.05&&Math.abs(S.v)>.3?CARSPEC.regen*Math.min(1,(Math.abs(S.v)-.3)/3.5)*Math.min(1,mu+.1):0;
  if(PF) a-=Math.sign(S.v)*(PF.rr+PF.cd*S.v*S.v+(regen||(gas<=.05&&Math.abs(S.v)>.3?.7+.015*Math.abs(S.v):0)));   // rolling + air drag, engine braking (or regen) off the gas
  else a-=Math.sign(S.v)*((boat?(.25+.0022*S.v*S.v):(.35+.0032*S.v*S.v))+regen);         // rolling + aero drag
  if(SF){ if(SF.drag||SF.rr) a-=S.v*SF.drag+(Math.abs(S.v)>.3?Math.sign(S.v)*SF.rr:0); }   // each surface drags differently (grass, woods, sand, mud...)
  else if(!onRoad&&!boat&&!tractor) a-=S.v*.15;                          // mild grass drag
  if(S.inWater&&!boat){ a-=S.v*1.2; }                                    // wading through water in a car or tractor: slow going (~5 mph)
  if(REAL&&terrainOn&&!boat&&Math.abs(S.v)>.3) a-=5*Math.sin(S.sp);      // hills: slower up, faster down (Medium/High graphics, where the ground has height)
  if(wBrake>.03){ const dec=28*Math.min(1,wBrake*1.15)*mu; braking=Math.abs(S.v)>.5;   // the wheel's brake: slows to a stop and holds there, never reverses
    if(Math.abs(S.v+a*dt)<=dec*dt&&Math.abs(gas)<=wBrake){ S.v=0; a=0; } else a-=Math.sign(S.v||1)*dec*(S.v===0?0:1); }
  const prevV=S.v; S.v+=a*dt; if(prevV*S.v<0&&(Math.abs(gas)<.05||wBrake>.03)) S.v=0;
  if(WA&&S.v<-7) S.v=Math.min(-7,S.v+12*dt);                          // reverse in an automatic tops out around 15 mph
  if(S.v>cap) S.v=Math.max(cap,S.v-25*dt);                     // ease down to a lower cap instead of snapping
  if(S.inWater&&!boat) S.v=Math.max(-2,Math.min(2.4,S.v));
  S.v=Math.max(-REVMAX*pw,Math.min(vtop||MAXV,S.v)); if(Math.abs(S.v)<.05&&Math.abs(gas)<.05)S.v=0;
  if(every('grip',2)){ const wg=wxGrip(), k=wg>=.95?0:wg>=.62?1:2;               // tell the driver once when the road turns wet or slick
    if(k!==step.gripK){ if(k>(step.gripK||0)) toast(k===1?'🌧️ Wet road — brake earlier':'❄️ Slick road — brake much earlier, turn gently',3500); step.gripK=k; } }

  // steering (bicycle model, less lock at speed)
  // a racing wheel steers like a real car: fixed ratio (900° wheel → ±29° at the road wheels, ~15.5:1), no speed-dependent
  // shrinking; keys / touch / autopilot keep the assisted lock that eases off with speed
  const wheelIn=!!(WH&&WH.ok)&&Math.abs(kS)<.05&&Math.abs(tSteer)<=.05&&!(window.AUTO&&AUTO.on)&&!boat;
  const lock=boat?rad(30)/(1+Math.abs(S.v)/12):wheelIn?rad(450/15.5):steerLock(S.v);
  S.steer+=(st*lock-S.steer)*Math.min(1,dt*(wheelIn?24:9));
  let skid=0;
  if(REAL&&mode==='car'&&!boat){ const av=Math.abs(S.v), latA=av*av*Math.abs(Math.tan(S.steer))/WB;   // cornering force, speedometer units
    skid=Math.max(0,Math.min(1,(latA-9.5*mu)/4));                      // beyond ~1 g x grip the tyres let go
    if(braking&&av>5&&(hand||-gas>.85*Math.min(1,mu+.15))) skid=Math.max(skid,Math.min(1,av/15));   // stamping on the brake
    if(skid>0) S.v*=1-.5*skid*dt; }
  S.skid=skid;
  const yrT=(boat?S.v/7:S.v*SPEEDUP/WB)*Math.tan(S.steer)*(1-.35*skid);   // turn at the speed the world actually moves
  S.yr=REAL&&!boat?(S.yr||0)+(yrT-(S.yr||0))*Math.min(1,dt/.13):yrT;  // realistic: the turn builds over ~0.1 s (tyres, weight), not instantly
  S.hdg+=S.yr*dt*180/Math.PI;

  // move, with collision against buildings & water
  const dm=S.v*dt*SPEEDUP, h=rad(S.hdg);
  const nLat=S.lat+Math.cos(h)*dm/111320, nLng=S.lng+Math.sin(h)*dm/(111320*Math.cos(rad(S.lat)));
  let blocked=false, inBuilding=false; const CKP=!!(window.COCKPIT&&COCKPIT.on), QG=QGEO();   // QG: answer from the map data, not the screen   // cockpit view (js/enh/cockpit.js): the car is under the camera, off screen
  // realistic driving: buildings, trees and traffic are solid. The car is drawn larger than life (EXAG), so its nose is too.
  const SOLID=REAL&&(mode==='car'||mode==='tractor'), NOSE=2.4*(SOLID?Math.max(1,EXAG*.85):1);
  if(Math.abs(S.v)>(SOLID?.05:.5) && styleReady && blockIds.length){
    const ahead=[nLng+Math.sin(h)*NOSE/(111320*Math.cos(rad(S.lat)))*Math.sign(S.v), nLat+Math.cos(h)*NOSE/111320*Math.sign(S.v)];
    // garages (js/enh/garage.js): through an open door and around inside one, its walls rule instead of the house's
    const gg=mode==='car'&&window.GARAGE?GARAGE.gate(S.lat,S.lng,nLat,nLng,ahead):null;
    const p=gg?null:map.project(ahead);
    // tall extrusions overlap the car on screen, so candidates are filtered by real footprint under the car's nose.
    // A small box is enough: fill-extrusion queries hit the whole projected prism, including its base footprint.
    const bh=gg?[]:(QG?geoBlocks(ahead[0],ahead[1]):hit(p.x,p.y,6,blockIds)).filter(f=>contains(f.geometry,ahead[0],ahead[1]));   /* cockpit: the nose can be off screen */
    if(gg==='wall'){ blocked=true; step.bid=null; }
    else if(bh.length&&SOLID&&!bh.some(f=>contains(f.geometry,S.lng,S.lat))){ blocked=true; step.bid=null; }   // a wall stops you
    else if(bh.length){ inBuilding=true;                            // realistic driving off (or already inside one): you plow through
      const b0=bh[0], bid=b0.id!=null?b0.id:JSON.stringify(bboxOf(partsOf(b0.geometry)[0]?.[0]||[[0,0]]));
      if(bid!==step.bid){ step.bid=bid; step.newHit=true; } }
    else step.bid=null;
  }
  smashCool-=dt;
  if(inBuilding){
    const dir=S.v>=0?-1:1;
    if(!smashing||step.newHit){ step.newHit=false; spawn(34,14,dir); shake=1; smashCool=.05; }
    else if(smashCool<=0){ spawn(5,2,dir); smashCool=.06; shake=Math.max(shake,.35); }
    S.v*=Math.exp(-dt*1.6);                                    // buildings slow you, but you plow through
  }
  step.crashT=(step.crashT||0)-dt;
  if(blocked){ const sp=Math.abs(S.v);                             // thud, a little debris, bounce back off the wall
    if(sp>1.5&&smashCool<=0){ spawn(Math.min(24,4+Math.floor(sp*1.2)),Math.min(10,2+Math.floor(sp*.4)),S.v>=0?-1:1); smashCool=.35;
      if(window.FEEL) FEEL.impact(sp,'wall'); else shake=Math.max(shake,.5); if(sp>4) step.crashT=.6; }
    S.v=-Math.sign(S.v)*Math.min(sp*.25,3); }
  else if(SOLID&&window.FEEL&&Math.abs(S.v)>.05){ const c=FEEL.hit(nLng,nLat,h,NOSE);   // trees and traffic
    if(c){ S.v=c.v; S.hdg+=c.turn||0; blocked=!!c.stop; } }
  if(boat&&!blocked&&landCache.water.length&&Math.abs(S.v)>.05){       // the boat stops at the shore (pick a car to go on land)
    const h2=Math.sign(S.v)*3, bLng=nLng+Math.sin(h)*h2/(111320*Math.cos(rad(S.lat))), bLat=nLat+Math.cos(h)*h2/111320;
    if(!inAny(landCache.water,bLng,bLat)){ blocked=true; S.v=-Math.sign(S.v)*Math.min(Math.abs(S.v)*.2,1.5);
      if(!(step.shoreT>performance.now())){ step.shoreT=performance.now()+6000; toast('🏝️ Shore ahead: pick a car (or the tractor) in ⚙️ Car to drive on land',3500); } } }
  smashing=inBuilding||step.crashT>0;
  if(!blocked){ S.lat=nLat; S.lng=nLng; }

  // road detection
  if(every('place',1)) updatePlace(); if(every('house',.25)) updateHouseFilter(false);
  if(every('compass',POWER?.12:.05)) updateCompass(); if(every('roadx',.25)) updateRoadX();
  const parked=Math.abs(S.v)<.05 && step.detOnce;
  if(!parked && styleReady && every('det',POWER?.25:.12)){ step.detOnce=true;
    const p=map.project([S.lng,S.lat]); const f=QG?[]:hitRoad(p.x,p.y,48);   // cockpit: the car's own spot is never on screen
    const el=roadEl;
    if(f===null){ onRoad=true; el.textContent='Driving'; el.className=''; }      // road data unavailable: never punish
    else if(f.length>0){ miss=0; onRoad=true; S.rcls=f.every(x=>{ const q=x.properties||{}; return q.surface==='unpaved'||/^(track|path)$/.test(String(q.class||'')); })?'gravel':'paved'; el.textContent='On road'; el.className=''; }
    else {                                                         // screen query missed: check the real road lines
      const g=nearRoadGeo();
      if(g!==false){ miss=0; S.rcls=roadGeo.hit&&/^(track|path)$/.test(roadGeo.hit.cls||'')?'gravel':'paved'; if(roadGeo.hit&&roadGeo.hit.name&&roadGeo.hit.name!==roadName) roadName=roadGeo.hit.name; if(!onRoad||el.className||el.textContent!=='On road'){ onRoad=true; el.textContent='On road'; el.className=''; } }
      else if(++miss>=8){ onRoad=false; el.textContent='Off road'; el.className='off'; } }   // ~1s of sustained misses
    // ---- which vehicle? Decided from the map's real water/farmland polygons (point-in-polygon on
    //      lng/lat), not from what happens to be drawn under a screen pixel, then debounced by time.
    if(!landCache.at || every('landcache',3) || meters(landCache.at[1],landCache.at[0],S.lat,S.lng)>400) rebuildLandCache();
    const onGeoRoad=QG&&nearRoadGeo()===true;                      // cockpit: the car's own spot is off screen, so bridges/roads come from the road lines
    const water=inAny(landCache.water,S.lng,S.lat) && !(QG?onGeoRoad:hit(p.x,p.y,5,bridgeIds).length);
    const farm=!water && inAny(landCache.farm,S.lng,S.lat);
    const realRoad=farm && (QG?onGeoRoad:(hitRoad(p.x,p.y,4)||[]).some(f=>!/^(track|path)$/.test(String(f.properties&&f.properties.class||''))));
    if(water&&!S.inWater&&!boat&&(mode==='car'||mode==='tractor')) toast('🌊 You\'re in the water: pick 🚤 Boat in ⚙️ Car to go boating, or wade back out',3800);
    S.inWater=water;
    const want=BOATPICK?'boat':CARSPEC.tractor?'tractor':'car';    // what's picked in ⚙️ Car — neither fields nor water swap vehicles any more
    const tNow=last/1000, gap=Math.min(.5,tNow-(step.detT||tNow)); step.detT=tNow;
    if(want===mode){ candMode=null; candT=0; }
    else {
      if(want!==candMode){ candMode=want; candT=0; }
      candT+=gap;
      const need=want==='boat'?.25 : mode==='boat'?.4 : 0;           // seconds the new answer must hold (car <-> tractor: the picker's choice, at once)
      if(candT>=need){ setMode(want); candMode=null; candT=0; }
    }
    if(boat){ onRoad=true; el.textContent='Boating'; el.className=''; }
    else {
      if(mode==='tractor'&&farm&&!realRoad){ onRoad=true; el.textContent='In the field'; el.className=''; }
    }
    if(every('surf',.4)&&!(CKP&&Math.abs(LOOK.yaw)>60)){            // cockpit: only while looking roughly ahead (the probe must be on screen)
      const lt=boat?'Water':landHere(QG?null:p,[S.lng,S.lat]);   // from the map data when terrain is on or in the cockpit
      const txt=lt+(mode==='tractor'?' · Tractor':mode==='boat'?' · Bass boat':'');
      if(txt!==step.surf){ step.surf=txt; surfEl.textContent=txt; }
    }
  }
  if(every('towers',5) && !towerBusy && towerAt && (meters(towerAt[1],towerAt[0],S.lat,S.lng)>15000||towerRetry&&Date.now()>towerRetry)) { towerRetry=0; loadTowers(); }
  if(every('decor',.5)){
    if(styleReady && (!decorAt || meters(decorAt[1],decorAt[0],S.lat,S.lng)>250)) buildDecor();
    const nt=nearestPoi(); if(nt!==step.near){ step.near=nt; nearEl.textContent=nt; }
  }
  // terrain slope under the vehicle (tilts it up and down hills)
  if(!terrainOn){ S.sp*=.9; S.sr*=.9; }
  else if(!parked && every('slope',.05)){
    try{
      const d=3, c=Math.cos(h), s=Math.sin(h), kx=1/(111320*Math.cos(rad(S.lat))), ky=1/111320;
      const e=(dx,dy)=>map.queryTerrainElevation([S.lng+dx*kx,S.lat+dy*ky]);
      const eF=e(s*d,c*d), eB=e(-s*d,-c*d), eR=e(c*d,-s*d), eL=e(-c*d,s*d);
      if(eF!=null&&eB!=null&&eR!=null&&eL!=null){
        const cl=v=>Math.max(-.35,Math.min(.35,v));
        const tp=cl(Math.atan2(eF-eB,2*d)), tr=cl(Math.atan2(eR-eL,2*d));
        S.sp+=(tp-S.sp)*Math.min(1,dt*10); S.sr+=(tr-S.sr)*Math.min(1,dt*10);
      }
    }catch(e){}
  }

  // camera: lagged chase, zooms out with speed
  const dB=((S.hdg+LOOK.yaw-S.camB+540)%360)-180; S.camB+=dB*(1-Math.exp(-dt*7));
  // the camera sits closer (CAM_IN) so the real-size car looks as big on screen as the old 1.6x one did; the extra closeness
  // fades out with speed, so at speed you see as far ahead as before
  const spdF=Math.min(Math.abs(S.v)/MAXV,1), tz=19.3+zoomOff+CAM_IN*(1-spdF)-spdF*2.0; S.zoom+=(tz-S.zoom)*Math.min(1,dt*3);
  let camMoved=true;
  if(window.COCKPIT&&COCKPIT.active()) COCKPIT.view(dt);          // from behind the wheel (js/enh/cockpit.js)
  else{
  const W=innerWidth,H=innerHeight,padTop=H*.34, PIT=viewPitch(68);
  const cm0=step.cam||{};
  camMoved=dirty||W!==cm0.W||H!==cm0.H||PIT!==cm0.p||Math.abs(S.lng-cm0.lng)>1e-8||Math.abs(S.lat-cm0.lat)>1e-8||Math.abs(S.camB-cm0.b)>.005||Math.abs(S.zoom-cm0.z)>.0003;
  if(camMoved){ step.cam={lng:S.lng,lat:S.lat,b:S.camB,z:S.zoom,W,H,p:PIT};
    map.jumpTo({center:[S.lng,S.lat],bearing:S.camB,zoom:S.zoom,pitch:PIT,padding:{top:padTop,bottom:0,left:0,right:0}}); }

  // 3D car — pixel-scale match with map camera
  if(W!==step.W||H!==step.H||PIT!==step.pit){ step.W=W; step.H=H; step.pit=PIT;   // only touch the GL canvas / camera on resize or tilt
    renderer.setSize(W,H,false); camera.aspect=W/H;
    camera.setViewOffset(W,H,0,-padTop/2,W,H);
    aimCam3D(H,PIT); placeGlider(); }
  }
  const sc=EXAG/mpp(S.lat,S.zoom); car.scale.setScalar(sc); debris.scale.setScalar(sc);
  car.rotation.y=-rad(S.hdg-S.camB);
  const tRoll=S.steer*Math.min(Math.abs(S.v)/12,1.2)*.35, pk=REAL&&mode==='car'?1.8:1, tPitch=Math.max(-.05*pk,Math.min(.05*pk,a*.004*pk));   // realistic: the nose dives and the tail squats more
  S.roll+=(tRoll-S.roll)*Math.min(1,dt*6); S.pitch+=(tPitch-S.pitch)*Math.min(1,dt*6);
  const bz=S.bz||0, bx=S.bx||0;                                  // rough ground and jolts (js/enh/feel.js)
  body.rotation.z=S.roll+S.sr+bz; body.rotation.x=S.pitch+S.sp+bx; body.position.y=S.by||0;
  tractorG.rotation.z=S.roll*.6+S.sr+bz; tractorG.rotation.x=S.pitch*.6+S.sp+bx;
  if(boat){ boatG.rotation.z=-S.roll*1.6+Math.sin(now/420)*.03;   /* a planing boat banks INTO the turn (a car rolls out of it) */ boatG.rotation.x=S.pitch+Math.sin(now/510)*.025; boatG.position.y=-.1+Math.sin(now/360)*.05;
    if(Math.abs(S.v)>3 && every('wake',.035)) spawn(0,Math.min(3,1+Math.floor(Math.abs(S.v)/15)),1,0xf4fbff); }
  S.dist+=S.v*dt;
  if(mode==='car') wheels.forEach(w=>{ w.spin.rotation.x=-S.dist/.38; if(w.front) w.pivot.rotation.y=-S.steer; });
  else if(mode==='tractor'){
    tWheels.forEach(w=>{ w.spin.rotation.x=-S.dist/w.r; if(w.front) w.pivot.rotation.y=-S.steer; });
    if(Math.abs(S.v)>4 && every('dirt',.07)) spawn(0,1,1,0xa0825a);     // dirt kicked up behind
  }
  tails.forEach(t=>t.material=braking?tailOn:tailOff);
  placePhoto(braking);
  const trafficMoving=(window.TRAFFIC?TRAFFIC.frame(dt):false)|runFrameHooks(dt);   // AI cars (js/enh/traffic.js) + add-ons
  const live=updateFx(dt,dm,car.rotation.y);
  const settling=Math.abs(tRoll-S.roll)>1e-3||Math.abs(tPitch-S.pitch)>1e-3||Math.abs(S.steer-(step.pst||0))>1e-4||braking!==step.pbr||Math.abs(S.sp)>1e-3&&!terrainOn;
  step.pst=S.steer; step.pbr=braking;
  const bob=boat&&(!POWER||frame%2===0);                         // parked boat still bobs, at half rate in saver
  if(camMoved||settling||live>0||shake>0||bob||trafficMoving||(S.bj||0)>.02){ renderer.render(scene,camera); if(window.COCKPIT&&COCKPIT.on) COCKPIT.render(dt); }
  dirty=false;

  const mph=Math.round(Math.abs(S.v)*2.237); if(mph!==step.mph){ step.mph=mph; mphEl.textContent=mph; }
}
