/* Challenges — nothing here runs unless you start it from the 🏆 panel (Challenges tab). The open world is the default.
   ⏱ Time trials: race to a nearby landmark or to your current 🔍 destination (the route is set for you). A 3-2-1
      countdown, a timer chip, and best times kept separately for day / night / rain / snow. Using autopilot during a
      run is allowed but the time isn't recorded.
   🪂 Thermal climb: take off and climb to 2,000 ft as fast as you can.
   🪂 Precision landing: glide to a landmark (flag + compass marker) and land as close to it as you can.
   🚓 Police patrols: a switch (off by default); the chase itself is in js/enh/police.js. */
(()=>{
'use strict';
const {onTick}=YD, PR=YD.PROG, P=PR.P;
const C={cur:null};
const driving=()=>mode==='car'||mode==='tractor';
const busy=()=>C.cur?'Finish or stop the current challenge first':null;

// landmarks around you (POI pins and water towers the game has loaded), between minD and maxD world metres away
function landmarks(minD,maxD){
  const x=S.lng*MLNG, y=S.lat*MLAT, seen=new Set(), out=[];
  for(const q of [...pois,...towers]){ const d=Math.hypot(q.lng*MLNG-x,q.lat*MLAT-y); if(d<minD||d>maxD||seen.has(q.name)) continue;
    seen.add(q.name); out.push({name:q.name,lng:q.lng,lat:q.lat,d,key:q.name+'@'+q.lat.toFixed(3)+','+q.lng.toFixed(3)}); }
  return out;
}
const pick=a=>a[Math.floor(Math.random()*a.length)];
const now=()=>performance.now();

/* ---------- time trials ---------- */
function startTrial(target){
  if(!driving()){ toast('Time trials are for the SUV or tractor',2200); return; }
  YD.clearRoute(); YD.NAV.dest=[target.lng,target.lat]; YD.setDest(YD.NAV.dest); YD.requestRoute(false);
  C.cur={type:'trial',target,t0:null,assisted:false,cond:PR.conditions()};
  let n=3; PR.chip('⏱ Race to '+target.name+' · get ready',cancel);
  const count=()=>{ if(!C.cur||C.cur.type!=='trial') return;
    if(n>0){ toast(String(n),800); n--; setTimeout(count,1000); }
    else { toast('GO!',900); C.cur.t0=now(); } };
  setTimeout(count,600);
}
function finishTrial(){
  const c=C.cur, t=(now()-c.t0)/1000, key=c.target.key+'|'+c.cond; C.cur=null; PR.chip(null);
  if(c.assisted){ toast('🏁 '+PR.fmtLap(t)+' · autopilot was used, so this run isn’t recorded',3500); return; }
  const r=P.trials[key]||(P.trials[key]={name:'To '+c.target.name,cond:c.cond,best:null,runs:0,t:0});
  r.runs++; r.t=Date.now(); const rec=r.best==null||t<r.best, prev=r.best; if(rec) r.best=t; PR.save(true);
  toast(rec?(prev==null?'🏁 '+PR.fmtLap(t)+' · first time on this run':'🏁 '+PR.fmtLap(t)+' · new record! (was '+PR.fmtLap(prev)+')'):'🏁 '+PR.fmtLap(t)+' · best is '+PR.fmtLap(r.best),4000);
}

/* ---------- glider challenges ---------- */
const CLIMB_FT=2000;
function startClimb(){
  if(mode!=='glider') toggleGlider();
  C.cur={type:'climb',t0:now()}; PR.chip('🪂 Climb to 2,000 ft',cancel);
  toast('Climb to 2,000 ft: circle under the white clouds to ride thermals',3500);
}
function startLand(){
  const opts=landmarks(500,1600); if(!opts.length){ toast('No landmarks in gliding range here. Drive somewhere with more around',3000); return; }
  const target=pick(opts);
  YD.clearRoute(); YD.NAV.dest=[target.lng,target.lat]; YD.setDest(YD.NAV.dest);   // flag on the map + compass marker, no road route
  if(mode!=='glider') toggleGlider();
  C.cur={type:'land',target,t0:now()}; PR.chip('🪂 Land at '+target.name,cancel);
  toast('Glide to '+target.name+' (follow the blue dot on the compass), then tap 🪂 to land on it',4200);
}
function landed(){
  const c=C.cur; C.cur=null; PR.chip(null); YD.clearRoute();
  const d=meters(S.lat,S.lng,c.target.lat,c.target.lng)/GSPEED;        // game metres, like the speedometer
  const ft=Math.round(d*3.281), best=P.glide.land, rec=best==null||d<best; if(rec) P.glide.land=d; PR.save(true);
  toast((d<30?'🎯 Bullseye! ':'🪂 ')+ft+' ft from '+c.target.name+(rec&&best!=null?' · new best!':best!=null?' · best '+Math.round(best*3.281)+' ft':''),4200);
}

function cancel(){
  const c=C.cur; if(!c) return; C.cur=null; PR.chip(null);
  if(c.type==='trial'||c.type==='land') YD.clearRoute();
  toast('Challenge stopped',1600);
}

// progress of whatever is running
let lastMode=mode;
onTick(100,function challengeTick(){
  const c=C.cur, was=lastMode; lastMode=mode; if(!c) return;
  if(c.type==='trial'){
    if(mode==='glider'){ C.cur=null; PR.chip(null); YD.clearRoute(); toast('Time trial cancelled: you took off',2200); return; }
    if(window.AUTO&&AUTO.on) c.assisted=true;
    const d=meters(S.lat,S.lng,c.target.lat,c.target.lng);
    if(c.t0==null) return;
    const t=(now()-c.t0)/1000;
    PR.chip('⏱ '+PR.fmtLap(t)+' · '+YD.fmtDist(d)+' to '+c.target.name+(c.assisted?' · assisted':''),cancel);
    if(d<35) finishTrial();
  } else if(c.type==='climb'){
    if(mode!=='glider'){ if(G&&was==='glider'){ C.cur=null; PR.chip(null); toast('Landed before 2,000 ft. Try again from 🏆',2600); } return; }
    const ft=Math.round(G.alt*3.281), t=(now()-c.t0)/1000;
    PR.chip('🪂 '+ft.toLocaleString()+' / 2,000 ft · '+PR.fmtLap(t),cancel);
    if(ft>=CLIMB_FT){ C.cur=null; PR.chip(null); const best=P.glide.climb, rec=best==null||t<best; if(rec) P.glide.climb=t; PR.save(true);
      toast('🪂 2,000 ft in '+PR.fmtLap(t)+(rec&&best!=null?' · new record!':best!=null?' · best '+PR.fmtLap(best):''),4000); }
  } else if(c.type==='land'){
    if(mode!=='glider'&&was==='glider'){ landed(); return; }
    if(mode==='glider'){ const d=meters(S.lat,S.lng,c.target.lat,c.target.lng); PR.chip('🪂 '+c.target.name+' · '+YD.fmtDist(d)+' · '+Math.round(G.alt*3.281)+' ft',cancel); }
  }
});

/* ---------- entries in the 🏆 Challenges tab ---------- */
PR.addChallenge({id:'trialLandmark',title:'⏱ Time trial: nearby landmark',desc:'Race to a random landmark nearby, following the route. Best times are kept separately for day, night, rain and snow.',
  available:()=>busy()||(!driving()?'Get back in the SUV or tractor first':landmarks(700,3500).length?true:'Drive around a little so nearby landmarks load'),
  active:()=>C.cur&&C.cur.type==='trial', stop:cancel,
  start:()=>{ const o=landmarks(700,3500); if(o.length) startTrial(pick(o)); }});
PR.addChallenge({id:'trialDest',title:'⏱ Time trial: my destination',desc:'Race to the place you picked with 🔍.',
  available:()=>busy()||(!YD.NAV.dest?'Pick a destination with 🔍 first':!driving()?'Get back in the SUV or tractor first':true),
  active:()=>false, stop:cancel,
  start:()=>{ const d=YD.NAV.dest, last=YD.NAV.steps&&YD.NAV.steps.length?YD.NAV.steps[YD.NAV.steps.length-1]:null;
    const nm=(last&&last.name)||'your destination'; startTrial({name:nm,lng:d[0],lat:d[1],key:'dest@'+d[1].toFixed(3)+','+d[0].toFixed(3)}); }});
PR.addChallenge({id:'climb',title:'🪂 Thermal climb',desc:'Take off and climb to 2,000 ft as fast as you can.',
  available:()=>busy()||(mode==='boat'?'Get back on land first':true), active:()=>C.cur&&C.cur.type==='climb', stop:cancel, start:startClimb});
PR.addChallenge({id:'land',title:'🪂 Precision landing',desc:'Take off, glide to a landmark and land as close to it as you can.',
  available:()=>busy()||(mode==='boat'?'Get back on land first':true), active:()=>C.cur&&C.cur.type==='land', stop:cancel, start:startLand});
PR.addChallenge({id:'police',kind:'toggle',title:'🚓 Police patrols',desc:'Off by default. When on, speeding well over the limit or running a red light brings a squad car: stop to take a ticket, or lose it.',
  get:()=>P.police, set:v=>{ P.police=v; PR.save(true); if(!v&&YD.POLICE) YD.POLICE.end(true); toast(v?'🚓 Police patrols on':'Police patrols off',1800); }});

YD.CHAL=C;
})();
