/* Racing wheel + pedals on a PC (Logitech G29 and similar), through the browser's Gamepad API.
   game.js step() asks window.WHEEL.read() every frame → {st, gas} (st −1 left … 1 right; gas = gas − brake, −1 … 1)
   or null when no wheel is set up. Steering = axis 0 (every wheel driver puts it there). Pedal axes differ by driver,
   browser and the wheel's mode switch, so they are learned once: press the gas, let go, press the brake, let go.
   Saved per device id in localStorage ydWheel. Chrome reports an untouched pedal as 0 until it first moves, so a
   pedal axis is ignored until it has reported something other than exactly 0 (else a resting pedal reads half).
   Automatic gearbox (owner 2026-11-21: "the brake works like a brake and doesn't go in reverse… use the stick shift module
   from the G29 accessory… drive (forward 1 position) and reverse (back 2 position) as an auto transmission"):
   with the wheel, the brake only ever brakes (it holds the car at a stop) and the gas drives the way the selector says:
   D forward, R backward, N nothing. Selector = the Driving Force Shifter: 1st = D, 2nd = R, any other slot or the
   middle = N. Its button numbers are learned in ⚙️ (Shifter); before that the usual G29 numbers are tried (1st = 13,
   2nd = 14, counting from 1). No shifter used yet: D; press both paddles together to switch between D and R.
   Paddles (owner 2026-11-21, issue #1): the turn signals — left paddle left, right paddle right, again to cancel
   (js/enh/signals.js). A press of both together within 0.25 s is the D/R switch instead (without a shifter).
   read() → {st, gas (pedal 0…1), brake (0…1), sel ('D','R','N'), ok}. */
