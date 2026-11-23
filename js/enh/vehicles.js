/* Traffic vehicle models: four original low-poly designs (no real makes, badges or names):
     luxury  – sleek midsize luxury SUV, sloping rear glass, alloy wheels, bright trim line
     big     – boxy full-size SUV, upright tailgate, roof rails, six-spoke wheels
     offroad – wide off-road pickup: raised, fender flares, open bed, big all-terrain tyres
     classic – 1970s-style muscle coupe: long hood with scoop, fastback roof, chrome bumpers and wheels
   Bodies are side profiles extruded across the width (like the player's 3D SUV); parts that share a material are
   merged into one mesh, so a car is about ten draw calls. Wheels are real tyres with rim faces, spin as the car
   moves, and the front pair steers. Front of every model is -z; units are metres. */
(()=>{
'use strict';

// merge several BufferGeometries (positions + normals) into one
function merge(list){
  let n=0; const parts=list.map(g=>{ const q=g.index?g.toNonIndexed():g; n+=q.attributes.position.count; return q; });
  const pos=new Float32Array(n*3), nor=new Float32Array(n*3); let o=0;
  for(const q of parts){ pos.set(q.attributes.position.array,o*3); nor.set(q.attributes.normal.array,o*3); o+=q.attributes.position.count; }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.BufferAttribute(nor,3)); return g;
}
// side profile (x = along the car, front at +x; y = up) extruded to width w, centred, turned so the front faces -z
function prof(pts,w,bevel){
  const s=new THREE.Shape(); pts.forEach((p,i)=>i?s.lineTo(p[0],p[1]):s.moveTo(p[0],p[1]));
  const b=bevel||0, g=new THREE.ExtrudeGeometry(s,{depth:w-2*b,bevelEnabled:b>0,bevelThickness:b,bevelSize:b,bevelSegments:2,curveSegments:4});
  g.translate(0,0,-(w-2*b)/2); g.rotateY(Math.PI/2); g.deleteAttribute('uv'); return g;
}
function box(w,h,d,x,y,z){ const g=new THREE.BoxGeometry(w,h,d); g.translate(x,y,z); g.deleteAttribute('uv'); return g; }

// rim faces drawn on the wheel caps
function rimTex(style){
  const c=document.createElement('canvas'); c.width=c.height=128; const x=c.getContext('2d'), C=64;
  x.fillStyle='#161616'; x.fillRect(0,0,128,128);                                   // tyre sidewall
  const R=style==='offroad'?40:style==='classic'?44:50;
  const face={alloy:'#c9ced4',dark:'#3b4046',offroad:'#1f2226',classic:'#e8edf2'}[style];
  x.fillStyle=face; x.beginPath(); x.arc(C,C,R,0,7); x.fill();
  x.fillStyle='#0d0d0d';
  if(style==='alloy'){ for(let i=0;i<10;i++){ x.save(); x.translate(C,C); x.rotate(i*Math.PI/5); x.beginPath(); x.moveTo(8,-4); x.lineTo(R-4,-7); x.lineTo(R-4,1); x.lineTo(8,0); x.fill(); x.restore(); } }
  else if(style==='dark'){ for(let i=0;i<6;i++){ x.save(); x.translate(C,C); x.rotate(i*Math.PI/3+.5); x.beginPath(); x.moveTo(12,-7); x.lineTo(R-5,-10); x.lineTo(R-5,10); x.lineTo(12,7); x.fill(); x.restore(); } }
  else if(style==='offroad'){ x.strokeStyle='#5a5f66'; x.lineWidth=5; x.beginPath(); x.arc(C,C,R-4,0,7); x.stroke();          // beadlock ring
    for(let i=0;i<8;i++){ x.save(); x.translate(C,C); x.rotate(i*Math.PI/4); x.fillRect(10,-5,R-18,10); x.restore(); } }
  else { for(let i=0;i<5;i++){ x.save(); x.translate(C,C); x.rotate(i*Math.PI*2/5); x.beginPath(); x.ellipse(R*.55,0,R*.28,6,0,0,7); x.fill(); x.restore(); } }  // slotted mag
  x.fillStyle='#8a9097'; x.beginPath(); x.arc(C,C,8,0,7); x.fill();                                                             // hub
  const t=new THREE.CanvasTexture(c); return t;
}

const M={};                                         // shared materials
function mats(){
  if(M.ok) return M; M.ok=true;
  M.glass=new THREE.MeshPhongMaterial({color:0x0e1622,specular:0x9fb3cc,shininess:120});
  M.trim=new THREE.MeshPhongMaterial({color:0x17191c,shininess:25});
  M.chrome=new THREE.MeshPhongMaterial({color:0xd7dde3,specular:0xffffff,shininess:140});
  M.tail=new THREE.MeshBasicMaterial({color:0x8a1216}); M.head=new THREE.MeshBasicMaterial({color:0xe8ecf2});
  M.tyre=new THREE.MeshPhongMaterial({color:0x151515,shininess:6});
  M.rim={}; for(const s of ['alloy','dark','offroad','classic']) M.rim[s]=new THREE.MeshPhongMaterial({map:rimTex(s),shininess:60});
  M.paint={};
  return M;
}
function paint(hex){ const m=mats(); return m.paint[hex]||(m.paint[hex]=new THREE.MeshPhongMaterial({color:hex,specular:0xdfe7ef,shininess:85})); }

/* ---------- the four designs (geometry built once, shared by every car of that kind) ---------- */
const KINDS={
  luxury:{ share:.35, colors:[0x1b1e24,0xf4f4f2,0x5a1620,0x9aa3ad,0x243447,0x3d4a3c], wheel:{r:.39,w:.27,style:'alloy',f:1.52,b:-1.5}, W:1.98,
    build(W){ return {
      paint:[prof([[-2.52,.38],[2.5,.38],[2.57,.62],[2.5,.86],[1.25,.99],[.9,1.02],[-2.3,1.04],[-2.5,.94],[-2.57,.6]],W,.05),
             box(W-.3,.05,2.0,0,1.6,.71)],
      glass:[prof([[1.05,.98],[.3,1.57],[-1.72,1.6],[-2.38,1.04]],W-.16,.03)],
      trim:[box(W+.02,.2,.12,0,.46,-2.52),box(W+.02,.2,.12,0,.46,2.52),box(W+.03,.12,3.1,0,.44,0),box(1.05,.2,.06,0,.66,-2.56)],
      chrome:[box(W+.02,.03,3.5,0,1.03,.1)],
      head:[box(W*.82,.06,.05,0,.86,-2.52)], tail:[box(W*.86,.07,.05,0,1.0,2.49)] }; } },
  big:{ share:.25, colors:[0x0f1114,0xeeeeec,0x6e7680,0x1c2b40,0x3a2a22,0x7a1b1b], wheel:{r:.41,w:.29,style:'dark',f:1.68,b:-1.56}, W:2.04,
    build(W){ return {
      paint:[prof([[-2.66,.42],[2.66,.42],[2.71,.74],[2.64,1.04],[1.35,1.13],[-2.63,1.15],[-2.71,.9]],W,.05),
             box(W-.24,.06,3.1,0,1.83,1.0)],
      glass:[prof([[1.18,1.1],[.55,1.79],[-2.55,1.81],[-2.62,1.13]],W-.14,.03)],
      trim:[box(W+.02,.26,.14,0,.52,-2.66),box(W+.02,.26,.14,0,.52,2.66),box(W+.04,.14,3.3,0,.48,0),
            box(.06,.06,2.8,-(W/2-.24),1.9,1.0),box(.06,.06,2.8,(W/2-.24),1.9,1.0),box(1.3,.34,.06,0,.82,-2.7)],
      chrome:[box(W+.01,.03,.05,0,1.16,-2.66)],
      head:[box(.46,.12,.05,-.72,.95,-2.66),box(.46,.12,.05,.72,.95,-2.66)], tail:[box(.14,.62,.05,-(W/2-.1),1.24,2.66),box(.14,.62,.05,(W/2-.1),1.24,2.66)] }; } },
  offroad:{ share:.25, colors:[0x2b2f33,0xf2f2f0,0x1f3a5f,0xc2410c,0x4b5320,0x8b1a1a], wheel:{r:.47,w:.34,style:'offroad',f:1.95,b:-1.8}, W:2.06,
    build(W){ return {
      paint:[prof([[-2.95,.56],[2.95,.56],[3.0,.92],[2.9,1.24],[1.6,1.34],[-.62,1.34],[-.62,1.36],[-2.95,1.36],[-3.0,1.0]],W,.05),
             box(W-.24,.06,1.3,0,1.98,-.13)],
      glass:[prof([[1.4,1.32],[.78,1.96],[-.52,1.97],[-.6,1.34]],W-.14,.03)],
      trim:[box(W-.24,.06,2.25,0,1.3,1.8),                                              // bed floor seen over the sides
            box(W+.02,.3,.16,0,.66,-2.98),box(W+.02,.28,.14,0,.64,2.98),box(1.5,.4,.06,0,1.0,-3.02),
            box(.2,.36,1.3,-(W/2+.05),.98,-1.95),box(.2,.36,1.3,(W/2+.05),.98,-1.95),   // fender flares
            box(.2,.36,1.3,-(W/2+.05),.98,1.8),box(.2,.36,1.3,(W/2+.05),.98,1.8),
            box(W-.3,.12,1.2,0,.4,-2.5)],                                                  // skid plate
      head:[box(W*.8,.06,.05,0,1.12,-2.99)], tail:[box(.16,.5,.05,-(W/2-.1),1.08,2.97),box(.16,.5,.05,(W/2-.1),1.08,2.97)] }; } },
  classic:{ share:.15, colors:[0xea580c,0x15803d,0x1d4ed8,0xeab308,0xb91c1c,0xf8fafc,0x111111], wheel:{r:.34,w:.3,style:'classic',f:1.45,b:-1.36}, W:1.9,
    build(W){ return {
      paint:[prof([[-2.42,.3],[2.42,.3],[2.47,.55],[2.4,.78],[.62,.86],[-1.98,.9],[-2.42,.85],[-2.47,.56]],W,.05),
             box(W-.36,.05,.72,0,1.24,.32),box(.7,.1,.62,0,.91,-1.2)],                  // roof, hood scoop
      glass:[prof([[.55,.84],[.05,1.23],[-.72,1.25],[-1.96,.9]],W-.2,.03)],
      trim:[box(1.1,.2,.05,0,.6,-2.46)],
      chrome:[box(W+.04,.14,.12,0,.42,-2.48),box(W+.04,.14,.12,0,.42,2.48)],
      head:[box(.3,.18,.05,-.62,.64,-2.47),box(.3,.18,.05,.62,.64,-2.47)], tail:[box(W*.84,.1,.05,0,.72,2.46)] }; } },
};
const GEO={};
function geo(kind){
  if(GEO[kind]) return GEO[kind]; const K=KINDS[kind], p=K.build(K.W), out={};
  for(const k of Object.keys(p)) out[k]=merge(p[k]);
  const w=K.wheel; out.wheel=new THREE.CylinderGeometry(w.r,w.r,w.w,18,1); out.wheel.rotateZ(Math.PI/2);
  out.shadow=new THREE.PlaneGeometry(K.W+.9,(Math.abs(w.f)+Math.abs(w.b))+2.6); out.shadow.rotateX(-Math.PI/2); out.shadow.translate(0,.03,0);
  return GEO[kind]=out;
}
function pickKind(){ let r=Math.random(); for(const k of Object.keys(KINDS)){ r-=KINDS[k].share; if(r<=0) return k; } return 'luxury'; }

// build one car; returns a Group with userData {wheels, fronts, r} for spinning and steering
function build(shadowMat){
  const rk=pickReal(); if(rk) return buildReal(rk,shadowMat);
  const kind=pickKind(), K=KINDS[kind];
  return buildKind(kind,K.colors[Math.floor(Math.random()*K.colors.length)],shadowMat);
}
function buildKind(kind,col,shadowMat){
  const m=mats(), K=KINDS[kind], G=geo(kind);
  const g=new THREE.Group(), pm=paint(col);
  if(shadowMat) g.add(new THREE.Mesh(G.shadow,shadowMat));
  g.add(new THREE.Mesh(G.paint,pm)); g.add(new THREE.Mesh(G.glass,m.glass));
  if(G.trim) g.add(new THREE.Mesh(G.trim,m.trim)); if(G.chrome) g.add(new THREE.Mesh(G.chrome,m.chrome));
  g.add(new THREE.Mesh(G.head,m.head)); g.add(new THREE.Mesh(G.tail,m.tail));
  const w=K.wheel, wm=[m.tyre,m.rim[w.style],m.rim[w.style]], wheels=[], fronts=[];
  for(const z of [-w.f,-w.b]) for(const sx of [-1,1]){
    const pivot=new THREE.Group(); pivot.position.set(sx*(K.W/2-w.w/2+.03),w.r,z); g.add(pivot);
    const wh=new THREE.Mesh(G.wheel,wm); pivot.add(wh); wheels.push(wh); if(z<0) fronts.push(pivot); }
  g.userData={wheels,fronts,r:w.r,wb:Math.abs(w.f-w.b),kind,spin:0,steer:0};
  return g;
}
// police car: the full-size SUV in black with white doors and a flashing red/blue light bar (userData.lights)
let POL=null;
function buildPolice(shadowMat){
  const m=mats(), K=KINDS.big, G=geo('big'), W=K.W;
  if(!POL){ POL={doors:merge([box(.03,.5,2.3,-(W/2+.01),.82,.35),box(.03,.5,2.3,(W/2+.01),.82,.35)]),
    bar:new THREE.BoxGeometry(.62,.14,.34), base:merge([box(1.4,.06,.38,0,1.9,.9)]),
    white:new THREE.MeshPhongMaterial({color:0xf8fafc,shininess:60}),
    red:new THREE.MeshBasicMaterial({color:0xff2222}), blue:new THREE.MeshBasicMaterial({color:0x2563ff}),
    dim:new THREE.MeshBasicMaterial({color:0x2a2f38}) }; }
  const g=new THREE.Group();
  if(shadowMat) g.add(new THREE.Mesh(G.shadow,shadowMat));
  g.add(new THREE.Mesh(G.paint,paint(0x0b0c0e))); g.add(new THREE.Mesh(G.glass,m.glass)); g.add(new THREE.Mesh(G.trim,m.trim));
  g.add(new THREE.Mesh(G.head,m.head)); g.add(new THREE.Mesh(G.tail,m.tail)); g.add(new THREE.Mesh(POL.doors,POL.white)); g.add(new THREE.Mesh(POL.base,m.trim));
  const red=new THREE.Mesh(POL.bar,POL.red), blue=new THREE.Mesh(POL.bar,POL.blue); red.position.set(-.34,2.0,.9); blue.position.set(.34,2.0,.9); g.add(red); g.add(blue);
  const w=K.wheel, wm=[m.tyre,m.rim.dark,m.rim.dark], wheels=[], fronts=[];
  for(const z of [-w.f,-w.b]) for(const sx of [-1,1]){ const pv=new THREE.Group(); pv.position.set(sx*(W/2-w.w/2+.03),w.r,z); g.add(pv);
    const wh=new THREE.Mesh(G.wheel,wm); pv.add(wh); wheels.push(wh); if(z<0) fronts.push(pv); }
  g.userData={wheels,fronts,r:w.r,wb:Math.abs(w.f-w.b),kind:'police',spin:0,steer:0,lights:{red,blue,on:POL.red,onB:POL.blue,dim:POL.dim}};
  return g;
}
/* ---------- the drivable cars' own 3D models in traffic (owner 2026-11-23: "have the drivable cars also be other cars
   we see on the road") ----------
   About 1 traffic car in 4 is an Expedition (random paint), a Model Y (Pearl White) or the Javelin AMX (mostly black, gold stripe). Each .glb is
   loaded once (only when such a car first turns up) and turned into a template: every part merged by kind of surface
   (paint, glass, lamps, shiny, matte; colours kept as vertex colours), so a car is ~6 draw calls plus 2-3 per wheel
   instead of 30-50. No interiors (the cabin is built by cockpit.js for your own car only; the Javelin's "Interior" part is
   dropped) and the glass is opaque dark tint. The Model Y keeps its photo panels (the owner's own car: lamps, rear
   details), so traffic Model Ys are Pearl White like his; those panels keep their own materials (5 more draw calls). A car shows its real model only near you (traffic.js: within ~80 m, and only the nearest few:
   Low 2, Medium 3, High 4); farther away, or before the model has loaded, it is the similar low-poly design underneath
   (Expedition → big SUV, Model Y → luxury SUV, Javelin → classic coupe) in the same paint. */
const REAL_SHARE=.25;
const REAL={
  expedition:{share:.3,lo:'big',colors:[0xb4c3d2,0x0f1114,0xeeeeec,0x6e7680,0x1c2b40,0x7a1b1b,0x3a2a22]},
  modely:{share:.3,lo:'luxury',colors:[0xeceeee],photos:true},       // Pearl White only: its front and back are the owner's photos (plain paint there was a blank blob)
  javelin3d2:{share:.4,lo:'classic',colors:[0x141518,0x141518,0x141518,0xc2410c,0x15803d,0x1e3a8a,0x8b1a1a,0xf1f1ee]},   // mostly black like the owner's; the gold stripe stays
};
const RM={};                                        // key -> {parts, wheels, r, wb, paint:{metal,rough}} once loaded; 'loading' / 'fail'
const RMAT={};
function rmats(){
  if(RMAT.ok) return RMAT; RMAT.ok=true;
  let env=null; try{ if(typeof envTex==='function') env=envTex(); }catch(e){}
  RMAT.env=env;
  RMAT.shiny=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.85,roughness:.3,envMap:env,side:THREE.DoubleSide});
  RMAT.matte=new THREE.MeshStandardMaterial({vertexColors:true,metalness:.05,roughness:.7,envMap:env,envMapIntensity:.6,side:THREE.DoubleSide});
  const m=mats(); RMAT.glass=m.glass; RMAT.head=m.head; RMAT.tail=m.tail;      // the shared lamps: traffic.js lights them after dark
  RMAT.paint={};
  return RMAT;
}
function realPaint(key,hex){ const R=rmats(), id=key+':'+hex; if(R.paint[id]) return R.paint[id]; const p=RM[key].paint;
  return R.paint[id]=new THREE.MeshStandardMaterial({color:REAL[key].photos&&p.col!=null?p.col:hex,metalness:p.metal,roughness:p.rough,envMap:R.env,side:THREE.DoubleSide}); }
