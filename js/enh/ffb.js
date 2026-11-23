/* Wheel motor: the steering wheel turns itself on autopilot (owner 2026-11-23, with a photo of the G29: "when I'm in
   auto drive make that whole wheel spin"). The Gamepad API can read a wheel but can't drive its motor, so this talks to
   the wheel directly through WebHID (Chrome / Edge), with the Logitech "classic" force-feedback commands the G29, G27 and
   Driving Force GT understand (the ones Linux's hid-lg4ff driver sends):
     constant force  11 08 ff 80 00 00 00   (ff: 00 full one way … 80 none … ff full the other way)
     stop forces     13 00 00 00 00 00 00
   Chrome only lets a page use a HID device the person picked, so ⚙️ (Wheel) gets a "Wheel motor" button; after that it
   reconnects by itself on this computer. While autopilot drives, a gentle spring pulls the wheel to the angle the
   autopilot is steering (read back from the wheel's own steering axis), at most ~45% of the motor's strength. Grab the
   wheel and hold it away from that angle (or touch a pedal) and the autopilot hands over, as before; the motor lets go
   the moment autopilot is off, the page is hidden, or anything goes wrong. Which way "positive" turns is measured once.
   The G920 / G923 (Xbox) speak a different protocol and aren't supported.
   window.FFB = {connect(), driving, state} */
