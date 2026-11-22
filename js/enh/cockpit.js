/* Cockpit view — drive from behind the wheel (owner's request 2026-11-20: "a new view for 1st person driving from
   behind the wheel… use that wheel [G29] to drive like we are behind the wheel of each of the cars… hyper realistic
   interior… the same interior for all of the javelin versions").

   How it works
   - The map camera sits at the driver's eye: MapLibre always orbits a centre point, so the centre is put eyeH·tan(pitch)
     ahead of the eye and the zoom is chosen so the camera's height above the ground is the eye height (pitch 85°, the
     map's maximum; wider field of view through map.transform.fov). The three.js car layer gets the same camera
     (scene units = pixels at that zoom, the car's centre at the origin), so traffic, signs and beams line up.
   - While in the cockpit the world is real size (EXAG 1 — the chase view's bigger car would make traffic and signs
     giant), and the player's own car body/photo is hidden: you are inside it.
   - The interior is its own small three.js scene in metres around the eye, drawn after the car layer with the depth
     buffer cleared (so it is always in front, and the windows are simply where there is no interior).
   - Three original interiors in each car's class and era (no badges or logos): a modern sport SUV (Explorer ST:
     digital cluster, landscape centre screen, red stitching, brushed-metal strip, flat-bottom wheel), a luxury SUV
     (Navigator: panoramic screen across the dash, floating centre screen, two-tone leather, wood), and a 1972 muscle
     car (all three Javelins: wrap-around driver's pod with round gauges, woodgrain, chrome, thin three-spoke wheel),
     and the owner's 2023 Tesla Model Y (issue #5: no instrument cluster — speed, gear, signals and the road picture on
     the left of the 15" landscape centre screen, the map on its right; a low flat dash with one full-width vent slot over
     a wood strip, two phone pads, round two-spoke wheel with scroll wheels, thin A pillars, white seats (or black, ⚙️),
     and the all-glass roof: a brighter cabin with the sky overhead).
   - Live: the steering wheel turns with the input (a G29's 900° = ±450° on screen, 1:1 with your hands), speedometer,
     tach (the engine sound's own drivetrain model), gear, fuel/temp, clock, outside temperature, trip, street name,
     speed limit, a moving map with the route on the centre screen, turn arrows; gauge lighting at night; sunlight and
     shadows from the real sun position (Medium/High); rain or snow on the windshield and automatic wipers.
   - ⚙️ View: Chase / Cockpit (saved ydView), C key, or a racing-wheel button learned in ⚙️ Wheel. Look around: drag
     (or hold Q / E to glance left / right). Cockpit view angle −/+ (ydCkFov, 45–60°). Only in the car — on foot, in
     the glider, tractor or boat the chase camera comes back, and the cockpit returns when you're in the car again. */
(function(){
'use strict';
const V3=THREE.Vector3, DEG=Math.PI/180;
const LSg=(k,d)=>{ try{ const v=localStorage.getItem(k); return v==null?d:v; }catch(e){ return d; } };
const LSs=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), lerp=(a,b,t)=>a+(b-a)*t, sstep=(a,b,x)=>{ const t=clamp((x-a)/(b-a),0,1); return t*t*(3-2*t); };

const CK={real:LSg('ydRealSpd','1')!=='0', hud:LSg('ydHud','1')!=='0', want:LSg('ydView','chase')==='cockpit', fov:clamp(+LSg('ydCkFov2',45)||45,30,60), on:false, exag:EXAG,
  cab:null, built:null, pad:.07, look:0, W:0, H:0, eyeWorld:null};
window.COCKPIT=CK;

/* ---------- per-car cabins (car frame: metres, x right, y up from the ground, z toward the back; car centre = 0) ---------- */
const SPECS={
  explorer:{style:'sport', ex:true, sunroof:{hw:.40,z0:.03,z1:.68}, eye:[-.38,1.37,.08], pitch:81,
    ws:{zB:-1.04,yB:1.09,hwB:.75,zT:-.33,yT:1.63,hwT:.67,bow:.05}, roof:{y:1.655,hw:.71,zR:1.75}, belt:1.16, winTop:1.58, door:.80, zBp:.52, zC:1.48,
    hood:{zr:-1.03,zf:-2.40,yr:1.085,yf:.985,hw:.99,crown:.03,gap:.80,nose:.07,crease:{x:.40,h:.016}},
    dash:[[1.062,-1.045],[1.086,-.84],[1.086,-.68],[1.064,-.615],[.99,-.595],[.87,-.605],[.75,-.55],[.62,-.43]],
    wheel:{c:[-.38,.975,-.37],r:.188,tilt:24,rim:.0175,flat:true},
    cluster:{c:[-.38,1.003,-.672],w:.31,h:.118},
    screen:{c:[.0,1.075,-.592],w:.205,h:.142,tilt:6},
    col:{dash:0x232427,top:0x1e1f22,trim:0x2a2b2f,lower:0x202124,seat:0x1d1d1f,head:0x3a3a3d,stitch:0,accent:'woodEx',carpet:0x111112},
    eng:'ecoboost30', vmaxG:160, red:6.25, tachMax:8},
  navigator:{style:'lux', eye:[-.42,1.565,.12], pitch:81,
    ws:{zB:-1.10,yB:1.30,hwB:.81,zT:-.30,yT:1.855,hwT:.73,bow:.05}, roof:{y:1.88,hw:.77,zR:1.95}, belt:1.36, winTop:1.79, door:.86, zBp:.58, zC:1.62,
    hood:{zr:-1.15,zf:-2.62,yr:1.288,yf:1.205,hw:1.05,crown:.022,gap:.86,nose:.08,crease:{x:.50,h:.012}},
    dash:[[1.272,-1.115],[1.292,-.94],[1.29,-.77],[1.268,-.70],[1.19,-.675],[1.06,-.69],[.93,-.635],[.79,-.50]],
    wheel:{c:[-.42,1.115,-.40],r:.192,tilt:24,rim:.0185,flat:false},
    pano:{x0:-.88,x1:.88,y:1.338,z:-.83,h:.072,tilt:22},
    screen:{c:[.02,1.13,-.652],w:.30,h:.17,tilt:14},
    col:{dash:0x2b2522,top:0x1f1b19,trim:0xc9b79c,lower:0xcbb99e,seat:0xd4c4a9,head:0xd9d1c3,stitch:0xa8977c,accent:'wood',carpet:0x3a332c},
    eng:'ecoboost35', vmaxG:160, red:6.0, tachMax:8},
  javelin:{style:'classic', eye:[-.38,1.03,.22], pitch:82,
    ws:{zB:-.78,yB:.862,hwB:.71,zT:-.09,yT:1.205,hwT:.60,bow:.065}, roof:{y:1.225,hw:.64,zR:1.02}, belt:.875, winTop:1.165, door:.76, zBp:null, zC:1.02,
    hood:{zr:-.80,zf:-2.33,yr:.862,yf:.765,hw:.95,crown:.012,gap:.70,nose:.05,humps:{x:.79,h:.065,w:.085}},
    dash:[[.85,-.795],[.872,-.62],[.868,-.52],[.848,-.47],[.77,-.455],[.64,-.475],[.52,-.40]],
    wheel:{c:[-.38,.70,-.205],r:.197,tilt:21,rim:.0125,flat:false},
    pod:{x0:-.74,x1:-.03,z:-.435,y0:.66,y1:.835},
    col:{dash:0x111111,top:0x0d0d0d,trim:0x121212,lower:0x121212,seat:0x141414,head:0x171717,stitch:0x2a2a2a,accent:'walnut',carpet:0x0f0f0f},
    eng:'amc401', vmaxG:140, red:5.2, tachMax:8}
};
// 2023 Model Y Long Range (the owner's car): seats white or black (⚙️ Seats, saved as ydSeatsY)
SPECS.modely={style:'ev', eye:[-.37,1.235,.20], pitch:81,
    ws:{zB:-1.13,yB:1.075,hwB:.70,zT:-.05,yT:1.57,hwT:.62,bow:.05}, roof:{y:1.595,hw:.70,zR:1.85}, glassRoof:true, belt:1.03, winTop:1.50, door:.79, zBp:.30, zC:1.55,
    hood:{zr:-1.15,zf:-2.18,yr:1.085,yf:.885,hw:.90,crown:.035,gap:.80,nose:.07},
    dash:[[1.02,-1.11],[.99,-.90],[.968,-.72],[.958,-.64],[.925,-.60],[.855,-.595],[.75,-.53],[.62,-.42]],
    wheel:{c:[-.37,.84,-.27],r:.185,tilt:22,rim:.017,flat:false},
    screen:{c:[.02,1.085,-.60],w:.335,h:.205,tilt:6},
    col:{dash:0x1c1c1e,top:0x18181a,trim:0x222224,lower:0x1d1d1f,seat:0xe7e4dd,head:0x2a2a2c,stitch:0,accent:'ash',carpet:0x111112},
    eng:'tesla', vmaxG:140, red:0, tachMax:1};
const SEATS={white:0xe7e4dd,black:0x1f1f21};
CK.seats=LSg('ydSeatsY','white')==='black'?'black':'white';
SPECS.tractor={style:'tractor', eye:[0,2.46,.9], pitch:76,
    wheel:{c:[0,2.03,.56],r:.205,tilt:52,rim:.017,flat:false},
    cluster:{c:[0,2.255,.36],w:.17,h:.075},
    screen:{c:[.5,2.2,.3],w:.2,h:.13},
    col:{dash:0x1a1b1d,top:0x161718,trim:0x2b2c2f,lower:0x1e1f21,seat:0x1d1e20,head:0x3d3f42,carpet:0x141516},
    eng:'jd68', vmaxG:60, red:2.3, tachMax:3, wipers:[.5]};
const specKey=k=>/^javelin/.test(k||'')?'javelin':k==='navigator'?'navigator':k==='tractor'?'tractor':k==='modely'?'modely':'explorer';

/* ---------- procedural textures ---------- */
function cnv(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
function rnd(seed){ let s=seed>>>0||1; return ()=>{ s=(s+0x6D2B79F5)>>>0; let t=s; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
function vnoise(seed,per){ const r=rnd(seed), G=new Float32Array(per*per); for(let i=0;i<G.length;i++) G[i]=r();
  const g=(x,y)=>G[((y%per+per)%per)*per+((x%per+per)%per)];
  return (x,y)=>{ const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi, u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
    return lerp(lerp(g(xi,yi),g(xi+1,yi),u),lerp(g(xi,yi+1),g(xi+1,yi+1),u),v); }; }
function heightTex(N,fn){ const c=cnv(N,N), x=c.getContext('2d'), id=x.createImageData(N,N), d=id.data;
  for(let j=0;j<N;j++) for(let i=0;i<N;i++){ const v=clamp(fn(i,j),0,1)*255, k=(j*N+i)*4; d[k]=d[k+1]=d[k+2]=v; d[k+3]=255; }
  x.putImageData(id,0,0); return c; }
function toNormal(hc,str){ const w=hc.width,h=hc.height, s=hc.getContext('2d').getImageData(0,0,w,h).data, o=cnv(w,h), x=o.getContext('2d'), id=x.createImageData(w,h), d=id.data;
  const H=(i,j)=>s[(((j+h)%h)*w+((i+w)%w))*4]/255;
  for(let j=0;j<h;j++) for(let i=0;i<w;i++){ const dx=(H(i+1,j)-H(i-1,j))*str, dy=(H(i,j+1)-H(i,j-1))*str, l=Math.hypot(dx,dy,1), k=(j*w+i)*4;
    d[k]=(-dx/l*.5+.5)*255; d[k+1]=(dy/l*.5+.5)*255; d[k+2]=(1/l*.5+.5)*255; d[k+3]=255; }
  x.putImageData(id,0,0); const t=new THREE.CanvasTexture(o); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t; }
const TX={};
function textures(){
  if(TX.done) return TX;
  const n1=vnoise(11,64), n2=vnoise(12,16), n3=vnoise(13,32), n4=vnoise(14,8);
  // soft-touch plastic: fine even grain
  TX.grain=toNormal(heightTex(256,(i,j)=>.5*n1(i/4,j/4)+.3*n3(i/8,j/8)+.2*n2(i/16,j/16)),1.6);
  // leather: pebbled cells with soft creases
  TX.leather=toNormal(heightTex(256,(i,j)=>{ const a=n1(i/3.2,j/3.2), b=n3(i/7,j/7); return .65*Math.pow(a,.7)+.35*(1-Math.abs(b*2-1)); }),2.6);
  // headliner fabric: fine weave
  TX.fabric=toNormal(heightTex(128,(i,j)=>.5+.25*Math.sin(i*1.6)*Math.sin(j*1.6)+.25*n1(i/2,j/2)),1.2);
  // carpet: coarse fuzz
  TX.carpet=toNormal(heightTex(128,(i,j)=>n1(i,j)*.7+n3(i/2,j/2)*.3),3);
  // brushed aluminium (colour map)
  { const W=512,Hh=64, c=cnv(W,Hh), x=c.getContext('2d'), r=rnd(5); x.fillStyle='#9aa0a6'; x.fillRect(0,0,W,Hh);
    for(let j=0;j<Hh;j++){ const v=150+r()*45|0; x.fillStyle=`rgba(${v},${v+3},${v+7},.55)`; x.fillRect(0,j,W,1); }
    for(let k=0;k<900;k++){ const v=120+r()*110|0; x.fillStyle=`rgba(${v},${v},${v+4},.25)`; x.fillRect(r()*W,r()*Hh,20+r()*140,1); }
    TX.alu=new THREE.CanvasTexture(c); TX.alu.wrapS=TX.alu.wrapT=THREE.RepeatWrapping; }
  // wood: dark walnut (Javelin) and light open-pore ash (Navigator)
  const wood=(dark,seed)=>{ const W=1024,Hh=256, c=cnv(W,Hh), x=c.getContext('2d'), id=x.createImageData(W,Hh), d=id.data, n=vnoise(seed,64), m=vnoise(seed+1,16);
    const A=dark?[52,28,14]:[150,118,84], B=dark?[96,56,28]:[196,166,128], C=dark?[30,15,8]:[118,88,60];
    for(let j=0;j<Hh;j++) for(let i=0;i<W;i++){ const w=j/16+1.6*n(i/90,j/30)+.6*m(i/200,j/24), g=.5+.5*Math.sin(w*Math.PI), f=Math.pow(g,dark?4:3)*.8+.2*n(i/3,j/1.5), pore=n(i/1.3,j/6)>.83?.6:1, k=(j*W+i)*4;
      for(let q=0;q<3;q++) d[k+q]=(A[q]+(B[q]-A[q])*(1-f)+(C[q]-A[q])*f*.6)*pore; d[k+3]=255; }
    x.putImageData(id,0,0); const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; return t; };
  TX.walnut=wood(true,31); TX.ash=wood(false,41);
  // speaker / perforated metal: dots
  { const c=cnv(128,128), x=c.getContext('2d'); x.fillStyle='#b8b2a8'; x.fillRect(0,0,128,128); x.fillStyle='#2a2826';
    for(let j=0;j<16;j++) for(let i=0;i<16;i++){ x.beginPath(); x.arc(i*8+4+(j%2)*4,j*8+4,1.7,0,7); x.fill(); }
    TX.perf=new THREE.CanvasTexture(c); TX.perf.wrapS=TX.perf.wrapT=THREE.RepeatWrapping; }
  // dash vinyl (Javelin): fine "leather-look" grain
  TX.vinyl=toNormal(heightTex(256,(i,j)=>.6*n1(i/2.2,j/2.2)+.4*n4(i/32,j/32)),2.2);
  TX.done=true; return TX;
}

/* ---------- environment (reflections): outdoor sky for the hood, paint and mirrors; darker cabin for the inside ---------- */
function gradEnv(top,hor,gnd,band,low){
  const es=new THREE.Scene(), geo=new THREE.SphereGeometry(10,32,low?64:16), pos=geo.attributes.position, col=[], c=new THREE.Color(),
        T=new THREE.Color(top), Hc=new THREE.Color(hor), G=new THREE.Color(gnd), B=band?new THREE.Color(band):null;
  for(let i=0;i<pos.count;i++){ const y=pos.getY(i)/10; if(y>=0) c.copy(Hc).lerp(T,Math.pow(y,.55)); else c.copy(Hc).lerp(G,Math.pow(-y,.35));
    if(B&&!low&&y>-.05&&y<.35) c.lerp(B,.55*(1-Math.abs(y-.15)/.2>0?1-Math.abs(y-.15)/.2:0));
    if(B&&low){ const t=1-Math.abs(y-.08)/.17; if(t>0) c.lerp(B,.8*Math.min(1,t*1.8)); }   // skyline: just above the horizon
    col.push(c.r,c.g,c.b); }
  geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  es.add(new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide})));
  const pm=new THREE.PMREMGenerator(renderer), t=pm.fromScene(es,.03).texture; pm.dispose(); geo.dispose(); return t;
}
const ENV={out:null,inn:null,key:''};
function skyCols(){ const k=YD.AT?(YD.AT.k||0):0, bg=(document.body&&getComputedStyle(document.body).backgroundColor)||'rgb(156,200,236)';
  const sky=new THREE.Color(); try{ const m=bg.match(/\d+/g); sky.setRGB(m[0]/255,m[1]/255,m[2]/255); }catch(e){ sky.setHex(0x9cc8ec); }
  const hor=sky.clone().lerp(new THREE.Color(k>.5?0x1c2433:0xeef3f8),.55), gnd=new THREE.Color(k>.5?0x0b0c0e:0x3d3f3b);
  return {k,sky,hor,gnd}; }
function updateEnv(force){
  const s=skyCols(), key=s.sky.getHexString()+s.k.toFixed(1);
  if(!force&&key===ENV.key) return; ENV.key=key;
  const o=ENV.out, i=ENV.inn;
  ENV.out=gradEnv(s.sky,s.hor,s.gnd,s.sky.clone().lerp(new THREE.Color(s.k>.5?0x0d1014:0x4c5548),.75),true); ENV.hor=s.hor.clone();   // paint reflects the skyline, not just sky
  const d=1-.75*s.k, cab=new THREE.Color(0x2a2a2c).multiplyScalar(d), win=s.hor.clone().multiplyScalar(.9);
  ENV.inn=gradEnv(cab,new THREE.Color(0x111214).multiplyScalar(d),new THREE.Color(0x060607),win);
  for(const m of MATS) if(m.envMap!==undefined){ m.envMap=m.userData.out?ENV.out:ENV.inn; m.needsUpdate=true; }
  if(o) o.dispose(); if(i) i.dispose();
}

/* ---------- materials + geometry helpers ---------- */
const MATS=[];
function M(o){ o=Object.assign({side:THREE.DoubleSide,roughness:.7,metalness:0},o); const out=!!o.out, ei=o.env; delete o.out; delete o.env;
  const m=o.clearcoat!=null?new THREE.MeshPhysicalMaterial(o):new THREE.MeshStandardMaterial(o);
  m.userData.out=out; m.envMap=out?ENV.out:ENV.inn; m.envMapIntensity=ei!=null?ei:1; MATS.push(m); return m; }
function rep(t,u,v){ const c=t.clone(); c.needsUpdate=true; c.repeat.set(u,v); c.wrapS=c.wrapT=THREE.RepeatWrapping; return c; }
function mesh(g,m,par,cast,recv){ const o=new THREE.Mesh(g,m); o.castShadow=cast!==false; o.receiveShadow=recv!==false; if(par) par.add(o); return o; }
function grid(nu,nv,f){ const pos=[],uv=[],idx=[];
  for(let j=0;j<=nv;j++) for(let i=0;i<=nu;i++){ const u=i/nu, v=j/nv, p=f(u,v); pos.push(p[0],p[1],p[2]); uv.push(u,v); }
  for(let j=0;j<nv;j++) for(let i=0;i<nu;i++){ const a=j*(nu+1)+i, b=a+1, c=a+nu+1, d=c+1; idx.push(a,c,b,b,c,d); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx); g.computeVertexNormals(); return g; }
// a bar along a curve with an elliptical cross-section: w across, t along `face` (the direction its broad side faces)
function bar(pts,w,t,face,seg,rs){ seg=seg||24; rs=rs||12;
  const c=new THREE.CatmullRomCurve3(pts.map(p=>new V3(p[0],p[1],p[2])),false,'centripetal'), fv=new V3(face[0],face[1],face[2]).normalize();
  const W=Array.isArray(w)?w:[w,w], Tt=Array.isArray(t)?t:[t,t];
  return grid(rs,seg,(u,v)=>{ const p=c.getPoint(v), T=c.getTangent(v), A=new V3().crossVectors(T,fv).normalize(), B=new V3().crossVectors(A,T).normalize(), a=u*Math.PI*2;
    const ww=lerp(W[0],W[1],v)/2, tt=lerp(Tt[0],Tt[1],v)/2; const q=p.clone().addScaledVector(A,Math.cos(a)*ww).addScaledVector(B,Math.sin(a)*tt); return [q.x,q.y,q.z]; }); }
function rbox(w,h,d,r,cr){ r=Math.min(r,d/2-.0005,w/2-.0005,h/2-.0005); const iw=w/2-r, ih=h/2-r, k=Math.min(cr==null?r*1.5:cr,iw*.99,ih*.99), s=new THREE.Shape();
  s.moveTo(-iw+k,-ih); s.lineTo(iw-k,-ih); s.quadraticCurveTo(iw,-ih,iw,-ih+k); s.lineTo(iw,ih-k); s.quadraticCurveTo(iw,ih,iw-k,ih); s.lineTo(-iw+k,ih); s.quadraticCurveTo(-iw,ih,-iw,ih-k); s.lineTo(-iw,-ih+k); s.quadraticCurveTo(-iw,-ih,-iw+k,-ih);
  const g=new THREE.ExtrudeGeometry(s,{depth:Math.max(.0005,d-2*r),bevelEnabled:r>0,bevelThickness:r,bevelSize:r,bevelSegments:3,curveSegments:6});
  g.translate(0,0,-(d-2*r)/2); g.computeVertexNormals(); return g; }
function canvasTex(w,h,dyn){ const c=cnv(w,h), t=new THREE.CanvasTexture(c);
  if(dyn){ t.generateMipmaps=false; t.minFilter=THREE.LinearFilter; }   // redrawn while driving: rebuilding mipmaps on every upload costs more than the screen itself
  else { t.minFilter=THREE.LinearMipmapLinearFilter; t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy()); } return {c,x:c.getContext('2d'),t}; }

