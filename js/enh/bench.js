/* 🏁 Benchmark (owner 2026-11-25: "should we benchmark?" before the big graphics work). A fixed test drive that
   measures how smoothly this device runs the game, so every later graphics change can be compared on the same route.

   ⚙️ Settings → Benchmark:
   - "Yorkville" reloads the game at a fixed start (Heartland Dr houses) with the clock fixed at 1 pm and clear
     weather (?hour=13&wx=0), so every device drives exactly the same streets in the same light.
   - "Here" drives from where the car is now, in the current time and weather.
   The drive: wait for the map, roads and buildings to load, park 6 s, then drive the same route twice at 25 mph on the
   speedo, first with 3D terrain off, then with it on (skipped on Graphics Low, which keeps terrain off: game.js POWER = Low). The
   route is built from the road network itself (js/enh/traffic.js graph): from the nearest road, mostly straight on at
   intersections with a fixed pattern of turns, never the same road twice, about 2 km. The car is placed on the road
   centre line each frame (no steering, collisions or physics), so the work is the same on every machine.

   It records per phase: frames drawn per second, frame times (median / 95% / 99% / worst), stutters (> 50 ms) and
   freezes (> 100 ms), game code time per frame, map draw time, draw calls and triangles for the map and for the
   three.js car layer, and the slowest map layers. Plus the device: graphics card, screen, graphics level.
   Auto graphics doesn't change level during the run. The result card has Copy (paste it to Claude) and keeps the
   last 8 runs on this device (localStorage ydBenchHist).

   Also: ?bench=1 in the URL starts a "Here" run on load; ?bench=std starts the Yorkville run. */
