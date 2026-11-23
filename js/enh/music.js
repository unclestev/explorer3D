/* Car music (owner 2026-11-22: "make me type a song on the lower screen and play from the car").
   Tap the centre screen in cockpit view, press M, or press L2 on the G29 to open / close Music.
   Songs tab: type a song or artist and pick a result. Searches use Apple's free iTunes Search API (no key, no account):
   every song there has a 30-second preview, which is what plays (explicit songs are left out). "My music" plays
   songs you pick from your own device, start to finish, one after another.
   Radio tab (owner 2026-11-22: "live streaming radio stations … for example 93.9 lite fm. searchable with saved presets"):
   live stations from Radio Browser (radio-browser.info), a free open directory — no key, no sign-in. Search by name;
   ☆ saves a station to your presets (kept on this device, localStorage ydRadioPresets, at most 12); ⏭ while a station
   plays moves to the next preset. Streams that are HLS-only (.m3u8) often won't play in a browser, so direct streams are
   listed first. What's playing shows along the bottom of the car's centre screen. Volume is remembered (ydMusicVol).
   Everything from the directory is shown as plain text (never as HTML), and only http(s) stream addresses are used. */
(()=>{
'use strict';
const css=document.createElement('style'); css.textContent=`
#musicPanel{position:absolute;top:var(--st);left:50%;transform:translateX(-50%);width:min(calc(100vw - 2*var(--gap)),460px);box-sizing:border-box;z-index:41;display:none;background:var(--panel-solid);border:1px solid var(--line);border-radius:14px;padding:10px;box-shadow:0 8px 24px rgba(0,0,0,.45);color:#fff;font:14px system-ui,Arial}
#musicPanel.on{display:block}
#musicPanel form{display:flex;gap:6px}
#musicPanel input[type=search]{flex:1;min-width:0;font:16px system-ui;padding:8px 10px;border-radius:9px;border:1px solid var(--line);background:rgba(255,255,255,.08);color:#fff}
#musicPanel button{font:600 14px system-ui;padding:8px 11px;border-radius:9px;border:1px solid var(--line);background:rgba(255,255,255,.1);color:#fff;cursor:pointer}
#musicPanel .tabs{display:flex;gap:6px;margin-bottom:8px}
#musicPanel .tabs button{flex:1}
#musicPanel .tabs button.on{background:#3d6fd6;border-color:#3d6fd6}
#musicPanel .row{display:flex;gap:6px;align-items:center;margin-top:8px}
#musicPanel .now{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.9}
#musicList,#radioList{max-height:min(40vh,320px);overflow-y:auto;margin-top:8px}
#musicPanel .it{display:flex;gap:9px;align-items:center;padding:6px;border-radius:9px;cursor:pointer}
#musicPanel .it:hover,#musicPanel .it.on{background:rgba(255,255,255,.1)}
#musicPanel .it img,#musicPanel .it .ph{width:40px;height:40px;border-radius:6px;flex:none;background:#223;object-fit:contain}
#musicPanel .it .ph{display:flex;align-items:center;justify-content:center;font-size:20px}
#musicPanel .t{min-width:0;flex:1}#musicPanel .t b,#musicPanel .t span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#musicPanel .t span{opacity:.65;font-size:12px}
#musicPanel .it .star{flex:none;padding:4px 9px;font-size:18px;background:none;border:none;color:#ffd24a}
#radioPresets{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
#radioPresets button{max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:6px 10px;font-weight:500}
#radioPresets button.on{background:#3d6fd6;border-color:#3d6fd6}
#musicPanel .hd{opacity:.6;font-size:12px;margin-top:8px}
#musicPanel .note{opacity:.55;font-size:11px;margin-top:6px}
#musicPanel input[type=range]{width:90px}`;
document.head.appendChild(css);
const panel=document.createElement('div'); panel.id='musicPanel';
panel.innerHTML=`<div class="tabs"><button type="button" id="tabSongs">🎵 Songs</button><button type="button" id="tabRadio">📻 Radio</button><button type="button" id="tabVideo">▶ Video</button><button type="button" id="musicX" aria-label="Close" style="flex:none">✕</button></div>
<div class="row" style="margin-top:0"><button type="button" id="musicPlay">⏯</button><button type="button" id="musicNext">⏭</button><button type="button" id="musicStop">⏹</button><span class="now" id="musicNow">Nothing playing</span><input type="range" id="musicVol" min="0" max="1" step="0.05" aria-label="Volume"></div>
<div id="paneSongs"><form id="musicForm" style="margin-top:8px"><input id="musicQ" type="search" placeholder="Type a song or artist" autocomplete="off" enterkeyhint="search"><button type="submit">Search</button></form>
<div class="row"><button type="button" id="musicMine">📁 My music…</button><input type="file" id="musicFiles" accept="audio/*" multiple hidden></div>
<div id="musicList"></div><div class="note">Search results play Apple's 30-second previews. "My music" plays whole songs from your device.</div></div>
<div id="paneRadio" style="display:none"><form id="radioForm" style="margin-top:8px"><input id="radioQ" type="search" placeholder="Station name, e.g. 93.9 Lite FM" autocomplete="off" enterkeyhint="search"><button type="submit">Search</button></form>
<div class="hd">Presets</div><div id="radioPresets"></div>
<div id="radioList"></div><div class="note">Live stations from the free Radio Browser directory. ☆ saves a station to your presets.</div></div>
<div id="paneVideo" style="display:none"></div>`;
document.body.appendChild(panel);
const $=id=>document.getElementById(id), input=$('musicQ'), list=$('musicList'), rInput=$('radioQ'), rList=$('radioList');
for(const t of ['keydown','keyup','keypress']) panel.addEventListener(t,e=>{ e.stopPropagation(); if(t==='keydown'&&e.key==='Escape') close(); });   // typing here doesn't drive the car
for(const t of ['pointerdown','touchstart','wheel']) panel.addEventListener(t,e=>e.stopPropagation(),{passive:true});
const LSg=(k,d)=>{ try{ const v=localStorage.getItem(k); return v==null?d:v; }catch(_){ return d; } }, LSs=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(_){ } };
const say=(m,ms)=>{ if(typeof toast==='function') toast(m,ms||1800); };

const au=new Audio(); au.preload='auto';
let vol=+LSg('ydMusicVol',.7); if(!(vol>=0&&vol<=1)) vol=.7; au.volume=vol; $('musicVol').value=vol;
const MU={now:null,queue:[],qi:-1};
/* the music follows the engine (owner 2026-11-22): it goes quiet when the engine is switched off and comes back, on the
   same station or song, once the engine has caught (js/enh/ignition.js IGN.state: on / crank / stop / off). Picking
   something while the engine is off is remembered and starts when the engine is on. */
const carOn=()=>!window.IGN||IGN.state==='on'||!!(window.COCKPIT&&COCKPIT.accessory&&COCKPIT.accessory());   // or the screen woken with its ⏻ while the car's off (accessory)
let wasOn=true, resume=false;
function setNow(){ const n=MU.now, sg=n&&n.radio&&typeof NP!=='undefined'&&NP.song&&NP.key===ihr(n)?NP.song:null;
  $('musicNow').textContent=n?(au.paused?'⏸ ':n.radio?'📻 ':'♪ ')+n.title+(sg?' — '+sg.title+(sg.artist?' · '+sg.artist:''):n.artist?' — '+n.artist:''):'Nothing playing';
  for(const el of panel.querySelectorAll('.it,#radioPresets button')) el.classList.toggle('on',!!n&&el.dataset.url===n.url); }
function play(track){ MU.now=track;
  if(!carOn()){ resume=true; au.pause(); setNow(); say('📻 Turn the engine on to listen',2200); return; }
  resume=false; au.src=track.url; if(!track.radio) au.currentTime=0;
  au.play().then(setNow,()=>{ if(MU.now===track) say(track.radio?'That station won\'t play here — try another':'Could not play that song',2200); }); setNow(); }
function next(){ const n=MU.now; if(n&&n.radio){ const P=presets(); if(!P.length) return; const i=P.findIndex(p=>p.url===n.url); playStation(P[(i+1)%P.length]); return; }
  if(MU.qi>=0&&MU.qi<MU.queue.length-1){ MU.qi++; play(MU.queue[MU.qi]); } else { MU.qi=-1; setNow(); } }
au.addEventListener('ended',()=>{ if(!(MU.now&&MU.now.radio)) next(); }); au.addEventListener('pause',setNow); au.addEventListener('play',setNow);
au.addEventListener('error',()=>{ const n=MU.now; if(n&&n.radio&&au.getAttribute('src')) say('Lost '+n.title+' — the station stopped sending',2400); });
// live radio: after a pause, start again at "now" (not where it stopped)
$('musicPlay').onclick=()=>{ const n=MU.now; if(!n) return; if(!carOn()){ say('📻 Turn the engine on to listen',2200); return; } if(!au.paused){ au.pause(); return; } if(n.radio) play(n); else au.play(); };
$('musicNext').onclick=()=>{ if(MU.queue.length||(MU.now&&MU.now.radio)) next(); };
$('musicStop').onclick=()=>{ resume=false; au.pause(); au.removeAttribute('src'); au.load(); MU.now=null; MU.queue=[]; MU.qi=-1; setNow(); };
$('musicVol').oninput=e=>{ vol=+e.target.value; au.volume=vol*duckF; LSs('ydMusicVol',vol); announce(); };
/* one volume for all the music (owner 2026-11-22: "make all the music turn down with the volume on my steering wheel"):
   the car's songs and radio, the centre-screen YouTube and the phone's YouTube / YouTube Music follow this volume and the
   voice ducking; they hear about changes through the 'ydvolume' event. MUSIC.ytVol() = the YouTube player volume, 0-100. */
let duckOn=false;
const ytVol=()=>Math.round(100*vol*(duckOn?.15:1));
function announce(){ try{ dispatchEvent(new CustomEvent('ydvolume',{detail:{vol,duck:duckOn,yt:ytVol()}})); }catch(e){} }
// turned down while you talk to the car (owner 2026-11-22: "turn down the volume in the car when I'm using voice recognition")
let duckF=1, duckT=0;
function duck(on){ duckOn=!!on; announce(); const to=on?.15:1; clearInterval(duckT); duckT=setInterval(()=>{ duckF+=Math.sign(to-duckF)*Math.min(Math.abs(to-duckF),.08);
  au.volume=Math.max(0,Math.min(1,vol*duckF)); if(duckF===to) clearInterval(duckT); },25); }

// ---------- songs: iTunes Search API through JSONP (works from any page, no key)
let seq=0;
function search(q){ q=q.trim(); if(!q) return; list.innerHTML='<div style="opacity:.6;padding:6px">Searching…</div>';
  const cb='__ydMusic'+(++seq), s=document.createElement('script'); let done=false;
  window[cb]=res=>{ done=true; delete window[cb]; s.remove(); show((res&&res.results)||[]); };
  s.src='https://itunes.apple.com/search?media=music&entity=song&limit=20&explicit=No&term='+encodeURIComponent(q)+'&callback='+cb;
  s.onerror=()=>{ if(!done){ delete window[cb]; s.remove(); list.innerHTML='<div style="opacity:.6;padding:6px">Search isn\'t reachable right now.</div>'; } };
  document.head.appendChild(s); }
function show(rs){ rs=rs.filter(r=>r.previewUrl); list.innerHTML=rs.length?'':'<div style="opacity:.6;padding:6px">No songs found.</div>';
  for(const r of rs){ const t={title:r.trackName||'',artist:r.artistName||'',url:r.previewUrl,art:r.artworkUrl60||'',preview:true};
    const el=document.createElement('div'); el.className='it'; el.dataset.url=t.url;
    const img=document.createElement('img'); img.src=t.art; img.alt=''; const tx=document.createElement('div'); tx.className='t';
    const b=document.createElement('b'); b.textContent=t.title; const sp=document.createElement('span'); sp.textContent=t.artist+(r.collectionName?' · '+r.collectionName:'');
    tx.append(b,sp); el.append(img,tx); el.onclick=()=>{ MU.queue=[]; MU.qi=-1; play(t); }; list.appendChild(el); }
  setNow(); }
$('musicForm').onsubmit=e=>{ e.preventDefault(); input.blur(); search(input.value); };

// my music: whole songs from the device, played in order
$('musicMine').onclick=()=>$('musicFiles').click();
$('musicFiles').onchange=e=>{ const fs=[...e.target.files]; if(!fs.length) return; for(const t of MU.queue) if(!t.preview) URL.revokeObjectURL(t.url);
  MU.queue=fs.map(f=>({title:f.name.replace(/\.[^.]+$/,''),artist:'',url:URL.createObjectURL(f)})); MU.qi=0; play(MU.queue[0]);
  list.innerHTML=''; MU.queue.forEach((t,i)=>{ const el=document.createElement('div'); el.className='it'; el.dataset.url=t.url; const tx=document.createElement('div'); tx.className='t';
    const b=document.createElement('b'); b.textContent=(i+1)+'. '+t.title; tx.append(b); el.append(tx); el.onclick=()=>{ MU.qi=i; play(t); }; list.appendChild(el); });
  e.target.value=''; };

// ---------- radio: Radio Browser directory (CORS, no key). all.api… picks a server; named mirrors are the fallback.
const RB=['https://all.api.radio-browser.info','https://de1.api.radio-browser.info','https://de2.api.radio-browser.info','https://fi1.api.radio-browser.info'];
let rbi=0;
async function rbGet(path){ for(let k=0;k<RB.length;k++){ const base=RB[(rbi+k)%RB.length], ac=new AbortController(), t=setTimeout(()=>ac.abort(),8000);
    try{ const r=await fetch(base+path,{signal:ac.signal}); clearTimeout(t); if(!r.ok) throw 0; rbi=(rbi+k)%RB.length; return await r.json(); }
    catch(_){ clearTimeout(t); } }
  throw new Error('unreachable'); }
const okUrl=u=>typeof u==='string'&&/^https?:\/\//i.test(u)&&u.length<2000;
const place=s=>[s.state,s.countrycode].filter(Boolean).join(', ');
const toStation=s=>({title:String(s.name||'').trim().slice(0,80)||'Radio', artist:place(s), url:s.url_resolved||s.url, uuid:s.stationuuid||'',
  fav:/^https:\/\//i.test(s.favicon||'')?s.favicon:'', radio:true, hls:!!s.hls||/\.m3u8(\?|$)/i.test(s.url_resolved||''), info:[s.codec,s.bitrate?s.bitrate+'k':''].filter(Boolean).join(' ')});
let PRE=[]; try{ PRE=JSON.parse(LSg('ydRadioPresets','null')); }catch(_){ PRE=null; }
if(!Array.isArray(PRE)) PRE=[{title:'93.9 LITE FM',artist:'Chicago, US',url:'https://stream.revma.ihrhls.com/zc853',uuid:'',fav:'',radio:true}];   // owner's example, ready on first use
PRE=PRE.filter(p=>p&&okUrl(p.url)).slice(0,12);
const presets=()=>PRE;
function savePre(){ LSs('ydRadioPresets',JSON.stringify(PRE.map(p=>({title:p.title,artist:p.artist,url:p.url,uuid:p.uuid,fav:p.fav,radio:true})))); drawPre(); }
const isPre=st=>PRE.some(p=>p.url===st.url);
function togglePre(st){ const i=PRE.findIndex(p=>p.url===st.url); if(i>=0){ PRE.splice(i,1); say('Removed '+st.title+' from presets'); }
  else { if(PRE.length>=12){ say('Presets are full (12) — remove one first',2200); return false; } PRE.push(st); say('⭐ Saved '+st.title); }
  savePre(); return true; }
function drawPre(){ const box=$('radioPresets'); box.textContent='';
  if(!PRE.length){ const d=document.createElement('div'); d.className='note'; d.style.margin='0'; d.textContent='No presets yet — search for a station and tap ☆.'; box.append(d); }
  PRE.forEach((p,i)=>{ const b=document.createElement('button'); b.type='button'; b.dataset.url=p.url; b.textContent=(i+1)+'. '+p.title; b.title=p.title+(p.artist?' — '+p.artist:'');
    b.onclick=()=>playStation(p); box.append(b); });
  for(const s of rList.querySelectorAll('.star')) s.textContent=PRE.some(p=>p.url===s.dataset.url)?'★':'☆';
  setNow(); }
function playStation(st){ MU.queue=[]; MU.qi=-1; play(st);
  if(st.uuid) rbGet('/json/url/'+encodeURIComponent(st.uuid)).catch(()=>{}); }   // the directory's "someone listened" count, as it asks
let rseq=0;
async function radioSearch(q){ q=q.trim(); if(!q) return; const my=++rseq; rList.innerHTML='<div style="opacity:.6;padding:6px">Searching stations…</div>';
  const go=(n,lim)=>rbGet('/json/stations/search?hidebroken=true&order=clickcount&reverse=true&limit='+(lim||60)+'&name='+encodeURIComponent(n));
  let rs;
  try{ rs=await go(q);
    // nothing for the whole phrase ("lite fm 93.9"): search the most telling word — a frequency if there is one, else the
    // longest word — and keep the stations whose names have every word
    if(!rs.length&&/\s/.test(q)){ const ws=q.toLowerCase().split(/\s+/).filter(Boolean), key=ws.find(w=>/\d/.test(w))||ws.slice().sort((a,b)=>b.length-a.length)[0];
      rs=(await go(key,300)).filter(s=>{ const nm=String(s.name||'').toLowerCase(); return ws.every(w=>nm.includes(w)); }); } }
  catch(_){ if(my===rseq) rList.innerHTML='<div style="opacity:.6;padding:6px">The station directory isn\'t reachable right now.</div>'; return; }
  if(my!==rseq) return;
  // one entry per station (the directory often lists a station twice), direct streams before HLS, secure before plain
  const seen=new Map();
  for(const s of rs){ if(!okUrl(s.url_resolved||s.url)) continue; const st=toStation(s), k=st.title.toLowerCase()+'|'+st.artist;
    const rank=x=>(x.hls?2:0)+(/^https:/i.test(x.url)?0:1), o=seen.get(k); if(!o||rank(st)<rank(o)) seen.set(k,st); }
  const out=[...seen.values()].sort((a,b)=>(a.hls-b.hls)).slice(0,30);
  rList.textContent=''; if(!out.length){ rList.innerHTML='<div style="opacity:.6;padding:6px">No stations found.</div>'; return; }
  for(const st of out){ const el=document.createElement('div'); el.className='it'; el.dataset.url=st.url;
    let ic; if(st.fav){ ic=document.createElement('img'); ic.alt=''; ic.referrerPolicy='no-referrer'; ic.loading='lazy'; ic.src=st.fav; ic.onerror=()=>{ const ph=document.createElement('div'); ph.className='ph'; ph.textContent='📻'; ic.replaceWith(ph); }; }
    else { ic=document.createElement('div'); ic.className='ph'; ic.textContent='📻'; }
    const tx=document.createElement('div'); tx.className='t'; const b=document.createElement('b'); b.textContent=st.title;
    const sp=document.createElement('span'); sp.textContent=[st.artist,st.info,st.hls?'may not play here':''].filter(Boolean).join(' · ');
    tx.append(b,sp); const star=document.createElement('button'); star.type='button'; star.className='star'; star.dataset.url=st.url; star.textContent=isPre(st)?'★':'☆';
    star.setAttribute('aria-label','Save to presets'); star.onclick=e=>{ e.stopPropagation(); togglePre(st); };
    el.append(ic,tx,star); el.onclick=()=>playStation(st); rList.append(el); }
  setNow(); }
$('radioForm').onsubmit=e=>{ e.preventDefault(); rInput.blur(); radioSearch(rInput.value); };
drawPre();

// ---------- tabs, open / close
let tab=LSg('ydMusicTab','songs'); if(!['songs','radio','video'].includes(tab)) tab='songs';
function setTab(t){ tab=t; LSs('ydMusicTab',t); for(const k of ['songs','radio','video']){ const P=k[0].toUpperCase()+k.slice(1);
    $('pane'+P).style.display=t===k?'':'none'; $('tab'+P).classList.toggle('on',t===k); } }
$('tabSongs').onclick=()=>setTab('songs'); $('tabRadio').onclick=()=>setTab('radio'); $('tabVideo').onclick=()=>setTab('video'); setTab(tab);
// focus: false when opened from the wheel, so the keyboard keeps driving
function open(focus){ panel.classList.add('on'); if(focus!==false) setTimeout(()=>{ const f=tab==='radio'?rInput:tab==='video'?$('tubeQ'):input; if(f) f.focus(); },50); }
function close(){ panel.classList.remove('on'); input.blur(); rInput.blur(); }
const toggle=focus=>panel.classList.contains('on')?close():open(focus);
$('musicX').onclick=close;
/* the M key: js/enh/controls.js */

// for the car's centre screen: what's playing and how far along (live radio: no length, live:true)
/* what's on the radio right now (owner 2026-11-23, photo of the screen: "put the name and the picture of the songs on the
   bottom screen"): iHeart stations (streams at stream.revma.ihrhls.com/zcNNN, like 93.9 LITE FM) say what they're playing
   through iHeart's public now-playing feed, with the album cover; checked every 20 s while the station plays. Other
   stations don't publish it in a way a web page can read, so they show the station. Songs show their album cover. */
var NP={key:'',song:null,t:0,busy:false};
function ihr(n){ const m=n&&n.radio&&String(n.url||'').match(/revma\.ihrhls\.com\/zc(\d+)/); return m?m[1]:null; }
function nowPlaying(force){ const n=MU.now, id=ihr(n); if(!id){ NP.key=''; NP.song=null; return; }
  if(NP.key!==id){ NP.key=id; NP.song=null; force=true; }
  if(NP.busy||au.paused&&!force||Date.now()-NP.t<(force?3000:20000)) return; NP.busy=true; NP.t=Date.now();
  fetch('https://api.iheart.com/api/v3/live-meta/stream/'+id+'/currentTrackMeta').then(r=>r.ok?r.json():null).then(j=>{
    if(NP.key!==id) return;
    if(!j||!j.title){ NP.song=null; return; }
    const art=/^https?:\/\//.test(j.imagePath||'')?String(j.imagePath).replace(/^http:/,'https:')+'?ops=fit(300,300)':'';
    NP.song={title:String(j.title).slice(0,120),artist:String(j.artist||'').slice(0,120),art}; setNow(); }).catch(()=>{}).finally(()=>{ NP.busy=false; }); }
setInterval(()=>nowPlaying(false),2500);
// the station's own logo (owner 2026-11-23, with 93.9 LITE FM's Santa-hat logo: "for the picture, make the 93.9 LITE FM
// like that when I play 93.9"): iHeart stations' current logo from iHeart's station listing — loaded from iHeart, not
// copied into the game, so a seasonal logo changes when theirs does. It's the picture on the music card for that station.
const LOGO={};
function stationLogo(id){ if(id in LOGO) return LOGO[id]; LOGO[id]='';
  fetch('https://api.iheart.com/api/v2/content/liveStations/'+id).then(r=>r.ok?r.json():null).then(j=>{ const h=j&&j.hits&&j.hits[0], u=h&&(h.logo||h.newlogo)||'';
    if(/^https:\/\/i\.iheart\.com\//.test(u)){ LOGO[id]=u.split('?')[0]+'?ops=fit(300,300)'; setNow(); } })
    .catch(()=>{}).finally(()=>{ if(!LOGO[id]) setTimeout(()=>{ if(!LOGO[id]) delete LOGO[id]; },60000); }); return ''; }   // no logo: ask again in a minute
const big=u=>String(u||'').replace(/\/(\d+)x(\d+)bb\./,'/300x300bb.');           // iTunes covers come small; ask for 300 px
MU.info=()=>{ const n=MU.now; if(!n) return null; const sg=n.radio&&NP.key&&NP.key===ihr(n)?NP.song:null;
  return {title:sg?sg.title:n.title, artist:sg?(sg.artist?sg.artist+' · ':'')+n.title:n.radio?(n.artist?n.artist+' · LIVE':'LIVE'):n.artist,
    station:n.radio?n.title:'', art:n.radio?((ihr(n)&&stationLogo(ihr(n)))||(sg&&sg.art)||n.fav||''):big(n.art), cover:sg?sg.art:'', playing:!au.paused, live:!!n.radio,
    pos:au.currentTime||0, dur:!n.radio&&isFinite(au.duration)?au.duration:0}; };
setInterval(()=>{ const on=carOn(); if(on===wasOn) return; wasOn=on;
  if(!on){ resume=!!MU.now&&!au.paused; if(resume) au.pause(); }
  else if(resume&&MU.now){ const n=MU.now; resume=false; if(n.radio||au.src!==n.url) play(n); else au.play().catch(()=>{}); } },250);
// voice (voice.js): play the first song / station a search finds; resolves to its title, or null
MU.playSong=q=>new Promise(res=>{ const cb='__ydMusicV'+(++seq), s=document.createElement('script'); let done=false;
  window[cb]=r=>{ done=true; delete window[cb]; s.remove(); const t=((r&&r.results)||[]).find(x=>x.previewUrl);
    if(!t) return res(null); show(r.results); MU.queue=[]; MU.qi=-1; play({title:t.trackName||'',artist:t.artistName||'',url:t.previewUrl,art:t.artworkUrl60||'',preview:true}); res(t.trackName+(t.artistName?' by '+t.artistName:'')); };
  s.src='https://itunes.apple.com/search?media=music&entity=song&limit=10&explicit=No&term='+encodeURIComponent(q)+'&callback='+cb;
  s.onerror=()=>{ if(!done){ delete window[cb]; s.remove(); res(null); } }; document.head.appendChild(s); });
// "play 93.9" (owner 2026-11-22): a preset that matches first (your 93.9 LITE FM), else the matching station nearest to
// where you're driving in the game (the directory's map position, else US first), not the most popular 93.9 in the world
MU.playRadio=async q=>{ q=q.toLowerCase().trim(); const ws=q.split(/\s+/).filter(w=>w&&!/^(fm|am|the|station|radio)$/.test(w)); if(!ws.length) return null;
  const fit=nm=>{ nm=String(nm||'').toLowerCase(); return ws.every(w=>nm.includes(w)); };
  const pre=PRE.find(p=>fit(p.title)); if(pre){ playStation(pre); return pre.title; }
  const key=ws.find(w=>/\d/.test(w))||ws.slice().sort((a,b)=>b.length-a.length)[0];
  let rs=[]; try{ rs=await rbGet('/json/stations/search?hidebroken=true&order=clickcount&reverse=true&limit=300&name='+encodeURIComponent(key)); }catch(_){ return null; }
  rs=rs.filter(s=>fit(s.name)&&okUrl(s.url_resolved||s.url)); if(!rs.length) return null;
  const lat=(typeof S!=='undefined'&&S.lat)||41.6, lng=(typeof S!=='undefined'&&S.lng)||-88.4, km=(a,b,c,d)=>Math.hypot((c-a)*111,(d-b)*111*Math.cos(a*Math.PI/180));
  const score=s=>{ const g=+s.geo_lat, h=+s.geo_long; if(isFinite(g)&&isFinite(h)&&(g||h)) return km(lat,lng,g,h);
    return (s.countrycode==='US'?3000:20000)+(/\.m3u8|hls/i.test(s.url_resolved||'')?500:0); };
  rs.sort((a,b)=>score(a)-score(b)); const st=toStation(rs[0]); playStation(st); return st.title; };
MU.stop=()=>$('musicStop').click(); MU.resume=()=>{ if(MU.now&&au.paused) $('musicPlay').click(); };
// Controls (js/enh/controls.js): next / previous song or preset station, volume steps (the wheel's + / −, the = / − keys)
MU.next=()=>{ if(MU.queue.length||(MU.now&&MU.now.radio)) next(); };
MU.prev=()=>{ const n=MU.now; if(n&&n.radio){ const P=presets(); if(!P.length) return; const i=P.findIndex(p=>p.url===n.url); playStation(P[(i-1+P.length)%P.length]); return; }
  if(n&&!au.paused&&au.currentTime>3){ au.currentTime=0; return; }                       // like a car stereo: first back to the start of the song
  if(MU.qi>0){ MU.qi--; play(MU.queue[MU.qi]); } else if(n){ au.currentTime=0; } };
MU.volStep=d=>{ vol=Math.round(Math.max(0,Math.min(1,vol+d*.05))*100)/100; au.volume=vol*duckF; $('musicVol').value=vol; LSs('ydMusicVol',vol); announce(); say('🔊 Volume '+Math.round(vol*100),900); };
MU.duck=duck; MU.ytVol=ytVol; MU.vol=()=>vol; MU.open=open; MU.close=close; MU.pause=()=>{ if(!au.paused) au.pause(); }; MU.toggle=toggle; MU.presets=presets; MU.playStation=playStation;
window.MUSIC=MU;
})();