/* ---------- the shared body shell: hood and fenders, cowl, windshield, pillars, roof, doors, mirrors ---------- */
function shell(G,P,mats){
  const ws=P.ws, hd=P.hood, eyeX=P.eye[0];
  // hood + fender tops: one painted surface across the car with the panel gaps (and the Javelin's stripes) painted on
  { const T=canvasTex(1024,1024), x=T.x, pc='#'+new THREE.Color(CARSPEC.paint||0x333333).getHexString();
    x.fillStyle=pc; x.fillRect(0,0,1024,1024);
    if(P.style==='classic'){ x.fillStyle='#b8902f'; const cx=512; x.fillRect(cx-70,30,140,900); x.fillRect(cx-300,860,600,70);   // gold T-stripe
      x.fillStyle=pc; x.fillRect(cx-58,30,116,830); x.fillRect(cx-288,872,576,46); x.fillStyle='#b8902f'; x.fillRect(cx-46,30,92,818); x.fillRect(cx-276,884,552,22); }
    if(hd.crease){ const cu=hd.crease.x/hd.hw; for(const s of [-1,1]){ const px=512+s*cu*512;   // the creases catch the light on their crest, shade just outboard
        x.fillStyle='rgba(255,255,255,.16)'; x.fillRect(px-2,0,4,1024); x.fillStyle='rgba(0,0,0,.18)'; x.fillRect(s>0?px+2:px-12,0,10,1024); } }
    const g=hd.gap/hd.hw; x.fillStyle='rgba(0,0,0,.92)'; for(const s of [-1,1]){ const px=512+s*g*512; x.fillRect(px-3,0,6,1024); } x.fillRect(0,4,1024,6);
    T.t.anisotropy=8; T.t.needsUpdate=true;
    const m=M({map:T.t,color:0xffffff,metalness:.08,roughness:.42,clearcoat:1,clearcoatRoughness:.05,out:true,env:.55});
    const hu=hd.humps;
    const geo=grid(64,48,(u,v)=>{ const s=u*2-1, as=Math.abs(s), z=lerp(hd.zr,hd.zf,v);
      let y=lerp(hd.yr,hd.yf,Math.pow(v,1.15))+hd.crown*(1-s*s);
      if(hu){ const xs=as*hd.hw; y+=hu.h*Math.exp(-Math.pow((xs-hu.x)/hu.w,2))*sstep(0,.15,v)*(1-.3*v); }
      if(hd.crease){ const xs=as*hd.hw, c=hd.crease; y+=c.h*(1-sstep(c.x-.025,c.x+.035,xs))*(1-.4*v); }   // raised centre section between two sharp creases (Explorer / Navigator)
      if(as>.86) y-=.11*Math.pow((as-.86)/.14,2);                   // fender tops roll down toward the sides
      if(v>.93) y-=hd.nose*Math.pow((v-.93)/.07,2);                 // and the nose rolls over
      const hw=hd.hw*(1-.05*Math.pow(v,3)); return [s*hw*(as>.97?1-.02*(as-.97)/.03:1),y,z]; });
    mesh(geo,m,G,false,true); }
  // cowl: black plastic between hood and glass, with the wipers
  { const m=M({color:0x0c0c0d,roughness:.85,normalMap:rep(textures().grain,6,1)});
    mesh(grid(24,6,(u,v)=>{ const s=u*2-1; return [s*lerp(hd.hw*.9,ws.hwB+.03,v),lerp(hd.yr-.035,ws.yB-.004,v),lerp(hd.zr-.16,ws.zB+.008,v)]; }),m,G,false); }   // runs forward under the hood's back edge, so no slit of road shows between them
  // under the hood: a dark engine-bay floor from the cowl to the nose (looking just under the hood's back edge you saw the road through the empty bay)
  mesh(grid(8,4,(u,v)=>{ const s=u*2-1; return [s*lerp(ws.hwB+.05,hd.hw*1.02,v),lerp(hd.yr-.035,hd.yf-.14,v),lerp(hd.zr-.16,hd.zf+.06,v)]; }),M({color:0x070708,roughness:.95}),G,false);
  // the dash top meets the glass: close the slit between the dash's front edge and the windshield base (the ground showed through)
  if(P.dash){ const y0=P.dash[0][0]-.015, z0=P.dash[0][1]; mesh(grid(16,2,(u,v)=>{ const sx=u*2-1; return [sx*(ws.hwB+.02),lerp(y0,ws.yB+.006,v),lerp(z0+.004,ws.zB+.004,v)-ws.bow*(1-sx*sx)*Math.sin(Math.PI*.3)*v]; }),
      M({color:P.col.top,roughness:.85,normalMap:rep(textures().grain,8,1)}),G,false); }
  // windshield glass + black ceramic band and (modern) dotted frit, light tint shade band at the top
  const wsP=(u,v)=>{ const s=u*2-1; return [s*lerp(ws.hwB,ws.hwT,v),lerp(ws.yB,ws.yT,v),lerp(ws.zB,ws.zT,v)-ws.bow*(1-s*s)*Math.sin(Math.PI*(.3+.7*v))]; };
  { const T=canvasTex(1024,512), x=T.x, W=1024, H=512; x.clearRect(0,0,W,H);
    const top=x.createLinearGradient(0,0,0,H*.22); top.addColorStop(0,P.style==='classic'?'rgba(20,70,60,.55)':'rgba(20,40,70,.45)'); top.addColorStop(1,'rgba(20,40,70,0)'); x.fillStyle=top; x.fillRect(0,0,W,H*.22);
    x.fillStyle='rgba(60,80,90,.06)'; x.fillRect(0,0,W,H);
    if(P.style!=='classic'){ x.fillStyle='#050505'; const b=(w)=>{ x.fillRect(0,0,W,w*1.3); x.fillRect(0,H-w,W,w); x.fillRect(0,0,w,H); x.fillRect(W-w,0,w,H); }; b(14);
      for(let k=0;k<4;k++){ const r=2.6-k*.55, o=15+k*7; for(let i=o;i<W-o;i+=7){ x.beginPath(); x.arc(i,o+4,r,0,7); x.arc(i,H-o-2,r,0,7); x.fill(); } for(let j=o;j<H-o;j+=7){ x.beginPath(); x.arc(o,j,r,0,7); x.arc(W-o,j,r,0,7); x.fill(); } }
      x.fillRect(W/2-70,14,140,70); }                               // the mirror/sensor patch
    else { x.fillStyle='#0a0a0a'; x.fillRect(0,0,W,6); x.fillRect(0,H-6,W,6); }
    const gm=new THREE.MeshBasicMaterial({map:T.t,transparent:true,depthWrite:false,side:THREE.DoubleSide});
    const g=mesh(grid(24,12,(u,v)=>wsP(u,v)),gm,G,false,false); g.renderOrder=5;
    // faint sky reflection on the glass
    const rm=M({color:0x000000,roughness:.02,metalness:1,transparent:true,opacity:.05,depthWrite:false,out:true,env:1});
    const r=mesh(grid(12,6,(u,v)=>{ const p=wsP(u,v); return [p[0],p[1],p[2]+.002]; }),rm,G,false,false); r.renderOrder=6; }
  // A-pillars (inner trim), front header with sun visors, headliner, roof rails
  const pil=P.style==='classic'?{w:.055,t:.04}:{w:P.style==='lux'?.115:P.style==='ev'?.08:.105,t:P.style==='ev'?.055:.07};
  const trimM=M({color:P.col.head,roughness:.95,normalMap:rep(textures().fabric,20,20),normalScale:new THREE.Vector2(.6,.6)});
  const hardTrim=M({color:P.style==='classic'?0x0f0f0f:P.col.trim,roughness:.8,normalMap:rep(textures().grain,4,4)});
  for(const s of [-1,1]){ const bx=s*(ws.hwB+.012), tx=s*(ws.hwT+.012);
    mesh(bar([[bx,ws.yB-.02,ws.zB-.005],[lerp(bx,tx,.5),lerp(ws.yB,ws.yT,.5),lerp(ws.zB,ws.zT,.5)+.012],[tx,ws.yT+.01,ws.zT+.02]],[pil.w*1.1,pil.w],pil.t,[-s*.6,0,1]),P.style==='classic'?hardTrim:trimM,G); }
  mesh(bar([[-ws.hwT-.01,ws.yT+.015,ws.zT+.03],[0,ws.yT+.03,ws.zT+.04],[ws.hwT+.01,ws.yT+.015,ws.zT+.03]],.09,.05,[0,-1,.4]),trimM,G);
  // backing between the glass's top edge and the headliner (looking up you saw a sliver of sky there)
  mesh(grid(16,2,(u,v)=>{ const s=u*2-1; return [s*(ws.hwT+.02),lerp(ws.yT-.012,P.roof.y+.01,v),lerp(ws.zT-.012,ws.zT+.05,v)]; }),M({color:0x0a0a0b,roughness:.9}),G,false);
  { const R=P.roof, rf=(u,v)=>{ const s=u*2-1, z=lerp(ws.zT-.02,R.zR,v); return [s*R.hw,R.y-.025*s*s-(v>.85?.06*Math.pow((v-.85)/.15,2):0),z]; };
    if(P.sunroof){ const S=P.sunroof, zA=ws.zT-.02, V=z=>(z-zA)/(R.zR-zA), U=x=>(x/R.hw+1)/2, u0=U(-S.hw), u1=U(S.hw), v0=V(S.z0), v1=V(S.z1);
      const part=(ua,ub,va,vb,nu,nv)=>mesh(grid(nu,nv,(u,v)=>rf(lerp(ua,ub,u),lerp(va,vb,v))),trimM,G);
      part(0,1,0,v0,16,3); part(0,1,v1,1,16,10); part(0,u0,v0,v1,3,8); part(u1,1,v0,v1,3,8);
      sunroof(G,P,R,rf,trimM,mats); }
    else if(!P.glassRoof) mesh(grid(16,16,rf),trimM,G);
    else { // the Model Y's glass roof: tinted glass from the windshield header to the hatch (you see the sky), a black frit
      // border, and the black cross-member over the B pillars; it doesn't shade the cabin like a headliner would
      const T=canvasTex(256,512), x=T.x; x.fillStyle='rgba(8,16,26,.5)'; x.fillRect(0,0,256,512);
      x.fillStyle='rgba(6,6,7,.97)'; x.fillRect(0,0,20,512); x.fillRect(236,0,20,512); x.fillRect(0,0,256,14); x.fillRect(0,498,256,14);
      for(let k=0;k<3;k++){ x.globalAlpha=.75-k*.22; for(let j=12;j<500;j+=7){ x.beginPath(); x.arc(24+k*6,j,2.2-k*.5,0,7); x.arc(232-k*6,j,2.2-k*.5,0,7); x.fill(); } } x.globalAlpha=1;
      const gm=new THREE.MeshBasicMaterial({map:T.t,transparent:true,depthWrite:false,side:THREE.DoubleSide});
      const rg=mesh(grid(16,16,rf),gm,G,false,false); rg.renderOrder=5;
      const zb=(P.zBp||.3)+.05; mesh(bar([[-R.hw,R.y-.035,zb],[0,R.y-.005,zb],[R.hw,R.y-.035,zb]],.07,.035,[0,-1,0],16,8),trimM,G); }
    for(const s of [-1,1]) mesh(bar([[s*(ws.hwT+.01),ws.yT+.005,ws.zT+.03],[s*(R.hw+.01),P.winTop+.04,ws.zT+.5],[s*(R.hw+.015),P.winTop+.04,R.zR-.1]],.07,.06,[-s,-.3,0]),trimM,G); }
  // sun visors folded up against the headliner
  for(const s of [-1,1]){ const v=mesh(rbox(.36,.18,.024,.01,.03),trimM,G); v.position.set(s<0?eyeX:-eyeX,P.roof.y-.035,ws.zT+.14); v.rotation.x=-Math.PI/2+.08; }
  // Explorer overhead console (owner 2026-11-21, a photo of the real one: "put this at the top by the mirror")
  if(P.ex) overheadEx(G,P,ws);
  // rear-view mirror
  { const hm=M({color:0x111112,roughness:.5}), mir=M({color:0xffffff,metalness:1,roughness:.04,out:true,env:1.15});
    const cx=0, cy=ws.yT-(P.style==='classic'?.085:.125), vg=(cy+.05-ws.yB)/(ws.yT-ws.yB), zg=lerp(ws.zB,ws.zT,vg)-ws.bow*Math.sin(Math.PI*(.3+.7*vg)), cz=zg+.075;
    const grp=new THREE.Group(); grp.position.set(cx,cy,cz); G.add(grp);
    const mw=P.style==='classic'?.225:.255, mh=P.style==='classic'?.05:.06;
    const h=mesh(rbox(mw+.015,mh+.012,.035,.012,.03),hm,grp); h.position.z=-.012;
    const g=mesh(MIR.uv(new THREE.PlaneGeometry(mw,mh),.30,.70),new THREE.MeshBasicMaterial({map:MIR.tex(),toneMapped:false}),grp,false,false); g.position.z=.0062; MIR.mats.push(g.material);
    const fr=canvasTex(512,128); drawRearFrame(fr.x,P); const fo=mesh(new THREE.PlaneGeometry(mw,mh),new THREE.MeshBasicMaterial({map:fr.t,transparent:true}),grp,false,false); fo.position.z=.0066; MIR.frames.push(fo.material);
    mesh(new THREE.PlaneGeometry(mw,mh),M({color:0,metalness:1,roughness:.05,transparent:true,opacity:.12,depthWrite:false,out:true}),grp,false,false).position.z=.007;
    grp.lookAt(new V3(...P.eye).add(new V3(0,0,.3)));               // aimed back at the driver (and a little behind)
    const stalk=mesh(bar([[cx,cy+.025,cz-.015],[cx,cy+.05,zg+.012]],.016,.016,[0,1,0],4,8),hm,G); const ft=mesh(rbox(.05,.035,.012,.004,.008),hm,G); ft.position.set(cx,cy+.055,zg+.008); ft.rotation.x=-Math.atan2(ws.zT-ws.zB,ws.yT-ws.yB)+Math.PI/2*0; }
  // doors: inner panels with armrest, pull, window sill cap, switch pack (driver), speaker
  const doorM=M({color:P.col.lower,roughness:.62,normalMap:rep(textures().leather,14,9),normalScale:new THREE.Vector2(.22,.22)});
  const sillM=M({color:P.col.top,roughness:.75,normalMap:rep(textures().grain,8,2)});
  const zA=ws.zB+.06, zE=P.zBp!=null?P.zBp:P.zC-.1;
  for(const s of [-1,1]){ const xd=s*P.door;
    mesh(grid(24,20,(u,v)=>{ const z=lerp(zA,zE,u), y=lerp(.34,P.belt,v), arm=.07*Math.exp(-Math.pow((y-(P.belt-.27))/.05,2))*sstep(.05,.3,u), top=.05*sstep(.88,1,v);
      return [xd-s*(arm+top+.02*Math.sin(Math.PI*v)),y,z]; }),doorM,G);
    mesh(bar([[xd-s*.03,P.belt+.01,zA],[xd-s*.045,P.belt+.018,(zA+zE)/2],[xd-s*.03,P.belt+.01,zE]],.075,.03,[0,1,0]),sillM,G);
    const sp=mesh(new THREE.CircleGeometry(.075,24),M({map:rep(textures().perf,3,3),roughness:.5,metalness:.6}),G,false); sp.position.set(xd-s*.012,.52,lerp(zA,zE,.25)); sp.rotation.y=s*Math.PI/2;
    if(s<0&&P.style!=='classic'){ const pk=mesh(rbox(.06,.025,.22,.008,.01),M({color:0x101011,roughness:.3,metalness:.2}),G); pk.position.set(xd+.085,P.belt-.255,lerp(zA,zE,.45)); }
    if(P.style==='classic'){ const cr=M({color:0xd9dde2,metalness:1,roughness:.12,out:true}); const h=mesh(bar([[xd-s*.035,P.belt-.15,lerp(zA,zE,.3)],[xd-s*.07,P.belt-.15,lerp(zA,zE,.3)+.03],[xd-s*.09,P.belt-.17,lerp(zA,zE,.3)+.08]],.014,.014,[0,1,0],8,8),cr,G);
      const wc=mesh(new THREE.TorusGeometry(.03,.006,8,20),cr,G); wc.position.set(xd-s*.04,P.belt-.25,lerp(zA,zE,.55)); wc.rotation.y=Math.PI/2; } }
  // B pillar (not on the pillarless Javelin hardtop), rear doors, C pillar, rear seats — seen when you look round
  if(P.zBp!=null) for(const s of [-1,1]) mesh(bar([[s*(P.door-.01),P.belt,P.zBp],[s*(P.roof.hw-.005),P.winTop+.03,P.zBp+.03]],.13,.08,[-s,0,0],4,10),trimM,G);
  for(const s of [-1,1]){ mesh(bar([[s*(P.door-.02),P.belt,P.zC],[s*(P.roof.hw-.01),P.winTop+.02,P.zC+.12]],P.style==='classic'?.30:.2,.09,[-s,0,0],4,10),trimM,G);
    if(P.zBp!=null) mesh(grid(10,8,(u,v)=>[s*(P.door-.01),lerp(.34,P.belt,v),lerp(P.zBp+.06,P.zC,u)]),doorM,G); }
  { const seatM=M({color:P.style==='ev'?SEATS[CK.seats]:P.col.seat,roughness:.6,normalMap:rep(textures().leather,9,9),normalScale:new THREE.Vector2(.25,.25)});
    const zr=(P.zBp!=null?P.zBp:.5)+.55, rb=mesh(rbox(P.door*2-.1,.55,.16,.06,.12),seatM,G); rb.position.set(0,P.belt+.02,zr+.18); rb.rotation.x=-.18;
    const rc=mesh(rbox(P.door*2-.1,.14,.5,.05,.1),seatM,G); rc.position.set(0,P.belt-.36,zr-.05);
    // front passenger seat
    const px=-eyeX, sb=mesh(rbox(.52,.66,.14,.05,.1),seatM,G); sb.position.set(px,P.belt+.05,P.eye[2]+.25); sb.rotation.x=-.2;
    for(const q of [-1,1]){ const bl=mesh(rbox(.09,.6,.17,.04,.06),seatM,G); bl.position.set(px+q*.25,P.belt+.04,P.eye[2]+.22); bl.rotation.set(-.2,q*.25,0); }
    const sc=mesh(rbox(.52,.14,.52,.05,.1),seatM,G); sc.position.set(px,P.belt-.42,P.eye[2]-.12);
    if(P.style!=='classic'){ const hr=mesh(rbox(.26,.17,.1,.04,.06),seatM,G); hr.position.set(px,P.belt+.47,P.eye[2]+.34); }
    else { const hr=mesh(rbox(.24,.14,.09,.035,.05),seatM,G); hr.position.set(px,P.belt+.44,P.eye[2]+.32); } }
  // carpet / floor
  mesh(grid(8,8,(u,v)=>[lerp(-P.door,P.door,u),.30+.04*Math.sin(u*Math.PI),lerp(ws.zB+.2,P.zC,v)]),M({color:P.col.carpet,roughness:1,normalMap:rep(textures().carpet,12,12)}),G);
  // outside mirrors
  for(const s of [-1,1]){ const mir=M({color:0xc8ccd0,metalness:1,roughness:.03,out:true,env:.8});
    if(P.style==='classic'){ if(s>0) continue;
      const cr=M({color:0xd9dde2,metalness:1,roughness:.1,out:true}), g=new THREE.Group(); g.position.set(s*(P.door+.19),P.belt+.07,zA+.12); G.add(g);
      const hs=mesh(new THREE.SphereGeometry(.06,24,16,0,Math.PI*2,0,Math.PI/2),cr,g); hs.rotation.x=-Math.PI/2; hs.scale.set(1.25,1,.8);
      const gl=mesh(MIR.uv(new THREE.CircleGeometry(.058,28),0,.36),new THREE.MeshBasicMaterial({map:MIR.tex(),toneMapped:false}),g,false); gl.position.z=.002; gl.scale.set(1.25,1,1); MIR.mats.push(gl.material);
      mesh(bar([[s*(P.door+.02),P.belt+.0,zA+.12],[s*(P.door+.12),P.belt+.05,zA+.1],[s*(P.door+.17),P.belt+.07,zA+.1]],.02,.015,[0,0,1],6,8),cr,G);
      g.lookAt(new V3(...P.eye).add(new V3(.25,0,1.5))); continue; }
    // modern door mirror (owner 2026-11-21: "the mirrors on the explorer are just rectangles"): the glass is a rounded
    // trapezoid, short on the inboard edge and tall outboard with a big rounded lower-outer corner, in a black surround; the
    // body-colour housing wraps round it and swells out behind; a black foot on the door with the sail filling the window corner
    const lux=P.style==='lux', ev=P.style==='ev', ex=!!P.ex, W=lux?.27:ex?.25:ev?.235:.245, H=lux?.185:ex?.19:ev?.15:.165, g=new THREE.Group(); g.position.set(s*(P.door+.235),P.belt+(ex?.085:.075),zA+.16); G.add(g);
    const o=-s;                                                     // the group faces the driver: +x is the driver's right, so outboard is -s
    const shp=(w,h,grow,inb)=>ex?mirShapeEx(w,h,o,grow,inb):(ev?mirShapeEV:mirShape)(w+grow*2,h+grow*2,o);
    const glass=new THREE.ShapeGeometry(shp(W,H,0),12); uvFit(glass);
    const gl=mesh(MIR.uv(glass,s<0?0:.64,s<0?.36:1),new THREE.MeshBasicMaterial({map:MIR.tex(),toneMapped:false}),g,false); gl.position.z=.004; MIR.mats.push(gl.material);
    const sf=canvasTex(256,160); drawSideFrame(sf.x,s,ex); const sg=new THREE.ShapeGeometry(shp(W,H,0),12); uvFit(sg);
    const so=mesh(sg,new THREE.MeshBasicMaterial({map:sf.t,transparent:true}),g,false,false); so.position.z=.0045;
    mesh(new THREE.ShapeGeometry(shp(W,H,ex?.009:.008),12),M({color:0x060607,roughness:.5}),g,false).position.z=.0025;   // black glass surround
    // the Explorer's (owner 2026-11-21, a photo of the real one): a thick black textured housing, not body colour
    const pm=ex?M({color:0x161719,roughness:.72,normalMap:rep(textures().grain,5,5),normalScale:new THREE.Vector2(.15,.15),out:true,env:.35})
              :M({color:CARSPEC.paint||0x333333,metalness:.08,roughness:.42,clearcoat:1,clearcoatRoughness:.05,out:true,env:.55});
    if(ex){ // blind-spot symbol etched in the glass near its outer top corner: grey, lit amber when something's alongside
      const T=canvasTex(128,128), x=T.x; x.clearRect(0,0,128,128); x.fillStyle='#fff'; x.strokeStyle='#fff'; x.lineWidth=7; x.lineCap='round';
      x.fillRect(30,46,30,44); x.fillRect(36,34,18,14); x.clearRect(36,52,18,12);                 // a little car seen from behind
      for(const r of [20,34]){ x.beginPath(); x.arc(52,68,r+22,-.55,.55); x.stroke(); }          // and the waves beside it
      const bm=new THREE.MeshBasicMaterial({map:T.t,transparent:true,color:0x9a9ea4,opacity:.55,depthWrite:false,toneMapped:false});
      const bi=mesh(new THREE.PlaneGeometry(.026,.026),bm,g,false,false); bi.position.set(ex?-o*(W/2-.04):-o*(W/2-.042),ex?H/2-.34*H:H/2-.055,.0052); if(o<0) bi.scale.x=-1;
      (mats.blis||(mats.blis={}))[s]=bm; }
    const hg=new THREE.ExtrudeGeometry(ex?shp(W,H,.014,.05):shp(W,H,.012),{depth:ex?.035:.045,bevelEnabled:true,bevelThickness:ex?.03:.035,bevelSize:ex?.01:.012,bevelSegments:5,curveSegments:12});
    hg.translate(0,0,ex?-.065:-.045-.035); const pz=hg.attributes.position;
    for(let k=0;k<pz.count;k++){ const z=pz.getZ(k); if(z<-.05){ const t=(-.05-z)/.065; pz.setX(k,pz.getX(k)*(1-(ex?.34:.22)*t)+(ex?-o*.03:o*.012)*t); pz.setY(k,pz.getY(k)*(1-(ex?.3:.18)*t)+(ex?.022*t:0)); } }   // the back of the shell tapers and leans outboard
    hg.computeVertexNormals(); mesh(hg,pm,g);
    const blk=M({color:0x0b0b0c,roughness:.7,normalMap:rep(textures().grain,2,2)});
    // (the Explorer has no sail triangle: owner 2026-11-21, "remove those triangles")
    // Explorer (owner 2026-11-21: "it should attach to the car with the proper housing instead of the arm"): no arm — the
    // housing itself runs inboard as a thick neck and widens onto its mount on the door at the window's front corner
    if(ex){ g.lookAt(new V3(...P.eye).add(new V3(s>0?-.4:.5,.05,1.6))); g.updateMatrix();
      // built in the mirror's own frame, entirely behind the glass: it leaves the housing's body on the inboard side and
      // sweeps down and in to its mount on the door at the window's front corner, never crossing the glass
      const inv=new THREE.Matrix4().copy(g.matrix).invert(), b=new V3(s*(P.door+.004),P.belt+.035,zA+.06).applyMatrix4(inv);
      const e=new V3(o*(W/2+.02),-H*.16,-.07), sq=(c,k)=>Math.sign(c)*Math.pow(Math.abs(c),k);
      mesh(grid(28,16,(u,v)=>{ const a=u*Math.PI*2, t=v*v*(3-2*v), hh=lerp(H*.62,.10,t), dd=lerp(.07,.12,t);
        const x=lerp(e.x,b.x,v), y=lerp(e.y,b.y,t)+sq(Math.sin(a),.4)*hh/2, z=Math.min(lerp(e.z,b.z,t)+sq(Math.cos(a),.4)*dd/2,-.012-.02*(1-v));
        return [x,y,z]; }),pm,g);
      continue; }
    // foot: a tapered black arm from the door's front corner to the inboard lower edge of the shell
    { const xe=P.door+.235-W/2+.02; mesh(bar([[s*(P.door+.025),P.belt+.025,zA+.09],[s*lerp(P.door+.025,xe,.55),P.belt+.04,zA+.085],[s*xe,P.belt+.05,zA+.1]],[.07,.045],.04,[0,1,0],6,8),blk,G); }   // ends at the shell's inboard edge, in front of the glass
    // sail: the black triangle in the front corner of the door glass
    { const t=new THREE.Shape(); t.moveTo(0,0); t.lineTo(.2,0); t.quadraticCurveTo(.06,.07,0,.17); t.lineTo(0,0);
      const sm=mesh(new THREE.ShapeGeometry(t,8),M({color:0x0a0a0b,roughness:.8,side:THREE.DoubleSide}),G,false);
      sm.rotation.y=-Math.PI/2; sm.position.set(s*(P.door+.035),P.belt+.005,zA+.02); }   // shape x runs back along the sill, y up the pillar
    g.lookAt(new V3(...P.eye).add(new V3(s>0?-.4:.5,.05,1.6))); }
  // reflections in the glass: the dash top as a faint grey veil low on the windshield by day, the glowing screens at night
  { const T2=canvasTex(512,256), x=T2.x; x.clearRect(0,0,512,256);
    const g=x.createLinearGradient(0,256,0,120); g.addColorStop(0,'rgba(150,152,156,.9)'); g.addColorStop(.55,'rgba(150,152,156,.35)'); g.addColorStop(1,'rgba(150,152,156,0)');
    x.fillStyle=g; x.fillRect(0,120,512,136);
    const veil=new THREE.MeshBasicMaterial({map:T2.t,transparent:true,opacity:.1,depthWrite:false,side:THREE.DoubleSide});
    const v1=mesh(grid(16,8,(u,v)=>{ const p=wsP(u,v); return [p[0],p[1],p[2]+.003]; }),veil,G,false,false); v1.renderOrder=6;
    const T3=canvasTex(512,256), y=T3.x; y.clearRect(0,0,512,256); y.filter='blur(6px)';
    const blob=(u,w,col,v0)=>{ const cx=u*512; y.fillStyle=col; y.fillRect(cx-w*256,256-v0*256-26,w*512,26); };
    const uOf=xx=>(xx/((ws.hwB+ws.hwT)/2)+1)/2;
    if(P.cluster) blob(uOf(P.cluster.c[0]),.10,'rgba(90,150,255,.8)',.09);
    if(P.screen) blob(uOf(P.screen.c[0]),.09,'rgba(170,200,255,.9)',.07);
    if(P.pano) blob(.5,.62,'rgba(220,210,190,.6)',.06);
    if(P.pod) blob(uOf(P.eye[0]),.12,'rgba(255,150,70,.6)',.06);
    const glow=new THREE.MeshBasicMaterial({map:T3.t,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
    const v2=mesh(grid(16,8,(u,v)=>{ const p=wsP(u,v); return [p[0],p[1],p[2]+.0035]; }),glow,G,false,false); v2.renderOrder=6;
    mats.refl={veil,glow}; }
  return {wsP};
}

// door-mirror glass outline, centred; o = which way is outboard (+1 / -1 along x)
function mirShape(w,h,o){ const hw=w/2, hh=h/2, ti=hh*.78, bi=-hh*.70, to=hh, bo=-hh;    // inboard edge shorter, top rises outboard
  const r1=.018, r2=.03, r3=Math.min(.075,h*.42), r4=.025, X=v=>v*o, s=new THREE.Shape();
  s.moveTo(X(-hw),ti-r1); s.quadraticCurveTo(X(-hw),ti,X(-hw+r1),ti);
  s.quadraticCurveTo(X(0),hh*.97,X(hw-r2),to); s.quadraticCurveTo(X(hw),to,X(hw),to-r2);
  s.lineTo(X(hw),bo+r3); s.quadraticCurveTo(X(hw),bo,X(hw-r3),bo);
  s.quadraticCurveTo(X(-hw*.1),bo+.01,X(-hw+r4),bi); s.quadraticCurveTo(X(-hw),bi,X(-hw),bi+r4); s.lineTo(X(-hw),ti-r1); return s; }
// Explorer door-mirror glass (owner's photo): a big sweeping curve at the outer top corner (the end away from the car),
// straight top edge, small rounded corners by the car, straight sides and bottom
function mirShapeEx(w,h,o,rim,inb){ rim=rim||0; inb=inb||0; const hw=w/2, hh=h/2, X=v=>v*o, s=new THREE.Shape();
  // traced from the owner's photo of the real Explorer mirror (2026-11-21), in that photo's pixels: the outboard end comes
  // to a point like "<" about a third of the way down — a curved ~45° edge up to the top, a steep edge down to the bottom —
  // the top runs nearly level to a rounded corner, the inboard edge is almost upright and rounds off in a big curve into
  // the bottom, which rises gently toward the point. rim grows the outline evenly (the housing's thin frame); inb pushes
  // the inboard end further in (the housing's body, which shows beside the glass on the side nearest the car)
  const P=[[77,198,8],[121,122,60],[213,62,45],[572,73,35],[562,442,120],[119,375,25],[89,287,90]], k=w/495;   // [x, y, corner radius]
  const V0=P.map(([x,y])=>new THREE.Vector2(-hw+(x-77)/495*w,hh-(y-62)/380*h)), n=V0.length;
  const V=V0.map((v,i)=>{ const a=V0[(i+n-1)%n], b=V0[(i+1)%n], e1=v.clone().sub(a).normalize(), e2=b.clone().sub(v).normalize();
    const n1=new THREE.Vector2(-e1.y,e1.x), n2=new THREE.Vector2(-e2.y,e2.x), m=n1.clone().add(n2).normalize(), c=Math.max(.35,m.dot(n1));
    const q=v.clone().addScaledVector(m,rim/c); if(P[i][0]>500) q.x+=inb; return q; });
  for(let i=0;i<n;i++){ const v=V[i], A=V[(i+n-1)%n], B=V[(i+1)%n], r=Math.min(P[i][2]*k+rim+(P[i][0]>500?inb*1.4:0),A.distanceTo(v)/2,B.distanceTo(v)/2);   // the body rounds off generously
    const a=A.clone().sub(v).normalize().multiplyScalar(r).add(v), b=B.clone().sub(v).normalize().multiplyScalar(r).add(v);
    if(i===0) s.moveTo(X(a.x),a.y); else s.lineTo(X(a.x),a.y); s.quadraticCurveTo(X(v.x),v.y,X(b.x),b.y); }
  s.closePath(); return s; }
// Tesla door-mirror glass: frameless and soft — an arched top rising outboard, a big round outboard end, a nearly straight
// bottom edge that lifts toward the inboard end
function mirShapeEV(w,h,o){ const hw=w/2, hh=h/2, X=v=>v*o, s=new THREE.Shape();
  s.moveTo(X(-hw),hh*.25); s.quadraticCurveTo(X(-hw),hh*.62,X(-hw*.62),hh*.7);
  s.quadraticCurveTo(X(hw*.2),hh*1.08,X(hw*.72),hh*.96); s.quadraticCurveTo(X(hw),hh*.86,X(hw),hh*.2);
  s.quadraticCurveTo(X(hw),-hh*.92,X(hw*.55),-hh); s.lineTo(X(-hw*.55),-hh*.8);
  s.quadraticCurveTo(X(-hw),-hh*.7,X(-hw),-hh*.15); s.lineTo(X(-hw),hh*.25); return s; }
// ShapeGeometry UVs are in shape units: spread them over 0..1 so a texture covers the glass once
function uvFit(g){ g.computeBoundingBox(); const b=g.boundingBox, p=g.attributes.position, uv=g.attributes.uv;
  for(let i=0;i<p.count;i++) uv.setXY(i,(p.getX(i)-b.min.x)/(b.max.x-b.min.x),(p.getY(i)-b.min.y)/(b.max.y-b.min.y)); uv.needsUpdate=true; return g; }
/* ---------- mirrors: one small rear-facing render of the car layer (traffic, signs behind you) over a sky / road
   backdrop, mirrored; the inside mirror shows its middle framed by the rear window, each door mirror its own side ---------- */
const MIR={rt:null,cam:null,bg:null,bgT:null,mats:[],frames:[],t:0,
  tex(){ if(!this.rt) this.init(); return this.rt.texture; },
  // a render target's texture can't be cloned with its own offset, so each mirror maps its slice through its UVs (flipped: it's a mirror)
  uv(g,u0,u1){ const a=g.attributes.uv; for(let i=0;i<a.count;i++) a.setX(i,u1-a.getX(i)*(u1-u0)); a.needsUpdate=true; return g; },
  init(){ this.rt=new THREE.WebGLRenderTarget(768,160,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
    this.cam=new THREE.PerspectiveCamera(34,768/160,1,1e6);
    const c=cnv(4,128); this.bgC=c; this.bgT=new THREE.CanvasTexture(c); }
};
function mirrorBackdrop(){ const x=MIR.bgC.getContext('2d'), s=skyCols(), sky='#'+s.sky.getHexString(), hor='#'+s.hor.getHexString(), k=s.k;
  const g=x.createLinearGradient(0,0,0,128); g.addColorStop(0,sky); g.addColorStop(.5,hor); g.addColorStop(.5,k>.5?'#15171a':'#6d7a5f'); g.addColorStop(.62,k>.5?'#101113':'#5b5f63'); g.addColorStop(1,k>.5?'#0d0e10':'#4a4d51');
  x.fillStyle=g; x.fillRect(0,0,4,128); MIR.bgT.needsUpdate=true; }
function renderMirror(dt){ if(!MIR.rt) return; MIR.t-=dt; if(MIR.t>0) return; MIR.t=QL>=2?.05:QL>=1?.066:.1;
  if(!MIR.bgKey||MIR.bgKey!==ENV.key){ MIR.bgKey=ENV.key; mirrorBackdrop(); }
  const e=CK.eyeLocal; if(!e) return; const mm=e.mm, d=(S.hdg-S.camB)*DEG, bx=-Math.sin(d), bz=Math.cos(d);
  const c=MIR.cam; c.position.set(e.r/mm,(e.h+.05)/mm,-e.f/mm); c.near=.5/mm; c.far=900/mm; c.up.set(0,1,0);
  c.lookAt(c.position.x+bx*100,c.position.y-1.2,c.position.z+bz*100); c.updateProjectionMatrix();
  const bg=scene.background, vis=car.visible; scene.background=MIR.bgT; car.visible=false;
  renderer.setRenderTarget(MIR.rt); renderer.clear(); renderer.render(scene,c); renderer.setRenderTarget(null);
  scene.background=bg; car.visible=vis; }
function drawRearFrame(x,P){ const W=512,H=128; x.clearRect(0,0,W,H); x.fillStyle=P.style==='lux'?'#5a544b':'#1a1a1c';
  x.beginPath(); x.rect(0,0,W,H); x.moveTo(70,18); x.lineTo(442,18); x.quadraticCurveTo(470,20,476,60); x.lineTo(480,112); x.lineTo(32,112); x.lineTo(36,60); x.quadraticCurveTo(42,20,70,18); x.fill('evenodd');
  x.fillStyle=P.style==='lux'?'#8a8070':'#121213'; for(const cx of [150,256,362]){ x.beginPath(); x.ellipse(cx,118,40,28,0,0,7); x.fill(); }
  const g=x.createLinearGradient(0,0,0,H); g.addColorStop(0,'rgba(255,255,255,.08)'); g.addColorStop(1,'rgba(0,0,0,.15)'); x.fillStyle=g; x.fillRect(0,0,W,H); }
function drawSideFrame(x,s,clean){ const W=256,H=160; x.clearRect(0,0,W,H); const pc='#'+new THREE.Color(CARSPEC.paint||0x333333).getHexString();
  // the car's own flank along the inner edge of each door mirror
  const ix=s<0?W:0, g=x.createLinearGradient(ix,0,ix+(s<0?-48:48),0); g.addColorStop(0,pc); g.addColorStop(1,'rgba(0,0,0,0)');
  x.fillStyle=g; x.beginPath(); x.moveTo(ix,H*.35); x.lineTo(ix+(s<0?-44:44),H*.62); x.lineTo(ix+(s<0?-52:52),H); x.lineTo(ix,H); x.fill();
  if(!clean){ x.fillStyle='rgba(255,255,255,.06)'; x.fillRect(0,0,W,H*.4); } }   // the Explorer's glass is kept clean (owner)

/* ---------- tractor cab (owner 2026-11-20: "make a cockpit view for tractor"): an original modern row-crop cab, glass all
   round on four posts; the long green hood with its stack and air pre-cleaner ahead, the front tyres turning below it,
   the big rear fenders and tyres beside you; a column display, a corner-post screen with the map, armrest console ---------- */
function tractorCab(G,P,parts){
  const T=textures(), green=M({color:0x23561c,roughness:.38,metalness:.05,clearcoat:.8,clearcoatRoughness:.08,out:true,env:.45}),
    yellow=M({color:0xf2c500,roughness:.45,out:true,env:.5}), blk=M({color:0x101112,roughness:.55,normalMap:rep(T.grain,4,4)}),
    rubber=M({color:0x151515,roughness:.95}), metal=M({color:0x9aa0a6,metalness:.9,roughness:.3,out:true});
  // hood: rounded green box with vents on top and the yellow side stripes; grille at the front
  const hood=mesh(rbox(.92,.8,2.06,.07,.12),green,G); hood.position.set(0,1.18,-.78);
  for(const x of [-.465,.465]) mesh(new THREE.BoxGeometry(.012,.06,1.9),yellow,G).position.set(x,1.38,-.8);
  for(let i=0;i<9;i++){ const v=mesh(new THREE.BoxGeometry(.5,.006,.035),blk,G,false); v.position.set(0,1.582,-1.55+i*.06); }
  mesh(rbox(.84,.6,.06,.02,.05),blk,G).position.set(0,1.14,-1.83);
  // exhaust stack with a rain cap and the air pre-cleaner, just ahead of the cab on the right
  const st=mesh(new THREE.CylinderGeometry(.065,.07,1.35,18),M({color:0x1a1a1a,roughness:.4,metalness:.6}),G); st.position.set(.3,2.2,-1.22);
  const cap=mesh(new THREE.CylinderGeometry(.08,.08,.02,18),metal,G); cap.position.set(.3,2.885,-1.22); cap.rotation.x=-.4;
  const pc=mesh(new THREE.CylinderGeometry(.09,.09,.35,18),blk,G); pc.position.set(-.28,1.78,-1.05);
  mesh(new THREE.CylinderGeometry(.11,.11,.08,18),blk,G).position.set(-.28,1.99,-1.05);
  // front tyres (steer and roll) and the big rear tyres under their fenders
  parts.tyres=[];
  const tyre=(x,z,r,w,front)=>{ const pv=new THREE.Group(); pv.position.set(x,r,z); G.add(pv); const sp=new THREE.Group(); pv.add(sp);
    const t=mesh(new THREE.CylinderGeometry(r,r,w,32),rubber,sp); t.rotation.z=Math.PI/2;
    const h=mesh(new THREE.CylinderGeometry(r*.6,r*.6,w+.02,24),yellow,sp); h.rotation.z=Math.PI/2;
    for(let i=0;i<18;i++){ const a=i/18*Math.PI*2, l=mesh(new THREE.BoxGeometry(w*.45,.06,r*.18),rubber,sp,false); l.position.set((i%2?1:-1)*w*.26,Math.cos(a)*r*1.01,Math.sin(a)*r*1.01); l.rotation.x=-a; l.rotation.y=(i%2?1:-1)*.35; }
    parts.tyres.push({pv,sp,front,r}); };
  tyre(-.72,-1.35,.48,.32,true); tyre(.72,-1.35,.48,.32,true); tyre(-1.0,.95,.85,.52,false); tyre(1.0,.95,.85,.52,false);
  for(const x of [-1,1]){ mesh(grid(16,2,(u,v)=>{ const a=lerp(-.15,Math.PI+.15,u); return [x*1.0+(v-.5)*.6,.95+Math.sin(a)*.98,.95-Math.cos(a)*.98]; }),green,G); }
  // cab: floor, posts, roof, headliner with an overhead console, glass, door rails
  mesh(new THREE.BoxGeometry(1.3,.06,1.3),M({color:P.col.carpet,roughness:1,normalMap:rep(T.carpet,8,8)}),G).position.set(0,1.45,.8);
  for(const [x,z] of [[-.62,.18],[.62,.18],[-.62,1.42],[.62,1.42]]) mesh(rbox(.075,1.3,.075,.02,.03),blk,G).position.set(x,2.1,z);
  mesh(rbox(1.56,.1,1.56,.04,.12),green,G).position.set(0,2.83,.8);
  mesh(grid(10,10,(u,v)=>[lerp(-.6,.6,u),2.76-.02*Math.sin(Math.PI*u)*Math.sin(Math.PI*v),lerp(.2,1.4,v)]),M({color:P.col.head,roughness:.95,normalMap:rep(T.fabric,12,12)}),G);
  const oc=mesh(rbox(.9,.06,.3,.02,.05),M({color:0x2a2b2e,roughness:.6}),G); oc.position.set(0,2.71,.32);
  for(let i=0;i<6;i++){ const b=mesh(rbox(.05,.012,.03,.004,.008),M({color:0x111,roughness:.4}),G,false); b.position.set(-.2+i*.08,2.678,.33); }
  for(const x of [-.62,.62]) for(const y of [1.95]) mesh(new THREE.BoxGeometry(.02,.025,1.2),blk,G).position.set(x*.985,y,.8);   // door rails
  const glass=(geo)=>{ const g1=mesh(geo,new THREE.MeshBasicMaterial({color:0x6f8d84,transparent:true,opacity:.07,depthWrite:false,side:THREE.DoubleSide}),G,false,false); g1.renderOrder=5;
    const g2=mesh(geo,M({color:0,metalness:1,roughness:.04,transparent:true,opacity:.05,depthWrite:false,out:true}),G,false,false); g2.renderOrder=6; };
  glass(new THREE.PlaneGeometry(1.18,1.24).translate(0,2.09,.175));
  for(const x of [-.6,.6]){ const g=new THREE.PlaneGeometry(1.2,1.24); g.rotateY(Math.PI/2); g.translate(x,2.09,.8); glass(g); }
  // steering column and its display, corner-post screen, armrest console with joystick and hand throttle
  const colM=M({color:0x151617,roughness:.6,normalMap:rep(T.grain,3,3)});
  mesh(bar([[0,1.48,.28],[0,1.75,.4],[0,1.98,.53]],.1,.08,[0,0,1],8,10),colM,G);
  mesh(bar([[0,2.0,.5],[0,2.17,.36],[0,2.21,.32]],.05,.04,[0,0,1],6,8),colM,G);   // stalk up to the display
  { const bk=mesh(rbox(.19,.088,.03,.01,.02),colM,G); bk.position.set(0,2.255,.36); bk.lookAt(new V3(...P.eye)); bk.translateZ(-.022); }
  parts.cluster=screenMesh(G,P.cluster.c,P.cluster.w,P.cluster.h,0,768,P.eye);
  const post=mesh(bar([[.6,2.3,.2],[.55,2.22,.27]],.03,.03,[0,0,1],3,6),blk,G);
  parts.screen=screenMesh(G,P.screen.c,P.screen.w,P.screen.h,0,768,P.eye);
  const arm=mesh(rbox(.17,.12,.5,.03,.05),M({color:P.col.seat,roughness:.6,normalMap:rep(T.leather,4,6),normalScale:new THREE.Vector2(.3,.3)}),G); arm.position.set(.32,1.86,.92);
  const pad=mesh(rbox(.15,.03,.28,.01,.03),M({color:0x111214,roughness:.35}),G); pad.position.set(.32,1.935,.74);
  for(let i=0;i<8;i++){ const b=mesh(rbox(.022,.012,.022,.004,.006),M({color:[0xd8d8d8,0xf2c500,0x2f7a26,0xc81e1e][i%4],roughness:.4}),G,false); b.position.set(.27+(i%3)*.04,1.952,.66+Math.floor(i/3)*.04); }
  const js=mesh(new THREE.CylinderGeometry(.012,.016,.11,12),blk,G); js.position.set(.36,2.0,.82);
  mesh(new THREE.SphereGeometry(.03,16,12),M({color:0x111,roughness:.4}),G).position.set(.36,2.06,.82);
  const th=mesh(rbox(.03,.04,.09,.01,.015),M({color:0xc81e1e,roughness:.5}),G); th.position.set(.39,1.96,.62); parts.throttle=th;
  // big door mirrors on arms
  for(const s of [-1,1]){ const g=new THREE.Group(); g.position.set(s*1.02,2.5,.2); G.add(g);
    mesh(rbox(.24,.32,.05,.015,.04),blk,g).position.z=-.03;
    const gl=mesh(MIR.uv(new THREE.PlaneGeometry(.21,.29),s<0?0:.64,s<0?.36:1),new THREE.MeshBasicMaterial({map:MIR.tex(),toneMapped:false}),g,false); gl.position.z=-.003; MIR.mats.push(gl.material);
    g.lookAt(new V3(...P.eye).add(new V3(s*.6,0,1.8)));
    mesh(bar([[s*.62,2.55,.2],[s*.85,2.55,.22],[s*1.0,2.52,.21]],.025,.025,[0,1,0],6,8),blk,G); }
  return {wsP:(u,v)=>[(u*2-1)*.58,lerp(1.48,2.7,v),.16]};
}

/* ---------- steering wheels ---------- */
// the overhead console: a black rounded-square pod on the headliner just behind the mirror. The half toward the windshield is
// the sunglasses-bin lid (a soft line across it); the half toward you has a strip with the two clear map-light lenses, the
// light / sunroof / VENT keys between them, then the PASSENGER AIRBAG OFF / ON lamp with a speaker grille each side.
// Explorer sunroof (owner 2026-11-21: "add a sunroof, and those buttons in the middle work to open the vent and close the
// cover"): an opening in the headliner over the front seats with a dark well, the tinted glass panel up at roof level
// (VENT tilts its back edge up ~4 cm, hinged at the front) and the fabric cover under it that slides back into the roof.
function sunroof(G,P,R,rf,trimM,parts){
  const S=P.sunroof, y0=R.y-.005, yg=R.y+.045, len=S.z1-S.z0, cz=(S.z0+S.z1)/2;
  const well=M({color:0x0c0c0d,roughness:.85});
  for(const s of [-1,1]){ mesh(grid(1,1,(u,v)=>[s*S.hw,lerp(y0-.01,yg,u),lerp(S.z0,S.z1,v)]),well,G,false);
    mesh(grid(1,1,(u,v)=>[lerp(-S.hw,S.hw,v),lerp(y0-.01,yg,u),s<0?S.z0:S.z1]),well,G,false); }
  // trim ring round the opening
  const ring=new THREE.Shape(); ring.moveTo(-S.hw-.03,S.z0-.03); ring.lineTo(S.hw+.03,S.z0-.03); ring.lineTo(S.hw+.03,S.z1+.03); ring.lineTo(-S.hw-.03,S.z1+.03); ring.closePath();
  const hole=new THREE.Path(); hole.moveTo(-S.hw,S.z0); hole.lineTo(-S.hw,S.z1); hole.lineTo(S.hw,S.z1); hole.lineTo(S.hw,S.z0); hole.closePath(); ring.holes.push(hole);
  const rg=mesh(new THREE.ShapeGeometry(ring),M({color:0x2a2a2d,roughness:.7,normalMap:rep(textures().fabric,8,8),normalScale:new THREE.Vector2(.4,.4)}),G,false);
  rg.rotation.x=Math.PI/2; rg.position.y=y0-.012;
  // glass: hinged at its front edge
  const hinge=new THREE.Group(); hinge.position.set(0,yg,S.z0-.02); G.add(hinge);
  const T=canvasTex(256,256), x=T.x; x.fillStyle='rgba(10,18,28,.55)'; x.fillRect(0,0,256,256); x.fillStyle='rgba(6,6,7,.97)'; x.fillRect(0,0,256,14); x.fillRect(0,242,256,14); x.fillRect(0,0,14,256); x.fillRect(242,0,14,256);
  const gl=mesh(new THREE.PlaneGeometry(S.hw*2+.06,len+.06),new THREE.MeshBasicMaterial({map:T.t,transparent:true,depthWrite:false,side:THREE.DoubleSide}),hinge,false,false);
  gl.rotation.x=Math.PI/2; gl.position.z=(len+.06)/2; gl.renderOrder=5;
  // the cover: fabric panel just above the headliner, slides back into the roof
  const cov=new THREE.Group(); G.add(cov);
  const cm=mesh(new THREE.BoxGeometry(S.hw*2+.02,.006,len+.02),M({color:P.col.head,roughness:.95,normalMap:rep(textures().fabric,10,10),normalScale:new THREE.Vector2(.6,.6)}),cov);
  cm.position.set(0,y0+.008,cz); const pull=mesh(rbox(.10,.012,.02,.004,.006),M({color:0x2a2b2e,roughness:.5}),cov); pull.position.set(0,y0+.002,S.z0+.03);   // the handle at its front edge
  parts.sunroof={hinge,cov,len,vent:0,cover:0,slide:0,z0:hinge.position.z};
}
function overheadEx(G,P,ws){
  // built into the roof (owner 2026-11-21: "make the overhead console built in the roof"): the pod is set up into the
  // headliner so its face sits ~1 cm below it, inside a soft trim ring, level with the roof (no longer hanging down)
  const W=.25, D=.25, zf=ws.zT+.075, cz=zf+D/2, th=.03;
  const g=new THREE.Group(); g.position.set(0,P.roof.y-.009,cz); G.add(g);
  const blk=M({color:0x151517,roughness:.62,normalMap:rep(textures().grain,3,3),normalScale:new THREE.Vector2(.35,.35)});
  const pod=mesh(rbox(W,D,th,.03,.06),blk,g); pod.rotation.x=-Math.PI/2; pod.position.y=th/2;
  const ring=mesh(rbox(W+.026,D+.026,.006,.04,.008),M({color:new THREE.Color(P.col.head).multiplyScalar(.75),roughness:.9,normalMap:rep(textures().fabric,6,6),normalScale:new THREE.Vector2(.4,.4)}),g);
  ring.rotation.x=-Math.PI/2; ring.position.y=.006;                                        // the headliner's edge rolled in round it
  // the face, drawn: 1024 px across the 25 cm pod (y down the picture = toward the driver)
  const T=canvasTex(1024,1024), x=T.x, R=(X,Y,w,h,r)=>{ x.beginPath(); x.moveTo(X+r,Y); x.arcTo(X+w,Y,X+w,Y+h,r); x.arcTo(X+w,Y+h,X,Y+h,r); x.arcTo(X,Y+h,X,Y,r); x.arcTo(X,Y,X+w,Y,r); x.closePath(); };
  x.fillStyle='#17181a'; x.fillRect(0,0,1024,1024);
  x.strokeStyle='#060606'; x.lineWidth=7; R(70,70,884,420,28); x.stroke();                       // lid seam
  x.fillStyle='#1c1d20'; R(74,74,876,412,26); x.fill(); x.strokeStyle='#0b0b0c'; x.lineWidth=5; x.beginPath(); x.moveTo(330,150); x.lineTo(700,150); x.stroke();   // the soft line on the lid
  x.strokeStyle='#0a0a0b'; x.lineWidth=4; x.beginPath(); x.moveTo(70,490); x.lineTo(954,490); x.stroke();
  x.fillStyle='#0e0e10'; R(120,580,784,220,22); x.fill(); x.strokeStyle='#26272a'; x.lineWidth=4; R(120,580,784,220,22); x.stroke();   // the key strip
  for(const X of [150,742]){ x.fillStyle='#050505'; R(X,615,132,150,10); x.fill(); const gr=x.createLinearGradient(X+30,0,X+102,0); gr.addColorStop(0,'#8d9196'); gr.addColorStop(.5,'#f2f4f6'); gr.addColorStop(1,'#8d9196');
    x.fillStyle=gr; R(X+34,650,64,80,10); x.fill(); x.strokeStyle='#5b5f64'; x.lineWidth=5; R(X+22,636,88,108,8); x.stroke(); }          // clear map-light lenses
  const key=(X,Y,w,h,t)=>{ x.fillStyle='#1b1c1f'; R(X,Y,w,h,8); x.fill(); x.strokeStyle='#050505'; x.lineWidth=3; R(X,Y,w,h,8); x.stroke(); if(t){ x.fillStyle='#c7cbd0'; x.font='600 '+(t.length>2?22:30)+'px system-ui,Arial'; x.textAlign='center'; x.textBaseline='middle'; t.split('\n').forEach((l,i,a)=>x.fillText(l,X+w/2,Y+h/2+(i-(a.length-1)/2)*24)); } };
  key(330,612,68,64,'☼'); key(330,676,68,56,''); key(330,732,68,64,'☼');
  key(420,612,88,84,'△'); key(420,700,88,96,'VENT\n▽'); key(516,612,88,84,''); key(516,700,88,96,'');
  { const cov=(cx,cy,dir)=>{ x.strokeStyle='#c7cbd0'; x.fillStyle='#c7cbd0'; x.lineWidth=3; x.strokeRect(cx-20,cy-14,40,28); x.fillRect(cx-20,cy-14,40,7);   // the cover in its frame
      x.beginPath(); const ty=cy+dir*30; x.moveTo(cx,ty); x.lineTo(cx-9,ty-dir*11); x.lineTo(cx+9,ty-dir*11); x.closePath(); x.fill(); };
    cov(560,662,-1); cov(560,742,1); }   // top key: cover slides back (open); bottom: forward (closed)
  key(626,612,68,64,'☼'); key(626,676,68,56,''); key(626,732,68,64,'☼');
  // airbag lamp strip and the two speaker grilles
  x.fillStyle='#121315'; x.beginPath(); x.moveTo(250,830); x.lineTo(774,830); x.lineTo(740,880); x.lineTo(284,880); x.closePath(); x.fill();
  x.fillStyle='#3d4045'; x.font='500 22px system-ui,Arial'; x.textAlign='left'; x.textBaseline='middle'; x.fillText('PASSENGER AIRBAG',300,856); x.fillText('OFF',520,856); x.fillText('ON',640,856);
  x.strokeStyle='#3d4045'; x.lineWidth=2; x.strokeRect(632,842,38,28);
  x.fillStyle='#050506'; for(const [a,b] of [[70,240],[784,954]]) for(let k=0;k<9;k++) for(let j=0;j<4;j++){ x.save(); x.translate(a+12+k*18,836+j*11); x.rotate(-.55); x.fillRect(0,0,12,3); x.restore(); }
  x.fillStyle='#09090a'; R(470,960,84,24,6); x.fill();                                           // the little sensor slot at the front edge
  T.t.anisotropy=8; T.t.needsUpdate=true;
  const face=mesh(new THREE.PlaneGeometry(W-.004,D-.004),M({map:T.t,roughness:.6,normalMap:rep(textures().grain,3,3),normalScale:new THREE.Vector2(.25,.25)}),g,false,false);
  face.rotation.x=Math.PI/2; face.position.y=-.0006;                                             // faces down into the cabin
  // a little relief: the lid stands proud, the key strip and lenses sit in
  const lid=mesh(rbox(W*.86,D*.40,.004,.008,.012),M({color:0x1c1d20,roughness:.6,transparent:true,opacity:0}),g,false,false); lid.visible=false;
  // the four sunroof keys: invisible targets you can tap (canvas px -> pod: x right, z toward the driver)
  const Wf=W-.004, kp=(px,py)=>[(px/1024-.5)*Wf,(.5-py/1024)*Wf], hm=new THREE.MeshBasicMaterial({visible:false}); CK.roofKeys=[]; CK.roofSpots=[];
  for(const [k,px,py,w,h] of [['close',464,654,88,84],['vent',464,748,88,96],['open',560,654,88,84],['shut',560,748,88,96]]){ const q=kp(px,py);
    const f=mesh(new THREE.PlaneGeometry(w/1024*Wf,h/1024*Wf),new THREE.MeshBasicMaterial({color:0xffe2a8,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}),g,false,false);
    f.rotation.x=Math.PI/2; f.position.set(q[0],-.0012,q[1]); CK.roofSpots.push({k,x:q[0],z:q[1],flash:f}); }
  { const a=kp(380,570), b=kp(644,840), t=mesh(new THREE.BoxGeometry(b[0]-a[0],.014,a[1]-b[1]),hm,g,false,false); t.position.set((a[0]+b[0])/2,-.006,(a[1]+b[1])/2); CK.roofKeys.push(t); }   // generous: a fat finger still gets the nearest key
  const lit=new THREE.MeshBasicMaterial({color:0xfff4dc,transparent:true,opacity:0}); for(const s of [-1,1]){ const l=mesh(new THREE.PlaneGeometry(.016,.02),lit,g,false,false); l.rotation.x=Math.PI/2; l.position.set(s*.083,-.001,.0); }
}
function steeringWheel(G,P){
  const W=P.wheel, grp=new THREE.Group(); grp.position.set(...W.c); grp.rotation.x=-W.tilt*DEG; G.add(grp);
  const spin=new THREE.Group(); grp.add(spin);
  const classic=P.style==='classic'||P.style==='tractor';           // the tractor gets a plain three-spoke wheel too
  const rimM=classic?M({color:0x161616,roughness:.35,normalMap:rep(textures().vinyl,8,1),normalScale:new THREE.Vector2(.4,.4)})
                    :M({color:P.style==='lux'?0x2a2420:0x141416,roughness:.5,normalMap:rep(textures().leather,24,1),normalScale:new THREE.Vector2(.8,.8)});
  // rim: round or flat-bottomed, slightly oval section
  const pts=[]; for(let i=0;i<64;i++){ const a=i/64*Math.PI*2; let x=Math.cos(a)*W.r, y=Math.sin(a)*W.r; if(W.flat&&y<-W.r*.80){ y=-W.r*.80-.006*(1-Math.abs(x)/W.r); } pts.push(new V3(x,y,0)); }
  const curve=new THREE.CatmullRomCurve3(pts,true,'centripetal');
  const rim=mesh(new THREE.TubeGeometry(curve,160,W.rim,14,true),rimM,spin); rim.scale.z=1.25;
  if(P.style==='classic'){ for(let i=0;i<24;i++){ const a=i/24*Math.PI*2+.13, b=mesh(new THREE.SphereGeometry(W.rim*.6,8,6),rimM,spin); b.position.set(Math.cos(a)*(W.r-W.rim*.85),Math.sin(a)*(W.r-W.rim*.85),0); } }   // finger grips
  if(P.col.stitch&&P.style==='sport'){ const st=M({color:0x5a0a14,roughness:.8}); for(const s of [-1,1]){ const sp=[]; for(let i=0;i<=40;i++){ const a=(s>0?-.55:Math.PI-.55)+i/40*1.1; sp.push(new V3(Math.cos(a)*(W.r),Math.sin(a)*(W.r),W.rim*1.21)); }
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp),60,.0016,5,false),st,spin,false); } }
  if(classic){
    const al=P.style==='tractor'?M({color:0x161718,roughness:.5}):M({map:rep(textures().alu,1,1),color:0xffffff,metalness:.85,roughness:.32}), cap=M({color:0x0e0e0e,roughness:.4});
    for(const a of [-8,188,270]){ const r=a*DEG, sp=mesh(new THREE.BoxGeometry(W.r-.03,.032,.006),al,spin); sp.position.set(Math.cos(r)*(W.r-.03)/2,Math.sin(r)*(W.r-.03)/2,-.012); sp.rotation.z=r;
      for(let k=0;k<3;k++){ const h=mesh(new THREE.CircleGeometry(.007,12),M({color:0x050505}),spin,false); h.position.set(Math.cos(r)*(.06+k*.03),Math.sin(r)*(.06+k*.03),-.0085); } }
    const hub=mesh(new THREE.CylinderGeometry(.045,.05,.03,32),cap,spin); hub.rotation.x=Math.PI/2; hub.position.z=-.005;
    const ring=mesh(new THREE.TorusGeometry(.046,.004,8,32),M({color:0xd9dde2,metalness:1,roughness:.1,out:true}),spin); ring.position.z=.011;
  } else if(P.style==='ev'){
    // Model Y: round rim, an oval hub pad and two horizontal spokes, each with a scroll wheel by the hub (no bottom spoke)
    const hubM=M({color:0x151517,roughness:.55,normalMap:rep(textures().leather,6,6),normalScale:new THREE.Vector2(.18,.18)});
    const pad=mesh(rbox(.118,.088,.05,.02,.036),hubM,spin); pad.position.set(0,-.004,-.014);
    const gloss=M({color:0x0c0c0d,roughness:.18,metalness:.25});
    for(const s of [-1,1]){ const len=W.r-.058, sp=mesh(rbox(len,.036,.02,.008,.014),hubM,spin); sp.position.set(s*(.058+len/2-.004),-.012,-.019);
      const bez=mesh(rbox(.038,.03,.008,.003,.008),gloss,spin); bez.position.set(s*.086,-.012,-.008);          // glossy surround
      const sw=mesh(new THREE.CylinderGeometry(.0105,.0105,.014,20),M({color:0x2a2b2e,roughness:.45,metalness:.5,normalMap:rep(textures().grain,1,4)}),spin);
      sw.rotation.z=Math.PI/2; sw.position.set(s*.086,-.012,-.0035); }                                       // the scroll wheel (axis across)
  } else {
    const hubM=M({color:P.style==='lux'?0x2a2420:0x161618,roughness:.55,normalMap:rep(textures().leather,P.ex?8:3,P.ex?8:3),normalScale:new THREE.Vector2(P.ex?.15:.5,P.ex?.15:.5)});
    if(P.ex){ const bT=canvasTex(256,128), x=bT.x, g=x.createLinearGradient(0,0,0,128); g.addColorStop(0,'#3d6fc4'); g.addColorStop(.5,'#123a8a'); g.addColorStop(1,'#0a2560'); // plain blue oval badge (no lettering)
      x.fillStyle='#0000'; x.clearRect(0,0,256,128); x.fillStyle='#d9dde2'; x.beginPath(); x.ellipse(128,64,124,60,0,0,7); x.fill(); x.fillStyle=g; x.beginPath(); x.ellipse(128,64,112,50,0,0,7); x.fill();
      x.fillStyle='rgba(255,255,255,.18)'; x.beginPath(); x.ellipse(128,44,96,22,0,0,7); x.fill();
      const b=mesh(new THREE.PlaneGeometry(.056,.028),new THREE.MeshBasicMaterial({map:bT.t,transparent:true}),spin,false,false); b.position.set(0,.004,.0165); }
    const trimM=P.style==='lux'?M({color:0xc8c2b6,metalness:.9,roughness:.25}):M({map:rep(textures().alu,1,1),metalness:.85,roughness:.3});
    const pad=mesh(rbox(.13,.10,.055,.02,.035),hubM,spin); pad.position.set(0,-.006,-.012);
    for(const s of [-1,1]){ const sp=mesh(rbox(.085,.05,.022,.008,.02),hubM,spin); sp.position.set(s*(W.r*.62),-.008,-.02); sp.rotation.z=s*-.08;
      const sw=mesh(rbox(.05,.036,.008,.002,.008),M({color:0x0b0b0c,roughness:.25,metalness:.1}),spin); sw.position.set(s*W.r*.6,-.006,-.007);
      for(let k=0;k<4;k++){ const b=mesh(new THREE.CircleGeometry(.0042,10),M({color:0x1c1e21,roughness:.6,env:.15}),spin,false); b.position.set(s*W.r*.6+(k%2?.01:-.01),-.006+(k<2?.008:-.008),-.0028); b.userData.btn=1; }
      const tr=mesh(new THREE.BoxGeometry(.06,.004,.004),trimM,spin); tr.position.set(s*(W.r*.62),-.035,-.008); }
    if(P.style==='sport'){ const sat=M({color:0xc9ced4,metalness:.9,roughness:.3,env:1.4}), y0=-.045, yb=-W.r*.86;
      mesh(bar([[-.03,y0,-.016],[-.045,(y0+yb)/2,-.014],[-.035,yb+.02,-.01],[0,yb,-.008],[.035,yb+.02,-.01],[.045,(y0+yb)/2,-.014],[.03,y0,-.016]],.016,.01,[0,0,1],40,8),sat,spin);
      mesh(bar([[-.03,y0,-.02],[0,y0-.012,-.02],[.03,y0,-.02]],.03,.012,[0,0,1],8,8),hubM,spin); }   // satin U-spoke under the hub
    else { const low=mesh(rbox(.03,.08,.02,.006,.012),hubM,spin); low.position.set(0,-W.r*.58,-.018); }
    if(W.flat){ const t=mesh(new THREE.BoxGeometry(.05,.008,.006),trimM,spin); t.position.set(0,-W.r*.80+.002,.012); }
  }
  // column shroud and stalks (stay put while the wheel turns)
  const colM=M({color:0x0f0f10,roughness:.7,normalMap:rep(textures().grain,3,3)});
  const sh=mesh(rbox(.11,.10,.26,.03,.04),colM,grp); sh.position.set(0,-.01,-.17);
  for(const s of [-1,1]){ const st=mesh(bar([[s*.04,0,-.09],[s*.12,-.005,-.07],[s*.16,-.012,-.06]],.012,.012,[0,1,0],6,8),colM,grp); }
  return spin;
}

