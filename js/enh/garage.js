/* Garage doors (owner 2026-11-22: "open garage doors with a garage door opener in each of the cars on the sun visor,
   unless the vehicle has a button on the rearview mirror ... also a garage door opener on the mobile phone").
   Every garage door that js/enh/buildings.js draws on a house can be opened and closed:
   - the opener: K key, the 🏠 button that shows in the top bar while a garage is in range, tapping the opener in the
     cockpit (a clip-on remote on the driver's sun visor; the Navigator and Expedition have three buttons under the
     rear-view mirror instead), the phone's Garage app, or saying "open the garage";
   - in range = in the driveway in front of the door (up to ~12 m out, a little wider than the door) or inside the garage,
     whether you're in a car or on foot;
   - the door rolls up in about 4 s; pressing again while it moves reverses it; it won't close on a car or a person
     standing under it (it goes back up, like the real safety sensors).
   With the door open you can drive in: the car lines up through the opening (a little slack either side), the garage is
   about as deep as the house (4–7.5 m), its walls stop you, and you drive or back out the same way. Inside, the house
   is drawn cut away (js/enh/walk.js) so you can see the car in its garage; you can close the door behind you, get out
   and walk around, and get back in. The data doesn't say where real garages are; buildings.js guesses (houses with a
   long enough street side, most of them). Doors start shut each time you load the game. */