(()=>{
'use strict';
const {safe,onReady}=YD;
const STD={name:'Benchmark start: Heartland Dr, Yorkville',lat:41.6489,lng:-88.4430};
const MPH=25, LEN=2100, SETTLE=6000, MAXWAIT=60000;
const B={on:false,phase:'',d:0,pts:null,cum:null,len:0,acc:null,res:[],t0:0,el:null,hook:null,where:'',restore:null};

/* ---------- route from the road graph ---------- */
function rng(seed){ let s=seed>>>0; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
function buildRoute(){
  const T=window.TRAFFIC&&TRAFFIC.state; if(!T||!T.nodes||!T.segs||T.segs.length<40) return null;
  const x0=S.lng*MLNG, y0=S.lat*MLAT; let n=null, bd=1e9;
  for(const k of T.nodes){ if(!k.out.length) continue; const d=Math.hypot(k.x-x0,k.y-y0); if(d<bd){ bd=d; n=k; } }
  if(!n||bd>150) return null;
  const R=rng(20261125), used=new Set(), pts=[[n.x,n.y]]; let len=0, inc=null, turns=0, straight=0, gap=300+R()*200;
  const ang=(s)=>Math.atan2(s.ux,s.uy);
  for(let guard=0;guard<4000&&len<LEN;guard++){
    let c=n.out.filter(s=>!used.has(s)&&s.cls!=='motorway'&&!(inc&&s.b===inc.a));
    if(!c.length) c=n.out.filter(s=>!used.has(s));
    if(!c.length) c=n.out.slice();                                  /* dead end: turn round */
    if(!c.length) break;
    let pick;
    if(!inc||c.length===1) pick=c[0];
    else { const h=ang(inc), turn=s=>Math.abs(((ang(s)-h+3*Math.PI)%(2*Math.PI))-Math.PI);
      c.sort((a,b)=>turn(a)-turn(b));
      const corner=straight>=gap&&c.length>1&&turn(c[1])>.6; if(corner){ turns++; straight=0; gap=300+R()*200; }   /* a real side road, not a bend */
      pick=corner?c[1+Math.floor(R()*(c.length-1))]:c[0]; }
    straight+=pick.len; used.add(pick); const rev=pick.b.out.find(s=>s.b===pick.a); if(rev) used.add(rev);
    pts.push([pick.b.x,pick.b.y]); len+=pick.len; inc=pick; n=pick.b; }
  if(len<600) return null;
  const cum=[0]; for(let i=1;i<pts.length;i++) cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  return {pts,cum,len,turns};
}
function at(d){ const P=B.pts, C=B.cum; d=Math.max(0,Math.min(B.len,d)); let i=1; while(i<C.length-1&&C[i]<d) i++;
  const t=(d-C[i-1])/((C[i]-C[i-1])||1); return [P[i-1][0]+(P[i][0]-P[i-1][0])*t, P[i-1][1]+(P[i][1]-P[i-1][1])*t]; }
function place(d){ const p=at(d), a=at(d-10), b=at(d+10);
  S.lng=p[0]/MLNG; S.lat=p[1]/MLAT; S.hdg=(Math.atan2(b[0]-a[0],b[1]-a[1])*180/Math.PI+360)%360; }

/* ---------- measuring ---------- */
function freshAcc(){ return {secs:{},n:0,ran:0,iv:[],cost:0,costMax:0,map:0,mapN:0,gl:0,tri:0,glN:0,three:0,threeTri:0,threeN:0,layers:{},t0:performance.now(),last:0}; }
function wrap(){
  if(B.restore) return; const undo=[];
  const q=window.QUAL; if(q){ const f=q.frame; q.frame=function(now,ran,cost){ f(now,ran,cost); if(B.acc&&B.phase.startsWith('run')) safe('bench frame',()=>sample(now,ran,cost)); }; undo.push(()=>{ q.frame=f; }); }
  const r=map._render; if(typeof r==='function'){ map._render=function(){ const t=performance.now(); try{ return r.apply(this,arguments); } finally{ const A=B.acc; if(A&&B.phase.startsWith('run')){ A.map+=performance.now()-t; A.mapN++; } } }; undo.push(()=>{ map._render=r; }); }
  const P=map.painter, gl=P&&P.context&&P.context.gl;
  if(gl){ const de=gl.drawElements, da=gl.drawArrays;
    gl.drawElements=function(m,c){ const A=B.acc; if(A&&B.phase.startsWith('run')){ A.gl++; if(m===gl.TRIANGLES) A.tri+=c/3; } return de.apply(this,arguments); };
    gl.drawArrays=function(m,f,c){ const A=B.acc; if(A&&B.phase.startsWith('run')){ A.gl++; if(m===gl.TRIANGLES) A.tri+=c/3; } return da.apply(this,arguments); };
    undo.push(()=>{ gl.drawElements=de; gl.drawArrays=da; }); }
  if(P&&typeof P.renderLayer==='function'){ const rl=P.renderLayer;
    P.renderLayer=function(){ const A=B.acc; if(!A||!B.phase.startsWith('run')) return rl.apply(this,arguments);
      const L=[...arguments].find(a=>a&&typeof a.id==='string'&&typeof a.type==='string'), t=performance.now();
      try{ return rl.apply(this,arguments); } finally{ if(L){ A.layers[L.id]=(A.layers[L.id]||0)+performance.now()-t; } } };
    undo.push(()=>{ P.renderLayer=rl; }); }
  /* what makes the slow frames: each piece of a frame (and every background job) is timed; the report lists the
     ones that ever took over 15 ms, with their worst time and how often */
  const timeIt=(name,o,k)=>{ const f=o&&o[k]; if(typeof f!=='function'||f.__bench) return;
    const w=function(){ const A=B.acc; if(!A||!B.phase.startsWith('run')) return f.apply(this,arguments); const t=performance.now();
      try{ return f.apply(this,arguments); } finally{ const d=performance.now()-t, e=A.secs[name]||(A.secs[name]={max:0,n15:0,sum:0}); e.sum+=d; if(d>e.max) e.max=d; if(d>15) e.n15++; } };
    w.__bench=1; o[k]=w; undo.push(()=>{ o[k]=f; }); };
  for(const k of ['buildDecor','rebuildLandCache','updateHouseFilter','updatePlace','updateCompass','updateRoadX','nearRoadGeo','updateFx','landHere','applyHides']) timeIt(k,window,k);
  timeIt('three.js render',renderer,'render'); timeIt('camera move',map,'jumpTo'); timeIt('traffic',window.TRAFFIC,'frame');
  if(window.COCKPIT) timeIt('cockpit',COCKPIT,'render');
  FRAME_HOOKS.forEach((f,i)=>{ if(f!==hook) timeIt('frame hook '+(f.name||i),FRAME_HOOKS,i); });
  for(const t of YD.ticks||[]) timeIt('job '+(t.fn.name||'?'),t,'fn');
  B.restore=()=>{ for(const u of undo) try{ u(); }catch(e){} B.restore=null; };
}
function sample(now,ran,cost){ const A=B.acc; A.n++;
  if(!ran) return; A.ran++;
  if(A.last){ const dt=now-A.last; if(dt>0&&dt<5000) A.iv.push(dt); } A.last=now;
  A.cost+=cost; if(cost>A.costMax) A.costMax=cost;
  const I=renderer.info&&renderer.info.render; if(I&&I.frame!==A.tf){ A.tf=I.frame; A.three+=I.calls; A.threeTri+=I.triangles; A.threeN++; } }
function pct(a,p){ if(!a.length) return 0; const s=[...a].sort((x,y)=>x-y); return s[Math.min(s.length-1,Math.floor(p*s.length))]; }
function summarise(name,A){ const sec=(performance.now()-A.t0)/1000, f=A.mapN||1;
  const top=Object.entries(A.layers).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>k+' '+(v/f).toFixed(2));
  return {name,sec:+sec.toFixed(1),fps:+(A.ran/sec).toFixed(1),p50:+pct(A.iv,.5).toFixed(1),p95:+pct(A.iv,.95).toFixed(1),p99:+pct(A.iv,.99).toFixed(1),
    worst:+Math.max(0,...A.iv).toFixed(0),stut:A.iv.filter(v=>v>50).length,frz:A.iv.filter(v=>v>100).length,
    game:+(A.ran?A.cost/A.ran:0).toFixed(1),gameMax:+A.costMax.toFixed(0),map:+(A.mapN?A.map/A.mapN:0).toFixed(1),
    spikes:Object.entries(A.secs).filter(([k,v])=>v.max>15).sort((a,b)=>b[1].max-a[1].max).slice(0,10).map(([k,v])=>k+' '+v.max.toFixed(0)+' ms'+(v.n15>1?' ('+v.n15+'x)':'')),
    draws:Math.round(A.gl/f),tris:Math.round(A.tri/f),three:Math.round(A.threeN?A.three/A.threeN:0),threeTri:Math.round(A.threeN?A.threeTri/A.threeN:0),top}; }

/* ---------- the run ---------- */
function gpu(){ try{ const gl=map.painter.context.gl, x=gl.getExtension('WEBGL_debug_renderer_info'); return x?gl.getParameter(x.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER); }catch(e){ return '?'; } }
function device(){ const c=map.getCanvas(), Q=window.QUAL&&QUAL.state;
  return {when:new Date().toISOString().slice(0,16).replace('T',' '),where:B.where,gpu:gpu(),ua:navigator.userAgent.replace(/\s*\([^)]*\)\s*/,' ').slice(0,120),
    os:(navigator.userAgentData&&navigator.userAgentData.platform)||navigator.platform||'',cores:navigator.hardwareConcurrency||0,mem:navigator.deviceMemory||0,
    screen:innerWidth+'x'+innerHeight+' @'+(devicePixelRatio||1),canvas:c.width+'x'+c.height,
    gfx:['Low','Medium','High'][QL]+(QMODE==='auto'?' (Auto)':''),sharp:Q?['100%','85%','72%'][Q.shown||0]:'?',cap30:CAP30(),saver:!!POWER,
    traffic:!!(window.TRAFFIC&&TRAFFIC.state.on),view:window.COCKPIT&&COCKPIT.on?'cockpit':'chase',route:Math.round(B.len)+' m, '+B.turns+' turns',build:(document.querySelector('script[src*="game.js"]')||{}).src?.split('?v=')[1]||''}; }

function ui(html){ if(!B.el){ B.el=document.createElement('div'); B.el.id='benchCard';
    B.el.style.cssText='position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 56px);transform:translateX(-50%);z-index:60;max-width:min(560px,94vw);max-height:78vh;overflow:auto;background:rgba(2,6,23,.9);color:#e2e8f0;border-radius:12px;padding:10px 14px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.4)';
    B.el.addEventListener('click',e=>{ e.stopPropagation(); const b=e.target.closest('button[data-b]'); if(!b) return;
      if(b.dataset.b==='stop') stop('Benchmark stopped'); else if(b.dataset.b==='close'){ B.el.remove(); B.el=null; } else if(b.dataset.b==='copy') copy(); });
    document.body.appendChild(B.el); }
  B.el.innerHTML=html; }
const BTN='style="margin:8px 8px 0 0;padding:6px 12px;border-radius:8px;border:0;background:#334155;color:#fff;font-weight:600;font-size:13px"';
function status(msg){ ui('<b>🏁 Benchmark</b> · '+msg+'<br><small style="opacity:.75">Hands off: the car drives itself. Phone: keep the screen on.</small><br><button data-b="stop" '+BTN+'>Stop</button>'); }

let hookAdded=false;
function hook(dt){ if(!B.on) return false;
  if(B.phase.startsWith('run')){ B.d+=MPH/2.237*SPEEDUP*dt; S.v=MPH/2.237; place(B.d); if(B.d>=B.len) next(); }
  else { S.v=0; if(B.pts) place(0); }
  S.steer=0; dirty=true; return true; }

function terr(on){ setTerrainMode(on?(window.COCKPIT&&COCKPIT.on?'all':'chase'):'off'); }
let prevTerr=null, prevGrace=0;
function next(){
  const A=B.acc; if(A&&B.phase.startsWith('run')) B.res.push(summarise(B.phase==='run1'?'Terrain off':'Terrain on',A));
  if(B.phase==='run1'&&!POWER){ B.phase='settle2'; B.d=0; terr(true); status('Terrain on: getting ready…'); setTimeout(()=>{ if(B.on&&B.phase==='settle2'){ B.acc=freshAcc(); B.phase='run2'; status('Driving with terrain on…'); } },SETTLE+2000); return; }
  finish(); }
async function begin(where){
  if(B.on) return; if(mode!=='car'){ toast('🏁 Get in the car first (the benchmark drives the car)',3500); return; }
  if(window.AUTO&&AUTO.on) AUTO.takeover();
  B.on=true; B.res=[]; B.where=where; B.phase='wait'; B.pts=null; wrap();
  if(!hookAdded){ FRAME_HOOKS.push(hook); hookAdded=true; }
  const Q=window.QUAL&&QUAL.state; if(Q){ prevGrace=Q.graceUntil; Q.graceUntil=performance.now()+1e9; }
  prevTerr=TERRMODE; terr(false);
  status('Loading the map and roads…');
  const t0=performance.now();
  while(B.on){ await new Promise(r=>setTimeout(r,1000));
    const T=window.TRAFFIC&&TRAFFIC.state;
    if(T&&!T.on&&styleReady&&TRAFFIC.buildGraph) TRAFFIC.buildGraph();       /* traffic off: its road graph isn't kept up, so build it here */
    if(styleReady&&(map.loaded()||performance.now()-t0>25000)&&performance.now()-t0>8000){ const r=buildRoute(); if(r){ Object.assign(B,r); break; } }
    if(performance.now()-t0>MAXWAIT){ stop('🏁 Benchmark: no roads loaded here (turn Traffic on, or try the Yorkville run)'); return; } }
  if(!B.on) return;
  B.phase='settle1'; place(0); status('Route ready ('+Math.round(B.len)+' m). Parked for a moment…');
  setTimeout(()=>{ if(B.on&&B.phase==='settle1'){ B.acc=freshAcc(); B.phase='run1'; status('Driving with terrain off…'); } },SETTLE);
}
function cleanup(){ B.on=false; B.phase=''; B.acc=null; S.v=0; if(prevTerr!=null) setTerrainMode(prevTerr); prevTerr=null;
  const Q=window.QUAL&&QUAL.state; if(Q) Q.graceUntil=performance.now()+5000; if(B.restore) B.restore(); }
function stop(msg){ cleanup(); if(B.el){ B.el.remove(); B.el=null; } if(msg) toast(msg,3500); }

function text(r){ const D=r.dev, L=['Yorkville Driver benchmark · '+D.when+' · build '+D.build,
    'Where: '+D.where+' · route '+D.route,
    'GPU: '+D.gpu, 'Device: '+D.os+' · '+D.cores+' cores'+(D.mem?' · '+D.mem+' GB':'')+' · screen '+D.screen+' · map canvas '+D.canvas,
    'Graphics: '+D.gfx+' · sharpness '+D.sharp+(D.cap30?' · 30 fps cap':'')+' · traffic '+(D.traffic?'on':'off')+' · '+D.view+' view',
    'Browser: '+D.ua];
  for(const p of r.phases) L.push('', '['+p.name+'] '+p.fps+' fps · frame ms median '+p.p50+' / 95% '+p.p95+' / 99% '+p.p99+' / worst '+p.worst,
    '  stutters >50ms: '+p.stut+' · freezes >100ms: '+p.frz+' · game code '+p.game+' ms (max '+p.gameMax+') · map draw '+p.map+' ms',
    '  map: '+p.draws+' draw calls, '+Math.round(p.tris/1000)+'k triangles · car layer: '+p.three+' calls, '+Math.round(p.threeTri/1000)+'k triangles',
    '  slowest map layers (ms/frame): '+p.top.join(', '),
    '  slow pieces (>15 ms): '+(p.spikes.length?p.spikes.join(', '):'none'));
  if(r.dev.saver) L.push('','(Graphics Low keeps terrain off, so there is no terrain-on pass. Pick Medium or High in ⚙️ Graphics to test terrain.)');
  return L.join('\n'); }
function grade(p){ return p.fps>=50&&p.stut<5?'🟢 smooth':p.fps>=28&&p.stut<20?'🟡 playable':'🔴 struggling'; }
let lastText='';
function finish(){ const r={dev:device(),phases:B.res}; cleanup();
  lastText=text(r);
  try{ const h=JSON.parse(localStorage.getItem('ydBenchHist')||'[]'); h.unshift({when:r.dev.when,gpu:r.dev.gpu,gfx:r.dev.gfx,ph:r.phases.map(p=>p.name+' '+p.fps+' fps, '+p.stut+' stutters')}); localStorage.setItem('ydBenchHist',JSON.stringify(h.slice(0,8))); }catch(e){}
  let hist=''; try{ const h=JSON.parse(localStorage.getItem('ydBenchHist')||'[]').slice(1); if(h.length) hist='<details style="margin-top:6px"><summary>Earlier runs on this device</summary><small>'+h.map(x=>esc(x.when+' · '+x.gfx+' · '+x.ph.join(' · '))).join('<br>')+'</small></details>'; }catch(e){}
  ui('<b>🏁 Benchmark done</b><br>'+r.phases.map(p=>'<b>'+p.name+':</b> '+grade(p)+' · '+p.fps+' fps · '+p.stut+' stutters · worst '+p.worst+' ms').join('<br>')
    +'<pre style="white-space:pre-wrap;font:11px/1.35 ui-monospace,Menlo,monospace;background:#0f172a;padding:8px;border-radius:8px;margin:8px 0 0;user-select:text">'+esc(lastText)+'</pre>'
    +hist+'<button data-b="copy" '+BTN+'>Copy results</button><button data-b="close" '+BTN+'>Close</button>');
  if(B.where.startsWith('Yorkville')) toast('🏁 Time and weather were fixed for the test; they return to normal next time the game starts',5000); }
function esc(s){ return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function copy(){ const done=()=>toast('📋 Copied: paste it to Claude',2500);
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(lastText).then(done,fallback); else fallback();
  function fallback(){ const t=document.createElement('textarea'); t.value=lastText; document.body.appendChild(t); t.select(); try{ document.execCommand('copy'); done(); }catch(e){ toast('Select the text and copy it',2500); } t.remove(); } }

/* ---------- starting ---------- */
function stdRun(){ try{ if(window.SAVEPOS) SAVEPOS.save(true); localStorage.setItem('ydTp',JSON.stringify(STD)); localStorage.setItem('ydStartOnce','tp'); }catch(e){}
  location.href=location.pathname+'?bench=std&hour=13&wx=0'; }
function bind(){ const a=document.getElementById('benchStd'), h=document.getElementById('benchHere');
  const go=(f)=>e=>{ e.stopPropagation(); const x=document.getElementById('setX'); if(x) x.click(); f(); };
  if(a) a.addEventListener('click',go(stdRun)); if(h) h.addEventListener('click',go(()=>begin('Here: '+S.lat.toFixed(4)+','+S.lng.toFixed(4)))); }
bind();
onReady(function bench(){ const m=(location.search.match(/[?&]bench=(\w+)/)||[])[1]; if(!m) return;
  try{ history.replaceState(null,'',location.pathname); }catch(e){}         // a later reload starts normally (time/weather were read at load)
  setTimeout(()=>begin(m==='std'?'Yorkville (Heartland Dr), 1 pm, clear':'Here: '+S.lat.toFixed(4)+','+S.lng.toFixed(4)),1500); });
window.BENCH={begin,stop,state:B,route:buildRoute,text:()=>lastText};
})();
