/* Smooth road curves (owner 2026-11-23: "the curves … have straight lines and then visible angles… i want the angles to
   not be visible for curves in the road").
   The map's vector tiles stop at zoom 14 and store every road as a simplified polyline, so from the chase camera or the
   cockpit a curve is a run of straight pieces with a corner at each point. This module draws the roads from a copy of
   that data with the corners rounded off:
   - every road line of each loaded tile is joined to the next piece of the same road inside the tile (where exactly one
     piece carries on), then each corner is replaced by a short curve (a quadratic bend from half-way along the piece
     before to half-way along the piece after, so a chain of corners becomes one continuous curve). The bend may sit at
     most DEV metres inside the old corner, so the drawn road never moves off where the car, traffic and autopilot think
     it is (they keep using the tile data as it was).
   - the result is cut back to the tile's own square and joined to the same road in the next tile, so nothing is drawn
     twice (the see-through asphalt grain and the lane dashes would show it).
   - every road line layer of the style (and the ones the game added: markings, grain, bridge rails) is moved onto this
     source with the same id, paint and place, so the rest of the game still finds them by name.
   Off with localStorage ydSmooth=0. */
(()=>{
'use strict';
const {onReady,onTick,safe}=YD;
const SRC='roads-smooth', DEV=1.8, MIN_TURN=.6*Math.PI/180, STEP=4*Math.PI/180;
let on=true; try{ on=localStorage.getItem('ydSmooth')!=='0'; }catch(e){}
const SM={on:false, vec:null, cache:new Map(), keys:'', t:0, want:false, n:0, ms:0};
window.SMOOTH=SM;

/* ---------- geometry ---------- */
const tileBox=(z,x,y)=>{ const n=2**z, lat=v=>Math.atan(Math.sinh(Math.PI*(1-2*v/n)))*180/Math.PI;
  return [x/n*360-180, lat(y+1), (x+1)/n*360-180, lat(y)]; };
// round every inner corner of a lng/lat line; the line's two ends stay where they are
function smoothLine(P){
  if(P.length<3) return P;
  const N=P.length-1;
  if(N>2&&P[0][0]===P[N][0]&&P[0][1]===P[N][1]){                  // a closed loop (roundabout): start half-way along the
    const M=[(P[0][0]+P[1][0])/2,(P[0][1]+P[1][1])/2];           // first piece so its first corner gets rounded too
    return smoothOpen([M].concat(P.slice(1),[M])); }
  return smoothOpen(P);
}
function smoothOpen(P){
  const lat0=P[0][1], kx=111320*Math.cos(lat0*Math.PI/180), ky=111320;
  const X=P.map(p=>(p[0]-P[0][0])*kx), Y=P.map(p=>(p[1]-lat0)*ky);
  const back=(x,y)=>[P[0][0]+x/kx, lat0+y/ky];
  const out=[P[0]]; let lx=0, ly=0;                               // last point out, metres
  const add=(x,y)=>{ if(Math.abs(x-lx)+Math.abs(y-ly)<.01) return; out.push(back(x,y)); lx=x; ly=y; };
  for(let i=1;i<P.length-1;i++){
    const ax=X[i]-X[i-1], ay=Y[i]-Y[i-1], bx=X[i+1]-X[i], by=Y[i+1]-Y[i], la=Math.hypot(ax,ay), lb=Math.hypot(bx,by);
    if(la<1e-3||lb<1e-3){ add(X[i],Y[i]); continue; }
    const c=Math.max(-1,Math.min(1,(ax*bx+ay*by)/(la*lb))), turn=Math.acos(c);
    if(turn<MIN_TURN||turn>Math.PI*.97){ add(X[i],Y[i]); continue; }      // straight on, or doubling back: leave it
    // half of each neighbouring piece at most (the next corner takes the other half), and no more than DEV inside the corner
    const d=Math.min(.5*la,.5*lb,2*DEV/Math.max(1e-6,Math.sin(turn/2)));
    const x0=X[i]-ax/la*d, y0=Y[i]-ay/la*d, x2=X[i]+bx/lb*d, y2=Y[i]+by/lb*d;
    const n=Math.max(2,Math.min(16,Math.ceil(turn/STEP)+1));
    for(let k=0;k<=n;k++){ const t=k/n, u=1-t;
      add(u*u*x0+2*u*t*X[i]+t*t*x2, u*u*y0+2*u*t*Y[i]+t*t*y2); }
  }
  const E=P.length-1; if(Math.abs(X[E]-lx)+Math.abs(Y[E]-ly)<.01) out.pop();
  out.push(P[E]);                                                 // the exact end, so the next piece still meets it
  return out;
}
// cut a line to a lng/lat box: the pieces inside (Liang-Barsky per segment)
function clipLine(P,b){
  const parts=[]; let cur=null;
  for(let i=1;i<P.length;i++){
    const x0=P[i-1][0], y0=P[i-1][1], dx=P[i][0]-x0, dy=P[i][1]-y0; let t0=0, t1=1, ok=true;
    for(const [p,q] of [[-dx,x0-b[0]],[dx,b[2]-x0],[-dy,y0-b[1]],[dy,b[3]-y0]]){
      if(p===0){ if(q<0){ ok=false; break; } continue; }
      const r=q/p; if(p<0){ if(r>t1){ ok=false; break; } if(r>t0) t0=r; } else { if(r<t0){ ok=false; break; } if(r<t1) t1=r; } }
    if(!ok){ cur=null; continue; }
    const A=t0===0?P[i-1]:[x0+dx*t0,y0+dy*t0], B=t1===1?P[i]:[x0+dx*t1,y0+dy*t1];
    if(!cur||t0>0){ cur=[A]; parts.push(cur); }
    cur.push(B); if(t1<1) cur=null;
  }
  return parts.filter(p=>p.length>1);
}
const twoWay=pr=>!pr.oneway||pr.oneway===0||pr.oneway==='0';
/* join lines of the same road end to start. exact: points must match exactly (inside one tile) and only where exactly two
   ends of that road meet (not at a junction); otherwise ends within ~1 m are joined (tile seams: the smoothed copies can
   differ by a hair) */
function join(items,exact){
  const PK=p=>exact?p[0].toFixed(7)+','+p[1].toFixed(7):Math.round(p[0]*1e5)+','+Math.round(p[1]*1e5);
  const ends=new Map(), put=(k,v)=>{ let a=ends.get(k); if(!a) ends.set(k,a=[]); a.push(v); };
  items.forEach((it,i)=>{ put(it.k+'|'+PK(it.c[0]),{i,s:true}); put(it.k+'|'+PK(it.c[it.c.length-1]),{i,s:false}); });
  const near=(it,p)=>{ const k0=it.k+'|'; if(exact) return ends.get(k0+PK(p))||[];
    const a=Math.round(p[0]*1e5), b=Math.round(p[1]*1e5), r=[];
    for(let u=-1;u<=1;u++) for(let v=-1;v<=1;v++){ const e=ends.get(k0+(a+u)+','+(b+v)); if(e) r.push(...e); } return r; };
  const used=new Uint8Array(items.length), out=[];
  // the one other unused end of the same road at point p (exact: and nothing else ends there)
  const partner=(i,p)=>{ const c=near(items[i],p).filter(e=>e.i!==i&&!used[e.i]);
    if(exact&&near(items[i],p).length!==2) return null;
    return c.length===1?c[0]:null; };
  for(let i=0;i<items.length;i++){ if(used[i]) continue; used[i]=1;
    const it=items[i], two=twoWay(it.p); let c=it.c.slice();
    for(let g=0;g<64;g++){ const e=partner(i,c[c.length-1]); if(!e) break;            // carry on past the end
      const o=items[e.i]; if(!e.s&&!two) break; used[e.i]=1; const oc=e.s?o.c:o.c.slice().reverse(); c=c.concat(oc.slice(1)); }
    for(let g=0;g<64;g++){ const e=partner(i,c[0]); if(!e) break;                     // and back past the start
      const o=items[e.i]; if(e.s&&!two) break; used[e.i]=1; const oc=e.s?o.c.slice().reverse():o.c; c=oc.slice(0,-1).concat(c); }
    out.push({k:it.k,p:it.p,c}); }
  return out;
}
// one tile's roads: joined, smoothed, cut to the tile
function buildTile(z,x,y,feats){
  const items=[];
  for(const f of feats){ const vt=f._vectorTileFeature; if(vt&&vt.type!==2) continue;   // 2 = line
    const g=f.geometry; if(!g) continue;
    const lines=g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:null; if(!lines) continue;
    const p=Object.assign({},f.properties), k=JSON.stringify(p);
    for(const c of lines) if(c.length>1) items.push({k,p,c}); }
  const box=tileBox(z,x,y), out=[];
  for(const it of join(items,true)) for(const c of clipLine(smoothLine(it.c),box)) out.push({k:it.k,p:it.p,c});
  return out;
}

/* ---------- keeping the copy up to date ---------- */
function rebuild(){
  const t0=performance.now(); SM.t=t0; SM.want=false;
  let fs; try{ fs=map.querySourceFeatures(SM.vec,{sourceLayer:'transportation'}); }catch(e){ return; }
  const by=new Map();
  for(const f of fs){ const T=f.tile||{z:f._z,x:f._x,y:f._y}; if(T.z==null) continue;   // geometry is only decoded for new tiles
    const key=T.z+'/'+T.x+'/'+T.y; let a=by.get(key); if(!a) by.set(key,a={T,f:[]}); a.f.push(f); }
  // a tile shown while its more detailed children load: drop it where children are in (they'd overlap)
  const hasKid=new Set();
  for(const {T} of by.values()) for(let z=T.z-1,x=T.x>>1,y=T.y>>1;z>=0;z--,x>>=1,y>>=1) hasKid.add(z+'/'+x+'/'+y);
  const keys=[...by.keys()].filter(k=>!hasKid.has(k)).sort(), ks=keys.join(' ');
  if(ks===SM.keys&&SM.on) return;
  for(const k of keys) if(!SM.cache.has(k)){ const {T,f}=by.get(k); SM.cache.set(k,buildTile(T.z,T.x,T.y,f)); }
  for(const k of [...SM.cache.keys()]) if(!by.has(k)) SM.cache.delete(k);
  const all=[]; for(const k of keys) all.push(...SM.cache.get(k));
  const feats=join(all,false).map(it=>({type:'Feature',properties:it.p,geometry:{type:'LineString',coordinates:it.c}}));
  const src=map.getSource(SRC); if(src) src.setData({type:'FeatureCollection',features:feats});
  SM.keys=ks; SM.n=feats.length; SM.ms=performance.now()-t0;
}

/* ---------- moving the road layers onto the smoothed copy ---------- */
function moveLayers(){
  const L=map.getStyle().layers, ids=L.map(l=>l.id);
  const take=L.map((l,i)=>[l,i]).filter(([l])=>l.source===SM.vec&&l['source-layer']==='transportation'&&l.type==='line');
  for(let j=take.length-1;j>=0;j--){ const [l,i]=take[j], before=ids[i+1];
    const spec=Object.assign({},l,{source:SRC}); delete spec['source-layer'];
    safe('smooth '+l.id,()=>{ map.removeLayer(l.id); map.addLayer(spec,before&&map.getLayer(before)?before:undefined); }); }
  return take.length;
}

onReady(function smoothRoads(){
  if(!on) return;
  const L=map.getStyle().layers, r=L.find(l=>l['source-layer']==='transportation'&&l.type==='line'); if(!r) return;
  SM.vec=r.source;
  if(typeof roadGeo==='object'&&!roadGeo.src) roadGeo.src=SM.vec;        // the game's own road data stays on the tiles
  map.addSource(SRC,{type:'geojson',data:YD.EMPTY,maxzoom:18,tolerance:.2,buffer:64});
  rebuild(); SM.layers=moveLayers(); SM.on=true;
  map.on('sourcedata',e=>{ if(e.sourceId===SM.vec&&e.tile) SM.want=true; });
});
// new tiles in: rebuild, at most every 0.8 s; a slow check every 3 s catches tiles dropped
onTick(200,function smoothTick(){ if(!SM.on) return; const now=performance.now();
  if((SM.want&&now-SM.t>800)||now-SM.t>3000) rebuild(); });
})();
