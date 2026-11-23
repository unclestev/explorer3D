/* Controls screen (owner 2026-11-22): what every key, G29 wheel / shifter / pedal and Xbox controller button does, drawn
   so you can see at a glance which buttons are taken and by what (his complaint about ATS: you can't tell what's already
   mapped). Opened from ⚙️ → Driving → Controls, or the / key. While it's open the game ignores the controls, so pressing a
   button just lights it here (a quick way to check the button numbers on a real wheel).
   - Tabs: Racing wheel (wheel + shifter + pedals), Controller, Keyboard. Opens on the device that's plugged in, and
     switches to whichever device you press something on.
   - Left: the drawing, with every control labelled with its action (greyed when nothing uses it). Right: every action,
     grouped, with its Key 1 / Key 2 / Wheel / Controller bindings.
   - Point at (or tap) a row and its buttons light up on the drawing; point at a button and its rows light up.
   Phase 1 shows the defaults from js/enh/controls.js (plus the wheel buttons learned in ⚙️). Planned: custom profiles —
   the chips and the drawn buttons become the places to rebind (pick → "press a key / button" → "already used by X:
   replace / swap / cancel"), so both are already built from the layout data, not hard-coded text.
   Shown only on devices that have a keyboard, mouse or controller (a phone without one doesn't get the ⚙️ row). Every
   part works by touch as well as by mouse. window.CTRLVIEW = {open(tab), close(), toggle()} */
