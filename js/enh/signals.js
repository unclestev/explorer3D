/* Turn signals and hazards (issue #1; owner 2026-11-21: "the paddles on the G29 control the turning signals… the
   Lincoln and the Ford Explorer… the turning signal sound effect that is in real life").
   - Switched by: the G29 paddles (left paddle = left signal, right paddle = right; js/enh/wheel.js calls SIG.press),
     the [ and ] keys (\ for hazards), and the ◀ ⚠ ▶ buttons on screen. Pressing the same side again cancels it.
   - Self-cancel: like a column stalk, a signal switches itself off when the wheel has been turned that way past ~20 % and
     comes back near the centre. Hazards don't self-cancel.
   - Flash rate ~85 a minute (US rule: 60-120), lamp on half the time.
   - Sound: each car's own relay sound, synthesized (no recordings): a "tick" when the lamps come on and a "tock" when they
     go off, through the engine sound's cabin filter, so it's clear from the cockpit and quiet in the chase view:
       Ford Explorer   Ford's crisp electronic tick-tock: a short bright click with a hollow ring, the tock a little lower
       Lincoln         Lincoln's soft, muted wooden tock — a mallet-like knock in the spirit of its marimba chimes, not a click
       Model Y         Tesla's quiet, round tick-tock
       Javelin         a 1970s thermal flasher can: a loud metallic clack, a little uneven
       tractor         a plain heavy relay
   - Shows: green arrows on every cockpit's cluster / screens / head-up display (js/enh/cockpit.js reads SIG) and the
     lamps on the car in the chase view (amber; red on the Model Y, whose US-market rear signals are in the red tail lamps).
   window.SIG = {dir (-1 left, 1 right, 0), haz, lit (lamps on right now), left, right (each side lit now), press(d), hazard()} */
