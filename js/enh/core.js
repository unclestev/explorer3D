/* Shared helpers for the optional enhancement modules (js/enh/*.js).
   Each module is its own IIFE that pulls what it needs from window.YD, registers work with onReady / onTick,
   and wraps everything so a failed data source or style change can't stop the game. js/enh/boot.js starts them. */
window.YD=(()=>{
'use strict';
const ENH={};
const EMPTY={type:'FeatureCollection',features:[]};
const PXM=1/mpp(START.lat,20);                                   // screen px per metre at zoom 20
// width/offset in real metres -> zoom-scaled pixels (optional minimum pixel size)
function mz(m,min){ min=min||0; const f=v=>Math.sign(m)*Math.max(min,Math.abs(v)); return ['interpolate',['exponential',2],['zoom'],14,f(m*PXM/64),22,f(m*PXM*4)]; }
function mzE(e){ return ['interpolate',['exponential',2],['zoom'],14,['*',e,PXM/64],22,['*',e,PXM*4]]; }
function safe(name,fn){ try{ return fn(); }catch(e){ console.warn('['+name+']',e&&e.message||e); } }
const UNDER='building';                                          // our ground layers sit just below the buildings
function addUnder(l){ if(!map.getLayer(l.id)) map.addLayer(l,map.getLayer(UNDER)?UNDER:undefined); }
function srcName(){ return (typeof bSrc==='string'&&map.getSource(bSrc))?bSrc:'openmaptiles'; }
function img(w,h,draw){ const c=document.createElement('canvas'); c.width=w; c.height=h; const x=c.getContext('2d'); draw(x,w,h); return x.getImageData(0,0,w,h); }
function addImg(id,data,opt){ if(!map.hasImage(id)) map.addImage(id,data,opt||{}); }
const inits=[], ticks=[];
function onReady(fn){ inits.push(fn); }
function onTick(ms,fn){ ticks.push({ms,fn,t:0}); }

/* ---------- shared geometry helpers (local metres: x = lng*MLNG, y = lat*MLAT) ---------- */
function psd(px,py,ax,ay,bx,by){ const dx=bx-ax,dy=by-ay,L=dx*dx+dy*dy; let t=L?((px-ax)*dx+(py-ay)*dy)/L:0; t=t<0?0:t>1?1:t; return [Math.hypot(px-ax-t*dx,py-ay-t*dy),t]; }
function polyDist(pts,x,y){ let b=1e18; for(let i=1;i<pts.length;i++){ const d=psd(x,y,pts[i-1][0],pts[i-1][1],pts[i][0],pts[i][1])[0]; if(d<b) b=d; } return b; }
// crossing point of two segments [ax,ay,bx,by,...], allowing ~2 m of slack at the ends (T-junctions); ignores near-parallel pairs
function segX(s,t){ const x1=s[0],y1=s[1],x2=s[2],y2=s[3],x3=t[0],y3=t[1],x4=t[2],y4=t[3];
  const L1=Math.hypot(x2-x1,y2-y1)||1, L2=Math.hypot(x4-x3,y4-y3)||1, d=(x2-x1)*(y4-y3)-(y2-y1)*(x4-x3);
  if(Math.abs(d)/(L1*L2)<.42) return null;                       // under ~25 degrees: a name change, not a crossing
  const u=((x3-x1)*(y4-y3)-(y3-y1)*(x4-x3))/d, v=((x3-x1)*(y2-y1)-(y3-y1)*(x2-x1))/d, e1=2/L1, e2=2/L2;
  return (u>=-e1&&u<=1+e1&&v>=-e2&&v<=1+e2)?[x1+u*(x2-x1),y1+u*(y2-y1)]:null; }
const ABBR=[[/\bStreet\b/g,'St'],[/\bAvenue\b/g,'Ave'],[/\bRoad\b/g,'Rd'],[/\bDrive\b/g,'Dr'],[/\bLane\b/g,'Ln'],[/\bCourt\b/g,'Ct'],
  [/\bBoulevard\b/g,'Blvd'],[/\bParkway\b/g,'Pkwy'],[/\bPlace\b/g,'Pl'],[/\bCircle\b/g,'Cir'],[/\bHighway\b/g,'Hwy'],[/\bTrail\b/g,'Trl'],
  [/\bTerrace\b/g,'Ter'],[/^North\b/,'N'],[/^South\b/,'S'],[/^East\b/,'E'],[/^West\b/,'W']];
const abbr=s=>ABBR.reduce((a,[r,t])=>a.replace(r,t),String(s));

// sign artwork, drawn once (128 px of image ~ 3.2 m, a little oversized for readability)
function post(x,w,h,top){ x.fillStyle='#8b949e'; x.fillRect(w/2-2,top,4,h-top); x.fillStyle='#5f6771'; x.fillRect(w/2+1,top,1,h-top); }
function octa(x,cx,cy,r){ x.beginPath(); for(let i=0;i<8;i++){ const a=Math.PI/8+i*Math.PI/4; x.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r); } x.closePath(); }
function rrect(x,a,b,w,h,r){ x.beginPath(); x.moveTo(a+r,b); x.arcTo(a+w,b,a+w,b+h,r); x.arcTo(a+w,b+h,a,b+h,r); x.arcTo(a,b+h,a,b,r); x.arcTo(a,b,a+w,b,r); x.closePath(); }
const ISZ=['interpolate',['linear'],['zoom'],15,.2,17,.3,19.3,.47,22,1.2];   // floor on size so far signs stay legible
const BILL={'icon-anchor':'bottom','icon-pitch-alignment':'viewport','icon-rotation-alignment':'viewport','icon-allow-overlap':true,'icon-ignore-placement':true,'symbol-z-order':'viewport-y'};

return {ENH,EMPTY,PXM,UNDER,mz,mzE,safe,addUnder,srcName,img,addImg,onReady,onTick,inits,ticks,psd,polyDist,segX,abbr,post,octa,rrect,ISZ,BILL};
})();