/* ---------- instruments ---------- */
// modern digital cluster / panoramic display / centre screen: canvases redrawn ~15 times a second
function screenMesh(G,c,w,h,tilt,px,eye){ const T=canvasTex(px,Math.round(px*h/w),true);
  const m=new THREE.MeshBasicMaterial({map:T.t,toneMapped:false}); const s=mesh(new THREE.PlaneGeometry(w,h),m,null,false,false);
  const grp=new THREE.Group(); grp.position.set(c[0],c[1],c[2]); G.add(grp); grp.add(s);
  if(eye) grp.lookAt(new V3(...eye)); else grp.rotation.x=-(tilt||0)*DEG;
  const bez=mesh(rbox(w+.014,h+.014,.012,.003,.006),M({color:0x060607,roughness:.15,metalness:.2}),grp); bez.position.z=-.0068;
  const gl=mesh(new THREE.PlaneGeometry(w,h),M({color:0x000000,roughness:.06,metalness:1,transparent:true,opacity:.18,depthWrite:false,env:1.3}),grp,false,false); gl.position.z=.0012;
  return {T,m,grp,w:T.c.width,h:T.c.height}; }

function roundGauge(G,P,c,r,kind){ // classic: black face, white marks, orange needle, chrome bezel, deep pod
  const grp=new THREE.Group(); grp.position.set(...c); G.add(grp); grp.lookAt(new V3(...P.eye));
  const T=canvasTex(512,512), x=T.x; drawClassicFace(x,kind,P);
  const face=mesh(new THREE.CircleGeometry(r,48),new THREE.MeshStandardMaterial({map:T.t,emissiveMap:T.t,emissive:0xffffff,emissiveIntensity:.2,roughness:.7}),grp,false,false); face.position.z=-.014;
  { const pod=mesh(new THREE.CylinderGeometry(r*1.04,r*1.04,.026,40,1,true),M({color:0x050505,roughness:.9}),grp,false,false); pod.rotation.x=Math.PI/2; pod.position.z=-.001; }
  const bez=mesh(new THREE.TorusGeometry(r*1.06,.0045,10,48),M({color:0xc9cdd2,metalness:1,roughness:.16,out:true,env:.8}),grp); bez.position.z=.012;
  const nm=new THREE.MeshStandardMaterial({color:0xff6a1a,emissive:0xff4a0a,emissiveIntensity:.25,roughness:.4});
  const needle=new THREE.Group(); needle.position.z=-.011; grp.add(needle);
  const ng=new THREE.BufferGeometry(); ng.setAttribute('position',new THREE.Float32BufferAttribute([-.0022,-r*.18,0,.0022,-r*.18,0,.0007,r*.86,0, -.0022,-r*.18,0,.0007,r*.86,0,-.0007,r*.86,0],3)); ng.computeVertexNormals();
  mesh(ng,nm,needle,false,false); const cap=mesh(new THREE.CircleGeometry(r*.09,20),new THREE.MeshStandardMaterial({color:0x111111,roughness:.3,metalness:.5}),needle,false); cap.position.z=.001;
  if(kind==='combo'){ const n2=new THREE.Group(); n2.position.z=-.0105; grp.add(n2); const g2=mesh(new THREE.BoxGeometry(.0026,r*.62,.001),nm,n2,false); g2.position.y=r*.31; needle.userData.min=n2; }
  const lens=mesh(new THREE.CircleGeometry(r*1.02,40),M({color:0x000000,metalness:1,roughness:.05,transparent:true,opacity:.22,depthWrite:false,out:true}),grp,false,false); lens.position.z=.008;
  return {needle,face,nm,kind}; }
