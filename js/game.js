/* Yorkville Driver: map, vehicles, physics, camera, compass, trees, water towers, hang glider. */
/* ---------- BATTERY SAVER (on by default on phones) ----------
   30 fps cap, lower render resolution, flat terrain, fewer trees, and no redraw while parked. */
let POWER=false;
try{ const v=localStorage.getItem('ydPower'); POWER = v===null ? matchMedia('(pointer: coarse)').matches : v==='1'; }
catch(e){ try{ POWER=matchMedia('(pointer: coarse)').matches; }catch(_){} }
const mapPR=on=>Math.min(devicePixelRatio||1, on?1.25:2);
// Start on Route 47 just south of Raging Waves waterpark, pointed at it
const RAGING_WAVES={lng:-88.44446,lat:41.6989};
const START=(()=>{ const lng=-88.4474, lat=41.6955, dN=(RAGING_WAVES.lat-lat)*111320, dE=(RAGING_WAVES.lng-lng)*111320*Math.cos(lat*Math.PI/180);
  return {lng,lat,hdg:(Math.atan2(dE,dN)*180/Math.PI+360)%360}; })();
/* ---------- MAP ---------- */
const map = new maplibregl.Map({ pixelRatio:mapPR(POWER),
  container:'map', style:'https://tiles.openfreemap.org/styles/liberty',
  center:[START.lng,START.lat], bearing:START.hdg, zoom:19.3, pitch:68, maxPitch:80, maxZoom:22,
  interactive:false, fadeDuration:0, attributionControl:{compact:true}
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
      'fill-extrusion-base':['coalesce',['get','render_min_height'],['get','min_height'],0],'fill-extrusion-opacity':.95}});
  }
  const all = map.getStyle().layers;
  roadIds  = all.filter(l=>l['source-layer']==='transportation' && (l.type==='line'||l.type==='fill')).map(l=>l.id);
  bridgeIds= roadIds.filter(id=>!/tunnel|ferry|rail|aeroway/i.test(id));   // tunnels/ferry lines over water don't make it land
  waterIds = all.filter(l=>l['source-layer']==='water' && l.type==='fill').map(l=>l.id);
  blockIds = all.filter(l=>l['source-layer']==='building' && (l.type==='fill-extrusion')).map(l=>l.id);
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
        'fill-extrusion-opacity':(typeof op==='number')?op:.8}}, map.getLayer('hn-big')?'hn-big':undefined);
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
    map.addLayer({id:'hillshade',type:'hillshade',source:'dem-hs',layout:{visibility:POWER?'none':'visible'},
      paint:{'hillshade-exaggeration':.4,'hillshade-shadow-color':'#5a4f3f','hillshade-highlight-color':'#fffaf0'}},before);
    if(!POWER){ map.setTerrain({source:'dem',exaggeration:TERRAIN_X}); terrainOn=true; }
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
    map.addLayer({id:'tree-trunk',type:'fill-extrusion',source:'decor',filter:['==',['get','k'],'trunk'],
      paint:{'fill-extrusion-color':'#6b4a2b','fill-extrusion-height':['get','h'],'fill-extrusion-base':['get','b']}},top);
    map.addLayer({id:'tree-crown',type:'fill-extrusion',source:'decor',filter:['==',['get','k'],'crown'],
      paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-height':['get','h'],'fill-extrusion-base':['get','b'],'fill-extrusion-opacity':.95}},top);
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
      paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-height':['get','h'],'fill-extrusion-base':['get','b']}});
    map.addLayer({id:'tower-label',type:'symbol',source:'towers',filter:['==',['get','k'],'lbl'],
      layout:{'text-field':['get','name'],'text-font':fl?fl['text-font']:['Noto Sans Regular'],'text-size':14,'text-anchor':'bottom',
        'text-offset':[0,-.5],'text-allow-overlap':true,'text-ignore-placement':true},
      paint:{'text-color':'#0c4a6e','text-halo-color':'#fff','text-halo-width':2}});
  }catch(e){ console.warn('tower layers',e); }
  try{ map.addSource('clouds',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    map.addLayer({id:'clouds',type:'fill-extrusion',source:'clouds',
      paint:{'fill-extrusion-color':'#ffffff','fill-extrusion-height':['get','h'],'fill-extrusion-base':['get','b'],'fill-extrusion-opacity':.6}}); }
  catch(e){ console.warn('clouds',e); }
  loadTowers();
  setTimeout(()=>toast('Tip: triple-tap the gas to take off in a hang glider',5000),1500);
  styleReady=true;
  const ld=document.getElementById('load'); ld.style.opacity=0; setTimeout(()=>ld.remove(),500);
  }catch(err){ console.error(err); var d=document.createElement('pre'); d.style.cssText='position:fixed;left:8px;right:8px;top:8px;z-index:9999;background:#7f1d1d;color:#fff;font:12px monospace;padding:10px;white-space:pre-wrap'; d.textContent='LOAD ERROR: '+err.message; document.body.appendChild(d); }
  const ld2=document.getElementById('load'); if(ld2){ld2.style.opacity=0; setTimeout(()=>ld2.remove(),500);}
  startLoop();
});
let started=false, styleReady=false;
function startLoop(){ if(started) return; started=true; last=performance.now(); requestAnimationFrame(loop); }
setTimeout(()=>{const ld=document.getElementById('load'); if(ld){ld.style.opacity=0; setTimeout(()=>ld.remove(),500);} startLoop();},6000);