(()=>{
'use strict';
if(!window.CTRL) return;
const C=CTRL, NS='http://www.w3.org/2000/svg';
const GC={'Driving':'#3b82f6','Gears':'#a855f7','Car':'#f97316','Lights & signals':'#eab308','View':'#14b8a6','Music & voice':'#ec4899','Getting around':'#22c55e','Game':'#94a3b8'};
const SHORT={steerL:'Steer ◀',steerR:'Steer ▶',steer:'Steering',gas:'Gas',brake:'Brake',handbrake:'Handbrake',gearD:'Drive',gearR:'Reverse',gearN:'Neutral',
  gearToggle:'D / R',engine:'Engine',horn:'Horn',wipers:'Wipers',washer:'Washer',lights:'Headlights',sigL:'◀ Signal',sigR:'Signal ▶',hazard:'Hazards',
  view:'Cockpit view',hud:'Head-up',lookL:'Glance ◀',lookR:'Glance ▶',look:'Look around',recenter:'Look ahead',music:'Music',next:'Next ⏭',prev:'⏮ Prev',
  volUp:'Vol +',volDn:'Vol −',voice:'Voice',walk:'Walk',glider:'Glider',controls:'Controls'};
const css=document.createElement('style'); css.textContent=`
#ctrlView{position:fixed;inset:0;z-index:90;display:none;background:rgba(6,10,20,.96);color:var(--txt,#e2e8f0);font:14px system-ui,Arial,sans-serif;
 padding:max(env(safe-area-inset-top),12px) max(env(safe-area-inset-right),14px) max(env(safe-area-inset-bottom),12px) max(env(safe-area-inset-left),14px);box-sizing:border-box;flex-direction:column;gap:10px}
#ctrlView.on{display:flex}
#ctrlView .cvHead{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
#ctrlView .cvHead b{font-size:19px}
#ctrlView .cvTabs{display:flex;gap:4px;background:rgba(255,255,255,.06);border-radius:10px;padding:3px}
#ctrlView .cvTabs button{border:0;background:transparent;color:#cbd5e1;font:600 14px system-ui,sans-serif;padding:9px 14px;border-radius:8px;cursor:pointer}
#ctrlView .cvTabs button.on{background:#1d4ed8;color:#fff}
#ctrlView .cvTabs button .dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#22c55e;margin-left:6px;vertical-align:middle;visibility:hidden}
#ctrlView .cvTabs button.conn .dot{visibility:visible}
#ctrlView .cvLay{color:var(--muted,#94a3b8);font-size:13px;flex:1;min-width:180px}
#ctrlView .cvLay span{background:rgba(255,255,255,.08);border-radius:6px;padding:3px 8px;color:#e2e8f0;margin-right:6px}
#ctrlView .cvX{border:0;background:rgba(255,255,255,.1);color:#fff;width:40px;height:40px;border-radius:10px;font-size:18px;cursor:pointer}
#ctrlView .cvBody{flex:1;min-height:0;display:flex;gap:14px}
#ctrlView .cvDraw{flex:1.35;min-width:0;display:flex;flex-direction:column;gap:6px;overflow:auto}
#ctrlView .cvDraw svg{width:100%;height:auto;display:block;touch-action:manipulation;user-select:none}
#ctrlView .cvInfo{min-height:22px;color:#cbd5e1;font-size:14px;padding:2px 4px}
#ctrlView .cvInfo b{color:#fff}
#ctrlView .cvList{flex:1;min-width:330px;overflow:auto;background:rgba(255,255,255,.03);border:1px solid var(--line,rgba(255,255,255,.12));border-radius:12px}
#ctrlView table{border-collapse:collapse;width:100%}
#ctrlView th{white-space:nowrap;position:sticky;top:0;background:#0d1424;color:var(--muted,#94a3b8);font:600 12px system-ui;text-align:left;padding:8px 6px;z-index:1}
#ctrlView th.cur{color:#93c5fd}
#ctrlView td{padding:6px;border-top:1px solid rgba(255,255,255,.06);vertical-align:middle}
#ctrlView tr.grp td{background:rgba(255,255,255,.04);font:700 12px system-ui;letter-spacing:.04em;text-transform:uppercase;color:#cbd5e1;padding:9px 8px}
#ctrlView tr.grp i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:7px}
#ctrlView tr.act{cursor:pointer}
#ctrlView tr.act td:first-child{min-width:130px}
#ctrlView tr.act small{display:block;color:var(--muted,#94a3b8);font-size:11px;margin-top:2px}
#ctrlView tr.act:hover,#ctrlView tr.act.hi{background:rgba(59,130,246,.16)}
#ctrlView tr.act.live{background:rgba(34,197,94,.22)}
#ctrlView .chip{display:inline-block;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:3px 7px;margin:1px 2px 1px 0;font:600 12px system-ui;white-space:nowrap;color:#e2e8f0}
#ctrlView td.cur .chip{border-color:rgba(147,197,253,.45)}
#ctrlView .none{color:#475569}
#ctrlView .ctl{cursor:pointer}
#ctrlView .ctl .sh{fill:#1e293b;stroke:#64748b;stroke-width:2}
#ctrlView .ctl.used .sh{fill:#334155;stroke:#cbd5e1}
#ctrlView .ctl.hi .sh{stroke:#60a5fa;stroke-width:5}
#ctrlView .ctl.live .sh{fill:#16a34a;stroke:#86efac}
#ctrlView .lab{cursor:pointer}
#ctrlView .lab rect{fill:rgba(255,255,255,.04);stroke:rgba(255,255,255,.12)}
#ctrlView .lab.used rect{fill:rgba(255,255,255,.08)}
#ctrlView .lab.hi rect{stroke:#60a5fa;stroke-width:3;fill:rgba(59,130,246,.18)}
#ctrlView .lab.live rect{fill:rgba(34,197,94,.3);stroke:#86efac}
#ctrlView .lead{fill:none;stroke:rgba(203,213,225,.28);stroke-width:1.5}
#ctrlView .lead.hi{stroke:#60a5fa;stroke-width:3}
#ctrlView .lead.live{stroke:#86efac;stroke-width:3}
#ctrlView .cvDraw svg{fill:#e2e8f0;font-family:system-ui,Arial,sans-serif}
#ctrlView text.bn{fill:#94a3b8;font-size:15px}
#ctrlView text.an{font-size:20px;font-weight:700}
#ctrlView .unused text.an{fill:#64748b;font-weight:500}
#ctrlView.kb .cvDraw{flex:1.7}
#ctrlView.kb .cvList{min-width:470px}
@media (max-width:900px){ #ctrlView .cvBody{flex-direction:column;overflow:auto} #ctrlView .cvDraw{flex:none;overflow:visible} #ctrlView .cvList{flex:none;min-width:0;overflow:visible} }
`; document.head.appendChild(css);

const root=document.createElement('div'); root.id='ctrlView'; root.setAttribute('role','dialog'); root.setAttribute('aria-label','Controls');
root.innerHTML=`<div class="cvHead"><b>Controls</b><div class="cvTabs" role="tablist"><button data-k="wheel">Racing wheel<span class="dot"></span></button><button data-k="pad">Controller<span class="dot"></span></button><button data-k="keyboard">Keyboard</button></div>
<div class="cvLay"><span>Layout: Default</span>Point at or tap a button or a row · press anything to see it light up</div><button class="cvX" aria-label="Close controls">✕</button></div>
<div class="cvBody"><div class="cvDraw"></div><div class="cvList"></div></div>`;
document.body.appendChild(root);
for(const t of ['pointerdown','click','wheel','touchstart']) root.addEventListener(t,e=>e.stopPropagation(),{passive:true});
const $=s=>root.querySelector(s), drawEl=$('.cvDraw'), listEl=$('.cvList');
let tab='wheel', L=null, sel=null, hover=null, raf=0, hatI=-1;

/* ---------- helpers ---------- */
function el(tag,at,parent,txt){ const e=document.createElementNS(NS,tag); for(const k in at) e.setAttribute(k,at[k]); if(txt!=null) e.textContent=txt; if(parent) parent.appendChild(e); return e; }
function svg(w,h){ return el('svg',{viewBox:`0 0 ${w} ${h}`,role:'img'}); }
const devId=k=>{ const d=window.WHEEL&&WHEEL.device&&WHEEL.device(); return d&&d.kind===k?d.id:undefined; };
function layouts(){ return {keyboard:C.DEFAULTS.keyboard, wheel:C.layout('wheel',devId('wheel')), pad:C.layout('pad',devId('pad'))}; }
// actions on a control: m(binding) says whether a binding uses it
function actionsOn(kind,m){ const out=[], Lk=L[kind]; for(const a of C.ACTIONS){ const bs=Lk[a.id]; if(!bs) continue; for(const b of bs) if(m(b)){ out.push({a,b}); break; } } return out; }
const isBtn=i=>b=>b.b===i||b.shift===i||Array.isArray(b.b)&&b.b.includes(i);
function labelFor(kind,list,i){ // singles first; combos as "+ other: action"
  const s=list.filter(x=>!Array.isArray(x.b.b)).map(x=>SHORT[x.a.id]), c=list.filter(x=>Array.isArray(x.b.b)).map(x=>'+'+C.btnName(kind,x.b.b.find(j=>j!==i)).replace(/ paddle/,'').replace('Shifter ','')+': '+SHORT[x.a.id]);
  return s.concat(c).join(' · ')||'—'; }

/* ---------- drawings ----------
   Each control: {k (key for highlighting), name, x, y, side ('l'/'r' label column), draw(g), m (binding matcher)}.
   Positions are drawn from the G29 / Xbox layouts by eye; they're plain numbers here so they're easy to nudge. */
const shape={
  circ:(r)=>(g,x,y)=>el('circle',{cx:x,cy:y,r,class:'sh'},g),
  pill:(w,h)=>(g,x,y)=>el('rect',{x:x-w/2,y:y-h/2,width:w,height:h,rx:h/2,class:'sh'},g),
  rect:(w,h,r)=>(g,x,y)=>el('rect',{x:x-w/2,y:y-h/2,width:w,height:h,rx:r||6,class:'sh'},g),
  dpadArm:(dx,dy)=>(g,x,y)=>el('rect',{x:x+dx*22-11,y:y+dy*22-11,width:22,height:22,rx:4,class:'sh'},g),
  glyph:(r,t,col)=>(g,x,y)=>{ el('circle',{cx:x,cy:y,r,class:'sh'},g); el('text',{x,y:y+6,'text-anchor':'middle','font-size':17,'font-weight':700,fill:col||'#e2e8f0','pointer-events':'none'},g,t); },
};
function wheelCtls(){ const c=[];
  const add=(k,name,x,y,side,draw,m)=>c.push({k,name,x,y,side,draw,m});
  add('b5','Left paddle',470,232,'l',shape.rect(70,26,10),isBtn(5));
  add('b4','Right paddle',730,232,'r',shape.rect(70,26,10),isBtn(4));
  add('hat','D-pad',445,325,'l',(g,x,y)=>{ for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) shape.dpadArm(dx,dy)(g,x,y); el('rect',{x:x-11,y:y-11,width:22,height:22,class:'sh'},g); },b=>!!b.hat);
  add('b8','Share',412,382,'l',shape.pill(30,14),isBtn(8));
  add('b7','L2',452,392,'l',shape.circ(12),isBtn(7));
  add('b11','L3',490,392,'l',shape.circ(12),isBtn(11));
  add('b20','−',560,462,'l',shape.circ(11),isBtn(20));
  add('b19','+',560,432,'l',shape.circ(11),isBtn(19));
  add('b24','PS',600,522,'l',shape.circ(13),isBtn(24));
  add('b3','△',755,292,'r',shape.glyph(15,'△','#5eead4'),isBtn(3));
  add('b1','◻',723,324,'r',shape.glyph(15,'◻','#f9a8d4'),isBtn(1));
  add('b2','○',787,324,'r',shape.glyph(15,'○','#fca5a5'),isBtn(2));
  add('b0','✕',755,356,'r',shape.glyph(15,'✕','#93c5fd'),isBtn(0));
  add('b9','Options ≡',808,384,'r',shape.pill(30,14),isBtn(9));
  add('b10','R3',710,392,'r',shape.circ(12),isBtn(10));
  add('b6','R2',748,392,'r',shape.circ(12),isBtn(6));
  add('b22','Red dial: turn left',614,466,'r',(g,x,y)=>el('path',{d:`M${x+6} ${y-9} L${x-7} ${y} L${x+6} ${y+9} Z`,class:'sh'},g),isBtn(22));
  add('b21','Red dial: turn right',686,466,'r',(g,x,y)=>el('path',{d:`M${x-6} ${y-9} L${x+7} ${y} L${x-6} ${y+9} Z`,class:'sh'},g),isBtn(21));
  add('b23','Enter (dial centre)',650,466,'l',shape.circ(12),isBtn(23));
  return c; }
function padCtls(){ const c=[], add=(k,name,x,y,side,draw,m)=>c.push({k,name,x,y,side,draw,m});
  add('b6','LT',440,150,'l',shape.rect(80,34,12),isBtn(6));
  add('b4','LB',435,197,'l',shape.rect(120,20,10),isBtn(4));
  add('ls','Left stick',455,292,'l',shape.circ(36),b=>b.axis===0||b.axis===1);
  add('b10','Left stick click',455,292,'l',shape.circ(14),isBtn(10));
  add('b8','View ⧉',560,272,'l',shape.circ(12),isBtn(8));
  add('b12','D-pad up',535,370,'l',shape.rect(22,22,4),isBtn(12));
  add('b14','D-pad left',513,392,'l',shape.rect(22,22,4),isBtn(14));
  add('b15','D-pad right',557,392,'l',shape.rect(22,22,4),isBtn(15));
  add('b13','D-pad down',535,414,'l',shape.rect(22,22,4),isBtn(13));
  add('b7','RT',760,150,'r',shape.rect(80,34,12),isBtn(7));
  add('b5','RB',765,197,'r',shape.rect(120,20,10),isBtn(5));
  add('b16','Guide',600,232,'r',shape.circ(20),isBtn(16));
  add('b9','Menu ≡',640,272,'r',shape.circ(12),isBtn(9));
  add('b3','Y',750,250,'r',shape.glyph(18,'Y','#fde047'),isBtn(3));
  add('b2','X',715,285,'r',shape.glyph(18,'X','#93c5fd'),isBtn(2));
  add('b1','B',785,285,'r',shape.glyph(18,'B','#fca5a5'),isBtn(1));
  add('b0','A',750,320,'r',shape.glyph(18,'A','#86efac'),isBtn(0));
  add('rs','Right stick',665,392,'r',shape.circ(36),b=>b.axis===2||b.axis===3);
  add('b11','Right stick click',665,392,'r',shape.circ(14),isBtn(11));
  return c; }

let ctls=[], nodes={};   // nodes[k] = {ctl:g, lab:g, lead:path}
function labels(s,ctlList,kind,W,H,top){ // the two label columns with leader lines
  for(const side of ['l','r']){ const list=ctlList.filter(c=>c.side===side).sort((a,b)=>a.y-b.y);
    const gap=58, y0=top||32, y1=H-32, n=list.length; let ys=list.map(c=>c.y);
    for(let i=0;i<n;i++) ys[i]=Math.max(ys[i],i?ys[i-1]+gap:y0);
    if(ys[n-1]>y1){ ys[n-1]=y1; for(let i=n-2;i>=0;i--) ys[i]=Math.min(ys[i],ys[i+1]-gap); }
    list.forEach((c,i)=>{ const y=ys[i], lx=side==='l'?10:W-305, ex=side==='l'?305:W-305, acts=actionsOn(kind,c.m), txt=labelFor(kind,acts,+c.k.slice(1));
      const d=`M${ex} ${y} L${side==='l'?ex+40:ex-40} ${y} L${c.x} ${c.y}`;
      const lead=el('path',{d,class:'lead'},s.querySelector('.leads')||s);
      const g=el('g',{class:'lab'+(acts.length?' used':' unused'),'data-k':c.k},s);
      el('rect',{x:lx,y:y-25,width:295,height:50,rx:8},g); el('text',{x:lx+10,y:y-6,class:'bn'},g,c.name);
      const an=el('text',{x:lx+10,y:y+18,class:'an'},g,txt); if(txt.length>24){ an.setAttribute('textLength',275); an.setAttribute('lengthAdjust','spacingAndGlyphs'); }
      if(acts.length) an.setAttribute('fill',GC[acts[0].a.g]);
      nodes[c.k]=Object.assign(nodes[c.k]||{},{lab:g,lead,acts}); }); } }
function drawCtls(s,list){ el('g',{class:'leads'},s); const top=el('g',{},s); for(const c of list){ const g=el('g',{class:'ctl','data-k':c.k},top); c.draw(g,c.x,c.y); nodes[c.k]=Object.assign(nodes[c.k]||{},{ctl:g}); } }

function drawWheel(){ const W=1200,H=680, s=svg(W,H), cx=600, cy=330;
  el('circle',{cx,cy,r:250,fill:'none',stroke:'#111827',  'stroke-width':54},s);           // rim
  el('circle',{cx,cy,r:250,fill:'none',stroke:'#374151','stroke-width':46},s);
  el('rect',{x:cx-4,y:cy-276,width:8,height:20,fill:'#64748b'},s);                           // top-centre mark
  el('path',{d:`M${cx-235} ${cy-38} Q${cx-120} ${cy-62} ${cx} ${cy-58} Q${cx+120} ${cy-62} ${cx+235} ${cy-38} L${cx+235} ${cy+82} Q${cx+130} ${cy+92} ${cx+95} ${cy+140} L${cx+70} ${cy+218} L${cx-70} ${cy+218} L${cx-95} ${cy+140} Q${cx-130} ${cy+92} ${cx-235} ${cy+82} Z`,fill:'#1f2937',stroke:'#0b1220','stroke-width':3},s);   // spokes and hub
  el('ellipse',{cx,cy:cy+26,rx:78,ry:58,fill:'#111827'},s);                                  // centre pad (no logo)
  el('circle',{cx:650,cy:466,r:30,fill:'#7f1d1d',stroke:'#b91c1c','stroke-width':3},s);          // the red dial
  el('text',{x:470,y:268,'text-anchor':'middle',class:'bn','font-size':11},s,'behind the wheel'); el('text',{x:730,y:268,'text-anchor':'middle',class:'bn','font-size':11},s,'behind the wheel');
  ctls=wheelCtls(); drawCtls(s,ctls); labels(s,ctls,'wheel',W,H); return s; }

function drawShifterPedals(){ const W=1200,H=300, s=svg(W,H);
  el('text',{x:20,y:28,'font-size':18,'font-weight':700},s,'Shifter'); el('text',{x:620,y:28,'font-size':18,'font-weight':700},s,'Pedals and steering');
  // H pattern: 1 3 5 on top, 2 4 6 below, R (push down) after 6
  const X=[110,210,310,410], yT=80, yB=230, yM=155;
  el('path',{d:`M${X[0]} ${yT} V${yB} M${X[1]} ${yT} V${yB} M${X[2]} ${yT} V${yB} M${X[0]} ${yM} H${X[3]} M${X[3]} ${yM} V${yB}`,stroke:'#475569','stroke-width':10,'stroke-linecap':'round',fill:'none'},s);
  const slots=[[12,X[0],yT,'1'],[13,X[0],yB,'2'],[14,X[1],yT,'3'],[15,X[1],yB,'4'],[16,X[2],yT,'5'],[17,X[2],yB,'6'],[18,X[3],yB,'R']];
  for(const [i,x,y,t] of slots){ const acts=actionsOn('wheel',isBtn(i)), g=el('g',{class:'ctl'+(acts.length?' used':''),'data-k':'b'+i},s);
    el('circle',{cx:x,cy:y,r:26,class:'sh'},g); el('text',{x,y:y+6,'text-anchor':'middle','font-size':18,'font-weight':700,'pointer-events':'none'},g,t);
    const lab=acts.map(a=>SHORT[a.a.id]).join(' · ')||'—', ty=y===yT?y-36:y+48;
    const tl=el('text',{x,y:ty,'text-anchor':'middle','font-size':15,'font-weight':700,fill:acts.length?GC[acts[0].a.g]:'#64748b'},g,lab);
    nodes['b'+i]={ctl:g,lab:null,acts}; }
  el('text',{x:470,y:yM+5,class:'bn'},s,'middle = Neutral');
  // pedals: clutch (not used), brake, gas — live bars
  const P=[['clutch','Clutch',700],['brake','Brake',840],['gas','Gas',980]];
  for(const [k,n,x] of P){ const acts=k==='clutch'?[]:actionsOn('wheel',b=>b.pedal===k), g=el('g',{class:'ctl'+(acts.length?' used':''),'data-k':'p'+k},s);
    el('rect',{x:x-40,y:90,width:80,height:150,rx:10,class:'sh'},g); el('rect',{x:x-32,y:232,width:64,height:0,rx:6,fill:'#22c55e',class:'fill'},g);
    el('text',{x,y:268,'text-anchor':'middle',class:'bn'},g,n); el('text',{x,y:290,'text-anchor':'middle','font-size':15,'font-weight':700,fill:acts.length?GC[acts[0].a.g]:'#64748b'},g,acts.length?SHORT[acts[0].a.id]:'not used');
    nodes['p'+k]={ctl:g,acts}; }
  // steering meter
  const g=el('g',{class:'ctl used','data-k':'steer'},s); el('rect',{x:1060,y:90,width:120,height:150,rx:10,class:'sh'},g);
  el('rect',{x:1070,y:158,width:100,height:14,rx:7,fill:'#0b1220'},g); el('rect',{x:1117,y:154,width:6,height:22,rx:3,fill:'#60a5fa',class:'needle'},g);
  el('text',{x:1120,y:120,'text-anchor':'middle',class:'bn'},g,'Wheel'); el('text',{x:1120,y:215,'text-anchor':'middle','font-size':15,'font-weight':700,fill:GC.Driving},g,'Steering');
  nodes.steer={ctl:g,acts:actionsOn('wheel',b=>b.axis===0)};
  return s; }

function drawPad(){ const W=1200,H=640, s=svg(W,H);
  el('path',{d:'M395 205 C450 175 750 175 805 205 C880 245 930 440 905 505 C880 565 815 555 780 500 L735 445 L465 445 L420 500 C385 555 320 565 295 505 C270 440 320 245 395 205 Z',fill:'#1f2937',stroke:'#0b1220','stroke-width':3},s);
  ctls=padCtls(); drawCtls(s,ctls); labels(s,ctls,'pad',W,H,40); return s; }

/* keyboard: a US layout, 64 px a key unit; each bound key shows its action */
const KB=[[['Escape',1]],
  [['Backquote',1],...'1234567890'.split('').map(d=>['Digit'+d,1]),['Minus',1],['Equal',1],['Backspace',2]],
  [['Tab',1.5],...'QWERTYUIOP'.split('').map(c=>['Key'+c,1]),['BracketLeft',1],['BracketRight',1],['Backslash',1.5]],
  [['CapsLock',1.75],...'ASDFGHJKL'.split('').map(c=>['Key'+c,1]),['Semicolon',1],['Quote',1],['Enter',2.25]],
  [['ShiftLeft',2.25],...'ZXCVBNM'.split('').map(c=>['Key'+c,1]),['Comma',1],['Period',1],['Slash',1],['ShiftRight',2.75]],
  [['ControlLeft',1.25],['MetaLeft',1.25],['AltLeft',1.25],['Space',6.25],['AltRight',1.25],['MetaRight',1.25],['ContextMenu',1.25],['ControlRight',1.25]]];
function drawKeyboard(){ const U=64, W=Math.round(18.9*U), H=6*U+50, s=svg(W,H);
  const key=(code,x,y,w)=>{ const acts=actionsOn('keyboard',b=>b===code), g=el('g',{class:'ctl'+(acts.length?' used':''),'data-k':'k'+code},s);
    const r=el('rect',{x:x+3,y:y+3,width:w*U-6,height:U-6,rx:8,class:'sh'},g); if(acts.length) r.setAttribute('style',`stroke:${GC[acts[0].a.g]}`);
    const nm=code==='CapsLock'?'Caps':code==='MetaLeft'||code==='MetaRight'?'⊞':code==='ContextMenu'?'☰':C.keyName(code);
    el('text',{x:x+10,y:y+23,'font-size':16,fill:acts.length?'#fff':'#64748b','font-weight':600},g,nm);
    if(acts.length){ const t=acts.map(a=>SHORT[a.a.id]).join('/'), room=w*U-20, tt=el('text',{x:x+10,y:y+47,'font-size':14,'font-weight':700,fill:GC[acts[0].a.g]},g,t);
      if(t.length*8.2>room){ tt.setAttribute('textLength',room); tt.setAttribute('lengthAdjust','spacingAndGlyphs'); } }
    nodes['k'+code]={ctl:g,acts}; };
  KB.forEach((row,ri)=>{ let x=0; const y=ri*U+(ri?14:0); for(const [code,w] of row){ key(code,x,y,w); x+=w*U; } });
  const ax=15.4*U, y4=4*U+14, y5=5*U+14; key('ArrowUp',ax+U,y4,1); key('ArrowLeft',ax,y5,1); key('ArrowDown',ax+U,y5,1); key('ArrowRight',ax+2*U,y5,1);
  el('text',{x:0,y:H-6,class:'bn'},s,'Keys are where they sit on the keyboard, so they work the same on any layout');
  return s; }

/* ---------- the action list ---------- */
function drawList(){ const cols=[['keyboard',0,'Key 1'],['keyboard',1,'Key 2'],['wheel',-1,'Wheel'],['pad',-1,'Controller']];
  const t=document.createElement('table'); const th=t.insertRow(); th.innerHTML='<th>Action</th>'+cols.map(([k,,n])=>`<th class="${k===tab?'cur':''}">${n}</th>`).join('');
  for(const grp of C.GROUPS){ const acts=C.ACTIONS.filter(a=>a.g===grp); if(!acts.length) continue;
    const gr=t.insertRow(); gr.className='grp'; const gc=gr.insertCell(); gc.colSpan=5; gc.innerHTML=`<i style="background:${GC[grp]}"></i>`; gc.appendChild(document.createTextNode(grp));
    for(const a of acts){ const r=t.insertRow(); r.className='act'; r.dataset.id=a.id;
      const c0=r.insertCell(); c0.textContent=a.label; if(a.note){ const sm=document.createElement('small'); sm.textContent=a.note; c0.appendChild(sm); }
      for(const [k,idx] of cols){ const td=r.insertCell(); if(k===tab) td.className='cur'; let bs=(L[k]||{})[a.id]||[];
        if(k==='keyboard') bs=bs[idx]!=null?[bs[idx]]:[];
        if(!bs.length){ td.innerHTML='<span class="none">—</span>'; continue; }
        for(const b of bs){ const ch=document.createElement('span'); ch.className='chip'; ch.textContent=C.bindName(k,b); td.appendChild(ch); } } } }
  listEl.replaceChildren(t); }

/* ---------- highlighting ---------- */
// which controls on the current drawing an action uses
function ctlKeysFor(id){ const out=[], Lk=L[tab][id]||[];
  for(const b of Lk){ if(tab==='keyboard') out.push('k'+b);
    else if(b.b!=null) for(const i of [].concat(b.b)) out.push('b'+i);
    else if(b.shift!=null) out.push('b'+b.shift);
    else if(b.pedal) out.push('p'+b.pedal);
    else if(b.hat) out.push('hat');
    else if(b.axis!=null) out.push(tab==='pad'?(b.axis<2?'ls':'rs'):'steer'); }
  return out; }
function paint(){ const on=hover||sel; let ks=new Set(), ids=new Set();
  if(on&&on.type==='act'){ ids.add(on.id); for(const k of ctlKeysFor(on.id)) ks.add(k); }
  if(on&&on.type==='ctl'){ ks.add(on.k); for(const x of (nodes[on.k]&&nodes[on.k].acts)||[]) ids.add(x.a.id); }
  for(const k in nodes){ const n=nodes[k], h=ks.has(k); for(const e of [n.ctl,n.lab,n.lead]) if(e) e.classList.toggle('hi',h); }
  for(const r of listEl.querySelectorAll('tr.act')) r.classList.toggle('hi',ids.has(r.dataset.id));
  const info=$('.cvInfo'); if(!info) return;
  if(on&&on.type==='ctl'){ const n=nodes[on.k], c=ctls.find(c=>c.k===on.k); const nm=c?c.name:on.k.startsWith('k')?C.keyName(on.k.slice(1)):on.k.startsWith('b')?C.btnName(tab,+on.k.slice(1)):on.k==='steer'?'Wheel':on.k==='pclutch'?'Clutch pedal':on.k==='pbrake'?'Brake pedal':'Gas pedal';
    info.innerHTML=''; const b=document.createElement('b'); b.textContent=nm; info.append(b,document.createTextNode(n&&n.acts&&n.acts.length?' → '+n.acts.map(x=>x.a.label+(Array.isArray(x.b.b)?' (with '+x.b.b.filter(j=>'b'+j!==on.k).map(j=>C.btnName(tab,j)).join(', ')+')':'')).join(' · '):' → not used')); }
  else if(on&&on.type==='act'){ const a=C.ACT[on.id]; info.innerHTML=''; const b=document.createElement('b'); b.textContent=a.label;
    const where=(L[tab][on.id]||[]).map(x=>C.bindName(tab,x)); info.append(b,document.createTextNode(where.length?' → '+where.join(' or '):' → nothing on the '+(tab==='keyboard'?'keyboard':tab==='wheel'?'wheel':'controller')+' does this')); }
  else info.textContent=' '; }
function wire(){ // pointer + touch on drawn controls, labels and rows
  for(const g of drawEl.querySelectorAll('[data-k]')){ const k=g.dataset.k;
    g.addEventListener('pointerenter',e=>{ if(e.pointerType==='mouse'){ hover={type:'ctl',k}; paint(); } });
    g.addEventListener('pointerleave',e=>{ if(e.pointerType==='mouse'){ hover=null; paint(); } });
    g.addEventListener('click',()=>{ sel=sel&&sel.type==='ctl'&&sel.k===k?null:{type:'ctl',k}; paint(); }); }
  for(const r of listEl.querySelectorAll('tr.act')){ const id=r.dataset.id;
    r.addEventListener('pointerenter',e=>{ if(e.pointerType==='mouse'){ hover={type:'act',id}; paint(); } });
    r.addEventListener('pointerleave',e=>{ if(e.pointerType==='mouse'){ hover=null; paint(); } });
    r.addEventListener('click',()=>{ sel=sel&&sel.type==='act'&&sel.id===id?null:{type:'act',id}; paint(); }); } }

function render(){ L=layouts(); nodes={}; ctls=[];
  drawEl.replaceChildren(); const info=document.createElement('div'); info.className='cvInfo'; info.textContent=' ';
  if(tab==='wheel'){ drawEl.append(drawWheel(),info,drawShifterPedals()); }
  else if(tab==='pad'){ drawEl.append(drawPad(),info); }
  else { drawEl.append(drawKeyboard(),info); }
  root.classList.toggle('kb',tab==='keyboard'); drawList(); wire(); paint();
  for(const b of root.querySelectorAll('.cvTabs button')){ b.classList.toggle('on',b.dataset.k===tab); b.setAttribute('aria-selected',b.dataset.k===tab); }
  const d=window.WHEEL&&WHEEL.device&&WHEEL.device();
  for(const b of root.querySelectorAll('.cvTabs button')) b.classList.toggle('conn',!!d&&d.kind===b.dataset.k); }
for(const b of root.querySelectorAll('.cvTabs button')) b.addEventListener('click',()=>{ tab=b.dataset.k; sel=hover=null; render(); });

/* ---------- live input ---------- */
const liveOn=new Set();
C.onLive((kind,code,down)=>{ if(!root.classList.contains('on')) return;
  if(down&&kind!==tab&&!(kind==='keyboard'&&(code==='Escape'||code==='Tab'))){ tab=kind; sel=hover=null; render(); }
  if(kind!==tab) return; const k=kind==='keyboard'?'k'+code:'b'+code, n=nodes[k];
  if(down) liveOn.add(k); else liveOn.delete(k);
  if(n) for(const e of [n.ctl,n.lab,n.lead]) if(e) e.classList.toggle('live',down);
  const ids=new Set(); for(const kk of liveOn) for(const x of (nodes[kk]&&nodes[kk].acts)||[]) ids.add(x.a.id);
  for(const r of listEl.querySelectorAll('tr.act')) r.classList.toggle('live',ids.has(r.dataset.id));
  if(down&&n){ hover=null; sel={type:'ctl',k}; paint(); } });
function tick(){ raf=requestAnimationFrame(tick); const lv=C.live; if(!lv||lv.kind!==tab||performance.now()-lv.t>500) return;
  if(tab==='wheel'){ const ax=lv.axes, n=nodes.steer; if(n){ const nd=n.ctl.querySelector('.needle'); if(nd) nd.setAttribute('x',1117+Math.max(-1,Math.min(1,ax[0]||0))*47); }
    const cfg=window.WHEEL&&WHEEL.learned&&WHEEL.learned(lv.id)||{};
    for(const p of ['gas','brake']){ const q=cfg[p], nn=nodes['p'+p]; if(!nn) continue; let v=0; if(q&&ax[q.i]!==undefined) v=Math.max(0,Math.min(1,(ax[q.i]-q.rest)/(q.full-q.rest)));
      const f=nn.ctl.querySelector('.fill'); if(f){ f.setAttribute('height',v*142); f.setAttribute('y',236-v*142); } nn.ctl.classList.toggle('live',v>.05); }
    // the D-pad is one "hat" axis: the axis that rests outside -1…1
    if(hatI<0) hatI=ax.findIndex(v=>Math.abs(v)>1.05);
    const h=nodes.hat; if(h&&hatI>=0){ const v=ax[hatI], down=v>=-1.05&&v<=1.05; for(const e of [h.ctl,h.lab,h.lead]) if(e) e.classList.toggle('live',down); } }
  else if(tab==='pad'){ const ax=lv.axes; for(const [k,i] of [['ls',0],['rs',2]]){ const n=nodes[k]; if(!n) continue; const mv=Math.hypot(ax[i]||0,ax[i+1]||0)>.25; for(const e of [n.ctl,n.lab,n.lead]) if(e) e.classList.toggle('live',mv); } } }

/* ---------- open / close ---------- */
function open(t){ const d=window.WHEEL&&WHEEL.device&&WHEEL.device(); tab=t||(d?d.kind:'keyboard'); sel=hover=null; hatI=-1; liveOn.clear();
  root.classList.add('on'); C.paused=true; render(); cancelAnimationFrame(raf); raf=requestAnimationFrame(tick);
  const sp=document.getElementById('settings'); if(sp) sp.classList.remove('on'); const gr=document.getElementById('gear'); if(gr) gr.classList.remove('on'); }
function close(){ root.classList.remove('on'); C.paused=false; cancelAnimationFrame(raf); }
const toggle=()=>root.classList.contains('on')?close():open();
$('.cvX').addEventListener('click',close);
addEventListener('keydown',e=>{ if(root.classList.contains('on')&&e.code==='Escape') close(); });
addEventListener('gamepadconnected',()=>{ if(root.classList.contains('on')) render(); }); addEventListener('gamepaddisconnected',()=>{ if(root.classList.contains('on')) render(); });
window.CTRLVIEW={open,close,toggle};

/* ⚙️ → Driving → Controls row: only where there's a keyboard, mouse or controller (not a phone on its own) */
const row=document.getElementById('ctrlRow'), btn=document.getElementById('ctrlBtn');
const showRow=()=>{ if(row) row.style.display=''; };
try{ if(matchMedia('(any-pointer: fine)').matches) showRow(); }catch(e){}
addEventListener('keydown',showRow,{once:true}); addEventListener('gamepadconnected',showRow);
try{ if([...navigator.getGamepads()].some(Boolean)) showRow(); }catch(e){}
if(btn) btn.addEventListener('click',e=>{ e.stopPropagation(); open(); });
})();