function drawClassicFace(x,kind,P){ const W=512,c=256; x.fillStyle='#0b0b0b'; x.fillRect(0,0,W,W);
  const g=x.createRadialGradient(c,c,40,c,c,256); g.addColorStop(0,'#151515'); g.addColorStop(1,'#050505'); x.fillStyle=g; x.beginPath(); x.arc(c,c,256,0,7); x.fill();
  x.strokeStyle='#e9e6dc'; x.fillStyle='#e9e6dc'; x.textAlign='center'; x.textBaseline='middle';
  const arc=(a0,a1,n,maj,lab,Rr)=>{ for(let i=0;i<=n;i++){ const a=(a0+(a1-a0)*i/n-90)*DEG, mj=i%maj===0, r1=Rr, r2=Rr-(mj?34:18);
      x.lineWidth=mj?6:3; x.beginPath(); x.moveTo(c+Math.cos(a)*r1,c+Math.sin(a)*r1); x.lineTo(c+Math.cos(a)*r2,c+Math.sin(a)*r2); x.stroke();
      if(mj&&lab){ const t=lab(i/maj); if(t!=null){ x.font='600 46px "Helvetica Neue",Arial,sans-serif'; x.fillText(t,c+Math.cos(a)*(Rr-74),c+Math.sin(a)*(Rr-74)); } } } };
  if(kind==='speed'){ arc(-135,135,28,2,i=>String(i*10),236); x.font='600 26px Arial'; x.fillText('MPH',c,c+92);
    x.fillStyle='#111'; x.fillRect(c-58,c+120,116,34); x.fillStyle='#ddd'; x.font='600 26px "Courier New",monospace'; x.fillText('0 4 7 1 2',c,c+138); }
  else if(kind==='tach'){ arc(-135,135,32,4,i=>String(i),236); x.strokeStyle='#d8341f'; x.lineWidth=14; x.beginPath(); x.arc(c,c,229,(-135+270*(P.red/8)-90)*DEG,(135-90)*DEG); x.stroke();
    x.fillStyle='#e9e6dc'; x.font='600 24px Arial'; x.fillText('RPM',c,c+80); x.font='500 20px Arial'; x.fillText('x1000',c,c+108); }
  else { // clock with fuel and temp sub-scales
    for(let i=0;i<60;i++){ const a=(i*6-90)*DEG, mj=i%5===0; x.lineWidth=mj?6:2; x.beginPath(); x.moveTo(c+Math.cos(a)*236,c+Math.sin(a)*236); x.lineTo(c+Math.cos(a)*(mj?204:222),c+Math.sin(a)*(mj?204:222)); x.stroke(); }
    x.font='600 22px Arial'; x.fillText('E',c-118,c+88); x.fillText('F',c-62,c+138); x.fillText('C',c+62,c+138); x.fillText('H',c+118,c+88);
    x.lineWidth=4; x.beginPath(); x.arc(c-60,c+60,70,.55*Math.PI,1.05*Math.PI); x.stroke(); x.beginPath(); x.arc(c+60,c+60,70,-.05*Math.PI,.45*Math.PI); x.stroke();
    x.font='600 20px Arial'; x.fillText('FUEL',c-96,c+40); x.fillText('TEMP',c+96,c+40); }
}

/* ---------- dashboards ---------- */
function loftDash(G,P,mat,x0,x1,prof,mod){ const sp=new THREE.SplineCurve(prof.map(p=>new THREE.Vector2(p[1],p[0])));
  return mesh(grid(60,40,(u,v)=>{ const x=lerp(x0,x1,u), q=sp.getPoint(v), o=mod?mod(x,v):[0,0]; return [x,q.y+o[1],q.x+o[0]]; }),mat,G); }
