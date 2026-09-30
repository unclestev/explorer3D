/* Error overlay: shows script and promise errors on screen (phones have no console). */
(function(){
  function show(m){var d=document.getElementById('dbg');if(!d){d=document.createElement('pre');d.id='dbg';
    d.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;max-height:40%;overflow:auto;z-index:9999;margin:0;padding:10px;background:#7f1d1d;color:#fff;font:12px monospace;white-space:pre-wrap;border-radius:8px';
    document.body.appendChild(d);} d.textContent+=m+"\n";}
  var seenE={}, nE=0;
  function once(m){ var k=String(m).slice(0,80); if(seenE[k]||nE>=8) return; seenE[k]=1; nE++; show(m); }
  window.addEventListener('error',function(e){
    // bare cross-origin "Script error." carries no file/line/stack: log it, don't show a useless box
    if(e.message==='Script error.' && !e.filename && !e.lineno && !e.error){ console.warn('Opaque cross-origin "Script error." (no details available)',e); return; }
    once('ERROR: '+e.message+(e.filename?' @ '+e.filename.split('/').slice(-3).join('/')+':'+e.lineno+':'+e.colno:'')+(e.message==='Script error.'?' (hidden by the browser: it came from a library on another domain; check the console for details)':'')+(e.lineno?' (line '+e.lineno+')':'')+(e.error&&e.error.stack?'\n'+e.error.stack.split('\n').slice(0,5).join('\n'):''));});
  window.addEventListener('unhandledrejection',function(e){once('PROMISE: '+(e.reason&&e.reason.message||e.reason));});
  window.addEventListener('load',function(){
    if(typeof maplibregl==='undefined')show('MapLibre failed to load from jsdelivr, cdnjs and unpkg. Check your network or ad blocker.');
    if(typeof THREE==='undefined')show('Three.js failed to load from cdnjs.cloudflare.com');
  });
})();
