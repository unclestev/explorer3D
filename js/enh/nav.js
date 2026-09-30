/* Tap-to-route navigation and the breadcrumb trail. */
(()=>{
'use strict';
const {ENH,EMPTY,PXM,UNDER,mz,mzE,safe,addUnder,srcName,img,addImg,onReady,onTick,psd,polyDist,segX,abbr,post,octa,rrect,ISZ,BILL}=YD;

/* ---------- 3. TAP-TO-ROUTE NAVIGATION + BREADCRUMB TRAIL ---------- */
const NAV={dest:null,pts:null,cum:null,steps:[],idx:0,off:0,lastReq:0,busy:false,arrT:0,drawAt:null,total:0};
const navEl=document.getElementById('nav'), navArrowEl=document.getElementById('navArrow'), navDistEl=document.getElementById('navDist'), navStreetEl=document.getElementById('navStreet');
function fmtDist(m){ const mi=m/1609.344; if(mi<.1) return Math.max(50,Math.round(m*3.281/50)*50)+' ft'; return (mi<10?mi.toFixed(1):Math.round(mi))+' mi'; }
function arrowFor(s){ if(s.type==='arrive') return '⚑'; if(/roundabout|rotary/.test(s.type)) return '↻';
  return {'left':'←','right':'→','slight left':'↖','slight right':'↗','sharp left':'↙','sharp right':'↘','uturn':'↶','straight':'↑'}[s.mod]||'↑'; }
function instr(s){
  const road=s.name||s.ref, onto=road?' onto '+abbr(road):'', m=s.mod||'', side=m.includes('left')?'left':m.includes('right')?'right':'';
  switch(s.type){
    case 'arrive': return 'Arrive at your destination';
    case 'roundabout': case 'rotary': case 'roundabout turn': return 'Roundabout'+(s.exit?', exit '+s.exit:'')+onto;
    case 'merge': return 'Merge'+(side?' '+side:'')+onto;
    case 'on ramp': return 'Take the ramp'+(side?' on the '+side:'')+onto;
    case 'off ramp': return 'Take the exit'+(side?' on the '+side:'')+onto;
    case 'fork': return 'Keep '+(side||'straight')+onto;
    case 'continue': case 'new name': if(!side) return 'Continue'+(road?' on '+abbr(road):''); }
  if(m==='uturn') return 'Make a U-turn'+onto; if(m==='straight') return 'Continue straight'+onto;
  if(m.startsWith('slight')) return 'Bear '+side+onto; if(m.startsWith('sharp')) return 'Sharp '+side+onto;
  return 'Turn '+(side||'')+onto; }
function setBanner(a,d,t){ if(navArrowEl.textContent!==a) navArrowEl.textContent=a; if(navDistEl.textContent!==d) navDistEl.textContent=d; if(navStreetEl.textContent!==t) navStreetEl.textContent=t; }
function setLine(id,coords){ const s=map.getSource(id); if(s) s.setData(coords&&coords.length>1?{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}:EMPTY);
  const m=ENH.miniOk&&mini.getSource(id); if(m) m.setData(coords&&coords.length>1?{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}:EMPTY); }
function setDest(p){ const d=p?{type:'Feature',properties:{},geometry:{type:'Point',coordinates:p}}:EMPTY;
  const s=map.getSource('nav-dest'); if(s) s.setData(d); const m=ENH.miniOk&&mini.getSource('nav-dest'); if(m) m.setData(d); }
function clearRoute(){ Object.assign(NAV,{dest:null,pts:null,steps:[],coords:null,arrT:0,off:0,drawAt:null}); navEl.classList.remove('on'); setLine('nav-route',null); setDest(null); }
function setRoute(rt){
  const c=rt.geometry.coordinates, pts=c.map(p=>[p[0]*MLNG,p[1]*MLAT]), cum=[0];
  for(let i=1;i<pts.length;i++) cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  const steps=[]; let vi=0;
  for(const lg of rt.legs||[]) for(const s of lg.steps||[]){ const m=s.maneuver||{}, L=m.location; if(!L) continue;
    const lx=L[0]*MLNG, ly=L[1]*MLAT; let best=vi, bd=1e18;
    for(let i=vi;i<pts.length;i++){ const d=Math.hypot(pts[i][0]-lx,pts[i][1]-ly); if(d<bd){ bd=d; best=i; } if(d<.5) break; }
    vi=best; steps.push({at:cum[best],type:m.type,mod:m.modifier||'',exit:m.exit,name:s.name||'',ref:s.ref||''}); }
  Object.assign(NAV,{coords:c,pts,cum,steps,idx:0,off:0,total:cum[cum.length-1],arrT:0,drawAt:null});
  setDest(c[c.length-1]); setLine('nav-route',c); navEl.classList.add('on'); navTick();
}
async function requestRoute(re){
  if(NAV.busy||!NAV.dest) return; NAV.busy=true; NAV.lastReq=Date.now();
  toast(re?'Rerouting…':'Finding a route…',1400);
  const h=((S.hdg%360)+360)%360, bear=Math.abs(S.v)>2?`&bearings=${Math.round(h)},80;`:'';
  const url=`https://router.project-osrm.org/route/v1/driving/${S.lng.toFixed(6)},${S.lat.toFixed(6)};${NAV.dest[0].toFixed(6)},${NAV.dest[1].toFixed(6)}?overview=full&geometries=geojson&steps=true${bear}`;
  const ctl=new AbortController(), to=setTimeout(()=>ctl.abort(),10000);
  try{ const r=await fetch(url,{signal:ctl.signal}); const j=await r.json();
    if(j.code!=='Ok'||!j.routes||!j.routes[0]) throw new Error(j.message||j.code||'no route');
    const rt=j.routes[0]; setRoute(rt);
    if(!re) toast(fmtDist(rt.distance)+' · about '+Math.max(1,Math.round(rt.duration/60))+' min drive',2600);
  }catch(e){ console.warn('route',e); toast(re?'Could not reroute, keeping the old route':'No route found to there',2200); if(!re) clearRoute(); }
  finally{ clearTimeout(to); NAV.busy=false; }
}
function navTick(){
  if(!NAV.pts) return;
  const x=S.lng*MLNG, y=S.lat*MLAT, P=NAV.pts; let bi=NAV.idx, bd=1e18, bt=0;
  const scan=(a,b)=>{ for(let i=a;i<b;i++){ const [d,t]=psd(x,y,P[i][0],P[i][1],P[i+1][0],P[i+1][1]); if(d<bd){ bd=d; bi=i; bt=t; } } };
  scan(Math.max(0,NAV.idx-3),Math.min(P.length-1,NAV.idx+150)); if(bd>60) scan(0,P.length-1);
  NAV.idx=bi; const along=NAV.cum[bi]+bt*(NAV.cum[bi+1]-NAV.cum[bi]);
  if(NAV.total-along<30&&bd<60){                                 // arrived
    if(!NAV.arrT){ NAV.arrT=Date.now(); toast('⚑ You have arrived',3000); setBanner('⚑','Arrived',''); }
    else if(Date.now()-NAV.arrT>4000) clearRoute();
    return; }
  if(bd>45&&mode!=='glider'){ NAV.off+=.2; if(NAV.off>2.5&&Date.now()-NAV.lastReq>6000){ NAV.off=0; requestRoute(true); } } else NAV.off=0;
  const nx=NAV.steps.find((s,k)=>k>0&&s.at>along+3)||NAV.steps[NAV.steps.length-1];
  if(nx) setBanner(arrowFor(nx),fmtDist(Math.max(0,nx.at-along)),instr(nx));
  if(NAV.drawAt==null||Math.abs(along-NAV.drawAt)>15){           // only draw what's still ahead
    NAV.drawAt=along; const c=NAV.coords, a=c[bi], b=c[bi+1];
    setLine('nav-route',[[a[0]+(b[0]-a[0])*bt,a[1]+(b[1]-a[1])*bt]].concat(c.slice(bi+1))); }
}
onTick(200,navTick);
document.getElementById('navX').addEventListener('click',e=>{ e.stopPropagation(); clearRoute(); toast('Route cleared',1400); });
mapEl.addEventListener('click',e=>{
  if(mode==='glider'||!ENH.booted) return;
  const r=mapEl.getBoundingClientRect(); let ll=null;
  try{ ll=map.unproject([e.clientX-r.left,e.clientY-r.top]); }catch(_){}
  if(!ll||!isFinite(ll.lng)||!isFinite(ll.lat)||meters(S.lat,S.lng,ll.lat,ll.lng)>40000){ toast('Tap a spot on the ground to route there',1800); return; }
  NAV.dest=[ll.lng,ll.lat]; setDest(NAV.dest); requestRoute(false);
});

// breadcrumb trail of where you've driven (kept between visits on this device)
const TRAIL={segs:[[]],n:0,changed:false,saved:0};
try{ const t=JSON.parse(localStorage.getItem('ydTrail')||'null'); if(Array.isArray(t)){ TRAIL.segs=t.filter(s=>Array.isArray(s)&&s.length>1); TRAIL.segs.push([]); TRAIL.n=TRAIL.segs.reduce((a,s)=>a+s.length,0); } }catch(e){}
function trailData(){ const lines=TRAIL.segs.filter(s=>s.length>1); return lines.length?{type:'Feature',properties:{},geometry:{type:'MultiLineString',coordinates:lines}}:EMPTY; }
onTick(500,function trailTick(){
  const cur=TRAIL.segs[TRAIL.segs.length-1], last=cur[cur.length-1], p=[+S.lng.toFixed(6),+S.lat.toFixed(6)];
  const d=last?meters(last[1],last[0],p[1],p[0]):1e9;
  if(last&&d<8) return;
  if(last&&d>400){ TRAIL.segs.push([p]); } else cur.push(p);     // a jump starts a new line instead of drawing across the map
  TRAIL.n++; TRAIL.changed=true;
  while(TRAIL.n>5000&&TRAIL.segs.length){ const s=TRAIL.segs[0]; s.shift(); TRAIL.n--; if(s.length<2&&TRAIL.segs.length>1){ TRAIL.n-=s.length; TRAIL.segs.shift(); } }
});
onTick(1000,function trailDraw(){
  if(!TRAIL.changed) return; TRAIL.changed=false; const d=trailData();
  const s=map.getSource('trail'); if(s) s.setData(d); const m=ENH.miniOk&&mini.getSource('trail'); if(m) m.setData(d);
  if(Date.now()-TRAIL.saved>15000){ TRAIL.saved=Date.now(); try{ localStorage.setItem('ydTrail',JSON.stringify(TRAIL.segs.filter(s=>s.length>1))); }catch(e){} }
});
onReady(function navLayers(){
  addImg('sg-chev',img(32,32,(x)=>{ x.strokeStyle='#fff'; x.lineWidth=5; x.lineCap='round'; x.lineJoin='round'; x.beginPath(); x.moveTo(10,7); x.lineTo(22,16); x.lineTo(10,25); x.stroke(); }));
  addImg('sg-flag',img(64,128,(x,w,h)=>{ post(x,w,h,6); for(let r=0;r<4;r++) for(let c=0;c<6;c++){ x.fillStyle=(r+c)%2?'#111':'#fff'; x.fillRect(34+c*4.5,6+r*6,4.5,6); }
    x.strokeStyle='#111'; x.lineWidth=1; x.strokeRect(34,6,27,24); }));
  map.addSource('trail',{type:'geojson',data:trailData()});
  map.addSource('nav-route',{type:'geojson',data:EMPTY});
  map.addSource('nav-dest',{type:'geojson',data:EMPTY});
  addUnder({id:'trail-line',type:'line',source:'trail',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#c084fc','line-opacity':.55,'line-width':mz(1.2,1.5)}});
  addUnder({id:'nav-casing',type:'line',source:'nav-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#1e3a8a','line-opacity':.85,'line-width':mz(4.2,6)}});
  addUnder({id:'nav-line',type:'line',source:'nav-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#3b82f6','line-width':mz(3,4)}});
  addUnder({id:'nav-chev',type:'symbol',source:'nav-route',layout:{'symbol-placement':'line','symbol-spacing':70,'icon-image':'sg-chev',
    'icon-size':['interpolate',['linear'],['zoom'],14,.35,19,.6,22,1.1],'icon-allow-overlap':true,'icon-ignore-placement':true,'icon-rotation-alignment':'map','icon-pitch-alignment':'map'}});
  map.addLayer({id:'nav-flag',type:'symbol',source:'nav-dest',layout:Object.assign({'icon-image':'sg-flag','icon-size':ISZ},BILL)});
  setTimeout(()=>{ try{ if(!localStorage.getItem('ydNavTip')){ localStorage.setItem('ydNavTip','1'); toast('Tip: tap anywhere on the map to get directions there',4500); } }catch(e){} },9000);
});
// same route, destination and trail on the round minimap
onTick(1000,function miniNav(){
  if(ENH.miniOk||!mini||!miniReady) return;
  try{ if(!mini.isStyleLoaded()) return;
    mini.addSource('trail',{type:'geojson',data:trailData()}); mini.addSource('nav-route',{type:'geojson',data:EMPTY}); mini.addSource('nav-dest',{type:'geojson',data:EMPTY});
    mini.addLayer({id:'trail-line',type:'line',source:'trail',paint:{'line-color':'#a855f7','line-opacity':.6,'line-width':2}});
    mini.addLayer({id:'nav-line',type:'line',source:'nav-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#2563eb','line-width':4}});
    mini.addLayer({id:'nav-dest',type:'circle',source:'nav-dest',paint:{'circle-radius':5,'circle-color':'#111','circle-stroke-color':'#fff','circle-stroke-width':2}});
    ENH.miniOk=true; if(NAV.coords) setLine('nav-route',NAV.coords.slice(NAV.idx)); if(NAV.dest) setDest(NAV.coords?NAV.coords[NAV.coords.length-1]:NAV.dest);
  }catch(e){ console.warn('mini nav',e); ENH.miniOk=true; }
});
Object.assign(YD,{NAV,setRoute,requestRoute,clearRoute,setDest,fmtDist});
})();
