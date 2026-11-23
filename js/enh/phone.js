/* Phone (owner 2026-11-22: "can you make a phone in the game with apps"). A phone you pull up over the game: 📱 in the
   top-right bar, the T key, or say "open my phone". The apps use what the game already has:
     Maps (search, favourites and recents, "Drive me there" on autopilot) · Spotify (paste a link) · YouTube Music (links, or names with the YouTube key; keeps playing in the background) · Music (now playing, songs, radio presets and
     stations, volume) · YouTube (its own player on the phone; pauses while you drive) · Camera (a photo of the game view)
     and Photos (kept on this device, download or delete) · Weather · Clock (with a stopwatch) · Calculator · Notes ·
     FordPass (your car pictured; lock, unlock, remote start, horn & lights, headlights, sunroof, wipers, hazards, switch cars) · Voice · Settings · Controls.
   It's a pretend phone inside the game: it can't call or text anyone and isn't connected to your real phone.
   window.PHONE = {open, close, toggle, snap(), horn} */
(()=>{
'use strict';
let PHONE_SPOT=null, PHONE_YM=null, TUBE_PAUSE=null, SPOT_STOP=null, SPOT_GO=null;
const $=id=>document.getElementById(id);
const LSg=(k,d)=>{ try{ const v=localStorage.getItem(k); return v==null?d:v; }catch(e){ return d; } };
const LSs=(k,v)=>{ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } };
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const mph=()=>Math.round(Math.abs((typeof S!=='undefined'&&S.v)||0)*2.237);
const say=(m,ms)=>{ if(typeof toast==='function') toast(m,ms||1500); };
const txt=id=>{ const e=$(id); return e?e.textContent.trim():''; };

const css=document.createElement('style'); css.textContent=`
#phone{position:absolute;right:calc(var(--gap,10px) + 64px);top:50%;z-index:44;height:min(74vh,620px);aspect-ratio:9/19;transform:translate(130%,-50%);
 transition:transform .35s cubic-bezier(.2,.9,.3,1);background:#111;border-radius:44px;padding:10px;box-sizing:border-box;
 box-shadow:0 0 0 2px #3a3d44,0 0 0 4px #15171b,0 18px 50px rgba(0,0,0,.6);font:14px system-ui,-apple-system,Segoe UI,Arial;color:#fff;user-select:none}
#phone.on{transform:translate(0,-50%)}
@media (max-width:620px){ #phone{right:50%;transform:translate(50%,130%);height:min(86vh,640px)} #phone.on{transform:translate(50%,-50%)} }
#phone .scr{position:relative;width:100%;height:100%;border-radius:34px;overflow:hidden;background:linear-gradient(160deg,#1f3b73,#5b2a86 55%,#c2410c);display:flex;flex-direction:column}
#phone .sb{flex:none;height:34px;display:flex;align-items:center;justify-content:space-between;padding:0 18px 0 24px;font-size:12px;font-weight:600;position:relative;z-index:2}
#phone .isl{position:absolute;left:50%;top:8px;transform:translateX(-50%);width:72px;height:22px;background:#000;border-radius:12px}
#phBody{flex:1;min-height:0;position:relative;overflow:hidden}
#phone .homebar{flex:none;height:22px;display:flex;align-items:center;justify-content:center;cursor:pointer}
#phone .homebar i{width:110px;height:5px;border-radius:3px;background:rgba(255,255,255,.85)}
#phone .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px 6px;padding:18px 12px}
#phone .ap{display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;font-size:11px;text-shadow:0 1px 2px rgba(0,0,0,.5);background:none;border:0;color:#fff;padding:0}
#phone .ap .ic{width:54px;height:54px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:28px;box-shadow:0 2px 6px rgba(0,0,0,.3)}
#phone .ap:active .ic{filter:brightness(.8)}
#phone .dock{position:absolute;left:10px;right:10px;bottom:6px;display:flex;justify-content:space-around;padding:10px 4px;border-radius:26px;background:rgba(255,255,255,.18);backdrop-filter:blur(8px)}
#phone .dock .ap span{display:none}
#phone .app{position:absolute;inset:0;background:#0d1117;display:flex;flex-direction:column;animation:phIn .22s ease-out}
@keyframes phIn{from{transform:scale(.92);opacity:0}}
#phone .hd{flex:none;display:flex;align-items:center;gap:8px;padding:6px 12px 8px;font-weight:700;font-size:17px}
#phone .hd button{background:none;border:0;color:#4f8ef7;font-size:15px;padding:4px 0;cursor:pointer}
#phone .bd{flex:1;min-height:0;overflow-y:auto;padding:0 12px 12px}
#phone input,#phone textarea{width:100%;box-sizing:border-box;background:#1c2330;color:#fff;border:1px solid #2c3546;border-radius:10px;padding:9px 10px;font:inherit;user-select:text}
#phone .row{display:flex;gap:6px;margin:6px 0}
#phone .btn{background:#2563eb;color:#fff;border:0;border-radius:10px;padding:9px 12px;font:600 14px system-ui;cursor:pointer;flex:none}
#phone .btn.g{background:#2a3242} #phone .btn.r{background:#dc2626} #phone .btn.on{background:#16a34a}
#phone .li{display:flex;align-items:center;gap:10px;padding:9px 6px;border-bottom:1px solid #1e2633;cursor:pointer}
#phone .li img{width:64px;height:36px;object-fit:cover;border-radius:6px;flex:none}
#phone .li .t{min-width:0;flex:1} #phone .li .t b,#phone .li .t small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} #phone .li .t small{opacity:.6;font-size:12px}
#phone .muted{opacity:.6;font-size:12px;padding:6px 2px}
#phone .sec{font-size:12px;text-transform:uppercase;letter-spacing:.06em;opacity:.55;margin:14px 2px 4px}
#phone .big{font-size:58px;font-weight:200;text-align:center;margin:16px 0 0}
#phone .cgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:8px}
#phone .cgrid .btn{padding:16px 6px;font-size:14px;display:flex;flex-direction:column;align-items:center;gap:4px} #phone .cgrid .btn i{font-style:normal;font-size:24px}
#phone .calc{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:10px}
#phone .calc button{aspect-ratio:1;border-radius:50%;border:0;background:#333;color:#fff;font-size:22px;cursor:pointer} #phone .calc button.o{background:#f59e0b} #phone .calc button.f{background:#a5a5a5;color:#000}
#phone .calc button.z{grid-column:span 2;aspect-ratio:auto;border-radius:30px}
#phone .vid{position:relative;width:100%;aspect-ratio:16/9;background:#000;border-radius:10px;overflow:hidden;margin-bottom:6px}
#phone .vid iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
#phone .vid .pz{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.7);font-size:13px;text-align:center;padding:10px}
#phone .vid.moving .pz{display:flex}
#phone .photos{display:grid;grid-template-columns:repeat(3,1fr);gap:3px}
#phone .photos img{width:100%;aspect-ratio:1;object-fit:cover;cursor:pointer}
#phone .view img{width:100%;border-radius:8px}
#phone .shut{width:68px;height:68px;border-radius:50%;background:#fff;border:5px solid #888;margin:14px auto;display:block;cursor:pointer}
#phone .shut:active{background:#ddd}
#phone .flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .35s}
#phone .drv{position:absolute;left:10px;right:10px;top:4px;z-index:3;background:rgba(220,38,38,.92);border-radius:12px;padding:6px 10px;font-size:12px;display:none}
#phone.driving .drv{display:block}
#phoneBtn.on{background:#2563eb}
#phYtm{position:absolute;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;overflow:hidden;border-radius:12px;background:#000;z-index:2}
#phone.ytm #phYtm{opacity:1;pointer-events:auto}
#phYtm iframe{position:absolute;inset:0;width:100%;height:100%;border:0}`;
document.head.appendChild(css);

const ph=document.createElement('div'); ph.id='phone';
ph.innerHTML='<div class="scr"><div class="sb"><b id="phT"></b><span class="isl"></span><span id="phBat">📶 🔋</span></div>'+
  '<div class="drv">🚗 You\'re driving — press V and just say what you want</div><div id="phBody"></div><div class="homebar" id="phHome" title="Home"><i></i></div></div>';
document.body.appendChild(ph);
for(const ev of ['pointerdown','wheel','touchstart']) ph.addEventListener(ev,e=>e.stopPropagation(),{passive:true});
ph.addEventListener('keydown',e=>e.stopPropagation());       // typing in the phone doesn't steer the car
const body=$('phBody');

// 📱 in the top-right bar, before ⚙️
const zb=$('zoom'); let pbtn=null;
if(zb){ pbtn=document.createElement('button'); pbtn.id='phoneBtn'; pbtn.title='Phone'; pbtn.textContent='📱'; const g=$('gear'); zb.insertBefore(pbtn,g||null);
  pbtn.addEventListener('pointerdown',e=>e.stopPropagation()); pbtn.addEventListener('click',e=>{ e.stopPropagation(); toggle(); }); }

// ---------- status bar
function clock(){ return new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}).replace(/\s?[AP]M$/i,''); }
let bat=null; if(navigator.getBattery) navigator.getBattery().then(b=>{ bat=b; }).catch(()=>{});
function status(){ $('phT').textContent=clock(); $('phBat').textContent=bat?Math.round(bat.level*100)+'% 🔋':'📶 🔋';
  ph.classList.toggle('driving',mph()>8&&cur!=null); }

