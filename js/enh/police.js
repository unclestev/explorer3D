/* Police patrols (only when switched on in 🏆 → Challenges; off by default).
   Speeding more than 15 mph over the limit for a couple of seconds, or running a red light, brings a squad car up
   behind you. It follows the exact path you drove (so it stays on your roads), lights flashing.
   - Stop (under 2 mph) with it right behind you for 3 seconds: you get a ticket (safe-driver score −10).
   - Get far enough ahead (about 450 m) and stay there for 4 seconds: you lose it.
   Taking off in the glider or turning patrols off ends the chase. After any chase there's a 45-second break. */
(()=>{
'use strict';
const {onTick}=YD, PR=YD.PROG, P=PR.P;
const mph2w=m=>m/2.237*SPEEDUP;
const T={trail:[],len:0,chase:null,group:null,coolUntil:0};   // no new chase for a while after one ends

// breadcrumb of where you've driven (last ~900 m), newest last
onTick(100,function policeTrail(){
  if(!(mode==='car'||mode==='tractor')){ T.trail.length=0; return; }
  const x=S.lng*MLNG, y=S.lat*MLAT, a=T.trail[T.trail.length-1];
  if(a&&Math.hypot(x-a[0],y-a[1])>200) T.trail.length=0;           // a jump: start fresh
  if(!a||Math.hypot(x-a[0],y-a[1])>3) T.trail.push([x,y]);
  let L=0; for(let i=T.trail.length-1;i>0;i--){ L+=Math.hypot(T.trail[i][0]-T.trail[i-1][0],T.trail[i][1]-T.trail[i-1][1]); if(L>900){ T.trail.splice(0,i-1); break; } }
});
// the point `back` metres behind you along that path, and the direction of travel there
function behind(back){
  const tr=T.trail, x=S.lng*MLNG, y=S.lat*MLAT; let px=x, py=y, left=back;
  for(let i=tr.length-1;i>=0;i--){ const dx=px-tr[i][0], dy=py-tr[i][1], d=Math.hypot(dx,dy);
    if(d>=left&&d>0){ const f=left/d; return [px-dx*f,py-dy*f,Math.atan2(dx,dy)]; }
    left-=d; px=tr[i][0]; py=tr[i][1]; }
  return tr.length>1?[px,py,Math.atan2(tr[1][0]-tr[0][0],tr[1][1]-tr[0][1])]:[x,y,rad(S.hdg)];
}

function start(why){
  if(T.chase||!P.police||!(mode==='car'||mode==='tractor')||T.trail.length<3||performance.now()<T.coolUntil) return;
  if(!T.group){ T.group=new THREE.Group(); scene.add(T.group); }
  const g=YD.VEH.buildPolice(shadow.material); T.group.add(g);
  T.chase={g,gap:90,v:Math.abs(S.v)*SPEEDUP,stopT:0,farT:0,t:0,blink:0,done:null,fade:0};
  toast('🚓 '+why+'! Police are behind you: stop to take a ticket, or lose them',3500);
}
function end(silent,msg){
  const c=T.chase; if(!c) return; T.chase=null; PR.chip(null); T.coolUntil=performance.now()+45000;
  if(c.g&&T.group) T.group.remove(c.g); if(msg&&!silent) toast(msg,3200);
}
PR.on('violation',d=>{ if(d.kind==='red') start('Ran a red light'); });
PR.on('speeding',d=>{ if(d.over>15&&d.secs>1.5) start('Speeding'); });

// every frame: move the squad car, flash the lights, decide ticket / escape
FRAME_HOOKS.push(function policeFrame(dt){
  const c=T.chase; if(!c) return false;
  if(!P.police||mode==='glider'||mode==='boat'){ end(false,mode==='glider'?'🚓 The police lost you in the air':null); return true; }
  const pw=Math.abs(S.v)*SPEEDUP, max=mph2w(95);
  let v=Math.max(0,Math.min(max,pw+(c.gap-16)*.9)); c.v+=(v-c.v)*Math.min(1,dt*2.5);
  c.gap=Math.max(13,c.gap+(pw-c.v)*dt); c.t+=dt;
  // outcome
  if(pw<mph2w(2)&&c.gap<24){ c.stopT+=dt; if(c.stopT>3){ P.safe.tickets++; P.safe.score=Math.max(0,P.safe.score-10); P.safe.streak=0; PR.save(true);
      end(false,'🚓 Pulled over: ticket issued (safe-driver score −10)'); return true; } } else c.stopT=0;
  if(c.gap>450){ c.farT+=dt; if(c.farT>4){ P.safe.escapes++; PR.save(true); end(false,'🚓 You lost them!'); return true; } } else c.farT=0;
  PR.chip(c.stopT>0?'🚓 Hold still… '+Math.max(0,3-c.stopT).toFixed(1)+' s':'🚓 Police '+YD.fmtDist(c.gap)+' behind · stop, or lose them',null);
  // place it in the car layer (same projection as traffic)
  const [px,py,hd]=behind(c.gap), X=S.lng*MLNG, Y=S.lat*MLAT, m=mpp(S.lat,S.zoom), b=rad(S.camB), sb=Math.sin(b), cb=Math.cos(b);
  const dx=px-X, dy=py-Y, f=dx*sb+dy*cb, r=dx*cb-dy*sb, g=c.g;
  c.fade=Math.min(1,c.fade+dt*2);
  g.position.set(r/m,0,-f/m); g.scale.setScalar(EXAG/m*c.fade); g.rotation.y=-(hd-b);
  const u=g.userData; u.spin-=c.v/SPEEDUP*dt/u.r; for(const w of u.wheels) w.rotation.x=u.spin;
  c.blink+=dt; const on=Math.floor(c.blink*4)%2===0, L=u.lights; L.red.material=on?L.on:L.dim; L.blue.material=on?L.dim:L.onB;
  return true;
});
YD.POLICE={end:(silent)=>end(silent),state:T};
})();
