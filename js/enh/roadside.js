/* Roadside detail near the car and asphalt-coloured roads (owner 2026-11-20: "I'm seeing very little road in front of me…
   partially because there is nothing on the side of the roads… add features near the car… a change that can be toggled
   that changes the roads to look more like a road (dark/black) vs the map tile colors").

   Roadside: built from the road centre lines (game.js roadGeo) within a few hundred metres of the car, rebuilt every
   ~80 m driven, drawn as real-size 3D map shapes (fill-extrusions), so buildings in front hide them properly:
     - out of town (no building within ~45 m): wooden utility poles with a cross-arm on one side of the road every
       ~48 m, wires between them, and now and then a tree a few metres back from the road;
     - in town: street lights (arm over the road, lamp lit after dark), sidewalks along both sides, a mailbox at the
       curb in front of each house on residential streets, fire hydrants now and then.
   Placement is a best guess from the map (it doesn't know where real poles stand); positions are measured along each
   road line from its own start, so they stay put between rebuilds. Nothing is placed on another road, in a building
   or right at an intersection. Fewer and closer on Low graphics.

   Asphalt roads (⚙️ Asphalt roads, ydAsphalt, on by default): every road dark grey asphalt by class with concrete-grey
   edges (curbs / shoulders) instead of the map's white/yellow/orange; the asphalt grain overlay is toned down to match.
   Off = the map's own colours, exactly as before. */