// ---------- apps
const APPS=[];
let cur=null, cleanup=null, tick=null;
function app(id,name,icon,bg,run,dock){ APPS.push({id,name,icon,bg,run,dock}); }
function home(){ end(); cur=null; body.innerHTML='';
  const g=document.createElement('div'); g.className='grid'; const d=document.createElement('div'); d.className='dock';
  for(const a of APPS){ const b=document.createElement('button'); b.className='ap'; b.innerHTML='<div class="ic" style="background:'+a.bg+'">'+a.icon+'</div><span>'+esc(a.name)+'</span>';
    b.onclick=()=>openApp(a.id); (a.dock?d:g).appendChild(b); }
  body.append(g,d); status(); }
function end(){ if(cleanup) try{ cleanup(); }catch(e){} cleanup=null; clearInterval(tick); tick=null; }
function openApp(id){ const a=APPS.find(x=>x.id===id); if(!a) return; end(); cur=id; body.innerHTML='';
  const w=document.createElement('div'); w.className='app'; w.innerHTML='<div class="hd"><button>‹ Home</button><span></span></div><div class="bd"></div>';
  w.querySelector('.hd span').textContent=a.name; w.querySelector('.hd button').onclick=home; body.appendChild(w);
  const r=a.run(w.querySelector('.bd'),w); if(typeof r==='function') cleanup=r; status(); }
const every=(ms,f)=>{ f(); clearInterval(tick); tick=setInterval(f,ms); };
const el=(tag,cls,html)=>{ const e=document.createElement(tag); if(cls) e.className=cls; if(html!=null) e.innerHTML=html; return e; };
const li=(title,sub,onclick,img)=>{ const e=el('div','li'); if(img){ const i=el('img'); i.src=img; i.alt=''; i.loading='lazy'; e.appendChild(i); }
  const t=el('div','t'); const b=el('b'); b.textContent=title; t.appendChild(b); if(sub){ const s=el('small'); s.textContent=sub; t.appendChild(s); } e.appendChild(t); e.onclick=onclick; return e; };

// Maps
app('maps','Maps','🗺️','linear-gradient(#4ade80,#16a34a)',bd=>{
  bd.innerHTML='<div class="muted" id="phWhere"></div><form class="row"><input id="phMapQ" placeholder="Search for a place" autocomplete="off"><button class="btn">Go</button></form>'+
    '<div class="row"><button class="btn on" id="phAuto" style="flex:1">🚗 Drive me there (autopilot)</button><button class="btn g" id="phClr">Clear</button></div><div id="phRoute" class="muted"></div><div id="phPl"></div>';
  const P=window.YD&&YD.PLACES, q=bd.querySelector('#phMapQ');
  async function go(o){ if(!P) return; if(o.lat!=null&&P.goTo){ P.goTo(o); say('Heading to '+o.name); return; } $('phRoute').textContent='Looking for '+o.name+'…';
    const n=await P.navigate(o.name); $('phRoute').textContent=n?'Heading to '+n:'Couldn\'t find '+o.name; if(n) say('Heading to '+n); }
  bd.querySelector('form').onsubmit=e=>{ e.preventDefault(); const v=q.value.trim(); if(v){ q.blur(); go({name:v}); } };
  bd.querySelector('#phAuto').onclick=()=>{ if(!(YD.NAV&&YD.NAV.pts)) return say('Pick a place first',1500); if(!(window.AUTO&&AUTO.on)) { const b=$('navAuto'); if(b) b.click(); } };
  bd.querySelector('#phClr').onclick=()=>{ const b=$('navX'); if(b&&YD.NAV&&YD.NAV.dest) b.click(); };
  const pl=bd.querySelector('#phPl'); const add=(h,arr)=>{ if(!arr||!arr.length) return; pl.appendChild(el('div','sec',h)); for(const o of arr.slice(0,12)) pl.appendChild(li(o.name,o.sub,()=>go(o))); };
  if(P){ add('★ Favorites',P.fav&&P.fav()); add('Recent',P.recent&&P.recent()); } if(!pl.children.length) pl.appendChild(el('div','muted','Places you go show up here.'));
  every(1000,()=>{ const w=[txt('road'),txt('place')].filter(x=>x&&!/Locating|^On road$/.test(x)).join(' · '); $('phWhere').textContent=w?'📍 '+w:'';
    $('phRoute').textContent=YD.NAV&&YD.NAV.pts?'➜ '+(txt('navStreet')||'On route')+' · '+txt('navEta')+((window.AUTO&&AUTO.on)?' · autopilot on':''):($('phRoute').textContent.startsWith('Looking')?$('phRoute').textContent:''); });
},true);

