/* The snow plow's amber light bar (tools/make-snowplow.py: lenses use the materials Beacon and BeaconB): while its
   engine runs the two sets flash in turn, about twice a second, like a real plow's strobes. Off with the engine. */
(()=>{
'use strict';
let A=null, B=null, was=null;
setInterval(()=>{
  const M=typeof MODELS!=='undefined'&&MODELS.snowplow; if(!M) return;
  if(!A){ for(const m of M.mats||[]){ if(m.name==='Beacon') A=m; else if(m.name==='BeaconB') B=m; } if(!A) return; }
  const on=typeof CARKEY!=='undefined'&&CARKEY==='snowplow'&&!!(window.IGN&&(IGN.state==='on'||IGN.state==='crank'));
  const ph=on?(Math.floor(performance.now()/260)%4):-1;           // A A B B
  const key=ph<0?'off':ph<2?'a':'b'; if(key===was) return; was=key;
  for(const [m,lit] of [[A,key==='a'],[B,key==='b']]) if(m&&m.emissive){ m.emissive.setRGB(lit?2.6:0,lit?1.1:0,lit?.05:0); m.needsUpdate=false; }
  if(typeof dirty!=='undefined') dirty=true;
},60);
})();