(()=>{
'use strict';
const {onReady,onTick,safe,mz}=YD;
const LSg=(k,d)=>{ try{ const v=localStorage.getItem(k); return v==null?d:v; }catch(e){ return d; } };
const RS={asphalt:LSg('ydAsphalt','1')!=='0', at:null, geoT:0, n:0, k:-1, orig:{}};
const hash=(a,b)=>{ let h=Math.imul((a*73856093)^(b*19349663),0x5bd1e995); h^=h>>>13; h=Math.imul(h,0x5bd1e995); return ((h^(h>>>15))>>>0)/4294967296; };
const strHash=s=>{ let h=2166136261; for(let i=0;i<(s||'').length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return (h>>>0)/4294967296; };

/* ---------- asphalt colours ---------- */
const ROADRE=/^(road|bridge)_/, SKIP=/rail|hatching|transit|arrow|path|pedestrian|track|area|pier|ferry/;
function roadLayers(){ return map.getStyle().layers.filter(l=>(l['source-layer']==='transportation'||l.source==='roads-smooth')&&l.type==='line'&&ROADRE.test(l.id)&&!SKIP.test(l.id)); }
function asphaltColour(id){ if(/_casing$/.test(id)) return /motorway|trunk/.test(id)?'#8a8b86':'#9a9a94';   // concrete curb / shoulder
  return /motorway/.test(id)?'#36383b':/trunk|primary/.test(id)?'#3b3d40':/secondary|tertiary/.test(id)?'#3f4144':/service/.test(id)?'#4c4e51':'#434548'; }
function applyAsphalt(){ if(!map.isStyleLoaded||!map.getStyle()) return;
  for(const l of roadLayers()){ const id=l.id;
    if(!(id in RS.orig)) RS.orig[id]=map.getPaintProperty(id,'line-color');
    safe('asphalt',()=>map.setPaintProperty(id,'line-color',RS.asphalt?asphaltColour(id):RS.orig[id])); }
  for(const l of map.getStyle().layers) if(/^tx-asph-/.test(l.id)) safe('asphalt grain',()=>map.setPaintProperty(l.id,'line-opacity',RS.asphalt?.22:.45));
  if(map.getLayer('rs-walk')) safe('walk',()=>map.setPaintProperty('rs-walk','line-color',RS.asphalt?'#a9a8a2':'#c9c7c0'));
  dirty=true; }
function setAsphalt(v){ RS.asphalt=v; try{ localStorage.setItem('ydAsphalt',v?'1':'0'); }catch(e){} applyAsphalt(); showBtn(); }
function showBtn(){ const b=document.getElementById('asphaltBtn'); if(b) b.classList.toggle('on',RS.asphalt); }
{ const b=document.getElementById('asphaltBtn'); if(b) b.addEventListener('click',e=>{ e.stopPropagation(); setAsphalt(!RS.asphalt); }); showBtn(); }

/* ---------- roadside objects ---------- */
// a rectangle (metres: centre, along-direction unit vector, length, width) as a lng/lat ring
function rect(L,cx,cy,ux,uy,len,wid){ const vx=-uy, vy=ux, a=len/2, b=wid/2, P=[[-a,-b],[a,-b],[a,b],[-a,b],[-a,-b]];
  return [P.map(([s,t])=>L(cx+ux*s+vx*t,cy+uy*s+vy*t))]; }
function octa(L,cx,cy,r){ const p=[]; for(let i=0;i<=8;i++){ const a=i/8*Math.PI*2; p.push(L(cx+Math.cos(a)*r,cy+Math.sin(a)*r)); } return [p]; }
const F=(coords,props)=>({type:'Feature',properties:props,geometry:{type:'Polygon',coordinates:coords}});
const Line=(pts,props)=>({type:'Feature',properties:props,geometry:{type:'LineString',coordinates:pts}});

function build(){
  if(typeof roadGeo!=='object') return;
  if(!roadGeo.segs||meters(roadGeo.lat,roadGeo.lng,S.lat,S.lng)>300||performance.now()-roadGeo.t>8000) rebuildRoadGeo();
  const segs=roadGeo.segs; if(!segs||!segs.length) return;
  const R=Q3(150,220,280), kx=111320*Math.cos(roadGeo.lat*Math.PI/180), ox=(S.lng-roadGeo.lng)*kx, oy=(S.lat-roadGeo.lat)*111320;
  const L=(x,y)=>[roadGeo.lng+x/kx,roadGeo.lat+y/111320];
  // grids: road pieces (to keep clear of other roads) and building footprints (local metres)
  const C=25, SG=new Map(), put=(M,x,y,o)=>{ const k=Math.floor(x/C)+','+Math.floor(y/C); let a=M.get(k); if(!a) M.set(k,a=[]); a.push(o); };
  const segD=s=>{ const dx=s[2]-s[0], dy=s[3]-s[1], L2=dx*dx+dy*dy||1, t=Math.max(0,Math.min(1,((ox-s[0])*dx+(oy-s[1])*dy)/L2)); return Math.hypot(s[0]+t*dx-ox,s[1]+t*dy-oy); };
  const near=segs.filter(s=>segD(s)<R+60);                        // by distance to the line itself: a long straight road passing by has both ends far away
  for(const s of near){ const n=Math.ceil(Math.hypot(s[2]-s[0],s[3]-s[1])/C)+1; const seen=new Set();
    for(let i=0;i<=n;i++){ const x=s[0]+(s[2]-s[0])*i/n, y=s[1]+(s[3]-s[1])*i/n, k=Math.floor(x/C)+','+Math.floor(y/C); if(!seen.has(k)){ seen.add(k); put(SG,x,y,s); } } }
  const BG=new Map(), cents=[];
  try{ for(const f of map.querySourceFeatures(bSrc,{sourceLayer:'building'})){ const g=f.geometry; const parts=g&&(g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[]); if(!parts) continue;
      for(const pl of parts){ const ring=(pl[0]||[]).map(q=>[(q[0]-roadGeo.lng)*kx,(q[1]-roadGeo.lat)*111320]); if(ring.length<4) continue;
        let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9,cx=0,cy=0; for(const q of ring){ x0=Math.min(x0,q[0]); x1=Math.max(x1,q[0]); y0=Math.min(y0,q[1]); y1=Math.max(y1,q[1]); cx+=q[0]; cy+=q[1]; }
        if(x1<ox-R-60||x0>ox+R+60||y1<oy-R-60||y0>oy+R+60) continue;
        const b={ring,bb:[x0,y0,x1,y1],cx:cx/ring.length,cy:cy/ring.length,a:(x1-x0)*(y1-y0)}; cents.push(b);
        for(let i=Math.floor((x0-2)/C);i<=Math.floor((x1+2)/C);i++) for(let j=Math.floor((y0-2)/C);j<=Math.floor((y1+2)/C);j++){ const k=i+','+j; let a=BG.get(k); if(!a) BG.set(k,a=[]); a.push(b); } } } }catch(e){}
  const inRing=(x,y,r)=>{ let c=false; for(let i=0,j=r.length-1;i<r.length;j=i++){ const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1]; if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi)) c=!c; } return c; };
  const inBuilding=(x,y,pad)=>{ for(const b of BG.get(Math.floor(x/C)+','+Math.floor(y/C))||[]){ if(x<b.bb[0]-pad||x>b.bb[2]+pad||y<b.bb[1]-pad||y>b.bb[3]+pad) continue; if(inRing(x,y,b.ring)) return true; if(pad>0&&x>b.bb[0]&&x<b.bb[2]&&y>b.bb[1]&&y<b.bb[3]) return true; } return false; };
  const town=(x,y)=>{ for(let i=-2;i<=2;i++) for(let j=-2;j<=2;j++) for(const b of BG.get((Math.floor(x/C)+i)+','+(Math.floor(y/C)+j))||[]) if(Math.hypot(b.cx-x,b.cy-y)<45) return true; return false; };
  const onRoad=(x,y,self,m)=>{ for(const s of SG.get(Math.floor(x/C)+','+Math.floor(y/C))||[]){ if(s===self||s[6]==='path'||s[8]===self[8]&&Math.abs(s[7]-self[7])<60) continue;   // sidewalks / footpaths: fine to stand on
      const dx=s[2]-s[0], dy=s[3]-s[1], L2=dx*dx+dy*dy||1, t=Math.max(0,Math.min(1,((x-s[0])*dx+(y-s[1])*dy)/L2)); if(Math.hypot(s[0]+t*dx-x,s[1]+t*dy-y)<s[4]+m) return true; } return false; };
  // owner 2026-11-21 (issue #4): "objects are showing in the middle of the road (hydrants, street signs, street lights)":
  // last check against every drivable road's drawn edge (game.js roadClear), the same test trees and signs get
  const clear=(x,y,g)=>{ if(typeof roadClear!=='function') return true; const q=L(x,y); return roadClear(q[0],q[1])>=g; };
  const ok=(x,y,self,m,pad)=>Math.hypot(x-ox,y-oy)<R&&!onRoad(x,y,self,m)&&!inBuilding(x,y,pad==null?1:pad)&&clear(x,y,Math.min(m,.6));

  const out=[], obs=[], poles=new Map(), mailFor=new Set();
  const QL0=Q3(0,1,2);
  for(const s of near){ const [x1,y1,x2,y2,half,name,cls,along,lid]=s; if(/motorway|track|path|service/.test(cls)) continue;
    const len=Math.hypot(x2-x1,y2-y1); if(len<.5) continue; const ux=(x2-x1)/len, uy=(y2-y1)/len, nx=uy, ny=-ux;   // n = right of travel
    const mid=[(x1+x2)/2,(y1+y2)/2], inTown=town(mid[0],mid[1]), side=strHash(name||cls)<.5?1:-1;
    // positions every `step` metres along the line, measured from the line's start (stable between rebuilds)
    const each=(step,phase,fn)=>{ for(let d=Math.ceil((along-phase)/step)*step+phase;d<along+len;d+=step){ const t=d-along; fn(x1+ux*t,y1+uy*t,d); } };
    if(!inTown){
      // utility poles + wires on one side
      each(48,0,(px,py,d)=>{ const x=px+nx*side*(half+3.2), y=py+ny*side*(half+3.2); if(!ok(x,y,s,2.5)) return;
        out.push(F(rect(L,x,y,ux,uy,.32,.32),{k:'pole',b:0,h:10.2,c:'#5b4634'}));
        out.push(F(rect(L,x,y,nx,ny,2.4,.14),{k:'pole',b:9.3,h:9.45,c:'#5b4634'}));
        for(const q of [-1,1]) out.push(F(rect(L,x+nx*q*1.05,y+ny*q*1.05,ux,uy,.1,.1),{k:'ins',b:9.45,h:9.62,c:'#6f7d86'}));
        const key=lid+':'+side, prev=poles.get(key);
        if(prev&&d-prev.d<60){ for(const q of [-1,1]){ const ax=prev.x+nx*q*1.05, ay=prev.y+ny*q*1.05, bx=x+nx*q*1.05, by=y+ny*q*1.05, wl=Math.hypot(bx-ax,by-ay);
            if(wl>1) out.push(F(rect(L,(ax+bx)/2,(ay+by)/2,(bx-ax)/wl,(by-ay)/wl,wl,.035),{k:'wire',b:9.55,h:9.59,c:'#1c1c1c'})); } }
        poles.set(key,{x,y,d}); });
      // a tree now and then, back from the road
      if(QL0>0) each(26,13,(px,py,d)=>{ const h0=hash(lid,Math.round(d)); if(h0>.28) return; const sd=h0<.14?1:-1, off=half+5+hash(Math.round(d),lid)*7;
        const x=px+nx*sd*off, y=py+ny*sd*off; if(!ok(x,y,s,3)) return; const q=L(x,y);
        if(typeof roadClear==='function'&&roadClear(q[0],q[1])<2.5) return;   // clear of every street's drawn edge too
        treeFeats(q[0],q[1],hash(lid+1,Math.round(d)),.95,Math.hypot(x-ox,y-oy)<TREE_NEAR(),out); });   // game.js: round trunk, limbs, leafy crown
    } else {
      // street lights: one side, arm out over the road, lamp lit after dark
      const big=/trunk|primary|secondary/.test(cls), stepL=big?38:52;
      each(stepL,7,(px,py,d)=>{ const sd=big&&Math.floor(d/stepL)%2?-side:side, x=px+nx*sd*(half+1.1), y=py+ny*sd*(half+1.1); if(!ok(x,y,s,1.2,0)) return;
        out.push(F(rect(L,x,y,ux,uy,.22,.22),{k:'lpole',b:0,h:8.2,c:'#6d7278'})); obs.push([x,y,.16]);
        const ax=x-nx*sd*1.1, ay=y-ny*sd*1.1; out.push(F(rect(L,ax,ay,nx,ny,2.2,.12),{k:'lpole',b:7.9,h:8.05,c:'#6d7278'}));
        out.push(F(rect(L,x-nx*sd*2.1,y-ny*sd*2.1,nx,ny,.7,.32),{k:'lamp',b:7.75,h:7.95,c:'#d7dade'})); });
      // sidewalks both sides (a concrete strip a little back from the curb), drawn under the roads so crossings stay clear
      for(const sd of [-1,1]){ const o=half+2.2, a=[x1+nx*sd*o,y1+ny*sd*o], b=[x2+nx*sd*o,y2+ny*sd*o];
        if(Math.hypot(a[0]-ox,a[1]-oy)<R+40) out.push(Line([L(a[0],a[1]),L(b[0],b[1])],{k:'walk'})); }
      // fire hydrants now and then
      each(85,31,(px,py,d)=>{ const sd=hash(lid,Math.round(d))<.5?1:-1, x=px+nx*sd*(half+.9), y=py+ny*sd*(half+.9); if(!ok(x,y,s,.8,0)) return;
        out.push(F(octa(L,x,y,.17),{k:'hyd',b:0,h:.75,c:'#c62828'})); obs.push([x,y,.2]); out.push(F(octa(L,x,y,.11),{k:'hyd',b:.75,h:.85,c:'#c62828'})); });
      // mailboxes at the curb in front of houses on residential streets
      if(/minor|tertiary/.test(cls)) for(const b of cents){ if(mailFor.has(b)||b.a>600) continue;
        const t=(b.cx-x1)*ux+(b.cy-y1)*uy; if(t<0||t>len) continue; const dn=(b.cx-x1)*nx+(b.cy-y1)*ny; if(Math.abs(dn)>half+35||Math.abs(dn)<half+3) continue;
        const sd=Math.sign(dn), x=x1+ux*t+nx*sd*(half+.7), y=y1+uy*t+ny*sd*(half+.7); if(!ok(x,y,s,.6)) continue; mailFor.add(b);
        out.push(F(rect(L,x,y,ux,uy,.1,.1),{k:'mail',b:0,h:1.02,c:'#3a2f26'})); obs.push([x,y,.25]);
        out.push(F(rect(L,x,y,nx,ny,.48,.2),{k:'mail',b:1.0,h:1.22,c:['#202326','#2b3a55','#5a5d61','#7a2321'][Math.floor(hash(b.cx|0,b.cy|0)*4)]})); }
    } }
  RS.n=out.length; RS.obs=obs.map(([x,y,r])=>{ const q=L(x,y); return [q[0]*MLNG,q[1]*MLAT,r]; });   // street lights, hydrants and mailboxes, for the parking sensors (m)
  const src=map.getSource('roadside'); if(src) src.setData({type:'FeatureCollection',features:out});
  RS.at=[S.lng,S.lat]; RS.geoT=roadGeo.t; dirty=true;
}