// Music
app('music','Music','🎵','linear-gradient(#fb7185,#e11d48)',bd=>{
  bd.innerHTML='<div style="text-align:center;margin-top:8px"><div style="font-size:64px">🎶</div><b id="phNow" style="display:block;margin-top:6px">Nothing playing</b><small id="phNowA" class="muted"></small></div>'+
    '<div class="row" style="justify-content:center;margin:12px 0"><button class="btn g" id="phPrev">⏮</button><button class="btn" id="phPlay">⏯</button><button class="btn g" id="phNext">⏭</button><button class="btn g" id="phStop">⏹</button></div>'+
    '<div class="row" style="align-items:center">🔈<input type="range" id="phVol" min="0" max="1" step=".05" style="padding:0">🔊</div>'+
    '<form class="row" id="phSongF"><input id="phSongQ" placeholder="Song or artist"><button class="btn">Play</button></form>'+
    '<form class="row" id="phRadF"><input id="phRadQ" placeholder="Radio station (93.9, WGN…)"><button class="btn">Tune</button></form><div class="sec">Radio presets</div><div id="phPre"></div>';
  const MU=window.MUSIC; if(!MU){ bd.innerHTML='<div class="muted">Music isn\'t available.</div>'; return; }
  const clickId=id=>{ const b=$(id); if(b) b.click(); };
  bd.querySelector('#phPrev').onclick=()=>MU.prev&&MU.prev(); bd.querySelector('#phNext').onclick=()=>MU.next?MU.next():clickId('musicNext');
  bd.querySelector('#phPlay').onclick=()=>clickId('musicPlay'); bd.querySelector('#phStop').onclick=()=>MU.stop&&MU.stop();
  const v=bd.querySelector('#phVol'), mv=$('musicVol'); if(mv) v.value=mv.value; v.oninput=()=>{ if(mv){ mv.value=v.value; mv.dispatchEvent(new Event('input')); } };
  bd.querySelector('#phSongF').onsubmit=async e=>{ e.preventDefault(); const q=bd.querySelector('#phSongQ').value.trim(); if(!q) return; e.target.querySelector('input').blur(); $('phNow').textContent='Finding '+q+'…'; const n=await MU.playSong(q); if(!n) $('phNow').textContent='Couldn\'t find '+q; };
  bd.querySelector('#phRadF').onsubmit=async e=>{ e.preventDefault(); const q=bd.querySelector('#phRadQ').value.trim(); if(!q) return; e.target.querySelector('input').blur(); $('phNow').textContent='Finding '+q+'…'; const n=await MU.playRadio(q); if(!n) $('phNow').textContent='Couldn\'t find '+q; };
  const pre=bd.querySelector('#phPre'), P=MU.presets?MU.presets():[]; for(const p of P) pre.appendChild(li('📻 '+p.title,p.artist,()=>MU.playStation(p)));
  if(!P.length) pre.appendChild(el('div','muted','Save stations with ☆ in the car\'s Radio tab.'));
  const art=bd.querySelector('div[style*="font-size:64px"]');
  every(1000,()=>{ const n=MU.info&&MU.info(); if(art){ const u=n&&n.art; if(u!==art.dataset.u){ art.dataset.u=u||''; art.innerHTML=u?'<img src="'+esc(u)+'" alt="" style="width:120px;height:120px;border-radius:12px;object-fit:cover" onerror="this.replaceWith(\'🎶\')">':'🎶'; } }
    if(n&&n.title){ $('phNow').textContent=n.title; $('phNowA').textContent=n.artist||''; } else if(!/^Finding|^Couldn/.test($('phNow').textContent)){ $('phNow').textContent='Nothing playing'; $('phNowA').textContent=''; } });
},true);

// Spotify (owner 2026-11-22): paste a Spotify link (song, album, playlist, artist, podcast) and Spotify's own player plays
// it. Signed in to Spotify in this browser: whole songs; not signed in: 30-second previews. Searching Spotify by name
// needs a developer key, so it's links only (Share → Copy link in the Spotify app).
function spotOf(v){ v=String(v||'').trim(); let m=v.match(/^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]{10,40})$/);
  if(!m) m=v.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/|embed\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]{10,40})/);
  return m?{type:m[1],id:m[2]}:null; }
// Spotify's official iFrame API (loaded the first time it's needed): it lets the game pause and resume the player
const SP={ctl:null,paused:true,byVoice:false,byCar:false}; let SPAPI=null; const spWait=[];
function spApi(cb){ if(SPAPI) return cb(SPAPI); spWait.push(cb); if(spApi.busy) return; spApi.busy=true;
  const give=a=>{ spApi.busy=false; spWait.splice(0).forEach(f=>{ try{ f(a); }catch(e){} }); };
  window.onSpotifyIframeApiReady=a=>{ SPAPI=a; give(a); };
  const sc=document.createElement('script'); sc.src='https://open.spotify.com/embed/iframe-api/v1'; sc.async=true; sc.onerror=()=>give(null); document.head.appendChild(sc);
  setTimeout(()=>{ if(!SPAPI) give(null); },6000); }