function dashModern(G,P,parts){
  const T=textures(), lux=P.style==='lux';
  const upM=M({color:P.col.top,roughness:.72,normalMap:rep(lux?T.leather:T.grain,lux?30:14,lux?9:4),normalScale:new THREE.Vector2(lux?.25:.55,lux?.25:.55)});
  const loM=M({color:P.col.lower,roughness:lux?.58:.75,normalMap:rep(lux?T.leather:T.grain,lux?26:10,lux?10:4),normalScale:new THREE.Vector2(lux?.22:.5,lux?.22:.5)});
  const xd=P.door+.005, end=x=>.10*sstep(.55,1,Math.abs(x)/xd);       // the ends sweep back into the doors
  const rec=x=>lux?0:sstep(.24,.20,Math.abs(x-P.cluster.c[0]));     // the sport cluster sits in a recess under its brow
  loftDash(G,P,upM,-xd,xd,P.dash.slice(0,5),(x,v)=>[end(x)*sstep(.2,.6,v)-.095*rec(x)*sstep(.55,.9,v),0]);
  loftDash(G,P,loM,-xd,xd,P.dash.slice(4),(x,v)=>[end(x)-.095*rec(x)*(1-sstep(0,.4,v)),0]);
  // accent strip across the dash face (brushed metal / wood) with a chrome or red pinstripe
  const ac=P.col.accent==='wood'?M({map:rep(T.ash,2,1),roughness:.35,clearcoat:.8,clearcoatRoughness:.1}):M({map:rep(T.alu,3,1),metalness:.85,roughness:.34,color:0xb8bcc2});
  const sp=new THREE.SplineCurve(P.dash.map(p=>new THREE.Vector2(p[1],p[0]))), a=sp.getPoint(lux?.55:.62), b=sp.getPoint(lux?.67:.68);
  if(!P.ex) mesh(grid(60,4,(u,v)=>{ const x=lerp(-xd+.04,xd-.04,u), q=a.clone().lerp(b,v), o=.10*sstep(.55,1,Math.abs(x)/xd); return [x,q.y,q.x+o+.004]; }),ac,G);
  if(false){ const st=M({color:new THREE.Color(P.col.stitch).multiplyScalar(.7),roughness:.6}), q=sp.getPoint(.45); mesh(bar([[P.screen.c[0]+.2,q.y+.002,q.x+.006],[.45,q.y+.002,q.x+.006],[xd-.12,q.y+.002,q.x+.03]],.0018,.0018,[0,1,0],40,5),st,G,false); }
  // defroster slots near the glass
  { const vm=M({color:0x070707,roughness:.9}); for(const s of [-1,1]) for(let k=0;k<5;k++){ const v=mesh(new THREE.BoxGeometry(.16,.003,.006),vm,G,false); v.position.set(s*.32,lerp(P.dash[0][0],P.dash[1][0],.5)+.004,P.dash[0][1]+.05+k*.016); } }
  // vents: two in the middle beside the screen, one at each end
  const vent=(cx,cy,cz,w,h,rot)=>{ const g=new THREE.Group(); g.position.set(cx,cy,cz); g.rotation.set(rot[0]||0,rot[1]||0,0); G.add(g);
    if(P.ex){ ventEx(g,w,h); return; }
    mesh(rbox(w+.016,h+.016,.02,.004,.008),M({color:lux?0xb9b2a5:0x0d0d0e,metalness:lux?.9:.2,roughness:lux?.25:.4}),g);
    if(!lux){ const ch=M({color:0xd5dade,metalness:1,roughness:.2,env:1.5});
      for(const yy of [-1,1]) mesh(new THREE.BoxGeometry(w+.01,.003,.004),ch,g,false).position.set(0,yy*(h/2+.006),.011);
      for(const xx of [-1,1]) mesh(new THREE.BoxGeometry(.003,h+.012,.004),ch,g,false).position.set(xx*(w/2+.006),0,.011);
      const lb=mesh(rbox(w*.9,.008,.008,.002,.003),ch,g); lb.position.set(0,0,.016); }
    const bk=mesh(new THREE.PlaneGeometry(w,h),M({color:0x020202,roughness:1}),g,false); bk.position.z=.006;
    for(let k=0;k<5;k++){ const s=mesh(new THREE.BoxGeometry(w-.006,.0035,.014),M({color:0x1a1a1b,roughness:.5,metalness:.3}),g); s.position.set(0,-h/2+(k+.5)*h/5,.008); s.rotation.x=-.25; } };
  const fz=(y)=>{ let best=P.dash[4][1]; for(let i=0;i<P.dash.length-1;i++){ const A=P.dash[i],B=P.dash[i+1]; if((A[0]-y)*(B[0]-y)<=0&&A[0]!==B[0]) best=lerp(A[1],B[1],(y-A[0])/(B[0]-A[0])); } return best; };
  const vy=P.ex?P.dash[4][0]-.025:P.dash[4][0]-.06, vw=P.ex?.125:lux?.12:.14, vh=P.ex?.066:lux?.055:.05;
  const ey=P.ex?0:.55; vent(-xd+.13,vy,fz(vy)+.13,vw,vh,[0,ey]); vent(xd-.13,vy,fz(vy)+.13,vw,vh,[0,-ey]);   // Explorer: facing straight back (owner: "make the vents straight")
  if(P.ex){ for(const s of [-1,1]) vent(s*.215,vy,fz(vy)+.024,.17,vh,[0,0]); }     // the two big ones either side of the screen
  else if(!lux){ for(const s of [-1,1]) vent(P.screen.c[0]+s*.23,vy-.035,fz(vy-.035)+.02,.15,.05,[0,0]); }
  else { for(const s of [-1,1]) vent(P.screen.c[0]+s*.24,vy-.02,fz(vy-.02)+.015,.11,.03,[0,0]); }
  // driver's cluster brow (sport) — Navigator's panoramic screen has its own hood
  if(!lux){ const C=P.cluster, bw=.21;
    const bh=(s)=>.042*(1-Math.pow(Math.abs(s),4)), ty=P.dash[1][0]+.002, zb=C.c[2]+.085;
    mesh(grid(30,10,(u,v)=>{ const s=u*2-1; return [C.c[0]+s*bw,ty+bh(s)*sstep(0,.8,v)*(1-.15*v*v),lerp(P.dash[1][1]+.05,zb,v)]; }),upM,G);
    mesh(grid(30,3,(u,v)=>{ const s=u*2-1; return [C.c[0]+s*bw,ty+bh(s)*.85-.016*v,zb+.004*v]; }),upM,G);
    const back=mesh(rbox(C.w+.05,C.h+.07,.02,.005,.01),M({color:0x050505,roughness:.8}),G); back.position.set(C.c[0],C.c[1]+.005,C.c[2]); back.lookAt(new V3(...P.eye)); back.translateZ(-.016);
    parts.cluster=screenMesh(G,C.c,C.w,C.h,0,1024,P.eye); }
  else { const Pn=P.pano, len=Pn.x1-Pn.x0, n=48;
    const T2=canvasTex(2560,Math.round(2560*Pn.h/len*1.0),true), pm=new THREE.MeshBasicMaterial({map:T2.t,toneMapped:false,side:THREE.DoubleSide});
    const curve=(u)=>{ const x=lerp(Pn.x0,Pn.x1,u), zc=Pn.z+.06*Math.pow((x-P.eye[0]*.3)/.9,2); return [x,zc]; };
    const pg=grid(n,1,(u,v)=>{ const q=curve(u), t=Pn.tilt*DEG; return [q[0],Pn.y-Pn.h/2+v*Pn.h*Math.cos(t),q[1]+(v-.5)*Pn.h*Math.sin(t)]; });
    mesh(pg,pm,G,false,false); parts.pano={T:T2,m:pm,w:T2.c.width,h:T2.c.height};
    const hoodM=upM; mesh(grid(n,4,(u,v)=>{ const q=curve(u), t=Pn.tilt*DEG; return [q[0],Pn.y+Pn.h/2*Math.cos(t)+.006+.012*Math.sin(Math.PI*v),q[1]+Pn.h/2*Math.sin(t)-.02+v*.05]; }),hoodM,G);
    mesh(grid(n,2,(u,v)=>{ const q=curve(u), t=Pn.tilt*DEG; return [q[0],Pn.y-Pn.h/2-.004,q[1]-Pn.h/2*Math.sin(t)-.004-v*.03]; }),M({color:0x080808,roughness:.3}),G);
    const gl=mesh(grid(n,1,(u,v)=>{ const q=curve(u), t=Pn.tilt*DEG; return [q[0],Pn.y-Pn.h/2+v*Pn.h*Math.cos(t),q[1]+(v-.5)*Pn.h*Math.sin(t)+.0015]; }),M({color:0,metalness:1,roughness:.05,transparent:true,opacity:.16,depthWrite:false,env:1.3}),G,false,false); }
  parts.screen=screenMesh(G,P.screen.c,P.screen.w,P.screen.h,P.screen.tilt,1024,null);
  if(P.ex) explorerStack(G,P,parts,fz,xd,upM,loM);
  // climate / hazard buttons row under the screen
  if(!P.ex){ const by=P.screen.c[1]-P.screen.h/2-.05, bz=fz(by)+.012, row=new THREE.Group(); row.position.set(P.screen.c[0],by,bz); row.rotation.x=-.5; G.add(row);
    const plate=mesh(rbox(.30,.05,.012,.003,.008),M({color:lux?0x1a1715:0x0a0a0b,roughness:.18,metalness:.25}),row);
    if(!lux) for(const sx of [-1,1]){ const kn=mesh(new THREE.CylinderGeometry(.017,.018,.018,32),M({color:0xc3c8ce,metalness:1,roughness:.22,out:true}),row); kn.rotation.x=Math.PI/2; kn.position.set(sx*.175,0,.012); kn.material.userData.out=false; kn.material.envMap=ENV.inn; kn.material.envMapIntensity=1.5;
      const kc=mesh(new THREE.CylinderGeometry(.013,.013,.004,24),M({color:0x101112,roughness:.4}),row); kc.rotation.x=Math.PI/2; kc.position.set(sx*.175,0,.022); }
    const T3=canvasTex(512,96), x=T3.x; x.fillStyle=lux?'#1a1715':'#0a0a0b'; x.fillRect(0,0,512,96); x.fillStyle='#c9ced4'; x.font='600 26px system-ui,Arial'; x.textAlign='center'; x.textBaseline='middle';
    ['❄','A/C','▲','◢◣','✱','AUTO','≋'].forEach((t,i)=>x.fillText(t,40+i*72,48)); if(!lux){ x.fillStyle='#d01c24'; x.beginPath(); x.moveTo(256,22); x.lineTo(278,70); x.lineTo(234,70); x.closePath(); x.lineWidth=5; x.strokeStyle='#d01c24'; x.stroke(); }
    const lab=mesh(new THREE.PlaneGeometry(.29,.045),new THREE.MeshBasicMaterial({map:T3.t}),row,false,false); lab.position.z=.0065; parts.btns=lab.material; }
  // centre console with the gear selector (rotary dial / piano-key buttons) and armrest
  { const cm=M({color:P.col.top,roughness:.45,normalMap:rep(T.grain,4,6),normalScale:new THREE.Vector2(.4,.4)}), cx=0;
    const zc0=P.dash[P.dash.length-1][1]-.03, zc1=P.eye[2]+.45;
    mesh(grid(10,10,(u,v)=>{ const s=u*2-1, z=lerp(zc0,zc1,v); return [cx+s*.15,.62+.03*(1-s*s)-.06*v+(v<.15?.12*(1-v/.15):0),z]; }),cm,G);
    for(const s of [-1,1]) mesh(grid(2,8,(u,v)=>[cx+s*.155,lerp(.34,.64-.06*v,u),lerp(zc0,zc1,v)]),loM,G);
    const ar=mesh(rbox(.2,.07,.32,.03,.05),M({color:P.col.lower,roughness:.6,normalMap:rep(T.leather,3,4)}),G); ar.position.set(cx,.66,zc1-.18);
    if(!lux){ const dial=mesh(new THREE.CylinderGeometry(.034,.036,.03,40),M({map:rep(T.alu,2,1),metalness:.9,roughness:.25}),G); dial.position.set(cx+(P.ex?-.05:0),.66,zc0+.17);
      const ring=mesh(new THREE.TorusGeometry(.04,.003,8,40),M({color:0x111,roughness:.3}),G); ring.position.set(cx+(P.ex?-.05:0),.651,zc0+.17); ring.rotation.x=Math.PI/2;
      const pr=canvasTex(256,64); pr.x.fillStyle='#0a0a0b'; pr.x.fillRect(0,0,256,64); pr.x.font='700 34px system-ui'; pr.x.textAlign='center'; pr.x.textBaseline='middle'; ['P','R','N','D','S'].forEach((t,i)=>{ pr.x.fillStyle=i===3?'#ffffff':'#70757c'; pr.x.fillText(t,28+i*50,32); });
      const pl=mesh(new THREE.PlaneGeometry(.12,.03),new THREE.MeshBasicMaterial({map:pr.t}),G,false,false); pl.position.set(cx+(P.ex?-.05:0),.6505,zc0+.105); if(P.ex) pl.scale.set(.75,.75,1); pl.rotation.x=-Math.PI/2; parts.prnd={T:pr,cur:'D'}; }
    else { const pr=canvasTex(512,64); pr.x.fillStyle='#16130f'; pr.x.fillRect(0,0,512,64); pr.x.font='600 30px system-ui'; pr.x.textAlign='center'; pr.x.textBaseline='middle'; ['P','R','N','D','S'].forEach((t,i)=>{ pr.x.fillStyle=i===3?'#fff':'#a09c94'; pr.x.fillText(t,52+i*102,32); });
      const keys=mesh(rbox(.24,.03,.012,.003,.006),M({color:0xc8c2b6,metalness:.9,roughness:.22}),G); keys.position.set(P.screen.c[0],P.screen.c[1]-P.screen.h/2-.105,fz(P.screen.c[1]-P.screen.h/2-.105)+.01); keys.rotation.x=-.55;
      const pl=mesh(new THREE.PlaneGeometry(.23,.026),new THREE.MeshBasicMaterial({map:pr.t}),keys,false,false); pl.position.z=.0065; parts.prnd={T:pr,cur:'D',lux:true}; } }
  // glovebox seam and passenger knee panel
}
// 2020-on Explorer (owner 2026-11-21, a photo of the real dash: "make the inside of the explorer look like this"):
// a stand-up 8" touchscreen on top of the dash with big chrome-ringed vents either side, a band of grey-brown wood across
// the whole dash under them, a centre stack of a storage cubby, the volume / tune knobs with the hazard button between,
// then the climate panel; silver trim down the stack and console, the rotary gear dial beside the cup holders, and a
// plain glovebox with its handle on the inboard side.
// Explorer vent (owner 2026-11-21: "make the vents look exactly like the picture"): a rounded-rectangle bright chrome
// surround, a deep black throat with thin horizontal slats, one chrome blade across the middle with a small chrome tab.
// Explorer vent (owner 2026-11-21, from a close-up of the real one): flat and widest across the top, sides tapering in,
// rounder bottom corners and the bottom edge bowed down; satin silver frame in a chunky dark pod, grey slats, a small tab.
function ventEx(g,w,h){
  const K=.80, sh=(W,H,e)=>{ const s=new THREE.Shape(), t=H/2, bt=-H/2, tw=W/2, bw=W/2*K, rt=Math.min(.006+e*.5,H*.2), rb=Math.min(.018+e,H*.42), bow=H*.10;
    s.moveTo(-tw+rt,t); s.lineTo(tw-rt,t); s.quadraticCurveTo(tw,t,tw-rt*(1-K)*.6,t-rt);
    s.lineTo(bw+rb*.25,bt+rb); s.quadraticCurveTo(bw,bt-bow*.2,bw-rb,bt-bow*.6);
    s.quadraticCurveTo(0,bt-bow*1.3,-bw+rb,bt-bow*.6);
    s.quadraticCurveTo(-bw,bt-bow*.2,-bw-rb*.25,bt+rb); s.lineTo(-tw+rt*(1-K)*.6,t-rt); s.quadraticCurveTo(-tw,t,-tw+rt,t); return s; };
  const satin=M({color:0xb4b8bd,metalness:.8,roughness:.34,emissive:0x141516,env:1.4});
  const pod=mesh(new THREE.ExtrudeGeometry(sh(w+.034,h+.034,.012),{depth:.012,bevelEnabled:true,bevelThickness:.006,bevelSize:.006,bevelSegments:4,curveSegments:12}),M({color:0x1b1c1e,roughness:.55,normalMap:rep(textures().grain,2,1),normalScale:new THREE.Vector2(.3,.3)}),g); pod.position.z=-.010;
  const ring=sh(w+.010,h+.010,.004); ring.holes.push(sh(w,h,0));
  const bz=mesh(new THREE.ExtrudeGeometry(ring,{depth:.004,bevelEnabled:true,bevelThickness:.0015,bevelSize:.0012,bevelSegments:3,curveSegments:12}),satin,g); bz.position.z=.007;
  const throat=mesh(new THREE.ShapeGeometry(sh(w,h,0),12),M({color:0x020202,roughness:1}),g,false); throat.position.z=-.006;
  const slatM=M({color:0x3a3b3e,roughness:.4,metalness:.3});
  const n=6; for(let k=0;k<n;k++){ const f=(k+.5)/n, y=-h/2+f*h, ww=w*lerp(K,1,f)-(k===0?.02:.006);
    const sl=mesh(new THREE.BoxGeometry(ww,.0024,.014),slatM,g); sl.position.set(0,y,.002); sl.rotation.x=-.15; }
  const tab=mesh(rbox(.02,.009,.008,.003,.004),satin,g); tab.position.set(0,-h/n*.5,.011);
}
function explorerStack(G,P,parts,fz,xd,upM,loM){
  const T=textures(), wood=M({map:rep(T.ash,3,1),color:0x76675b,roughness:.38,clearcoat:.6,clearcoatRoughness:.15});
  const chrome=M({color:0xd5dade,metalness:1,roughness:.18,env:1.5}), satin=M({map:rep(T.alu,2,1),color:0xc4c9cf,metalness:.9,roughness:.3,env:1.3});
  const gloss=M({color:0x09090a,roughness:.16,metalness:.3}), sw=.135;               // stack half-width
  const tiltAt=y=>{ const d=.02, a=fz(y+d), b=fz(y-d); return -Math.atan2(b-a,2*d); };   // the dash face's lean at height y
  const onFace=(x,y,dz,par)=>{ const g=new THREE.Group(); g.position.set(x,y,fz(y)+dz); g.rotation.x=tiltAt(y); (par||G).add(g); return g; };
  // wood band, both sides of the stack, sweeping back into the doors at the ends
  const wy0=.912, wy1=.948;
  for(const s of [-1,1]) mesh(grid(40,3,(u,v)=>{ const x=s*lerp(sw-.005,xd-.03,u), y=lerp(wy0,wy1,v), o=.10*sstep(.55,1,Math.abs(x)/xd); return [x,y,fz(y)+o+.006]; }),wood,G);
  for(const s of [-1,1]) for(const y of [wy0-.002,wy1+.002]) mesh(grid(40,1,(u,v)=>{ const x=s*lerp(sw-.005,xd-.03,u), o=.10*sstep(.55,1,Math.abs(x)/xd); return [x,y+(v-.5)*.003,fz(y)+o+.0075]; }),M({color:0x0b0b0c,roughness:.5}),G,false);
  // the screen stands proud of the dash: a thick bezel and a little foot behind it
  { const S=P.screen, f=new THREE.Group(); f.position.set(S.c[0],S.c[1],S.c[2]); f.rotation.x=-S.tilt*DEG; G.add(f);
    const bz=mesh(rbox(S.w+.022,S.h+.022,.022,.006,.01),M({color:0x0b0b0c,roughness:.35,metalness:.2}),f); bz.position.z=-.0125;
    const ft=mesh(rbox(.09,.05,.05,.008,.012),upM,f); ft.position.set(0,-S.h/2+.005,-.045);
    const lip=mesh(new THREE.BoxGeometry(S.w+.01,.0025,.004),satin,f,false); lip.position.set(0,-S.h/2-.0125,-.002); }
  // the stack: a slightly proud black panel from the wood band down to the console
  const sy1=P.screen.c[1]-P.screen.h/2-.012, sy0=.70;
  mesh(grid(6,24,(u,v)=>{ const x=(u*2-1)*sw, y=lerp(sy0,sy1,v); return [x,y,fz(y)+.012]; }),M({color:0x141416,roughness:.45,normalMap:rep(T.grain,3,5),normalScale:new THREE.Vector2(.3,.3)}),G);
  for(const s of [-1,1]) mesh(grid(1,24,(u,v)=>{ const y=lerp(sy0-.06,sy1-.01,v); return [s*(sw+.002)+(u-.5)*.008,y,fz(y)+.016]; }),satin,G);   // silver edges
  // storage cubby under the screen
  { const g=onFace(0,.936,.012), w=.19, h=.034;
    mesh(new THREE.PlaneGeometry(w,h),M({color:0x020202,roughness:1}),g,false).position.z=-.002;
    for(const yy of [-1,1]){ const e=mesh(new THREE.BoxGeometry(w,.003,.03),M({color:0x101011,roughness:.7}),g); e.position.set(0,yy*h/2,.012); } }
  // knob row: volume left, tune right, hazard button between on a silver bar
  { const g=onFace(0,.893,.016), T3=canvasTex(512,64), x=T3.x;
    const plate=mesh(rbox(.25,.034,.008,.003,.006),gloss,g); plate.position.z=.002;
    x.fillStyle='#09090a'; x.fillRect(0,0,512,64); x.font='600 22px system-ui,Arial'; x.textAlign='center'; x.textBaseline='middle'; x.fillStyle='#b9bec5';
    [['⏻',122],['⏮',178],['⏭',334],['◉',390]].forEach(([t,X])=>x.fillText(t,X,32));
    x.lineWidth=5; x.strokeStyle='#d01c24'; x.beginPath(); x.moveTo(256,14); x.lineTo(278,50); x.lineTo(234,50); x.closePath(); x.stroke();
    const lab=mesh(new THREE.PlaneGeometry(.17,.0215),new THREE.MeshBasicMaterial({map:T3.t}),g,false,false); lab.position.z=.0065; parts.btns=lab.material;
    const bar1=mesh(new THREE.BoxGeometry(.17,.002,.003),satin,g,false); bar1.position.set(0,.0125,.007);
    for(const sx of [-1,1]){ const kn=mesh(new THREE.CylinderGeometry(.0165,.0175,.02,40),chrome,g); kn.rotation.x=Math.PI/2; kn.position.set(sx*.105,0,.012);
      const kc=mesh(new THREE.CylinderGeometry(.012,.012,.004,32),M({color:0x0d0d0e,roughness:.35}),g); kc.rotation.x=Math.PI/2; kc.position.set(sx*.105,0,.0225); } }
  // climate panel: two rows of keys with a silver bar between, red / blue warm-cool marks at the ends
  { const g=onFace(0,.84,.016), T4=canvasTex(768,160), x=T4.x;
    mesh(rbox(.25,.062,.008,.004,.008),gloss,g).position.z=.002;
    x.fillStyle='#0a0a0b'; x.fillRect(0,0,768,160); x.font='600 24px system-ui,Arial'; x.textAlign='center'; x.textBaseline='middle'; x.fillStyle='#c9ced4';
    ['▲','A/C','MAX','⤢','REAR','▼'].forEach((t,i)=>x.fillText(t,74+i*124,44)); ['▲','✱','AUTO','≋','◠','▼'].forEach((t,i)=>x.fillText(t,74+i*124,116));
    x.fillStyle='#e0332e'; x.fillRect(16,30,8,100); x.fillStyle='#3b7fe8'; x.fillRect(744,30,8,100);
    x.fillStyle='#ff9a2e'; for(const X of [198,446]) x.fillRect(X-10,66,20,4);                 // the little amber "on" lamps
    const lab=mesh(new THREE.PlaneGeometry(.24,.05),new THREE.MeshBasicMaterial({map:T4.t}),g,false,false); lab.position.z=.0065;
    const b2=mesh(new THREE.BoxGeometry(.235,.0025,.003),satin,g,false); b2.position.set(0,0,.0075); }
  // glovebox (owner 2026-11-21, a photo of the real one): one big door filling the passenger's lower dash, a soft seam
  // round it with a wide rounded corner at the top outboard end, and a recessed pull handle at the top inboard corner
  { const gy0=.635, gy1=.898, gx0=.19, gx1=xd-.12, sweep=x=>.10*sstep(.55,1,x/xd);
    const sp=new THREE.Shape(), rt=.07, ri=.016, rb=.025;
    sp.moveTo(gx0+ri,gy1); sp.lineTo(gx1-rt,gy1); sp.quadraticCurveTo(gx1,gy1,gx1,gy1-rt); sp.lineTo(gx1,gy0+rb); sp.quadraticCurveTo(gx1,gy0,gx1-rb,gy0);
    sp.lineTo(gx0+rb,gy0); sp.quadraticCurveTo(gx0,gy0,gx0,gy0+rb); sp.lineTo(gx0,gy1-ri); sp.quadraticCurveTo(gx0,gy1,gx0+ri,gy1);
    const pts=sp.getSpacedPoints(220);
    const ribbon=(off,wd,dz,mat)=>{ const pos=[],idx=[]; for(let i=0;i<pts.length;i++){ const a=pts[Math.max(0,i-1)], c=pts[Math.min(pts.length-1,i+1)], tx=c.x-a.x, ty=c.y-a.y, L=Math.hypot(tx,ty)||1, nx=ty/L, ny=-tx/L;
        for(const k of [-.5,.5]){ const x=pts[i].x+nx*(off+k*wd), y=pts[i].y+ny*(off+k*wd); pos.push(x,y,fz(y)+sweep(x)+dz); } if(i) idx.push(2*i-2,2*i-1,2*i, 2*i-1,2*i+1,2*i); }
      const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setIndex(idx); g.computeVertexNormals(); return mesh(g,mat,G,false); };
    ribbon(0,.0028,.0034,M({color:0x050505,roughness:.9}));                    // the gap
    ribbon(-.003,.0025,.0036,M({color:0x2b2c2f,roughness:.5}));                // the door's rounded edge catching the light, just inside it
    const g=onFace(gx0+.115,gy1-.048,.0035), shp=(W,H,R)=>rbox(W,H,.004,R,R*1.6);
    const pocket=mesh(shp(.10,.028,.009),M({color:0x060606,roughness:.85}),g); pocket.position.z=-.001;   // the recess
    const lip=mesh(new THREE.TorusGeometry(1,.06,6,40),M({color:0x232427,roughness:.45}),g); lip.scale.set(.051,.015,.02); lip.position.z=.002;
    const lev=new THREE.Group(); lev.position.set(.004,-.002,.003); lev.rotation.z=-.10; g.add(lev);       // the pull, angled down toward the outboard end
    mesh(rbox(.074,.011,.008,.004,.006),M({color:0x3a3b3f,roughness:.35,metalness:.35,env:1.1}),lev);
    const end=mesh(new THREE.CylinderGeometry(.0065,.0065,.008,18),M({color:0x3a3b3f,roughness:.35,metalness:.35,env:1.1}),lev); end.rotation.x=Math.PI/2; end.position.x=-.036; }
  // console: silver flanks, a lidded bin in front of the dial, cup holders beside it
  { const zc0=P.dash[P.dash.length-1][1]-.03;
    for(const s of [-1,1]) mesh(bar([[s*.152,.62,zc0+.01],[s*.155,.64,zc0+.22],[s*.155,.62,zc0+.45]],.006,.012,[1,0,0],20,6),satin,G);
    const cup=M({color:0x050506,roughness:.6}), rim=M({color:0x1b1b1d,roughness:.35,metalness:.3});
    for(const dz of [.205,.29]){ const r=mesh(new THREE.TorusGeometry(.036,.004,8,32),rim,G); r.rotation.x=Math.PI/2; r.position.set(.055,.655,zc0+dz);
      const h=mesh(new THREE.CircleGeometry(.034,32),cup,G,false); h.rotation.x=-Math.PI/2; h.position.set(.055,.652,zc0+dz); }
    const pad=mesh(rbox(.06,.012,.05,.004,.008),gloss,G); pad.position.set(-.05,.646,zc0+.25);       // buttons behind the dial
  }
}
function dashEV(G,P,parts){
  // Model Y: a low, flat dash — soft black top, one air-vent slot across the whole width over a wood strip, the 15" screen
  // floating on a short stem, and a console with two phone pads in front of the armrest
  const T=textures();
  const upM=M({color:P.col.top,roughness:.82,normalMap:rep(T.grain,16,4),normalScale:new THREE.Vector2(.5,.5)});
  const loM=M({color:P.col.lower,roughness:.75,normalMap:rep(T.grain,10,4),normalScale:new THREE.Vector2(.5,.5)});
  const xd=P.door+.005, end=x=>.10*sstep(.55,1,Math.abs(x)/xd), n=P.dash.length-1;
  loftDash(G,P,upM,-xd,xd,P.dash.slice(0,5),(x,v)=>[end(x)*sstep(.2,.6,v),0]);
  loftDash(G,P,loM,-xd,xd,P.dash.slice(4),(x,v)=>[end(x),0]);
  const sp=new THREE.SplineCurve(P.dash.map(p=>new THREE.Vector2(p[1],p[0])));
  const band=(i0,i1,mat,out,nv)=>{ const a=sp.getPoint(i0/n), b=sp.getPoint(i1/n);
    return mesh(grid(60,nv||2,(u,v)=>{ const x=lerp(-xd+.035,xd-.035,u), q=a.clone().lerp(b,v), o=end(x); return [x,q.y,q.x+o+out]; }),mat,G); };
  band(4.02,4.22,M({color:0x030303,roughness:1}),.002);                     // the vent slot (dark)
  band(4.02,4.04,M({color:0x2a2a2c,roughness:.5,metalness:.3}),.006,1);     // its upper lip
  const wood=M({map:rep(T.ash,3,1),color:0x8f7c68,roughness:.55});
  band(4.30,4.95,wood,.004,3);                                               // the wood strip
  for(const s of [-1,1]){ const zA=P.ws.zB+.06, zE=P.zBp!=null?P.zBp:P.zC-.1;  // ...and on round into the doors
    mesh(grid(20,2,(u,v)=>[s*(P.door-.014),lerp(P.belt-.135,P.belt-.095,v),lerp(zA+.1,zE-.06,u)]),wood,G); }
  // footwell front wall under the dash (otherwise the road shows through between the dash and the floor)
  mesh(grid(12,2,(u,v)=>[lerp(-xd,xd,u),lerp(P.dash[n][0]+.01,.30,v),lerp(P.dash[n][1]+.01,P.ws.zB+.2,v)]),M({color:P.col.carpet,roughness:1,normalMap:rep(T.carpet,8,4)}),G);
  // the screen and its stem
  const C=P.screen; parts.screen=screenMesh(G,C.c,C.w,C.h,C.tilt,1024,null);
  const stem=mesh(rbox(.06,.05,.025,.008,.01),M({color:0x0b0b0c,roughness:.4}),G); stem.position.set(C.c[0],C.c[1]-C.h/2-.005,C.c[2]-.035);
  // centre console: glossy black top, phone pads at the front, armrest in the seat colour
  { const cm=M({color:0x0d0d0e,roughness:.2,metalness:.15,env:1.2}), zc0=P.dash[n][1]-.03, zc1=P.eye[2]+.45;
    mesh(grid(10,10,(u,v)=>{ const s=u*2-1, z=lerp(zc0,zc1,v); return [s*.15,.60+.025*(1-s*s)-.05*v+(v<.15?.10*(1-v/.15):0),z]; }),cm,G);
    for(const s of [-1,1]) mesh(grid(2,8,(u,v)=>[s*.155,lerp(.34,.62-.05*v,u),lerp(zc0,zc1,v)]),loM,G);
    const padM=M({color:0x0a0a0b,roughness:.7,normalMap:rep(T.grain,2,4)}), rib=M({color:0x1b1b1d,roughness:.6});
    for(const s of [-1,1]){ const g=new THREE.Group(); g.position.set(s*.05,.69,zc0+.075); g.rotation.x=-1.05; G.add(g);
      mesh(rbox(.088,.16,.014,.004,.012),padM,g);
      for(let k=0;k<6;k++) mesh(new THREE.BoxGeometry(.07,.004,.004),rib,g,false).position.set(0,-.06+k*.024,.008); }
    const ar=mesh(rbox(.2,.07,.34,.03,.05),M({color:SEATS[CK.seats],roughness:.6,normalMap:rep(T.leather,3,4),normalScale:new THREE.Vector2(.25,.25)}),G); ar.position.set(0,.64,zc1-.19); }
}
function dashClassic(G,P,parts){
  const T=textures();
  const vin=M({color:P.col.top,roughness:.55,normalMap:rep(T.vinyl,14,4),normalScale:new THREE.Vector2(.7,.7)});
  const xd=P.door+.005;
  loftDash(G,P,vin,-xd,xd,P.dash,(x,v)=>[.06*sstep(.6,1,Math.abs(x)/xd)*sstep(.3,.7,v),0]);
  // the wrap-around driver's pod: a curved woodgrain face with three round gauges, topped by a padded brow
  const Pd=P.pod, cx=P.eye[0];
  const zf=x=>Pd.z+.11*Math.pow((x-cx)/((Pd.x1-Pd.x0)/2),2);
  const wood=M({map:rep(T.walnut,1.5,1),color:0x9a8a80,roughness:.32,clearcoat:1,clearcoatRoughness:.12});
  const podM=M({color:0x0c0c0c,roughness:.6,normalMap:rep(T.vinyl,8,3),normalScale:new THREE.Vector2(.5,.5)});
  mesh(grid(40,8,(u,v)=>{ const x=lerp(Pd.x0,Pd.x1,u), y=lerp(Pd.y0+.035,Pd.y1,v); return [x,y,zf(x)+.035*v]; }),podM,G);   // leans back toward the driver
  mesh(grid(40,2,(u,v)=>{ const x=lerp(Pd.x0,Pd.x1,u), y=lerp(Pd.y0,Pd.y0+.035,v); return [x,y,zf(x)+.001]; }),wood,G);
  mesh(grid(40,8,(u,v)=>{ const x=lerp(Pd.x0-.01,Pd.x1+.01,u), a=v*Math.PI; return [x,Pd.y1+.004+.03*Math.sin(a),zf(x)+.045-.09*(1-Math.cos(a))/2]; }),vin,G);   // padded brow over the gauges
  const chrome=M({color:0xd9dde2,metalness:1,roughness:.1,out:true});
  mesh(bar(Array.from({length:9},(_,i)=>{ const x=lerp(Pd.x0,Pd.x1,i/8); return [x,Pd.y0-.004,zf(x)+.004]; }),.006,.006,[0,0,1],40,6),chrome,G);
  const gy=(Pd.y0+Pd.y1)/2+.008, gz=x=>zf(x)+.03;
  parts.gauges=[ roundGauge(G,P,[cx-.135,gy,gz(cx-.135)],.058,'speed'), roundGauge(G,P,[cx+.02,gy,gz(cx+.02)],.058,'tach'), roundGauge(G,P,[cx+.165,gy-.006,gz(cx+.165)],.046,'combo') ];
  // small warning lamps between the gauges
  parts.lamps=[]; for(const [dx,col] of [[.095,0xff3020]]){ const l=mesh(new THREE.CircleGeometry(.006,12),new THREE.MeshBasicMaterial({color:0x111111}),G,false); l.position.set(cx+dx,Pd.y1-.02,zf(cx+dx)+.005); l.lookAt(new V3(...P.eye)); l.userData.on=col; parts.lamps.push(l); }
  // turn signal arrows on the pod, between the speedometer and the rev counter (lit by update())
  { const sh=new THREE.Shape(); sh.moveTo(.012,0); sh.lineTo(0,.009); sh.lineTo(0,.004); sh.lineTo(-.01,.004); sh.lineTo(-.01,-.004); sh.lineTo(0,-.004); sh.lineTo(0,-.009); sh.closePath();
    parts.sig=[]; for(const dir of [-1,1]){ const m=new THREE.MeshBasicMaterial({color:0x0c1a0e}), a=mesh(new THREE.ShapeGeometry(sh),m,G,false,false);
      a.position.set(cx-.058+dir*.016,Pd.y1-.022,zf(cx-.058)+.006); a.lookAt(new V3(...P.eye)); a.rotateZ(dir<0?Math.PI:0); parts.sig.push({m,dir}); } }
  // passenger side: woodgrain band, glovebox with chrome lock
  mesh(grid(30,4,(u,v)=>{ const x=lerp(Pd.x1+.02,xd-.05,u), q=new THREE.SplineCurve(P.dash.map(p=>new THREE.Vector2(p[1],p[0]))).getPoint(.62+.12*v); return [x,q.y,q.x+.003+.06*sstep(.6,1,Math.abs(x)/xd)]; }),wood,G);
  // radio with push buttons and dial window, heater slider panel
  { const rg=new THREE.Group(); rg.position.set(.07,.70,-.448); rg.rotation.x=-.12; G.add(rg);
    mesh(rbox(.19,.055,.03,.004,.006),chrome,rg);
    const T2=canvasTex(512,128), x=T2.x; x.fillStyle='#1b1408'; x.fillRect(0,0,512,128); x.fillStyle='#e8d9a8'; x.font='600 22px Arial'; x.textAlign='center';
    [54,60,70,80,100,120,140,160].forEach((f,i)=>x.fillText(f,40+i*62,52)); x.fillRect(20,72,472,3); x.fillStyle='#ff5a1a'; x.fillRect(300,30,4,70);
    const dw=mesh(new THREE.PlaneGeometry(.11,.026),new THREE.MeshStandardMaterial({map:T2.t,emissiveMap:T2.t,emissive:0xffffff,emissiveIntensity:0}),rg,false,false); dw.position.set(0,.008,.016); parts.radio=dw.material;
    for(let k=0;k<5;k++){ const b=mesh(rbox(.016,.012,.014,.002,.003),chrome,rg); b.position.set(-.045+k*.0225,-.014,.018); }
    for(const s of [-1,1]){ const kn=mesh(new THREE.CylinderGeometry(.01,.011,.018,24),chrome,rg); kn.rotation.x=Math.PI/2; kn.position.set(s*.08,0,.022); } }
  { const hp=mesh(rbox(.17,.04,.012,.003,.005),M({color:0x0b0b0b,roughness:.4}),G); hp.position.set(.07,.628,-.432); hp.rotation.x=-.4;
    for(let k=0;k<2;k++){ const s=mesh(rbox(.012,.012,.012,.003,.004),chrome,hp); s.position.set(-.03+k*.06,0,.008); } }
  // console + floor shifter (horseshoe handle on a chrome stalk)
  { const cm=M({color:0x101010,roughness:.5,normalMap:rep(T.vinyl,4,6)});
    mesh(grid(10,10,(u,v)=>{ const s=u*2-1, z=lerp(-.40,P.eye[2]+.4,v); return [.0+s*.13,.42+.03*(1-s*s)-(v<.12?-.1*(1-v/.12):0),z]; }),cm,G);
    const plate=mesh(rbox(.11,.012,.2,.004,.01),wood,G); plate.position.set(0,.455,-.08);
    const st=mesh(new THREE.CylinderGeometry(.007,.009,.18,16),chrome,G); st.position.set(0,.55,-.07); st.rotation.x=-.25;
    const hd=mesh(bar([[-.045,.64,-.05],[-.045,.67,-.08],[0,.685,-.095],[.045,.67,-.08],[.045,.64,-.05]],.024,.022,[0,0,1],24,10),M({color:0x111111,roughness:.3}),G);
    const pr=canvasTex(256,64); pr.x.fillStyle='#0c0c0c'; pr.x.fillRect(0,0,256,64); pr.x.font='700 30px Arial'; pr.x.textAlign='center'; pr.x.textBaseline='middle'; ['P','R','N','D','2','1'].forEach((t,i)=>{ pr.x.fillStyle=i===3?'#ffffff':'#9a9a9a'; pr.x.fillText(t,22+i*42,32); });
    const pl=mesh(new THREE.PlaneGeometry(.09,.022),new THREE.MeshBasicMaterial({map:pr.t}),G,false,false); pl.position.set(0,.4625,-.15); pl.rotation.x=-Math.PI/2; parts.prnd={T:pr,cur:'D',classic:true}; }
  // two small rectangular vents at the dash ends
  for(const s of [-1,1]){ const g=new THREE.Group(); g.position.set(s*(xd-.1),.74,-.43); g.rotation.y=-s*.5; G.add(g);
    mesh(rbox(.10,.05,.02,.004,.006),chrome,g); const b=mesh(new THREE.PlaneGeometry(.085,.037),M({color:0x030303}),g,false); b.position.z=.0105;
    for(let k=0;k<4;k++){ const sl=mesh(new THREE.BoxGeometry(.003,.035,.012),M({color:0x222,roughness:.5}),g); sl.position.set(-.03+k*.02,0,.012); } }
}

