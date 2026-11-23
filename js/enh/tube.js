/* YouTube on the car's centre screen (owner 2026-11-22: "make it so I can watch YouTube on the lower screen").
   Music panel → ▶ Video: paste a YouTube link (in the YouTube app: Share → Copy link) and it plays on the centre screen in
   cockpit view, in YouTube's own embedded player (youtube-nocookie.com), laid over the screen and kept lined up with it as
   you look around. Searching YouTube needs an API key the game doesn't have, so it takes links. Like a real car, the video
   pauses while you're driving (over ~3 mph) and the picture comes back when you stop; press play to go on. Recent videos
   are remembered on this device (localStorage ydTubeRecent, last 8). The car's music pauses while a video plays. */
(()=>{
'use strict';
const pane=document.getElementById('paneVideo'); if(!pane) return;
const css=document.createElement('style'); css.textContent=`
#tubeBox{position:absolute;left:0;top:0;transform-origin:0 0;z-index:8;background:#000;display:none;pointer-events:auto}
#tubeBox iframe{width:100%;height:100%;border:0;display:block}
#tubeBox .stop{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.86);color:#fff;font:600 28px system-ui,Arial;text-align:center;padding:20px;box-sizing:border-box}
#tubeBox.moving .stop{display:flex}
#tubeBox.off{visibility:hidden!important}
#paneVideo .it{display:flex;gap:9px;align-items:center;padding:6px;border-radius:9px;cursor:pointer}
#paneVideo .it:hover{background:rgba(255,255,255,.1)}
#tubeResults{max-height:min(40vh,320px);overflow-y:auto;margin-top:6px}
#paneVideo .it .ch{opacity:.6;font-size:12px}
#paneVideo img{width:64px;height:36px;border-radius:5px;flex:none;object-fit:cover;background:#223}`;
document.head.appendChild(css);
pane.innerHTML=`<form id="tubeForm" style="margin-top:8px"><input id="tubeQ" type="search" placeholder="Type a video name or paste a link" autocomplete="off" enterkeyhint="search"><button type="submit">Go</button></form>
<div id="tubeResults"></div>
<div class="row"><button type="button" id="tubePrev" aria-label="Previous video">⏮</button><button type="button" id="tubeNext" aria-label="Next video">⏭</button><button type="button" id="tubeStop">⏹ Stop video</button></div>
<div class="hd">Recent</div><div id="tubeRecent"></div>
<details id="tubeKeyBox" style="margin-top:8px"><summary style="cursor:pointer;opacity:.75;font-size:12px">🔑 YouTube search key</summary>
<div class="note" style="opacity:.8">Searching by name needs a free key from Google: console.cloud.google.com → new project → enable "YouTube Data API v3" → Credentials → Create API key (limit it to this website). Paste it here; it stays on this device.</div>
<form id="tubeKeyForm" style="margin-top:6px"><input id="tubeKey" type="password" placeholder="Paste your API key" autocomplete="off"><button type="submit">Save</button></form></details>
<div class="note">Plays on the car's centre screen in cockpit view. The video pauses while the car is moving, like in a real car.</div>`;
const $=id=>document.getElementById(id);
const box=document.createElement('div'); box.id='tubeBox'; box.innerHTML='<div class="stop">Video paused<br>while driving</div>'; document.body.appendChild(box);
for(const t of ['pointerdown','touchstart','wheel']) box.addEventListener(t,e=>e.stopPropagation(),{passive:true});   // taps on the video don't steer the view

// a video id from any YouTube link (watch, youtu.be, shorts, embed, live, music) or a bare 11-character id
// a playlist id from a link's list= (owner 2026-11-22: share a YouTube playlist once, the car plays all of it)
function listOf(s){ s=(s||'').trim(); try{ const u=new URL(s.includes('://')?s:'https://'+s); if(!/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(u.hostname)) return null;
  const l=u.searchParams.get('list'); return l&&/^[\w-]{10,64}$/.test(l)?l:null; }catch(e){ return null; } }
function idOf(s){ s=(s||'').trim(); if(/^[\w-]{11}$/.test(s)) return s;
  try{ const u=new URL(s.includes('://')?s:'https://'+s); if(!/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(u.hostname)) return null;
    if(u.hostname.endsWith('youtu.be')) return (u.pathname.slice(1).match(/^[\w-]{11}/)||[])[0]||null;
    const v=u.searchParams.get('v'); if(v&&/^[\w-]{11}$/.test(v)) return v;
    const m=u.pathname.match(/\/(?:shorts|embed|live|v)\/([\w-]{11})/); return m?m[1]:null; }catch(e){ return null; } }

const T={id:null,frame:null,moving:false,warned:false};
let recent=[]; try{ recent=JSON.parse(localStorage.getItem('ydTubeRecent')||'[]').filter(o=>o&&(/^[\w-]{11}$/.test(o.id)||/^[\w-]{10,64}$/.test(o.list||''))); }catch(e){}
const keyOf=(id,list)=>(list||'')+'|'+(id||'');
function drawRecent(){ const L=$('tubeRecent'); L.textContent=''; if(!recent.length){ L.innerHTML='<div style="opacity:.5;padding:6px;font-size:12px">Nothing yet</div>'; return; }
  for(const o of recent){ const el=document.createElement('div'); el.className='it'; let th;
    if(o.id){ th=document.createElement('img'); th.alt=''; th.src='https://i.ytimg.com/vi/'+o.id+'/mqdefault.jpg'; }
    else { th=document.createElement('div'); th.textContent='▤'; th.style.cssText='width:64px;height:36px;border-radius:5px;flex:none;background:#223;display:flex;align-items:center;justify-content:center;font-size:20px'; }
    const t=document.createElement('div'); t.textContent=(o.list?'▤ ':'')+(o.title||(o.list?'Playlist':'Video '+o.id)); t.style.cssText='min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    el.append(th,t); el.onclick=()=>watch(o.id,o.list); L.append(el); } }
function remember(id,list){ const k=keyOf(id,list), old=recent.find(o=>keyOf(o.id,o.list)===k)||{};
  recent=[{id:id||null,list:list||null,title:old.title||''}].concat(recent.filter(o=>keyOf(o.id,o.list)!==k)).slice(0,8);
  try{ localStorage.setItem('ydTubeRecent',JSON.stringify(recent)); }catch(e){} drawRecent();
  // the title, from YouTube's public oEmbed (no key; playlists too); fine if it can't be reached
  const url=list&&!id?'https://www.youtube.com/playlist?list='+list:'https://www.youtube.com/watch?v='+id;
  fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent(url)).then(r=>r.ok?r.json():null).then(j=>{
    if(!j||!j.title) return; const o=recent.find(o=>keyOf(o.id,o.list)===k); if(o){ o.title=j.title; try{ localStorage.setItem('ydTubeRecent',JSON.stringify(recent)); }catch(e){} drawRecent(); } }).catch(()=>{}); }
const cmd=(func,args)=>{ try{ T.frame&&T.frame.contentWindow.postMessage(JSON.stringify({event:'command',func,args:args||[]}),'*'); }catch(e){} };

function watch(id,list){ stop(); T.id=id||null; T.list=list||null; if(window.MUSIC&&MUSIC.pause) MUSIC.pause();
  const f=document.createElement('iframe'); f.allow='autoplay; encrypted-media; picture-in-picture; fullscreen'; f.referrerPolicy='strict-origin-when-cross-origin';
  const q='autoplay=1&playsinline=1&rel=0&enablejsapi=1&origin='+encodeURIComponent(location.origin);
  f.src=list&&!id?'https://www.youtube-nocookie.com/embed/videoseries?list='+list+'&'+q:'https://www.youtube-nocookie.com/embed/'+id+'?'+(list?'list='+list+'&':'')+q;   // a playlist plays through, ⏮ ⏭ move along it
  box.prepend(f); T.frame=f; box.style.display='block'; remember(id,list);
  if(!(window.COCKPIT&&COCKPIT.on)) toast('The video plays on the centre screen — switch to cockpit view (C)',2600);
  if(window.MUSIC&&MUSIC.close) MUSIC.close(); }
function stop(){ if(T.frame){ T.frame.remove(); T.frame=null; } T.id=null; T.list=null; box.style.display='none'; box.classList.remove('moving'); T.moving=false; }
// search by name (owner 2026-11-22: "make it so I can type the name"): YouTube Data API v3 with the key saved on this
// device (localStorage ydTubeKey); safe search on, only videos that can play outside YouTube
const KEY=()=>{ try{ return localStorage.getItem('ydTubeKey')||''; }catch(e){ return ''; } };
const esc=t=>{ const d=document.createElement('textarea'); d.innerHTML=t||''; return d.value; };   // titles come HTML-escaped
function searchTube(q){ const R=$('tubeResults'), key=KEY();
  if(!key){ R.innerHTML='<div style="opacity:.75;padding:6px;font-size:13px">To search by name, add a YouTube key below (🔑). Pasted links work without one.</div>'; $('tubeKeyBox').open=true; return; }
  R.innerHTML='<div style="opacity:.6;padding:6px">Searching…</div>';
  fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=20&safeSearch=strict&videoEmbeddable=true&q='+encodeURIComponent(q)+'&key='+encodeURIComponent(key))
    .then(r=>r.json().then(j=>({ok:r.ok,j}))).then(({ok,j})=>{
      if(!ok){ const m=(j&&j.error&&j.error.message)||'Search failed'; R.innerHTML=''; const d=document.createElement('div'); d.style.cssText='opacity:.75;padding:6px;font-size:13px';
        d.textContent=/quota/i.test(m)?"Today's free searches are used up — try again tomorrow, or paste a link.":/key|API/i.test(m)?'The YouTube key was not accepted: '+m:m; R.append(d); return; }
      R.textContent=''; const items=(j.items||[]).filter(it=>it.id&&it.id.videoId);
      if(!items.length){ R.innerHTML='<div style="opacity:.6;padding:6px">No videos found.</div>'; return; }
      for(const it of items){ const id=it.id.videoId, sn=it.snippet||{}, title=esc(sn.title);
        const el=document.createElement('div'); el.className='it'; const img=document.createElement('img'); img.alt=''; img.loading='lazy'; img.src=(sn.thumbnails&&sn.thumbnails.medium&&sn.thumbnails.medium.url)||'https://i.ytimg.com/vi/'+id+'/mqdefault.jpg';
        const t=document.createElement('div'); t.style.cssText='min-width:0'; const b=document.createElement('div'); b.textContent=title; b.style.cssText='white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
        const c=document.createElement('div'); c.className='ch'; c.textContent=esc(sn.channelTitle); t.append(b,c); el.append(img,t);
        el.onclick=()=>{ const o=recent.find(o=>o.id===id); if(!o) recent.unshift({id,title}); else o.title=title; watch(id); }; R.append(el); } })
    .catch(()=>{ R.innerHTML='<div style="opacity:.6;padding:6px">YouTube search isn\'t reachable right now.</div>'; }); }
$('tubeForm').onsubmit=e=>{ e.preventDefault(); const v=$('tubeQ').value.trim(); if(!v) return; const link=/[\/.]/.test(v);
  const id=link||/^[\w-]{11}$/.test(v)&&!/\s/.test(v)&&/\d|[A-Z]/.test(v)?idOf(v):null, list=link?listOf(v):null;
  $('tubeQ').blur(); if(id||list){ $('tubeQ').value=''; watch(id,list); } else if(link) toast("That doesn't look like a YouTube link",1800); else searchTube(v); };
$('tubePrev').onclick=()=>cmd('previousVideo'); $('tubeNext').onclick=()=>cmd('nextVideo');
$('tubeKeyForm').onsubmit=e=>{ e.preventDefault(); const k=$('tubeKey').value.trim(); try{ k?localStorage.setItem('ydTubeKey',k):localStorage.removeItem('ydTubeKey'); }catch(_){ }
  $('tubeKey').value=''; $('tubeKeyBox').open=false; toast(k?'YouTube key saved on this device':'YouTube key removed',1600); const q=$('tubeQ').value.trim(); if(k&&q) searchTube(q); };
$('tubeStop').onclick=stop;
drawRecent();

// a CSS matrix3d that maps the box (w × h) onto the screen's four corners as they appear on the page
function adj(m){ return [m[4]*m[8]-m[5]*m[7],m[2]*m[7]-m[1]*m[8],m[1]*m[5]-m[2]*m[4],m[5]*m[6]-m[3]*m[8],m[0]*m[8]-m[2]*m[6],m[2]*m[3]-m[0]*m[5],m[3]*m[7]-m[4]*m[6],m[1]*m[6]-m[0]*m[7],m[0]*m[4]-m[1]*m[3]]; }
function mm(a,b){ const c=[]; for(let i=0;i<3;i++) for(let j=0;j<3;j++){ let s=0; for(let k=0;k<3;k++) s+=a[3*i+k]*b[3*k+j]; c[3*i+j]=s; } return c; }
function mv(m,v){ return [m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[3]*v[0]+m[4]*v[1]+m[5]*v[2],m[6]*v[0]+m[7]*v[1]+m[8]*v[2]]; }
function basis(p){ const m=[p[0][0],p[1][0],p[2][0],p[0][1],p[1][1],p[2][1],1,1,1], v=mv(adj(m),[p[3][0],p[3][1],1]); return mm(m,[v[0],0,0,0,v[1],0,0,0,v[2]]); }
function quadMatrix(w,h,dst){ const t=mm(basis(dst),adj(basis([[0,0],[w,0],[0,h],[w,h]]))); for(let i=0;i<9;i++) t[i]/=t[8];
  return 'matrix3d('+[t[0],t[3],0,t[6],t[1],t[4],0,t[7],0,0,1,0,t[2],t[5],0,t[8]].join(',')+')'; }

// placed right after the cockpit draws its frame (COCKPIT.afterRender), so the video sits on the screen in the same frame and
// doesn't wobble or lag behind it while driving (owner 2026-11-22); outside cockpit view the rAF below just hides it
function place(){ if(!T.frame) return;
  const q=window.COCKPIT&&COCKPIT.screenQuad&&COCKPIT.screenQuad();
  if(!q||!q.vis){ box.style.visibility='hidden'; return; }                 // keeps playing (you hear it) while the screen is out of view
  box.style.visibility='visible'; const w=640, h=Math.round(640/q.aspect); box.style.width=w+'px'; box.style.height=h+'px';
  const p=q.pts; box.style.transform=quadMatrix(w,h,[p[0],p[1],p[2],p[3]]);
  // stopped / driving: pause and cover the picture over ~3 mph, like a real car; uncover once stopped
  const v=Math.abs((typeof S!=='undefined'&&S.v)||0), moving=T.moving?v>.6:v>1.4;
  if(moving!==T.moving){ T.moving=moving; box.classList.toggle('moving',moving);
    if(moving){ cmd('pauseVideo'); if(!T.warned){ T.warned=true; toast('Video pauses while the car is moving',2000); } } } }
if(window.COCKPIT&&COCKPIT.afterRender) COCKPIT.afterRender.push(place);
// the car switched off (owner 2026-11-22): the video pauses and its screen goes dark with the car's other screens; it comes
// back, paused where it was, once the car is started again
function frame(){ requestAnimationFrame(frame); if(!T.frame) return; if(!(window.COCKPIT&&COCKPIT.on)) box.style.visibility='hidden';
  const st=window.IGN&&IGN.state, off=window.COCKPIT&&COCKPIT.screenOn?!COCKPIT.screenOn():(st==='off'||st==='stop');   // the screen's own ⏻ (or the car) switched it off
  if(off!==!!T.off){ T.off=off; box.classList.toggle('off',off); if(off) cmd('pauseVideo'); } }
requestAnimationFrame(frame);
window.TUBE={watch,stop,idOf,listOf,state:T};
})();