app('spotify','Spotify','🎧','linear-gradient(#22c55e,#15803d)',bd=>{
  bd.innerHTML='<div id="phSpot"></div><form class="row"><input id="phSpotQ" placeholder="Paste a Spotify link" autocomplete="off"><button class="btn on">Play</button></form>'+
    '<div class="muted">In Spotify: ⋯ → Share → Copy link, then paste it here. Signed in to Spotify in this browser = whole songs; otherwise 30-second previews.</div>'+
    '<div class="sec">Recent</div><div id="phSpotRec"></div>';
  const box=bd.querySelector('#phSpot'), rec=bd.querySelector('#phSpotRec');
  SPOT_STOP=()=>{ if(SP.ctl){ if(!SP.paused){ SP.ctl.pause(); SP.byCar=true; } return; }          // the car went off: pause (resumes on start)
    if(box.querySelector('iframe')){ box.innerHTML=''; box.appendChild(el('div','muted','Stopped: the car was turned off. Tap a recent one to play it again.')); } };
  SPOT_GO=()=>{ if(SP.ctl&&SP.byCar){ SP.byCar=false; SP.ctl.resume(); } };
  let R=[]; try{ R=JSON.parse(LSg('ydSpotRecent','[]')); if(!Array.isArray(R)) R=[]; }catch(e){ R=[]; } R=R.filter(o=>o&&spotOf('spotify:'+o.type+':'+o.id));
  const kinds={track:'Song',album:'Album',playlist:'Playlist',artist:'Artist',episode:'Podcast episode',show:'Podcast'};
  function drawRec(){ rec.textContent=''; for(const o of R) rec.appendChild(li(o.title||kinds[o.type],kinds[o.type],()=>play(o),o.img||''));
    if(!R.length) rec.appendChild(el('div','muted','What you play shows up here.')); }
  function play(o){ if(window.MUSIC&&MUSIC.stop&&MUSIC.now) MUSIC.stop(); if(window.TUBE&&TUBE.stop) TUBE.stop();
    box.innerHTML=''; SP.ctl=null; SP.byVoice=SP.byCar=false; const host=el('div'); box.appendChild(host); const h=o.type==='track'||o.type==='episode'?152:352;
    spApi(api=>{ if(!host.isConnected) return;
      if(api){ try{ api.createController(host,{uri:'spotify:'+o.type+':'+o.id,width:'100%',height:h},c=>{ if(!box.isConnected){ try{ c.destroy(); }catch(e){} return; } SP.ctl=c; SP.paused=true;
        c.addListener('playback_update',e=>{ if(e&&e.data) SP.paused=!!e.data.isPaused; }); try{ c.play(); }catch(e){} }); return; }catch(e){ console.warn('spotify api',e); } }
      plain(); });
    function plain(){ const f=document.createElement('iframe'); f.src='https://open.spotify.com/embed/'+o.type+'/'+o.id+'?utm_source=generator&theme=0';
    f.allow='autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'; f.style.cssText='width:100%;height:'+h+'px;border:0;border-radius:12px;margin-top:4px';
    host.replaceWith(f); }
    R=R.filter(x=>!(x.type===o.type&&x.id===o.id)); R.unshift({type:o.type,id:o.id,title:o.title||'',img:o.img||''}); R=R.slice(0,15); LSs('ydSpotRecent',JSON.stringify(R)); drawRec();
    if(!o.title) fetch('https://open.spotify.com/oembed?url='+encodeURIComponent('https://open.spotify.com/'+o.type+'/'+o.id)).then(r=>r.ok?r.json():null).then(j=>{ if(!j||!j.title) return;
      const x=R.find(x=>x.type===o.type&&x.id===o.id); if(x){ x.title=String(j.title).slice(0,100); x.img=/^https:\/\//.test(j.thumbnail_url||'')?j.thumbnail_url:''; LSs('ydSpotRecent',JSON.stringify(R)); drawRec(); } }).catch(()=>{}); }
  bd.querySelector('form').onsubmit=e=>{ e.preventDefault(); const q=bd.querySelector('#phSpotQ'), o=spotOf(q.value); q.blur();
    if(!o){ box.innerHTML='<div class="muted">That doesn\'t look like a Spotify link. It should start with open.spotify.com/</div>'; return; } q.value=''; play(o); };
  drawRec(); if(R[0]&&!box.children.length) box.appendChild(el('div','muted','Tap a recent one to play it again.'));
  return ()=>{ SP.ctl=null; SPOT_STOP=SPOT_GO=null; };
});
PHONE_SPOT=spotOf;

// YouTube Music (owner 2026-11-22). YouTube Music's own site won't run inside another page, but its songs and playlists
// are YouTube videos, so a music.youtube.com link (or a name, with the YouTube key) plays through YouTube's player. It's
// music, so unlike the YouTube app it keeps playing while you drive, with the phone put away, and in other apps.
const YM={fr:null,cur:null,title:'',paused:false,byCar:false};
const ymBox=document.createElement('div'); ymBox.id='phYtm'; ph.querySelector('.scr').appendChild(ymBox);
const ymCmd=f=>{ try{ YM.fr&&YM.fr.contentWindow.postMessage(JSON.stringify({event:'command',func:f,args:[]}),'*'); }catch(e){} };
const ytv=()=>window.MUSIC&&MUSIC.ytVol?MUSIC.ytVol():100;
function ymVol(){ try{ YM.fr&&YM.fr.contentWindow.postMessage(JSON.stringify({event:'command',func:'setVolume',args:[ytv()]}),'*'); }catch(e){} }
addEventListener('ydvolume',ymVol);
function ymStop(){ if(YM.fr) YM.fr.remove(); YM.fr=null; YM.cur=null; YM.title=''; }
function ymPlay(o){ ymStop(); if(window.MUSIC&&MUSIC.stop&&MUSIC.now) MUSIC.stop(); if(window.TUBE&&TUBE.stop) TUBE.stop();
  const q='autoplay=1&playsinline=1&rel=0&enablejsapi=1&origin='+encodeURIComponent(location.origin);
  const f=document.createElement('iframe'); f.allow='autoplay; encrypted-media'; f.referrerPolicy='strict-origin-when-cross-origin';
  f.src=o.id?'https://www.youtube-nocookie.com/embed/'+encodeURIComponent(o.id)+'?'+q+(o.list?'&list='+encodeURIComponent(o.list):''):'https://www.youtube-nocookie.com/embed/videoseries?list='+encodeURIComponent(o.list)+'&'+q;
  f.addEventListener('load',()=>{ for(const ms of [800,2000,4500]) setTimeout(()=>{ if(YM.fr===f) ymVol(); },ms); });
  ymBox.appendChild(f); YM.fr=f; YM.cur=o; YM.title=o.title||''; YM.paused=false; YM.byCar=false;
  let R=[]; try{ R=JSON.parse(LSg('ydYtmRecent','[]')); if(!Array.isArray(R)) R=[]; }catch(e){}
  R=R.filter(x=>x&&!(x.id===o.id&&x.list===o.list)); R.unshift({id:o.id||null,list:o.list||null,title:o.title||'',by:o.by||''}); LSs('ydYtmRecent',JSON.stringify(R.slice(0,20)));
  if(!o.title&&o.id) fetch('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent('https://www.youtube.com/watch?v='+o.id)).then(r=>r.ok?r.json():null).then(j=>{ if(!j||!j.title||YM.cur!==o) return;
    YM.title=String(j.title).slice(0,100); try{ const R2=JSON.parse(LSg('ydYtmRecent','[]')); if(R2[0]&&R2[0].id===o.id){ R2[0].title=YM.title; R2[0].by=String(j.author_name||'').replace(/ - Topic$/,''); LSs('ydYtmRecent',JSON.stringify(R2)); } }catch(e){} }).catch(()=>{}); }
async function ymSearch(q){ const key=LSg('ydTubeKey',''); if(!key) return {err:'To search by name, add your YouTube key in the car\'s Video tab (🔑). Pasted YouTube Music links work without one.'};
  try{ const r=await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=15&safeSearch=strict&videoEmbeddable=true&q='+encodeURIComponent(q)+'&key='+encodeURIComponent(key));
    const j=await r.json(); if(!r.ok) return {err:(j&&j.error&&j.error.message)||'Search failed'};
    const d=document.createElement('textarea'); const un=h=>{ d.innerHTML=h||''; return d.value; };
    return {items:(j.items||[]).filter(i=>i.id&&i.id.videoId).map(i=>({id:i.id.videoId,title:un(i.snippet&&i.snippet.title),by:un(i.snippet&&i.snippet.channelTitle).replace(/ - Topic$/,''),img:i.snippet&&i.snippet.thumbnails&&i.snippet.thumbnails.medium&&i.snippet.thumbnails.medium.url}))}; }
  catch(e){ return {err:'YouTube isn\'t reachable right now.'}; } }
app('ytmusic','YT Music','🎼','linear-gradient(#f43f5e,#7f1d1d)',(bd,w)=>{
  ph.classList.add('ytm');
  bd.innerHTML='<div id="phYmArt" style="aspect-ratio:16/9;border-radius:12px;background:#1a1a1a;display:flex;align-items:center;justify-content:center;font-size:44px;margin-top:2px">🎼</div>'+
    '<b id="phYmT" style="display:block;text-align:center;margin-top:8px">Nothing playing</b>'+
    '<div class="row" style="justify-content:center;margin:8px 0"><button class="btn g" data-c="previousVideo">⏮</button><button class="btn" id="phYmP">⏸</button><button class="btn g" data-c="nextVideo">⏭</button><button class="btn g" id="phYmS">⏹</button></div>'+
    '<form class="row"><input id="phYmQ" placeholder="Paste a YouTube Music link, or a song" autocomplete="off"><button class="btn">Go</button></form><div id="phYmR"></div><div class="sec">Recent</div><div id="phYmRec"></div>';
  const Tt=bd.querySelector('#phYmT'), P=bd.querySelector('#phYmP'), Rs=bd.querySelector('#phYmR'), T=window.TUBE;
  for(const b of bd.querySelectorAll('[data-c]')) b.onclick=()=>{ ymCmd(b.dataset.c); YM.paused=false; };
  P.onclick=()=>{ if(!YM.fr) return; YM.byCar=false; YM.paused=!YM.paused; ymCmd(YM.paused?'pauseVideo':'playVideo'); };
  bd.querySelector('#phYmS').onclick=()=>{ ymStop(); };
  function drawRec(){ const L=bd.querySelector('#phYmRec'); L.textContent=''; let R=[]; try{ R=JSON.parse(LSg('ydYtmRecent','[]')); }catch(e){}
    for(const o of (Array.isArray(R)?R:[]).slice(0,15)) if(o&&(o.id||o.list)) L.appendChild(li(o.title||(o.list&&!o.id?'Playlist':'Song'),o.by||(o.list?'Playlist':''),()=>{ ymPlay(o); drawRec(); },o.id?'https://i.ytimg.com/vi/'+o.id+'/mqdefault.jpg':''));
    if(!L.children.length) L.appendChild(el('div','muted','In YouTube Music: ⋮ → Share → Copy link, then paste it here.')); }
  bd.querySelector('form').onsubmit=async e=>{ e.preventDefault(); const inp=bd.querySelector('#phYmQ'), v=inp.value.trim(); if(!v) return; inp.blur();
    const id=T&&T.idOf?T.idOf(v):null, list=T&&T.listOf?T.listOf(v):null;
    if(id||list){ inp.value=''; Rs.textContent=''; ymPlay({id,list}); drawRec(); return; }
    if(/music\.youtube\.com\/browse\//.test(v)){ Rs.innerHTML='<div class="muted">That\'s an album page. Open the album\'s first song in YouTube Music and copy that link instead.</div>'; return; }
    if(/[\/.]/.test(v)){ Rs.innerHTML='<div class="muted">That doesn\'t look like a YouTube Music link.</div>'; return; }
    Rs.innerHTML='<div class="muted">Searching…</div>'; const r=await ymSearch(v); Rs.textContent='';
    if(r.err){ Rs.appendChild(el('div','muted')).textContent=r.err; return; } if(!r.items.length){ Rs.innerHTML='<div class="muted">No songs found.</div>'; return; }
    for(const o of r.items) Rs.appendChild(li(o.title,o.by,()=>{ ymPlay(o); Rs.textContent=''; drawRec(); },o.img||'')); };
  drawRec();
  const art=bd.querySelector('#phYmArt'), scr=ph.querySelector('.scr');
  const place=()=>{ const a=art.getBoundingClientRect(), c=scr.getBoundingClientRect(), b=bd.getBoundingClientRect(), k=c.width/scr.offsetWidth||1;   // the player sits on the art square
    const top=(a.top-c.top)/k, cut=a.top<b.top-4; Object.assign(ymBox.style,{left:(a.left-c.left)/k+'px',top:top+'px',width:a.width/k+'px',height:a.height/k+'px',visibility:cut?'hidden':''}); };
  bd.addEventListener('scroll',place,{passive:true}); requestAnimationFrame(place);
  every(500,()=>{ place(); bd.querySelector('#phYmArt').style.visibility=YM.fr?'hidden':'visible'; Tt.textContent=YM.fr?(YM.title||'Playing'):'Nothing playing'; P.textContent=YM.paused?'▶':'⏸'; });
  return ()=>{ ph.classList.remove('ytm'); ymBox.removeAttribute('style'); };
});
PHONE_YM={play:ymPlay,stop:ymStop,search:ymSearch,get on(){ return !!YM.fr; }};

// YouTube: its own little player on the phone
app('tube','YouTube','▶️','#ff0000',bd=>{
  bd.innerHTML='<div class="vid" id="phVid" style="display:none"><div class="pz">Paused while you\'re driving.<br>Stop the car to keep watching.</div></div>'+
    '<form class="row"><input id="phTubeQ" placeholder="Paste a link, or type a name"><button class="btn">Go</button></form><div id="phTubeR"></div><div class="sec">Recent</div><div id="phTubeRec"></div>';
  const V=bd.querySelector('#phVid'); let fr=null, moving=false;
  const cmd=f=>{ try{ fr&&fr.contentWindow.postMessage(JSON.stringify({event:'command',func:f,args:[]}),'*'); }catch(e){} };
  TUBE_PAUSE=()=>cmd('pauseVideo');
  const setV=()=>{ try{ fr&&fr.contentWindow.postMessage(JSON.stringify({event:'command',func:'setVolume',args:[ytv()]}),'*'); }catch(e){} };
  addEventListener('ydvolume',setV);
  function play(id,list,title){ if(window.TUBE&&TUBE.stop) TUBE.stop(); if(window.MUSIC&&MUSIC.pause) MUSIC.pause(); V.style.display='block'; if(fr) fr.remove();
    const q='autoplay=1&playsinline=1&rel=0&enablejsapi=1&origin='+encodeURIComponent(location.origin);
    fr=document.createElement('iframe'); fr.allow='autoplay; encrypted-media; picture-in-picture'; fr.referrerPolicy='strict-origin-when-cross-origin';
    { const me=fr; fr.addEventListener('load',()=>{ for(const ms of [800,2000,4500]) setTimeout(()=>{ if(fr===me) setV(); },ms); }); }
    fr.src=list?'https://www.youtube-nocookie.com/embed/videoseries?list='+encodeURIComponent(list)+'&'+q:'https://www.youtube-nocookie.com/embed/'+encodeURIComponent(id)+'?'+q; V.prepend(fr);
    try{ let R=JSON.parse(LSg('ydTubeRecent','[]')); if(!Array.isArray(R)) R=[]; R=R.filter(o=>!(o&&(list?o.list===list:o.id===id&&!o.list))); R.unshift(list?{list,title:title||'Playlist'}:{id,title:title||''}); LSs('ydTubeRecent',JSON.stringify(R.slice(0,20))); }catch(e){} }
  const T=window.TUBE, R=bd.querySelector('#phTubeR');
  bd.querySelector('form').onsubmit=e=>{ e.preventDefault(); const inp=bd.querySelector('#phTubeQ'), v=inp.value.trim(); if(!v) return; inp.blur();
    const id=T&&T.idOf?T.idOf(v):null, list=T&&T.listOf?T.listOf(v):null; if(id||list){ inp.value=''; play(id,list); return; }
    if(/[\/.]/.test(v)){ R.innerHTML='<div class="muted">That doesn\'t look like a YouTube link.</div>'; return; }
    const key=LSg('ydTubeKey',''); if(!key){ R.innerHTML='<div class="muted">To search by name, add your YouTube key in the car\'s Video tab (🔑). Pasted links work without one.</div>'; return; }
    R.innerHTML='<div class="muted">Searching…</div>';
    fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&safeSearch=strict&videoEmbeddable=true&q='+encodeURIComponent(v)+'&key='+encodeURIComponent(key))
      .then(r=>r.json().then(j=>({ok:r.ok,j}))).then(({ok,j})=>{ R.textContent=''; if(!ok){ R.appendChild(el('div','muted')).textContent=(j&&j.error&&j.error.message)||'Search failed'; return; }
        const its=(j.items||[]).filter(i=>i.id&&i.id.videoId); if(!its.length){ R.innerHTML='<div class="muted">No videos found.</div>'; return; }
        for(const it of its){ const s=it.snippet||{}, d=el('textarea'); d.innerHTML=s.title||''; const title=d.value; R.appendChild(li(title,s.channelTitle,()=>play(it.id.videoId,null,title),(s.thumbnails&&s.thumbnails.medium&&s.thumbnails.medium.url)||'')); } })
      .catch(()=>{ R.innerHTML='<div class="muted">YouTube isn\'t reachable right now.</div>'; }); };
  const rec=bd.querySelector('#phTubeRec'); let RC=[]; try{ RC=JSON.parse(LSg('ydTubeRecent','[]')); }catch(e){}
  for(const o of (Array.isArray(RC)?RC:[]).slice(0,12)) if(o&&(o.id||o.list)) rec.appendChild(li(o.title||(o.list?'Playlist':'Video'),o.list?'Playlist':'',()=>play(o.id,o.list,o.title),o.id?'https://i.ytimg.com/vi/'+o.id+'/mqdefault.jpg':''));
  if(!rec.children.length) rec.appendChild(el('div','muted','Videos you watch show up here.'));
  every(500,()=>{ const m=mph()>3; if(m!==moving){ moving=m; V.classList.toggle('moving',m); if(m) cmd('pauseVideo'); } });
  return ()=>{ if(fr) fr.remove(); fr=null; removeEventListener('ydvolume',setV); };
});

// Camera and Photos
let PH=[]; try{ PH=JSON.parse(LSg('ydPhonePhotos','[]')); if(!Array.isArray(PH)) PH=[]; }catch(e){ PH=[]; }
function savePhotos(){ while(PH.length&&!LSs('ydPhonePhotos',JSON.stringify(PH))) PH.pop(); }     // full storage: drop the oldest
/* a photo of the game view: the map and the 3D view are WebGL canvases that clear after each frame, so each is copied the
   moment it's drawn (the map in its 'render' event, the 3D view right after renderer.render) and the two are stacked */
function snap(){ return new Promise(res=>{
  const W=720, out=document.createElement('canvas'), x=out.getContext('2d'); let mapC=null, triC=null, done=false;
  const mc=typeof map!=='undefined'&&map&&map.getCanvas?map.getCanvas():null, tc=$('car3d');
  const ref=tc||mc; if(!ref) return res(null); const H=Math.round(W*ref.height/Math.max(1,ref.width)); out.width=W; out.height=H;
  const copy=c=>{ const k=document.createElement('canvas'); k.width=W; k.height=H; try{ k.getContext('2d').drawImage(c,0,0,W,H); }catch(e){} return k; };
  const onMap=()=>{ mapC=copy(mc); };
  const R=typeof renderer!=='undefined'?renderer:null, orig=R&&R.render;
  if(R) R.render=function(){ const r=orig.apply(this,arguments); if(tc) triC=copy(tc); return r; };
  if(mc){ map.once('render',onMap); map.triggerRepaint(); }
  try{ if(typeof dirty!=='undefined') dirty=true; }catch(e){}
  setTimeout(()=>{ done=true; if(R) R.render=orig; if(mc) map.off('render',onMap);
    x.fillStyle='#87a9d6'; x.fillRect(0,0,W,H); if(mapC&&!(window.COCKPIT&&COCKPIT.on)) x.drawImage(mapC,0,0); if(triC) x.drawImage(triC,0,0);
    let u=null; try{ u=out.toDataURL('image/jpeg',.78); }catch(e){} if(!u) return res(null);
    PH.unshift({u,t:Date.now(),w:[txt('road'),txt('place')].filter(s=>s&&!/Locating|^On road$/.test(s)).join(' · ')}); PH=PH.slice(0,24); savePhotos(); res(u); },450); }); }
app('camera','Camera','📷','linear-gradient(#9ca3af,#4b5563)',(bd,w)=>{
  bd.innerHTML='<div class="muted" style="text-align:center;margin-top:10px">Takes a picture of what you see in the game.<br>Look around first to frame it.</div><div id="phLast" class="view" style="margin-top:10px"></div><button class="shut" aria-label="Take photo"></button>';
  const f=el('div','flash'); w.appendChild(f);
  bd.querySelector('.shut').onclick=async()=>{ f.style.transition='none'; f.style.opacity=.9; requestAnimationFrame(()=>{ f.style.transition='opacity .35s'; f.style.opacity=0; });
    const u=await snap(); const L=bd.querySelector('#phLast'); L.innerHTML=''; if(!u){ L.appendChild(el('div','muted','Couldn\'t take a photo here.')); return; }
    const i=el('img'); i.src=u; i.onclick=()=>openApp('photos'); L.appendChild(i); };
});
app('photos','Photos','🖼️','linear-gradient(#fde68a,#f472b6 50%,#60a5fa)',bd=>{
  function grid(){ bd.innerHTML=''; if(!PH.length){ bd.appendChild(el('div','muted','No photos yet. Take some with the Camera.')); return; }
    const g=el('div','photos'); PH.forEach((p,i)=>{ const im=el('img'); im.src=p.u; im.alt=''; im.onclick=()=>view(i); g.appendChild(im); }); bd.appendChild(g); }
  function view(i){ const p=PH[i]; if(!p) return grid(); bd.innerHTML=''; const v=el('div','view'); const im=el('img'); im.src=p.u; v.appendChild(im); bd.appendChild(v);
    const s=el('div','muted'); s.textContent=new Date(p.t).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+(p.w?' · '+p.w:''); bd.appendChild(s);
    const r=el('div','row'); const back=el('button','btn g','‹ All'), dl=el('a','btn','⬇ Save'), del=el('button','btn r','🗑 Delete');
    dl.href=p.u; dl.download='yorkville-driver-'+p.t+'.jpg'; dl.style.textDecoration='none'; back.onclick=grid; del.onclick=()=>{ PH.splice(i,1); savePhotos(); grid(); };
    r.append(back,dl,del); bd.appendChild(r); }
  grid();
});

// Weather
app('weather','Weather','⛅','linear-gradient(#38bdf8,#2563eb)',bd=>{
  every(5000,()=>{ const raw=txt('wxl'), parts=raw.split('·').map(s=>s.trim()).filter(s=>s&&!/\d:\d\d/.test(s));
    const icon=(raw.match(/^\S+/)||[''])[0], temp=(raw.match(/-?\d+°F/)||[''])[0], what=parts.filter(s=>!/°F/.test(s)).map(s=>s.replace(/^\S+\s/,'')).join(' · ');
    bd.innerHTML='<div style="text-align:center;margin-top:14px"><div class="muted" style="font-size:15px;opacity:.85">'+esc(txt('place').replace(/Locating…/,'')||'Here')+'</div>'+
      '<div style="font-size:72px;margin-top:6px">'+esc(/\p{Extended_Pictographic}/u.test(icon)?icon:'🌡️')+'</div><div class="big" style="margin-top:0">'+esc(temp||'--°')+'</div><div style="font-size:17px">'+esc(what||'Waiting for the weather…')+'</div>'+
      '<div class="muted" style="margin-top:18px">The real weather where you\'re driving</div></div>'; });
});

// Clock with a stopwatch
app('clock','Clock','⏰','#111',bd=>{
  bd.innerHTML='<div class="big" id="phClk"></div><div style="text-align:center" class="muted" id="phDate"></div><div class="sec">Stopwatch</div><div class="big" id="phSw" style="font-size:44px">0:00.0</div>'+
    '<div class="row" style="justify-content:center"><button class="btn on" id="phSwGo">Start</button><button class="btn g" id="phSwR">Reset</button></div>';
  const SW=PHONE._sw||(PHONE._sw={t0:0,acc:0,on:false});
  const fmt=ms=>{ const s=ms/1000, m=Math.floor(s/60); return m+':'+(s%60).toFixed(1).padStart(4,'0'); };
  const go=bd.querySelector('#phSwGo');
  go.onclick=()=>{ if(SW.on){ SW.acc+=Date.now()-SW.t0; SW.on=false; } else { SW.t0=Date.now(); SW.on=true; } };
  bd.querySelector('#phSwR').onclick=()=>{ SW.on=false; SW.acc=0; };
  every(100,()=>{ const d=new Date(); $('phClk').textContent=d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}); $('phDate').textContent=d.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});
    $('phSw').textContent=fmt(SW.acc+(SW.on?Date.now()-SW.t0:0)); go.textContent=SW.on?'Stop':'Start'; go.className='btn '+(SW.on?'r':'on'); });
});

