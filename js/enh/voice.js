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
function say(t){ showBar(t,true); hideBar(Math.max(2500,t.length*70)); if(typeof toast==='function'&&!window.speechSynthesis) toast(t,2500);
  try{ speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(t); if(voice) u.voice=voice; u.lang='en-US'; u.rate=1.02; speechSynthesis.speak(u); }catch(e){} }

// ---------- what it understands
const has=(t,...w)=>w.some(x=>t.includes(x));
const mph=()=>Math.round(Math.abs((typeof S!=='undefined'&&S.v)||0)*2.237);
const HELP='You can say: start the car, turn off the car, hazards on, left signal, open the sunroof, wipers on, play a song name, play a radio station, stop the music, navigate to a place, what\'s my speed, what time is it, or cockpit view.';
async function handle(raw){
  let t=raw.toLowerCase().replace(/^(hey|ok|okay)\s+(expedition|explorer|car|ford)[, ]*/,'').replace(/[.!?]+$/,'').trim();
  const CK=window.COCKPIT, IG=window.IGN, SG=window.SIG, MU=window.MUSIC;
  if(!t) return say('I didn\'t catch that.');
  if(has(t,'what can you do','help','what can i say')) return say(HELP);
  // engine
  if(/\b(start|turn on|switch on)\b.*\b(car|engine|truck|it)\b|^start$/.test(t)){ if(!IG) return say('I can\'t do that here.');
    if(IG.state==='on'||IG.state==='crank') return say('The engine is already running.'); IG.button(); return say('Starting the engine.'); }
  if(/\b(turn off|switch off|stop|shut off|shut down)\b.*\b(car|engine|truck)\b/.test(t)){ if(!IG) return say('I can\'t do that here.');
    if(!(IG.state==='on'||IG.state==='crank')) return say('The engine is already off.'); if(mph()>5) return say('Slow down first, then I\'ll switch the engine off.'); IG.button(); return say('Engine off.'); }
  // hazards and signals
  if(has(t,'hazard','flashers','emergency light')){ if(!SG) return say('I can\'t do that here.'); const off=has(t,' off','stop','cancel','turn off');
    if(off===!SG.haz) return say(off?'The hazards are already off.':'The hazards are already on.'); SG.hazard(); return say(off?'Hazards off.':'Hazards on.'); }
  if(has(t,'signal','blinker','indicator')){ if(!SG) return say('I can\'t do that here.');
    if(has(t,' off','cancel','stop')){ SG.cancel(); return say('Signal off.'); }
    if(has(t,'left')){ if(SG.dir!==-1) SG.press(-1); return say('Left signal on.'); } if(has(t,'right')){ if(SG.dir!==1) SG.press(1); return say('Right signal on.'); } }
  // sunroof
  if(has(t,'sunroof','moonroof','roof')){ if(!CK||!CK.roofState) return say('This car doesn\'t have a sunroof.'); const R=CK.roofState(), open=!!(R.slide||R.vent);
    if(has(t,'close','shut')){ if(!open) return say('The sunroof is already closed.'); CK.roof('vent'); return say('Closing the sunroof.'); }
    if(has(t,'open')){ if(open) return say('The sunroof is already open.'); CK.roof('vent'); return say('Opening the sunroof.'); } }
  // wipers
  if(has(t,'wiper')){ if(!CK) return say('I can\'t do that here.'); const off=has(t,' off','stop'); CK.wipe=!off; return say(off?'Wipers off.':'Wipers on.'); }
  // screen
  if(has(t,'screen')&&CK&&CK.powerKey){ const on=CK.screenOn&&CK.screenOn(), want=!has(t,' off'); if(on===want) return say(want?'The screen is already on.':'The screen is already off.'); CK.powerKey(); return say(want?'Screen on.':'Screen off.'); }
  // views
  if(has(t,'cockpit','inside view','driver view','inside')){ if(CK&&!CK.want&&CK.toggle) CK.toggle(); return say('Cockpit view.'); }
  if(has(t,'outside view','chase view','outside','behind the car')){ if(CK&&CK.want&&CK.toggle) CK.toggle(); return say('Outside view.'); }
  // music
  if(/^(stop|pause)( the)? (music|song|radio)|^(stop|pause)$/.test(t)){ if(MU&&MU.stop) MU.stop(); return say('Music stopped.'); }
  if(/^(resume|unpause|keep playing)/.test(t)){ if(MU&&MU.resume) MU.resume(); return say('Playing.'); }
  let m=t.match(/^(?:play|put on|listen to)\s+(?:the\s+)?(?:radio\s+(?:station\s+)?(.+)|(.+?)\s+(?:on the radio|radio station|radio))$/);
  if(m&&MU&&MU.playRadio){ const q=m[1]||m[2]; showBar('Finding '+q+'…',true); const n=await MU.playRadio(q); return say(n?'Playing '+n+'.':'I couldn\'t find a station called '+q+'.'); }
  m=t.match(/^(?:play|put on|listen to)\s+(?:the song\s+|some\s+)?(.+)$/);
  if(m&&MU&&MU.playSong){ const q=m[1]; showBar('Finding '+q+'…',true); const n=await MU.playSong(q); return say(n?'Playing '+n+'.':'I couldn\'t find '+q+'.'); }
  // navigation
  m=t.match(/^(?:navigate|directions|take me|drive me|go|get directions|head|route me)\s+(?:to\s+)?(?:the\s+)?(.+)$/);
  if(m){ const P=window.YD&&YD.PLACES; if(!P||!P.navigate) return say('I can\'t find places here.'); showBar('Looking for '+m[1]+'…',true);
    const n=await P.navigate(m[1]); return say(n?'Heading to '+n+'.':'I couldn\'t find '+m[1]+'.'); }
  // questions
  if(has(t,'speed','how fast')) return say('You\'re going '+mph()+' miles per hour.');
  if(has(t,'time is it','the time')) return say('It\'s '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+'.');
  if(has(t,'hello','hi ','hey')&&t.split(' ').length<4) return say('Hi! What can I do for you?');
  if(has(t,'thank')) return say('You\'re welcome!');
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
  rec.onstart=()=>{ busy=true; showBar('Listening…'); if(window.MUSIC&&MUSIC.duck) MUSIC.duck(true); };
  rec.onresult=e=>{ heard=''; for(let i=e.resultIndex;i<e.results.length;i++){ const r=e.results[i]; if(r.isFinal) final+=r[0].transcript; else heard+=r[0].transcript; }
    showBar('“'+(final+heard).trim()+'”'); };
  rec.onerror=e=>{ busy=false; if(e.error==='not-allowed'||e.error==='service-not-allowed') say('Please allow the microphone for this page, then try again.');
    else if(e.error==='no-speech') { showBar('I didn\'t hear anything.',true); hideBar(1800); }
    else if(e.error!=='aborted') { showBar('Voice isn\'t working right now ('+e.error+').',true); hideBar(2500); } };
  rec.onend=()=>{ busy=false; const t=(final||heard).trim(); if(t) handle(t); else if(bar.classList.contains('on')&&!bar.classList.contains('think')) hideBar(300); };
  try{ rec.start(); }catch(e){ busy=false; }
}
addEventListener('keydown',e=>{ if(e.repeat||(e.target&&/INPUT|TEXTAREA/.test(e.target.tagName))) return; if(e.key.toLowerCase()==='v') listen(); });
window.VOICE={listen,handle,say};
})();
