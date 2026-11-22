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
// the warp: streaks from the middle, faster and longer as k rises 0 → 1, with a white bloom that covers the screen at the end
function warp(dur,out,done){ const W=cv.width=innerWidth*Math.min(2,devicePixelRatio||1), H=cv.height=innerHeight*Math.min(2,devicePixelRatio||1), x=cv.getContext('2d');
  const N=180, st=[...Array(N)].map(()=>({a:Math.random()*Math.PI*2,r:Math.random(),w:.6+Math.random()*1.8,h:190+Math.random()*80}));
  fx.classList.add('on'); const t0=performance.now(); cancelAnimationFrame(anim);
  const step=now=>{ let k=Math.min(1,(now-t0)/dur); const e=out?k*k:1-(1-k)*(1-k), q=out?e:1-e;   // q: how far into the warp (1 = all white)
    x.clearRect(0,0,W,H); const cx=W/2, cy=H/2, R=Math.hypot(cx,cy);
    x.fillStyle=`rgba(8,10,30,${Math.min(.85,q*1.4)})`; x.fillRect(0,0,W,H);
    for(const s of st){ const r0=R*(s.r*(1-q*.85)+q*.15)*(.15+.85*s.r), len=R*(.04+q*.9)*(.4+s.r);
      const c=Math.cos(s.a), si=Math.sin(s.a), g=x.createLinearGradient(cx+c*r0,cy+si*r0,cx+c*(r0+len),cy+si*(r0+len));
      g.addColorStop(0,`hsla(${s.h},100%,80%,0)`); g.addColorStop(1,`hsla(${s.h},100%,${70+q*25}%,${.25+.75*q})`);
      x.strokeStyle=g; x.lineWidth=s.w*(1+q*3)*(W/1000); x.beginPath(); x.moveTo(cx+c*r0,cy+si*r0); x.lineTo(cx+c*(r0+len),cy+si*(r0+len)); x.stroke(); }
    const b=x.createRadialGradient(cx,cy,0,cx,cy,R*(.1+q*1.1)); b.addColorStop(0,`rgba(255,255,255,${Math.min(1,q*1.2)})`); b.addColorStop(.6,`rgba(190,220,255,${q*.8})`); b.addColorStop(1,'rgba(150,190,255,0)');
    x.fillStyle=b; x.fillRect(0,0,W,H); if(q>.92){ x.fillStyle=`rgba(255,255,255,${(q-.92)/.08})`; x.fillRect(0,0,W,H); }
    if(k<1) anim=requestAnimationFrame(step); else if(done) done(); };
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
async function interesting(lat,lng,r){   // something with a Wikipedia entry within r degrees, else any named attraction
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
  warp(1300,true,()=>setTimeout(()=>location.reload(),120)); }
YD.teleport=teleport;

// arriving: start in the white flash and come out of it once the map is drawn there and the car is on its road
if(typeof START!=='undefined'&&START.tp){ fx.classList.add('on'); const x=cv.getContext('2d'); cv.width=innerWidth; cv.height=innerHeight; x.fillStyle='#fff'; x.fillRect(0,0,cv.width,cv.height);
  const t0=Date.now(), wait=()=>{ const ready=typeof styleReady!=='undefined'&&styleReady&&map.loaded&&map.loaded();
    if((ready&&Date.now()-t0>1200)||Date.now()-t0>8000){ whoosh(false); warp(1600,false,()=>fx.classList.remove('on','dim')); } else setTimeout(wait,200); };
  setTimeout(wait,300); }
})();
