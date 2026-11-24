/* Parking lots (owner 2026-11-23: "can you make the parking lot visible?"). The map tiles (OpenFreeMap / OpenMapTiles)
   don't carry parking-lot outlines at all — only a 🅿 point — so lots looked like lawn. This asks OpenStreetMap's Overpass
   servers (the same mirrors as the water towers and signs, game.js ovFetch) for the surface lots within ~2.5 km of the
   car, draws them as dark asphalt with painted stalls (the tx-parking texture, js/enh/textures.js) and a light curb line,
   just under the roads, so they show in the chase view and from the driver's seat. Asks again after ~1.5 km of driving.
   Underground, multi-storey and rooftop parking is left out (it's a building or under one). The tyres feel a lot too
   (js/enh/feel.js asks PARKING.at). The last answer for an area is kept on this device for when the servers are slow.
   Stall lines (owner 2026-11-23: "can we make the parking lots have proper space lines visible?"): real painted lines,
   laid out per lot rather than a repeating picture: 2.75 m wide, 5.4 m deep stalls on both sides of every parking aisle
   the map knows (service=parking_aisle, in the map tiles even when Overpass is slow), and for lots without aisles rows of
   stalls along the lot's long side with 6.6 m aisles between. A stall is only drawn where it lies in the lot (when the
   lot's outline is known), not in a building, and not on another road. Aisles with no known lot get an asphalt pad.
   window.PARKING = {at(lng,lat), state} */
