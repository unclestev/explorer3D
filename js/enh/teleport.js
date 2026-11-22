/* ⚡ Teleport (owner 2026-11-21): the GPS search's ⚡ button sends you straight to a place instead of giving directions.
   - An address or a single place (a shop, a museum, a house): you land on the street in front of it.
   - A town, county, state, country or the like: you land in front of something interesting inside it — a museum,
     monument, attraction, castle, stadium… with a Wikipedia entry (OpenStreetMap, via Overpass), picked at random; in a
     big area first a random city or town (bigger places more likely), then something there. Nothing found: the centre.
   - The trip: a warp (light streaks rushing out, a white flash), the game reloads at the new spot (every cache — roads,
     buildings, signs, traffic, weather — starts fresh there), snaps the car onto the nearest road (js/enh/savepos.js)
     and you materialise out of the flash. A teleport doesn't count as distance driven, and your trail starts a new line. */
(()=>{
'use strict';
const fx=document.createElement('div'); fx.id='tpFx'; const cv=document.createElement('canvas'); fx.appendChild(cv);
const msg=document.createElement('div'); msg.className='tpMsg'; fx.appendChild(msg); document.body.appendChild(fx);
let anim=null;
/* the warp (owner 2026-11-22: "keep the teleporting visual until we are ready ... no bright white screen ... toned down"):
   light streaks rushing out of the middle over a deep blue-black, with a soft blue glow. Q runs 0 → 1 into the warp and
   back out; it holds at 1 for as long as the trip takes (the whole reload included), so there's never a blank screen */
const W={Q:0,Qt:0,rate:1,t0:0,st:null,onPeak:null,onOut:null};
function warpRun(){ if(anim) return; fx.classList.add('on'); W.t0=W.t0||performance.now(); let last=performance.now();
  if(!W.st) W.st=[...Array(170)].map(()=>({a:Math.random()*Math.PI*2,p:Math.random(),v:.25+Math.random()*.6,w:.6+Math.random()*1.6,h:195+Math.random()*70}));
  const step=now=>{ const dt=Math.min(.05,(now-last)/1000); last=now;
    W.Q+=Math.sign(W.Qt-W.Q)*Math.min(Math.abs(W.Qt-W.Q),dt*W.rate);
    const D=Math.min(2,devicePixelRatio||1), w=Math.round(innerWidth*D), h=Math.round(innerHeight*D); if(cv.width!==w||cv.height!==h){ cv.width=w; cv.height=h; }
    const x=cv.getContext('2d'), q=W.Q*W.Q*(3-2*W.Q), cx=w/2, cy=h/2, R=Math.hypot(cx,cy), sp=.15+q*1.6;
    x.clearRect(0,0,w,h); x.fillStyle=`rgba(6,9,28,${.9*q})`; x.fillRect(0,0,w,h);
    for(const s of W.st){ s.p=(s.p+dt*s.v*sp)%1; const r0=R*(.03+s.p*s.p*1.05), len=R*(.02+q*.28)*(.3+s.p);
      const c=Math.cos(s.a), si=Math.sin(s.a), g=x.createLinearGradient(cx+c*r0,cy+si*r0,cx+c*(r0+len),cy+si*(r0+len));
      g.addColorStop(0,`hsla(${s.h},90%,70%,0)`); g.addColorStop(1,`hsla(${s.h},90%,68%,${(.15+.55*q)*Math.min(1,s.p*3)})`);
      x.strokeStyle=g; x.lineWidth=s.w*(1+q*1.8)*D; x.beginPath(); x.moveTo(cx+c*r0,cy+si*r0); x.lineTo(cx+c*(r0+len),cy+si*(r0+len)); x.stroke(); }
    const b=x.createRadialGradient(cx,cy,0,cx,cy,R*(.12+q*.45)); b.addColorStop(0,`rgba(170,200,255,${.32*q})`); b.addColorStop(.5,`rgba(90,120,230,${.14*q})`); b.addColorStop(1,'rgba(40,60,160,0)');
    x.fillStyle=b; x.fillRect(0,0,w,h);
    if(W.Q>=.999&&W.Qt===1&&W.onPeak){ const f=W.onPeak; W.onPeak=null; f(); }
    if(W.Q<=.001&&W.Qt===0){ anim=null; fx.classList.remove('on','dim','msg'); x.clearRect(0,0,w,h); if(W.onOut){ const f=W.onOut; W.onOut=null; f(); } return; }
    anim=requestAnimationFrame(step); };
  anim=requestAnimationFrame(step); }
function whoosh(up){ const A=window.SOUND&&SOUND.state; if(!A||!A.ctx||!SOUND.on||A.ctx.state!=='running') return;
  try{ const c=A.ctx, t=c.currentTime, n=c.sampleRate*1.6|0, b=c.createBuffer(1,n,c.sampleRate), d=b.getChannelData(0); for(let i=0;i<n;i++) d[i]=Math.random()*2-1;
    const s=c.createBufferSource(); s.buffer=b; const f=c.createBiquadFilter(); f.type='bandpass'; f.Q.value=6; const g=c.createGain();
    f.frequency.setValueAtTime(up?300:2600,t); f.frequency.exponentialRampToValueAtTime(up?3200:250,t+1.4);
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.35,t+(up?1.1:.15)); g.gain.linearRampToValueAtTime(0,t+1.5);
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t); s.stop(t+1.6); }catch(e){} }

