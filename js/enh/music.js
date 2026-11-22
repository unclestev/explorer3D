/* Car music (owner 2026-11-22: "make me type a song on the lower screen and play from the car").
   Tap the centre screen in cockpit view (or press M) to open Music: type a song or artist and pick a result to hear it.
   Searches use Apple's free iTunes Search API (no key, no account): every song there has a 30-second preview, which is
   what plays (full songs need a streaming licence the game doesn't have; explicit songs are left out). "My music" plays
   songs you pick from your own device, start to finish, one after another. What's playing shows along the bottom of the
   car's centre screen. Volume is remembered on this device (localStorage ydMusicVol). */
(()=>{
'use strict';
const css=document.createElement('style'); css.textContent=`
#musicPanel{position:absolute;top:var(--st);left:50%;transform:translateX(-50%);width:min(calc(100vw - 2*var(--gap)),460px);box-sizing:border-box;z-index:41;display:none;background:var(--panel-solid);border:1px solid var(--line);border-radius:14px;padding:10px;box-shadow:0 8px 24px rgba(0,0,0,.45);color:#fff;font:14px system-ui,Arial}
#musicPanel.on{display:block}
#musicPanel form{display:flex;gap:6px}
#musicPanel input[type=search]{flex:1;min-width:0;font:16px system-ui;padding:8px 10px;border-radius:9px;border:1px solid var(--line);background:rgba(255,255,255,.08);color:#fff}
#musicPanel button{font:600 14px system-ui;padding:8px 11px;border-radius:9px;border:1px solid var(--line);background:rgba(255,255,255,.1);color:#fff;cursor:pointer}
#musicPanel .row{display:flex;gap:6px;align-items:center;margin-top:8px}
#musicPanel .now{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.9}
#musicList{max-height:min(46vh,360px);overflow-y:auto;margin-top:8px}
#musicList .it{display:flex;gap:9px;align-items:center;padding:6px;border-radius:9px;cursor:pointer}
#musicList .it:hover,#musicList .it.on{background:rgba(255,255,255,.1)}
#musicList img{width:40px;height:40px;border-radius:6px;flex:none;background:#223}
#musicList .t{min-width:0}#musicList .t b,#musicList .t span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#musicList .t span{opacity:.65;font-size:12px}
#musicPanel .note{opacity:.55;font-size:11px;margin-top:6px}
#musicPanel input[type=range]{width:90px}`;
document.head.appendChild(css);
const panel=document.createElement('div'); panel.id='musicPanel';
panel.innerHTML=`<form id="musicForm"><input id="musicQ" type="search" placeholder="Type a song or artist" autocomplete="off" enterkeyhint="search"><button type="submit">Search</button><button type="button" id="musicX" aria-label="Close">✕</button></form>
<div class="row"><button type="button" id="musicPlay">⏯</button><button type="button" id="musicNext">⏭</button><button type="button" id="musicStop">⏹</button><span class="now" id="musicNow">Nothing playing</span><input type="range" id="musicVol" min="0" max="1" step="0.05" aria-label="Volume"></div>
<div class="row"><button type="button" id="musicMine">📁 My music…</button><input type="file" id="musicFiles" accept="audio/*" multiple hidden></div>
<div id="musicList"></div><div class="note">Search results play Apple's 30-second previews. "My music" plays whole songs from your device.</div>`;
document.body.appendChild(panel);
const $=id=>document.getElementById(id), input=$('musicQ'), list=$('musicList');
for(const t of ['keydown','keyup','keypress']) panel.addEventListener(t,e=>{ e.stopPropagation(); if(t==='keydown'&&e.key==='Escape') close(); });   // typing here doesn't drive the car
for(const t of ['pointerdown','touchstart','wheel']) panel.addEventListener(t,e=>e.stopPropagation(),{passive:true});

const au=new Audio(); au.preload='auto';
let vol=+(localStorage.getItem('ydMusicVol')||.7); if(!(vol>=0&&vol<=1)) vol=.7; au.volume=vol; $('musicVol').value=vol;
const MU={now:null,queue:[],qi:-1};
function setNow(){ const n=MU.now; $('musicNow').textContent=n?(au.paused?'⏸ ':'♪ ')+n.title+(n.artist?' — '+n.artist:''):'Nothing playing'; }
function play(track){ MU.now=track; au.src=track.url; au.currentTime=0; au.play().then(setNow,()=>{ toast('Could not play that song',1600); }); setNow();
  for(const el of list.querySelectorAll('.it')) el.classList.toggle('on',el.dataset.url===track.url); }
function next(){ if(MU.qi>=0&&MU.qi<MU.queue.length-1){ MU.qi++; play(MU.queue[MU.qi]); } else { MU.qi=-1; setNow(); } }
au.addEventListener('ended',next); au.addEventListener('pause',setNow); au.addEventListener('play',setNow);
$('musicPlay').onclick=()=>{ if(!MU.now) return; au.paused?au.play():au.pause(); };
$('musicNext').onclick=()=>{ if(MU.queue.length) next(); };
$('musicStop').onclick=()=>{ au.pause(); au.removeAttribute('src'); au.load(); MU.now=null; MU.queue=[]; MU.qi=-1; setNow(); };
$('musicVol').oninput=e=>{ vol=+e.target.value; au.volume=vol; try{ localStorage.setItem('ydMusicVol',vol); }catch(_){ } };

// search: iTunes Search API through JSONP (works from any page, no key)
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
    tx.append(b,sp); el.append(img,tx); el.onclick=()=>{ MU.queue=[]; MU.qi=-1; play(t); }; list.appendChild(el); } }
$('musicForm').onsubmit=e=>{ e.preventDefault(); input.blur(); search(input.value); };

// my music: whole songs from the device, played in order
$('musicMine').onclick=()=>$('musicFiles').click();
$('musicFiles').onchange=e=>{ const fs=[...e.target.files]; if(!fs.length) return; for(const t of MU.queue) if(!t.preview) URL.revokeObjectURL(t.url);
  MU.queue=fs.map(f=>({title:f.name.replace(/\.[^.]+$/,''),artist:'',url:URL.createObjectURL(f)})); MU.qi=0; play(MU.queue[0]);
  list.innerHTML=''; MU.queue.forEach((t,i)=>{ const el=document.createElement('div'); el.className='it'; el.dataset.url=t.url; const tx=document.createElement('div'); tx.className='t';
    const b=document.createElement('b'); b.textContent=(i+1)+'. '+t.title; tx.append(b); el.append(tx); el.onclick=()=>{ MU.qi=i; play(t); }; list.appendChild(el); });
  e.target.value=''; };

function open(){ panel.classList.add('on'); setTimeout(()=>input.focus(),50); }
function close(){ panel.classList.remove('on'); input.blur(); }
$('musicX').onclick=close;
addEventListener('keydown',e=>{ if(e.repeat||(e.target&&/INPUT|TEXTAREA/.test(e.target.tagName))) return; if(e.key.toLowerCase()==='m') panel.classList.contains('on')?close():open(); });

// for the car's centre screen: what's playing and how far along
MU.info=()=>MU.now?{title:MU.now.title,artist:MU.now.artist,playing:!au.paused,pos:au.currentTime||0,dur:isFinite(au.duration)?au.duration:0}:null;
MU.open=open; MU.close=close;
window.MUSIC=MU;
})();