(()=>{
'use strict';
const SIG={dir:0,haz:false,lit:false,left:false,right:false,t:0,armed:false};
window.SIG=SIG;
const PERIOD=.70;                                                   // s per flash (~85 a minute)
const say=(m,ms)=>{ if(typeof toast==='function') toast(m,ms||1400); };
function sync(){ S.blink=SIG.haz?2:SIG.dir; showBtns(); }
SIG.press=function(d){                                              // a stalk / paddle / key: d = -1 left, 1 right
  if(SIG.haz){ SIG.haz=false; }
  SIG.dir=SIG.dir===d?0:d; SIG.armed=false; SIG.t=0; SIG.lit=false; tickNow(); sync();
};
SIG.hazard=function(){ SIG.haz=!SIG.haz; SIG.t=0; SIG.lit=false; tickNow(); sync(); say(SIG.haz?'⚠ Hazard lights on':'Hazard lights off'); };
SIG.cancel=function(){ if(SIG.dir){ SIG.dir=0; sync(); } };
function tickNow(){ SIG.t=PERIOD; }                                 // start a flash straight away

/* ---------- sound ---------- */
const SR=48000, BUF={};
const STYLE=()=>{ if(mode==='tractor') return 'tractor'; const k=typeof CARKEY==='string'?CARKEY:'';
  return k==='navigator'?'lincoln':/^javelin/.test(k)?'thermal':k==='modely'?'tesla':'ford'; };
// one click: a noise/impulse excitation ringing a few damped resonances, plus a low body knock
function synth(parts,len,seed){
  const n=Math.round(SR*len), out=new Float32Array(n); let s=seed||1;
  const rnd=()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296-.5; };
  for(const p of parts){
    if(p.f){ // damped sine partial (mallets, rings)
      const w=2*Math.PI*p.f/SR, dec=Math.exp(-1/(p.d*SR)), at=Math.max(1,Math.round(SR*(p.a||.0006)));
      let e=p.g; for(let i=0;i<n;i++){ const env=i<at?i/at:1; out[i]+=Math.sin(w*i+(p.ph||0))*e*env; e*=dec; } }
    else { // filtered noise burst
      const fc=p.fc, q=p.q||4, f=2*Math.sin(Math.PI*fc/SR); let lo=0,bd=0; const dec=Math.exp(-1/(p.d*SR)); let e=p.g;
      for(let i=0;i<n;i++){ const x=rnd()*e; const hi=x-lo-bd/q; bd+=f*hi; lo+=f*bd; out[i]+=bd; e*=dec; } } }
  let pk=0; for(const v of out) pk=Math.max(pk,Math.abs(v)); for(let i=0;i<n;i++) out[i]=Math.tanh(out[i]/(pk||1)*1.2)*.9;
  const fade=Math.round(SR*.004); for(let i=0;i<fade;i++) out[n-1-i]*=i/fade;
  return out; }
const RECIPES={
  // Ford: bright electronic relay click with a hollow plastic ring; the tock is darker and softer
  ford:{tick:[{fc:3400,q:3,d:.0018,g:1},{f:2350,d:.007,g:.55},{f:4700,d:.003,g:.25},{f:190,d:.012,g:.35}],
        tock:[{fc:2400,q:3,d:.0018,g:.8},{f:1700,d:.008,g:.5},{f:3500,d:.003,g:.2},{f:160,d:.012,g:.35}],len:.06,vol:.55},
  // Lincoln: a soft, rounded wooden knock (mallet on a wood block); low, warm, almost no click
  lincoln:{tick:[{f:880,d:.028,g:1,a:.0015},{f:3460,d:.006,g:.18,a:.001},{f:440,d:.02,g:.35},{fc:1500,q:2,d:.001,g:.15}],
           tock:[{f:660,d:.032,g:.9,a:.0015},{f:2600,d:.006,g:.15,a:.001},{f:330,d:.022,g:.35},{fc:1200,q:2,d:.001,g:.12}],len:.14,vol:.5},
  // Tesla: quiet, round, short
  tesla:{tick:[{f:1300,d:.012,g:1,a:.001},{f:2600,d:.004,g:.25},{fc:2500,q:2,d:.0012,g:.2}],
         tock:[{f:1000,d:.013,g:.9,a:.001},{f:2000,d:.004,g:.22},{fc:2000,q:2,d:.0012,g:.18}],len:.07,vol:.38},
  // thermal flasher can: a loud metallic clack with a bright ring
  thermal:{tick:[{fc:5200,q:5,d:.003,g:1},{f:3100,d:.012,g:.6},{f:5300,d:.008,g:.35},{f:7400,d:.005,g:.2},{f:240,d:.01,g:.3}],
           tock:[{fc:4200,q:5,d:.003,g:.85},{f:2700,d:.012,g:.5},{f:4600,d:.007,g:.3},{f:210,d:.01,g:.3}],len:.08,vol:.7},
  tractor:{tick:[{fc:2000,q:3,d:.003,g:1},{f:1250,d:.012,g:.6},{f:150,d:.02,g:.5}],
           tock:[{fc:1700,q:3,d:.003,g:.9},{f:1050,d:.012,g:.5},{f:130,d:.02,g:.5}],len:.08,vol:.6}
};
function buf(ctx,style,which){ const k=style+which; if(BUF[k]) return BUF[k];
  const R=RECIPES[style], d=synth(R[which],R.len,which==='tick'?7:11), b=ctx.createBuffer(1,d.length,SR); b.copyToChannel?b.copyToChannel(d,0):b.getChannelData(0).set(d);
  return BUF[k]=b; }
function click(which){
  const A=window.SOUND&&SOUND.state; if(!A||!A.ctx||!A.bus||!SOUND.on||A.ctx.state!=='running') return;
  const style=STYLE(), R=RECIPES[style], inside=!!(window.COCKPIT&&COCKPIT.on);
  try{ const src=A.ctx.createBufferSource(); src.buffer=buf(A.ctx,style,which);
    if(style==='thermal') src.playbackRate.value=.97+Math.random()*.06;           // the old can isn't quite regular
    const g=A.ctx.createGain(); g.gain.value=R.vol*(inside?1:.3); src.connect(g); g.connect(A.bus); src.start(); }catch(e){ console.warn('signal click',e); } }

/* ---------- timing, self-cancel ---------- */
FRAME_HOOKS.push(function signals(dt){
  const on=SIG.dir||SIG.haz, driving=mode==='car'||mode==='tractor';
  if(!on||!driving){ const was=SIG.lit; if(was){ SIG.lit=SIG.left=SIG.right=false; lamps(); } return was; }
  // self-cancel: the wheel turned the signal's way past ~20 %, then back near the centre
  if(SIG.dir&&!SIG.haz){ const st=(S.stIn||0)*SIG.dir;
    if(st>.22) SIG.armed=true; else if(SIG.armed&&st<.06){ SIG.dir=0; SIG.armed=false; sync(); } }
  const per=PERIOD*(STYLE()==='thermal'?1.12:1);                     // the thermal can is a bit slower
  SIG.t+=dt; let changed=false;
  while(SIG.t>=per/2){ SIG.t-=per/2; SIG.lit=!SIG.lit; changed=true; click(SIG.lit?'tick':'tock'); }
  SIG.left=SIG.lit&&(SIG.haz||SIG.dir<0); SIG.right=SIG.lit&&(SIG.haz||SIG.dir>0);
  if(changed){ lamps(); return true; }                               // a redraw for the lamps
  return false;
});

/* ---------- lamps on the car in the chase view ---------- */
// photo cars: an amber glow over each outer rear lamp on the photo (positions as fractions of the photo, y from the bottom);
// 3D model cars: a glow at each rear (and front) corner lamp of the model
const POS={explorer:[[.09,.37],[.91,.37]],javelin:[[.12,.2],[.88,.2]],navigator:[[.05,.30],[.95,.30]]};
const glowTex=(()=>{ const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'), g=x.createRadialGradient(32,32,1,32,32,32);
  g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(.3,'rgba(255,255,255,.7)'); g.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=g; x.fillRect(0,0,64,64); return new THREE.CanvasTexture(c); })();
const L={host:null,key:null,items:[]};
function mat(col){ return new THREE.MeshBasicMaterial({map:glowTex,color:col,transparent:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,opacity:0}); }
function clearLamps(){ for(const it of L.items){ if(it.o.parent) it.o.parent.remove(it.o); it.o.geometry&&it.o.geometry.dispose(); it.o.material.dispose(); } L.items=[]; L.host=null; L.key=null; }
function build(){
  const key=CARKEY, c=typeof CARS==='object'&&CARS[key]; if(!c) return;
  if(c.model){ const md=typeof MODELS==='object'&&MODELS[key]; if(!md) return; if(L.host===md.g) return; clearLamps(); L.host=md.g; L.key=key;
    const red=key==='modely';                                        // Model Y (US): red rear signals in the tail lamps
    const corners=(re,front)=>{ const bb=new THREE.Box3(); let any=false; md.g.updateMatrixWorld(true);
      md.g.traverse(o=>{ if(!o.isMesh) return; const ms=Array.isArray(o.material)?o.material:[o.material]; if(ms.some(m=>re.test(m.name||''))){ bb.expandByObject(o); any=true; } });
      if(!any) return; const inv=new THREE.Matrix4().copy(md.g.matrixWorld).invert(); const a=bb.min.clone().applyMatrix4(inv), b=bb.max.clone().applyMatrix4(inv);
      const x0=Math.min(a.x,b.x), x1=Math.max(a.x,b.x), y=(a.y+b.y)/2, z=front?Math.max(a.z,b.z):Math.min(a.z,b.z), inset=(x1-x0)*.08;
      for(const [side,x] of [[1,x1-inset],[-1,x0+inset]]){                  // model x: +x is the car's left (glTF faces +z; g turned 180°)
        const s=new THREE.Mesh(new THREE.PlaneGeometry(.42,.3),mat(front?0xffa21a:red?0xff2010:0xff9a10)); s.position.set(x,y,z+(front?.04:-.04)); s.rotation.y=front?0:Math.PI;
        s.renderOrder=12; md.g.add(s); L.items.push({o:s,side:-side*1}); } };
    corners(/tail/i,false); corners(/head/i,true); return; }
  const m=typeof PHOTO==='object'&&PHOTO.mesh; if(!m||PHOTO.key!==key) return; if(L.host===m) return; clearLamps(); L.host=m; L.key=key;
  m.geometry.computeBoundingBox(); const bb=m.geometry.boundingBox, W=bb.max.x-bb.min.x, H=bb.max.y-bb.min.y;
  const P=POS[key]||[[.1,.35],[.9,.35]];
  P.forEach(([fx,fy],i)=>{ const q=new THREE.Mesh(new THREE.PlaneGeometry(W*.16,W*.12),mat(0xffa018)); q.position.set(bb.min.x+fx*W,bb.min.y+fy*H,.02); q.renderOrder=12; m.add(q); L.items.push({o:q,side:i===0?-1:1}); });
}
function lamps(){
  try{ build(); }catch(e){ console.warn('signal lamps',e); }
  for(const it of L.items) it.o.material.opacity=(it.side<0?SIG.left:SIG.right)?1:0;
  if(typeof dirty!=='undefined') dirty=true;
}

/* ---------- keys and on-screen buttons ---------- */
addEventListener('keydown',e=>{ if(e.repeat||(e.target&&e.target.tagName==='INPUT')) return;
  if(e.key==='[') { SIG.press(-1); } else if(e.key===']') { SIG.press(1); } else if(e.key==='\\') { SIG.hazard(); } });
const box=document.createElement('div'); box.id='sigBtns';
box.innerHTML='<button id="sigL" aria-label="Left turn signal">◀</button><button id="sigH" aria-label="Hazard lights">⚠</button><button id="sigR" aria-label="Right turn signal">▶</button>';
const ctl=document.getElementById('ctl'); if(ctl) ctl.appendChild(box);
for(const [id,fn] of [['sigL',()=>SIG.press(-1)],['sigR',()=>SIG.press(1)],['sigH',()=>SIG.hazard()]]){
  const b=document.getElementById(id); if(b){ b.addEventListener('pointerdown',e=>e.stopPropagation()); b.addEventListener('click',e=>{ e.stopPropagation(); fn(); }); } }
function showBtns(){ const l=document.getElementById('sigL'), r=document.getElementById('sigR'), h=document.getElementById('sigH');
  if(l) l.classList.toggle('on',SIG.dir<0&&!SIG.haz); if(r) r.classList.toggle('on',SIG.dir>0&&!SIG.haz); if(h) h.classList.toggle('on',SIG.haz);
  box.style.display=(mode==='car'||mode==='tractor')?'':'none'; }
{ const prev=window.onModeChange; window.onModeChange=(m,was)=>{ if(prev) prev(m,was); if(m!=='car'&&m!=='tractor'){ SIG.dir=0; SIG.haz=false; } sync(); }; }
{ const prev=window.onCarChange; window.onCarChange=k=>{ if(prev) prev(k); clearLamps(); }; }
sync();
})();
