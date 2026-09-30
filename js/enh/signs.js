/* Street signs, stop signs, traffic lights, rail crossings and speed limits. */
(()=>{
'use strict';
const {ENH,EMPTY,PXM,UNDER,mz,mzE,safe,addUnder,srcName,img,addImg,onReady,onTick,psd,polyDist,segX,abbr,post,octa,rrect,ISZ,BILL}=YD;

/* ---------- 2. STREET SIGNS, STOP SIGNS, TRAFFIC LIGHTS, RAIL CROSSINGS, SPEED LIMITS ---------- */
// OpenStreetMap data via Overpass (same servers as the water towers), refreshed as you drive
const OX={at:null,busy:false,failT:0,stops:[],sigs:[],xings:[],speeds:[]};
const EST={motorway:65,trunk:55,primary:45,secondary:40,tertiary:35,minor:30,service:15,track:10};   // Illinois-style defaults when a road has no posted limit in OSM
function parseMph(v){ const m=/(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh|kph)?/i.exec(String(v||'')); if(!m) return null;
  const n=+m[1]; if(!n) return null; return /mph/i.test(m[2]||'')?Math.round(n):Math.round(n*.621371/5)*5; }   // OSM default unit is km/h
async function loadExtras(){
  if(OX.busy) return; OX.busy=true;
  const cx=S.lng, cy=S.lat, dy=.02, dx=.027;                     // ~4.4 km square around the car
  const bb=`(${(cy-dy).toFixed(4)},${(cx-dx).toFixed(4)},${(cy+dy).toFixed(4)},${(cx+dx).toFixed(4)})`;
  const q=`[out:json][timeout:25];(node["highway"~"^(stop|traffic_signals)$"]${bb};node["railway"="level_crossing"]${bb};way["highway"]["maxspeed"]${bb};);out geom qt;`;
  let j=null;
  try{
    for(const url of OVERPASS){ try{ const r=await fetch(url,{method:'POST',body:'data='+encodeURIComponent(q),headers:{'Content-Type':'application/x-www-form-urlencoded'}});
      if(r.ok){ j=await r.json(); break; } }catch(e){} }
    if(!j){ OX.failT=Date.now(); OX.at=[cx,cy]; return; }
    const stops=[],sigs=[],xings=[],speeds=[], seen=new Set();
    for(const el of j.elements||[]){ const t=el.tags||{};
      if(el.type==='node'&&el.lat!=null){ const o={id:el.id,x:el.lon*MLNG,y:el.lat*MLAT};
        const k=t.highway==='stop'?'s':t.highway==='traffic_signals'?'g':t.railway==='level_crossing'?'x':''; if(!k) continue;
        const key=k+Math.round(o.x/12)+','+Math.round(o.y/12); if(seen.has(key)) continue; seen.add(key);   // one per ~12 m
        (k==='s'?stops:k==='g'?sigs:xings).push(o); }
      else if(el.type==='way'&&el.geometry){ const mph=parseMph(t.maxspeed); if(!mph) continue;
        const pts=el.geometry.filter(Boolean).map(g=>[g.lon*MLNG,g.lat*MLAT]); if(pts.length<2) continue;
        speeds.push({mph,name:t.name||'',pts,bb:bboxOf(pts)}); } }
    Object.assign(OX,{stops,sigs,xings,speeds,at:[cx,cy],failT:0}); ENH.signsDirty=true;
  }catch(e){ console.warn('osm extras',e); OX.failT=Date.now(); OX.at=[cx,cy]; }
  finally{ OX.busy=false; }
}
onTick(2000,function extrasTick(){
  if(OX.busy) return;
  const moved=OX.at?meters(OX.at[1],OX.at[0],S.lat,S.lng):1e9;
  if(moved>1300 || (OX.failT && Date.now()-OX.failT>90000)) loadExtras();
});

// street-name blades at intersections, found from where differently named roads cross in the map's own data
let blades=[], bladeAt=null;
function computeBlades(){
  const cx=S.lng*MLNG, cy=S.lat*MLAT, R=420, segs=[];
  let feats=[]; try{ feats=map.querySourceFeatures(srcName(),{sourceLayer:'transportation_name'}); }catch(e){}
  for(const f of feats){ const p=f.properties||{}, nm=p.name||p['name:latin']||p.ref; if(!nm) continue;
    if(/^(path|track|service|footway|cycleway|pedestrian|bridleway|steps|rail|transit)$/.test(p.class||'')) continue;
    const g=f.geometry, lines=!g?[]:g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
    for(const ln of lines) for(let i=1;i<ln.length;i++){
      const ax=ln[i-1][0]*MLNG, ay=ln[i-1][1]*MLAT, bx=ln[i][0]*MLNG, by=ln[i][1]*MLAT;
      if(Math.max(ax,bx)<cx-R||Math.min(ax,bx)>cx+R||Math.max(ay,by)<cy-R||Math.min(ay,by)>cy+R) continue;
      segs.push([ax,ay,bx,by,nm]); }
    if(segs.length>8000) break; }
  const C=50, grid=new Map();
  segs.forEach((s,k)=>{ for(let i=Math.floor(Math.min(s[0],s[2])/C);i<=Math.floor(Math.max(s[0],s[2])/C);i++)
    for(let j=Math.floor(Math.min(s[1],s[3])/C);j<=Math.floor(Math.max(s[1],s[3])/C);j++){ const kk=i+','+j; let a=grid.get(kk); if(!a) grid.set(kk,a=[]); a.push(k); } });
  const out=[];
  for(const list of grid.values()) for(let a=0;a<list.length;a++) for(let b=a+1;b<list.length;b++){
    const s=segs[list[a]], t=segs[list[b]]; if(s[4]===t[4]) continue;
    const p=segX(s,t); if(!p) continue;
    const names=[s[4],t[4]].sort(), key=names.join('|');
    if(out.some(o=>o.key===key&&Math.hypot(o.x-p[0],o.y-p[1])<40)) continue;
    out.push({key,x:p[0],y:p[1],names}); }
  out.sort((a,b)=>Math.hypot(a.x-cx,a.y-cy)-Math.hypot(b.x-cx,b.y-cy));
  blades=out.slice(0,50); bladeAt=[S.lng,S.lat]; ENH.signsDirty=true;
}
// drop signs a few metres off to a corner so they stand beside the road, not in it
function buildSigns(){
  const src=map.getSource('enh-signs'); if(!src) return;
  const cx=S.lng*MLNG, cy=S.lat*MLAT, R=450, F=[], near=o=>Math.hypot(o.x-cx,o.y-cy)<R;
  const pt=(x,y,props)=>F.push({type:'Feature',properties:props,geometry:{type:'Point',coordinates:[x/MLNG,y/MLAT]}});
  for(const o of OX.stops) if(near(o)) pt(o.x+3,o.y-3,{k:'stop'});
  for(const o of OX.sigs) if(near(o)) pt(o.x-6,o.y-6,{k:'sig',ph:hash(Math.round(o.x/60),Math.round(o.y/60))<.5?0:1});
  for(const o of OX.xings) if(near(o)) pt(o.x+4,o.y+4,{k:'xing'});
  for(const b of blades) if(near(b)){ pt(b.x+5,b.y+5,{k:'post'}); pt(b.x+5,b.y+5,{k:'blade',name:b.names.map(abbr).join('\n')}); }
  src.setData({type:'FeatureCollection',features:F}); ENH.signsAt=[S.lng,S.lat]; ENH.signsDirty=false;
}
function signImages(){
  addImg('sg-stop',img(64,128,(x,w,h)=>{ post(x,w,h,40); octa(x,32,27,26); x.fillStyle='#fff'; x.fill(); octa(x,32,27,22.5); x.fillStyle='#c8102e'; x.fill();
    x.fillStyle='#fff'; x.font='bold 14px sans-serif'; x.textAlign='center'; x.textBaseline='middle'; x.fillText('STOP',32,28); }));
  for(const on of ['r','y','g']) addImg('sg-sig-'+on,img(48,160,(x,w,h)=>{ post(x,w,h,70);
    rrect(x,11,3,26,70,6); x.fillStyle='#facc15'; x.fill(); rrect(x,14,6,20,64,5); x.fillStyle='#1f2937'; x.fill();
    [['r',17,'#ef4444'],['y',38,'#fbbf24'],['g',59,'#22c55e']].forEach(([k,y,c])=>{ x.beginPath(); x.arc(24,y,8,0,7);
      if(k===on){ x.shadowColor=c; x.shadowBlur=12; x.fillStyle=c; } else { x.shadowBlur=0; x.fillStyle='#3b4452'; } x.fill(); x.shadowBlur=0; }); }));
  addImg('sg-xing',img(96,128,(x,w,h)=>{ post(x,w,h,48);
    for(const [a,t] of [[.6,'RAILROAD'],[-.6,'CROSSING']]){ x.save(); x.translate(48,32); x.rotate(a); x.fillStyle='#111'; x.fillRect(-45,-9,90,18);
      x.fillStyle='#fff'; x.fillRect(-43,-7,86,14); x.fillStyle='#111'; x.font='bold 10px sans-serif'; x.textAlign='center'; x.textBaseline='middle'; x.fillText(t,0,1); x.restore(); } }));
  addImg('sg-post',img(12,128,(x,w,h)=>post(x,w,h,0)));
  addImg('sg-blade',img(24,24,(x)=>{ rrect(x,0,0,24,24,4); x.fillStyle='#fff'; x.fill(); rrect(x,2,2,20,20,3); x.fillStyle='#0f7a3d'; x.fill(); }),
    {stretchX:[[6,18]],stretchY:[[6,18]],content:[5,5,19,19]});
}
const sigImg=(a,b)=>['match',['get','k'],'stop','sg-stop','xing','sg-xing','post','sg-post',['match',['get','ph'],0,'sg-sig-'+a,'sg-sig-'+b]];
onReady(function signLayers(){
  signImages();
  map.addSource('enh-signs',{type:'geojson',data:EMPTY});
  map.addLayer({id:'sg-icons',type:'symbol',source:'enh-signs',minzoom:15,filter:['in',['get','k'],['literal',['stop','sig','xing','post']]],
    layout:Object.assign({'icon-image':sigImg('g','r'),'icon-size':ISZ},BILL)});
  map.addLayer({id:'sg-blades',type:'symbol',source:'enh-signs',minzoom:15,filter:['==',['get','k'],'blade'],
    layout:Object.assign({},BILL,{'icon-anchor':'center','icon-image':'sg-blade','icon-text-fit':'both','icon-text-fit-padding':[3,6,3,6],
      'text-field':['get','name'],'text-font':['Noto Sans Bold'],'text-size':['interpolate',['linear'],['zoom'],15,5,17,8,19.3,11,22,22],
      'text-line-height':1.3,'text-anchor':'bottom','text-allow-overlap':true,'text-ignore-placement':true,
      'text-pitch-alignment':'viewport','text-rotation-alignment':'viewport',
      'text-offset':['interpolate',['linear'],['zoom'],15,['literal',[0,-4]],17,['literal',[0,-3.8]],19.3,['literal',[0,-4.3]],22,['literal',[0,-5.5]]]}),
    paint:{'text-color':'#ffffff'}});
  // new map tiles may reveal more intersections
  map.on('sourcedata',e=>{ if(e.sourceId===srcName()&&e.tile){ clearTimeout(ENH.bT); ENH.bT=setTimeout(()=>{ ENH.bladesStale=true; },800); } });
});
onTick(1000,function signsTick(){
  if(!map.getSource('enh-signs')) return;
  const bMoved=bladeAt?meters(bladeAt[1],bladeAt[0],S.lat,S.lng):1e9, bAge=Date.now()-(ENH.bladeT||0);
  if(bMoved>(POWER?250:120) || (ENH.bladesStale && bAge>(POWER?20000:6000) && bMoved>30)){ ENH.bladesStale=false; ENH.bladeT=Date.now(); computeBlades(); }
  if(ENH.signsDirty || !ENH.signsAt || meters(ENH.signsAt[1],ENH.signsAt[0],S.lat,S.lng)>(POWER?250:150)) buildSigns();
});
// traffic lights cycle: 12 s green, 3 s yellow, 15 s red; opposite phase for the cross street
onTick(500,function signalTick(){
  if(!map.getLayer('sg-icons')||!OX.sigs.length) return;
  const t=(Date.now()/1000)%30, a=t<12?'g':t<15?'y':'r', b=t<15?'r':t<27?'g':'y';
  if(a+b===ENH.sigKey) return; ENH.sigKey=a+b; map.setLayoutProperty('sg-icons','icon-image',sigImg(a,b));
});
// rail crossings: a bump as you cross (checked along the path travelled, so it can't be skipped at speed) and a heads-up
onTick(100,function xingTick(){
  const x=S.lng*MLNG, y=S.lat*MLAT, p=ENH.prevXY||[x,y]; ENH.prevXY=[x,y];
  if(!OX.xings.length||mode==='glider'||mode==='boat') return;
  const sp=Math.abs(S.v), now=Date.now(), hx=Math.sin(rad(S.hdg)), hy=Math.cos(rad(S.hdg));
  for(const o of OX.xings){
    const dx=o.x-x, dy=o.y-y, d=Math.hypot(dx,dy);
    if(d>400){ o.warned=false; continue; }
    if(sp>2 && now-(o.bump||0)>4000 && psd(o.x,o.y,p[0],p[1],x,y)[0]<7){
      o.bump=now; S.pitch-=Math.min(.12,.03+sp*.004); shake=Math.max(shake,.25+Math.min(.4,sp*.01)); dirty=true; }
    if(!o.warned && d<220 && d>15 && sp>3 && (dx*hx+dy*hy)/d>.85){ o.warned=true; toast('⚠ Railroad crossing ahead',2200); }
  }
});
// speed limit for the road under the car (posted limit from OSM, else a default for that kind of road)
const limEl=document.getElementById('lim'), limNum=limEl&&limEl.querySelector('b');
function roadClassHere(){ try{ const p=map.project([S.lng,S.lat]); const f=(hitRoad(p.x,p.y,6)||[]).find(f=>f.properties&&EST[f.properties.class]); return f?f.properties.class:null; }catch(e){ return null; } }
onTick(400,function speedTick(){
  if(!limEl) return;
  let lim=null, est=false;
  if(mode==='car'&&onRoad){
    const x=S.lng*MLNG, y=S.lat*MLAT; let best=18, bw=null;
    for(const w of OX.speeds){ if(x<w.bb[0]-25||x>w.bb[2]+25||y<w.bb[1]-25||y>w.bb[3]+25) continue;
      let d=polyDist(w.pts,x,y); if(roadName&&w.name===roadName) d-=6; if(d<best){ best=d; bw=w; } }
    if(bw) lim=bw.mph; else { const c=roadClassHere(); if(c){ lim=EST[c]; est=true; } } }
  YD.limit=lim;                                                   // autopilot drives to this
  limEl.classList.toggle('on',lim!=null); limEl.classList.toggle('est',est);
  if(lim!=null&&limNum.textContent!==String(lim)) limNum.textContent=lim;
  limEl.title=est?'Typical limit for this road (not posted in map data)':'Posted speed limit';
  mphEl.classList.toggle('fast',lim!=null&&Math.abs(S.v)*2.237>lim+5);
});
Object.assign(YD,{OX});
})();
