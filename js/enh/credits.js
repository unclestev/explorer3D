/* Map credits, kept out of the way.
   MapLibre's own credits bar sat at the bottom of the screen, opened wide on start and never folded away (the map
   isn't dragged, which is what normally collapses it). It's turned off in game.js; instead a small dim ⓘ sits at the
   end of the top-right buttons. Tapping it shows the credits of every map source in use (map style, terrain,
   satellite photos when on) in a small card that closes by itself after 8 s, or on any tap elsewhere. */
(()=>{
'use strict';
const {safe}=YD;
const bar=document.getElementById('zoom');
const btn=document.createElement('button'); btn.id='infoBtn'; btn.className='mini'; btn.textContent='i';
btn.title='Map credits'; btn.setAttribute('aria-label','Map credits');
const card=document.createElement('div'); card.id='credits'; card.setAttribute('role','note');
bar.appendChild(btn); document.body.appendChild(card);
let hideT=0;

function credits(){
  const out=[], seen=new Set();
  safe('credits',()=>{ for(const id of Object.keys(map.getStyle().sources||{})){
    const a=(map.getSource(id)||{}).attribution; if(!a) continue;
    for(const part of String(a).split(/\s*(?:\||<br\s*\/?>)\s*/)) if(part&&!seen.has(part)){ seen.add(part); out.push(part); } } });
  return out.length?out:['© OpenStreetMap contributors'];
}
function open(){
  card.innerHTML=credits().map(c=>'<div>'+c+'</div>').join('');
  for(const a of card.querySelectorAll('a')){ a.target='_blank'; a.rel='noopener'; }
  const r=btn.getBoundingClientRect();
  card.style.top=Math.round(r.bottom+6)+'px'; card.style.right=Math.round(innerWidth-r.right)+'px';
  card.classList.add('on'); btn.classList.add('on');
  clearTimeout(hideT); hideT=setTimeout(close,8000);
}
function close(){ card.classList.remove('on'); btn.classList.remove('on'); clearTimeout(hideT); }
btn.addEventListener('click',e=>{ e.stopPropagation(); card.classList.contains('on')?close():open(); });
for(const t of ['pointerdown','click']) card.addEventListener(t,e=>e.stopPropagation());
document.addEventListener('pointerdown',e=>{ if(e.target!==btn&&card.classList.contains('on')) close(); });
})();