// Calculator
app('calc','Calculator','🧮','#f59e0b',bd=>{
  bd.innerHTML='<div id="phCalcD" style="font-size:46px;font-weight:300;text-align:right;margin-top:24px;overflow:hidden;white-space:nowrap">0</div><div class="calc"></div>';
  const D=bd.querySelector('#phCalcD'), K=bd.querySelector('.calc'); let a=null, op=null, cur='0', fresh=true;
  const show=()=>{ D.textContent=cur.length>11?(+cur).toPrecision(8).replace(/\.?0+(e|$)/,'$1'):cur; };
  const calc=(x,y,o)=>o==='+'?x+y:o==='−'?x-y:o==='×'?x*y:y===0?NaN:x/y;
  const fix=v=>!isFinite(v)?'Error':String(+v.toPrecision(12));
  for(const k of ['AC','±','%','÷','7','8','9','×','4','5','6','−','1','2','3','+','0','.','=']){ const b=el('button',/[÷×−+=]/.test(k)?'o':/AC|±|%/.test(k)?'f':k==='0'?'z':''); b.textContent=k; K.appendChild(b);
    b.onclick=()=>{ if(/\d/.test(k)){ cur=fresh||cur==='0'||cur==='Error'?k:cur+k; fresh=false; }
      else if(k==='.'){ if(fresh){ cur='0.'; fresh=false; } else if(!cur.includes('.')) cur+='.'; }
      else if(k==='AC'){ a=null; op=null; cur='0'; fresh=true; }
      else if(k==='±'){ cur=fix(-(+cur)); } else if(k==='%'){ cur=fix(+cur/100); }
      else if(k==='='){ if(op!=null&&a!=null){ cur=fix(calc(a,+cur,op)); a=null; op=null; fresh=true; } }
      else { if(op!=null&&a!=null&&!fresh) cur=fix(calc(a,+cur,op)); a=+cur; op=k; fresh=true; }
      show(); }; }
  show();
});