/* where to land */
// each Overpass question gets 18 s (the servers can be slow); past that we go with what we have
const ov=q=>Promise.race([ovFetch('[out:json][timeout:18];'+q),new Promise((_,no)=>setTimeout(()=>no(new Error('slow')),18000))]);
const bbStr=(s,w,n,e)=>`(${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)})`;
const tagName=t=>t&&(t['name:en']||t.name)||'';
// Wikipedia's map of articles first (fast): its landmarks within ~8 km, picked at random
async function wikiSpot(lat,lng){ const c=new AbortController(), to=setTimeout(()=>c.abort(),12000);
  try{ const j=await fetch('https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord='+lat.toFixed(5)+'|'+lng.toFixed(5)+'&gsradius=8000&gslimit=100&gsprop=type&format=json&origin=*',{signal:c.signal}).then(r=>r.json());
    const g=(j.query&&j.query.geosearch||[]).filter(x=>isFinite(x.lat)&&isFinite(x.lon)), L=g.filter(x=>x.type==='landmark'), P=L.length?L:g.filter(x=>!x.type||x.type==='null');
    if(!P.length) return null; const x=P[Math.floor(Math.random()*P.length)]; return {lat:x.lat,lng:x.lon,name:x.title}; }
  catch(e){ return null; } finally{ clearTimeout(to); } }
async function interesting(lat,lng,r){   // something with a Wikipedia entry within r degrees, else any named attraction (OpenStreetMap, slower)
  const w=await wikiSpot(lat,lng); if(w) return w;
  const bb=bbStr(lat-r,lng-r/Math.cos(lat*Math.PI/180)*.9,lat+r,lng+r/Math.cos(lat*Math.PI/180)*.9);
  const K=`nwr["tourism"~"^(attraction|museum|viewpoint|zoo|theme_park|gallery|aquarium)$"]`, H=`nwr["historic"~"^(monument|memorial|castle|fort|monastery|ruins|archaeological_site|palace)$"]`;
  for(const need of ['["wikidata"]','["name"]']){
    const j=await ov(`(${K}${need}${bb};${H}${need}${bb};nwr["leisure"~"^(park|stadium)$"]["wikidata"]${bb};nwr["building"~"^(cathedral|church|castle)$"]["wikidata"]${bb};);out center 120;`);
    const L=(j.elements||[]).map(e=>({lat:e.lat??(e.center&&e.center.lat),lng:e.lon??(e.center&&e.center.lon),name:tagName(e.tags)})).filter(o=>isFinite(o.lat)&&isFinite(o.lng)&&o.name);
    if(L.length) return L[Math.floor(Math.random()*L.length)]; }
  return null; }
async function spotIn(p){ const [s,n,w,e]=p.bbox, span=Math.max(n-s,(e-w)*Math.cos(((s+n)/2)*Math.PI/180));
  let c={lat:p.lat,lng:p.lng,name:p.name}, r=Math.min(.12,Math.max(.02,span/2));
  if(span>.6){ say('Picking a city in '+p.name+'…');
    try{ const B=bbStr(s,w,n,e), j=await ov(span>4?`node["place"="city"]${B};out 400;`:`(node["place"="city"]${B};node["place"="town"]${B};);out 400;`);   // exact tags: the fast index
      const C=(j.elements||[]).filter(x=>x.tags&&tagName(x.tags)).map(x=>({lat:x.lat,lng:x.lon,name:tagName(x.tags),wt:Math.sqrt(Math.max(5000,+String(x.tags.population||'').replace(/\D/g,'')||(x.tags.place==='city'?100000:10000)))}));
      if(C.length){ let t=Math.random()*C.reduce((a,b)=>a+b.wt,0); for(const x of C){ t-=x.wt; if(t<=0){ c=x; break; } } if(t>0) c=C[C.length-1]; r=.06; } }catch(e){ console.warn('teleport cities',e); } }
  say('Finding somewhere interesting in '+c.name+'…');
  try{ const o=await interesting(c.lat,c.lng,r); if(o) return {lat:o.lat,lng:o.lng,name:o.name+(c.name&&c.name!==p.name?' · '+c.name:'')+' · '+p.name,back:20}; }catch(e){ console.warn('teleport spots',e); }
  return {lat:c.lat,lng:c.lng,name:c.name===p.name?p.name:c.name+' · '+p.name,back:20}; }
function say(t){ msg.textContent=t; fx.classList.add('msg'); }

let busy=false;
async function teleport(p){
  if(busy) return; if(mode==='glider'){ toast('Land first (tap 🪂), then teleport',2600); return; }
  busy=true; fx.classList.add('on','dim'); msg.textContent=''; fx.classList.remove('msg');
  let to={lat:p.lat,lng:p.lng,name:p.name,back:6};                   // an address: right in front of it
  if(p.area&&p.bbox) to=await spotIn(p);
  fx.classList.remove('msg'); whoosh(true);
  try{ if(window.SAVEPOS) SAVEPOS.save(true); localStorage.setItem('ydTp',JSON.stringify(to)); localStorage.setItem('ydStartOnce','tp'); }catch(e){}
  if(window.SAVEPOS&&SAVEPOS.stop) SAVEPOS.stop();                  // don't let the old spot be saved over the trip
  W.Qt=1; W.rate=1/1.2; W.onPeak=()=>location.reload(); warpRun(); }
YD.teleport=teleport;

// arriving: already deep in the warp (picking up where the departure left off), and out of it once the map is drawn here
if(typeof START!=='undefined'&&START.tp){ W.Q=W.Qt=1; fx.classList.add('on'); warpRun();
  const t0=Date.now(), wait=()=>{ const ready=typeof styleReady!=='undefined'&&styleReady&&map.loaded&&map.loaded();
    if((ready&&Date.now()-t0>900)||Date.now()-t0>9000){ whoosh(false); W.rate=1/1.5; W.Qt=0; } else setTimeout(wait,200); };
  setTimeout(wait,300); }
})();
