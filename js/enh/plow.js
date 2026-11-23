/* The snow plow (tools/make-snowplow.py, CARS.snowplow in js/game.js).
   - Its amber roof lights (materials Beacon and BeaconB) flash in turn while the engine runs, like a real plow's strobes.
   - Snow (owner 2026-11-23: "step up your game"): when it's snowing (the real weather or ⚙️ Weather) and the plow is
     moving, snow curls off the trailing (right) end of the angled blade and sprays out to the side, more the faster you
     go — up to ~45 mph, like a real plow throwing a windrow onto the shoulder. */
(()=>{
'use strict';
let A=null, B=null, was=null;
setInterval(()=>{
  const M=typeof MODELS!=='undefined'&&MODELS.snowplow; if(!M) return;
  if(!A){ for(const m of M.mats||[]){ if(m.name==='Beacon') A=m; else if(m.name==='BeaconB') B=m; } if(!A) return; }
  const on=typeof CARKEY!=='undefined'&&CARKEY==='snowplow'&&!!(window.IGN&&(IGN.state==='on'||IGN.state==='crank'));
  const ph=on?(Math.floor(performance.now()/260)%4):-1;           // A A B B
  const key=ph<0?'off':ph<2?'a':'b'; if(key===was) return; was=key;
  for(const [m,lit] of [[A,key==='a'],[B,key==='b']]) if(m&&m.emissive) m.emissive.setRGB(lit?2.6:0,lit?1.1:0,lit?.05:0);
  if(typeof dirty!=='undefined') dirty=true;
},60);

// ---------- snow spray off the blade ----------
const N=700, P=new Float32Array(N*3), V=new Float32Array(N*3), L=new Float32Array(N);   // positions, velocities, life (s)
let pts=null, last=0, emit=0, WS=null;
// the blade's trailing end and the direction snow leaves it, in the model's own metres (front +z, left +x)
const ANG=21*Math.PI/180, AX=[Math.cos(ANG),0,Math.sin(ANG)], NF=[-Math.sin(ANG),0,Math.cos(ANG)];
const END=[.42-AX[0]*1.9, .55, 4.62-AX[2]*1.9];
function make(g){ const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(P,3));
  const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d'), gr=x.createRadialGradient(32,32,0,32,32,32);
  gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(.45,'rgba(250,252,255,.85)'); gr.addColorStop(1,'rgba(240,246,255,0)'); x.fillStyle=gr; x.fillRect(0,0,64,64);
  const mat=new THREE.PointsMaterial({color:0xffffff,map:new THREE.CanvasTexture(c),size:.42,sizeAttenuation:true,transparent:true,opacity:.95,depthWrite:false});   // soft round flakes
  pts=new THREE.Points(geo,mat); pts.frustumCulled=false; pts.name='PlowSpray'; for(let i=0;i<N;i++){ L[i]=0; P[i*3+1]=-50; } g.add(pts); }
function snowing(){ const W=window.YD&&YD.AT&&YD.AT.wx; return !!(W&&W.type==='snow'); }
function frame(now){
  requestAnimationFrame(frame);
  const M=typeof MODELS!=='undefined'&&MODELS.snowplow; if(!M||!M.g||!window.THREE) return;
  if(!pts){ make(M.g); WS=new THREE.Vector3(); }
  const dt=Math.min(.05,(now-last)/1000||0); last=now;
  const v=Math.abs((typeof S!=='undefined'&&S.v)||0), mph=v*2.237;
  const active=typeof CARKEY!=='undefined'&&CARKEY==='snowplow'&&mode==='car'&&snowing()&&S.v>.8;
  let alive=false;
  if(active){ emit+=dt*Math.min(1400,mph*34); }
  for(let i=0;i<N;i++){
    if(L[i]<=0&&active&&emit>=1){ emit-=1; const k=i*3, u=Math.random(), s=Math.min(1.6,.4+mph/28);
      // from along the last metre of the blade's face, low down; out to the right (−x), up, and carried forward a bit
      P[k]=END[0]+AX[0]*u*1.1+NF[0]*.1; P[k+1]=END[1]*(.3+Math.random()*.9); P[k+2]=END[2]+AX[2]*u*1.1+NF[2]*.1;
      V[k]=-(3.5+Math.random()*4.5)*s; V[k+1]=(2.2+Math.random()*3.2)*s; V[k+2]=(Math.random()*1.6-.1)*s;
      L[i]=.9+Math.random()*.9; }
    if(L[i]>0){ alive=true; const k=i*3; L[i]-=dt; V[k+1]-=9.8*.55*dt; V[k]*=1-dt*.9; V[k+2]-=v*.25*dt;   // gravity, air drag, left behind
      P[k]+=V[k]*dt; P[k+1]+=V[k+1]*dt; P[k+2]+=V[k+2]*dt; if(P[k+1]<.02){ P[k+1]=.02; V[k+1]=0; V[k]*=.6; }
      if(L[i]<=0) P[k+1]=-50; }
  }
  if(alive||active){ M.g.getWorldScale(WS); pts.material.size=.42*WS.x;            // the world is scaled (~15 units a metre): flakes stay ~40 cm
    pts.geometry.attributes.position.needsUpdate=true; if(typeof dirty!=='undefined') dirty=true; }
  if(emit>40) emit=40;
}
requestAnimationFrame(frame);
})();
