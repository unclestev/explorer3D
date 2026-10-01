/* Destination search: 🔍 opens a box where you type an address or place name; pick a result and the car gets
   directions there from wherever it is in the game. Uses OpenStreetMap's Nominatim search (free, no key), with
   results near the car first. Nothing about your real location is used. This is the only way to set a destination.
   Favorites and recents: opening 🔍 (or clearing the box) lists ★ Favorites and Recent destinations, nearest-first
   distances from the car. Tap ☆ on any result, recent or favorite to save / un-save it; "Save this spot" stores where
   you are now under a name you choose. Saved on this device (localStorage ydFav, max 40; ydRecent, last 10). */
(()=>{
'use strict';
const {EMPTY}=YD;
const btn=document.getElementById('find'), panel=document.getElementById('findPanel'), form=document.getElementById('findForm'),
  input=document.getElementById('findQ'), list=document.getElementById('findList'), closeBtn=document.getElementById('findX');
const F={busy:false,lastQ:'',lastT:0};

/* ---------- favorites + recent destinations ---------- */
const load=k=>{ try{ const v=JSON.parse(localStorage.getItem(k)||'[]'); return Array.isArray(v)?v.filter(o=>o&&isFinite(o.lat)&&isFinite(o.lng)):[]; }catch(e){ return []; } };
const store=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
let FAV=load('ydFav'), RECENT=load('ydRecent');
const same=(a,b)=>meters(a.lat,a.lng,b.lat,b.lng)<30;                // one spot = within 30 m
const isFav=o=>FAV.some(f=>same(f,o));
const plain=o=>({name:String(o.name||'Saved place').slice(0,80),sub:String(o.sub||'').slice(0,120),lat:+(+o.lat).toFixed(6),lng:+(+o.lng).toFixed(6)});
function toggleFav(o){
  if(isFav(o)){ FAV=FAV.filter(f=>!same(f,o)); toast('Removed from favorites',1500); }
  else { FAV.unshift(plain(o)); FAV=FAV.slice(0,40); toast('★ Saved to favorites',1500); }
  store('ydFav',FAV);
}
function addRecent(o){ RECENT=[plain(o)].concat(RECENT.filter(r=>!same(r,o))).slice(0,10); store('ydRecent',RECENT); }
function saveHere(){
  const town=((document.getElementById('place')||{}).textContent||'').split(',')[0];
  const def=(roadName||'')+(roadName&&town?', ':'')+(town&&!/Locating/.test(town)?town:'')||'My spot';
  let name=null; try{ name=window.prompt('Name this spot (e.g. Home, Work)',def); }catch(e){ name=def; }
  if(name==null) return;                                            // cancelled
  name=name.trim()||def;
  const o={name,sub:def!==name?def:'',lat:S.lat,lng:S.lng};
  FAV=[plain(o)].concat(FAV.filter(f=>!same(f,o))).slice(0,40); store('ydFav',FAV);
  toast('★ Saved “'+name+'”',1600); showSaved();
}
// one result row: name, address line, distance from the car, and a star to save it
function placeRow(o,onGo){
  const d=meters(S.lat,S.lng,o.lat,o.lng);
  const el=row(`<b>${esc(o.name)}</b><span>${esc(o.sub||'')}</span><i>${esc(YD.fmtDist(d))}</i><button class="star" aria-label="Favorite">${isFav(o)?'★':'☆'}</button>`,'findHit');
  el.addEventListener('click',e=>{ e.stopPropagation(); onGo(); });
  const st=el.querySelector('.star');
  st.addEventListener('click',e=>{ e.stopPropagation(); toggleFav(o); st.textContent=isFav(o)?'★':'☆'; st.classList.toggle('on',isFav(o)); if(!input.value.trim()) showSaved(); });
  st.classList.toggle('on',isFav(o));
  return el;
}
function head(text,btnText,onBtn){
  const h=row(`<span>${text}</span>`+(btnText?`<button>${btnText}</button>`:''),'findHead');
  if(btnText) h.querySelector('button').addEventListener('click',e=>{ e.stopPropagation(); onBtn(); });
}
function showSaved(){
  list.innerHTML='';
  head('★ Favorites','＋ Save this spot',saveHere);
  if(!FAV.length) row('Tap ☆ on a search result to keep it here');
  for(const f of FAV) placeRow(f,()=>go(f,f.name));
  if(RECENT.length){
    head('Recent','Clear',()=>{ RECENT=[]; store('ydRecent',RECENT); showSaved(); });
    for(const r of RECENT) placeRow(r,()=>go(r,r.name));
  }
}

function open(){ panel.classList.add('on'); input.value=''; showSaved(); setTimeout(()=>{ try{ input.focus(); }catch(e){} },50); }
function close(){ panel.classList.remove('on'); try{ input.blur(); }catch(e){} }
function row(html,cls){ const d=document.createElement('div'); d.className=cls||'findMsg'; d.innerHTML=html; list.appendChild(d); return d; }
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// short title + the useful rest of the address
function label(r){
  const a=r.address||{}, name=r.name||(a.house_number&&a.road?a.house_number+' '+a.road:'')||r.display_name.split(',')[0];
  const town=a.city||a.town||a.village||a.hamlet||a.suburb||a.county||'', st=a.state||'';
  const sub=[a.house_number&&a.road&&!name.includes(a.road)?a.house_number+' '+a.road:(a.road&&!name.includes(a.road)?a.road:''),town,st].filter(Boolean).join(', ');
  return {name,sub};
}
async function search(q){
  q=q.trim(); if(!q||F.busy) return;
  if(q===F.lastQ&&Date.now()-F.lastT<1500) return;                  // Nominatim asks for at most one search a second
  F.busy=true; F.lastQ=q; F.lastT=Date.now(); list.innerHTML=''; row('Searching…');
  const lat=S.lat, lng=S.lng, vb=[lng-.4,lat+.3,lng+.4,lat-.3].map(v=>v.toFixed(4)).join(',');
  const url='https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&accept-language=en&viewbox='+vb+'&q='+encodeURIComponent(q);
  const ctl=new AbortController(), to=setTimeout(()=>ctl.abort(),10000);
  try{
    const r=await fetch(url,{signal:ctl.signal}); if(!r.ok) throw new Error('search '+r.status);
    const res=(await r.json()).map(x=>({x,lng:+x.lon,lat:+x.lat,d:meters(lat,lng,+x.lat,+x.lon)})).filter(o=>isFinite(o.lng)&&isFinite(o.lat)).sort((a,b)=>a.d-b.d);
    list.innerHTML='';
    if(!res.length){ row('Nothing found. Try adding the town, e.g. “Main St, Yorkville”'); return; }
    for(const o of res){ const {name,sub}=label(o.x), p={name,sub,lat:o.lat,lng:o.lng};
      placeRow(p,()=>go(p,name)); }
  }catch(e){ list.innerHTML=''; row('Search isn’t reachable right now. Check your connection and try again'); console.warn('search',e); }
  finally{ clearTimeout(to); F.busy=false; }
}
function go(o,name){
  close();
  if(mode==='glider'){ toast('Land first (tap 🪂), then search again',2600); return; }
  addRecent(Object.assign({name},o));
  YD.NAV.dest=[o.lng,o.lat]; YD.setDest(YD.NAV.dest); YD.requestRoute(false);
  setTimeout(()=>{ if(YD.NAV.pts) toast('Heading to '+name+' · tap AUTO to let the car drive',2800); },2600);
}

btn.addEventListener('click',e=>{ e.stopPropagation(); panel.classList.contains('on')?close():open(); });
closeBtn.addEventListener('click',e=>{ e.stopPropagation(); close(); });
form.addEventListener('submit',e=>{ e.preventDefault(); search(input.value); });
input.addEventListener('input',()=>{ if(!input.value.trim()) showSaved(); });   // cleared the box: back to favorites + recents
// typing must not drive the car (the game listens for W/A/S/D, arrows and space on the whole page)
for(const t of ['keydown','keyup','keypress']) input.addEventListener(t,e=>{ e.stopPropagation(); if(t==='keydown'&&e.key==='Escape') close(); });
for(const t of ['pointerdown','click','touchstart']) panel.addEventListener(t,e=>e.stopPropagation());
YD.PLACES={fav:()=>FAV,recent:()=>RECENT,toggleFav,addRecent};
})();