function pickReal(){
  if(Math.random()>=REAL_SHARE) return null;
  const ks=Object.keys(REAL).filter(k=>RM[k]!=='fail'&&typeof CARS!=='undefined'&&CARS[k]&&CARS[k].model); if(!ks.length) return null;
  let t=ks.reduce((s,k)=>s+REAL[k].share,0), r=Math.random()*t; for(const k of ks){ r-=REAL[k].share; if(r<=0) return k; } return ks[0];
}
function buildReal(key,shadowMat){
  const R=REAL[key], col=R.colors[Math.floor(Math.random()*R.colors.length)];
  const g=buildKind(R.lo,col,shadowMat), u=g.userData;
  u.real={key,col,on:false,hi:null,lo:g.children.filter(c=>c.geometry!==geo(R.lo).shadow),lw:u.wheels,lf:u.fronts,lr:u.r,lwb:u.wb};
  loadReal(key);
  return g;
}
function loadReal(key){
  if(RM[key]) return; RM[key]='loading';
  const url=CARS[key].model;
  const go=()=>new THREE.GLTFLoader().load(url,gl=>{ try{ RM[key]=template(gl,key); }catch(e){ RM[key]='fail'; console.warn('traffic model '+key,e); } },
    undefined,e=>{ RM[key]='fail'; console.warn('traffic model '+key+' could not load',e); });
  if(THREE.GLTFLoader) go();
  else{ const s=document.createElement('script'); s.src='js/lib/GLTFLoader.js?v=1'; s.onload=go; s.onerror=()=>{ RM[key]='fail'; }; document.head.appendChild(s); }
}
// what kind of surface a glTF material is (null: leave the part out)
function rclass(m,key){ const n=m.name||'';
  if(/photo/i.test(n)) return REAL[key].photos?'photo:'+m.uuid:null;
  if(/interior/i.test(n)) return null;
  if(/paint/i.test(n)) return 'paint';
  if(/glass/i.test(n)) return 'glass';
  if(/tail|redlens/i.test(n)) return 'tail';
  if(/head/i.test(n)) return 'head';
  if((m.metalness||0)>=.5||/chrome|lug|rotor/i.test(n)) return 'shiny';
  return 'matte';
}
// a mesh's triangles (or one material group of them) in the car's frame, positions + normals + colour
function bake(o,M,start,count,col){
  const q=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone(), P=q.attributes.position, N=q.attributes.normal, U=q.attributes.uv;
  const a=start||0, n=Math.min(P.count-a,count==null?P.count:count), pos=new Float32Array(n*3), nor=new Float32Array(n*3), uv=U?new Float32Array(n*2):null;
  const v=new THREE.Vector3(), nm=new THREE.Matrix3().getNormalMatrix(M), flip=M.determinant()<0;
  for(let i=0;i<n;i++){ const j=flip?(i%3===1?i+1:i%3===2?i-1:i):i;              // mirrored parts: keep the winding outward
    v.fromBufferAttribute(P,a+i).applyMatrix4(M); pos.set([v.x,v.y,v.z],j*3);
    if(N){ v.fromBufferAttribute(N,a+i).applyMatrix3(nm).normalize(); nor.set([v.x,v.y,v.z],j*3); }
    if(uv) uv.set([U.getX(a+i),U.getY(a+i)],j*2); }
  if(q!==o.geometry) q.dispose();
  return {pos,nor,uv,n,col};
}
function joinBaked(list,c){
  let n=0; for(const b of list) n+=b.n;
  const pos=new Float32Array(n*3), nor=new Float32Array(n*3), cl=new Float32Array(n*3); let o=0;
  for(const b of list){ pos.set(b.pos,o*3); nor.set(b.nor,o*3); for(let i=0;i<b.n;i++) cl.set([b.col.r,b.col.g,b.col.b],(o+i)*3); o+=b.n; }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.BufferAttribute(nor,3));
  g.setAttribute('color',new THREE.BufferAttribute(cl,3));
  if(list.every(b=>b.uv)){ const uv=new Float32Array(n*2); let k=0; for(const b of list){ uv.set(b.uv,k*2); k+=b.n; } g.setAttribute('uv',new THREE.BufferAttribute(uv,2)); }
  if(c) g.translate(-c.x,-c.y,-c.z); g.computeBoundingSphere(); return g;
}
function template(gl,key){
  const root=gl.scene; root.updateMatrixWorld(true);
  const flip=new THREE.Matrix4().makeRotationY(Math.PI);                              // glTF faces +z, traffic cars face -z
  const isW=n=>/^wheel/i.test(n||'')&&!/well|arch|house/i.test(n);
  const wn=[]; root.traverse(o=>{ if(isW(o.name)&&!isW(o.parent&&o.parent.name)) wn.push(o); });
  const wheelOf=o=>{ for(let p=o;p;p=p.parent) if(wn.includes(p)) return p; return null; };
  const body={}, wb=new Map(), paint={metal:.3,rough:.4}, own={};
  root.traverse(o=>{ if(!o.isMesh) return;
    const ms=Array.isArray(o.material)?o.material:[o.material], M=new THREE.Matrix4().multiplyMatrices(flip,o.matrixWorld);
    if(ms.some(m=>/tail|head/i.test(m.name||''))&&!ms.some(m=>/photo/i.test(m.name||''))){        // lamps are built 3.5 cm in: push them out as js/game.js does
      const bb=new THREE.Box3().setFromObject(o); M.multiplyMatrices(flip,new THREE.Matrix4().makeTranslation(0,0,Math.sign((bb.min.z+bb.max.z)/2)*.035).multiply(o.matrixWorld)); }
    const groups=Array.isArray(o.material)&&o.geometry.groups.length?o.geometry.groups:[{start:0,count:null,materialIndex:0}];
    for(const gr of groups){ const m=ms[gr.materialIndex||0]; if(!m) continue; const cls=rclass(m,key); if(!cls) continue;
      if(cls.startsWith('photo')&&!own[cls]){ own[cls]=m; if(m.isMeshStandardMaterial){ m.envMap=rmats().env; m.envMapIntensity=1; } if(m.map){ m.map.encoding=THREE.LinearEncoding; m.map.needsUpdate=true; } m.depthWrite=false; m.polygonOffset=true; m.polygonOffsetFactor=-2; m.polygonOffsetUnits=-4; m.needsUpdate=true; }   // as js/game.js treats them
      const col=cls.startsWith('photo')?new THREE.Color(1,1,1):m.color?m.color.clone():new THREE.Color(1,1,1); if(Math.max(col.r,col.g,col.b)>=.05) col.convertLinearToSRGB();   // as js/game.js does
      if(cls==='paint'){ paint.metal=Math.min(.6,m.metalness??.3); paint.rough=Math.max(.25,m.roughness??.4); paint.col=col.getHex(); if(REAL[key].photos&&!own.paint){ own.paint=m; if(m.map) m.map=null; if(Math.max(m.color.r,m.color.g,m.color.b)>=.05) m.color.convertLinearToSRGB(); m.envMap=rmats().env; m.envMapIntensity=1; m.needsUpdate=true; } }
      const w=wheelOf(o), bucket=w?(wb.get(w)||(wb.set(w,{}),wb.get(w))):body;
      (bucket[cls]||(bucket[cls]=[])).push(bake(o,M,gr.start,gr.count,col)); } });
  const wheels=[]; let r=.35;
  for(const [w,bk] of wb){ const c=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().multiplyMatrices(flip,w.matrixWorld));
    const ps=Object.keys(bk).map(cls=>({cls,geo:joinBaked(bk[cls],c)}));
    const bb=new THREE.Box3(); for(const p of ps){ p.geo.computeBoundingBox(); bb.union(p.geo.boundingBox); } r=Math.max(.15,(bb.max.y-bb.min.y)/2);
    wheels.push({c,parts:ps,front:c.z<0}); }
  const parts=Object.keys(body).map(cls=>({cls,geo:joinBaked(body[cls]),mat:own[cls]})).sort((p,q)=>p.cls.startsWith('photo')-q.cls.startsWith('photo'));   // photos drawn last (they lie on the paint)
  const zs=wheels.map(w=>w.c.z);
  return {parts,wheels,r,wb:zs.length?Math.max(...zs)-Math.min(...zs):2.8,paint};
}
// show the real model (on) or the low-poly stand-in; returns whether the real model is showing
function detail(g,on){
  const u=g.userData, R=u.real; if(!R) return false;
  const T=RM[R.key]; if(on&&!(T&&T.parts)){ if(!T) loadReal(R.key); on=false; }
  if(on&&!R.hi){ const Mt=rmats(), h=new THREE.Group(), hw=[], hf=[];
    for(const p of T.parts){ const me=new THREE.Mesh(p.geo,p.mat||(p.cls==='paint'?realPaint(R.key,R.col):Mt[p.cls])); if(p.cls.startsWith('photo')) me.renderOrder=1; h.add(me); }
    for(const w of T.wheels){ const pv=new THREE.Group(); pv.position.copy(w.c); h.add(pv); const wh=new THREE.Group(); pv.add(wh);
      for(const p of w.parts) wh.add(new THREE.Mesh(p.geo,p.cls==='paint'?realPaint(R.key,R.col):Mt[p.cls]));
      wh.rotation.order='YXZ'; hw.push(wh); if(w.front) hf.push(pv); }
    h.visible=false; g.add(h); R.hi=h; R.hw=hw; R.hf=hf; }
  if(on===R.on) return on; R.on=on;
  for(const c of R.lo) c.visible=!on; if(R.hi) R.hi.visible=on;
  u.wheels=on?R.hw:R.lw; u.fronts=on?R.hf:R.lf; u.r=on?T.r:R.lr; u.wb=on?T.wb:R.lwb; u.kind=on?R.key:R.lo&&REAL[R.key].lo;
  return on;
}
YD.VEH={build,buildPolice,mats,KINDS,detail,REAL};
})();