// Notes
app('notes','Notes','📝','linear-gradient(#fef08a,#facc15)',bd=>{
  bd.innerHTML='<textarea id="phNote" placeholder="Type a note… it saves by itself" style="height:calc(100% - 26px);resize:none;font-size:15px;line-height:1.4"></textarea><div class="muted">Saved on this device</div>';
  const t=bd.querySelector('#phNote'); t.value=LSg('ydPhoneNotes',''); t.oninput=()=>LSs('ydPhoneNotes',t.value); bd.style.height='100%';
});

// FordPass-style car app (owner 2026-11-22, with a photo of the app: "add the FordPass. It controls the car ... shows a
// picture of a car at the top"). Your car pictured at the top (the photo for the Explorer, Javelin and Navigator; the 3D
// cars drawn from their own model), miles driven and engine state, then the remote: unlock, start / stop, lock, and a row
// for horn & lights, headlights, sunroof, wipers and hazards. Tabs: Home, Vehicle (switch cars), Map.
// Locking works like a real remote: the lights flash and the horn chirps once (twice flashes to unlock).
const PICS={};
function carKey(){ return typeof mode!=='undefined'&&mode==='tractor'?'tractor':(typeof CARKEY!=='undefined'?CARKEY:'explorer'); }
function carPic(k){ if(PICS[k]) return PICS[k];
  const C=typeof CARS!=='undefined'?CARS[k]:null;
  if(k==='explorer'&&C&&C.fimg) return PICS[k]=C.fimg;
  const M=typeof MODELS!=='undefined'?MODELS[k]:null;
  if(M&&M.g&&window.THREE){ try{
    const W=640,H=360, cv=document.createElement('canvas'); cv.width=W; cv.height=H;
    const R=new THREE.WebGLRenderer({canvas:cv,alpha:true,antialias:true,preserveDrawingBuffer:true}); R.setSize(W,H,false);
    const sc=new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff,0x5a6070,1.15)); const d=new THREE.DirectionalLight(0xffffff,1.1); d.position.set(4,8,6); sc.add(d);
    const d2=new THREE.DirectionalLight(0xbfd4ff,.5); d2.position.set(-6,3,-4); sc.add(d2);
    const g=M.g.clone(true); g.visible=true; g.position.set(0,0,0); g.rotation.set(0,0,0); g.scale.set(1,1,1); g.traverse(o=>{ o.visible=o.visible!==false; }); sc.add(g);
    const box=new THREE.Box3().setFromObject(g), c=box.getCenter(new THREE.Vector3()), sz=box.getSize(new THREE.Vector3());
    const len=Math.max(sz.x,sz.z), cam=new THREE.PerspectiveCamera(26,W/H,.1,200);
    const fwd=sz.z>=sz.x?new THREE.Vector3(0,0,1):new THREE.Vector3(1,0,0), side=sz.z>=sz.x?new THREE.Vector3(1,0,0):new THREE.Vector3(0,0,-1);
    const sgn=(M.front||1);                                               // which end is the front: see the check below
    const dir=fwd.clone().multiplyScalar(.82*sgn).add(side.clone().multiplyScalar(.58)).normalize();
    cam.position.copy(c).add(dir.multiplyScalar(len*1.7)).add(new THREE.Vector3(0,sz.y*.55,0)); cam.lookAt(c.x,c.y-sz.y*.08,c.z);
    R.render(sc,cam); const u=cv.toDataURL('image/png'); R.dispose(); try{ R.forceContextLoss(); }catch(e){} return PICS[k]=u; }catch(e){ console.warn('phone car picture',e); } }
  return C&&(C.fimg||C.img)||null; }
