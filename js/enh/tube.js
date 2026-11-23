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
#paneVideo .it{display:flex;gap:9px;align-items:center;padding:6px;border-radius:9px;cursor:pointer}
#paneVideo .it:hover{background:rgba(255,255,255,.1)}
#paneVideo img{width:64px;height:36px;border-radius:5px;flex:none;object-fit:cover;background:#223}`;
document.head.appendChild(css);
pane.innerHTML=`<form id="tubeForm" style="margin-top:8px"><input id="tubeQ" type="search" placeholder="Paste a YouTube link" autocomplete="off" enterkeyhint="go"><button type="submit">Watch</button></form>
<div class="row"><button type="button" id="tubeStop">⏹ Stop video</button></div>
<div class="hd">Recent</div><div id="tubeRecent"></div>
<div class="note">Plays on the car's centre screen in cockpit view. In the YouTube app: Share → Copy link, then paste it here. The video pauses while the car is moving, like in a real car.</div>`;
const $=id=>document.getElementById(id);
const box=document.createElement('div'); box.id='tubeBox'; box.innerHTML='<div class="stop">Video paused<br>while driving</div>'; document.body.appendChild(box);
for(const t of ['pointerdown','touchstart','wheel']) box.addEventListener(t,e=>e.stopPropagation(),{passive:true});   // taps on the video don't steer the view

