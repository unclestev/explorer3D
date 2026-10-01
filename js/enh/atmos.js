/* Real time of day and live weather. */
(()=>{
'use strict';
const {ENH,EMPTY,PXM,UNDER,mz,mzE,safe,addUnder,srcName,img,addImg,onReady,onTick,psd,polyDist,segX,abbr,post,octa,rrect,ISZ,BILL}=YD;

/* ---------- 4. REAL TIME OF DAY + LIVE WEATHER ----------
   The sun's real position over the car sets how dark the map is, the sky, which way buildings are lit,
   lit windows after dark and the SUV's headlights. Current conditions from Open-Meteo (free, no key) add
   rain, snow, fog, cloud dimming and lightning. For testing, ?hour=21.5 fixes the clock and ?wx=63 fixes
   the weather (WMO code). */
const QS=(()=>{ try{ return new URLSearchParams(location.search); }catch(e){ return {get:()=>null}; } })();
const FIX_HOUR=QS.get('hour')!=null&&isFinite(+QS.get('hour'))?+QS.get('hour'):null, FIX_WX=QS.get('wx')!=null&&isFinite(+QS.get('wx'))?+QS.get('wx'):null;
function nowDate(){ if(FIX_HOUR==null) return new Date(); const d=new Date(); d.setHours(0,0,0,0); return new Date(d.getTime()+FIX_HOUR*3600000); }
// solar altitude/azimuth in degrees (azimuth clockwise from north); accurate to well under a degree
function sunPos(date,lat,lng){
  const R=Math.PI/180, d=date.getTime()/86400000-10957.5;
  const g=(357.529+.98560028*d)*R, q=280.459+.98564736*d, L=(q+1.915*Math.sin(g)+.020*Math.sin(2*g))*R, e=(23.439-.00000036*d)*R;
  const ra=Math.atan2(Math.cos(e)*Math.sin(L),Math.cos(L)), dec=Math.asin(Math.sin(e)*Math.sin(L));
  const gmst=(18.697374558+24.06570982441908*d)%24, H=(gmst*15+lng)*R-ra, la=lat*R;
  const alt=Math.asin(Math.sin(la)*Math.sin(dec)+Math.cos(la)*Math.cos(dec)*Math.cos(H));
  const az=Math.atan2(-Math.sin(H),Math.tan(dec)*Math.cos(la)-Math.sin(la)*Math.cos(H));
  return {alt:alt/R,az:((az/R)+360)%360};
}
// WMO weather code -> what to draw
function wxFrom(code){
  const c=+code, W={code:c,type:null,int:0,fog:0,thunder:false,icon:'☀️',text:'Clear'};
  if(c===1){ W.icon='🌤️'; W.text='Mostly clear'; } else if(c===2){ W.icon='⛅'; W.text='Partly cloudy'; } else if(c===3){ W.icon='☁️'; W.text='Overcast'; }
  else if(c===45||c===48){ W.icon='🌫️'; W.text=c===48?'Freezing fog':'Fog'; W.fog=.85; }
  else if(c>=51&&c<=57){ W.icon='🌦️'; W.text=c>=56?'Freezing drizzle':'Drizzle'; W.type='rain'; W.int=c===51||c===56?.2:c===53?.3:.4; }
  else if(c>=61&&c<=67){ W.icon='🌧️'; W.text=(c>=66?'Freezing rain':c===61?'Light rain':c===63?'Rain':'Heavy rain'); W.type='rain'; W.int=c===61||c===66?.4:c===63?.7:1; }
  else if(c>=71&&c<=77){ W.icon='🌨️'; W.text=c===77?'Snow grains':c===71?'Light snow':c===73?'Snow':'Heavy snow'; W.type='snow'; W.int=c===71||c===77?.35:c===73?.65:1; }
  else if(c>=80&&c<=82){ W.icon='🌧️'; W.text=c===80?'Rain showers':'Heavy showers'; W.type='rain'; W.int=c===80?.5:c===81?.8:1; }
  else if(c===85||c===86){ W.icon='🌨️'; W.text='Snow showers'; W.type='snow'; W.int=c===85?.5:.9; }
  else if(c>=95){ W.icon='⛈️'; W.text='Thunderstorm'; W.type='rain'; W.int=.9; W.thunder=true; }
  return W;
}
const AT={wx:wxFrom(FIX_WX!=null?FIX_WX:0), cloud:FIX_WX!=null?(FIX_WX>=3?1:FIX_WX===2?.5:0):0, temp:null, tzOff:null, wxAt:null, wxT:0, wxBusy:false,
  k:-1, windows:false, beams:null, lastKey:''};
const tintEl=document.getElementById('tint'), wxlEl=document.getElementById('wxl'), fogEl=document.getElementById('fog'), flashEl=document.getElementById('flash'), wxCv=document.getElementById('wx');
async function loadWeather(){
  if(AT.wxBusy||FIX_WX!=null) return; AT.wxBusy=true; AT.wxT=Date.now();
  const lat=S.lat, lng=S.lng, ctl=new AbortController(), to=setTimeout(()=>ctl.abort(),8000);
  try{
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}`+
      `&current=temperature_2m,weather_code,cloud_cover,visibility,precipitation,snowfall`+
      `&minutely_15=precipitation,snowfall&past_minutely_15=2&forecast_minutely_15=1&temperature_unit=fahrenheit&timezone=auto`,{signal:ctl.signal});
    if(!r.ok) throw new Error('weather '+r.status);
    const j=await r.json(), c=j.current||{};
    AT.wx=wxFrom(c.weather_code||0); AT.cloud=Math.max(0,Math.min(1,(c.cloud_cover??0)/100));
    // The weather code is a coarse summary and often still says "overcast" while light or patchy rain is falling.
    // Use the measured precipitation too: the current 15-minute amount and the 15-minute slots around now.
    const m=j.minutely_15||{}, sum=a=>Array.isArray(a)?a.reduce((x,y)=>Math.max(x,+y||0),0):0;
    const rate=Math.max(+c.precipitation||0,sum(m.precipitation))*4;             // mm per hour
    const snowing=(+c.snowfall||0)>0||sum(m.snowfall)>0||(c.temperature_2m!=null&&c.temperature_2m<=33);
    if(!AT.wx.type&&!AT.wx.fog&&rate>=.1){
      const code=snowing?(rate<1?71:rate<4?73:75):(rate<2.5?61:rate<7.6?63:65);
      AT.wx=wxFrom(code); AT.cloud=Math.max(AT.cloud,.85); }
    AT.rate=rate;
    if(c.visibility!=null&&c.visibility<3000) AT.wx.fog=Math.max(AT.wx.fog,Math.min(.9,(3000-c.visibility)/2500));
    AT.temp=c.temperature_2m!=null?Math.round(c.temperature_2m):null; AT.tzOff=j.utc_offset_seconds!=null?j.utc_offset_seconds:null;
    AT.wxAt=[lng,lat]; AT.lastKey=''; applyAtmos(); startWx();
  }catch(e){ console.warn('weather',e&&e.message||e); AT.wxAt=[lng,lat]; }
  finally{ clearTimeout(to); AT.wxBusy=false; }
}
// refresh every 5 minutes, after driving 8 km, and whenever you come back to the app after 2+ minutes away
onTick(5000,function weatherTick(){
  const moved=AT.wxAt?meters(AT.wxAt[1],AT.wxAt[0],S.lat,S.lng):1e9;
  if(moved>8000||Date.now()-AT.wxT>5*60000) loadWeather();
});
document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&Date.now()-AT.wxT>2*60000) loadWeather(); });
// local clock at the car (Open-Meteo gives the place's UTC offset; the device clock otherwise)
function clock(){
  const d=nowDate(); let h,m;
  if(AT.tzOff!=null&&FIX_HOUR==null){ const t=new Date(d.getTime()+AT.tzOff*1000); h=t.getUTCHours(); m=t.getUTCMinutes(); } else { h=d.getHours(); m=d.getMinutes(); }
  return (h%12||12)+':'+String(m).padStart(2,'0')+(h<12?' AM':' PM');
}
function hudLine(){
  if(!wxlEl) return; const W=AT.wx, known=FIX_WX!=null||AT.temp!=null;
  const t=(known?W.icon+' '+(AT.temp!=null?AT.temp+'°F · ':'')+W.text+' · ':(AT.k>.5?'🌙 ':'')) + clock();
  if(wxlEl.textContent!==t) wxlEl.textContent=t;
}
// colours
const mix=(a,b,t)=>{ const A=parseInt(a.slice(1),16), B=parseInt(b.slice(1),16), f=(s)=>Math.round(((A>>s)&255)+(((B>>s)&255)-((A>>s)&255))*t);
  return '#'+((1<<24)|(f(16)<<16)|(f(8)<<8)|f(0)).toString(16).slice(1); };
const clamp01=v=>v<0?0:v>1?1:v;
// lit-window pattern for buildings after dark (dark walls, some warm windows)
function windowImage(){
  addImg('enh-win',img(64,64,(x,w,h)=>{ x.fillStyle='#262c3a'; x.fillRect(0,0,w,h);
    for(let r=0;r<4;r++) for(let c=0;c<4;c++){ const on=hash(r*5+1,c*3+2)<.55;
      x.fillStyle=on?(hash(c,r+9)<.3?'#fff3c4':'#ffc95c'):'#394154'; x.fillRect(4+c*16,4+r*16,8,9); } }));
}
function setWindows(on){
  if(on===AT.windows) return; AT.windows=on;
  for(const id of blockIds) safe('windows',()=>{ if(!map.getLayer(id)) return;
    map.setPaintProperty(id,'fill-extrusion-pattern',on?'enh-win':undefined); });
}
// headlight beams on the ground ahead of the SUV / tractor
// Sized to the Explorer photo: lamps ~1.4 m apart, each beam spreading to ~1.1 m, so the pair lights a strip about
// as wide as the car (2.5 m) out to 18 m ahead. Plane is 4 m x 18 m on the ground; canvas is 32 px per metre across.
function makeBeams(){
  const C=(typeof CARSPEC!=='undefined'&&CARSPEC)||{lamp:.68,front:2.4};   // headlight spacing and bumper position of the chosen car
  const W=4, L=18, PX=128/W, LAMP=C.lamp, NEAR=.12, FAR=.55;      // metres: lamp offset from centre, beam half-width near / far
  const c=document.createElement('canvas'); c.width=128; c.height=256; const x=c.getContext('2d');
  for(const s of [-1,1]){ const cx=64+s*LAMP*PX, g=x.createLinearGradient(0,256,0,0);
    g.addColorStop(0,'rgba(255,244,200,.8)'); g.addColorStop(.5,'rgba(255,240,190,.32)'); g.addColorStop(1,'rgba(255,240,190,0)');
    x.fillStyle=g; x.beginPath(); x.moveTo(cx-NEAR*PX,256); x.lineTo(cx+NEAR*PX,256); x.lineTo(cx+FAR*PX,0); x.lineTo(cx-FAR*PX,0); x.closePath(); x.fill(); }
  const tex=new THREE.CanvasTexture(c);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(W,L),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,opacity:.9}));
  m.rotation.x=-Math.PI/2; m.position.set(0,.07,-(C.front+L/2)); m.visible=false; car.add(m); return m;   // starts at the front bumper
}
function applyAtmos(){
  const W=AT.wx, sp=sunPos(nowDate(),S.lat,S.lng), alt=sp.alt;
  const k=clamp01((6-alt)/14);                                    // 0 in daylight (sun >6 deg), 1 by nautical dusk (-8 deg)
  const gold=alt>-4&&alt<10?1-Math.abs(alt-3)/7:0;                 // warm light around sunrise and sunset
  const wet=W.type?W.int:0, cl=Math.max(AT.cloud,W.fog*.8,wet*.8);
  const key=[k.toFixed(2),gold.toFixed(2),cl.toFixed(2),W.fog.toFixed(2),W.code,POWER?1:0].join();
  AT.k=k; hudLine();
  if(key===AT.lastKey) return; AT.lastKey=key;
  // map darkness and colour
  const br=1-.47*k-.13*cl*(1-k), sat=1-.3*k-.3*cl, sep=.25*gold*(1-cl);
  if(POWER){ mapEl.style.filter='';                               // a plain overlay costs far less than filtering the map every frame
    if(tintEl){ const a=Math.min(.62,.5*k+.14*cl*(1-k)), g=.12*gold*(1-cl)*(1-k);
      tintEl.style.background=g>a?`rgba(255,150,70,${g.toFixed(3)})`:`rgba(10,16,38,${a.toFixed(3)})`; tintEl.style.opacity=(Math.max(a,g)>.01)?'1':'0'; } }
  else { if(tintEl) tintEl.style.opacity='0';
    mapEl.style.filter=(br>.99&&sat>.99&&sep<.01)?'':`brightness(${br.toFixed(3)}) saturate(${sat.toFixed(3)}) sepia(${sep.toFixed(3)})`; }
  // sky
  const grey='#b8c2cc';
  let sky=mix('#7ab8ea','#0b1a3a',k), hor=mix('#eaf3fb','#1e2d4f',k);
  if(gold>0){ hor=mix(hor,'#f6a35c',gold*.8*(1-cl)); sky=mix(sky,'#6d7fc4',gold*.3); }
  sky=mix(sky,mix(grey,'#141b2a',k),cl*.75); hor=mix(hor,mix('#dde3ea','#1c2433',k),cl*.75);
  safe('sky',()=>map.setSky({'sky-color':sky,'horizon-color':hor,'fog-color':hor,'sky-horizon-blend':.6,'horizon-fog-blend':.7+.3*W.fog,'fog-ground-blend':.4-.3*W.fog}));
  if(document.body) document.body.style.background=sky;
  // fog bank toward the horizon
  if(fogEl){ fogEl.style.opacity=String(Math.min(.8,W.fog+wet*.25)); fogEl.style.filter=k>.05?`brightness(${(1-.72*k).toFixed(2)})`:''; }
  // buildings lit from the real sun direction; moonlight-blue and dim at night
  safe('light',()=>map.setLight({anchor:'map',position:[1.15,sp.az,Math.max(12,Math.min(80,90-Math.max(alt,8)))],
    color:k>.5?'#a9b8ff':mix('#ffffff','#ffc58a',gold*.7),intensity:.45-.2*k}));
  setWindows(k>.6&&!POWER);                                         // textured buildings cost more to draw
  // the SUV: dimmer, cooler light on the model at night; headlights and brighter tail lights
  safe('carlight',()=>{
    const hemi=scene.children.find(o=>o&&o.isHemisphereLight); if(hemi) hemi.intensity=.85-.5*k-.2*cl*(1-k);
    sun.intensity=.9*(1-k)*(1-.5*cl)+.08;
    headM.color.setHex(k>.35?0xfffbe6:0xf4f8ff); tailOff.color.setHex(k>.35?0xc01820:0x8a1216);
    if(!AT.beams) AT.beams=makeBeams();
  });
  updateBeams(); dirty=true;
}
// a different car has its lamps elsewhere: rebuild the beams for it
const prevCar=window.onCarChange;
window.onCarChange=(k)=>{ if(prevCar) prevCar(k); safe('beams',()=>{ const b=AT.beams; if(b){ car.remove(b); b.geometry.dispose(); b.material.map.dispose(); b.material.dispose(); AT.beams=makeBeams(); updateBeams(); } }); };
function updateBeams(){ const b=AT.beams; if(!b) return; const on=AT.k>.35&&(mode==='car'||mode==='tractor');
  if(b.visible!==on){ b.visible=on; dirty=true; } }
onTick(10000,function atmosTick(){ applyAtmos(); });
onTick(300,updateBeams);

// rain, snow and lightning on their own canvas; the loop only runs while something is falling
const WX={parts:[],run:false,last:0,flash:0,nextBolt:0};
function startWx(){
  const W=AT.wx, want=!!W.type||W.thunder;
  if(!wxCv) return;
  if(!want){ WX.parts.length=0; if(WX.run){ WX.run=false; } const x=wxCv.getContext('2d'); x.clearRect(0,0,wxCv.width,wxCv.height); return; }
  const n=Math.round((W.type==='snow'?300:260)*W.int*(POWER?.45:1));
  WX.parts=[]; for(let i=0;i<n;i++) WX.parts.push(newPart(true));
  if(!WX.run){ WX.run=true; WX.last=performance.now(); requestAnimationFrame(wxFrame); }
}
function newPart(anyY){ const w=wxCv.width||innerWidth, h=wxCv.height||innerHeight, snow=AT.wx.type==='snow';
  return {x:Math.random()*w*1.2-w*.1,y:anyY?Math.random()*h:-20-Math.random()*60,v:snow?40+Math.random()*50:650+Math.random()*450,
    l:snow?0:14+Math.random()*16,r:snow?1.2+Math.random()*2:0,ph:Math.random()*6.3,a:.35+Math.random()*.4}; }
function wxFrame(now){
  if(!WX.run) return;
  const idle=Math.abs(S.v)<.3&&mode!=='glider';
  if(POWER&&now-WX.last<(idle?120:32)){ requestAnimationFrame(wxFrame); return; }
  const dt=Math.min(.05,(now-WX.last)/1000); WX.last=now;
  const W=AT.wx, x=wxCv.getContext('2d');
  if(wxCv.width!==innerWidth||wxCv.height!==innerHeight){ wxCv.width=innerWidth; wxCv.height=innerHeight; }
  const w=wxCv.width, h=wxCv.height, drift=(S.steer||0)*-120-40, night=AT.k;
  x.clearRect(0,0,w,h);
  if(W.type==='rain'){ x.strokeStyle=night>.5?'rgba(170,190,220,.55)':'rgba(215,225,240,.6)'; x.lineWidth=1.2; x.beginPath();
    for(const p of WX.parts){ p.y+=p.v*dt; p.x+=drift*dt; const s=p.l/p.v; x.moveTo(p.x,p.y); x.lineTo(p.x-drift*s,p.y-p.l);
      if(p.y>h+20) Object.assign(p,newPart(false)); }
    x.stroke(); }
  else if(W.type==='snow'){ x.fillStyle=night>.5?'rgba(210,220,240,.8)':'rgba(255,255,255,.9)'; x.beginPath();
    for(const p of WX.parts){ p.ph+=dt*1.7; p.y+=p.v*dt; p.x+=(Math.sin(p.ph)*30+drift*.4)*dt; x.moveTo(p.x+p.r,p.y); x.arc(p.x,p.y,p.r,0,6.3);
      if(p.y>h+10) Object.assign(p,newPart(false)); }
    x.fill(); }
  if(W.thunder){                                                  // a flash every 6-20 s, sometimes a double
    if(!WX.nextBolt) WX.nextBolt=now+4000+Math.random()*8000;
    if(now>WX.nextBolt){ WX.flash=.55+Math.random()*.3; WX.nextBolt=now+(Math.random()<.3?180:6000+Math.random()*14000); }
    if(WX.flash>0){ WX.flash=Math.max(0,WX.flash-dt*2.6); } flashEl.style.opacity=WX.flash.toFixed(2); }
  else if(flashEl.style.opacity!=='0') flashEl.style.opacity='0';
  requestAnimationFrame(wxFrame);
}
onReady(function atmosInit(){ windowImage(); applyAtmos(); startWx(); loadWeather(); });
// battery saver toggled: redo the look right away
window.onPowerChange=()=>{ AT.lastKey=''; safe('power',applyAtmos); safe('power',startWx); };
Object.assign(YD,{AT});
})();
