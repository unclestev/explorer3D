/* Picks up new versions of the game without reinstalling the home-screen app.
   There's no service worker, so the app loads index.html like a web page — but the phone may keep a copy of it for a
   few minutes (GitHub Pages allows 10). This asks the server for a fresh index.html (bypassing that copy) and checks
   whether it lists any file version (?v=) the running page doesn't have.
   - Just after start, before you've driven anywhere: reloads straight away into the new version.
   - Later (e.g. coming back to the app): shows a small "New version — tap to update" button instead, so a drive is
     never interrupted. (Your position is saved by js/enh/savepos.js, so tapping it picks up where you were.) */
(()=>{
'use strict';
const T0=Date.now();
// the page's own script/stylesheet files (with their ?v= versions)
const urls=doc=>[...doc.querySelectorAll('script[src],link[rel=stylesheet]')]
  .map(e=>e.getAttribute('src')||e.getAttribute('href')).filter(u=>u&&!/^https?:|^\/\//.test(u));
// Out of date = the server's page lists a file version this page doesn't have. Files the game adds by itself while
// running (the 3D model loader, js/lib/GLTFLoader.js, when a 3D car is picked) aren't in the HTML and don't count —
// comparing the whole lists made that extra file look like an update every time, and the button never went away.
function staleKey(html){
  const F=urls(new DOMParser().parseFromString(html,'text/html')), C=new Set(urls(document));
  return F.length&&F.some(u=>!C.has(u))?F.sort().join('|'):'';
}
const ss={get:k=>{ try{ return sessionStorage.getItem(k); }catch(e){ return null; } },set:(k,v)=>{ try{ sessionStorage.setItem(k,v); }catch(e){} }};
// Load the new version (see freshLoad below). At most twice per version per session: if the server keeps listing files
// this page doesn't get even after that, stop asking rather than loop.
function update(key){
  const n=+(ss.get('ydUpdN:'+key)||0);
  if(n>=2) return false;
  ss.set('ydUpdN:'+key,String(n+1)); ss.set('ydUpd',String(Date.now()));
  try{ if(window.SAVEPOS) SAVEPOS.save(true); }catch(e){}
  freshLoad(); return true;
}
let busy=false, shown=false, away=0;

function offer(key){
  if(shown) return; shown=true;
  const b=document.createElement('button');
  b.textContent='New version — tap to update';
  b.style.cssText='position:fixed;left:50%;top:calc(max(env(safe-area-inset-top),10px) + 4px);transform:translateX(-50%);z-index:60;'+
    'border:0;border-radius:999px;padding:8px 14px;background:#1d4ed8;color:#fff;font:600 13px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.35)';
  for(const t of ['pointerdown','click']) b.addEventListener(t,e=>e.stopPropagation());
  b.addEventListener('click',()=>{ if(update(key)){ b.textContent='Updating…'; b.disabled=true; } else b.remove(); });
  document.body.appendChild(b);
  setTimeout(()=>{ b.remove(); shown=false; },60000);           // asks again next time you come back
}
// A plain reload can be served the phone's saved copy of the old page (home-screen apps on iPhone do this), which still
// lists the old files, so the button came straight back. Loading the page under an address it has never seen
// (?upd=<time>) can't come from any saved copy; the extra bit is taken off the address again once the page opens.
function freshLoad(){
  let u; try{ u=new URL(location.href); u.searchParams.set('upd',String(Date.now())); u=u.toString(); }
  catch(e){ u=location.pathname+'?upd='+Date.now(); }
  location.replace(u);
}
try{ const u=new URL(location.href); if(u.searchParams.has('upd')){ u.searchParams.delete('upd'); history.replaceState(history.state,'',u.pathname+u.search+u.hash); } }catch(e){}
function check(){
  if(busy||!navigator.onLine) return; busy=true;
  // cache:'reload' fetches from the server and also refreshes the phone's stored copy, so a reload gets the new page
  fetch(location.pathname,{cache:'reload'}).then(r=>r.ok?r.text():null).then(html=>{
    if(!html) return;
    const key=staleKey(html); if(!key) return;                   // (read now: this file loads before the rest of the page)
    if(+(ss.get('ydUpdN:'+key)||0)>=2) return;                    // couldn't get it twice this session: don't nag
    const driven=typeof S!=='undefined'&&S.dist>30;
    const recent=Date.now()-(+ss.get('ydUpd')||0)<60000;
    if(Date.now()-T0<20000&&!driven&&!recent) update(key);
    else offer(key);
  }).catch(()=>{}).finally(()=>{ busy=false; });
}
setTimeout(check,1500);
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){ away=Date.now(); return; }
  if(away&&Date.now()-away>30000) check();
});
})();
