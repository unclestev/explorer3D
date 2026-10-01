/* Progress: play time, miles, a safe-driver score, streets and landmarks collected, and the 🏆 panel.
   Everything here runs quietly in the background: nothing changes how the open world plays. The only things you see
   are short pop-ups (new landmark, a driving mistake, street milestones), which can be switched off in ⚙️ Settings.
   Challenges (time trials, glider challenges, police) live in js/enh/challenges.js and only start when you pick one
   in the 🏆 panel. Saved on this device (localStorage 'ydProg'). */
(()=>{
'use strict';
const {safe,onTick}=YD;
const KEY='ydProg';
function blank(){ return {v:1,time:{total:0,drive:0,days:{}},dist:{car:0,tractor:0,boat:0,glider:0},top:0,
  safe:{score:100,red:0,stop:0,crash:0,speed:0,tickets:0,escapes:0,streak:0,best:0},
  streets:{},spots:{},trials:{},glide:{climb:null,land:null},pop:true,police:false}; }
function load(){ try{ const j=JSON.parse(localStorage.getItem(KEY)||'null'); if(j&&j.v===1){ const b=blank(); for(const k of Object.keys(b)) if(j[k]!==undefined) b[k]=typeof b[k]==='object'&&b[k]&&!Array.isArray(b[k])?Object.assign(b[k],j[k]):j[k]; return b; } }catch(e){} return blank(); }
const P=load();
let lastSave=0;
function save(now){ if(!now&&Date.now()-lastSave<8000) return; lastSave=Date.now(); try{ localStorage.setItem(KEY,JSON.stringify(P)); }catch(e){} }
addEventListener('pagehide',()=>save(true)); document.addEventListener('visibilitychange',()=>{ if(document.hidden) save(true); });

// tiny event bus: police listens for violations, challenges for landings, etc.
const handlers={}; const on=(ev,fn)=>{ (handlers[ev]=handlers[ev]||[]).push(fn); }; const emit=(ev,d)=>{ for(const f of handlers[ev]||[]) safe(ev,()=>f(d)); };
const pop=(msg,ms)=>{ if(P.pop) toast(msg,ms||2200); };
const dayKey=d=>{ d=d||new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
function lightState(ph){ const t=(Date.now()/1000)%30, a=t<12?'g':t<15?'y':'r', b=t<15?'r':t<27?'g':'y'; return ph===0?a:b; }   // same cycle as the signs
const GAME_MILE=1609.344;
function driving(){ return mode==='car'||mode==='tractor'; }
function conditions(){ const A=YD.AT, night=A&&A.k>.6, w=A&&A.wx&&A.wx.type; return (night?'Night':'Day')+(w==='rain'?' · rain':w==='snow'?' · snow':''); }

/* ---------- play time + distance ---------- */
let lastT=Date.now(), session=0, lastPos=null;
onTick(1000,function timeTick(){
  const now=Date.now(), dt=Math.min(5,(now-lastT)/1000); lastT=now; if(document.hidden) return;
  P.time.total+=dt; session+=dt; const k=dayKey(); P.time.days[k]=(P.time.days[k]||0)+dt;
  if(Math.abs(S.v)>.5&&mode!=='walk'||mode==='glider') P.time.drive+=dt;
  const days=Object.keys(P.time.days); if(days.length>90) for(const d of days.sort().slice(0,days.length-90)) delete P.time.days[d];
  save();
});
onTick(250,function distTick(){
  const x=S.lng*MLNG, y=S.lat*MLAT;
  if(lastPos){ const d=Math.hypot(x-lastPos[0],y-lastPos[1]);
    if(d<600){ const m=d/(mode==='glider'?GSPEED:SPEEDUP), mi=m/GAME_MILE;       // miles as the speedometer counts them
      P.dist[mode]=(P.dist[mode]||0)+mi;
      if(driving()&&mi>0){ P.safe.streak+=mi; if(P.safe.streak>P.safe.best) P.safe.best=P.safe.streak;
        clean+=mi; while(clean>=.25){ clean-=.25; P.safe.score=Math.min(100,P.safe.score+1); } } } }
  lastPos=[x,y];
  if(driving()){ const mph=Math.abs(S.v)*2.237; if(mph>P.top) P.top=mph; }
});

/* ---------- safe-driver score ---------- */
let clean=0, speedT=0, speedWarned=false, wasSmashing=false;
function penalty(kind,pts,msg){
  const s=P.safe; s.score=Math.max(0,s.score-pts); if(kind in s) s[kind]++; s.streak=0; clean=0;
  pop(msg+'  −'+pts,2400); emit('violation',{kind}); save(true);
}
const watch=new Map();                                              // stop sign / light -> what happened as you passed it
let tickT=Date.now();
onTick(100,function drivingTick(){
  const now=Date.now(), dt=Math.min(1,(now-tickT)/1000); tickT=now;
  if(!driving()){ watch.clear(); speedT=0; wasSmashing=false; return; }
  const x=S.lng*MLNG, y=S.lat*MLAT, mph=Math.abs(S.v)*2.237, OX=YD.OX;
  // stop signs and lights you drive over (within a few metres of the post's spot on your road)
  if(OX){ const check=(list,kind)=>{ for(const o of list){ const d=Math.hypot(o.x-x,o.y-y); let w=watch.get(o);
      if(d>45){ if(w) watch.delete(o); continue; }
      if(!w){ w={minD:d,minV:mph,red:false,done:false}; watch.set(o,w); } if(w.done) continue;
      if(d<w.minD) w.minD=d; if(d<30) w.minV=Math.min(w.minV,mph);
      if(kind==='sig'&&d<6&&mph>5&&lightState(hash(Math.round(o.x/60),Math.round(o.y/60))<.5?0:1)==='r') w.red=true;
      if(d>w.minD+8){ w.done=true;
        if(kind==='sig'&&w.minD<6&&w.red) penalty('red',8,'🚦 Ran a red light');
        else if(kind==='stop'&&w.minD<4.5&&w.minV>3) penalty('stop',5,'🛑 Rolled through a stop sign'); } } };
    check(OX.stops||[],'stop'); check(OX.sigs||[],'sig'); }
  // speeding: more than 5 mph over the limit
  const lim=YD.limit;
  if(lim&&mph>lim+5){ speedT+=dt; P.safe.speed+=dt;
    if(!speedWarned&&speedT>2){ speedWarned=true; pop('⚠️ Speeding: limit '+lim+' mph',2000); }
    if(speedT>=5){ speedT-=5; P.safe.score=Math.max(0,P.safe.score-1); P.safe.streak=0; clean=0; }
    emit('speeding',{over:mph-lim,secs:speedT}); }
  else { speedT=0; if(mph<(lim||99)) speedWarned=false; }
  // driving through a building
  if(smashing&&!wasSmashing) penalty('crash',4,'💥 Hit a building'); wasSmashing=smashing;
});

/* ---------- streets and landmarks ---------- */
const townNow=()=>{ const t=(document.getElementById('place')||{}).textContent||''; return t.split(',')[0]; };
onTick(1000,function exploreTick(){
  if(driving()&&onRoad&&roadName){ const k=roadName.trim();
    if(k&&!P.streets[k]){ P.streets[k]={t:Date.now(),town:townNow()}; const n=Object.keys(P.streets).length;
      if(n===1||n%10===0) pop('🛣️ '+n+(n===1?' street':' streets')+' driven'); emit('street',{name:k}); save(); } }
  if(mode==='glider') return;
  const x=S.lng*MLNG, y=S.lat*MLAT;
  const visit=(q,cls)=>{ const d=Math.hypot(q.lng*MLNG-x,q.lat*MLAT-y); if(d>45) return;
    const key=q.name+'@'+q.lat.toFixed(4)+','+q.lng.toFixed(4); if(P.spots[key]) return;
    P.spots[key]={n:q.name,c:cls||q.cls||'',t:Date.now()}; pop('📍 Visited '+q.name,2600); emit('visit',{name:q.name}); save(); };
  for(const q of pois) visit(q); for(const q of towers) visit(q,'water tower');
});
function nearbyStreets(){
  const names=new Set(); let fs=[]; try{ fs=map.querySourceFeatures(bSrc,{sourceLayer:'transportation_name'}); }catch(e){}
  const x=S.lng*MLNG, y=S.lat*MLAT;
  for(const f of fs){ const p=f.properties||{}, n=p.name; if(!n||/^(path|track|service|footway|cycleway|pedestrian|rail|transit)$/.test(p.class||'')) continue;
    const g=f.geometry, c=g&&(g.type==='LineString'?g.coordinates[0]:g.type==='MultiLineString'?g.coordinates[0][0]:null);
    if(c&&Math.hypot(c[0]*MLNG-x,c[1]*MLAT-y)<1500) names.add(n); }
  let done=0; for(const n of names) if(P.streets[n]) done++; return {done,total:names.size};
}

/* ---------- 🏆 panel ---------- */
const panel=document.getElementById('progPanel'), body=document.getElementById('pgBody'), btn=document.getElementById('prog');
let tab='stats';
const CH=[];                                                         // challenges registered by challenges.js
function addChallenge(c){ CH.push(c); }
const fmtT=s=>{ s=Math.round(s); const h=Math.floor(s/3600), m=Math.floor(s%3600/60); return h?h+'h '+String(m).padStart(2,'0')+'m':m?m+'m '+String(s%60).padStart(2,'0')+'s':s+'s'; };
const fmtMi=m=>(m<10?m.toFixed(1):Math.round(m))+' mi';
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function row(label,val,sub){ return `<div class="setRow"><span>${label}${sub?'<small>'+sub+'</small>':''}</span><b class="pgVal">${val}</b></div>`; }
function render(){
  if(!panel.classList.contains('on')) return;
  for(const b of panel.querySelectorAll('.pgTabs button')) b.classList.toggle('on',b.dataset.t===tab);
  let h='';
  if(tab==='stats'){
    const s=P.safe, sc=Math.round(s.score), col=sc>=85?'#4ade80':sc>=60?'#fbbf24':'#f87171';
    const near=nearbyStreets(), spots=Object.values(P.spots), tw=spots.filter(q=>q.c==='water tower').length;
    h+='<div class="pgSec">Time played</div>'+row('Today',fmtT(P.time.days[dayKey()]||0))+row('This session',fmtT(session))+row('All time',fmtT(P.time.total),'Actually moving: '+fmtT(P.time.drive));
    h+='<div class="pgSec">Distance</div>'+row('SUV',fmtMi(P.dist.car||0))+row('Tractor · Boat · Glider',[P.dist.tractor,P.dist.boat,P.dist.glider].map(v=>fmtMi(v||0)).join(' · '))+row('On foot',fmtMi(P.dist.walk||0))+row('Top speed',Math.round(P.top)+' mph');
    h+=`<div class="pgSec">Safe driver</div><div class="setRow"><span>Score<small>Drops for red lights, stop signs, speeding and hitting buildings; clean miles earn it back</small></span><b class="pgScore" style="color:${col}">${sc}</b></div>`;
    h+=row('Clean streak',fmtMi(s.streak),'Best '+fmtMi(s.best))+row('Red lights · Stop signs',s.red+' · '+s.stop)+row('Buildings hit · Speeding',s.crash+' · '+fmtT(s.speed));
    if(s.tickets||s.escapes) h+=row('Police: tickets · escapes',s.tickets+' · '+s.escapes);
    h+='<div class="pgSec">Explorer</div>'+row('Streets driven',Object.keys(P.streets).length,near.total?'Around here: '+near.done+' of '+near.total:'')
      +row('Landmarks visited',spots.length,'Water towers: '+tw+(towers.length?' of '+towers.length+' in this area':''));
    const recent=spots.sort((a,b)=>b.t-a.t).slice(0,5);
    if(recent.length) h+='<div class="pgList">'+recent.map(q=>'<div>📍 '+esc(q.n)+(q.c?' <i>'+esc(q.c)+'</i>':'')+'</div>').join('')+'</div>';
    h+='<div class="pgFoot"><button id="pgReset">Reset progress</button></div>';
  } else if(tab==='play'){
    h+='<div class="pgNote">The open world is always the default. Challenges only start when you tap one here.</div>';
    for(const c of CH){ if(c.kind==='toggle'){ h+=`<div class="setRow"><span>${c.title}<small>${c.desc}</small></span><button class="switch${c.get()?' on':''}" data-ch="${c.id}"></button></div>`; continue; }
      const why=c.available?c.available():true; const ok=why===true;
      h+=`<div class="setRow"><span>${c.title}<small>${ok?c.desc:why}</small></span><button class="pgGo" data-ch="${c.id}"${ok?'':' disabled'}>${c.active&&c.active()?'Stop':'Start'}</button></div>`; }
  } else {
    const tr=Object.values(P.trials).sort((a,b)=>b.t-a.t);
    h+='<div class="pgSec">Time trials</div>'+(tr.length?tr.map(r=>row(esc(r.name),fmtLap(r.best),esc(r.cond)+' · '+r.runs+(r.runs===1?' run':' runs'))).join(''):'<div class="pgNote">No time trials yet. Start one from Challenges.</div>');
    h+='<div class="pgSec">Glider</div>'+row('Thermal climb to 2,000 ft',P.glide.climb!=null?fmtLap(P.glide.climb):'—')+row('Precision landing',P.glide.land!=null?Math.round(P.glide.land*3.281)+' ft from the target':'—');
  }
  body.innerHTML=h;
  const r=document.getElementById('pgReset'); if(r) r.onclick=e=>{ e.stopPropagation(); if(confirm('Reset all progress, records and stats on this device?')){ const b=blank(); b.pop=P.pop; b.police=P.police; Object.keys(P).forEach(k=>delete P[k]); Object.assign(P,b); session=0; save(true); render(); } };
  for(const b of body.querySelectorAll('[data-ch]')) b.onclick=e=>{ e.stopPropagation(); const c=CH.find(q=>q.id===b.dataset.ch); if(!c) return;
    if(c.kind==='toggle'){ c.set(!c.get()); render(); return; }
    if(c.active&&c.active()){ c.stop(); render(); return; }
    close(); c.start(); };
}
function fmtLap(s){ const m=Math.floor(s/60), r=s-m*60; return m+':'+(r<10?'0':'')+r.toFixed(1); }
function open(){ panel.classList.add('on'); btn.classList.add('on'); render(); }
function close(){ panel.classList.remove('on'); btn.classList.remove('on'); }
btn.addEventListener('click',e=>{ e.stopPropagation(); panel.classList.contains('on')?close():open(); });
document.getElementById('progX').addEventListener('click',e=>{ e.stopPropagation(); close(); });
for(const b of panel.querySelectorAll('.pgTabs button')) b.addEventListener('click',e=>{ e.stopPropagation(); tab=b.dataset.t; render(); });
for(const t of ['pointerdown','click']) panel.addEventListener(t,e=>e.stopPropagation());
mapEl.addEventListener('pointerdown',()=>{ if(panel.classList.contains('on')) close(); });
onTick(1000,function progRefresh(){ if(panel.classList.contains('on')&&tab==='stats') render(); });

// ⚙️ Settings: pop-ups on/off
const popBtn=document.getElementById('popBtn');
if(popBtn){ popBtn.classList.toggle('on',P.pop); popBtn.addEventListener('click',e=>{ e.stopPropagation(); P.pop=!P.pop; popBtn.classList.toggle('on',P.pop); save(true); }); }

// small status chip for a running challenge or a police chase (text, optional ✕ action)
const chipEl=document.getElementById('chal'), chipTxt=document.getElementById('chalTxt'), chipX=document.getElementById('chalX'); let chipCancel=null;
function chip(text,onCancel){ if(text==null){ chipEl.classList.remove('on'); chipCancel=null; return; }
  if(chipTxt.textContent!==text) chipTxt.textContent=text; chipEl.classList.add('on'); chipCancel=onCancel||null; chipX.style.display=onCancel?'':'none'; }
chipX.addEventListener('click',e=>{ e.stopPropagation(); if(chipCancel) chipCancel(); });

YD.PROG={P,save,on,emit,pop,chip,addChallenge,challenges:CH,lightState,conditions,fmtLap,render:()=>render()};
})();