app('car','FordPass','🚙','linear-gradient(#2563eb,#0b2a6b)',(bd,w)=>{
  w.style.background='#f4f6f9'; w.style.color='#10213d'; const hd=w.querySelector('.hd'); hd.style.cssText='justify-content:space-between;color:#10213d;font-size:13px;letter-spacing:.06em;white-space:nowrap'; hd.querySelector('button').textContent='‹';
  hd.querySelector('span').innerHTML='<span id="fpTitle" style="cursor:pointer">MY CAR ⌄</span>'; const acc=el('span','','👤'); acc.style.cssText='font-size:18px;opacity:.75'; hd.appendChild(acc);
  bd.style.cssText='padding:0;display:flex;flex-direction:column';
  bd.innerHTML='<style>#phone .fp{flex:1;overflow-y:auto;padding:0 12px}#phone .fpPic{height:118px;margin:0 -12px;background:linear-gradient(#cfd8e6,#eef1f6 70%,#f4f6f9);display:flex;align-items:flex-end;justify-content:center;overflow:hidden}'+
    '#phone .fpPic img{max-width:96%;max-height:116px;object-fit:contain;filter:drop-shadow(0 8px 6px rgba(0,0,0,.25))}'+
    '#phone .fpSt{display:flex;justify-content:space-around;text-align:center;margin:6px 0 0}#phone .fpSt b{font-size:19px;display:block}#phone .fpSt small{font-size:11px;opacity:.7}'+
    '#phone .fpPill{display:block;margin:5px auto;border:1.5px solid #10213d;border-radius:22px;background:#fff;color:#10213d;padding:7px 18px;font:500 13px system-ui;cursor:pointer}'+
    '#phone .fpMain{display:flex;justify-content:space-around;align-items:center;margin:4px 0}'+
    '#phone .fpC{width:48px;height:48px;border-radius:50%;background:#fff;border:0;box-shadow:0 3px 10px rgba(16,33,61,.15);font-size:22px;cursor:pointer;color:#10213d;display:flex;align-items:center;justify-content:center}'+
    '#phone .fpC.big{width:70px;height:70px;flex-direction:column;font-size:26px}#phone .fpC.big small{font-size:11px;margin-top:2px}#phone .fpC.on{background:#2563eb;color:#fff}#phone .fpC.run{background:#16a34a;color:#fff}'+
    '#phone .fpRow{display:flex;justify-content:space-between;margin:2px 0 6px}#phone .fpRow div{display:flex;flex-direction:column;align-items:center;width:20%;font-size:10px;text-align:center;gap:4px}'+
    '#phone .fpRow .fpC{width:40px;height:40px;font-size:17px}#phone .fpNote{text-align:center;font-size:11px;opacity:.6;min-height:14px}'+
    '#phone .fpTabs{flex:none;display:flex;justify-content:space-around;border-top:1px solid #dde3ec;background:#fff;padding:6px 0 2px}#phone .fpTabs button{background:none;border:0;color:#6b7a90;font-size:10px;display:flex;flex-direction:column;align-items:center;cursor:pointer}'+
    '#phone .fpTabs button i{font-style:normal;font-size:17px}#phone .fpTabs button.on{color:#10213d;font-weight:600}#phone .fpCars .li{border-color:#dde3ec}</style>'+
    '<div class="fp" id="fpHome"><div class="fpPic" id="fpPic"></div><div class="fpSt"><div><b id="fpMi">0</b><small>Miles driven</small></div><div><b id="fpEng">Off</b><small>Engine</small></div><div><b id="fpTmp">--</b><small>Outside</small></div></div>'+
    '<button class="fpPill" id="fpMap">View on map ›</button>'+
    '<div class="fpMain"><button class="fpC" id="fpUn" aria-label="Unlock">🔓</button><button class="fpC big" id="fpStart"><span>⏻</span><small>Start</small></button><button class="fpC" id="fpLk" aria-label="Lock">🔒</button></div>'+
    '<div class="fpNote" id="fpNote"></div>'+
    '<div class="fpRow"><div><button class="fpC" id="fpHL">📯</button>Horn &amp; Lights</div><div><button class="fpC" id="fpLi">💡</button><span id="fpLiT">Lights</span></div><div><button class="fpC" id="fpRoof">☀️</button>Sunroof</div><div><button class="fpC" id="fpWip">🌧️</button>Wipers</div><div><button class="fpC" id="fpHaz">⚠️</button>Hazards</div></div></div>'+
    '<div class="fp fpCars" id="fpCars" style="display:none"></div>'+
    '<div class="fpTabs"><button class="on" data-t="home"><i>🏠</i>Home</button><button data-t="cars"><i>🚘</i>Vehicle</button><button data-t="map"><i>📍</i>Map</button></div>';
  const IG=window.IGN, SG=window.SIG, CK=window.COCKPIT, LT=window.LIGHTS, q=id=>w.querySelector('#'+id);
  const note=(t)=>{ q('fpNote').textContent=t; clearTimeout(note.t); note.t=setTimeout(()=>{ q('fpNote').textContent=''; },2500); };
  let shown=null;
  function pic(){ const k=carKey(); if(k===shown) return; shown=k; const P=q('fpPic'); P.innerHTML=''; const u=carPic(k);
    if(u){ const i=el('img'); i.alt=''; i.src=u; P.appendChild(i); } else { const s=el('div','','🚜'); s.style.cssText='font-size:80px;line-height:1'; P.appendChild(s); }
    const b=document.querySelector('#carPick .on'); q('fpTitle').textContent='MY '+(b?b.textContent.replace(/[^\w\s]/g,'').trim().toUpperCase():'CAR')+' ⌄'; }
  // remote lock / unlock: flash the lights (and chirp the horn to lock)
  function flash(n,chirp){ if(!SG) return; if(SG.haz) return; let k=0; const tgl=()=>{ SG.hazard(); if(++k<n*2) setTimeout(tgl,420); }; tgl();
    if(chirp){ PHONE.horn=true; setTimeout(()=>{ PHONE.horn=false; },140); } }
  q('fpLk').onclick=()=>{ PHONE.locked=true; flash(1,true); note('🔒 Locked'); };
  q('fpUn').onclick=()=>{ PHONE.locked=false; flash(2,false); note('🔓 Unlocked'); };
  q('fpStart').onclick=()=>{ if(!IG) return; const on=IG.state==='on'||IG.state==='crank'; if(on&&mph()>5) return note('Slow down first'); IG.button(); note(on?'Engine off':'Starting…'); };
  q('fpHL').onpointerdown=()=>{ PHONE.horn=true; }; for(const e of ['onpointerup','onpointerleave','onpointercancel']) q('fpHL')[e]=()=>{ PHONE.horn=false; };
  q('fpHL').onclick=()=>flash(2,false);
  q('fpLi').onclick=()=>{ if(LT&&LT.cycle) LT.cycle(); }; q('fpRoof').onclick=()=>{ if(CK&&CK.roof) CK.roof('vent'); };
  q('fpWip').onclick=()=>{ if(CK&&CK.wiper) CK.wiper(); }; q('fpHaz').onclick=()=>SG&&SG.hazard();
  q('fpMap').onclick=()=>openApp('maps');
  function cars(){ const L=q('fpCars'); L.innerHTML='<div class="sec" style="color:#10213d">Your vehicles</div>';
    for(const b of document.querySelectorAll('#carPick button')){ const nm=b.textContent.replace(/[^\w\s]/g,'').trim(), k=b.dataset.car;
      const r=li(nm,b.classList.contains('on')?'✓ Driving now':'',()=>{ b.click(); shown=null; tab('home'); },null); L.appendChild(r); } }
  function tab(t){ if(t==='map') return openApp('maps'); for(const b of bd.querySelectorAll('.fpTabs button')) b.classList.toggle('on',b.dataset.t===t);
    q('fpHome').style.display=t==='home'?'':'none'; q('fpCars').style.display=t==='cars'?'':'none'; if(t==='cars') cars(); }
  for(const b of bd.querySelectorAll('.fpTabs button')) b.onclick=()=>tab(b.dataset.t);
  q('fpTitle').onclick=()=>tab('cars');
  every(300,()=>{ pic(); const on=IG&&(IG.state==='on'||IG.state==='crank');
    const P=window.YD&&YD.PROG&&YD.PROG.P, mi=P&&P.dist?(P.dist.car||0)+(P.dist.tractor||0):0; q('fpMi').textContent=Math.round(mi).toLocaleString();
    q('fpEng').textContent=on?'Running':'Off'; const t=(txt('wxl').match(/-?\d+°F/)||[''])[0]; q('fpTmp').textContent=t||'--';
    const s=q('fpStart'); s.className='fpC big'+(on?' run':''); s.querySelector('small').textContent=on?'Stop':'Start';
    q('fpLk').className='fpC'+(PHONE.locked?' on':''); q('fpUn').className='fpC'+(PHONE.locked===false?' on':'');
    q('fpHaz').className='fpC'+(SG&&SG.haz?' on':''); q('fpWip').className='fpC'+(CK&&CK.wipe?' on':'');
    const R=CK&&CK.roofState?CK.roofState():null; q('fpRoof').className='fpC'+(R&&(R.slide||R.vent)?' on':'');
    const lm=LT?String(LT.mode||''):''; q('fpLi').className='fpC'+(LT&&LT.on&&LT.on()?' on':''); q('fpLiT').textContent=lm?'Lights: '+lm[0].toUpperCase()+lm.slice(1):'Lights'; });
  return ()=>{ PHONE.horn=false; };
});