(()=>{
'use strict';
const {onReady,onTick,safe}=YD;
const P={feats:new Map(),polys:[],at:null,busy:false,retry:0,ready:false,lineAt:null,lineT:0,lineKey:'',nLines:0,ms:0};
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

function draw(){ safe('parking draw',()=>{ const s=map.getSource('parking'); if(s) s.setData({type:'FeatureCollection',features:[...P.feats.values()]}); }); P.lineKey=''; P.lineT=0; }

/* ---------- stall lines ---------- */
const SW=2.75, SD=5.4, AH=3.2, AISLE=6.6;                         // stall width / depth, half an aisle, a full aisle (m)
function* stallJob(){                                            // spread over frames by the tick below (a few ms at a time)
  const t0=performance.now(), R=650, lat0=S.lat, lng0=S.lng, kx=111320*Math.cos(lat0*Math.PI/180), ky=111320;
  const L=(lng,lat)=>[(lng-lng0)*kx,(lat-lat0)*ky], G=(x,y)=>[+(lng0+x/kx).toFixed(7),+(lat0+y/ky).toFixed(7)];
  let tf=[], bf=[]; try{ tf=map.querySourceFeatures(bSrc,{sourceLayer:'transportation'}); bf=map.querySourceFeatures(bSrc,{sourceLayer:'building'}); }catch(e){ return; }
  const lines=f=>{ const g=f.geometry; return !g?[]:g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[]; };
  // aisles, and the other roads (stalls stay off them), in local metres
  const aisles=[], roads=[], seen=new Set();
  let nf=0;
  for(const f of tf){ if(++nf%150===0) yield; const pr=f.properties||{}, cl=pr.class||''; if(/^(path|rail|transit|ferry|pier|aerialway|bridge)/.test(cl)) continue;
    const isA=cl==='service'&&pr.service==='parking_aisle';
    for(const l of lines(f)) for(let i=1;i<l.length;i++){ const a=L(l[i-1][0],l[i-1][1]), b=L(l[i][0],l[i][1]);
      if(Math.min(Math.abs(a[0]),Math.abs(b[0]))>R+60||Math.min(Math.abs(a[1]),Math.abs(b[1]))>R+60) continue;
      const k=a[0].toFixed(1)+','+a[1].toFixed(1)+','+b[0].toFixed(1)+','+b[1].toFixed(1); if(seen.has(k)) continue; seen.add(k);
      const s={a,b,len:Math.hypot(b[0]-a[0],b[1]-a[1]),half:isA?AH:cl==='service'?2.6:cl==='minor'?4.5:6}; if(s.len<.3) continue;
      (isA?aisles:roads).push(s); } }
  // road pieces on a 20 m grid (each in every cell its strip touches), so a stall only checks the roads beside it
  const seg=(list)=>{ const g=new Map(); for(const s of list){ const m=s.half+1;
      for(let gx=Math.floor((Math.min(s.a[0],s.b[0])-m)/20);gx<=Math.floor((Math.max(s.a[0],s.b[0])+m)/20);gx++)
        for(let gy=Math.floor((Math.min(s.a[1],s.b[1])-m)/20);gy<=Math.floor((Math.max(s.a[1],s.b[1])+m)/20);gy++){ const k=gx+','+gy; let a=g.get(k); if(!a) g.set(k,a=[]); a.push(s); } }
    return g; };
  yield; const RG=seg(roads), AG=seg(aisles); yield;
  const near=(G,x,y,pad,skip)=>{ for(const s of G.get(Math.floor(x/20)+','+Math.floor(y/20))||[]){ if(s===skip) continue; const dx=s.b[0]-s.a[0], dy=s.b[1]-s.a[1], t=Math.max(0,Math.min(1,((x-s.a[0])*dx+(y-s.a[1])*dy)/(s.len*s.len)));
      if(Math.hypot(s.a[0]+dx*t-x,s.a[1]+dy*t-y)<s.half+pad) return true; } return false; };
  // buildings on a 25 m grid
  const grid=new Map(), gk=(x,y)=>Math.floor(x/25)+','+Math.floor(y/25);
  for(const f of bf){ yield; const g=f.geometry, pls=!g?[]:g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
    for(const pl of pls){ const r=(pl[0]||[]).map(q=>L(q[0],q[1])); if(r.length<4) continue; let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
      for(const q of r){ if(q[0]<x0)x0=q[0]; if(q[0]>x1)x1=q[0]; if(q[1]<y0)y0=q[1]; if(q[1]>y1)y1=q[1]; }
      if(x1<-R||x0>R||y1<-R||y0>R) continue; const o={r,b:[x0,y0,x1,y1]};
      for(let gx=Math.floor(x0/25);gx<=Math.floor(x1/25);gx++) for(let gy=Math.floor(y0/25);gy<=Math.floor(y1/25);gy++){ const k=gx+','+gy; let a=grid.get(k); if(!a) grid.set(k,a=[]); a.push(o); } } }
  yield;
  const inBld=(x,y)=>{ for(const o of grid.get(gk(x,y))||[]){ const b=o.b; if(x<b[0]||x>b[2]||y<b[1]||y>b[3]) continue; if(inRing(o.r,x,y)) return true; } return false; };
  // the lots, in local metres
  const lots=[]; let nl=0; for(const p of P.polys){ if(++nl%60===0) yield; const r0=p.rings[0].map(q=>L(q[0],q[1])); let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
    for(const q of r0){ if(q[0]<x0)x0=q[0]; if(q[0]>x1)x1=q[0]; if(q[1]<y0)y0=q[1]; if(q[1]>y1)y1=q[1]; }
    if(x1<-R||x0>R||y1<-R||y0>R) continue; lots.push({r:r0,holes:p.rings.slice(1).map(h=>h.map(q=>L(q[0],q[1]))),b:[x0,y0,x1,y1],aisle:false}); }
  const lotAt=(x,y)=>{ for(const o of lots){ const b=o.b; if(x<b[0]||x>b[2]||y<b[1]||y>b[3]) continue; if(inRing(o.r,x,y)&&!o.holes.some(h=>inRing(h,x,y))) return o; } return null; };
  const out=[], pads=[], line=(p,q)=>out.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[G(p[0],p[1]),G(q[0],q[1])]}});
  const ok=(p,q,lot)=>{ const m=[(p[0]+q[0])/2,(p[1]+q[1])/2];
    if(lot){ if(lotAt(p[0],p[1])!==lot||lotAt(q[0],q[1])!==lot) return false; }
    return !inBld(p[0],p[1])&&!inBld(q[0],q[1])&&!inBld(m[0],m[1])&&!near(RG,q[0],q[1],.6)&&!near(RG,m[0],m[1],.6); };
  // 1. along the aisles
  let nA=0;
  for(const s of aisles){ if(s.len<SW*2+1||Math.hypot((s.a[0]+s.b[0])/2,(s.a[1]+s.b[1])/2)>R) continue; if(++nA%20===0) yield;
    const ux=(s.b[0]-s.a[0])/s.len, uy=(s.b[1]-s.a[1])/s.len, nx=uy, ny=-ux, mid=[(s.a[0]+s.b[0])/2,(s.a[1]+s.b[1])/2];
    const lot=lotAt(mid[0],mid[1]); if(lot) lot.aisle=true;
    const n=Math.floor((s.len-2)/SW), st=(s.len-n*SW)/2; let any=false;
    for(const side of [1,-1]) for(let k=0;k<=n;k++){ const t=st+k*SW, bx=s.a[0]+ux*t, by=s.a[1]+uy*t;
      const p=[bx+nx*side*AH,by+ny*side*AH], q=[bx+nx*side*(AH+SD),by+ny*side*(AH+SD)];
      if(near(AG,(p[0]+q[0])/2,(p[1]+q[1])/2,.3,s)) continue;   // where another aisle crosses
      if(ok(p,q,lot)){ line(p,q); any=true; } }
    if(any&&!lot){ const w=AH+SD+.3, c=[[-w,-.4],[w,-.4],[w,s.len+.4],[-w,s.len+.4]].map(([o,t])=>G(s.a[0]+ux*t+nx*o,s.a[1]+uy*t+ny*o)); c.push(c[0]);
      pads.push({type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[c]}}); } }
  // 2. lots with no aisle in the map: rows along the long side
  for(const lot of lots){ if(lot.aisle) continue; const r=lot.r.slice(0,-1); if(r.length<3) continue; yield;
    let best=null;
    for(let i=0;i<r.length;i++){ const a=r[i], b=r[(i+1)%r.length], ang=Math.atan2(b[1]-a[1],b[0]-a[0]), c=Math.cos(ang), sn=Math.sin(ang);
      let u0=1e9,u1=-1e9,v0=1e9,v1=-1e9; for(const q of r){ const u=q[0]*c+q[1]*sn, v=-q[0]*sn+q[1]*c; if(u<u0)u0=u; if(u>u1)u1=u; if(v<v0)v0=v; if(v>v1)v1=v; }
      const A=(u1-u0)*(v1-v0); if(!best||A<best.A) best={A,c,sn,u0,u1,v0,v1}; }
    if(!best||best.A<250) continue;
    if(best.u1-best.u0<best.v1-best.v0) best={A:best.A,c:-best.sn,sn:best.c,u0:best.v0,u1:best.v1,v0:-best.u1,v1:-best.u0};   // u: the long side
    const B=best, W2=(u,v)=>[u*B.c-v*B.sn,u*B.sn+v*B.c];
    let v=B.v0+.4, row=0;
    while(v+SD<=B.v1-.3){ for(let u=B.u0+1.2;u<=B.u1-1.2;u+=SW){ const p=W2(u,v), q=W2(u,v+SD); if(ok(p,q,lot)) line(p,q); }
      v+=SD; if(row%2===0) v+=AISLE; row++; }                     // stalls, aisle, stalls | back to back | stalls, aisle, stalls ...
  }
  safe('pk lines',()=>{ map.getSource('pk-lines').setData({type:'FeatureCollection',features:out}); map.getSource('pk-pads').setData({type:'FeatureCollection',features:pads}); });
  P.nLines=out.length; P.nPads=pads.length; P.ms=performance.now()-t0;
}
function layers(){ safe('parking layers',()=>{
  if(!map.getSource('parking')) map.addSource('parking',{type:'geojson',data:EMPTY});
  const all=map.getStyle().layers, road=(all.find(l=>l['source-layer']==='transportation')||{}).id, before=road&&map.getLayer(road)?road:undefined;
  if(!map.getLayer('pk-base')) map.addLayer({id:'pk-base',type:'fill',source:'parking',minzoom:12,paint:{'fill-color':'#5f6368','fill-opacity':1}},before);
  const lot=()=>window.TXLOT?TXLOT.name():'tx-parking';
  if(!map.getLayer('pk-stalls')&&map.hasImage(lot())) map.addLayer({id:'pk-stalls',type:'fill',source:'parking',minzoom:14,paint:{'fill-pattern':lot(),'fill-opacity':1}},before);
  if(!map.getSource('pk-lines')) map.addSource('pk-lines',{type:'geojson',data:EMPTY,tolerance:0,buffer:32,maxzoom:18});
  if(!map.getSource('pk-pads')) map.addSource('pk-pads',{type:'geojson',data:EMPTY,tolerance:0});
  if(!map.getLayer('pk-pad')) map.addLayer({id:'pk-pad',type:'fill',source:'pk-pads',minzoom:14,paint:{'fill-color':'#5f6368','fill-opacity':1}},before);
  if(!map.getLayer('pk-padtx')&&map.hasImage(lot())) map.addLayer({id:'pk-padtx',type:'fill',source:'pk-pads',minzoom:14,paint:{'fill-pattern':lot(),'fill-opacity':1}},before);
  if(!map.getLayer('pk-curb')) map.addLayer({id:'pk-curb',type:'line',source:'parking',minzoom:14,layout:{'line-join':'round'},
    paint:{'line-color':'#b9bcc0','line-width':['interpolate',['exponential',2],['zoom'],14,.5,18,2,22,14],'line-opacity':.9}},before);
  // painted lines ~12 cm wide at any zoom (world-scaled width)
  if(!map.getLayer('pk-lines')) map.addLayer({id:'pk-lines',type:'line',source:'pk-lines',minzoom:15,layout:{'line-cap':'butt'},
    paint:{'line-color':'#f4f4f0','line-width':['interpolate',['exponential',2],['zoom'],15,.05,22,6.4],'line-opacity':.92}},before);
  if(window.TXLOT) TXLOT.apply();
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

onReady(function parking(){ layers(); P.ready=true; map.on('styledata',()=>{ if(!map.getLayer('pk-base')) layers(); });
  map.on('sourcedata',e=>{ if(e.sourceId===bSrc&&e.tile) P.tilesNew=true; }); });
// the stall lines: again after ~300 m of driving, or when new map tiles / lot outlines are in (at most every 4 s)
onTick(1000,function parkingLines(){ if(!P.ready||!map.getSource('pk-lines')) return;
  const moved=P.lineAt?meters(P.lineAt[1],P.lineAt[0],S.lat,S.lng):1e9, age=performance.now()-P.lineT;
  if(!P.job&&(moved>300||(P.tilesNew&&age>4000)||(!P.lineT&&age>1500))){ P.tilesNew=false; P.lineAt=[S.lng,S.lat]; P.lineT=performance.now(); P.job=stallJob(); } });
onTick(50,function parkingJob(){ if(!P.job) return; const t=performance.now();
  try{ while(performance.now()-t<6){ if(P.job.next().done){ P.job=null; break; } } }catch(e){ console.warn('parking lines',e); P.job=null; } });
onTick(2000,function parkingTick(){ if(!P.ready||P.busy||Date.now()<P.retry) return;
  if(!P.at||meters(P.at[1],P.at[0],S.lat,S.lng)>1500) load(); });
window.PARKING={at,state:P};
})();
