/* Ice arenas with a hockey rink inside (owner 2026-11-24: "ice arenas should have hockey rinks inside that you can skate
   on and shoot a puck around and into hockey nets").
   Which buildings: OpenStreetMap buildings that contain a leisure=ice_rink / sport=ice_hockey, or a building named like an
   ice arena / rink / skating centre, asked from the Overpass mirrors (game.js ovFetch) around where you are. RINK.force(rec)
   marks any building as an arena for testing (RINK.forceHere() = the one you're in or next to).
   Inside (js/enh/walk.js calls build / step / onIce / blocks): a regulation NHL rink (61 x 26 m, 8.5 m corners; shrunk to fit
   if the building is smaller, never below 45 %) laid along the building's long axis: painted ice (red centre line, blue lines,
   goal lines, face-off circles and dots, creases), boards with kick plate, cap and glass, a gate in the boards by the nearest
   door, two nets (1.8 x 1.2 m), a scoreboard and a puck. You skate with the same physics as on frozen water (walk.js); outside
   the boards is the concrete concourse. Shooting: SHOOT (Space / the 🏒 button / pad ✕): tap for a wrist shot, hold up to a
   second for a slap shot; the puck also rides on your stick when you skate into it, and bumps away when you run into it.
   The puck bounces off the boards and the posts; into a net = goal, horn, the puck goes back to the centre dot. */
(()=>{
'use strict';
const {safe,onReady,onTick}=YD;
const FT=.3048, RL=200*FT, RW=85*FT, RC=28*FT, BLUE=25*FT, GOALX=89*FT, CIRX=69*FT, CIRY=22*FT, CIRR=15*FT, GW=1.83, GH=1.22, GD=1.0, PUCKR=.05;
const R={list:[],at:null,busy:false,force:new Set(),specs:new Map(),cur:null,goals:0,shots:0,charge:0,touch:false,wasHeld:false,ac:null};
const inP=(p,x,y)=>{ let c=false; for(let i=0,j=p.length-1;i<p.length;j=i++){ const a=p[i],b=p[j]; if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])) c=!c; } return c; };

/* ---------- which buildings are arenas ---------- */
async function load(){
  if(R.busy||typeof ovFetch!=='function'||typeof S==='undefined') return; R.busy=true;
  const lat=S.lat,lng=S.lng, d=.03, dl=d/Math.cos(lat*Math.PI/180), bb=`(${(lat-d).toFixed(4)},${(lng-dl).toFixed(4)},${(lat+d).toFixed(4)},${(lng+dl).toFixed(4)})`;
  const q=`[out:json][timeout:20];(nwr["leisure"="ice_rink"]${bb};nwr["sport"="ice_hockey"]${bb};nwr["building"]["name"~"ice (arena|rink|center|centre|complex|palace)|skating (rink|center|centre)|hockey",i]${bb};);out center tags;`;
  try{ const j=await Promise.race([ovFetch(q),new Promise((_,no)=>setTimeout(()=>no(new Error('slow')),20000))]);
    const seen=new Set(R.list.map(a=>a.id)); let n=0;
    for(const e of (j&&j.elements)||[]){ const c=e.center||(e.lat!=null?{lat:e.lat,lon:e.lon}:null); if(!c) continue; const id=e.type+e.id; if(seen.has(id)) continue; seen.add(id);
      R.list.push({id,lat:c.lat,lng:c.lon,name:(e.tags&&e.tags.name)||'',tags:e.tags||{}}); n++; }
    R.at=[lng,lat]; R.nextTry=0;
    if(n){ R.specs.clear(); try{ localStorage.setItem('ydRinkList',JSON.stringify(R.list)); }catch(e){}
      const rec=window.WALK&&WALK.inside&&WALK.inside.rec;                                          // already standing in one when its answer arrives: redraw the room
      if(rec&&spec(rec)){ WALK.setInside(null); WALK.setInside(rec); } } }
  catch(e){ R.nextTry=performance.now()+25000; }                 // slow or failed (the mirrors often are): ask again in 25 s, not only after moving 1.5 km
  R.busy=false; }
