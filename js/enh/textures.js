/* Environment textures, all drawn in code (nothing to download): grass, lawns, forest floor, sand, wetland,
   paved lots, sports fields, cemeteries, water ripples and road asphalt, plus varied building colours.
   Textures are hidden in battery saver (patterns cost more to draw than flat colours); building colours stay. */
(()=>{
'use strict';
const {safe,srcName,addImg,onReady}=YD;

// seeded random so every texture looks the same on every visit
function rng(seed){ let a=seed>>>0; return ()=>{ a=(a+0x6D2B79F5)>>>0; let t=a; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; }
// draw a texture that tiles seamlessly: marks near an edge are repeated on the opposite edge
function tex(id,size,seed,draw){
  const c=document.createElement('canvas'); c.width=c.height=size; const x=c.getContext('2d'), r=rng(seed);
  const wrap=(fn)=>{ for(const dx of [-size,0,size]) for(const dy of [-size,0,size]){ x.save(); x.translate(dx,dy); fn(); x.restore(); } };
  draw(x,size,r,wrap);
  addImg(id,x.getImageData(0,0,size,size),{pixelRatio:2});
}
function speckle(x,s,r,wrap,n,colors,rMin,rMax,alpha){
  for(let i=0;i<n;i++){ const px=r()*s, py=r()*s, rad=rMin+r()*(rMax-rMin), col=colors[Math.floor(r()*colors.length)], a=alpha*(.5+r()*.5);
    wrap(()=>{ x.globalAlpha=a; x.fillStyle=col; x.beginPath(); x.arc(px,py,rad,0,6.3); x.fill(); }); }
  x.globalAlpha=1;
}
function blades(x,s,r,wrap,n,colors,len){
  x.lineWidth=1.2; x.lineCap='round';
  for(let i=0;i<n;i++){ const px=r()*s, py=r()*s, a=-Math.PI/2+(r()-.5)*.9, l=len*(.5+r()), col=colors[Math.floor(r()*colors.length)];
    wrap(()=>{ x.globalAlpha=.55; x.strokeStyle=col; x.beginPath(); x.moveTo(px,py); x.lineTo(px+Math.cos(a)*l,py+Math.sin(a)*l); x.stroke(); }); }
  x.globalAlpha=1;
}
function makeTextures(){
  tex('tx-grass',128,11,(x,s,r,w)=>{ x.fillStyle='#86b35a'; x.fillRect(0,0,s,s);
    speckle(x,s,r,w,70,['#6f9d45','#9cc46a','#7aa84e'],3,9,.45); blades(x,s,r,w,420,['#5e8f36','#a7cf72','#739f47','#b9d98a'],5); });
  tex('tx-lawn',128,12,(x,s,r,w)=>{ x.fillStyle='#9cc56d'; x.fillRect(0,0,s,s);
    for(let i=0;i<4;i++){ x.fillStyle=i%2?'rgba(255,255,255,.07)':'rgba(0,40,0,.05)'; x.fillRect(0,i*s/4,s,s/4); }   // mowing stripes
    blades(x,s,r,w,300,['#86b35a','#b5d98a','#8fbd5f'],3.5); speckle(x,s,r,w,6,['#f5f0d8','#e9d36b'],1,1.6,.7); });   // a few clover/dandelions
  tex('tx-wood',128,13,(x,s,r,w)=>{ x.fillStyle='#5c7a3a'; x.fillRect(0,0,s,s);
    speckle(x,s,r,w,90,['#4a6630','#6d8a45','#7a6a3e','#8a7447'],2,7,.55); speckle(x,s,r,w,160,['#9a8350','#3f5a2a','#b09356'],.8,1.8,.7); });
  tex('tx-sand',128,14,(x,s,r,w)=>{ x.fillStyle='#e6d3a0'; x.fillRect(0,0,s,s);
    speckle(x,s,r,w,500,['#d6c08a','#f2e3bb','#c9b27a','#fff5d6'],.5,1.4,.6); });
  tex('tx-wet',128,15,(x,s,r,w)=>{ x.fillStyle='#7ea46a'; x.fillRect(0,0,s,s);
    for(let i=0;i<10;i++){ const py=r()*s, px=r()*s, l=20+r()*40; w(()=>{ x.globalAlpha=.35; x.strokeStyle='#6aa3c8'; x.lineWidth=2; x.beginPath(); x.moveTo(px,py); x.quadraticCurveTo(px+l/2,py-4,px+l,py); x.stroke(); }); }
    x.globalAlpha=1; blades(x,s,r,w,260,['#5d8a45','#9dbb72','#4e7a3a'],6); });
  tex('tx-paved',128,16,(x,s,r,w)=>{ x.fillStyle='#bdb8ae'; x.fillRect(0,0,s,s);
    speckle(x,s,r,w,700,['#a9a49a','#cfcac0','#9c978d','#d8d3c9'],.4,1.1,.6);
    x.strokeStyle='rgba(90,85,78,.35)'; x.lineWidth=1; for(let i=0;i<=2;i++){ x.beginPath(); x.moveTo(0,i*s/2+.5); x.lineTo(s,i*s/2+.5); x.moveTo(i*s/2+.5,0); x.lineTo(i*s/2+.5,s); x.stroke(); }   // slab joints
    speckle(x,s,r,w,4,['#8f8a80'],4,9,.18); });                                                                              // oil stains
  tex('tx-pitch',128,17,(x,s,r,w)=>{ for(let i=0;i<4;i++){ x.fillStyle=i%2?'#6fae4a':'#7dbb55'; x.fillRect(0,i*s/4,s,s/4); }
    blades(x,s,r,w,200,['#5f9c3d','#95cb6d'],3); });
  tex('tx-cemetery',128,18,(x,s,r,w)=>{ x.fillStyle='#93bd66'; x.fillRect(0,0,s,s); blades(x,s,r,w,220,['#7fac55','#a8cf7c'],3.5);
    for(let row=0;row<4;row++) for(let col=0;col<5;col++){ const px=10+col*25+(row%2)*8, py=14+row*32; x.fillStyle='#8d9199'; x.fillRect(px,py,7,4); x.fillStyle='#b8bcc3'; x.fillRect(px,py,7,1.5); } });
  tex('tx-water',128,19,(x,s,r,w)=>{ x.clearRect(0,0,s,s); x.lineCap='round';
    for(let i=0;i<22;i++){ const px=r()*s, py=r()*s, l=8+r()*18; w(()=>{ x.globalAlpha=.55; x.strokeStyle=r()<.5?'#ffffff':'#cfe8fb'; x.lineWidth=1.3;
      x.beginPath(); x.moveTo(px,py); x.quadraticCurveTo(px+l/2,py-2.5,px+l,py); x.stroke(); }); } x.globalAlpha=1; });
  tex('tx-asphalt',64,20,(x,s,r,w)=>{ x.fillStyle='#6b6e73'; x.fillRect(0,0,s,s);
    speckle(x,s,r,w,420,['#5a5d62','#7d8085','#4c4f54','#8a8d91'],.4,1,.7); speckle(x,s,r,w,3,['#50535a'],3,7,.25); });
}

// which texture goes on which kind of ground (OpenMapTiles classes)
const LANDCOVER=['match',['get','class'],'grass','tx-grass','wood','tx-wood','sand','tx-sand','wetland','tx-wet','none'];
const LANDUSE=['match',['get','class'],'residential','tx-lawn',['commercial','retail','industrial','railway','garages','parking'],'tx-paved',
  ['pitch','track','stadium'],'tx-pitch','cemetery','tx-cemetery',['school','college','university','hospital','playground','park'],'tx-grass','none'];
const TXLAYERS=[];

function addTextureLayers(){
  const src=srcName(), all=map.getStyle().layers, ids=all.map(l=>l.id);
  const firstRoad=(all.find(l=>l['source-layer']==='transportation')||{}).id;
  const before=firstRoad&&map.getLayer(firstRoad)?firstRoad:undefined;
  const vis=POWER?'none':'visible';
  const add=(l,b)=>{ if(map.getLayer(l.id)) return; l.layout=Object.assign({visibility:vis},l.layout||{}); map.addLayer(l,b); TXLAYERS.push(l.id); };
  safe('tx-ground',()=>{
    add({id:'tx-landuse',type:'fill',source:src,'source-layer':'landuse',minzoom:13,filter:['!=',LANDUSE,'none'],paint:{'fill-pattern':LANDUSE,'fill-opacity':.85}},before);
    add({id:'tx-park',type:'fill',source:src,'source-layer':'park',minzoom:13,paint:{'fill-pattern':'tx-grass','fill-opacity':.85}},before);
    add({id:'tx-landcover',type:'fill',source:src,'source-layer':'landcover',minzoom:13,filter:['!=',LANDCOVER,'none'],paint:{'fill-pattern':LANDCOVER,'fill-opacity':.9}},before);
  });
  // ripples just above the water fill, under the shoreline
  safe('tx-water',()=>{ if(!map.getLayer('water')) return;
    const i=ids.indexOf('water'), next=map.getLayer('water-shore')?'water-shore':(ids[i+1]&&map.getLayer(ids[i+1])?ids[i+1]:undefined);
    add({id:'tx-water',type:'fill',source:src,'source-layer':'water',minzoom:13,paint:{'fill-pattern':'tx-water','fill-opacity':.5}},next); });
  // asphalt grain on every drivable road, matching the style's own width, drawn right above each road
  safe('tx-asphalt',()=>{
    const cur=map.getStyle().layers.map(l=>l.id);
    all.filter(l=>l['source-layer']==='transportation'&&l.type==='line'&&l.paint&&l.paint['line-width']&&!l.paint['line-dasharray']&&
        !/casing|rail|path|pedestrian|arrow|tunnel|ferry|aeroway|pier|transit|cable|track|shadow/.test(l.id)&&
        !/^(mk|tx|sg|nav|trail|lu|lc)-/.test(l.id))                    // only the style's own roads, not our markings
      .forEach(l=>{ const i=cur.indexOf(l.id), next=cur[i+1];
        const c={id:'tx-asph-'+l.id,type:'line',source:l.source,'source-layer':l['source-layer'],minzoom:Math.max(l.minzoom||0,14),
          layout:{'line-cap':(l.layout&&l.layout['line-cap'])||'butt','line-join':'round'},paint:{'line-pattern':'tx-asphalt','line-width':l.paint['line-width'],'line-opacity':.45}};
        if(l.filter) c.filter=l.filter; if(l.maxzoom) c.maxzoom=l.maxzoom;
        add(c,next&&map.getLayer(next)?next:undefined); });
  });
}

// buildings: a mix of siding and brick colours for houses, stone and concrete mid-rise, blue-grey glass towers
function colourBuildings(){
  const H=['coalesce',['get','render_height'],['get','height'],6], n=['%',['abs',['to-number',['id'],0]],8];
  const col=['case',
    ['<=',H,12],['match',n,0,'#e9dcc4',1,'#d7c2a3',2,'#f2eee6',3,'#b9735c',4,'#c9b99f',5,'#a9b4bf',6,'#e3d3b6','#cfc2ae'],
    ['<=',H,30],['match',['%',n,4],0,'#c8c4bc',1,'#b3b8be',2,'#d2c8b5','#bdb7ad'],
    ['match',['%',n,2],0,'#9fb3c6','#8b9fb2']];
  for(const id of ['building-3d','rebuilt-3d']) safe('bcolour',()=>{ if(map.getLayer(id)) map.setPaintProperty(id,'fill-extrusion-color',col); });
}

function setVisible(on){ for(const id of TXLAYERS) safe('tx-vis',()=>{ if(map.getLayer(id)) map.setLayoutProperty(id,'visibility',on?'visible':'none'); }); }
const prev=window.onPowerChange;
window.onPowerChange=(on)=>{ if(prev) prev(on); setVisible(!on); };

onReady(function textures(){ makeTextures(); addTextureLayers(); colourBuildings(); });
})();