(function(){
  'use strict';
  if(!navigator.getGamepads) return;
  const DEAD=.015, ST=0;
  let cfg={}; try{ cfg=JSON.parse(localStorage.getItem('ydWheel')||'{}')||{}; }catch(e){ cfg={}; }
  const save=()=>{ try{ localStorage.setItem('ydWheel',JSON.stringify(cfg)); }catch(e){} };
  const say=(m,ms)=>{ if(typeof toast==='function') toast(m,ms||3200); };
  let pad=null, live={}, cal=null, seen=false, learn=false, prevB=[], shLearn=null, sel='D', shUsed=false, paddleT=null;

  const isWheel=g=>g&&g.axes&&g.axes.length>=3&&g.mapping!=='standard'||/wheel|g29|g920|g923|g27|g25|driving force|racing|logitech/i.test(g&&g.id||'');
  function find(){ const ps=navigator.getGamepads(); let best=null;
    for(const g of ps) if(g&&g.connected&&isWheel(g)){ best=g; if(/g29|g920|g923|wheel|driving/i.test(g.id)) break; }
    return best; }
  const pedal=(g,p)=>{ if(!p) return 0; const raw=g.axes[p.i]; if(raw===undefined) return 0;
    const k=p.i; if(raw!==0) live[k]=1; if(!live[k]) return 0;
    const v=(raw-p.rest)/(p.full-p.rest); return v<.03?0:Math.min(1,v); };

  /* calibration: step 'gas' / 'brake'; each waits for an axis (not steering) to move far, follows it to its
     extreme, then waits until it has settled back for .4 s and records that as the rest value */
  function startCal(){ const g=find(); if(!g){ say('Turn the wheel or press a pedal so the browser sees it, then try again'); return; }
    cal={step:'gas', base:g.axes.slice(), ax:-1, full:0, still:0, t:0, out:{}}; showRow();
    say('Wheel setup: press the GAS pedal all the way, then let go',6000); }
  function runCal(g,dt){ const c=cal; c.t+=dt;
    if(c.t>25){ cal=null; showRow(); say('Wheel setup timed out — try again from ⚙️'); return; }
    if(c.ax<0){ let bi=-1,bd=.6; g.axes.forEach((v,i)=>{ if(i===ST||i===c.skip) return; const d=Math.abs(v-c.base[i]); if(d>bd){bd=d;bi=i;} });
      if(bi>=0){ c.ax=bi; c.full=g.axes[bi]; c.prev=c.full; c.still=0; } return; }
    const v=g.axes[c.ax]; if(Math.abs(v-c.base[c.ax])>Math.abs(c.full-c.base[c.ax])) c.full=v;
    const moving=Math.abs(v-c.prev)>.01; c.prev=v;
    const back=Math.abs(v-c.full)>Math.abs(c.full-c.base[c.ax])*.6||Math.abs(v-c.full)>1.2;   // well away from the pressed end
    c.still=(!moving&&back)?c.still+dt:0;
    if(c.still<.4) return;
    c.out[c.step]={i:c.ax, rest:v, full:c.full};
    if(Math.abs(c.full-v)<.5){ c.ax=-1; return; }   // too small a travel: wait for a real press
    if(c.step==='gas'){ cal={step:'brake', base:g.axes.slice(), ax:-1, full:0, still:0, t:0, out:c.out, skip:c.ax}; say('Now press the BRAKE pedal all the way, then let go',6000); return; }
    cfg[g.id]=Object.assign(cfg[g.id]||{},{gas:c.out.gas, brake:c.out.brake}); save(); cal=null; live={}; live[c.out.gas.i]=live[c.out.brake.i]=1;
    showRow(); say('🏁 Wheel ready — gas and brake; shifter 1st = Drive, 2nd = Reverse; paddles = turn signals',4200); }

  /* ---------- Xbox (or any standard) controller (owner 2026-11-22: "add support for playing with an Xbox controller
     connected to a pc ... the same preferred settings as the g29 ... hiding the onscreen steering and accelerator and brake").
     Used when no wheel is plugged in. Left stick steers (a soft centre for fine control); RT = gas, LT = brake (it only
     brakes, like the wheel); Y = Drive / Reverse; X = engine start / stop; LB / RB = left / right signal, both = hazards;
     View (⧉) = chase / cockpit; D-pad or right stick = look around. Standard Gamepad layout, so no setup. */
  const isPad=g=>g&&g.connected&&g.mapping==='standard'&&!isWheel(g)&&g.axes&&g.axes.length>=4;
  function findPad(){ for(const g of navigator.getGamepads()) if(isPad(g)) return g; return null; }
  let padId=null, prevP=[], psel='D', bumpT=null;
  function readPad(g,dt){
    if(padId!==g.id){ padId=g.id; prevP=[]; showRow(); say('🎮 Controller connected — RT gas · LT brake · left stick steers · Y Drive / Reverse · LB / RB signals · View = cockpit',5200); }
    const bs=g.buttons||[], val=i=>bs[i]?(+bs[i].value||(bs[i].pressed?1:0)):0, down=i=>val(i)>.5, hit=i=>down(i)&&!prevP[i];
    if(hit(3)){ psel=psel==='R'?'D':'R'; say(psel==='R'?'⏪ Reverse':'⏩ Drive',1400); if(window.SOUND&&SOUND.click) try{ SOUND.click(); }catch(e){} }
    if(hit(2)&&window.IGN) IGN.button();
    if(hit(8)&&window.COCKPIT) COCKPIT.toggle();
    const now=performance.now();
    for(const [b,d] of [[4,-1],[5,1]]) if(hit(b)){
      if(bumpT&&now-bumpT.t<250&&bumpT.d!==d){ if(window.SIG){ SIG.press(bumpT.d); SIG.hazard(); } bumpT=null; }   // both bumpers: hazards (undo the first one's signal)
      else { bumpT={t:now,d}; if(window.SIG) SIG.press(d); } }
    // look around: D-pad (held) or the right stick
    let hx=(down(15)?1:0)-(down(14)?1:0), hy=(down(12)?1:0)-(down(13)?1:0);
    const rx=g.axes[2]||0, ry=g.axes[3]||0; if(Math.abs(rx)>.2) hx+=rx*1.2; if(Math.abs(ry)>.2) hy-=ry;
    if((hx||hy)&&typeof LOOK!=='undefined'){ const ck=window.COCKPIT&&COCKPIT.on, dY=hx*90*dt;
      LOOK.yaw=((LOOK.yaw+dY)%360+540)%360-180; S.camB=((S.camB+dY)%360+360)%360;
      LOOK.pitch=Math.max(-55,Math.min(ck?135:12,LOOK.pitch+hy*(ck?70:45)*dt)); dirty=true;
      const c=document.getElementById('compass'); if(c) c.classList.add('look'); }
    prevP=bs.map((b,i)=>down(i));
    let st=g.axes[0]||0; const D=.12; st=Math.abs(st)<D?0:Math.sign(st)*Math.pow((Math.abs(st)-D)/(1-D),1.5);
    const gp=val(7), bp=val(6), G=gp<.04?0:gp, B=bp<.04?0:bp;
    return {st:Math.max(-1,Math.min(1,st)), gas:G-B, pedal:G, brake:B, sel:psel, ok:true, pad:true}; }
  // which axis is the hat: the one sitting outside -1..1 when nothing's pressed (G29 ~1.29); remembered per wheel
  const hats={};
  function hatAxis(g){ if(hats[g.id]!=null) return hats[g.id]; const i=g.axes.findIndex(v=>Math.abs(v)>1.05); if(i>=0) hats[g.id]=i; return i; }
  let last=performance.now();
  window.WHEEL={
    read(){ const now=performance.now(), dt=Math.min(.1,(now-last)/1000); last=now;
      const g=find(); if(!g){ if(pad){ pad=null; showRow(); say('Wheel disconnected'); }
        const p=findPad(); if(p) return readPad(p,dt); if(padId){ padId=null; showRow(); say('🎮 Controller disconnected'); } return null; }
      if(!pad||pad!==g.id){ pad=g.id; live={}; showRow();
        if(cfg[g.id]&&cfg[g.id].gas) say('🏁 Wheel connected'); else if(!cal){ say('🏁 Wheel connected — set up the pedals in ⚙️ (Wheel)',5000); } }
      // a learned button switches chase / cockpit view (js/enh/cockpit.js); learning = the next button pressed
      const bs=g.buttons||[], down=i=>!!(bs[i]&&(bs[i].pressed||bs[i].value>.5));
      if(shLearn){ for(let i=0;i<bs.length;i++) if(down(i)&&!prevB[i]){ shLearn[shLearn.step]=i;
          if(shLearn.step==='d'){ shLearn.step='r'; say('Now move the shifter to 2nd (that will be Reverse)',6000); }
          else { cfg[g.id]=Object.assign(cfg[g.id]||{},{shift:{d:shLearn.d,r:shLearn.r}}); save(); shLearn=null; shUsed=true; showRow(); say('⚙️ Shifter ready: 1st = Drive · 2nd = Reverse · middle = Neutral',4200); }
          break; } }
      else if(learn){ for(let i=0;i<bs.length;i++) if(down(i)&&!prevB[i]){ const o={}; o[learn]=i; cfg[g.id]=Object.assign(cfg[g.id]||{},o); save();
          say(learn==='start'?'🔑 Wheel button '+(i+1)+' now starts and stops the engine':'🎥 Wheel button '+(i+1)+' now switches chase / cockpit view',3600); learn=false; showRow(); break; } }
      else { if(cfg[g.id]&&cfg[g.id].view!=null){ const v=cfg[g.id].view; if(down(v)&&!prevB[v]&&window.COCKPIT) COCKPIT.toggle(); }
        // engine start / stop (owner 2026-11-21): the Enter button in the middle of the G29's red dial — button 24 counting
        // from 1 on the G29's usual numbering — or whichever button was set in ⚙️ (Start button). js/enh/ignition.js
        const sb=cfg[g.id]&&cfg[g.id].start!=null?cfg[g.id].start:23; if(down(sb)&&!prevB[sb]&&window.IGN) IGN.button();
        // wipers on / off (owner 2026-11-22): the blue R2 button on the G29's right spoke — button 7 counting from 1
        if(g.mapping!=='standard'&&down(6)&&!prevB[6]&&window.COCKPIT&&COCKPIT.wiper) COCKPIT.wiper();
        // Music panel open / close (owner 2026-11-22): the L2 button on the G29's left spoke — button 8 counting from 1.
        // Opened this way it doesn't take the keyboard (js/enh/music.js)
        if(g.mapping!=='standard'&&down(7)&&!prevB[7]&&window.MUSIC&&MUSIC.toggle) MUSIC.toggle(false); }
      // gear selector: the shifter when it's been used (otherwise D, or R after both paddles together)
      if(!shLearn&&!learn){ const sh=(cfg[g.id]&&cfg[g.id].shift)||{d:12,r:13};
        if(down(sh.d)||down(sh.r)) shUsed=true;
        if(shUsed){ const s2=down(sh.d)?'D':down(sh.r)?'R':'N'; if(s2!==sel){ sel=s2; if(window.SOUND&&SOUND.click) try{ SOUND.click(); }catch(e){} } }
      }
      // paddles: right = button 5, left = button 6 (counting from 1) — turn signals; both together = D/R without a shifter
      if(!shLearn&&!learn){ const now2=performance.now();
        for(const [b,d] of [[4,1],[5,-1]]) if(down(b)&&!prevB[b]){
          if(paddleT&&now2-paddleT.t<250&&paddleT.d!==d){            // the other paddle just went: both together
            if(window.SIG&&paddleT.did) SIG.press(paddleT.d);         // undo the signal the first press switched
            if(!shUsed){ sel=sel==='R'?'D':'R'; say(sel==='R'?'⏪ Reverse':'⏩ Drive',1400); } paddleT=null; }
          else { paddleT={t:now2,d,did:!!window.SIG}; if(window.SIG) SIG.press(d); } } }
      // D-pad (owner 2026-11-21: "make those buttons move the camera angle"): held, it turns the view — up / down look
      // higher / lower, left / right look round — in chase and cockpit view, like dragging on the screen. The G29 reports
      // its D-pad as one "hat" axis (a value in 8 steps from -1 to 1, ~1.29 when let go); on the standard layout it's buttons 12-15.
      if(!shLearn&&!learn){ let hx=0, hy=0;
        if(g.mapping==='standard'){ hx=(down(15)?1:0)-(down(14)?1:0); hy=(down(12)?1:0)-(down(13)?1:0); }
        else { const hi=hatAxis(g); if(hi>=0){ const v=g.axes[hi]; if(v>=-1.05&&v<=1.05){ const k=Math.round((v+1)*3.5)&7, a=k*Math.PI/4; hx=Math.round(Math.sin(a)); hy=Math.round(Math.cos(a)); } } }
        if((hx||hy)&&typeof LOOK!=="undefined"){ const ck=window.COCKPIT&&COCKPIT.on, dY=hx*90*dt;
          LOOK.yaw=((LOOK.yaw+dY)%360+540)%360-180; S.camB=((S.camB+dY)%360+360)%360;
          LOOK.pitch=Math.max(-55,Math.min(ck?135:12,LOOK.pitch+hy*(ck?70:45)*dt)); dirty=true;
          const c=document.getElementById('compass'); if(c) c.classList.add('look'); } }
      prevB=bs.map((b,i)=>down(i));
      if(cal){ runCal(g,dt); return {st:0,gas:0,cal:true}; }
      let st=g.axes[ST]||0; st=Math.abs(st)<DEAD?0:(st-Math.sign(st)*DEAD)/(1-DEAD);
      const c=cfg[g.id], gp=c&&c.gas?pedal(g,c.gas):0, bp=c&&c.brake?pedal(g,c.brake):0;
      return {st:Math.max(-1,Math.min(1,st)), gas:gp-bp, pedal:gp, brake:bp, sel, ok:!!(c&&c.gas)};
    },
    setup:startCal, connected:()=>!!(find()||findPad()), gear:()=>find()&&cfg[pad]&&cfg[pad].gas?sel:(!find()&&findPad()?psel:null)
  };

  // ⚙️ row, only shown once a wheel has been seen (keeps the phone panel unchanged)
  // the on-screen steering slider and pedals step aside while a wheel is plugged in (owner 2026-11-20), and come back if it's unplugged
  function showRow(){ const g0=find(); document.body.classList.toggle('wheel',!!(g0||findPad()));   // a controller hides the on-screen controls too
    const row=document.getElementById('wheelRow'); if(!row) return; const g=g0;
    if(g) seen=true; row.style.display=seen?'':'none';
    const s=document.getElementById('wheelStat'); if(s) s.textContent=!g?'Not connected':cal?'Setting up…':shLearn?'Move the shifter to '+(shLearn.step==='d'?'1st (Drive)':'2nd (Reverse)'):learn?(learn==='start'?'Press the wheel button you want to start / stop the engine':'Press the wheel button you want for the view'):cfg[g.id]&&cfg[g.id].gas?'Ready · gear '+sel+(cfg[g.id].shift?' · shifter set':'')+(cfg[g.id].view!=null?' · view button '+(cfg[g.id].view+1):'')+' · start button '+((cfg[g.id].start!=null?cfg[g.id].start:23)+1):'Pedals not set up';
    if(!g0){ const p=findPad(); if(p){ row.style.display=''; if(s) s.textContent='🎮 Controller · RT gas · LT brake · Y Drive / Reverse · X engine · LB / RB signals · View = cockpit'; } } }
  addEventListener('gamepadconnected',showRow); addEventListener('gamepaddisconnected',showRow);
  const btn=document.getElementById('wheelBtn'); if(btn) btn.addEventListener('click',e=>{ e.stopPropagation(); startCal(); });
  const vb=document.getElementById('wheelViewBtn'); if(vb) vb.addEventListener('click',e=>{ e.stopPropagation(); if(!find()){ say('Turn the wheel or press a pedal so the browser sees it, then try again'); return; } learn='view'; prevB=[]; showRow(); say('Press the button on the wheel you want to switch the view',5000); });
  const stb=document.getElementById('wheelStartBtn'); if(stb) stb.addEventListener('click',e=>{ e.stopPropagation(); if(!find()){ say('Turn the wheel or press a pedal so the browser sees it, then try again'); return; } learn='start'; prevB=[]; showRow(); say('Press the button on the wheel you want to start and stop the engine',5000); });
  const sb=document.getElementById('wheelShiftBtn'); if(sb) sb.addEventListener('click',e=>{ e.stopPropagation(); if(!find()){ say('Turn the wheel or press a pedal so the browser sees it, then try again'); return; }
    learn=false; shLearn={step:'d'}; prevB=[]; showRow(); say('Shifter setup: move the shifter to 1st (that will be Drive)',6000); });
  showRow();
})();