try{ const c=JSON.parse(localStorage.getItem('ydRinkList')||'[]'); if(Array.isArray(c)) R.list=c; }catch(e){}   // arenas found on earlier visits
onReady(function rinks(){ setTimeout(()=>safe('rinks',load),4000); });
onTick(5000,function rinkTick(){ if(R.busy||performance.now()<(R.nextTry||0)) return;
  if(!R.at||meters(R.at[1],R.at[0],S.lat,S.lng)>1000) safe('rinks',load); });                 // never asked here yet, or you've moved on (e.g. a teleport)

/* ---------- the rink laid into a building ---------- */
function ext(p,c,s){ let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9; for(const q of p){ const u=q[0]*c+q[1]*s, v=-q[0]*s+q[1]*c; if(u<x0)x0=u; if(u>x1)x1=u; if(v<y0)y0=v; if(v>y1)y1=v; } return {x0,x1,y0,y1}; }
function spec(rec){
  if(R.specs.has(rec.key)) return R.specs.get(rec.key);
  let yes=R.force.has(rec.key);
  if(!yes){ const b=rec.bb; for(const a of R.list){ if(a.lng<b[0]||a.lng>b[2]||a.lat<b[1]||a.lat>b[3]) continue;
      if(inP(rec.p,(a.lng-rec.cx)*rec.kx,(a.lat-rec.cy)*rec.ky)){ yes=true; break; } } }
  let sp=null;
  if(yes){
    let best=null; const p=rec.p;
    for(let i=0;i<p.length;i++){ const a=p[i], b=p[(i+1)%p.length], L=Math.hypot(b[0]-a[0],b[1]-a[1]); if(L<1) continue;
      const c=(b[0]-a[0])/L, s=(b[1]-a[1])/L, e=ext(p,c,s), A=(e.x1-e.x0)*(e.y1-e.y0); if(!best||A<best.A) best={A,c,s}; }
    if(best){ let {c,s}=best, e=ext(p,c,s); if(e.y1-e.y0>e.x1-e.x0){ const c2=-s, s2=c; c=c2; s=s2; e=ext(p,c,s); }       // the long way
      const u=(e.x0+e.x1)/2, v=(e.y0+e.y1)/2, L=e.x1-e.x0, W=e.y1-e.y0;
      sp={c,s,cx:u*c-v*s,cy:u*s+v*c,sc:Math.max(.45,Math.min(1,(L-4)/RL,(W-4)/RW)),rec};
      sp.A=RL*sp.sc/2; sp.B=RW*sp.sc/2; sp.Rr=RC*sp.sc;
      // the gate in the boards: on the long side nearest the closest door, beside where that door is
      let bd=null,bdd=1e9; for(const d of rec.doors||[]){ const dx=(d.x0+d.x1)/2-sp.cx, dy=(d.y0+d.y1)/2-sp.cy, dd=Math.hypot(dx,dy); if(dd<bdd){ bdd=dd; bd=[dx*c+dy*s,-dx*s+dy*c]; } }
      sp.gs=bd&&bd[1]<0?-1:1; sp.gx=Math.max(-(sp.A-sp.Rr-1.5),Math.min(sp.A-sp.Rr-1.5,bd?bd[0]:0)); } }
  R.specs.set(rec.key,sp); return sp; }
const rc=(sp,x,y)=>{ const dx=x-sp.cx, dy=y-sp.cy; return [dx*sp.c+dy*sp.s,-dx*sp.s+dy*sp.c]; };
function inside(sp,px,py,m){ m=m||0; const A=sp.A-m, B=sp.B-m, Rr=Math.max(.1,sp.Rr-m), qx=Math.abs(px)-(A-Rr), qy=Math.abs(py)-(B-Rr);
  if(qx>0&&qy>0) return Math.hypot(qx,qy)<=Rr; return Math.abs(px)<=A&&Math.abs(py)<=B; }