(()=>{
'use strict';
const wheelSeen=()=>{ for(const g of navigator.getGamepads?navigator.getGamepads():[]) if(g&&g.connected&&/wheel|g29|g27|driving force|logitech/i.test(g.id)) return true; return false; };
if(!navigator.hid){                                                // Firefox / Safari: no WebHID, so say why once
  let told=false; setInterval(()=>{ if(!told&&window.AUTO&&AUTO.on&&wheelSeen()){ told=true; if(typeof toast==='function') toast('To let autopilot turn your wheel, open the game in Chrome or Edge',5000); } },1000); return; }
const IDS=[0xc24f,0xc260,0xc29b,0xc29a,0xc298];       // G29 (PS3 / PS4 mode), G27, Driving Force GT, Driving Force Pro
const F={dev:null,rid:0,len:7,sign:0,on:false,last:-1,lastT:0,prev:null,pv:0,hold:0,cmd:0,busy:false,err:0,why:''};
const say=(m,ms)=>{ if(typeof toast==='function') toast(m,ms||2600); };
const send=b=>{ if(!F.dev||!F.dev.opened) return Promise.resolve(); const a=new Uint8Array(Math.max(F.len,b.length)); a.set(b);
  return F.dev.sendReport(F.rid,a).catch(e=>{ F.why=String(e&&e.message||e); if(++F.err>5){ console.warn('wheel motor',e); off(true); say('The wheel motor stopped answering ('+F.why+')',4000); } }); };
// the wheel's own centring spring would fight the motor: off while the game steers, back on after
const centreOff=()=>send([0xf5,0,0,0,0,0,0]);
const centreOn=()=>send([0xfe,0x0d,0x0b,0x0b,0x80,0,0]).then(()=>send([0x14,0,0,0,0,0,0]));
const force=v=>{ const k=Math.max(1,Math.min(255,Math.round(128+v*127))); if(k===F.last&&performance.now()-F.lastT<250) return; F.last=k; F.lastT=performance.now(); send([0x11,0x08,k,0x80,0,0,0]); };
function stop(){ F.last=-1; return send([0x13,0,0,0,0,0,0]); }
function off(broken){ if(F.on){ stop(); centreOn(); } F.on=false; F.hold=0; if(broken){ F.dev=null; row(); } }

function wheelAxis(){ for(const g of navigator.getGamepads()) if(g&&g.connected&&g.axes&&g.axes.length&&/wheel|g29|g27|driving force|logitech/i.test(g.id)) return g.axes[0]; return null; }
function outRep(d){ for(const c of d.collections||[]) for(const r of c.outputReports||[]){ const n=(r.items||[]).reduce((a,i)=>a+(i.reportCount||0)*(i.reportSize||0),0)/8; return {id:r.reportId||0,len:Math.max(7,Math.round(n)||7)}; } return null; }
const pick=ds=>ds.find(d=>d.vendorId===0x046d&&IDS.includes(d.productId)&&outRep(d))||ds.find(d=>d.vendorId===0x046d&&/wheel|g29|g27|driving/i.test(d.productName||'')&&outRep(d))||ds.find(d=>d.vendorId===0x046d&&IDS.includes(d.productId))||ds.find(d=>d.vendorId===0x046d&&outRep(d));
async function open(d){ try{ if(!d.opened) await d.open(); const o=outRep(d); F.rid=o?o.id:0; F.len=o?o.len:7; F.dev=d; F.err=0; F.sign=+localStorage.getItem('ydFfbSign')||0; row(); return true; }catch(e){ console.warn('wheel motor open',e); return false; } }
async function connect(){ try{ const ds=await navigator.hid.requestDevice({filters:[{vendorId:0x046d}]})   /* any Logitech device, in case the wheel reports another id */;
    if(!ds.length){ say('Pick the Logitech wheel in the list, then press Connect',3500); return; } if(await open(pick(ds))) say('🛞 Wheel motor connected — on autopilot the wheel turns by itself',3600); else say('Couldn\'t open the wheel. Close Logitech G HUB and try again.',4000); }
  catch(e){ say('Couldn\'t connect the wheel motor',2400); } }
navigator.hid.getDevices().then(ds=>{ const d=pick(ds); if(d) open(d); }).catch(()=>{});
navigator.hid.addEventListener('disconnect',e=>{ if(e.device===F.dev){ F.dev=null; F.on=false; row(); } });

// which way does "more than 80" turn the wheel? a short, light push, once; remembered
async function measure(){ const a0=wheelAxis(); if(a0==null) return; F.busy=true; await centreOff();
  await send([0x11,0x08,0xc0,0x80,0,0,0]); await new Promise(r=>setTimeout(r,260)); const a1=wheelAxis(); await stop(); F.busy=false;
  if(a1==null||Math.abs(a1-a0)<.004) return; F.sign=a1>a0?1:-1; try{ localStorage.setItem('ydFfbSign',String(F.sign)); }catch(e){} }

// the loop: a spring toward the autopilot's steering, with damping
setInterval(()=>{ if(!F.dev||F.busy) return;
  const A=window.AUTO, want=!!(A&&A.on)&&!document.hidden&&(mode==='car'||mode==='tractor');
  if(!want){ if(F.on) off(false); return; }
  const a=wheelAxis(); if(a==null){ if(F.on) off(false); return; }
  if(!F.sign){ F.on=true; measure(); return; }          // counts as driving, so the test push isn't taken for the driver steering
  if(!F.on) centreOff(); F.on=true; const t=performance.now(), dt=F.prev?Math.min(.1,(t-F.prev)/1000):.02; F.prev=t;
  const target=Math.max(-1,Math.min(1,F.cmd)), err=target-a, vel=(a-F.pv)/dt; F.pv=a;
  let v=err*3.6-vel*.09; v=Math.max(-.55,Math.min(.55,v));                     // gentle: at most ~55 %
  force(v*F.sign);
  // held well away from where it's steering for half a second: the driver has taken the wheel
  F.hold=Math.abs(err)>.22?F.hold+dt:0; if(F.hold>.5&&A.takeover){ off(false); A.takeover(); } },20);
addEventListener('visibilitychange',()=>{ if(document.hidden&&F.on) off(false); });
addEventListener('pagehide',()=>{ if(F.on) stop(); });

async function test(){ if(!F.dev) return connect(); if(F.on||F.busy) return; const a0=wheelAxis(); if(a0==null) return say('The game doesn\'t see the wheel — turn it a little first',3000);
  F.busy=true; say('🛞 Motor test: the wheel should turn one way, then the other',2600); await centreOff(); let moved=0;
  for(const k of [0x50,0xb0]){ await send([0x11,0x08,k,0x80,0,0,0]); await new Promise(r=>setTimeout(r,450)); const a=wheelAxis(); if(a!=null) moved=Math.max(moved,Math.abs(a-a0)); }
  await stop(); await centreOn(); F.busy=false; F.sign=0;
  setTimeout(()=>say(moved>.01?'🛞 The motor works. Turn on autopilot and it will steer.':'The wheel didn\'t move'+(F.why?' ('+F.why+')':'')+'. Close Logitech G HUB, unplug the wheel and plug it back in, then press Test again.',5200),2700); }
// ⚙️ (Wheel): the "Wheel motor" button and its state
function row(){ const r=document.getElementById('wheelRow'); if(!r) return; let b=document.getElementById('ffbBtn');
  if(!b){ const box=r.querySelector('.stepper')||r; b=document.createElement('button'); b.id='ffbBtn'; b.style.cssText='width:auto;padding:0 10px;font-size:14px;font-weight:600';
    b.addEventListener('click',e=>{ e.stopPropagation(); if(F.dev) test(); else connect(); }); box.appendChild(b); }
  b.textContent=F.dev?'Test wheel motor':'Wheel motor'; b.title='Let autopilot turn the wheel (Logitech G29 / G27)'; }
setTimeout(row,1500);
const css=document.createElement('style'); css.textContent='#ffbAsk{position:absolute;left:50%;top:calc(var(--st,10px) + 64px);transform:translateX(-50%);z-index:43;display:none;'+
  'background:#2563eb;color:#fff;border:0;border-radius:999px;padding:11px 18px;font:600 15px system-ui,Arial;box-shadow:0 6px 18px rgba(0,0,0,.45);cursor:pointer}#ffbAsk.on{display:block}';
document.head.appendChild(css);
const ask=document.createElement('button'); ask.id='ffbAsk'; ask.textContent='🛞 Tap here so the wheel turns by itself'; document.body.appendChild(ask);
ask.addEventListener('pointerdown',e=>e.stopPropagation());
ask.addEventListener('click',async e=>{ e.stopPropagation(); await connect(); if(F.dev) ask.classList.remove('on'); });
let later=0; setInterval(()=>{ const show=!F.dev&&!!(window.AUTO&&AUTO.on)&&wheelSeen()&&Date.now()>later; ask.classList.toggle('on',show); },500);
window.FFB={connect,test,state:F,get driving(){ return F.on; },set cmd(v){ F.cmd=+v||0; }};
})();