/* ---------- windshield rain / snow and wipers ---------- */
function wipers(G,P,wsP,parts){
  const T=canvasTex(512,256,true), m=new THREE.MeshBasicMaterial({map:T.t,transparent:true,depthWrite:false,side:THREE.DoubleSide});
  const g=mesh(grid(24,12,(u,v)=>{ const p=wsP(u,v); return [p[0],p[1],p[2]+.004]; }),m,G,false,false); g.renderOrder=7;
  const arms=[], am=M({color:0x0a0a0b,roughness:.6,metalness:.3});
  for(const pu of (P.wipers||[.12,.55])){ const a=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),am); a.castShadow=true; G.add(a); arms.push({o:a,pu}); }
  parts.rain={T,arms,ang:0,dir:1,on:false,t:0,wsP};
}
const LU=.40, LV=.66, SWEEP=1.9;                                   // blade reach across / up the glass (uv), stroke (rad)
function wsVec(wsP,u,v){ const p=wsP(clamp(u,0,1),clamp(v,0,1)); return new V3(p[0],p[1],p[2]); }
function updateRain(R,dt,P){
  const W=YD.AT&&YD.AT.wx||{}, wet=W.type?(W.int||.5):0, x=R.T.x, w=512, h=256, v=Math.abs(S.v||0);
  R.t+=dt; let changed=false;
  if(wet>0&&R.t>.05){ const n=Math.round((W.type==='snow'?160:420)*wet*(.6+v/25)*R.t); R.t=0;
    for(let i=0;i<n;i++){ const px=Math.random()*w, py=Math.random()*h*.95, r=(W.type==='snow'?1.6:1.1)+Math.random()*(W.type==='snow'?3:2.6);
      if(W.type==='snow'){ x.fillStyle='rgba(245,248,252,.85)'; x.beginPath(); x.arc(px,py,r,0,7); x.fill(); }
      else { const g=x.createRadialGradient(px-r*.3,py-r*.3,0,px,py,r); g.addColorStop(0,'rgba(255,255,255,.55)'); g.addColorStop(.6,'rgba(160,175,190,.28)'); g.addColorStop(1,'rgba(40,50,60,.45)'); x.fillStyle=g; x.beginPath(); x.arc(px,py,r,0,7); x.fill(); } }
    if(v>12&&W.type!=='snow'){ x.globalCompositeOperation='destination-out'; x.fillStyle='rgba(0,0,0,.05)'; x.fillRect(0,0,w,h); x.globalCompositeOperation='source-over'; }   // the wind blows the drops up and off at speed
    changed=true; }
  // automatic wipers while it's wet; finish the stroke and park when it stops
  const on=wet>0, per=wet>.6?.9:1.5;
  if(on||R.ang>.01){ const prev=R.ang; R.ang+=R.dir*dt*(SWEEP*2/per);
    if(R.ang>=SWEEP){ R.ang=SWEEP; R.dir=-1; } if(R.ang<=0){ R.ang=0; R.dir=on?1:0; if(!on) R.dir=1; }
    // erase the swept wedge on the glass
    x.globalCompositeOperation='destination-out'; x.fillStyle='rgba(0,0,0,1)';
    for(const a of R.arms){ const cx=a.pu*w, cy=h, tip=t=>[cx+Math.cos(t)*LU*w*1.06,cy-Math.sin(t)*LV*h*1.06], t0=Math.min(prev,R.ang)-.05, t1=Math.max(prev,R.ang)+.05;
      x.beginPath(); x.moveTo(cx,cy); for(let q=0;q<=6;q++){ const p=tip(lerp(t0,t1,q/6)); x.lineTo(p[0],p[1]); } x.closePath(); x.fill(); }
    x.globalCompositeOperation='source-over'; changed=true; }
  if(!on&&!R.ang&&R.cleared!==true){ x.clearRect(0,0,w,h); R.cleared=true; changed=true; } if(on) R.cleared=false;
  if(changed) R.T.t.needsUpdate=true;
  // blade positions on the glass
  for(const a of R.arms){ const base=wsVec(R.wsP,a.pu,.015), ang=R.ang+.04, tip=wsVec(R.wsP,a.pu+Math.cos(ang)*LU,.015+Math.sin(ang)*LV);
    const d=tip.clone().sub(base), len=d.length(); a.o.position.copy(base).add(tip).multiplyScalar(.5); a.o.position.z-=.012; a.o.scale.set(.012,.012,len);
    a.o.parent.updateMatrixWorld(); a.o.lookAt(a.o.parent.localToWorld(new V3(tip.x,tip.y,tip.z-.012))); }
}