const loc=(r,lat,lng)=>[(lng-r.cx)*r.kx,(lat-r.cy)*r.ky];
function onIce(rec,lat,lng){ const sp=spec(rec); if(!sp) return false; const q=loc(rec,lat,lng), c=rc(sp,q[0],q[1]); return inside(sp,c[0],c[1]); }
// a step from a to b that goes over the boards anywhere but the gate is stopped
function blocks(rec,a,b){ const sp=spec(rec); if(!sp) return false;
  const qa=loc(rec,a[0],a[1]), qb=loc(rec,b[0],b[1]), ca=rc(sp,qa[0],qa[1]), cb=rc(sp,qb[0],qb[1]), ia=inside(sp,ca[0],ca[1]), ib=inside(sp,cb[0],cb[1]);
  if(ia===ib) return false;
  const o=ia?cb:ca; return !(Math.abs(o[0]-sp.gx)<.95&&Math.sign(o[1])===sp.gs&&Math.abs(o[1])>sp.B-1.6); }

/* ---------- painting and building ---------- */
function iceTexture(){
  const k=32, w=Math.round(RL*k), h=Math.round(RW*k), cv=document.createElement('canvas'); cv.width=w; cv.height=h; const x=cv.getContext('2d');
  x.save(); x.beginPath(); const Rr=RC*k; x.moveTo(Rr,0); x.lineTo(w-Rr,0); x.arcTo(w,0,w,Rr,Rr); x.lineTo(w,h-Rr); x.arcTo(w,h,w-Rr,h,Rr); x.lineTo(Rr,h); x.arcTo(0,h,0,h-Rr,Rr); x.lineTo(0,Rr); x.arcTo(0,0,Rr,0,Rr); x.closePath(); x.clip();
  x.fillStyle='#eaf4fa'; x.fillRect(0,0,w,h);
  let sd=7; const rnd=()=>(sd=(sd*16807)%2147483647)/2147483647;
  for(let i=0;i<260;i++){ x.strokeStyle=`rgba(${150+rnd()*60|0},${185+rnd()*40|0},${215+rnd()*30|0},${.05+rnd()*.07})`; x.lineWidth=.5+rnd()*1.6; x.beginPath(); const a=rnd()*w, b=rnd()*h; x.moveTo(a,b); x.quadraticCurveTo(a+(rnd()-.5)*400,b+(rnd()-.5)*140,a+(rnd()-.5)*700,b+(rnd()-.5)*240); x.stroke(); }   // skate scuffs
  x.translate(w/2,h/2); x.scale(k,k);                                              // now in metres from centre ice, x along the rink
  const line=(x0,y0,x1,y1,c,lw)=>{ x.strokeStyle=c; x.lineWidth=lw; x.beginPath(); x.moveTo(x0,y0); x.lineTo(x1,y1); x.stroke(); };
  const RED='#c8202f', BL='#2457b8', RB=RW/2;
  line(0,-RB,0,RB,RED,.3); for(const e of[-1,1]) line(e*BLUE,-RB,e*BLUE,RB,BL,.3); for(const e of[-1,1]) line(e*GOALX,-RB,e*GOALX,RB,RED,.05);
  x.beginPath(); x.arc(0,0,CIRR,0,7); x.strokeStyle=BL; x.lineWidth=.06; x.stroke(); x.beginPath(); x.arc(0,0,.3,0,7); x.fillStyle=BL; x.fill();                  // centre circle and dot
  for(const e of[-1,1]) for(const f of[-1,1]){ x.beginPath(); x.arc(e*CIRX,f*CIRY,CIRR,0,7); x.strokeStyle=RED; x.lineWidth=.06; x.stroke(); x.beginPath(); x.arc(e*CIRX,f*CIRY,.3,0,7); x.fillStyle=RED; x.fill(); }
  for(const e of[-1,1]){ x.beginPath(); x.arc(e*GOALX,0,GW,e<0?-Math.PI/2:Math.PI/2,e<0?Math.PI/2:Math.PI*1.5); x.closePath(); x.fillStyle='rgba(120,175,230,.55)'; x.fill(); x.strokeStyle=RED; x.lineWidth=.05; x.stroke(); }   // creases
  x.restore();
  const t=new THREE.CanvasTexture(cv); t.minFilter=THREE.LinearFilter; t.generateMipmaps=false; return t; }