// a video id from any YouTube link (watch, youtu.be, shorts, embed, live, music) or a bare 11-character id
function idOf(s){ s=(s||'').trim(); if(/^[\w-]{11}$/.test(s)) return s;
  try{ const u=new URL(s.includes('://')?s:'https://'+s); if(!/(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(u.hostname)) return null;
    if(u.hostname.endsWith('youtu.be')) return (u.pathname.slice(1).match(/^[\w-]{11}/)||[])[0]||null;
    const v=u.searchParams.get('v'); if(v&&/^[\w-]{11}$/.test(v)) return v;
    const m=u.pathname.match(/\/(?:shorts|embed|live|v)\/([\w-]{11})/); return m?m[1]:null; }catch(e){ return null; } }

const T={id:null,frame:null,moving:false,warned:false};
let recent=[]; try{ recent=JSON.parse(localStorage.getItem('ydTubeRecent')||'[]').filter(o=>o&&/^[\w-]{11}$/.test(o.id)); }catch(e){}
function drawRecent(){ const L=$('tubeRecent'); L.textContent=''; if(!recent.length){ L.innerHTML='<div style="opacity:.5;padding:6px;font-size:12px">Nothing yet</div>'; return; }
  for(const o of recent){ const el=document.createElement('div'); el.className='it'; const img=document.createElement('img'); img.alt=''; img.src='https://i.ytimg.com/vi/'+o.id+'/mqdefault.jpg';
    const t=document.createElement('div'); t.textContent=o.title||('Video '+o.id); t.style.cssText='min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    el.append(img,t); el.onclick=()=>watch(o.id); L.append(el); } }
function remember(id){ recent=[{id,title:(recent.find(o=>o.id===id)||{}).title||''}].concat(recent.filter(o=>o.id!==id)).slice(0,8);
  try{ localStorage.setItem('ydTubeRecent',JSON.stringify(recent)); }catch(e){} drawRecent();
  // the title, from YouTube's public oEmbed (no key); fine if it can't be reached
  fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent('https://www.youtube.com/watch?v='+id)).then(r=>r.ok?r.json():null).then(j=>{
    if(!j||!j.title) return; const o=recent.find(o=>o.id===id); if(o){ o.title=j.title; try{ localStorage.setItem('ydTubeRecent',JSON.stringify(recent)); }catch(e){} drawRecent(); } }).catch(()=>{}); }
const cmd=(func,args)=>{ try{ T.frame&&T.frame.contentWindow.postMessage(JSON.stringify({event:'command',func,args:args||[]}),'*'); }catch(e){} };

function watch(id){ stop(); T.id=id; if(window.MUSIC&&MUSIC.pause) MUSIC.pause();
  const f=document.createElement('iframe'); f.allow='autoplay; encrypted-media; picture-in-picture; fullscreen'; f.referrerPolicy='strict-origin-when-cross-origin';
  f.src='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&playsinline=1&rel=0&enablejsapi=1&origin='+encodeURIComponent(location.origin);
  box.prepend(f); T.frame=f; box.style.display='block'; remember(id);
  if(!(window.COCKPIT&&COCKPIT.on)) toast('The video plays on the centre screen — switch to cockpit view (C)',2600);
  if(window.MUSIC&&MUSIC.close) MUSIC.close(); }
function stop(){ if(T.frame){ T.frame.remove(); T.frame=null; } T.id=null; box.style.display='none'; box.classList.remove('moving'); T.moving=false; }
$('tubeForm').onsubmit=e=>{ e.preventDefault(); const id=idOf($('tubeQ').value); if(!id){ toast("That doesn't look like a YouTube link",1800); return; } $('tubeQ').value=''; $('tubeQ').blur(); watch(id); };
$('tubeStop').onclick=stop;
drawRecent();

// a CSS matrix3d that maps the box (w × h) onto the screen's four corners as they appear on the page
function adj(m){ return [m[4]*m[8]-m[5]*m[7],m[2]*m[7]-m[1]*m[8],m[1]*m[5]-m[2]*m[4],m[5]*m[6]-m[3]*m[8],m[0]*m[8]-m[2]*m[6],m[2]*m[3]-m[0]*m[5],m[3]*m[7]-m[4]*m[6],m[1]*m[6]-m[0]*m[7],m[0]*m[4]-m[1]*m[3]]; }
function mm(a,b){ const c=[]; for(let i=0;i<3;i++) for(let j=0;j<3;j++){ let s=0; for(let k=0;k<3;k++) s+=a[3*i+k]*b[3*k+j]; c[3*i+j]=s; } return c; }
function mv(m,v){ return [m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[3]*v[0]+m[4]*v[1]+m[5]*v[2],m[6]*v[0]+m[7]*v[1]+m[8]*v[2]]; }
function basis(p){ const m=[p[0][0],p[1][0],p[2][0],p[0][1],p[1][1],p[2][1],1,1,1], v=mv(adj(m),[p[3][0],p[3][1],1]); return mm(m,[v[0],0,0,0,v[1],0,0,0,v[2]]); }
function quadMatrix(w,h,dst){ const t=mm(basis(dst),adj(basis([[0,0],[w,0],[0,h],[w,h]]))); for(let i=0;i<9;i++) t[i]/=t[8];
  return 'matrix3d('+[t[0],t[3],0,t[6],t[1],t[4],0,t[7],0,0,1,0,t[2],t[5],0,t[8]].join(',')+')'; }

function frame(){ requestAnimationFrame(frame); if(!T.frame) return;
  const q=window.COCKPIT&&COCKPIT.screenQuad&&COCKPIT.screenQuad();
  if(!q||!q.vis){ box.style.visibility='hidden'; return; }                 // keeps playing (you hear it) while the screen is out of view
  box.style.visibility='visible'; const w=640, h=Math.round(640/q.aspect); box.style.width=w+'px'; box.style.height=h+'px';
  const p=q.pts; box.style.transform=quadMatrix(w,h,[p[0],p[1],p[2],p[3]]);
  // stopped / driving: pause and cover the picture over ~3 mph, like a real car; uncover once stopped
  const v=Math.abs((typeof S!=='undefined'&&S.v)||0), moving=T.moving?v>.6:v>1.4;
  if(moving!==T.moving){ T.moving=moving; box.classList.toggle('moving',moving);
    if(moving){ cmd('pauseVideo'); if(!T.warned){ T.warned=true; toast('Video pauses while the car is moving',2000); } } } }
requestAnimationFrame(frame);
window.TUBE={watch,stop,idOf,state:T};
})();