(()=>{
'use strict';
const {safe,onReady,onTick}=YD;
const G={o:{},dir:{},told:false};                    // gk -> how open (0..1) / moving (+1 opening, -1 closing)
const OPEN_S=4;                                      // seconds to roll fully up or down
const btn=document.getElementById('garBtn');

/* ---------- where the garages are (the houses near you with a garage door) ---------- */
const loc=(r,lat,lng)=>[(lng-r.cx)*r.kx,(lat-r.cy)*r.ky];
function inP(p,x,y){ let c=false; for(let i=0,j=p.length-1;i<p.length;j=i++){ const a=p[i],b=p[j]; if(((a[1]>y)!==(b[1]>y))&&(x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])) c=!c; } return c; }
function near(lat,lng,m){ const out=[]; if(!window.ROOFS||!ROOFS.doorsNear) return out;
  const mlat=m/111320, mlng=m/(111320*Math.cos(lat*Math.PI/180));
  for(const r of ROOFS.doorsNear()){ if(!r.garages||!r.garages.length) continue; const b=r.bb;
    if(lng<b[0]-mlng||lng>b[2]+mlng||lat<b[1]-mlat||lat>b[3]+mlat) continue; out.push(r); }
  return out; }
// a point in a garage's own frame: al = along the door from its middle, dep = metres in from the door (negative = outside)
function frame(r,g,lat,lng){ const q=loc(r,lat,lng), L=Math.hypot(g.x1-g.x0,g.y1-g.y0)||1, ux=(g.x1-g.x0)/L, uy=(g.y1-g.y0)/L, mx=(g.x0+g.x1)/2, my=(g.y0+g.y1)/2;
  return {al:(q[0]-mx)*ux+(q[1]-my)*uy, dep:-((q[0]-mx)*g.nx+(q[1]-my)*g.ny), half:L/2, bay:L/2+.6}; }
function inBay(r,g,lat,lng){ const f=frame(r,g,lat,lng); return f.dep>0&&f.dep<g.D+.5&&Math.abs(f.al)<f.bay; }
function inDrive(r,g,lat,lng){ const f=frame(r,g,lat,lng); return f.dep<=0&&f.dep>-12&&Math.abs(f.al)<f.half+1.5; }
// the garage the opener reaches from where you are (you, or the car you're in): inside one first, then the nearest driveway
function target(){ let best=null, bd=1e9;
  for(const r of near(S.lat,S.lng,20)) for(const g of r.garages){
    if(inBay(r,g,S.lat,S.lng)) return {r,g,inside:true};
    if(inDrive(r,g,S.lat,S.lng)){ const f=frame(r,g,S.lat,S.lng), d=Math.hypot(f.al,f.dep); if(d<bd){ bd=d; best={r,g}; } } }
  return best; }
const openness=gk=>G.o[gk]||0;

/* ---------- the opener ---------- */
function press(from,want){
  const t=target();
  if(!t){ toast('🏠 No garage in range: pull into the driveway in front of a garage door (or be inside the garage)',2800); return 'none'; }
  const k=t.g.gk, o=openness(k), d=G.dir[k];
  if(want==='open'&&(d>0||(!d&&o>.99))){ toast('🏠 The garage door is already '+(d>0?'opening':'open'),1500); return 'already'; }
  if(want==='close'&&(d<0||(!d&&o<.01))){ toast('🏠 The garage door is already '+(d<0?'closing':'shut'),1500); return 'already'; }
  const opening=d?d<0:o<.5;                                       // moving: reverse it; still: open if shut, shut if open
  G.dir[k]=opening?1:-1;
  toast(opening?'🏠 Garage door opening':'🏠 Garage door closing',1500);
  if(!G.told&&opening){ G.told=true; setTimeout(()=>toast('Drive in slowly, lined up with the door. Press the opener again to close it',3200),1600); }
  dirty=true; return opening?'open':'close';
}

/* ---------- the car and the garage (called from js/game.js when the car moves) ----------
   'pass': driving in / out through the open door or around inside: skip the building collision
   'wall': a wall or the shut door: stop.  null: not near a garage: the usual rules. */
function gate(lat,lng,nLat,nLng,ahead){
  for(const r of near(nLat,nLng,12)) for(const g of r.garages){
    const c=frame(r,g,nLat,nLng), a=frame(r,g,ahead[1],ahead[0]), open=openness(g.gk)>.85;
    const cIn=c.dep>0&&(Math.abs(c.al)<c.bay||inP(r.p,...loc(r,nLat,nLng)))&&c.dep<g.D+2, aIn=a.dep>0&&Math.abs(a.al)<a.bay+.5;
    if(cIn){
      if(a.dep>0) return (Math.abs(a.al)<a.bay||Math.abs(a.al)<Math.abs(c.al))&&a.dep<g.D?'pass':'wall';   // around inside: the back and side walls (never stuck off to one side)
      return open&&Math.abs(a.al)<a.half?'pass':'wall';                            // nose out through the door (if it's up)
    }
    if(aIn&&c.dep>-9){
      if(open&&Math.abs(a.al)<a.half-.1&&Math.abs(c.al)<a.half+.5) return 'pass';  // lined up with the open door: in you go
      if(!open&&a.dep<.6&&Math.abs(a.al)<a.half){ if(!(G.shutT>performance.now())){ G.shutT=performance.now()+3500; toast('🏠 The garage door is shut: press the opener (K, 🏠 or your phone)',2200); } }
    } }
  return null; }

/* ---------- every frame: roll the doors, keep the cut-away view while the car is in a garage ---------- */
function anyUnder(r,g){                                           // the car or you standing in the doorway
  const f=frame(r,g,S.lat,S.lng); if(Math.abs(f.al)<f.half+.3&&Math.abs(f.dep)<(mode==='walk'?.6:2.6)) return true;
  const P=window.WALK&&WALK.parkedAt; if(mode==='walk'&&P&&P.mode){ const q=frame(r,g,P.lat,P.lng); if(Math.abs(q.al)<q.half+.3&&Math.abs(q.dep)<2.6) return true; }
  return false; }
function findGk(gk){ for(const r of (window.ROOFS&&ROOFS.doorsNear?ROOFS.doorsNear():[])) for(const g of r.garages||[]) if(g.gk===gk) return {r,g}; return null; }
function setState(gk){ if(!map.getSource('roofs')) return; safe('garage state',()=>map.setFeatureState({source:'roofs',id:gk},{o:openness(gk)})); }
FRAME_HOOKS.push(function garageStep(dt){
  let moved=false;
  for(const k in G.dir){ const gk=+k, d=G.dir[k]; let o=openness(gk);
    if(d<0&&o>.02){ const t=findGk(gk); if(t&&anyUnder(t.r,t.g)){ G.dir[k]=1; toast('🏠 Something is under the garage door: going back up',2000); continue; } }
    o=Math.max(0,Math.min(1,o+d*dt/OPEN_S)); G.o[k]=o; setState(gk);
    if((d>0&&o>=1)||(d<0&&o<=0)) delete G.dir[k];
    if(window.WALK&&WALK.inside&&WALK.inside.rec&&(WALK.inside.rec.garages||[]).some(g=>g.gk===gk)) WALK.redrawInside();
    moved=true; }
  // in the car: the cut-away view while the car is inside a house's garage
  if((mode==='car'||mode==='tractor')&&window.WALK&&WALK.setInside){
    let r=null; const cur=WALK.inside&&WALK.inside.rec;
    if(cur&&WALK.inRec(cur,S.lat,S.lng)) r=cur; else for(const q of near(S.lat,S.lng,4)) if(WALK.inRec(q,S.lat,S.lng)&&(!WALK.deepIn||WALK.deepIn(q,S.lat,S.lng,2.4))){ r=q; break; }   // well inside (a garage), not just over the outline (owner 2026-11-24)
    if((r?r.key:null)!==(cur?cur.key:null)){ WALK.setInside(r); moved=true; } }
  return moved; });
// the map rebuilds the roofs now and then (new tiles, moving on): put the doors' state back
onTick(1000,function garageKeep(){ for(const k in G.o) if(G.o[k]>0) setState(+k); });

/* ---------- the 🏠 button: shows while a garage is in range, green while that door is open ---------- */
onTick(250,function garageBtn(){ if(!btn) return;
  const t=(mode==='car'||mode==='walk')&&styleReady?target():null;
  btn.style.display=t?'':'none'; if(t) btn.classList.toggle('on',openness(t.g.gk)>.5||G.dir[t.g.gk]>0); });
if(btn) btn.addEventListener('click',e=>{ e.stopPropagation(); safe('garage',()=>press('button')); });

window.GARAGE={press:(f,w)=>safe('garage',()=>press(f,w))||'none', gate:(...a)=>{ try{ return gate(...a); }catch(e){ console.warn('garage gate',e); return null; } },
  openness, target:()=>safe('garage',target), state:G};
})();