onReady(function roadside(){
  try{
    const ids=map.getStyle().layers.map(l=>l.id), firstRoad=ids.find(id=>/^(road|tunnel|bridge)_/.test(id)&&/casing/.test(id))||ids.find(id=>/^road_/.test(id));
    map.addSource('roadside',{type:'geojson',data:{type:'FeatureCollection',features:[]},maxzoom:19,tolerance:.1});
    map.addLayer({id:'rs-walk',type:'line',source:'roadside',filter:['==',['get','k'],'walk'],minzoom:14,
      layout:{'line-cap':'butt','line-join':'round'},paint:{'line-color':RS.asphalt?'#a9a8a2':'#c9c7c0','line-width':mz(1.8,1)}},firstRoad);
    const top=map.getLayer('tree-trunk')?'tree-trunk':undefined;
    map.addLayer({id:'rs-3d',type:'fill-extrusion',source:'roadside',filter:['all',['==',['geometry-type'],'Polygon'],['!=',['get','k'],'crown']],minzoom:14,
      paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-height':['get','h'],'fill-extrusion-base':['get','b'],'fill-extrusion-vertical-gradient':false}},top);
    if(typeof addLeafImages==='function') addLeafImages();
    map.addLayer({id:'rs-crown',type:'fill-extrusion',source:'roadside',filter:['==',['get','k'],'crown'],minzoom:14,
      paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-pattern':['coalesce',['get','p'],'lf-386529'],'fill-extrusion-height':['get','h'],'fill-extrusion-base':['get','b']}},top);
  }catch(e){ console.warn('roadside layers',e); }
  applyAsphalt();
});
// rebuild after driving ~80 m (Low: 120 m) or when the road lines were refreshed; never while gliding
onTick(700,function roadsideTick(){
  if(!map.getSource('roadside')||mode==='glider') return;
  const moved=RS.at?meters(RS.at[1],RS.at[0],S.lat,S.lng):1e9;
  if(moved>(POWER?120:80)||(roadGeo.t&&roadGeo.t!==RS.geoT&&moved>25)) safe('roadside',build);
  // lamps glow after dark
  const k=YD.AT?(YD.AT.k||0):0, lit=k>.5?1:0;
  if(lit!==RS.k&&map.getLayer('rs-3d')){ RS.k=lit; safe('lamps',()=>map.setPaintProperty('rs-3d','fill-extrusion-color',lit?['case',['==',['get','k'],'lamp'],'#ffd58a',['get','c']]:['get','c'])); }
});
window.ROADSIDE={build,state:RS,setAsphalt};
})();