// Voice, Settings, Controls
app('voice','Voice','🎙️','linear-gradient(#a78bfa,#6d28d9)',bd=>{
  bd.innerHTML='<div style="text-align:center;margin-top:30px"><button class="shut" style="background:#6d28d9;border-color:#a78bfa;font-size:28px">🎙️</button><div>Tap and say what you want</div>'+
    '<div class="muted" style="margin-top:14px">"Play 93.9" · "Drive me to Navy Pier" · "Open the sunroof" · "What\'s the weather" · "Help"</div></div>';
  bd.querySelector('.shut').onclick=()=>window.VOICE&&VOICE.listen();
});
app('settings','Settings','⚙️','#6b7280',()=>{ close(); const g=$('gear'); if(g) g.click(); },true);
app('controls','Controls','🎮','linear-gradient(#34d399,#0d9488)',()=>{ close(); if(window.CTRLVIEW&&CTRLVIEW.toggle) CTRLVIEW.toggle(); });

// ---------- open / close
function open(appId){ ph.classList.add('on'); if(pbtn) pbtn.classList.add('on'); if(appId) openApp(appId); else if(cur==null) home(); status(); }
function close(){ ph.classList.remove('on'); if(pbtn) pbtn.classList.remove('on'); ph.classList.remove('driving');
  if(cur==='tube'||cur==='car') home();   /* Spotify keeps playing with the phone put away */ if(document.activeElement&&ph.contains(document.activeElement)) document.activeElement.blur(); }
function toggle(){ ph.classList.contains('on')?close():open(); }
$('phHome').onclick=()=>{ if(cur==null) close(); else home(); };
setInterval(()=>{ if(ph.classList.contains('on')) status(); },1000);
/* the car turned off (owner 2026-11-22: "make the music stop when I turn off the car"): the car's own music already pauses
   (music.js); the phone's music and videos stop too, as if they were playing through the car. YouTube Music picks up
   again when the engine starts. */
let ignWas=null;
setInterval(()=>{ const I=window.IGN; if(!I) return; const on=I.state==='on'||I.state==='crank';
  if(ignWas===true&&!on){ if(YM.fr&&!YM.paused){ ymCmd('pauseVideo'); YM.paused=true; YM.byCar=true; } if(TUBE_PAUSE) TUBE_PAUSE(); if(SPOT_STOP) SPOT_STOP(); }
  else if(ignWas===false&&on){ if(SPOT_GO) SPOT_GO(); if(YM.byCar){ YM.byCar=false; if(YM.fr){ ymCmd('playVideo'); YM.paused=false; } } }
  ignWas=on; },250);
addEventListener('keydown',e=>{ if(e.key==='Escape'&&ph.classList.contains('on')&&!(e.target&&/INPUT|TEXTAREA/.test(e.target.tagName))) close(); });
function duck(on){ if(on){ if(SP.ctl&&!SP.paused){ SP.ctl.pause(); SP.byVoice=true; } } else if(SP.ctl&&SP.byVoice){ SP.byVoice=false; SP.ctl.resume(); } }
window.PHONE={locked:null,duck,get ytm(){ return PHONE_YM; },open,close,toggle,snap,openApp,spotOf:v=>PHONE_SPOT(v),horn:false,get isOpen(){ return ph.classList.contains('on'); }};
home();
})();
