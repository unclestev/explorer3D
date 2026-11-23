/* Voice commands (owner 2026-11-22: "make that button recognize my voice if I press it" — the ≡ Options button on the
   G29; V on the keyboard; or tap 🎙). Press it, say what you want, and the car does it and answers out loud. Uses the
   browser's own speech recognition (Chrome / Edge; they send the audio to their speech service to turn it into text) and
   speech synthesis for the answers. It only listens after a press, for one sentence. It understands a fixed set of
   commands (see HELP below); anything else gets "Sorry, I can't do that yet". */
(()=>{
'use strict';
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
const css=document.createElement('style'); css.textContent=`
#voiceBar{position:absolute;left:50%;top:calc(var(--st) + 64px);transform:translateX(-50%);z-index:42;max-width:min(88vw,520px);display:none;align-items:center;gap:10px;
 background:var(--panel-solid);color:#fff;border:1px solid var(--line);border-radius:999px;padding:9px 16px;font:15px system-ui,Arial;box-shadow:0 6px 18px rgba(0,0,0,.4)}
#voiceBar.on{display:flex}
#voiceBar .mic{width:12px;height:12px;border-radius:50%;background:#ff3b30;flex:none;animation:vpulse 1s infinite}
#voiceBar.think .mic{background:#4f8ef7;animation:none}
@keyframes vpulse{50%{opacity:.35}}
#voiceBar .tx{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`;
document.head.appendChild(css);
const bar=document.createElement('div'); bar.id='voiceBar'; bar.innerHTML='<span class="mic"></span><span class="tx">Listening…</span>'; document.body.appendChild(bar);
const tx=bar.querySelector('.tx');
let hideT=0;
function showBar(t,think){ clearTimeout(hideT); tx.textContent=t; bar.classList.add('on'); bar.classList.toggle('think',!!think); }
function hideBar(ms){ clearTimeout(hideT); hideT=setTimeout(()=>bar.classList.remove('on'),ms||0); }

// ---------- talking back
let voice=null;
function pickVoice(){ const vs=speechSynthesis.getVoices(); voice=vs.find(v=>/en[-_]US/i.test(v.lang)&&/Google|Natural|Aria|Jenny|Guy/i.test(v.name))||vs.find(v=>/^en/i.test(v.lang))||null; }
if(window.speechSynthesis){ pickVoice(); speechSynthesis.onvoiceschanged=pickVoice; }
// the music, video and engine go quiet while you talk and while the car answers, then come back up
let ducked=false, unduckT=0;
function duck(on){ clearTimeout(unduckT); if(on===ducked) return; ducked=on;
  for(const f of [()=>window.MUSIC&&MUSIC.duck&&MUSIC.duck(on),()=>window.TUBE&&TUBE.duck&&TUBE.duck(on),()=>window.SOUND&&SOUND.duck&&SOUND.duck(on)]) try{ f(); }catch(e){} }
function unduck(ms){ clearTimeout(unduckT); unduckT=setTimeout(()=>duck(false),ms||0); }
function say(t){ showBar(t,true); hideBar(Math.max(2500,t.length*70)); if(typeof toast==='function'&&!window.speechSynthesis) toast(t,2500);
  unduck(Math.max(3000,t.length*95));                                   // in case the speech never reports that it ended
  try{ speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(t); if(voice) u.voice=voice; u.lang='en-US'; u.rate=1.02;
    u.onend=u.onerror=()=>unduck(300); speechSynthesis.speak(u); }catch(e){ unduck(800); } }

// ---------- what it understands
const has=(t,...w)=>w.some(x=>t.includes(x));
// spoken numbers to digits, so a station sounds the same however it's said: "ninety three point nine", "93 point 9" -> "93.9"
const ONES={zero:0,oh:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19};
const TENS={twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
function nums(t){
  t=t.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]+(one|two|three|four|five|six|seven|eight|nine)\b/g,(m,a,b)=>String(TENS[a]+ONES[b]))
     .replace(/\b(one|two|three|four|five|six|seven|eight|nine)\s+hundred(?:\s+and)?\s+(\d+)\b/g,(m,a,b)=>String(ONES[a]*100+ +b))
     .replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/g,m=>String(ONES[m]??TENS[m]));
  return t.replace(/(\d+)\s*(?:point|dot)\s*(\d)/g,'$1.$2'); }
