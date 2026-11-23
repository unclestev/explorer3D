/* Controls: every action in the game and which key / wheel button / controller button does it (owner 2026-11-22:
   "a key mapping interface like in ATS, but with ... visually seeing which buttons on the G29 are mapped"). One place
   for all bindings, instead of each file listening for its own keys, so the Controls screen (js/enh/controls-view.js)
   always shows what really happens.
   Phase 1 (now): the default layouts below, shown on the Controls screen; nothing is customisable yet. Planned next:
   custom profiles (copy a default, rebind, export / import). The shapes here are built for that: a layout is plain data
   {action id: [bindings]}, saved later as JSON per device kind, and the lookups (held / dispatch) only read layouts.
   Bindings
     keyboard  KeyboardEvent.code strings, [primary, secondary] (code = the physical key, so it works on any keyboard layout)
     wheel     {b:n} a button (Gamepad API index, counting from 0), {b:[n,m]} both together (a combo), {axis:n}, {pedal:'gas'},
               {hat:1} the D-pad, {shift:n} a shifter slot (also a button index; shown on the shifter drawing)
     pad       standard-layout controller: same shapes
   Action types: press (fires once), hold (true while held), axis (analog; read by js/enh/wheel.js and js/game.js).
   Combos: when the second button of a pair goes down within 0.25 s of the first, the pair's action fires instead, and the
   first button's own action is undone if it can be (a turn signal is pressed again to cancel it).
   window.CTRL = {ACTIONS, GROUPS, DEFAULTS, layout(kind,id), held(action), poll(gamepad,kind), keyName(code),
                  btnName(kind,i), live, paused, onLive(fn)} */