/* ---------- build a cabin ---------- */
function build(key){
  if(CK.cab&&CK.built===key+'|'+(CARSPEC.paint||0)) return;
  if(CK.cab) dispose();
  const P=SPECS[specKey(key)]; textures(); updateEnv(true);
  const sc=new THREE.Scene(), root=new THREE.Group(), G=new THREE.Group(); sc.add(root); root.add(G);
  const cam=new THREE.PerspectiveCamera(CK.fov,1,.02,80); cam.rotation.order='YXZ'; sc.add(cam);
  // lights: sky through the glass, the sun (with shadows on Medium/High), a little bounce, gauge glow at night
  const hemi=new THREE.HemisphereLight(0xdfeeff,0x5a524a,.8); sc.add(hemi);
  const sunL=new THREE.DirectionalLight(0xfff2dd,1); sunL.position.set(0,10,0); sc.add(sunL); sc.add(sunL.target);
  sunL.shadow.mapSize.set(2048,2048); const sc2=sunL.shadow.camera; sc2.left=-2.4; sc2.right=2.4; sc2.top=2.4; sc2.bottom=-2.4; sc2.near=.1; sc2.far=30; sunL.shadow.bias=-.0004; sunL.shadow.normalBias=.012; sunL.shadow.radius=3;
  const amb=new THREE.AmbientLight(0xffffff,.06); sc.add(amb);
  const glow=new THREE.PointLight(P.style==='classic'?0xff8a3a:0x8ab4ff,0,1.2,2); glow.position.set(P.wheel.c[0],P.wheel.c[1]+.12,P.wheel.c[2]-.25); G.add(glow);
  const parts={};
  const sh=P.style==='tractor'?tractorCab(G,P,parts):shell(G,P,parts);
  if(P.style==='classic') dashClassic(G,P,parts); else if(P.style==='ev') dashEV(G,P,parts); else if(P.style!=='tractor') dashModern(G,P,parts);
  parts.wheel=steeringWheel(G,P);
  wipers(G,P,sh.wsP,parts);
  // head-up display (owner 2026-11-20: "I can't see the gauges in cockpit view"; not in the Navigator — its panoramic dash screen
  // already shows it, owner's request — nor the Model Y, whose centre screen shows the speed, as in the real car): a projected image floating ~2.3 m ahead, just
  // above the hood in the driver's line of sight — speed, limit, gear, revs, next turn. ⚙️ Head-up display / H key.
  if(P.style!=='lux'&&P.style!=='ev'){ const T=canvasTex(768,320,true), mt=new THREE.MeshBasicMaterial({map:T.t,transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
    const hood=P.hood?Math.atan((P.eye[1]-P.hood.yf)/(P.eye[2]-P.hood.zf)):.33, ang=Math.max(.035,hood-.045);   // sits just above this car's hood line
    const g=new THREE.Group(); g.position.set(P.eye[0],P.eye[1]-Math.tan(ang)*2.3,P.eye[2]-2.3); G.add(g); g.lookAt(new V3(...P.eye));
    const m=mesh(new THREE.PlaneGeometry(.6,.25),mt,g,false,false); m.renderOrder=20; parts.hud={T,m:mt,g}; }
  G.position.set(-P.eye[0],-P.eye[1],-P.eye[2]);                   // built in car coordinates; the eye sits at the origin
  CK.cab={scene:sc,root,G,cam,hemi,sunL,amb,glow,P,parts,key,lastDraw:0,rpm:700,gear:0,trip:S.dist||0};
  CK.built=key+'|'+(CARSPEC.paint||0);
  applyShadows();
}
function dispose(){ const c=CK.cab; if(!c) return;
  c.scene.traverse(o=>{ if(o.geometry) o.geometry.dispose(); const ms=o.material?(Array.isArray(o.material)?o.material:[o.material]):[]; for(const m of ms){ for(const k of ['map','emissiveMap']) if(m[k]&&!Object.values(TX).includes(m[k])&&!(MIR.rt&&m[k]===MIR.rt.texture)) m[k].dispose(); m.dispose(); } });
  MATS.length=0; MIR.mats.length=0; MIR.frames.length=0; CK.cab=null; CK.built=null; }
function applyShadows(){ const c=CK.cab; if(!c) return; const want=(typeof QL==='number'?QL:1)>=1;
  if(want&&!renderer.shadowMap.enabled){ renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; for(const m of MATS) m.needsUpdate=true; }
  c.sunL.castShadow=want; c.sunL.shadow.mapSize.set(QL>=2?2048:1024,QL>=2?2048:1024); if(c.sunL.shadow.map){ c.sunL.shadow.map.dispose(); c.sunL.shadow.map=null; } }

/* ---------- instruments: data ---------- */
function engineState(c,dt){ const A=window.SOUND&&SOUND.state;
  if(window.IGN&&IGN.state==='off') return {rpm:0,gear:0};                   // engine switched off (js/enh/ignition.js)
  if(A&&A.ready&&A.key===c.P.eng&&mode==='car') return {rpm:A.rpm,gear:A.gear};
  const E=window.SOUND&&SOUND.ENG&&SOUND.ENG[c.P.eng]; const v=Math.abs(S.v||0), gas=Math.max(0,S.gas||0);
  if(!E||!E.gears) return {rpm:700+v*45,gear:0};
  const sh=v/E.tyre*60*E.axle, inG=g=>sh*E.gears[g], up=1500+4000*Math.pow(gas,2.5);
  if(c.gear<E.gears.length-1&&inG(c.gear)>up) c.gear++; else if(c.gear>0&&inG(c.gear)<Math.min(1100+1500*Math.pow(gas,2.5),up/1.7)) c.gear--;
  if(S.v<-.2) c.gear=0;
  const t=Math.min(E.redline||6000,Math.max(E.idle||700,inG(c.gear),(E.idle||700)+1500*gas*Math.max(0,1-inG(c.gear)/2200)));
  c.rpm+=(t-c.rpm)*Math.min(1,dt*5); return {rpm:c.rpm,gear:c.gear}; }
function gearLetter(){ if(S.sel) return S.sel;                    // the wheel's selector (shifter / paddles): D, R or N
  const g=S.gas||0; if(S.v<-.2||(g<-.05&&Math.abs(S.v)<.5)) return 'R'; if(Math.abs(S.v)<.05&&Math.abs(g)<.05&&(CK.cab&&CK.cab.still>3)) return 'P'; return 'D'; }
const txt=id=>{ const e=document.getElementById(id); return e?e.textContent.trim():''; };
const navOn=()=>!!(YD.NAV&&YD.NAV.dest&&txt('navDist'));
function hhmm(){ const d=new Date(); let h=d.getHours(); const m=d.getMinutes(); const ap=h>=12?'PM':'AM'; h=h%12||12; return h+':'+String(m).padStart(2,'0')+' '+ap; }
function tempF(){ const t=YD.AT&&YD.AT.temp; return t!=null?t+'°F':'--°F'; }
function limitTxt(){ const e=document.querySelector('#lim b'); const v=e?e.textContent.trim():''; return /\d/.test(v)?v:''; }
function street(){ const r=(typeof roadName==='string'&&roadName)||''; return r; }

/* ---------- instruments: drawing ---------- */
// a turn-signal arrow (dir -1 left, 1 right) centred at cx, cy, sz across, filled green with a soft glow
function sigArrow(x,cx,cy,sz,dir){ const h=sz*.5; x.save(); x.shadowColor='rgba(40,255,90,.9)'; x.shadowBlur=sz*.3; x.fillStyle='#2ee05a'; x.beginPath();
  x.moveTo(cx+dir*sz/2,cy); x.lineTo(cx,cy-h); x.lineTo(cx,cy-h*.45); x.lineTo(cx-dir*sz/2,cy-h*.45); x.lineTo(cx-dir*sz/2,cy+h*.45); x.lineTo(cx,cy+h*.45); x.lineTo(cx,cy+h); x.closePath(); x.fill(); x.restore(); }
function sigArrows(x,d,cx,cy,gap,sz){ if(d.bl) sigArrow(x,cx-gap,cy,sz,-1); if(d.br) sigArrow(x,cx+gap,cy,sz,1); }
function drawSport(cl,d){ const x=cl.T.x, W=cl.w, H=cl.h;
  // a digital cluster drawn as two round dials (rev counter left, speedometer right) with the trip computer between them
  x.fillStyle='#020306'; x.fillRect(0,0,W,H);
  const R=H*.43, cy=H*.5, L=H*.5+6, Rt=W-H*.5-6;
  const dial=(cx,val,max,step,minor,fmt,red,unitTop,unitBot)=>{
    const a0=135*DEG, a1=405*DEG, A=v=>a0+(a1-a0)*clamp(v/max,0,1);
    const bg=x.createRadialGradient(cx,cy,R*.2,cx,cy,R*1.05); bg.addColorStop(0,'#0a0f18'); bg.addColorStop(1,'#04060a'); x.fillStyle=bg; x.beginPath(); x.arc(cx,cy,R*1.04,0,7); x.fill();
    x.strokeStyle='#2a3240'; x.lineWidth=3; x.beginPath(); x.arc(cx,cy,R*1.03,0,7); x.stroke();
    if(red){ x.strokeStyle='#c4232e'; x.lineWidth=9; x.beginPath(); x.arc(cx,cy,R*.93,A(red),a1); x.stroke(); }
    for(let v=0;v<=max+1e-6;v+=minor){ const a=A(v), mj=Math.abs(v/step-Math.round(v/step))<1e-6, r1=R*.98, r2=R*(mj?.84:.91);
      x.strokeStyle=red&&v>=red?'#e04050':'#dfe6f0'; x.lineWidth=mj?4:2; x.beginPath(); x.moveTo(cx+Math.cos(a)*r1,cy+Math.sin(a)*r1); x.lineTo(cx+Math.cos(a)*r2,cy+Math.sin(a)*r2); x.stroke();
      if(mj){ x.fillStyle='#e8eef7'; x.font=`500 ${Math.round(R*.15)}px "Helvetica Neue",system-ui,Arial`; x.textAlign='center'; x.textBaseline='middle'; x.fillText(fmt(v),cx+Math.cos(a)*R*.68,cy+Math.sin(a)*R*.68); } }
    // needle with a soft blue sweep behind it
    const a=A(val); const sw=x.createLinearGradient(cx,cy,cx+Math.cos(a)*R,cy+Math.sin(a)*R); sw.addColorStop(0,'rgba(60,140,255,0)'); sw.addColorStop(1,'rgba(60,140,255,.35)');
    x.fillStyle=sw; x.beginPath(); x.moveTo(cx,cy); x.arc(cx,cy,R*.9,Math.max(a0,a-.5),a); x.closePath(); x.fill();
    x.strokeStyle='#f4f8ff'; x.lineWidth=5; x.lineCap='round'; x.beginPath(); x.moveTo(cx+Math.cos(a)*R*.25,cy+Math.sin(a)*R*.25); x.lineTo(cx+Math.cos(a)*R*.95,cy+Math.sin(a)*R*.95); x.stroke();
    x.fillStyle='#0b0f16'; x.beginPath(); x.arc(cx,cy,R*.22,0,7); x.fill(); x.strokeStyle='#3a4352'; x.lineWidth=2; x.stroke();
    x.fillStyle='#9fb0c8'; x.font=`500 ${Math.round(R*.09)}px system-ui,Arial`; x.textAlign='center'; x.fillText(unitTop,cx,cy+R*.42); x.fillText(unitBot,cx,cy+R*.54); };
  dial(L,d.rpm/1000,d.tach,1,.5,v=>String(v),d.red,'RPM','x1000');
  dial(Rt,d.mph,d.vmax,20,10,v=>String(v),0,'MPH','');
  // middle: digital speed, gear selector, trip, street / next turn
  const mx=W/2; x.textAlign='center'; x.textBaseline='middle';
  const mid=x.createLinearGradient(0,0,0,H); mid.addColorStop(0,'#06101f'); mid.addColorStop(1,'#020306'); x.fillStyle=mid; x.fillRect(L+R*1.08,H*.08,Rt-L-R*2.16,H*.84);
  x.fillStyle='#7fb2ff'; x.fillRect(L+R*1.12,H*.12,Rt-L-R*2.24,2);
  sigArrows(x,d,mx,H*.2,(Rt-L-R*2.24)/2-H*.07,H*.11);
  x.fillStyle='#ffffff'; x.font=`600 ${Math.round(H*.2)}px "Helvetica Neue",system-ui,Arial`; x.fillText(String(d.mph),mx,H*.34);
  x.fillStyle='#9fb0c8'; x.font=`500 ${Math.round(H*.06)}px system-ui`; x.fillText('MPH',mx,H*.46);
  if(d.nav){ x.fillStyle='#5aa0ff'; x.font=`700 ${Math.round(H*.11)}px system-ui`; x.fillText(d.navArrow||'↑',mx-H*.16,H*.62); x.fillStyle='#e8eef8'; x.font=`600 ${Math.round(H*.07)}px system-ui`; x.textAlign='left'; x.fillText(d.navDist,mx-H*.06,H*.62); x.textAlign='center'; }
  else { x.fillStyle='#c9d3e3'; x.font=`500 ${Math.round(H*.06)}px system-ui`; x.fillText(d.street.slice(0,22),mx,H*.62); }
  if(d.limit){ const bx=mx+H*.3; x.fillStyle='#fff'; x.fillRect(bx-H*.06,H*.52,H*.12,H*.16); x.fillStyle='#000'; x.font=`800 ${Math.round(H*.07)}px Arial`; x.fillText(d.limit,bx,H*.62); }
  x.fillStyle='#7f8aa0'; x.font=`500 ${Math.round(H*.05)}px system-ui`; x.fillText('TRIP '+d.trip+' mi  ·  '+d.temp,mx,H*.76);
  const G=['P','R','N','D','L']; G.forEach((g,i)=>{ x.fillStyle=g===d.gearL?'#ff5a3c':'#6c7588'; x.font=`${g===d.gearL?700:500} ${Math.round(H*.075)}px system-ui`; x.fillText(g,mx+(i-2)*H*.09,H*.88); });
  cl.T.t.needsUpdate=true; }
function drawHud(h,d){ const x=h.T.x, W=h.T.c.width, H=h.T.c.height; x.clearRect(0,0,W,H);
  const col='#a8ffd8', dim='rgba(168,255,216,.55)'; x.textAlign='center'; x.textBaseline='middle'; x.shadowColor='rgba(120,255,200,.6)'; x.shadowBlur=8;
  // speed in the middle, MPH under it
  x.fillStyle=col; x.font='600 132px "Helvetica Neue",system-ui,Arial'; x.fillText(String(d.mph),W/2,H*.40);
  x.fillStyle=dim; x.font='600 30px system-ui,Arial'; x.fillText('MPH',W/2,H*.73);
  // rev bar along the bottom (red-line ticks in red)
  const bw=W*.52, bx=W/2-bw/2, by=H*.88, f=clamp(d.rpm/(d.tach*1000),0,1), rl=d.red/d.tach;
  x.fillStyle='rgba(168,255,216,.18)'; x.fillRect(bx,by,bw,8); x.fillStyle=f>rl?'#ff7a6a':col; x.fillRect(bx,by,bw*f,8);
  x.fillStyle='#ff7a6a'; x.fillRect(bx+bw*rl,by-6,3,20);
  // gear on the left, speed limit on the right (red ring if you're over it)
  x.fillStyle=col; x.font='700 64px system-ui,Arial'; x.fillText(d.gearL,W*.14,H*.42); x.fillStyle=dim; x.font='600 22px system-ui'; x.fillText('GEAR',W*.14,H*.66);
  if(d.limit){ const lx=W*.86, ly=H*.42, over=d.mph>+d.limit+4; x.lineWidth=7; x.strokeStyle=over?'#ff6a5a':col; x.beginPath(); x.arc(lx,ly,52,0,7); x.stroke();
    x.fillStyle=over?'#ff8a7a':col; x.font='700 48px system-ui,Arial'; x.fillText(d.limit,lx,ly+2); }
  sigArrows(x,d,W/2,H*.40,W*.25,58);
  // next turn across the top while a route is set
  if(d.nav){ x.fillStyle=col; x.font='700 46px system-ui'; x.textAlign='right'; x.fillText(d.navArrow||'↑',W/2-12,H*.08+18); x.textAlign='left'; x.font='600 34px system-ui'; x.fillText(d.navDist,W/2+4,H*.08+20); }
  x.shadowBlur=0; h.T.t.needsUpdate=true; }
function drawPano(pn,d){ const x=pn.T.x, W=pn.w, H=pn.h; x.fillStyle='#03050a'; x.fillRect(0,0,W,H);
  const g=x.createLinearGradient(0,0,W,0); g.addColorStop(0,'#0b1220'); g.addColorStop(.45,'#05070c'); g.addColorStop(1,'#0b1018'); x.fillStyle=g; x.fillRect(0,0,W,H);
  const k=H/100, s=v=>Math.round(v*k);
  x.textBaseline='middle'; x.textAlign='center';
  // speed + gear in front of the driver (the wheel's position along the strip)
  const cx=W*((CK.cab.P.wheel.c[0]-CK.cab.P.pano.x0)/(CK.cab.P.pano.x1-CK.cab.P.pano.x0));
  x.fillStyle='#f4efe6'; x.font=`300 ${s(64)}px "Helvetica Neue",system-ui,Arial`; x.fillText(String(d.mph),cx,H*.48);
  x.fillStyle='#a99f8f'; x.font=`500 ${s(14)}px system-ui`; x.fillText('MPH',cx,H*.86);
  sigArrows(x,d,cx,H*.2,W*.045,s(26));
  // rpm bar left of the speed, gear right
  const bw=W*.10; x.fillStyle='#1c222c'; x.fillRect(cx-bw-W*.05,H*.45,bw,s(5)); x.fillStyle='#e9dcc6'; x.fillRect(cx-bw-W*.05,H*.45,bw*clamp(d.rpm/(d.tach*1000),0,1),s(5));
  x.font=`500 ${s(13)}px system-ui`; x.fillStyle='#a99f8f'; x.fillText('RPM',cx-bw/2-W*.05,H*.70);
  x.fillStyle='#f4efe6'; x.font=`500 ${s(40)}px system-ui`; x.fillText(d.gearL,cx+W*.08,H*.48);
  if(d.limit){ const lx=cx+W*.13; x.fillStyle='#f4efe6'; x.fillRect(lx-s(17),H*.12,s(34),s(46)); x.fillStyle='#000'; x.font=`700 ${s(8)}px Arial`; x.fillText('LIMIT',lx,H*.12+s(8)); x.font=`800 ${s(22)}px Arial`; x.fillText(d.limit,lx,H*.12+s(30)); }
  // middle: navigation or the street, time, outside temp
  const mx=W*.52; x.fillStyle='#e9dcc6';
  if(d.nav){ x.font=`600 ${s(40)}px system-ui`; x.fillText(d.navArrow||'↑',mx-W*.06,H*.5); x.textAlign='left'; x.font=`500 ${s(26)}px system-ui`; x.fillText(d.navDist,mx-W*.03,H*.36); x.fillStyle='#a99f8f'; x.font=`400 ${s(18)}px system-ui`; x.fillText(d.navStreet.slice(0,30),mx-W*.03,H*.68); x.textAlign='center'; }
  else { x.font=`400 ${s(24)}px system-ui`; x.fillText(d.street.slice(0,34),mx,H*.5); }
  x.fillStyle='#a99f8f'; x.font=`400 ${s(22)}px system-ui`; x.fillText(d.time,W*.80,H*.40); x.font=`400 ${s(18)}px system-ui`; x.fillText(d.temp+'  ·  '+d.wx,W*.80,H*.70);
  x.fillStyle='#e9dcc6'; x.font=`300 ${s(18)}px system-ui`; x.fillText('Trip '+d.trip+' mi',W*.93,H*.55);
  pn.T.t.needsUpdate=true; }
// moving map: nearby roads around the car, heading up, with the route, in the box R; th = colours
function drawMap(x,R,th){
  const cx=R.cx, cy=R.cy, sc0=R.s, X1=R.x+R.w, Y1=R.y+R.h;
  x.save(); x.beginPath(); x.rect(R.x,R.y,R.w,R.h); x.clip();
  x.fillStyle=th.land; x.fillRect(R.x,R.y,R.w,R.h);
  const h=(S.hdg||0)*DEG, ch=Math.cos(h), sh=Math.sin(h);
  const tr=(ex,ny)=>{ const f=ex*sh+ny*ch, r=ex*ch-ny*sh; return [cx+r*sc0,cy-f*sc0]; };
  const rg=typeof roadGeo==='object'&&roadGeo.segs;
  if(rg){ const kx=111320*Math.cos(roadGeo.lat*DEG), ox=(S.lng-roadGeo.lng)*kx, oy=(S.lat-roadGeo.lat)*111320;
    x.lineCap='round'; for(const pass of [0,1]) for(const s of rg){ const a=tr(s[0]-ox,s[1]-oy), b=tr(s[2]-ox,s[3]-oy);
      if((a[0]<R.x-50&&b[0]<R.x-50)||(a[0]>X1+50&&b[0]>X1+50)||(a[1]<R.y&&b[1]<R.y)||(a[1]>Y1+50&&b[1]>Y1+50)) continue;
      x.strokeStyle=pass?th.road:th.edge; x.lineWidth=Math.max(2,s[4]*sc0*2)+(pass?0:5); x.beginPath(); x.moveTo(a[0],a[1]); x.lineTo(b[0],b[1]); x.stroke(); } }
  const N=YD.NAV; if(N&&N.coords&&N.dest){ x.strokeStyle=th.route; x.lineWidth=9; x.beginPath(); let first=true; const kx=111320*Math.cos(S.lat*DEG);
    for(let i=Math.max(0,(N.idx||0));i<N.coords.length&&i<(N.idx||0)+400;i++){ const c=N.coords[i], p=tr((c[0]-S.lng)*kx,(c[1]-S.lat)*111320); if(first){ x.moveTo(p[0],p[1]); first=false; } else x.lineTo(p[0],p[1]); } x.stroke(); }
  // the car arrow
  x.fillStyle=th.arrow; x.strokeStyle=th.arrowEdge; x.lineWidth=4; x.beginPath(); x.moveTo(cx,cy-20); x.lineTo(cx+14,cy+14); x.lineTo(cx,cy+6); x.lineTo(cx-14,cy+14); x.closePath(); x.fill(); x.stroke();
  x.restore(); }
function drawScreen(sc,d,lux){ const x=sc.T.x, W=sc.w, H=sc.h; const bg=lux?'#0e0d0b':'#0c0f14'; x.fillStyle=bg; x.fillRect(0,0,W,H);
  drawMap(x,{x:0,y:56,w:W,h:H-56,cx:W*.5,cy:H*.66,s:(H*.55)/220},                       // ~220 m from the car to the top
    {land:lux?'#171512':'#121820',edge:lux?'#2a2722':'#212a36',road:lux?'#5b554b':'#4a5566',route:'#3d8bff',arrow:'#ffffff',arrowEdge:lux?'#c9b79c':'#3d8bff'});
  // status bar
  x.fillStyle=lux?'#1a1814':'#141a22'; x.fillRect(0,0,W,56); x.fillStyle=lux?'#e9dcc6':'#e8eef8'; x.font='500 26px system-ui,Arial'; x.textBaseline='middle';
  x.textAlign='left'; x.fillText(d.time,22,29); x.textAlign='right'; x.fillText(d.temp,W-22,29); x.textAlign='center'; x.font='600 24px system-ui'; x.fillText(d.compass,W/2,29);
  // bottom banner: next turn or street
  x.fillStyle='rgba(0,0,0,.6)'; x.fillRect(0,H-64,W,64); x.fillStyle='#fff'; x.textAlign='left'; x.font='600 28px system-ui';
  if(d.nav){ x.fillText((d.navArrow||'↑')+'  '+d.navDist+'  ·  '+d.navStreet.slice(0,30),22,H-32); x.textAlign='right'; x.font='400 22px system-ui'; x.fillText(d.eta,W-22,H-32); }
  else x.fillText(d.street||'—',22,H-32);
  if(d.limit){ x.fillStyle='#fff'; x.fillRect(W-82,72,62,72); x.fillStyle='#000'; x.textAlign='center'; x.font='700 13px Arial'; x.fillText('SPEED',W-51,86); x.fillText('LIMIT',W-51,100); x.font='800 30px Arial'; x.fillText(d.limit,W-51,124); }
  sc.T.t.needsUpdate=true; }
// Model Y centre screen (no cluster behind the wheel): on the left, the "car" panel — gear, speed, speed limit, battery,
// turn signals and the driving picture (your lane, other cars near you, blue lane lines while AUTO drives); on the right
// the map with the next turn; along the bottom the dock (car, climate, apps, volume). Light by day, dark after dusk.
function rr(x,X,Y,w,h,r){ x.beginPath(); x.moveTo(X+r,Y); x.arcTo(X+w,Y,X+w,Y+h,r); x.arcTo(X+w,Y+h,X,Y+h,r); x.arcTo(X,Y+h,X,Y,r); x.arcTo(X,Y,X+w,Y,r); x.closePath(); }
function drawEV(sc,d){ const x=sc.T.x, W=sc.w, H=sc.h, k=YD.AT?(YD.AT.k||0):0, dark=k>.45;
  const C=dark?{bg:'#111214',fg:'#f2f3f5',dim:'#7c8088',lane:'#5d626b',car:'#c9ccd2',other:'#6c717a',dock:'#0a0a0b',land:'#1d2026',edge:'#14161a',road:'#3b414b'}
              :{bg:'#f3f4f6',fg:'#16181b',dim:'#8c9097',lane:'#b9bdc4',car:'#ffffff',other:'#9ea3ab',dock:'#e6e7ea',land:'#e9e7e1',edge:'#d2cfc6',road:'#ffffff'};
  const LW=Math.round(W*.37), DH=58, MH=H-DH;
  // map (right)
  drawMap(x,{x:LW,y:0,w:W-LW,h:MH,cx:LW+(W-LW)*.5,cy:MH*.68,s:(MH*.6)/240},{land:C.land,edge:C.edge,road:C.road,route:'#3e6ae1',arrow:'#3e6ae1',arrowEdge:'#ffffff'});
  x.textBaseline='middle';
  x.fillStyle=dark?'rgba(17,18,20,.82)':'rgba(255,255,255,.88)'; rr(x,W-262,14,248,40,20); x.fill();
  x.fillStyle=C.fg; x.font='500 22px system-ui,Arial'; x.textAlign='center'; x.fillText(d.time+'   '+d.temp,W-138,35);
  if(d.nav){ x.fillStyle=dark?'#1d1f23':'#ffffff'; rr(x,LW+14,14,W-LW-300,96,14); x.fill();
    x.fillStyle='#3e6ae1'; x.font='700 52px system-ui'; x.textAlign='center'; x.fillText(d.navArrow||'↑',LW+58,62);
    x.textAlign='left'; x.fillStyle=C.fg; x.font='600 30px system-ui'; x.fillText(d.navDist,LW+100,46);
    x.fillStyle=C.dim; x.font='400 22px system-ui'; x.fillText(d.navStreet.slice(0,26),LW+100,84);
    if(d.eta){ x.fillStyle=dark?'#1d1f23':'#ffffff'; rr(x,LW+14,MH-56,W-LW-28,42,12); x.fill(); x.fillStyle=C.fg; x.font='500 22px system-ui'; x.fillText(d.eta,LW+30,MH-35); } }
  // car panel (left)
  x.fillStyle=C.bg; x.fillRect(0,0,LW,MH); x.fillStyle=dark?'#000':'#d9dbdf'; x.fillRect(LW-1,0,1,MH);
  x.textAlign='left'; x.font='600 26px system-ui,Arial';
  ['P','R','N','D'].forEach((g,i)=>{ x.fillStyle=g===d.gearL?C.fg:C.dim; x.font=(g===d.gearL?'700':'500')+' 26px system-ui,Arial'; x.fillText(g,24+i*30,34); });
  const bat=Math.max(5,Math.round(80-(+d.trip)*.32));               // Long Range: ~310 miles to a full battery
  x.textAlign='right'; x.fillStyle=C.fg; x.font='500 22px system-ui'; x.fillText(bat+'%',LW-24,34);
  x.strokeStyle=C.fg; x.lineWidth=2; rr(x,LW-122,24,40,20,4); x.stroke(); x.fillStyle=bat<20?'#e0443e':C.fg; x.fillRect(LW-119,27,34*bat/100,14); x.fillRect(LW-81,30,3,8);
  const cx=LW*.5; x.textAlign='center'; x.fillStyle=C.fg; x.font='600 104px "Helvetica Neue",system-ui,Arial'; x.fillText(String(d.mph),cx,120);
  x.fillStyle=C.dim; x.font='500 22px system-ui'; x.fillText('MPH',cx,180);
  if(d.limit){ const lx=cx+128, ly=120; x.fillStyle='#fff'; rr(x,lx-28,ly-38,56,76,8); x.fill(); x.strokeStyle='#111'; x.lineWidth=3; rr(x,lx-24,ly-34,48,68,6); x.stroke();
    x.fillStyle='#111'; x.font='700 11px Arial'; x.fillText('SPEED',lx,ly-21); x.fillText('LIMIT',lx,ly-9); x.font='800 30px Arial'; x.fillText(d.limit,lx,ly+16); }
  sigArrows(x,d,cx,120,130,48);                                      // turn signals (js/enh/signals.js)
  // the driving picture: your lane in perspective, nearby traffic, your car
  const vy=232, by=MH-18, ap=window.AUTO&&AUTO.on, P0=(r,f)=>{ const t=8/(Math.max(0,f)+8); return [cx+r*t*58,vy+(by-vy)*t]; };
  x.lineWidth=4; for(const lx of [-1.8,1.8]){ x.strokeStyle=ap?'#3e6ae1':C.lane; x.beginPath(); let a=P0(lx,-4); x.moveTo(a[0],a[1]); for(let f=0;f<=80;f+=4){ a=P0(lx,f); x.lineTo(a[0],a[1]); } x.stroke(); }
  x.strokeStyle=C.lane; x.lineWidth=2; x.setLineDash([10,12]); for(const lx of [-5.4,5.4]){ x.beginPath(); let a=P0(lx,-4); x.moveTo(a[0],a[1]); for(let f=0;f<=80;f+=4){ a=P0(lx,f); x.lineTo(a[0],a[1]); } x.stroke(); } x.setLineDash([]);
  const T=window.TRAFFIC&&TRAFFIC.state, MX=typeof MLNG==='number'?MLNG:111320*Math.cos(S.lat*DEG), MY=typeof MLAT==='number'?MLAT:111320;
  if(T&&T.on&&T.agents){ const h=(S.hdg||0)*DEG, px=S.lng*MX, py=S.lat*MY, L=[];
    for(const a of T.agents){ if(!a.path||!(a.fade>.3)) continue; const dx=a.px-px, dy=a.py-py, f=dx*Math.sin(h)+dy*Math.cos(h), r=dx*Math.cos(h)-dy*Math.sin(h);
      if(f>-3&&f<70&&Math.abs(r)<9) L.push([f,r]); }
    L.sort((a,b)=>b[0]-a[0]); for(const [f,r] of L){ const p=P0(r,f), sz=8/(Math.max(0,f)+8); x.fillStyle=C.other; rr(x,p[0]-46*sz,p[1]-62*sz,92*sz,70*sz,16*sz); x.fill(); } }
  { const w=96, h=70, X=cx-w/2, Y=by-h-6; x.fillStyle=dark?'rgba(0,0,0,.5)':'rgba(0,0,0,.12)'; x.beginPath(); x.ellipse(cx,Y+h+4,w*.6,10,0,0,7); x.fill();
    x.fillStyle=C.car; x.strokeStyle=dark?'#9aa0a8':'#c4c8ce'; x.lineWidth=2; rr(x,X,Y+8,w,h-8,22); x.fill(); x.stroke();
    x.fillStyle=dark?'#2b2e33':'#3a3f46'; rr(x,X+12,Y,w-24,34,14); x.fill();                                         // glass roof
    x.fillStyle='#c8202a'; rr(x,X+4,Y+40,24,8,4); x.fill(); rr(x,X+w-28,Y+40,24,8,4); x.fill(); }                       // tail lights
  if(ap){ x.fillStyle='#3e6ae1'; x.font='600 18px system-ui'; x.fillText('Autosteer',cx,212); }
  // dock
  x.fillStyle=C.dock; x.fillRect(0,MH,W,DH); x.fillStyle=C.fg; x.textAlign='center'; x.font='500 24px system-ui,Arial';
  x.fillText('🚗',46,MH+DH/2); x.fillText('‹  68°  ›',210,MH+DH/2); x.fillText('📞    🎵    •••',W*.52,MH+DH/2); x.fillText('‹  68°  ›',W-230,MH+DH/2); x.fillText('🔊',W-48,MH+DH/2);
  sc.T.t.needsUpdate=true; }
const ARROWS={'↑':'↑','↗':'↗','→':'→','↘':'↘','↓':'↓','↙':'↙','←':'←','↖':'↖'};
function gather(c,dt){ const e=engineState(c,dt), sp=c.P, mph=Math.round(Math.abs(S.v||0)*2.237), hd=((S.hdg%360)+360)%360;
  return {mph, rpm:e.rpm, gear:e.gear, gearL:gearLetter(), tach:sp.tachMax, red:sp.red, vmax:sp.vmaxG, street:street(), limit:limitTxt(), time:hhmm(), temp:tempF(),
    wx:(YD.AT&&YD.AT.wx&&YD.AT.wx.text)||'', trip:(Math.max(0,(S.dist||0)-c.trip)/1609.34).toFixed(1),
    nav:navOn(), navArrow:txt('navArrow'), navDist:txt('navDist'), navStreet:txt('navStreet'), eta:txt('navEta'),
    compass:['N','NE','E','SE','S','SW','W','NW'][Math.round(hd/45)%8]+' · '+Math.round(hd)+'°',
    bl:!!(window.SIG&&SIG.left), br:!!(window.SIG&&SIG.right)}; }   // turn signal arrows lit now (js/enh/signals.js)

/* ---------- per frame ---------- */
let lastHash='';
// sunroof motors: glass tilts in ~2 s, the cover slides in ~3 s
// VENT and △ (the arrow pointing back, beside it) both open the sunroof all the way (owner 2026-11-21; the cover goes back
// with it, as in the real car) and pressed again close it; the cover keys open / close the cover.
const ROOF={vent:false,slide:false,cover:false};
CK.roof=function(k){ let t;
  if(k==='vent'||k==='close'){ if(ROOF.slide||ROOF.vent){ ROOF.slide=ROOF.vent=false; t='Sunroof: closing'; } else { ROOF.slide=true; ROOF.cover=true; t='Sunroof: opening'; } }
  else if(k==='open'){ ROOF.cover=true; t='Sunroof cover: open'; }
  else if(k==='shut'){ ROOF.cover=false; t='Sunroof cover: closed'; }   // the cover keys only ever move the cover (owner 2026-11-21)
  toast(t,1300); };
// blind-spot lamps: amber in that mirror when a traffic car is in the next lane beside or just behind you
function blisStep(c,dt){ const B=c.parts.blis; if(!B) return; const T=window.TRAFFIC&&TRAFFIC.state, on={'-1':0,'1':0};
  if(T&&T.on&&T.agents){ const px=S.lng*MLNG, py=S.lat*MLAT, h=S.hdg*DEG, sh=Math.sin(h), ch=Math.cos(h);
    for(const a of T.agents){ if(!a.path||a.occ===undefined&&!a.mesh) continue; const dx=a.px-px, dy=a.py-py, f=dx*sh+dy*ch, r=dx*ch-dy*sh;
      if(f>-9&&f<1.5&&Math.abs(r)>1.6&&Math.abs(r)<5.5&&Math.cos(a.hd-h)>.5) on[r>0?'1':'-1']=1; } }
  for(const k of ['-1','1']){ const m=B[k]; if(!m) continue; const lit=on[k]; m.color.setHex(lit?0xffa21a:0x9a9ea4); m.opacity=lit?1:.55; } }
function roofStep(c,dt){ for(const s of CK.roofSpots||[]) if(s.flash.material.opacity>0) s.flash.material.opacity=Math.max(0,s.flash.material.opacity-dt*2.5);
  const r=c.parts.sunroof; if(!r) return; r.slide=r.slide||0;
  const wantV=ROOF.vent||(ROOF.slide&&r.slide<.98)?1:0;                    // to slide, the back edge first lifts a little, then the glass runs back over the roof
  const lift=ROOF.slide?.35:wantV;
  r.vent+=clamp(lift-r.vent,-dt/2,dt/2);
  const canSlide=!ROOF.slide||r.vent>.3; r.slide+=clamp((ROOF.slide&&canSlide?1:0)-r.slide,-dt/4,dt/4);
  if(!ROOF.slide&&r.slide>0) r.vent=Math.max(r.vent,.35*Math.min(1,r.slide*4));   // closing: stays lifted until it's back over the opening
  r.cover+=clamp((ROOF.cover?1:0)-r.cover,-dt/3,dt/3);
  const e=t=>t*t*(3-2*t); r.hinge.rotation.x=-.06*e(r.vent); r.hinge.position.z=r.z0+(r.len+.02)*e(r.slide); r.cov.position.z=(r.len+.04)*e(r.cover); }
function update(dt){
  const c=CK.cab, P=c.P, p=c.parts;
  roofStep(c,dt); blisStep(c,dt);
  c.still=Math.abs(S.v||0)<.05&&Math.abs(S.gas||0)<.05?(c.still||0)+dt:0;
  // steering wheel: the input, 900° lock-to-lock (a G29 turns the same as your hands); otherwise from the road wheels
  const st=S.stIn!=null?S.stIn:(S.steer||0)/Math.max(.1,steerLock(S.v||0));
  c.wAng=(c.wAng||0)+(st*450*DEG-(c.wAng||0))*Math.min(1,dt*30);
  p.wheel.rotation.z=-c.wAng;
  if(p.tyres) for(const t of p.tyres){ t.sp.rotation.x=-(S.dist||0)/t.r; t.pv.rotation.y=t.front?-(S.steer||0):0; }
  // lighting from the world: sky light, the real sun through the glass, gauges glowing after dark
  const k=YD.AT?(YD.AT.k||0):0, mainHemi=scene.children.find(o=>o&&o.isHemisphereLight), hi=mainHemi?mainHemi.intensity:.85;
  c.hemi.intensity=hi*1.05*(1-.7*k)*(P.glassRoof?1.22:1); c.hemi.color.copy(mainHemi?mainHemi.color:new THREE.Color(0xdfeeff)); c.amb.intensity=.035+.02*(1-k);
  const sp=YD.AT&&YD.AT.sun; if(sp){ const rb=(sp.az-S.hdg)*DEG, al=Math.max(sp.alt,-2)*DEG;
    c.sunL.position.set(Math.sin(rb)*Math.cos(al)*10,Math.sin(al)*10,-Math.cos(rb)*Math.cos(al)*10).add(new V3(...P.eye).negate().multiplyScalar(0));
    c.sunL.target.position.set(0,0,0); c.sunL.intensity=sp.alt>0?sun.intensity*(c.sunL.castShadow?1.35:.45):0; c.sunL.color.copy(sun.color); }
  else c.sunL.intensity=sun.intensity*.5;
  c.glow.intensity=k*.35;
  if(p.gauges) for(const g of p.gauges){ g.face.material.emissiveIntensity=.22+k*.7; g.nm.emissiveIntensity=.25+k*.9; }
  if(p.radio) p.radio.emissiveIntensity=k*.8;
  if(p.sig) for(const a of p.sig){ const lit=a.dir<0?(window.SIG&&SIG.left):(window.SIG&&SIG.right); a.m.color.setHex(lit?0x40ff66:0x0c1a0e); }
  const dim=1-.25*k; for(const s of [p.cluster,p.screen,p.pano]) if(s) s.m.color.setScalar(.92*dim+.08);
  if(p.btns) p.btns.color.setScalar(.75+.25*(1-k));
  for(const m of MIR.mats) m.color.setScalar(.85-.2*k); for(const m of MIR.frames) m.color.setScalar(Math.max(.25,hi/.85));
  // body roll/pitch and bumps move the cabin around your head (your eyes stay level with the horizon)
  c.root.rotation.set(-((S.pitch||0)+(S.bx||0))*.55,0,-((S.roll||0)*.7+(S.bz||0)*.55)*1);
  c.root.position.y=-(S.by||0)*.5;
  // instruments: analog needles every frame, screens ~15 times a second
  const d=gather(c,dt);
  if(p.gauges){ const [sg,tg,cg]=p.gauges, sa=clamp(d.mph/140,0,1)*270-135, ta=clamp(d.rpm/8000,0,1)*270-135;
    sg.needle.rotation.z=-(sa*DEG); tg.needle.rotation.z=-(ta*DEG);
    const now=new Date(), hh=(now.getHours()%12)+now.getMinutes()/60; cg.needle.rotation.z=-(hh/12*360)*DEG; if(cg.needle.userData.min) cg.needle.userData.min.rotation.z=-(now.getMinutes()/60*360)*DEG;
  }
  const now=performance.now();
  if(p.hud){ p.hud.g.visible=CK.hud; if(CK.hud) p.hud.m.opacity=1-.45*k; }
  const ik=[d.mph,Math.round(d.rpm/60),d.gear,d.gearL,d.street,d.limit,d.time,d.temp,d.wx,d.trip,d.nav,d.navArrow,d.navDist,d.navStreet,d.eta,d.compass,CK.hud,d.bl,d.br].join('|');
  if(now-c.lastDraw>66){ c.lastDraw=now; if(ik!==c.ik){ c.ik=ik; if(p.hud&&CK.hud) drawHud(p.hud,d);   // only when a number on them changed (each redraw is a texture upload)
    if(p.cluster) drawSport(p.cluster,d); if(p.pano) drawPano(p.pano,d); } if(p.screen&&now-(c.lastMap||0)>130){ c.lastMap=now; if(P.style==='ev') drawEV(p.screen,d); else drawScreen(p.screen,d,P.style==='lux'); }
    if(p.prnd&&p.prnd.cur!==d.gearL){ const pr=p.prnd, x=pr.T.x, L=pr.classic?['P','R','N','D','2','1']:['P','R','N','D','S'], W=pr.T.c.width, step=pr.classic?42:pr.lux?102:50, o=pr.classic?22:pr.lux?52:28;
      x.fillStyle=pr.lux?'#16130f':pr.classic?'#0c0c0c':'#0a0a0b'; x.fillRect(0,0,W,64); x.font=pr.lux?'600 30px system-ui':pr.classic?'700 30px Arial':'700 34px system-ui'; x.textAlign='center'; x.textBaseline='middle';
      L.forEach((t,i)=>{ x.fillStyle=t===d.gearL?(pr.classic?'#ff7a2a':'#ffffff'):(pr.lux?'#a09c94':'#70757c'); x.fillText(t,o+i*step,32); }); pr.T.t.needsUpdate=true; pr.cur=d.gearL; } }
  updateRain(p.rain,dt,P);
  if(p.refl){ const sunOn=c.sunL.intensity>0?Math.min(1,c.sunL.intensity):0; p.refl.veil.opacity=(.05+.12*sunOn)*(1-k); p.refl.glow.opacity=.32*k; }
  updateGlare(c);
  if(window.SOUND&&SOUND.state&&SOUND.state.bus&&CK.snd!==mode){ CK.snd=mode; SOUND.cabin(true,mode==='tractor'); }   // sound may start after you got in
  if(now-(c.envT||0)>3000){ c.envT=now; updateEnv(false); }
}

/* ---------- sun glare: looking toward a low sun through the glass dazzles (a warm bloom where the sun is and a veil over
   everything); the roof, pillars and visors block it (a ray from the eye toward the sun through the cabin) ---------- */
const glareEl=document.createElement('div'); glareEl.id='ckGlare';
glareEl.style.cssText='position:absolute;inset:0;z-index:6;pointer-events:none;opacity:0;transition:opacity .25s;mix-blend-mode:screen';
document.body.appendChild(glareEl);
const RC=new THREE.Raycaster();
function updateGlare(c){ const sp=YD.AT&&YD.AT.sun; let a=0;
  if(CK.on&&sp&&sp.alt>-1&&c.sunL.intensity>0){ const dir=c.sunL.position.clone().normalize();          // toward the sun, car frame
    const cam=c.cam, q=dir, fwd=new V3(0,0,-1).applyEuler(cam.rotation);
    const cos=q.dot(fwd);
    if(cos>.55){ const now=performance.now();
      if(!c.glT||now-c.glT>200){ c.glT=now; RC.set(cam.getWorldPosition(new V3()),dir); RC.far=4;
        const hits=RC.intersectObjects(c.G.children,true).filter(h=>h.object.material&&!h.object.material.transparent&&h.object.visible); c.glBlock=hits.length>0; }
      if(!c.glBlock){ const p=cam.getWorldPosition(new V3()).add(dir.clone().multiplyScalar(10)).project(cam);
        const low=1-Math.min(1,Math.max(0,(sp.alt-5)/40)), cl=1-.85*((YD.AT&&YD.AT.cloud)||0);
        a=Math.pow((cos-.55)/.45,1.6)*(.35+.65*low)*cl*(1-(YD.AT.k||0));
        const x=(p.x*.5+.5)*100, y=(-p.y*.5+.5)*100;
        const gk=x.toFixed(0)+','+y.toFixed(0); if(c.gk!==gk){ c.gk=gk; glareEl.style.background=`radial-gradient(circle at ${x.toFixed(1)}% ${y.toFixed(1)}%,rgba(255,250,235,.95) 0,rgba(255,236,200,.55) 6%,rgba(255,220,170,.18) 22%,rgba(255,220,170,.06) 45%,rgba(0,0,0,0) 70%)`; } } } }
  const o=Math.min(.9,a).toFixed(2); if(glareEl.style.opacity!==o) glareEl.style.opacity=o; }

/* ---------- building footprints near the car (game.js asks when the car's nose is off screen) ---------- */
const BI={cells:new Map(),at:null,t:0,cell:25};
function buildIndex(){ BI.t=performance.now(); BI.at=[S.lng,S.lat]; BI.cells=new Map();
  let fs=[]; try{ fs=map.querySourceFeatures(bSrc,{sourceLayer:'building'}); }catch(e){ return; }
  const kx=111320*Math.cos(S.lat*DEG), R=420;
  for(const f of fs){ const g=f.geometry; if(!g) continue; const parts=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
    let a=1e9,b=1e9,c=-1e9,d=-1e9; for(const pl of parts) for(const p of pl[0]||[]){ if(p[0]<a)a=p[0]; if(p[0]>c)c=p[0]; if(p[1]<b)b=p[1]; if(p[1]>d)d=p[1]; }
    if(a>c) continue; const x0=(a-S.lng)*kx, x1=(c-S.lng)*kx, y0=(b-S.lat)*111320, y1=(d-S.lat)*111320;
    if(x1<-R||x0>R||y1<-R||y0>R) continue;
    const ff={geometry:g,id:f.id,properties:f.properties};
    for(let i=Math.floor(x0/BI.cell);i<=Math.floor(x1/BI.cell);i++) for(let j=Math.floor(y0/BI.cell);j<=Math.floor(y1/BI.cell);j++){ const k=i+','+j; let L=BI.cells.get(k); if(!L) BI.cells.set(k,L=[]); L.push(ff); } }
  BI.kx=kx; BI.o=[S.lng,S.lat]; }
// where this car's headlights are, for the cockpit beams (atmos.js makeCkBeams): lamp centres off the centre line and the
// front of the car (m), and the colour of the light (LED white on the Fords, warm halogen on the Javelin and the tractor)
const LAMPS={explorer:{lamp:.70,front:2.42,col:[236,244,255]},navigator:{lamp:.75,front:2.64,col:[236,244,255]},
  javelin:{lamp:.60,front:2.36,col:[255,238,205]},modely:{lamp:.66,front:2.30,col:[240,246,255]},tractor:{lamp:.34,front:1.86,col:[255,236,200]}};
CK.lamps=function(){ const k=mode==='tractor'?'tractor':specKey(CARKEY), L=LAMPS[k]||LAMPS.explorer; return {...L,key:k}; };
CK.blocksAt=function(lng,lat){
  const now=performance.now(), moved=BI.at?meters(BI.at[1],BI.at[0],S.lat,S.lng):1e9;
  if(moved>150||now-BI.t>(BI.cells.size?10000:800)) buildIndex();
  if(!BI.o) return [];
  const i=Math.floor((lng-BI.o[0])*BI.kx/BI.cell), j=Math.floor((lat-BI.o[1])*111320/BI.cell);
  return BI.cells.get(i+','+j)||[]; };

/* ---------- view distance (owner 2026-11-20: "in cockpit view… processing too much data… pull significantly fewer map
   tiles while enriching the closer detail"). At 85° the map's view reaches the horizon, so MapLibre fetches, parses and
   draws tiles tens of km out that are a sliver of the screen. While in the cockpit, tiles farther than VIEW() metres from
   the eye are dropped from every source's tile list (map.transform.coveringTiles, wrapped once); from eye height
   the horizon would be within a pixel of where they stop anyway. Near the car: trees and windows get denser instead. ---------- */
const VIEW=()=>Q3(1500,2500,3500);
function wrapTiles(){ const t=map.transform; if(!t||t.__ckWrapped) return; t.__ckWrapped=true; const orig=t.coveringTiles;
  // MapLibre's far plane stops at 85% of the way to the horizon on screen. From 1.4 m up at 85° that is the ground only
  // ~100 m ahead (everything beyond was clipped: "the horizon always seems right in front of you"). In the cockpit the cut
  // sits where the ground is VIEW() metres away instead; the tile limit above keeps what that loads in check.
  const oh=t.getHorizon;
  t.getHorizon=function(){ if(!CK.on) return oh.call(this);
    const a=Math.PI/2-this._pitch, cut=Math.atan((CK.eyeH||1.4)/VIEW()); return Math.tan(Math.max(a*.5,a-cut))*this.cameraToCenterDistance; };
  // That alone wasn't enough (owner 2026-11-21: "other cars drive off into the horizon (into the sky)"): MapLibre's far-plane
  // maths clamps the ground angle at 0.01 rad (≈0.6°), i.e. ~140 m ahead from 1.4 m up, and the cockpit's bottom padding cuts
  // it to ~50 m. Its far plane scales with the camera-to-lowest-ground distance, so while in the cockpit the "lowest ground"
  // (the terrain hook _minEleveationForCurrentTile) is lowered for the length of _calcMatrices until the far plane lies just
  // beyond ground VIEW() metres down the road. Nothing else reads that value; it is restored straight after.
  const oc=t._calcMatrices;
  if(typeof oc==='function'&&'_minEleveationForCurrentTile' in t) t._calcMatrices=function(){
    if(!CK.on||!this._pixelPerMeter||!this.height) return oc.call(this);
    const keep=this._minEleveationForCurrentTile;
    try{ const p=this._pitch, a=Math.PI/2-p, ppm=this._pixelPerMeter, cp=Math.max(.02,Math.cos(p)), H=this.height,
        oy=-(this._edgeInsets?(this._edgeInsets.bottom-this._edgeInsets.top)/2:0), C=this.cameraToCenterDistance,
        L=C+(this._elevation||0)*ppm/cp, h=Math.max(1,this.getHorizon()), cl=x=>Math.min(Math.PI-.01,Math.max(.01,x)),
        ft=this._fov*(.5+oy/H), fh=2*Math.atan(h/C)*(.5+oy/(2*h)),
        top=Math.min(Math.sin(ft)/Math.sin(cl(a-ft)),Math.sin(fh)/Math.sin(cl(a-fh))),
        need=(VIEW()*Math.cos(a)+(CK.eyeH||1.4)*Math.sin(a))*ppm*1.03, Lw=need/((Math.cos(a)*top+1)*1.01);
      if(isFinite(Lw)&&Lw>L) this._minEleveationForCurrentTile=Math.min(keep||0,(L-Lw)*cp/ppm);
    }catch(e){}
    try{ return oc.call(this); } finally{ this._minEleveationForCurrentTile=keep; } };
  t.coveringTiles=function(o){ const r=orig.call(this,o); if(!CK.on||!r||!r.length) return r;
    const lat=S.lat*DEG, e=CK.eyeLL||[S.lng,S.lat], mx=(e[0]+180)/360, my=(1-Math.log(Math.tan(e[1]*DEG)+1/Math.cos(e[1]*DEG))/Math.PI)/2;
    const M=40075016.7*Math.cos(lat), lim=VIEW()/M, out=[];
    for(const id of r){ const c=id.canonical, n=Math.pow(2,c.z), x0=c.x/n, x1=(c.x+1)/n, y0=c.y/n, y1=(c.y+1)/n;
      const dx=Math.max(x0-mx,0,mx-x1), dy=Math.max(y0-my,0,my-y1); if(Math.hypot(dx,dy)<=lim) out.push(id); }
    CK.tiles=[r.length,out.length]; return out.length?out:r.slice(0,1); }; }
// No haze band: seen from ~1.4 m up, ground 2.5 km away is within a pixel of the horizon, so where the tiles stop doesn't
// show; a flat screen band would also have striped every nearby building at eye height.

/* ---------- camera ---------- */
function enter(){ if(CK.on) return; CK.on=true; CK.exag=EXAG; EXAG=1; LOOK.yaw=0; LOOK.pitch=0; CK.look=0; wrapTiles(); refreshNear(); labels(false);
  // 3D terrain off while inside (owner's ?fps=1 on Medium 2026-11-21: map 700 ms, game 1375 ms a frame — with terrain on, every
  // map lookup reads depth back from the GPU, and from the seat the view runs far down the road); back on leaving
  applyTerrain();                                                  // per ⚙️ 3D terrain (game.js terrWant)
  document.body.classList.add('cockpit'); build(CARKEY); dirty=true; if(CK.real) setSpeedScale(1); try{ SOUND.cabin(true,mode==='tractor'); }catch(e){} }
function leave(){ if(!CK.on) return; CK.on=false; if(CK.drop){ CK.drop=0; map.getCanvas().style.transform=''; } EXAG=CK.exag; renderer.shadowMap.autoUpdate=true; labels(true);
  applyTerrain(); setSpeedScale(3); glareEl.style.opacity='0'; CK.snd=null; try{ SOUND.cabin(false); }catch(e){} refreshNear(); try{ map.triggerRepaint(); }catch(e){}
  document.body.classList.remove('cockpit');
  try{ map.transform.fov=36.87; }catch(e){}
  camera.fov=36.87; camera.near=10; camera.far=50000; camera.updateProjectionMatrix();
  if(typeof shadow==='object') shadow.visible=mode!=='boat'&&mode!=='glider';
  if(typeof tractorG==='object'){ const vis=mode==='walk'?(window.WALK&&WALK.parked())||'car':mode; tractorG.visible=vis==='tractor'; }
  LOOK.yaw=0; LOOK.pitch=0; step.W=0; step.cam=null; step.pit=null; dirty=true; }
/* map labels in the cockpit (owner's ?fps=1 2026-11-20: game 15 ms, map ~80 ms a frame on Low, the US 34 shields repeated all
   down the road): from the driver's seat, looking far down the road, the map places and collision-sorts hundreds of
   labels every frame. The driver reads street signs instead, so every map symbol layer (names, shields, POIs, house
   numbers) is hidden while in the cockpit — our own stop-sign / signal icons (sg-*) stay — and restored on leaving. */
const LBL={hidden:[]};
function labels(show){ try{
  if(!show){ LBL.hidden=[]; for(const l of map.getStyle().layers){ if(l.type!=='symbol'||/^sg-/.test(l.id)) continue;
      if((map.getLayoutProperty(l.id,'visibility')||'visible')==='visible'){ map.setLayoutProperty(l.id,'visibility','none'); LBL.hidden.push(l.id); } } }
  else { for(const id of LBL.hidden) if(map.getLayer(id)) map.setLayoutProperty(id,'visibility','visible'); LBL.hidden=[]; }
}catch(e){ console.warn('cockpit labels',e); } }
/* test switch to find what else is heavy: add ?hide=buildings,roofs,trees,roadside,roads,water,landuse,signs,traffic to the
   address — those layer groups are hidden (in every view) so ?fps=1 can show what each one costs */
{ const q=(new URLSearchParams(location.search).get('hide')||'').split(',').filter(Boolean);
  const G={buildings:/^(building|rebuilt|roof-cap|rebuilt-roof)/,roofs:/^roof-3d$/,trees:/^tree-/,roadside:/^rs-/,roads:/^(road|bridge|tunnel)_|^tx-asph|^mk-/,
    water:/^water|^waterway|^tx-water/,landuse:/^(landuse|landcover|park|lu-|lc-|tx-)/,signs:/^sg-/};
  if(q.length) onReadyHide(()=>{ for(const l of map.getStyle().layers) for(const g of q) if(G[g]&&G[g].test(l.id)) try{ map.setLayoutProperty(l.id,'visibility','none'); }catch(e){}
    if(q.includes('traffic')&&window.TRAFFIC&&TRAFFIC.state) TRAFFIC.state.on=false; /* this visit only, not saved */ toast('Hidden for testing: '+q.join(', '),4000); }); }
function onReadyHide(fn){ if(YD&&YD.onReady) YD.onReady(()=>setTimeout(fn,1500)); }
function refreshNear(){ try{ decorAt=null; }catch(e){} try{ if(window.ROOFS) ROOFS.state.pending=true; }catch(e){} }   // rebuild trees / windows at the new density
CK.active=function(){ const a=CK.want&&(mode==='car'||mode==='tractor')&&!boat; if(a&&!CK.on) enter(); else if(!a&&CK.on) leave(); return a; };
CK.view=function(dt){
  const c=CK.cab; if(!c||CK.built!==CARKEY+'|'+(CARSPEC.paint||0)) build(CARKEY);
  const P=CK.cab.P, W=innerWidth, H=innerHeight;
  if(W!==CK.W||H!==CK.H){ CK.W=W; CK.H=H; renderer.setSize(W,H,false); }
  // glance left / right with Q / E (held), on top of a drag on the screen
  const kl=(K.q?-1:0)+(K.e?1:0); CK.look+=(kl*80-CK.look)*Math.min(1,dt*7);
  const yaw=clamp(LOOK.yaw,-140,140)+CK.look, yr=yaw*DEG;
  S.camB=((S.hdg+yaw)%360+360)%360;
  const want=P.pitch+LOOK.pitch*.6, pitch=clamp(want,50,85), fov=CK.fov;   // default a little below level (more road, less sky); drag up to raise it
  // the map can't tilt past 85°, so looking higher than that (owner 2026-11-21: "move my screen so I can look higher")
  // slides the whole picture down instead, like raising your eyes: map, cars and cabin all shift together
  const lift=Math.round(.5*H/Math.tan(fov*DEG/2)*Math.tan(clamp(want-85,0,14)*DEG));
  // further still (up at the roof and the overhead console): the cabin and car cameras really tilt up, and the map
  // picture (its own canvas, under ours) slides down to match; past the windshield's top edge only the sky shows anyway
  const tilt=clamp(want-99,0,72), drop=Math.round(.5*H/Math.tan(fov*DEG/2)*Math.tan(tilt*DEG));
  if(drop!==(CK.drop||0)){ CK.drop=drop; map.getCanvas().style.transform=drop?'translateY('+drop+'px)':''; }   // only the picture moves: the map panel still covers the screen and gets your taps (moving the whole panel left the top of the screen dead, so the overhead keys never got a real tap)
  try{ if(Math.abs(map.transform.fov-fov)>.01) map.transform.fov=fov; }catch(e){}
  // the eye turns about the neck (10 cm behind the eyes); bumps lift the head a little
  // your head moves with the car: sways out in corners, pitches forward braking / back accelerating (a damped spring)
  const v=S.v||0, lon=dt>0?(v-(CK.pv==null?v:CK.pv))/dt:0, lat=v*v*Math.tan(S.steer||0)/WB; CK.pv=v;
  const H0=CK.head||(CK.head={x:0,z:0,vx:0,vz:0});
  const tx=clamp(-lat/9.8,-1,1)*.045, tz=clamp(-lon/9.8,-1.2,1.2)*.05;
  H0.vx+=((tx-H0.x)*60-H0.vx*11)*dt; H0.vz+=((tz-H0.z)*60-H0.vz*11)*dt; H0.x+=H0.vx*dt; H0.z+=H0.vz*dt;
  const ex=P.eye[0]+.1*Math.sin(yr)+H0.x, ez=P.eye[2]+.1*(1-Math.cos(yr))-H0.z, eh=P.eye[1]+(S.by||0)*.5-Math.abs(H0.z)*.15;
  const Dpx=.5*H/Math.tan(fov*DEG/2), pr=pitch*DEG, m=eh/(Dpx*Math.cos(pr)), z=Math.min(24,Math.log2(78271.517*Math.cos(S.lat*DEG)/m));
  const mm=78271.517*Math.cos(S.lat*DEG)/Math.pow(2,z);              // the zoom may have been capped: use what the map will draw
  S.zoom=z;
  const h=S.hdg*DEG, b=S.camB*DEG;
  const eE=ex*Math.cos(h)+(-ez)*Math.sin(h), eN=-ex*Math.sin(h)+(-ez)*Math.cos(h);   // eye over the ground, from the car's centre (m)
  const camH=Dpx*mm*Math.cos(pr), F=Dpx*mm*Math.sin(pr);
  const cE=eE+F*Math.sin(b), cN=eN+F*Math.cos(b);
  const pad=Math.round(H*CK.pad), padT=2*lift, offY=(pad-padT)/2;
  map.jumpTo({center:[S.lng+cE/(111320*Math.cos(S.lat*DEG)),S.lat+cN/111320],bearing:S.camB,zoom:z,pitch,padding:{top:padT,bottom:pad,left:0,right:0}});
  CK.eyeH=eh; CK.eyeWorld={x:S.lng*MLNG+eE,y:S.lat*MLAT+eN,h:camH}; CK.eyeLL=[S.lng+eE/(111320*Math.cos(S.lat*DEG)),S.lat+eN/111320];
  CK.eyeLocal={f:eE*Math.sin(b)+eN*Math.cos(b),r:eE*Math.cos(b)-eN*Math.sin(b),h:camH,mm};
  // the car layer's camera: same place and direction, in pixels at this zoom (car centre = origin)
  const f=eE*Math.sin(b)+eN*Math.cos(b), r=eE*Math.cos(b)-eN*Math.sin(b);
  camera.fov=fov; camera.aspect=W/H; camera.near=Math.max(1,.05/mm); camera.far=(VIEW()+60)/mm; camera.setViewOffset(W,H,0,offY,W,H);   // far: no cars past where the ground stops
  camera.position.set(r/mm,camH/mm,-f/mm); camera.up.set(0,1,0);
  camera.lookAt(r/mm,camH/mm-Math.cos(pr)*100,-f/mm-Math.sin(pr)*100); if(tilt) camera.rotateX(tilt*DEG); camera.updateProjectionMatrix();
  // cabin camera: in the car's own frame
  const cc=CK.cab.cam; cc.fov=fov; cc.aspect=W/H; cc.setViewOffset(W,H,0,offY,W,H);
  cc.position.set(ex-P.eye[0],eh-P.eye[1],ez-P.eye[2]); cc.rotation.set(-(90-pitch-tilt)*DEG,-yr,0); cc.updateProjectionMatrix();
  if(typeof shadow==='object') shadow.visible=false;
  if(typeof tractorG==='object') tractorG.visible=false;
};
CK.render=function(dt){ const c=CK.cab; if(!c) return; update(dt||.016); try{ renderMirror(dt||.016); }catch(e){ console.warn('mirror',e); }
  const sm=renderer.shadowMap; if(sm.enabled){ sm.autoUpdate=false; const h=S.hdg||0, r=(S.roll||0)+(S.pitch||0)+(S.bz||0)+(S.bx||0);
    c.sf=(c.sf||0)+1; if(c.sf>=3||Math.abs(h-(c.sh||0))>.8||Math.abs(r-(c.sr||0))>.004){ c.sf=0; c.sh=h; c.sr=r; sm.needsUpdate=true; } }
  renderer.autoClear=false; renderer.clearDepth(); renderer.render(c.scene,c.cam); renderer.autoClear=true; };
CK.toggle=function(v){ CK.want=v==null?!CK.want:!!v; LSs('ydView',CK.want?'cockpit':'chase'); showPick();
  if(!CK.want&&CK.on) leave();
  if(CK.want&&mode!=='car'&&mode!=='tractor') toast('🎥 Cockpit view comes on when you are driving the car or tractor',2600);
  else toast(CK.want?'🎥 Cockpit view · drag to look around · Q / E glance · C for chase':'🎥 Chase view',2400); dirty=true; };

/* ---------- settings, keys, mode changes ---------- */
function showPick(){ const p=document.getElementById('viewPick'); if(p) for(const b of p.querySelectorAll('button')) b.classList.toggle('on',(b.dataset.view==='cockpit')===CK.want);
  const r=document.getElementById('fovRow'); if(r) r.style.display=CK.want?'':'none'; const hb=document.getElementById('hudBtn'); if(hb) hb.classList.toggle('on',CK.hud); const rr=document.getElementById('rsRow'); if(rr) rr.style.display=CK.want?'':'none'; const rb=document.getElementById('rsBtn'); if(rb) rb.classList.toggle('on',CK.real); const v=document.getElementById('fovVal'); if(v) v.textContent=Math.round(CK.fov)+'°'; }
// ⚙️ Seats (shown while the Model Y is picked): white (the owner's) or black
function showSeats(){ const r=document.getElementById('seatRow'); if(r) r.style.display=CARKEY==='modely'?'':'none';
  const p=document.getElementById('seatPick'); if(p) for(const b of p.querySelectorAll('button')) b.classList.toggle('on',b.dataset.s===CK.seats); }
{ const p=document.getElementById('seatPick'); if(p) p.addEventListener('click',e=>{ const b=e.target.closest('button[data-s]'); if(!b) return; e.stopPropagation();
    CK.seats=b.dataset.s; LSs('ydSeatsY',CK.seats); showSeats(); if(CK.cab){ dispose(); if(CK.on) build(CARKEY); } dirty=true; }); }
showSeats();
const pick=document.getElementById('viewPick');
if(pick) pick.addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return; e.stopPropagation(); CK.toggle(b.dataset.view==='cockpit'); });
for(const [id,d] of [['fovM',-5],['fovP',5]]){ const b=document.getElementById(id); if(b) b.addEventListener('click',e=>{ e.stopPropagation(); CK.fov=clamp(CK.fov+d,30,60); LSs('ydCkFov2',String(CK.fov)); showPick(); dirty=true; }); }
{ const rb=document.getElementById('rsBtn'); if(rb) rb.addEventListener('click',e=>{ e.stopPropagation(); CK.real=!CK.real; LSs('ydRealSpd',CK.real?'1':'0'); if(CK.on) setSpeedScale(CK.real?1:3); showPick(); }); }
function setHud(v){ CK.hud=v; LSs('ydHud',v?'1':'0'); showPick(); dirty=true; }
{ const hb=document.getElementById('hudBtn'); if(hb) hb.addEventListener('click',e=>{ e.stopPropagation(); setHud(!CK.hud); }); }
// tap the overhead console's sunroof keys: look.js asks on every tap (one that isn't a drag-to-look); a key tap is used up here
// and doesn't count toward its double-tap "look straight ahead" (tapping VENT twice used to throw your view forward)
{ const ray=new THREE.Raycaster(), v=new V3();
  CK.tapKey=function(e){ if(!CK.on||!CK.cab||!CK.roofKeys||!CK.roofKeys.length) return null; const c=CK.cab;
    c.scene.updateMatrixWorld(); c.cam.updateMatrixWorld(); ray.setFromCamera({x:(e.clientX/innerWidth)*2-1,y:-(e.clientY/innerHeight)*2+1},c.cam);
    const hit=ray.intersectObjects(CK.roofKeys.filter(o=>c.scene.getObjectById(o.id)),false)[0]; if(!hit) return null;
    const g=hit.object.parent, inv=new THREE.Matrix4().copy(g.matrixWorld).invert(), o=ray.ray.origin.clone().applyMatrix4(inv), d=ray.ray.direction.clone().transformDirection(inv);
    if(Math.abs(d.y)<1e-4) return null; const q=o.addScaledVector(d,(-.0012-o.y)/d.y);   // where the tap meets the console's face, not the target box's underside
    let best=null,bd=1e9; for(const s of CK.roofSpots){ const d=Math.hypot(q.x-s.x,q.z-s.z); if(d<bd){ bd=d; best=s; } }
    if(!best) return null; best.flash.material.opacity=.55; CK.roof(best.k); return best.k; }; }
addEventListener('keydown',e=>{ if(e.repeat||(e.target&&e.target.tagName==='INPUT')) return; const k=e.key.toLowerCase(); if(k==='c') CK.toggle(); else if(k==='h'&&CK.on){ setHud(!CK.hud); toast(CK.hud?'Head-up display on':'Head-up display off',1400); } });
const prevMode=window.onModeChange;
window.onModeChange=(m,was)=>{ if(prevMode) prevMode(m,was); if(CK.on&&m!=='car'&&m!=='tractor') leave(); else if(CK.on&&m!==was){ dispose(); } };
const prevCar=window.onCarChange;
window.onCarChange=(k)=>{ if(prevCar) prevCar(k); showSeats(); if(CK.cab) { dispose(); if(CK.on) build(k); } };
const prevPow=window.onPowerChange;
window.onPowerChange=(...a)=>{ if(prevPow) prevPow(...a); applyShadows(); };
showPick();
})();