const FREQ=/\b(\d{2,3}\.\d|\d{2,4})\s*(fm|am)?\b/;
const mph=()=>Math.round(Math.abs((typeof S!=='undefined'&&S.v)||0)*2.237);
const $=id=>document.getElementById(id);
const click=id=>{ const b=$(id); if(b){ b.click(); return true; } return false; };
const txt=id=>{ const e=$(id); return e?e.textContent.trim():''; };
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(f,ms){ const t0=Date.now(); while(Date.now()-t0<ms){ const v=f(); if(v) return v; await wait(150); } return null; }
const OFF=/^no\b|\b(off|disable|hide|deactivate|no more|turn off|switch off|shut off|kill)\b/;
const driving=()=>typeof mode!=='undefined'&&(mode==='car'||mode==='tractor');
const HELP='You can ask me to: start or turn off the car, hazards, left or right signal, wipers, the sunroof or its cover, the screen, '+
  'play a song, play 93.9 or any radio station, next, volume up or down, stop the music, play a video on YouTube, '+
  'navigate to a place, drive me to a place on autopilot, cancel the route, how far is it, '+
  'cockpit or outside view, look left, right, up or back, switch to the Expedition or another car, traffic on or off, '+
  'satellite view, head-up display, sound on or off, make the car bigger, zoom in, hang glider, get out and walk, a random place, '+
  'or ask what\'s my speed, the speed limit, where am I, the weather and the time.';
// settings switches: [what you say, button, name]
const SW=[[/\breal speed\b/,'rsBtn','Real speed in the cockpit'],[/\brealistic\b|\breal driving\b/,'realBtn','Realistic driving'],[/\btraffic\b/,'trafficBtn','Traffic'],
  [/\b(hud|heads? ?up( display)?)\b/,'hudBtn','The head-up display'],[/\b(info|information|location|speed) panel\b/,'infoBtn','The location panel'],
  [/\bpop ?-?ups?\b/,'popBtn','Pop-ups'],[/\basphalt\b/,'asphaltBtn','Asphalt roads'],[/\bsatellite\b/,'satBtn','Satellite view'],
  [/\b(trail|purple line)\b/,'trailBtn','The trail'],[/^(un)?mute\b|\b(game |engine )?(sound|sounds|audio)\b(?!.*start)/,'audioBtn','Sound']];
const CARN=[[/^javelin ?3 ?d ?(v(ersion)? ?)?2$/,'javelin3d2','the Javelin 3D v2'],[/^javelin ?3 ?d$/,'javelin3d','the Javelin 3D'],[/^(amc )?javelin$/,'javelin','the Javelin'],
  [/^(lincoln )?navigator$|^lincoln$/,'navigator','the Navigator'],[/^(tesla )?model ?y$|^tesla$/,'modely','the Model Y'],[/^(ford )?expedition$/,'expedition','the Expedition'],
  [/^(ford )?explorer( st)?$|^st$/,'explorer','the Explorer'],[/^tractor$/,'tractor','the tractor'],[/^(speed ?)?boat$/,'boat','the boat']];
function carName(q){ for(const [re,k,n] of CARN) if(re.test(q)) return [k,n]; return null; }
async function radio(q){ showBar('Finding '+q+'…',true); const n=await MUSIC.playRadio(q); return say(n?'Playing '+n+'.':'I couldn\'t find '+q+' on the radio.'); }
function setVol(v){ const e=$('musicVol'); if(!e) return null; v=Math.max(0,Math.min(1,v)); e.value=v; e.dispatchEvent(new Event('input')); return Math.round(v*100); }
async function youtube(q){ if(!window.TUBE) return say('Videos aren\'t available here.'); const MU=window.MUSIC;
  if(MU&&MU.open) MU.open(false); click('tabVideo');
  let key=''; try{ key=localStorage.getItem('ydTubeKey')||''; }catch(e){}
  if(!key) return say('To find videos by name I need a YouTube key. Add it in the video tab with the key button, or paste a link there.');
  $('tubeQ').value=q; showBar('Looking for '+q+'…',true); $('tubeResults').textContent=''; $('tubeForm').requestSubmit();
  const el=await until(()=>document.querySelector('#tubeResults .it'),8000);
  if(!el){ const m=txt('tubeResults'); return say(m&&!/Searching/.test(m)?m:'I couldn\'t find a video of '+q+'.'); }
  const n=(el.querySelector('img+div>div')||el).textContent.trim(); el.click();
  return say('Playing '+n+'.'+(mph()>3?' It starts when you stop the car.':'')); }