(()=>{
'use strict';
const say=(m,ms)=>{ if(typeof toast==='function') toast(m,ms||1400); };
const has=o=>typeof o!=='undefined'&&o;
const GROUPS=['Driving','Gears','Car','Lights & signals','View','Music & voice','Getting around','Snow plow','Game'];
// run: what a press does. undo: how to take back a press (used by combos). note: shown on the Controls screen.
const A=[
  {id:'steerL',  g:'Driving', label:'Steer left',           t:'hold'},
  {id:'steerR',  g:'Driving', label:'Steer right',          t:'hold'},
  {id:'steer',   g:'Driving', label:'Steering',             t:'axis', dev:true},
  {id:'gas',     g:'Driving', label:'Gas',                  t:'hold'},
  {id:'brake',   g:'Driving', label:'Brake',                t:'hold', note:'With a wheel or controller it only brakes; the gear decides forward or back'},
  {id:'handbrake',g:'Driving',label:'Handbrake',            t:'hold'},
  {id:'gearD',   g:'Gears',   label:'Drive',                t:'hold', dev:true},
  {id:'gearR',   g:'Gears',   label:'Reverse',              t:'hold', dev:true},
  {id:'gearN',   g:'Gears',   label:'Neutral',              t:'hold', dev:true, note:'Any other shifter slot, or the middle'},
  {id:'gearToggle',g:'Gears', label:'Switch Drive / Reverse',t:'press', dev:true, run:()=>window.WHEEL&&WHEEL.toggleGear&&WHEEL.toggleGear(), note:'Wheel: only until the shifter has been used'},
  {id:'engine',  g:'Car',     label:'Engine start / stop',  t:'press', run:()=>window.IGN&&IGN.button()},
  {id:'horn',    g:'Car',     label:'Horn',                 t:'hold'},
  {id:'wipers',  g:'Car',     label:'Wipers on / off',      t:'press', run:()=>window.COCKPIT&&COCKPIT.wiper&&COCKPIT.wiper(), note:'Automatic in the rain until switched'},
  {id:'washer',  g:'Car',     label:'Washer fluid',         t:'press', run:()=>window.COCKPIT&&COCKPIT.washer&&COCKPIT.washer()},
  {id:'lights',  g:'Lights & signals', label:'Headlights: Auto / On / Off', t:'press', run:()=>window.LIGHTS&&LIGHTS.cycle()},
  {id:'sigL',    g:'Lights & signals', label:'Left turn signal',  t:'press', run:()=>window.SIG&&SIG.press(-1), undo:()=>window.SIG&&SIG.press(-1)},
  {id:'sigR',    g:'Lights & signals', label:'Right turn signal', t:'press', run:()=>window.SIG&&SIG.press(1),  undo:()=>window.SIG&&SIG.press(1)},
  {id:'hazard',  g:'Lights & signals', label:'Hazard lights',     t:'press', run:()=>window.SIG&&SIG.hazard()},
  {id:'garage',  g:'Car',     label:'Garage door opener',   t:'press', run:()=>{ if(window.GARAGE) GARAGE.press('key'); if(window.COCKPIT&&COCKPIT.on&&COCKPIT.hlFlash) COCKPIT.hlFlash(); }, note:'In the driveway in front of a garage, or inside it; in a car or on foot'},
  {id:'view',    g:'View',    label:'Chase / cockpit view', t:'press', run:()=>window.COCKPIT&&COCKPIT.toggle()},
  {id:'hud',     g:'View',    label:'Head-up display',      t:'press', run:()=>window.COCKPIT&&COCKPIT.hudToggle&&COCKPIT.hudToggle()},
  {id:'lookL',   g:'View',    label:'Glance left',          t:'hold', note:'Cockpit view'},
  {id:'lookR',   g:'View',    label:'Glance right',         t:'hold', note:'Cockpit view'},
  {id:'look',    g:'View',    label:'Look around',          t:'axis', dev:true},
  {id:'recenter',g:'View',    label:'Look straight ahead',  t:'press', run:()=>{ if(window.LOOKAROUND) LOOKAROUND.reset(); if(window.COCKPIT&&COCKPIT.recenter) COCKPIT.recenter(); }},
  {id:'music',   g:'Music & voice', label:'Music panel',    t:'press', run:k=>window.MUSIC&&MUSIC.toggle(k==='key'?undefined:false)},
  // in the snow plow the red dial (next / previous) turns the blade instead (js/enh/plow.js)
  {id:'next',    g:'Music & voice', label:'Next song / station',     t:'press', run:()=>{ if(typeof CARKEY!=='undefined'&&CARKEY==='snowplow'&&window.PLOW) return PLOW.step(1); window.MUSIC&&MUSIC.next&&MUSIC.next(); }, note:'In the snow plow: turns the blade right'},
  {id:'prev',    g:'Music & voice', label:'Previous song / station', t:'press', run:()=>{ if(typeof CARKEY!=='undefined'&&CARKEY==='snowplow'&&window.PLOW) return PLOW.step(-1); window.MUSIC&&MUSIC.prev&&MUSIC.prev(); }, note:'In the snow plow: turns the blade left'},
  {id:'volUp',   g:'Music & voice', label:'Volume up',      t:'press', rep:true, run:()=>window.MUSIC&&MUSIC.volStep&&MUSIC.volStep(1)},
  {id:'volDn',   g:'Music & voice', label:'Volume down',    t:'press', rep:true, run:()=>window.MUSIC&&MUSIC.volStep&&MUSIC.volStep(-1)},
  {id:'voice',   g:'Music & voice', label:'Voice command',  t:'press', run:()=>window.VOICE&&VOICE.listen()},
  {id:'walk',    g:'Getting around', label:'Get out and walk / back in', t:'press', run:()=>window.WALK&&WALK.toggle&&WALK.toggle()},
  {id:'glider',  g:'Getting around', label:'Hang glider',   t:'press', run:()=>typeof toggleGlider==='function'&&toggleGlider()},
  {id:'plowL',   g:'Snow plow', label:'Turn the blade left (hold)',  t:'hold'},
  {id:'plowR',   g:'Snow plow', label:'Turn the blade right (hold)', t:'hold'},
  {id:'plowStraight', g:'Snow plow', label:'Straighten the blade', t:'press', run:()=>window.PLOW&&PLOW.straight()},
  {id:'plowLift', g:'Snow plow', label:'Raise / lower the blade', t:'hold'},
  {id:'plowWing', g:'Snow plow', label:'Wing plow down / up', t:'hold'},
  {id:'phone',   g:'Game',    label:'Phone',            t:'press', run:()=>window.PHONE&&PHONE.toggle()},
  {id:'controls',g:'Game',    label:'Show / hide this screen', t:'press', always:true, run:()=>window.CTRLVIEW&&CTRLVIEW.toggle()},
];
const ACT={}; for(const a of A) ACT[a.id]=a;

/* ---------- default layouts ----------
   Logitech G29 numbering in Chrome / Edge (counting from 0): 0 ✕, 1 ◻, 2 ○, 3 △, 4 right paddle, 5 left paddle, 6 R2,
   7 L2, 8 Share, 9 Options, 10 R3, 11 L3, 12-17 shifter 1-6, 18 shifter R, 19 +, 20 −, 21 red dial right, 22 red dial
   left, 23 Enter (middle of the dial), 24 PS; D-pad = one "hat" axis. */
const DEFAULTS={
  keyboard:{
    steerL:['KeyA','ArrowLeft'], steerR:['KeyD','ArrowRight'], gas:['KeyW','ArrowUp'], brake:['KeyS','ArrowDown'], handbrake:['Space'],
    engine:['KeyI'], horn:['KeyB'], wipers:['KeyP'], washer:['KeyO'], lights:['KeyL'], garage:['KeyK'],
    sigL:['BracketLeft'], sigR:['BracketRight'], hazard:['Backslash'],
    view:['KeyC'], hud:['KeyH'], lookL:['KeyQ'], lookR:['KeyE'], recenter:['KeyR'],
    music:['KeyM'], next:['Period'], prev:['Comma'], volUp:['Equal'], volDn:['Minus'], voice:['KeyV'],
    walk:['KeyF'], glider:['KeyG'], phone:['KeyT'], plowL:['KeyZ'], plowR:['KeyX'], plowStraight:['KeyN'], plowLift:['KeyU'], plowWing:['KeyJ'], controls:['Slash'] },
  wheel:{
    steer:[{axis:0}], gas:[{pedal:'gas'}], brake:[{pedal:'brake'}],
    gearD:[{shift:12}], gearR:[{shift:13},{shift:18}], gearN:[{shift:14},{shift:15},{shift:16},{shift:17}], gearToggle:[{b:[4,5]}],
    engine:[{b:23}], horn:[{b:0}], wipers:[{b:6}], washer:[{b:10}], lights:[{b:1}],
    sigL:[{b:5}], sigR:[{b:4}], hazard:[{b:8}],
    view:[{b:2}], hud:[{b:11}], recenter:[{b:3}], look:[{hat:1}],
    music:[{b:7}], next:[{b:21}], prev:[{b:22}], volUp:[{b:19}], volDn:[{b:20}], voice:[{b:9}] },
  pad:{
    steer:[{axis:0}], gas:[{b:7}], brake:[{b:6}], handbrake:[{b:1}],
    gearToggle:[{b:3}],
    engine:[{b:2}], horn:[{b:0}], wipers:[{b:12}], washer:[{b:13}], lights:[{b:10}],
    sigL:[{b:4}], sigR:[{b:5}], hazard:[{b:[4,5]}],
    view:[{b:8}], recenter:[{b:11}], look:[{axis:2}],
    music:[{b:9}], next:[{b:15}], prev:[{b:14}] }
};

/* the layout in use for a device kind. Phase 1: the default, with the wheel buttons learned in ⚙️ (Wheel) on top —
   a learned button takes over its action and anything else on that button is dropped, so the screen shows what's true.
   Later: a saved custom profile replaces the default here. */
function clone(o){ return JSON.parse(JSON.stringify(o)); }
const bBtns=b=>b.b!=null?[].concat(b.b):b.shift!=null?[b.shift]:[];
function layout(kind,devId){ const L=clone(DEFAULTS[kind]||{});
  if(kind==='wheel'&&window.WHEEL&&WHEEL.learned){ const c=WHEEL.learned(devId)||{};
    const take=(act,binds)=>{ const used=new Set(binds.flatMap(bBtns));
      for(const k in L) L[k]=L[k].filter(b=>!bBtns(b).some(i=>used.has(i)));
      L[act]=binds; };
    if(c.start!=null) take('engine',[{b:c.start}]);
    if(c.view!=null) take('view',[{b:c.view}]);
    if(c.shift){ take('gearD',[{shift:c.shift.d}]); take('gearR',[{shift:c.shift.r}]);
      L.gearN=(L.gearN||[]).filter(b=>b.shift!==c.shift.d&&b.shift!==c.shift.r); }
  }
  return L; }

/* ---------- names for the screen ---------- */
const KEYN={Space:'Space',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',BracketLeft:'[',BracketRight:']',Backslash:'\\',
  Comma:',',Period:'.',Slash:'/',Equal:'=',Minus:'−',Semicolon:';',Quote:"'",Backquote:'`',Enter:'Enter',Escape:'Esc',Tab:'Tab',
  ShiftLeft:'Shift',ShiftRight:'R Shift',ControlLeft:'Ctrl',ControlRight:'R Ctrl',AltLeft:'Alt',AltRight:'R Alt',Backspace:'Backspace'};
const keyName=c=>KEYN[c]||(c.startsWith('Key')?c.slice(3):c.startsWith('Digit')?c.slice(5):c.startsWith('Numpad')?'Num '+c.slice(6):c);
const BTN={
  wheel:['✕','◻','○','△','Right paddle','Left paddle','R2','L2','Share','Options ≡','R3','L3','Shifter 1','Shifter 2','Shifter 3','Shifter 4','Shifter 5','Shifter 6','Shifter R','+','−','Dial right','Dial left','Enter','PS'],
  pad:['A','B','X','Y','LB','RB','LT','RT','View ⧉','Menu ≡','Left stick click','Right stick click','D-pad up','D-pad down','D-pad left','D-pad right','Guide'] };
const btnName=(kind,i)=>(BTN[kind]&&BTN[kind][i])||('Button '+(i+1));
function bindName(kind,b){ if(kind==='keyboard') return keyName(b);
  if(b.b!=null) return [].concat(b.b).map(i=>btnName(kind,i)).join(' + ');
  if(b.shift!=null) return btnName(kind,b.shift);
  if(b.pedal) return b.pedal==='gas'?'Gas pedal':'Brake pedal';
  if(b.hat) return 'D-pad';
  if(b.axis!=null) return kind==='pad'?(b.axis<2?'Left stick':'Right stick'):'Wheel';
  return '?'; }

/* ---------- keyboard ---------- */
const keys=new Set();
const typing=e=>{ const t=e.target; return !!(t&&(/INPUT|TEXTAREA|SELECT/.test(t.tagName)||t.isContentEditable)); };
const kbIndex=()=>{ const ix={}, L=DEFAULTS.keyboard; for(const id in L) for(const c of L[id]) (ix[c]=ix[c]||[]).push(id); return ix; };
let KIX=kbIndex();
addEventListener('keydown',e=>{ if(typing(e)) return;
  if(e.code.startsWith('Arrow')||e.code==='Space') e.preventDefault();
  keys.add(e.code); note('keyboard',e.code,true);
  for(const id of KIX[e.code]||[]){ const a=ACT[id]; if(a.t!=='press'||!a.run) continue; if(CTRL.paused&&!a.always) continue; if(e.repeat&&!a.rep) continue; fire(a,'key'); } });
addEventListener('keyup',e=>{ keys.delete(e.code); note('keyboard',e.code,false); });
addEventListener('blur',()=>keys.clear());
function fire(a,src){ try{ a.run(src); }catch(err){ console.warn('control',a.id,err); } }

/* ---------- gamepads (js/enh/wheel.js calls poll every frame with the wheel or controller in use) ---------- */
const padState={wheel:{down:[],combo:null,L:null,id:null}, pad:{down:[],combo:null,L:null,id:null}};
function poll(g,kind){ const P=padState[kind]; if(P.id!==g.id||!P.L){ P.id=g.id; P.L=layout(kind,g.id); P.down=[]; }
  const bs=g.buttons||[], dn=i=>!!(bs[i]&&(bs[i].pressed||bs[i].value>.5)), now=performance.now();
  CTRL.live={kind,id:g.id,t:now,buttons:bs.map((b,i)=>dn(i)),vals:bs.map(b=>+b.value||(b.pressed?1:0)),axes:g.axes.slice()};
  for(let i=0;i<bs.length;i++){ const d=dn(i); if(d!==!!P.down[i]) note(kind,i,d); if(!d||P.down[i]) continue;
    if(CTRL.paused) continue;
    // a combo this button finishes?
    const c=P.combo; let comboHit=null;
    if(c&&now-c.t<250&&c.i!==i) for(const id in P.L) for(const b of P.L[id]) if(Array.isArray(b.b)&&b.b.includes(c.i)&&b.b.includes(i)) comboHit=id;
    if(comboHit){ for(const id of c.fired){ const a=ACT[id]; if(a.undo) try{ a.undo(); }catch(e){} } P.combo=null; fire(ACT[comboHit],kind); continue; }
    const fired=[];
    for(const id in P.L){ const a=ACT[id]; if(a.t!=='press'||!a.run) continue; if(P.L[id].some(b=>b.b===i)){ fire(a,kind); fired.push(id); } }
    P.combo={t:now,i,fired}; }
  P.down=bs.map((b,i)=>dn(i)); }
// is a hold action held right now (keys, or a bound gamepad button)?
function held(id){ const ks=DEFAULTS.keyboard[id]; if(ks) for(const c of ks) if(keys.has(c)) return !CTRL.paused;
  if(CTRL.paused) return false;
  for(const kind in padState){ const P=padState[kind]; if(!P.L||!P.L[id]) continue;
    for(const b of P.L[id]){ const bb=b.b!=null?b.b:b.shift; if(typeof bb==='number'&&P.down[bb]) return true; } }
  return false; }
// a gamepad's buttons bound to an action (wheel.js reads the shifter slots this way)
const buttonsFor=(kind,id)=>{ const P=padState[kind]; return ((P.L||layout(kind))[id]||[]).flatMap(bBtns); };

// live input for the Controls screen (it lights what's pressed)
const liveFns=[]; function note(kind,code,down){ for(const f of liveFns) try{ f(kind,code,down); }catch(e){} }

const CTRL={ACTIONS:A,ACT,GROUPS,DEFAULTS,layout,held,poll,buttonsFor,keyName,btnName,bindName,live:null,paused:false,
  onLive:f=>liveFns.push(f), keys,
  relayout(){ for(const k in padState) padState[k].L=null; KIX=kbIndex(); } };
window.CTRL=CTRL;
})();