function board(sp){                                                                   // boards round the rink: kick plate, boards, cap, glass; a gap at the gate
  const A=sp.A,B=sp.B,Rr=sp.Rr, pts=[];
  const cs=[[1,1,0],[-1,1,90],[-1,-1,180],[1,-1,270]];
  for(const [sx,sy,a0] of cs) for(let k=0;k<=8;k++){ const a=(a0+k*11.25)*Math.PI/180; pts.push([sx*(A-Rr)+Math.cos(a)*Rr, sy*(B-Rr)+Math.sin(a)*Rr]); }
  const segs=[]; for(let i=0;i<pts.length;i++){ const a=pts[i], b=pts[(i+1)%pts.length];
    if(Math.abs(a[1]-sp.gs*B)<1e-4&&Math.abs(b[1]-sp.gs*B)<1e-4){ const lo=Math.min(a[0],b[0]), hi=Math.max(a[0],b[0]), g0=sp.gx-.8, g1=sp.gx+.8;
      if(g0>lo+.01) segs.push([[lo,a[1]],[Math.min(g0,hi),a[1]]]); if(g1<hi-.01) segs.push([[Math.max(g1,lo),a[1]],[hi,a[1]]]); }
    else segs.push([a,b]); }
  return segs; }
function build(g,rec,o){
  drop(); const sp=spec(rec); if(!sp) return;
  const RG=new THREE.Group(); RG.position.set(sp.cx,0,-sp.cy); RG.rotation.y=Math.atan2(sp.s,sp.c); g.add(RG);
  const mk=(c,e,op)=>new THREE.MeshLambertMaterial({color:c,emissive:e||0,side:THREE.DoubleSide,transparent:op!=null,opacity:op==null?1:op,depthWrite:op==null});
  // the ice
  const tex=iceTexture(), ice=new THREE.Mesh(new THREE.PlaneGeometry(RL*sp.sc,RW*sp.sc),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}));
  ice.rotation.x=-Math.PI/2; ice.position.y=.03; ice.renderOrder=2; RG.add(ice);
  // boards
  const segs=board(sp), arr={kick:[],wall:[],cap:[],glass:[]};
  const quad=(a,A,b,c,y0,y1)=>{ const ax=b[0],az=-b[1],bx=c[0],bz=-c[1]; A.push(ax,y0,az,bx,y0,bz,bx,y1,bz,ax,y0,az,bx,y1,bz,ax,y1,az); };
  for(const [a,b] of segs){ quad(0,arr.kick,a,b,0,.25); quad(0,arr.wall,a,b,.25,1.07); quad(0,arr.cap,a,b,1.07,1.13); quad(0,arr.glass,a,b,1.13,2.4); }
  const mats={kick:mk(0xe8c21a,0x2a2400),wall:mk(0xf2f2ef,0x2b2b2b),cap:mk(0x2c2f34),glass:mk(0xbfe0f2,0,.16)};
  for(const kk in arr){ const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(arr[kk],3)); geo.computeVertexNormals(); const m=new THREE.Mesh(geo,mats[kk]); m.renderOrder=kk==='glass'?5:3; RG.add(m); }
  // the nets, on the goal lines, opening towards centre ice
  const red=mk(0xd3202b,0x300508), netM=mk(0xf4f4f4,0,.4), gx=GOALX*sp.sc;
  for(const e of[-1,1]){ const n=new THREE.Group(); n.position.set(e*gx,0,0); RG.add(n);
    const box=(w,h,d,x,y,z,m)=>{ const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m); b.position.set(x,y,z); n.add(b); return b; };
    for(const z of[-GW/2,GW/2]){ box(.07,GH,.07,0,GH/2,z,red); box(.05,GH,.05,e*GD,GH/2,z,red); box(GD,.05,.05,e*GD/2,.03,z,red); box(GD,.05,.05,e*GD/2,GH,z,red); }
    box(.07,.07,GW,0,GH,0,red); box(.012,GH,GW,e*GD,GH/2,0,netM); box(GD,GH,.012,e*GD/2,GH/2,-GW/2,netM); box(GD,GH,.012,e*GD/2,GH/2,GW/2,netM); box(GD,.012,GW,e*GD/2,GH,0,netM); }
  // the puck (a little bigger than real so you can see it down the rink)
  const puck=new THREE.Mesh(new THREE.CylinderGeometry(PUCKR,PUCKR,.035,18),new THREE.MeshLambertMaterial({color:0x111214,emissive:0x050506})); puck.position.set(0,.05,0); puck.renderOrder=4; RG.add(puck);
  // scoreboard over centre ice
  const cv=document.createElement('canvas'); cv.width=512; cv.height=200; const sbT=new THREE.CanvasTexture(cv), sbM=new THREE.MeshBasicMaterial({map:sbT});
  const sb=new THREE.Group(); sb.position.set(0,Math.max(4,o.HC-2.2),0); RG.add(sb);
  sb.add(new THREE.Mesh(new THREE.BoxGeometry(3.4,1.3,.3),mk(0x1b1d21)));
  for(const z of[-.16,.16]){ const f=new THREE.Mesh(new THREE.PlaneGeometry(3.2,1.2),sbM); f.position.z=z; if(z<0) f.rotation.y=Math.PI; sb.add(f); }
  for(const e of[-1,1]) for(const z of[-.3,.3]){ const c=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,Math.max(1,o.HC-sb.position.y),4),mk(0x444444)); c.position.set(e*1.4,(o.HC-sb.position.y)/2+.6,z*.4); sb.add(c); }
  R.cur={rec,sp,RG,puck,cv,sbT,P:{x:0,y:0,vx:0,vy:0,in:0,t:0,cd:0}}; R.goals=0; R.shots=0; R.charge=0; score(); reset(0);
  for(const c of RG.children) c.traverse(m=>{ if(m.isMesh) m.frustumCulled=false; });
  showBtn(true); }