async function route(q,auto){ const P=window.YD&&YD.PLACES; if(!P||!P.navigate) return say('I can\'t find places here.'); showBar('Looking for '+q+'…',true);
  const was=YD.NAV&&YD.NAV.pts; const n=await P.navigate(q); if(!n) return say('I couldn\'t find '+q+'.');
  if(!auto) return say('Heading to '+n+'.');
  if(!driving()) return say('Heading to '+n+'. Autopilot only drives the cars and the tractor.');
  const ok=await until(()=>YD.NAV.pts&&YD.NAV.pts!==was,9000); if(!ok) return say('Heading to '+n+', but the route isn\'t ready yet. Say autopilot on in a moment.');
  if(!(window.AUTO&&AUTO.on)) click('navAuto'); return say('Driving you to '+n+' on autopilot. Touch the controls to take over.'); }
async function handle(raw){
  let t=raw.toLowerCase().replace(/^(hey|ok|okay)\s+(expedition|explorer|car|ford)[, ]*/,'').replace(/[.!?]+$/,'').replace(/^please\s+|\s+please$/g,'').replace(/’/g,"'").trim();
  t=nums(t);
  const CK=window.COCKPIT, IG=window.IGN, SG=window.SIG, MU=window.MUSIC;
  if(!t) return say('I didn\'t catch that.');
  let m;
  if(has(t,'what can you do','help','what can i say','what do you do')) return say(HELP);
  if(/^tell me a joke|^(say|tell me) something funny/.test(t)) return say(['Why did the car get a flat tire? There was a fork in the road.','What do you call a sleeping car? A dozer.','Why do cars never get tired? They always have a spare.','What kind of car does an egg drive? A yolks-wagen.'][Math.floor(Math.random()*4)]);
  if((m=t.match(/^(?:say|repeat after me)\s+(.+)$/))) return say(m[1].replace(/^["']|["']$/g,''));
  if(has(t,'thank')) return say('You\'re welcome!');

  // ---- YouTube
  if(/^(stop|close|turn off|end|exit|quit)( the)? (video|youtube)/.test(t)){ if(window.TUBE) TUBE.stop(); return say('Video stopped.'); }
  if(/^(play|watch|resume|put on)( my| the)? (last|recent|previous) video|^resume( the)? video/.test(t)){ if(MU&&MU.open) MU.open(false); click('tabVideo');
    const el=document.querySelector('#tubeRecent .it'); if(!el) return say('You haven\'t watched anything yet.'); el.click(); return say('Playing your last video.'); }
  if((m=t.match(/^(?:play|watch|put on|find|search for|search|show me|pull up)\s+(.+?)\s+(?:on|from|in) youtube$/))||(m=t.match(/^(?:youtube|watch)\s+(?:a video (?:of|about)\s+)?(.+)$/))||(m=t.match(/^(?:play|show me|put on|find)\s+(?:a\s+|the\s+)?(?:youtube\s+)?video\s+(?:of|about|called|for)?\s*(.+)$/)))
    return youtube(m[1]);
  if(/^(open|show)( the)? (youtube|video( tab| app)?|videos)$/.test(t)){ if(MU&&MU.open) MU.open(false); click('tabVideo'); return say('Here are your videos.'); }

  // ---- music and radio
  if(/^(stop|pause|turn off|shut off|switch off|kill)( the)? (music|song|radio|audio|station|track)|^(stop|pause)( it)?$|^(shut up|quiet|silence)$/.test(t)){ if(MU&&MU.stop) MU.stop(); return say('Music stopped.'); }
  if(/^(resume|unpause|keep playing|continue)( the)?( music| song| radio)?$/.test(t)){ if(MU&&MU.resume) MU.resume(); return say('Playing.'); }
  if(/^(next|skip)( song| station| track| one| it)?$|^(play |go to )?(the )?next (song|station|track|one)$|^skip (this|the) (song|track|station)$/.test(t)){
    if(!MU||!MU.now) return say('Nothing is playing.'); click('musicNext'); await wait(600); const n=MU.info&&MU.info(); return say(n&&n.title?'Playing '+n.title+'.':'Next.'); }
  if((m=t.match(/\bvolume\b.*?(\d{1,3})(?:\s*(?:%|percent))?$|^(?:set|turn) (?:the )?(?:music|radio) (?:to )?(\d{1,3})(?:\s*(?:%|percent))?$/))){ const n=+(m[1]||m[2]); const v=setVol(n<=10?n/10:n/100); return say(v==null?'I can\'t change the volume here.':'Volume '+v+' percent.'); }
  if(/\b(louder|volume up|turn (it|the (music|radio|volume)) up|turn up( the)? (music|radio|volume)|crank it|increase( the)? volume|raise( the)? volume)\b/.test(t)){ const e=$('musicVol'); const v=setVol(+(e&&e.value||.7)+(has(t,'a lot','way','crank')?.3:.15)); return say(v==null?'I can\'t change the volume here.':'Volume '+v+' percent.'); }
  if(/\b(quieter|softer|volume down|turn (it|the (music|radio|volume)) down|turn down( the)? (music|radio|volume)|lower( the)? volume|decrease( the)? volume)\b/.test(t)){ const e=$('musicVol'); const v=setVol(+(e&&e.value||.7)-(has(t,'a lot','way')?.3:.15)); return say(v==null?'I can\'t change the volume here.':'Volume '+v+' percent.'); }
  if(/^mute( the)? (music|radio|song)$/.test(t)){ setVol(0); return say('Music muted.'); }
  if(/^(open|show)( the)? (music|radio|songs?)( app| tab)?$/.test(t)){ if(MU&&MU.open) MU.open(false); if(has(t,'radio')) click('tabRadio'); else click('tabSongs'); return say('Here\'s the music.'); }
  if(/^(close|hide)( the)? (music|radio|songs?|video)( app| tab)?$/.test(t)){ if(MU&&MU.close) MU.close(); return say('Closed.'); }
  if(/^(turn on|play|put on|start|switch on)( the)? radio$|^play my (favou?rite|preset|saved)( radio)?( station)?$/.test(t)){ if(!MU) return say('There\'s no radio here.');
    const P=MU.presets?MU.presets():[]; if(!P.length){ MU.open(false); click('tabRadio'); return say('Say play and a station name, like play 93.9.'); } MU.playStation(P[0]); return say('Playing '+P[0].title+'.'); }
  m=t.match(/^(?:play|put on|listen to|tune to|tune in to)\s+(?:the\s+)?(?:radio\s+(?:station\s+)?(.+)|(.+?)\s+(?:on the radio|radio station|radio))$/);
  if(m&&MU&&MU.playRadio) return radio(m[1]||m[2]);
  m=t.match(/^(?:play|put on|listen to|tune to|tune in to|turn on|switch to|go to|change to|change the station to)\s+(?:station\s+)?(.+)$/);
  if(m&&MU&&MU.playRadio&&(/^\d{2,3}\.\d\b/.test(m[1])||/\b(fm|am)\b/.test(m[1]))) return radio(m[1]);

  // ---- pick a car
  if((m=t.match(/^(?:switch|change|swap)(?: cars?)?(?: (?:to|into|for))?\s+(?:the\s+|a\s+|my\s+)?(.+?)(?:\s+(?:car|truck|suv|instead))?$/))||(m=t.match(/^(?:use|drive|take|get in|get into|pick|choose|select|i want|give me|let me drive|spawn)\s+(?:the\s+|a\s+|my\s+)?(.+?)(?:\s+(?:car|truck|suv|instead))?$/))){
    const c=carName(m[1]); if(c){ const b=document.querySelector('#carPick [data-car="'+c[0]+'"]'); if(!b) return say('I can\'t change cars here.');
      if(b.classList.contains('on')) return say('You\'re already in '+c[1]+'.'); b.click(); return say('Here\'s '+c[1]+'.'); } }
  if(has(t,'what car','which car','what am i driving','what vehicle')){ const b=document.querySelector('#carPick .on'); return say(b?'You\'re in the '+b.textContent.replace(/[^\w\s]/g,'').trim()+'.':'I\'m not sure.'); }

  // ---- views and looking around
  if(/\b(cockpit|inside view|driver'?s? (view|seat)|first person|behind the wheel)\b|^(go )?inside$/.test(t)){ if(CK&&!CK.want&&CK.toggle) CK.toggle(); return say('Cockpit view.'); }
  if(/\b(outside view|outside|chase( view| cam(era)?)?|third person|behind the car)\b/.test(t)&&!/\b(get|weather|like|temperature|cold|hot|warm|raining|snowing)\b/.test(t)){ if(CK&&CK.want&&CK.toggle) CK.toggle(); return say('Outside view.'); }
  if((m=t.match(/^look\s+(?:to the\s+|over\s+)?(left|right|up|down|back|behind|backwards|forward|ahead|straight|out the back)/))){ const L=window.LOOKAROUND; if(!L||!L.ease) return say('I can\'t move the view here.');
    const d=m[1]; if(/forward|ahead|straight/.test(d)){ L.reset(); return say('Looking ahead.'); }
    const st=L.state||{yaw:0,pitch:0}; const Y={left:-75,right:75,back:179,behind:179,backwards:179,'out the back':179}[d], P={up:CK&&CK.on?45:12,down:-30}[d];
    L.ease(Y!=null?Y:st.yaw,P!=null?P:(Y!=null?0:st.pitch)); return say('Looking '+(Y===179?'back':d)+'.'); }
  if(/\bzoom in\b/.test(t)&&!has(t,'car')){ click('zi'); click('zi'); return say('Zooming in.'); }
  if(/\bzoom out\b/.test(t)&&!has(t,'car')){ click('zo'); click('zo'); return say('Zooming out.'); }
  if(/\b(wider|widen)\b/.test(t)){ click('fovP'); click('fovP'); return say('Wider view.'); }
  if(/\b(narrower|narrow)\b/.test(t)){ click('fovM'); click('fovM'); return say('Narrower view.'); }
  if(/\b(bigger|larger|grow)\b/.test(t)){ const n=has(t,'a lot','way','much')?4:2; for(let k=0;k<n;k++) click('cp'); return say('Car size '+txt('carSize')+'.'); }
  if(/\b(smaller|shrink|tinier)\b/.test(t)){ const n=has(t,'a lot','way','much')?4:2; for(let k=0;k<n;k++) click('cm'); return say('Car size '+txt('carSize')+'.'); }
  if((m=t.match(/\b(white|black)\b.*\bseats?\b|\bseats?\b.*\b(white|black)\b/))){ const c=m[1]||m[2], b=document.querySelector('#seatPick [data-s="'+c+'"]'); if(!b) return say('I can\'t change the seats here.'); b.click(); return say(c[0].toUpperCase()+c.slice(1)+' seats. That\'s for the Model Y.'); }
  if(/\b(terrain|hills)\b/.test(t)){ const k=OFF.test(t)?'off':has(t,'chase','outside')?'chase':'all', b=document.querySelector('#terrPick [data-t="'+k+'"]'); if(b) b.click(); return say(k==='off'?'3D terrain off.':k==='chase'?'3D terrain in the outside view only.':'3D terrain on.'); }

  // ---- settings switches
  for(const [re,id,name] of SW) if(re.test(t)){ const b=$(id); if(!b) return say('I can\'t change that here.');
    const on=b.classList.contains('on'), want=/^mute\b/.test(t)?false:/^unmute\b/.test(t)?true:has(t,'toggle')?!on:!OFF.test(t);
    if(on===want) return say(name+' is already '+(want?'on':'off')+'.'); b.click(); return say(name.replace(/^The /,'').replace(/^./,c=>c.toUpperCase())+' '+(want?'on':'off')+'.'); }
  if(/^(open|show)( the| my)? settings$|^settings$/.test(t)){ click('gear'); return say('Settings.'); }
  if(/^(close|hide)( the)? settings$/.test(t)){ click('setX'); return say('Closed.'); }
  if(/\b(challenges?|progress|achievements|my stats)\b/.test(t)&&!/\b(stop|end|quit)\b/.test(t)){ click('prog'); return say('Here\'s your progress.'); }
  if(/^(stop|end|quit|cancel)( the)? challenge/.test(t)){ if(!click('chalX')) return say('There\'s no challenge going.'); return say('Challenge stopped.'); }

  // ---- engine
  if(/^(start|turn on|switch on|fire up|power on)( up)?\s+(the\s+|my\s+)?(car|engine|truck|suv|vehicle|it|tractor)( up)?$|^start( it)?( up)?$|^(start|crank) (the )?engine$/.test(t)){ if(!IG) return say('I can\'t do that here.');
    if(IG.state==='on'||IG.state==='crank') return say('The engine is already running.'); IG.button(); return say('Starting the engine.'); }
  if(/^(turn off|switch off|stop|shut off|shut down|kill|power off)\s+(the\s+|my\s+)?(car|engine|truck|suv|vehicle|tractor)$|^(turn|shut|switch) (the )?(car|engine|truck) off$|^(park|i'm done driving)$/.test(t)){ if(!IG) return say('I can\'t do that here.');
    if(!(IG.state==='on'||IG.state==='crank')) return say('The engine is already off.'); if(mph()>5) return say('Slow down first, then I\'ll switch the engine off.'); IG.button(); return say('Engine off.'); }

  // ---- hazards and signals
  if(has(t,'hazard','flashers','emergency light','four ways','4 ways')){ if(!SG) return say('I can\'t do that here.'); const off=OFF.test(t)||has(t,'stop','cancel');
    if(off===!SG.haz) return say(off?'The hazards are already off.':'The hazards are already on.'); SG.hazard(); return say(off?'Hazards off.':'Hazards on.'); }
  if(has(t,'signal','blinker','indicator','turning light')){ if(!SG) return say('I can\'t do that here.');
    if(OFF.test(t)||has(t,'cancel','stop')){ SG.cancel(); return say('Signal off.'); }
    if(has(t,'left')){ if(SG.dir!==-1) SG.press(-1); return say('Left signal on.'); } if(has(t,'right')){ if(SG.dir!==1) SG.press(1); return say('Right signal on.'); }
    return say('Left or right?'); }

  // ---- sunroof (the cover is separate, like the keys)
  if(/\b(sunroof|moonroof|roof)\b.*\b(cover|shade|blind|curtain)\b|\b(cover|shade|blind|curtain)\b.*\broof\b|^(open|close)( the)? (shade|sunshade)$/.test(t)){ if(!CK||!CK.roofState) return say('This car doesn\'t have a sunroof.');
    const R=CK.roofState(), shut=has(t,'close','shut');
    if(shut){ if(R.slide||R.vent) return say('Close the sunroof first, then the cover.'); if(!R.cover) return say('The cover is already closed.'); CK.roof('shut'); return say('Closing the sunroof cover.'); }
    if(R.cover) return say('The cover is already open.'); CK.roof('open'); return say('Opening the sunroof cover.'); }
  if(has(t,'sunroof','moonroof','roof')&&!has(t,'rack')){ if(!CK||!CK.roofState) return say('This car doesn\'t have a sunroof.'); const R=CK.roofState(), open=!!(R.slide||R.vent);
    if(has(t,'close','shut')){ if(!open) return say('The sunroof is already closed.'); CK.roof('vent'); return say('Closing the sunroof.'); }
    if(open) return say('The sunroof is already open.'); CK.roof('vent'); return say('Opening the sunroof.'); }
  // wipers
  if(has(t,'wiper')){ if(!CK) return say('I can\'t do that here.'); const off=OFF.test(t)||has(t,'stop'); if(!!CK.wipe===!off) return say(off?'The wipers are already off.':'The wipers are already on.'); CK.wipe=!off; return say(off?'Wipers off.':'Wipers on.'); }
  // screen
  if(/\b(screen|display|touchscreen)\b/.test(t)&&CK&&CK.powerKey){ const on=CK.screenOn&&CK.screenOn(), want=!OFF.test(t); if(on===want) return say(want?'The screen is already on.':'The screen is already off.'); CK.powerKey(); return say(want?'Screen on.':'Screen off.'); }

  if(/\b(random (place|spot|location|city)|somewhere (random|new|else)|surprise me|teleport)\b/.test(t)){ if(!click('randomBtn')) return say('I can\'t do that here.'); return say('Going somewhere random!'); }
  // ---- autopilot and navigation
  if(/\b(autopilot|auto pilot|self[- ]?driving|self[- ]?drive|auto ?drive|drive (for me|itself|by itself))\b/.test(t)&&!/\bto\s+\S/.test(t.replace(/\b(turn|switch)\s+(on|off)\b/,''))){ const A=window.AUTO;
    if(!A) return say('There\'s no autopilot here.');
    if(OFF.test(t)||has(t,'stop','cancel','take over',"i'll drive")){ if(!A.on) return say('Autopilot is already off.'); A.takeover(); return say('Autopilot off. You have control.'); }
    if(A.on) return say('Autopilot is already on.'); if(!driving()) return say('Autopilot only drives the cars and the tractor.');
    if(!(YD.NAV&&YD.NAV.pts)) return say('Tell me where to go first. Say drive me to, and a place.'); click('navAuto'); return say('Autopilot on. Touch the controls to take over.'); }
  if(/^(i'll drive|let me drive|i got it|take over|i have control)$/.test(t)){ if(window.AUTO&&AUTO.on){ AUTO.takeover(); return say('You have control.'); } return say('You\'re already driving.'); }
  if((m=t.match(/^(?:drive me|take me|autopilot|auto pilot|self[- ]?drive|auto ?drive|drive)\s+(?:me\s+)?to\s+(?:the\s+)?(.+?)(?:\s+on autopilot)?$/))&&(/^(drive|autopilot|auto|self)/.test(t)||/on autopilot$/.test(t))) return route(m[1],true);
  if((m=t.match(/^(?:navigate|directions|take me|go|get directions|head|route me|find|search for|show me the way|how do i get|bring me|let's go)\s+(?:to\s+)?(?:the\s+)?(.+?)(?:\s+on autopilot)?$/))&&!/^(back|home screen|settings)$/.test(m[1])) return route(m[1],/on autopilot$/.test(t));
  if(/^(cancel|stop|end|clear|exit|quit|remove)( the)? (route|navigation|directions|trip|destination|nav|gps)|^stop navigating$/.test(t)){ if(!(YD.NAV&&YD.NAV.dest)) return say('There\'s no route.'); click('navX'); return say('Route cleared.'); }
  if(/\b(how (far|long|much (further|farther|longer))|eta|when (will|do|are|'ll) (we|i)|are we there|arrive|distance)\b/.test(t)){ if(!(YD.NAV&&YD.NAV.pts)) return say('There\'s no route right now.');
    const d=txt('navDist'), e=txt('navEta').replace(/^ETA\s*/,''); return say((e?'You\'ll get there at '+e.replace(' · ',', in about ')+'.':'You\'re on your way.')+(d?' Next turn in '+d+'.':'')); }

  // ---- hang glider, walking, teleport
  if(/\b(hang ?glid(er|e|ing)|glider|take off|go flying|fly|let's fly)\b/.test(t)&&!OFF.test(t.replace('take off',''))){ if(typeof mode!=='undefined'&&mode==='glider') return say('You\'re already flying.'); click('glide'); return say('Taking off!'); }
  if(/^(land|land the glider|come down|stop flying)$|\bland\b.*\bglider\b/.test(t)){ if(typeof mode!=='undefined'&&mode!=='glider') return say('You\'re not flying.'); click('glide'); return say('Landing.'); }
  if(/\b(get out|go for a walk|walk|on foot|exit the car|step out)\b/.test(t)){ if(typeof mode!=='undefined'&&mode==='walk') return say('You\'re already walking.'); if(!driving()) return say('Get in a car first.'); click('walkBtn'); return say('Out you get.'); }
  if(/\b(get (back )?in|back in the car|get in the car)\b/.test(t)){ if(typeof mode!=='undefined'&&mode!=='walk') return say('You\'re already in.'); click('walkBtn'); return say('Back in the car.'); }

  // ---- songs (anything else after "play")
  m=t.match(/^(?:play|put on|listen to)\s+(?:the song\s+|some\s+|me\s+)?(.+)$/);
  if(m&&MU&&MU.playSong){ const q=m[1]; showBar('Finding '+q+'…',true); const n=await MU.playSong(q); return say(n?'Playing '+n+'.':'I couldn\'t find '+q+'.'); }

  // ---- questions
  if(has(t,'speed limit','limit')){ const l=(document.querySelector('#lim b')||{}).textContent||''; return say(/\d/.test(l)?'The speed limit is '+l+'.':'I don\'t know the speed limit here.'); }
  if(has(t,'speed','how fast')) return say('You\'re going '+mph()+' miles per hour.');
  if(has(t,'where am i','where are we','what road','what street','what town','what city','my location')){ const r=txt('road'), p=txt('place'); return say(([r,p].filter(x=>x&&!/Locating/.test(x)).join(', ')||'I\'m not sure yet')+'.'); }
  if(has(t,'weather','temperature','how hot','how cold','raining','snowing','outside like')){ const w=txt('wxl').replace(/[^\x20-\x7E°·]/g,'').split('·').map(x=>x.trim()).filter(x=>x&&!/\d:\d\d/.test(x)).map(x=>x.replace(/°F/,' degrees'));
    return say(w.length?'It\'s '+w.join(' and ').toLowerCase()+' outside.':'I don\'t have the weather yet.'); }
  if(has(t,'time is it','the time','what time')) return say('It\'s '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+'.');
  if(has(t,'what day','the date','today\'s date','what is today')) return say('It\'s '+new Date().toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'})+'.');
  if(has(t,'hello','hi ','hey')&&t.split(' ').length<4||/^(hi|hey|hello|yo)$/.test(t)) return say('Hi! What can I do for you?');
  if(has(t,'who are you','your name')) return say('I\'m your car. Ask me anything about driving, music or the map.');
  return say('Sorry, I can\'t do that yet. Say "help" to hear what I can do.');
}

// ---------- listening (one sentence per press)
let rec=null, busy=false;
function listen(){
  if(!SR){ say('Voice commands need Chrome or Edge.'); return; }
  if(busy){ try{ rec&&rec.stop(); }catch(e){} return; }                     // pressed again: stop listening
  try{ speechSynthesis.cancel(); }catch(e){}
  rec=new SR(); rec.lang='en-US'; rec.interimResults=true; rec.maxAlternatives=1; rec.continuous=false;
  let final='', heard='';
  rec.onstart=()=>{ busy=true; showBar('Listening…'); duck(true); };
  rec.onresult=e=>{ heard=''; for(let i=e.resultIndex;i<e.results.length;i++){ const r=e.results[i]; if(r.isFinal) final+=r[0].transcript; else heard+=r[0].transcript; }
    showBar('“'+(final+heard).trim()+'”'); };
  rec.onerror=e=>{ busy=false; unduck(600); if(e.error==='not-allowed'||e.error==='service-not-allowed') say('Please allow the microphone for this page, then try again.');
    else if(e.error==='no-speech') { showBar('I didn\'t hear anything.',true); hideBar(1800); }
    else if(e.error!=='aborted') { showBar('Voice isn\'t working right now ('+e.error+').',true); hideBar(2500); } };
  rec.onend=()=>{ busy=false; const t=(final||heard).trim(); if(t){ duck(true); handle(t); } else { unduck(400); } if(!t&&bar.classList.contains('on')&&!bar.classList.contains('think')) hideBar(300); };
  try{ rec.start(); }catch(e){ busy=false; }
}
addEventListener('keydown',e=>{ if(e.repeat||(e.target&&/INPUT|TEXTAREA/.test(e.target.tagName))) return; if(e.key.toLowerCase()==='v') listen(); });
window.VOICE={listen,handle,say};
})();
