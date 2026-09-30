/* Destination search: 🔍 opens a box where you type an address or place name; pick a result and the car gets
   directions there from wherever it is in the game. Uses OpenStreetMap's Nominatim search (free, no key), with
   results near the car first. Nothing about your real location is used. Tapping the map still routes too. */
(()=>{
'use strict';
const {EMPTY}=YD;
const btn=document.getElementById('find'), panel=document.getElementById('findPanel'), form=document.getElementById('findForm'),
  input=document.getElementById('findQ'), list=document.getElementById('findList'), closeBtn=document.getElementById('findX');
const F={busy:false,lastQ:'',lastT:0};

function open(){ panel.classList.add('on'); list.innerHTML=''; setTimeout(()=>{ try{ input.focus(); input.select(); }catch(e){} },50); }
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
    for(const o of res){ const {name,sub}=label(o.x);
      const el=row(`<b>${esc(name)}</b><span>${esc(sub)}</span><i>${esc(YD.fmtDist(o.d))}</i>`,'findHit');
      el.addEventListener('click',e=>{ e.stopPropagation(); go(o,name); }); }
  }catch(e){ list.innerHTML=''; row('Search isn’t reachable right now. Check your connection and try again'); console.warn('search',e); }
  finally{ clearTimeout(to); F.busy=false; }
}
function go(o,name){
  close();
  if(mode==='glider'){ toast('Land first (triple-tap the gas), then search again',2600); return; }
  YD.NAV.dest=[o.lng,o.lat]; YD.setDest(YD.NAV.dest); YD.requestRoute(false);
  setTimeout(()=>{ if(YD.NAV.pts) toast('Heading to '+name+' · tap AUTO to let the car drive',2800); },2600);
}

btn.addEventListener('click',e=>{ e.stopPropagation(); panel.classList.contains('on')?close():open(); });
closeBtn.addEventListener('click',e=>{ e.stopPropagation(); close(); });
form.addEventListener('submit',e=>{ e.preventDefault(); search(input.value); });
// typing must not drive the car (the game listens for W/A/S/D, arrows and space on the whole page)
for(const t of ['keydown','keyup','keypress']) input.addEventListener(t,e=>{ e.stopPropagation(); if(t==='keydown'&&e.key==='Escape') close(); });
for(const t of ['pointerdown','click','touchstart']) panel.addEventListener(t,e=>e.stopPropagation());
})();