/* ---------- THREE: EXPLORER-STYLE SUV ---------- */
const cv=document.getElementById('car3d');
const renderer=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:(devicePixelRatio||1)<2,powerPreference:'low-power'});
const carPR=on=>on?Math.min(devicePixelRatio||1,1.25):Math.min(devicePixelRatio||1,2);
renderer.setPixelRatio(carPR(POWER));
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(36.87,1,10,50000);
scene.add(new THREE.HemisphereLight(0xdfeeff,0x556070,.85));
const sun=new THREE.DirectionalLight(0xfff2dd,.9); sun.position.set(-4,8,3); scene.add(sun);

const paint=new THREE.MeshPhongMaterial({color:0x4d647c,specular:0xbcd0e6,shininess:90});
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

/* ---------- PHOTO BODY ----------
   A cut-out photo of a real Explorer ST (img/explorer-rear.webp, the owner's own picture) is shown instead of the
   3D body. The chase camera only ever sees the car from behind and above, so a camera-facing photo that leans as the
   car turns and rolls reads as the real thing. Brake and tail lights glow on top of it, and it darkens at night.
   The 3D body stays underneath as the fallback if the image can't load; the boat, tractor and glider are unchanged.
   Add ?car=3d to the address to use the 3D model instead. */
const PHOTO={mesh:null,glow:null,on:!/[?&]car=3d\b/.test(location.search)};
if(PHOTO.on) new THREE.TextureLoader().load('img/explorer-rear.webp?v=1',tex=>{
  tex.anisotropy=renderer.capabilities.getMaxAnisotropy?Math.min(4,renderer.capabilities.getMaxAnisotropy()):1;
  const W=2.35, H=W*tex.image.height/tex.image.width, PIV=.38;   // pivot: the car's centre sits ~38% up the picture
  const g=new THREE.PlaneGeometry(W,H); g.translate(0,H*(.5-PIV),0);
  const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({map:tex,transparent:true,alphaTest:.04,depthTest:false,depthWrite:false}));
  m.renderOrder=10; m.visible=false; scene.add(m);
  // soft red glow over each tail light (brighter when braking, a faint glow after dark)
  const gc=document.createElement('canvas'); gc.width=gc.height=64; const gx=gc.getContext('2d'), rg=gx.createRadialGradient(32,32,1,32,32,32);
  rg.addColorStop(0,'rgba(255,90,70,1)'); rg.addColorStop(.3,'rgba(255,30,25,.75)'); rg.addColorStop(1,'rgba(255,0,0,0)'); gx.fillStyle=rg; gx.fillRect(0,0,64,64);
  const gm=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(gc),transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0});
  for(const fx of [.088,.912]){ const q=new THREE.Mesh(new THREE.PlaneGeometry(W*.26,W*.3),gm); q.position.set((fx-.5)*W,H*(.37-PIV),.01); q.renderOrder=11; m.add(q); }
  PHOTO.mesh=m; PHOTO.glow=gm; dirty=true;
},undefined,e=>console.warn('car photo could not load, using the 3D model',e));
// called every frame after the car transform is set: face the camera, lean with the car's heading and body roll
function placePhoto(braking){
  const m=PHOTO.mesh; if(!m) return;
  const show=mode==='car'; if(m.visible!==show){ m.visible=show; body.visible=false; }
  if(!show) return; body.visible=false;
  m.scale.setScalar(car.scale.x);
  m.quaternion.copy(camera.quaternion); m.rotateZ(car.rotation.y+(S.roll+S.sr)*.8);   // same lean directions as the 3D body (camera looks down the car's z axis)
  const hemi=scene.children.find(o=>o&&o.isHemisphereLight), b=Math.max(.32,Math.min(1,(hemi?hemi.intensity:.85)/.85+.08));
  m.material.color.setScalar(b);
  PHOTO.glow.opacity=braking?1:(tailOff.color.r>.7?.45:0);        // tailOff turns brighter at night (js/enh/atmos.js)
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

/* ---------- FARM TRACTOR (swaps in on farmland) ---------- */
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
// triple-tap the gas (slider or W / up arrow) to launch or land the hang glider
const taps=[];
function gasTap(){ const t=performance.now(); taps.push(t); while(taps.length&&t-taps[0]>750) taps.shift();
  if(taps.length>=3){ taps.length=0; toggleGlider(); } }
document.getElementById('sp').addEventListener('pointerdown',gasTap);
addEventListener('keydown',e=>{ const k=e.key.toLowerCase(); if(!e.repeat&&(k==='w'||k==='arrowup')) gasTap(); });
let toastT=null;
function toast(msg,ms){ const el=document.getElementById('toast'); el.textContent=msg; el.classList.add('show');
  clearTimeout(toastT); toastT=setTimeout(()=>el.classList.remove('show'),ms||2600); }
const K={}; addEventListener('keydown',e=>{K[e.key.toLowerCase()]=1; if(e.key.startsWith('Arrow')||e.key===' ')e.preventDefault();}); addEventListener('keyup',e=>K[e.key.toLowerCase()]=0);
let kS=0,kG=0; let zoomOff=0;
let dirty=true;
cp.onclick=()=>{EXAG=Math.min(EXAG*1.25,2.5); dirty=true;}; cm.onclick=()=>{EXAG=Math.max(EXAG/1.25,.25); dirty=true;};
function applyPower(on){
  POWER=on; try{ localStorage.setItem('ydPower',on?'1':'0'); }catch(e){}
  pw.classList.toggle('on',on);
  try{ map.setPixelRatio(mapPR(on)); }catch(e){}
  renderer.setPixelRatio(carPR(on)); step.W=0;                  // forces canvas resize next frame
  if(styleReady){
    try{ if(on){ map.setTerrain(null); terrainOn=false; }
         else if(map.getSource('dem')){ map.setTerrain({source:'dem',exaggeration:TERRAIN_X}); terrainOn=true; } }catch(e){ console.warn('terrain toggle',e); }
    try{ if(map.getLayer('hillshade')) map.setLayoutProperty('hillshade','visibility',on?'none':'visible'); }catch(e){}   // hidden = its elevation tiles aren't downloaded
    decorAt=null;                                               // rebuild trees at the new density
  }
  try{ if(window.onPowerChange) window.onPowerChange(on); }catch(e){}
  dirty=true;
}
pw.onclick=()=>applyPower(!POWER);
pw.classList.toggle('on',POWER);
zi.onclick=()=>{zoomOff=Math.min(zoomOff+.5,2); dirty=true;}; zo.onclick=()=>{zoomOff=Math.max(zoomOff-.5,-3); dirty=true;};

/* ---------- PHYSICS ---------- */
const S={lng:START.lng,lat:START.lat,hdg:START.hdg,v:0,steer:0,camB:START.hdg,zoom:19.3,roll:0,pitch:0,wheel:0,dist:0,sp:0,sr:0};
let boat=false, waterC=0, landC=0, mode='car', farmC=0, offFarmC=0, terrainOn=false, landIds=[];
const TERRAIN_X=1.5, TRACTOR=0.75;   // tractor runs at 75% of car speed
const BOATMAX=48, WB=3.05, MAXV=60, REVMAX=28, SPEEDUP=3; let EXAG=1.6;   // two steps below the largest size (2.5)   // SPEEDUP: world distance per game metre
let last=0,frame=0,onRoad=true,roadName='';
// steering lock: 40 degrees when crawling (about a 6 m turning circle), easing off with speed so the highway stays calm.
// 25 mph turns on roughly an 18 m radius, 15 mph about 12 m. Autopilot uses the same curve.
const STEER_MAX=40*Math.PI/180;
function steerLock(v){ const a=Math.abs(v); return STEER_MAX/(1+a/4.5+(a/12)*(a/12)); }
const rad=d=>d*Math.PI/180;
const mpp=(lat,z)=>78271.517*Math.cos(rad(lat))/Math.pow(2,z);
let roadFails=0, miss=0;
const hitRoad=(x,y,r)=>{ try{ if(!roadIds.length) return null; return map.queryRenderedFeatures([[x-r,y-r],[x+r,y+r]],{layers:roadIds}); }catch(e){ roadFails++; return null; } };
const hit=(x,y,r,ids)=>{ try{ return ids.length?map.queryRenderedFeatures([[x-r,y-r],[x+r,y+r]],{layers:ids}):[]; }catch(e){ return []; } };
const roadEl=document.getElementById('road'), mphEl=document.getElementById('mph');
const mapEl=document.getElementById('map');


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
      const a=j.address||{};
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
const MLAT=111320, MLNG=111320*Math.cos(41.64*Math.PI/180);
const TREEC=['#2f6b2f','#3d7a35','#4a8a3c','#2c5e34','#5b8f3a','#35703a'];
const POIC={fuel:'#dc2626',restaurant:'#f97316',fast_food:'#f97316',cafe:'#f97316',bar:'#f97316',beer:'#f97316',ice_cream:'#f97316',
  shop:'#a855f7',grocery:'#a855f7',clothing_store:'#a855f7',school:'#2563eb',college:'#2563eb',place_of_worship:'#f5f5f4',
  hospital:'#ef4444',doctors:'#ef4444',bank:'#16a34a',lodging:'#0ea5e9',town_hall:'#eab308',library:'#eab308',post:'#eab308',
  police:'#1d4ed8',fire_station:'#b91c1c',car:'#64748b',park:'#22c55e'};
function hash(a,b){ let h=(a*374761393+b*668265263)|0; h=Math.imul(h^(h>>>13),1274126177); return ((h^(h>>>16))>>>0)/4294967296; }
function ngon(lng,lat,r,n,rot){ const k=Math.cos(lat*Math.PI/180)*111320, ring=[];
  for(let i=0;i<=n;i++){ const t=rot+(i%n)/n*2*Math.PI; ring.push([lng+Math.cos(t)*r/k,lat+Math.sin(t)*r/111320]); } return [ring]; }
function buildDecor(){
  if(!styleReady||!map.getSource('decor')) return;
  const t0=performance.now(), cx=S.lng, cy=S.lat, R=POWER?350:650, TMAX=POWER?300:2500, feats=[], seenT=new Set();
  const wx0=cx-R/MLNG, wx1=cx+R/MLNG, wy0=cy-R/MLAT, wy1=cy+R/MLAT;
  let trees=0;
  try{
    const wood=map.querySourceFeatures(bSrc,{sourceLayer:'landcover',filter:['==',['get','class'],'wood']});
    const park=map.querySourceFeatures(bSrc,{sourceLayer:'park'});
    outer: for(const [list,step,dens] of POWER?[[wood,20,.8],[park,36,.4]]:[[wood,12,.9],[park,22,.5]]){
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
          const cr=2.2+hash(ix+1,iy)*1.8, th=2.2+hash(ix,iy+1)*1.3, top=th+4+hash(ix+2,iy+5)*7;
          feats.push({type:'Feature',properties:{k:'trunk',h:th+.6,b:0},geometry:{type:'Polygon',coordinates:ngon(lng,lat,.35,5,0)}});
          feats.push({type:'Feature',properties:{k:'crown',h:top,b:th,c:TREEC[Math.floor(hash(ix+3,iy+9)*TREEC.length)]},
            geometry:{type:'Polygon',coordinates:ngon(lng,lat,cr,7,r1*6)}});
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
      const lng=g.coordinates[0], lat=g.coordinates[1];
      if(lng<wx0-R/MLNG||lng>wx1+R/MLNG||lat<wy0-R/MLAT||lat>wy1+R/MLAT) continue;
      const key=pr.name+'|'+lng.toFixed(4)+','+lat.toFixed(4); if(seenP.has(key)) continue; seenP.add(key);
      const c=POIC[pr.class]||POIC[pr.subclass]||'#14b8a6';
      np.push({name:pr.name,cls:String(pr.subclass||pr.class||'').replace(/_/g,' '),lng,lat});
      feats.push({type:'Feature',properties:{k:'pin',h:7,b:0,c:'#e5e7eb'},geometry:{type:'Polygon',coordinates:ngon(lng,lat,.45,6,0)}});
      feats.push({type:'Feature',properties:{k:'pin',h:10.5,b:7,c},geometry:{type:'Polygon',coordinates:ngon(lng,lat,1.9,8,.2)}});
    }
  }catch(e){ console.warn('poi',e); }
  pois=np; decorN=feats.length; decorT=performance.now(); decorAt=[cx,cy];
  try{ map.getSource('decor').setData({type:'FeatureCollection',features:feats}); }catch(e){}
}
const LAND={wood:'Forest',grass:'Grassland',farmland:'Farmland',wetland:'Wetland',sand:'Sand',ice:'Ice',rock:'Rock',
  residential:'Residential',commercial:'Commercial',retail:'Retail',industrial:'Industrial',school:'School grounds',
  cemetery:'Cemetery',hospital:'Hospital',pitch:'Sports field',track:'Track',farmyard:'Farmyard',railway:'Rail yard',
  quarry:'Quarry',military:'Military',university:'Campus',college:'Campus',stadium:'Stadium',zoo:'Zoo',playground:'Playground'};
const surfEl=document.getElementById('surf'), nearEl=document.getElementById('near');
function landHere(p){
  if(!landIds.length) return '';
  const fs=hit(p.x,p.y,1,landIds);
  const pick=id=>fs.find(f=>f.layer&&f.layer.id===id);
  const f=pick('lc-detect')||pick('lu-detect')||pick('park');
  if(!f) return '';
  if(f.layer.id==='park') return (f.properties&&f.properties.name)||'Park';
  const c=f.properties&&f.properties.class; if(!c) return '';
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
    // keep the old lists if tiles are mid-reload and returned nothing
    if(farm.length||!landCache.at) landCache.farm=farm;
    if(water.length||!landCache.at) landCache.water=water;
    landCache.at=[cx,cy];
  }catch(e){ console.warn('land cache',e); }
}
function inAny(list,lng,lat){ for(const q of list){ const b=q.bb; if(lng<b[0]||lng>b[2]||lat<b[1]||lat>b[3]) continue; if(inPoly(lng,lat,q.pl)) return true; } return false; }