function score(){ const c=R.cur; if(!c) return; const x=c.cv.getContext('2d'); x.fillStyle='#0b0c0e'; x.fillRect(0,0,512,200);
  x.fillStyle='#ffb400'; x.font='bold 40px monospace'; x.textAlign='center'; x.fillText('GOALS',140,70); x.fillText('SHOTS',372,70);
  x.font='bold 96px monospace'; x.fillStyle='#ff3b30'; x.fillText(String(R.goals).padStart(2,' '),140,168); x.fillText(String(R.shots).padStart(2,' '),372,168); c.sbT.needsUpdate=true; }
function reset(dly){ const c=R.cur; if(!c) return; const P=c.P; P.x=0; P.y=0; P.vx=P.vy=0; P.in=0; P.t=dly||0; P.cd=0; c.puck.visible=!dly; if(!dly) c.puck.position.set(0,.05,0); }
function drop(){ R.cur=null; showBtn(false); R.charge=0; }

/* ---------- the shoot button ---------- */
const btn=document.getElementById('shootBtn');
function showBtn(v){ if(btn) btn.style.display=v?'':'none'; }
if(btn){ const dn=e=>{ e.preventDefault(); e.stopPropagation(); R.touch=true; btn.classList.add('on'); }, up=e=>{ e.stopPropagation(); R.touch=false; btn.classList.remove('on'); };
  btn.addEventListener('pointerdown',dn); btn.addEventListener('pointerup',up); btn.addEventListener('pointercancel',up); btn.addEventListener('pointerleave',up); btn.addEventListener('click',e=>e.stopPropagation()); }
