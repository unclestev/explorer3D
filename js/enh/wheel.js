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
   2nd = 14, counting from 1). No shifter used yet: D, and the paddles pick D (right) / R (left).
   read() → {st, gas (pedal 0…1), brake (0…1), sel ('D','R','N'), ok}. */
(function(){
  'use strict';
  if(!navigator.getGamepads) return;
  const DEAD=.015, ST=0;
  let cfg={}; try{ cfg=JSON.parse(localStorage.getItem('ydWheel')||'{}')||{}; }catch(e){ cfg={}; }
  const save=()=>{ try{ localStorage.setItem('ydWheel',JSON.stringify(cfg)); }catch(e){} };
  const say=(m,ms)=>{ if(typeof toast==='function') toast(m,ms||3200); };
  let pad=null, live={}, cal=null, seen=false, learn=false, prevB=[], shLearn=null, sel='D', shUsed=false;

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
    showRow(); say('🏁 Wheel ready — gas and brake; shifter 1st = Drive, 2nd = Reverse (or paddles: right D, left R)',4200); }

  let last=performance.now();
  window.WHEEL={
    read(){ const now=performance.now(), dt=Math.min(.1,(now-last)/1000); last=now;
      const g=find(); if(!g){ if(pad){ pad=null; showRow(); say('Wheel disconnected'); } return null; }
      if(!pad||pad!==g.id){ pad=g.id; live={}; showRow();
        if(cfg[g.id]&&cfg[g.id].gas) say('🏁 Wheel connected'); else if(!cal){ say('🏁 Wheel connected — set up the pedals in ⚙️ (Wheel)',5000); } }
      // a learned button switches chase / cockpit view (js/enh/cockpit.js); learning = the next button pressed
      const bs=g.buttons||[], down=i=>!!(bs[i]&&(bs[i].pressed||bs[i].value>.5));
      if(shLearn){ for(let i=0;i<bs.length;i++) if(down(i)&&!prevB[i]){ shLearn[shLearn.step]=i;
          if(shLearn.step==='d'){ shLearn.step='r'; say('Now move the shifter to 2nd (that will be Reverse)',6000); }
          else { cfg[g.id]=Object.assign(cfg[g.id]||{},{shift:{d:shLearn.d,r:shLearn.r}}); save(); shLearn=null; shUsed=true; showRow(); say('⚙️ Shifter ready: 1st = Drive · 2nd = Reverse · middle = Neutral',4200); }
          break; } }
      else if(learn){ for(let i=0;i<bs.length;i++) if(down(i)&&!prevB[i]){ cfg[g.id]=Object.assign(cfg[g.id]||{},{view:i}); save(); learn=false; showRow(); say('🎥 Wheel button '+(i+1)+' now switches chase / cockpit view',3600); break; } }
      else if(cfg[g.id]&&cfg[g.id].view!=null){ const v=cfg[g.id].view; if(down(v)&&!prevB[v]&&window.COCKPIT) COCKPIT.toggle(); }
      // gear selector: the shifter when it's been used, otherwise the paddles (G29: right paddle button 5, left 6, counting from 1)
      if(!shLearn&&!learn){ const sh=(cfg[g.id]&&cfg[g.id].shift)||{d:12,r:13};
        if(down(sh.d)||down(sh.r)) shUsed=true;
        if(shUsed){ const s2=down(sh.d)?'D':down(sh.r)?'R':'N'; if(s2!==sel){ sel=s2; if(window.SOUND&&SOUND.click) try{ SOUND.click(); }catch(e){} } }
        else { if(down(4)&&!prevB[4]) sel='D'; if(down(5)&&!prevB[5]) sel='R'; } }
      prevB=bs.map((b,i)=>down(i));
      if(cal){ runCal(g,dt); return {st:0,gas:0,cal:true}; }
      let st=g.axes[ST]||0; st=Math.abs(st)<DEAD?0:(st-Math.sign(st)*DEAD)/(1-DEAD);
      const c=cfg[g.id], gp=c&&c.gas?pedal(g,c.gas):0, bp=c&&c.brake?pedal(g,c.brake):0;
      return {st:Math.max(-1,Math.min(1,st)), gas:gp-bp, pedal:gp, brake:bp, sel, ok:!!(c&&c.gas)};
    },
    setup:startCal, connected:()=>!!find(), gear:()=>find()&&cfg[pad]&&cfg[pad].gas?sel:null
  };

  // ⚙️ row, only shown once a wheel has been seen (keeps the phone panel unchanged)
  // the on-screen steering slider and pedals step aside while a wheel is plugged in (owner 2026-11-20), and come back if it's unplugged
  function showRow(){ const g0=find(); document.body.classList.toggle('wheel',!!g0);
    const row=document.getElementById('wheelRow'); if(!row) return; const g=g0;
    if(g) seen=true; row.style.display=seen?'':'none';
    const s=document.getElementById('wheelStat'); if(s) s.textContent=!g?'Not connected':cal?'Setting up…':shLearn?'Move the shifter to '+(shLearn.step==='d'?'1st (Drive)':'2nd (Reverse)'):learn?'Press the wheel button you want for the view':cfg[g.id]&&cfg[g.id].gas?'Ready · gear '+sel+(cfg[g.id].shift?' · shifter set':'')+(cfg[g.id].view!=null?' · view button '+(cfg[g.id].view+1):''):'Pedals not set up'; }
  addEventListener('gamepadconnected',showRow); addEventListener('gamepaddisconnected',showRow);
  const btn=document.getElementById('wheelBtn'); if(btn) btn.addEventListener('click',e=>{ e.stopPropagation(); startCal(); });
  const vb=document.getElementById('wheelViewBtn'); if(vb) vb.addEventListener('click',e=>{ e.stopPropagation(); if(!find()){ say('Turn the wheel or press a pedal so the browser sees it, then try again'); return; } learn=true; prevB=[]; showRow(); say('Press the button on the wheel you want to switch the view',5000); });
  const sb=document.getElementById('wheelShiftBtn'); if(sb) sb.addEventListener('click',e=>{ e.stopPropagation(); if(!find()){ say('Turn the wheel or press a pedal so the browser sees it, then try again'); return; }
    learn=false; shLearn={step:'d'}; prevB=[]; showRow(); say('Shifter setup: move the shifter to 1st (that will be Drive)',6000); });
  showRow();
})();