/* ---------- WATER TOWERS (OpenStreetMap man_made=water_tower via Overpass, keyless) ---------- */
let towers=[], towerAt=null, towerBusy=false, miniReady=false;
const towerSeen=new Set();
const OVERPASS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
function loadTowers(ep=0){
  if(towerBusy) return; towerBusy=true;
  const cx=S.lng, cy=S.lat, dy=.3, dx=.4;                          // ~33 km x 33 km around the car
  const bb=`(${(cy-dy).toFixed(4)},${(cx-dx).toFixed(4)},${(cy+dy).toFixed(4)},${(cx+dx).toFixed(4)})`;
  const q=`[out:json][timeout:25];(node["man_made"="water_tower"]${bb};way["man_made"="water_tower"]${bb};relation["man_made"="water_tower"]${bb};);out center tags;`;
  fetch(OVERPASS[ep],{method:'POST',body:'data='+encodeURIComponent(q),headers:{'Content-Type':'application/x-www-form-urlencoded'}})
    .then(r=>{ if(!r.ok) throw new Error('overpass '+r.status); return r.json(); })
    .then(j=>{
      for(const el of j.elements||[]){
        const lat=el.lat??(el.center&&el.center.lat), lng=el.lon??(el.center&&el.center.lon);
        if(lat==null||lng==null) continue;
        const k=el.type+el.id; if(towerSeen.has(k)) continue; towerSeen.add(k);
        const t=el.tags||{};
        towers.push({lng,lat,name:t.name||t['name:en']||(t.operator?t.operator+' water tower':'Water tower'),cls:'water tower'});
      }
      towerAt=[cx,cy]; drawTowers();
    })
    .catch(e=>{ console.warn('towers',e); if(ep+1<OVERPASS.length){ towerBusy=false; loadTowers(ep+1); return; } towerAt=[cx,cy]; })
    .finally(()=>{ towerBusy=false; });
}
function towerFC(pointsOnly){
  const feats=[];
  for(const t of towers){
    feats.push({type:'Feature',properties:{k:'lbl',name:t.name},geometry:{type:'Point',coordinates:[t.lng,t.lat]}});
    if(pointsOnly) continue;
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
  body.visible=(m==='car'); boatG.visible=(m==='boat'); tractorG.visible=(m==='tractor'); shadow.visible=(m!=='boat'&&m!=='glider');
  car.visible=(m!=='glider'); gliderG.visible=(m==='glider'); surfEl.style.color=''; step.surf=null;
  if(m!=='boat') boatG.position.y=boatG.rotation.x=boatG.rotation.z=0;
  if(m==='glider'){ /* no ground puff in the air */ }
  else if(m==='boat'||was==='boat'){ spawn(0,22,-1,0xcfe9ff); shake=Math.max(shake,.5); }
  else { spawn(0,16,-1,0xa0825a); shake=Math.max(shake,.3); }            // puff of field dirt
  roadEl.textContent=m==='boat'?'Boating':'Driving'; roadEl.className='';
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
  const x=S.lng*MLNG, y=S.lat*MLAT, ix=Math.floor(x/600), iy=Math.floor(y/600), feats=[];
  for(let i=ix-6;i<=ix+6;i++) for(let j=iy-6;j<=iy+6;j++){ const t=thermalAt(i,j); if(!t) continue;
    const n=3+Math.floor(hash(i+5,j+5)*3);
    for(let k=0;k<n;k++){ const a=hash(i+k,j-k)*6.28, o=t.r*.6*hash(j+k,i), base=1150+hash(i-k,j+k)*120;
      feats.push({type:'Feature',properties:{h:base+110+t.s*45,b:base},geometry:{type:'Polygon',
        coordinates:ngon((t.x+Math.cos(a)*o)/MLNG,(t.y+Math.sin(a)*o)/MLAT,t.r*(.5+.45*hash(k+3,i+j)),12,a)}}); } }
  try{ src.setData({type:'FeatureCollection',features:feats}); }catch(e){}
  cloudAt=[S.lng,S.lat];
}
function clearClouds(){ try{ map.getSource('clouds').setData({type:'FeatureCollection',features:[]}); }catch(e){} cloudAt=null; }
function toggleGlider(){
  if(mode==='glider'){ if(G.phase!=='land'){ G.phase='land'; toast('Landing: straight down'); } return; }
  Object.assign(G,{alt:0,air:11,bank:0,vs:0,lift:0,phase:'launch',t:0});
  S.v=0; S.steer=0; setMode('glider'); dirty=true; step.W=0; buildClouds(true);
  toast('Taking off…');
}
function touchDown(){
  G.phase=''; setMode('car'); S.v=0; S.zoom=19.3; step.detOnce=false; step.W=0; dirty=true; step.cam=null;
  clearClouds(); shake=Math.max(shake,.4); toast('Landed');
}
function glideStep(dt,st,gas,now){
  G.t+=dt;
  if(G.phase==='launch'){                                        // straight up from where you were
    const k=Math.min(1,G.t/2.8); G.alt=GTOP*(1-Math.pow(1-k,3)); G.vs=GTOP*3*Math.pow(1-k,2)/2.8; G.air=11;
    if(k>=1){ G.phase='fly'; toast('Lean to turn · gas up to dive faster · gas down to slow · triple-tap to land',4500); }
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
  const dB=((S.hdg-S.camB+540)%360)-180; S.camB+=dB*(1-Math.exp(-dt*2.5));
  const W=innerWidth,H=innerHeight,padTop=H*.34;
  if(W!==step.W||H!==step.H){ step.W=W; step.H=H;
    renderer.setSize(W,H,false); camera.aspect=W/H; camera.setViewOffset(W,H,0,-padTop/2,W,H);
    const dist=.5*H/Math.tan(rad(camera.fov)/2), p=rad(68);
    camera.position.set(0,dist*Math.cos(p),dist*Math.sin(p)); camera.lookAt(0,0,0); camera.updateProjectionMatrix(); placeGlider(); }
  const camAlt=Math.max(6,G.alt+14)*Math.pow(2,-zoomOff*.5), pr=rad(GP), hb=rad(S.camB), fwd=camAlt*Math.tan(pr);
  const cLat=S.lat+Math.cos(hb)*fwd/111320, cLng=S.lng+Math.sin(hb)*fwd/(111320*Math.cos(rad(S.lat)));
  const mppNeed=(camAlt/Math.cos(pr))/(.5*H/Math.tan(rad(36.87)/2));
  const z=Math.max(10,Math.min(21,Math.log2(78271.517*Math.cos(rad(S.lat))/mppNeed)));
  map.jumpTo({center:[cLng,cLat],bearing:S.camB,zoom:z,pitch:GP,padding:{top:padTop,bottom:0,left:0,right:0}});
  // glider attitude as seen from behind: level with the horizon, banked, nose follows the bar
  const bob=Math.sin(now/900)*.02;
  gMdl.rotation.set(rad(90-GP)-(G.phase==='fly'?gas*.12:0)+(G.phase==='land'?-.2:0)+bob, -rad(dB)*.6, -G.bank);
  updateFx(dt,0,0);
  renderer.render(scene,camera);
  // HUD + the usual background jobs
  if(every('ghud',.2)){
    const v=G.vs/GVERT;
    roadEl.textContent='Altitude '+Math.round(G.alt*3.281)+' ft'; roadEl.className='';
    surfEl.textContent='Hang glider · '+(v>=0?'▲ ':'▼ ')+Math.abs(v).toFixed(1)+' m/s'; surfEl.style.color=v>=0?'#86efac':'#fca5a5';
    nearEl.textContent=G.phase==='fly'&&G.lift>.8?'Thermal! Circle to climb':(G.phase==='fly'&&G.alt<60?'Getting low: find a thermal or triple-tap to land':nearestPoi());
    const mph=Math.round(G.air*2.237); if(mph!==step.mph){ step.mph=mph; mphEl.textContent=mph; }
  }
  if(every('place',1)) updatePlace(); if(every('house',.25)) updateHouseFilter(false);
  if(every('compass',POWER?.12:.05)) updateCompass();
  if(every('clouds',2)) buildClouds(false);
  if(every('decor',.5) && styleReady && (!decorAt || meters(decorAt[1],decorAt[0],S.lat,S.lng)>250)) buildDecor();
}
const tick={};
function every(k,sec){ const t=last/1000; if(tick[k]===undefined||t-tick[k]>=sec){ tick[k]=t; return true; } return false; }
let lastStep=0;
function loop(now){
  if(POWER && now-lastStep<30){ requestAnimationFrame(loop); return; }   // ~30 fps in battery saver
  lastStep=now;
  try{ step(now); }catch(e){ if(!loop.err){loop.err=1; const d=document.createElement('pre'); d.style.cssText='position:fixed;left:8px;right:8px;top:8px;z-index:9999;background:#7f1d1d;color:#fff;font:12px monospace;padding:10px;white-space:pre-wrap;border-radius:8px'; d.textContent='LOOP ERROR: '+e.message+'\n'+(e.stack||'').split('\n').slice(0,4).join('\n'); document.body.appendChild(d);} }
  requestAnimationFrame(loop);
}
function step(now){
  const dt=Math.min((now-last)/1000,.05); last=now; frame++;
  // inputs (keyboard eases like an analog stick)
  const ease=(v,p,n)=>{ if(p)v+=dt*4; else if(n)v-=dt*4; else v*=Math.exp(-dt*8); return Math.max(-1,Math.min(1,v)); };
  kS=ease(kS,K.d||K.arrowright,K.a||K.arrowleft); kG=ease(kG,K.w||K.arrowup,K.s||K.arrowdown);
  let st=Math.abs(tSteer)>.05?tSteer:kS, gas=Math.abs(tGas)>.05?tGas:kG; const hand=!!K[' '];
  // autopilot (js/enh/autopilot.js) drives until you touch the steering, gas or handbrake
  if(window.AUTO&&AUTO.on){ if(Math.abs(st)>.05||Math.abs(gas)>.05||hand) AUTO.takeover(); else { const c=AUTO.control(dt); st=c.st; gas=c.gas; } }
  if(mode==='glider'){ glideStep(dt,st,gas,now); return; }

  // longitudinal
  let a=0, braking=false;
  const tractor=(mode==='tractor'), pw=tractor?TRACTOR:1, vmax=MAXV*pw;
  if(gas>0.05) a=gas*(S.v<0?30:12)*pw*(1-Math.min(S.v/vmax,1)**2);
  else if(gas<-0.05){ if(S.v>.5){a=-28*(-gas);braking=true;} else a=gas*14*pw; }
  if(hand){a-=Math.sign(S.v)*30; braking=Math.abs(S.v)>.5;}
  const cap=boat?BOATMAX:tractor?vmax:(onRoad?MAXV:34);
  a-=Math.sign(S.v)*(boat?(.25+.0022*S.v*S.v):(.35+.0032*S.v*S.v));                // rolling + aero drag
  if(!onRoad&&!boat&&!tractor) a-=S.v*.15;                               // mild grass drag
  const prevV=S.v; S.v+=a*dt; if(prevV*S.v<0&&Math.abs(gas)<.05) S.v=0;
  if(S.v>cap) S.v=Math.max(cap,S.v-25*dt);                     // ease down to a lower cap instead of snapping
  S.v=Math.max(-REVMAX*pw,Math.min(MAXV,S.v)); if(Math.abs(S.v)<.05&&Math.abs(gas)<.05)S.v=0;

  // steering (bicycle model, less lock at speed)
  const lock=boat?rad(30)/(1+Math.abs(S.v)/12):steerLock(S.v);
  S.steer+=(st*lock-S.steer)*Math.min(1,dt*9);
  S.hdg+=(boat?S.v/7:S.v*SPEEDUP/WB)*Math.tan(S.steer)*dt*180/Math.PI;   // turn at the speed the world actually moves

  // move, with collision against buildings & water
  const dm=S.v*dt*SPEEDUP, h=rad(S.hdg);
  const nLat=S.lat+Math.cos(h)*dm/111320, nLng=S.lng+Math.sin(h)*dm/(111320*Math.cos(rad(S.lat)));
  let blocked=false, inBuilding=false;
  if(Math.abs(S.v)>.5 && styleReady && blockIds.length){
    const ahead=[nLng+Math.sin(h)*2.4/(111320*Math.cos(rad(S.lat)))*Math.sign(S.v), nLat+Math.cos(h)*2.4/111320*Math.sign(S.v)];
    const p=map.project(ahead);
    // tall extrusions overlap the car on screen, so candidates are filtered by real footprint under the car's nose.
    // A small box is enough: fill-extrusion queries hit the whole projected prism, including its base footprint.
    const bh=hit(p.x,p.y,6,blockIds).filter(f=>contains(f.geometry,ahead[0],ahead[1]));
    if(bh.length){ inBuilding=true;                                 // buildings stay standing; you just plow through
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
  smashing=inBuilding;
  if(blocked){ S.v=-S.v*.3; } else { S.lat=nLat; S.lng=nLng; }

  // road detection
  if(every('place',1)) updatePlace(); if(every('house',.25)) updateHouseFilter(false);
  if(every('compass',POWER?.12:.05)) updateCompass();
  const parked=Math.abs(S.v)<.05 && step.detOnce;
  if(!parked && styleReady && every('det',POWER?.25:.12)){ step.detOnce=true;
    const p=map.project([S.lng,S.lat]); const f=hitRoad(p.x,p.y,48);
    const el=roadEl;
    if(f===null){ onRoad=true; el.textContent='Driving'; el.className=''; }      // road data unavailable: never punish
    else if(f.length>0){ miss=0; onRoad=true; const nm=f.find(x=>x.properties&&x.properties.name); roadName=nm?nm.properties.name:''; el.textContent=roadName||'On road'; el.className=''; }
    else if(++miss>=8){ onRoad=false; el.textContent='Off road'; el.className='off'; }   // ~1s of sustained misses
    // ---- which vehicle? Decided from the map's real water/farmland polygons (point-in-polygon on
    //      lng/lat), not from what happens to be drawn under a screen pixel, then debounced by time.
    if(!landCache.at || every('landcache',3) || meters(landCache.at[1],landCache.at[0],S.lat,S.lng)>400) rebuildLandCache();
    const water=inAny(landCache.water,S.lng,S.lat) && !hit(p.x,p.y,5,bridgeIds).length;
    const farm=!water && inAny(landCache.farm,S.lng,S.lat);
    const realRoad=farm && (hitRoad(p.x,p.y,4)||[]).some(f=>!/^(track|path)$/.test(String(f.properties&&f.properties.class||'')));
    const want=water?'boat':(farm&&!realRoad)?'tractor':'car';
    const tNow=last/1000, gap=Math.min(.5,tNow-(step.detT||tNow)); step.detT=tNow;
    if(want===mode){ candMode=null; candT=0; }
    else {
      if(want!==candMode){ candMode=want; candT=0; }
      candT+=gap;
      const need=want==='boat'?.25 : mode==='boat'?.4 : want==='tractor'?.5 : 1.0;   // seconds the new answer must hold
      if(candT>=need){ setMode(want); candMode=null; candT=0; }
    }
    if(boat){ onRoad=true; el.textContent='Boating'; el.className=''; }
    else {
      if(mode==='tractor'){ onRoad=true; el.textContent='In the field'; el.className=''; }
    }
    if(every('surf',.4)){
      const lt=boat?'Water':landHere(p);
      const txt=lt+(mode==='tractor'?' · Tractor':mode==='boat'?' · Bass boat':'');
      if(txt!==step.surf){ step.surf=txt; surfEl.textContent=txt; }
    }
  }
  if(every('towers',5) && !towerBusy && towerAt && meters(towerAt[1],towerAt[0],S.lat,S.lng)>15000) loadTowers();
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
  const dB=((S.hdg-S.camB+540)%360)-180; S.camB+=dB*(1-Math.exp(-dt*7));
  const tz=19.3+zoomOff-Math.min(Math.abs(S.v)/MAXV,1)*2.0; S.zoom+=(tz-S.zoom)*Math.min(1,dt*3);
  const W=innerWidth,H=innerHeight,padTop=H*.34;
  const cm0=step.cam||{};
  const camMoved=dirty||W!==cm0.W||H!==cm0.H||Math.abs(S.lng-cm0.lng)>1e-8||Math.abs(S.lat-cm0.lat)>1e-8||Math.abs(S.camB-cm0.b)>.005||Math.abs(S.zoom-cm0.z)>.0003;
  if(camMoved){ step.cam={lng:S.lng,lat:S.lat,b:S.camB,z:S.zoom,W,H};
    map.jumpTo({center:[S.lng,S.lat],bearing:S.camB,zoom:S.zoom,pitch:68,padding:{top:padTop,bottom:0,left:0,right:0}}); }

  // 3D car — pixel-scale match with map camera
  if(W!==step.W||H!==step.H){ step.W=W; step.H=H;               // only touch the GL canvas / camera on resize
    renderer.setSize(W,H,false); camera.aspect=W/H;
    camera.setViewOffset(W,H,0,-padTop/2,W,H);
    const fovR=rad(camera.fov), dist=.5*H/Math.tan(fovR/2), p=rad(68);
    camera.position.set(0,dist*Math.cos(p),dist*Math.sin(p)); camera.lookAt(0,0,0); camera.updateProjectionMatrix(); placeGlider(); }
  const sc=EXAG/mpp(S.lat,S.zoom); car.scale.setScalar(sc); debris.scale.setScalar(sc);
  car.rotation.y=-rad(S.hdg-S.camB);
  const tRoll=S.steer*Math.min(Math.abs(S.v)/12,1.2)*.35, tPitch=Math.max(-.05,Math.min(.05,a*.004));
  S.roll+=(tRoll-S.roll)*Math.min(1,dt*6); S.pitch+=(tPitch-S.pitch)*Math.min(1,dt*6);
  body.rotation.z=S.roll+S.sr; body.rotation.x=S.pitch+S.sp;
  tractorG.rotation.z=S.roll*.6+S.sr; tractorG.rotation.x=S.pitch*.6+S.sp;
  if(boat){ boatG.rotation.z=S.roll*1.6+Math.sin(now/420)*.03; boatG.rotation.x=S.pitch+Math.sin(now/510)*.025; boatG.position.y=-.1+Math.sin(now/360)*.05;
    if(Math.abs(S.v)>3 && every('wake',.035)) spawn(0,Math.min(3,1+Math.floor(Math.abs(S.v)/15)),1,0xf4fbff); }
  S.dist+=S.v*dt;
  if(mode==='car') wheels.forEach(w=>{ w.spin.rotation.x=-S.dist/.38; if(w.front) w.pivot.rotation.y=-S.steer; });
  else if(mode==='tractor'){
    tWheels.forEach(w=>{ w.spin.rotation.x=-S.dist/w.r; if(w.front) w.pivot.rotation.y=-S.steer; });
    if(Math.abs(S.v)>4 && every('dirt',.07)) spawn(0,1,1,0xa0825a);     // dirt kicked up behind
  }
  tails.forEach(t=>t.material=braking?tailOn:tailOff);
  placePhoto(braking);
  const live=updateFx(dt,dm,car.rotation.y);
  const settling=Math.abs(tRoll-S.roll)>1e-3||Math.abs(tPitch-S.pitch)>1e-3||Math.abs(S.steer-(step.pst||0))>1e-4||braking!==step.pbr||Math.abs(S.sp)>1e-3&&!terrainOn;
  step.pst=S.steer; step.pbr=braking;
  const bob=boat&&(!POWER||frame%2===0);                         // parked boat still bobs, at half rate in saver
  if(camMoved||settling||live>0||shake>0||bob){ renderer.render(scene,camera); }
  dirty=false;

  const mph=Math.round(Math.abs(S.v)*2.237); if(mph!==step.mph){ step.mph=mph; mphEl.textContent=mph; }
}