function horn(){ try{ const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return; const c=R.ac||(R.ac=new AC()), t=c.currentTime;
  for(const f of[196,233]){ const o=c.createOscillator(), g=c.createGain(); o.type='sawtooth'; o.frequency.value=f; g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.12,t+.05); g.gain.exponentialRampToValueAtTime(.0001,t+1.3); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+1.4); } }catch(e){} }

/* ---------- the puck ---------- */
function step(rec,dt,pl){
  const c=R.cur; if(!c||c.rec.key!==rec.key) return; const sp=c.sp, P=c.P; dt=Math.min(dt,.05);
  const [px,py]=rc(sp,pl.x,pl.y), cosr=sp.c, sinr=sp.s, pvx=pl.vx*cosr+pl.vy*sinr, pvy=-pl.vx*sinr+pl.vy*cosr;
  const fx=Math.sin(pl.h)*cosr+Math.cos(pl.h)*sinr, fy=-Math.sin(pl.h)*sinr+Math.cos(pl.h)*cosr;                    // the way you face, in rink coordinates
  const held=(window.CTRL&&CTRL.held&&CTRL.held('shoot'))||R.touch, onI=inside(sp,px,py,-.2);
  if(held){ R.charge=Math.min(1,R.charge+dt/.9); }
  const fire=R.wasHeld&&!held; R.wasHeld=held; if(btn&&!R.touch) btn.classList.toggle('on',!!held);
  const gx=GOALX*sp.sc, dx=P.x-px, dy=P.y-py, dist=Math.hypot(dx,dy);
  if(P.t>0){ P.t-=dt; if(P.t<=0){ P.t=0; c.puck.visible=true; P.x=P.y=P.vx=P.vy=0; P.in=0; } else { if(fire) R.charge=0; return; } }
  if(P.cd>0) P.cd-=dt;
  if(fire){ const q=R.charge; R.charge=0;
    if(dist<2.1&&onI){ const sp2=13+q*17; P.vx=fx*sp2+pvx*.35; P.vy=fy*sp2+pvy*.35; P.cd=.4; R.shots++; score(); if(q>.7) toast('Slap shot!',900); } }
  if(!P.in&&P.cd<=0&&onI){
    const bx=px+fx*1.1, by=py+fy*1.1, bd=Math.hypot(P.x-bx,P.y-by);
    if(bd<.6&&Math.hypot(P.vx-pvx,P.vy-pvy)<9){ const k=Math.min(1,dt*16); P.x+=(bx-P.x)*k; P.y+=(by-P.y)*k; P.vx=pvx+(bx-P.x)*8; P.vy=pvy+(by-P.y)*8; }       // on your stick: it rides along
    else if(dist<.55){ const sp1=Math.hypot(pvx,pvy); if(sp1>.3){ P.vx=pvx*1.12+dx*3; P.vy=pvy*1.12+dy*3; } } }                                                  // run into it: it squirts away
  // slide it: a few small steps so a hard shot can't skip through the boards or a post
  const n=Math.max(1,Math.ceil(Math.hypot(P.vx,P.vy)*dt/.08)), h=dt/n;
  for(let i=0;i<n;i++){
    const ox=P.x, oy=P.y, ex=gx;
    P.x+=P.vx*h; P.y+=P.vy*h;
    const f=Math.exp(-h*.18); P.vx*=f; P.vy*=f;
    for(const e of[-1,1]){ const gl=e*ex;
      for(const z of[-GW/2,GW/2]){ const ddx=P.x-gl, ddy=P.y-z, d=Math.hypot(ddx,ddy); if(d<PUCKR+.04&&d>1e-6){ const nx=ddx/d, ny=ddy/d, vn=P.vx*nx+P.vy*ny; if(vn<0){ P.vx-=1.7*vn*nx; P.vy-=1.7*vn*ny; } P.x=gl+nx*(PUCKR+.04); P.y=z+ny*(PUCKR+.04); } }   // the posts
      const dep=e*(P.x-gl);                                                                                                               // metres past the goal line, into the net
      if(!P.in&&dep>0&&dep<GD&&Math.abs(P.y)<GW/2-.02){
        if(e*(ox-gl)<=0&&e*P.vx>0){ P.in=e; R.goals++; score(); toast('🚨 GOAL!',1800); horn(); P.t=0; P.vx*=.3; P.vy*=.3; c.goalT=2.4; }                  // crossed the line between the posts
        else if(Math.abs(oy)>=GW/2-.02){ P.y=Math.sign(oy)*(GW/2-.02+.001); P.vy=-P.vy*.3; }                                                    // through the side netting: no
        else if(e*(ox-gl)>=GD*.5){ P.x=gl+e*(GD+.001); P.vx=-P.vx*.3; }                                                                        // through the back: no
        else { P.x=gl-e*.001; P.vx=-P.vx*.4; } }
      if(P.in===e){ const lim=GD-.05; if(e*(P.x-gl)>lim){ P.x=gl+e*lim; P.vx*=-.2; } if(e*(P.x-gl)<.04){ P.x=gl+e*.04; P.vx=Math.abs(P.vx)*e*.2; } const yl=GW/2-.06; if(Math.abs(P.y)>yl){ P.y=Math.sign(P.y)*yl; P.vy*=-.2; } P.vx*=.97; P.vy*=.97; } }
    if(!P.in){                                                                                                                              // the boards: push back inside and bounce
      const A=sp.A-PUCKR, B=sp.B-PUCKR, Rr=sp.Rr; const qx=Math.abs(P.x)-(A-Rr), qy=Math.abs(P.y)-(B-Rr);
      if(qx>0&&qy>0){ const d=Math.hypot(qx,qy); if(d>Rr-PUCKR){ const nx=Math.sign(P.x)*qx/d, ny=Math.sign(P.y)*qy/d, vn=P.vx*nx+P.vy*ny; if(vn>0){ P.vx-=1.6*vn*nx; P.vy-=1.6*vn*ny; }
          const k=(Rr-PUCKR)/d; P.x=Math.sign(P.x)*((A-Rr)+qx*k); P.y=Math.sign(P.y)*((B-Rr)+qy*k); } }
      else { if(Math.abs(P.x)>A){ P.x=Math.sign(P.x)*A; if(P.x*P.vx>0) P.vx*=-.62; } if(Math.abs(P.y)>B){ P.y=Math.sign(P.y)*B; if(P.y*P.vy>0) P.vy*=-.62; } } } }
  if(P.in&&(c.goalT-=dt)<=0){ P.in=0; reset(.001); }
  if(Math.hypot(P.vx,P.vy)<.02){ P.vx=P.vy=0; }
  c.puck.position.set(P.x,.05,-P.y); }
// the nearest walk-in building (or the one you're in), for testing
function forceHere(){ const rs=(window.ROOFS&&ROOFS.doorsNear&&ROOFS.doorsNear())||[]; let best=null,bd=1e9;
  for(const r of rs){ const q=loc(r,S.lat,S.lng); const d=inP(r.p,q[0],q[1])?0:Math.hypot(q[0],q[1]); if(d<bd){ bd=d; best=r; } }
  if(best){ R.force.add(best.key); R.specs.delete(best.key); } return best&&best.key; }
window.RINK={arena:r=>!!spec(r),onIce,blocks,build,drop,step,force:r=>{ R.force.add(r.key); R.specs.delete(r.key); },forceHere,state:R,list:()=>R.list,reload:load,spec};
})();
