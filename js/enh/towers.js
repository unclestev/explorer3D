/* Realistic Oswego and Yorkville water towers, modelled on the owner's photos.
   - Oswego: wide white "onion" tank on a plain white column, with the Village of Oswego logo
     (cattails, small "Village Of", navy "Oswego", blue swoosh) three times around the tank.
   - Yorkville: round white tank on a tall slim column that flares at the ground, two thin red bands
     with red "YORKVILLE" between them, twice around the tank.
   Towers are still map fill-extrusions (so buildings, terrain and fog hide them correctly): the outline is a stack of
   rings following each tower's real profile, and the lettering is painted onto the rings as thin coloured wedges,
   sampled from an unrolled picture of the tank that's drawn once in code. Only towers within 3 km of the car
   (2 km in battery saver) get the lettering; farther ones keep the shape in plain white.
   Other towns' towers keep the generic shape from game.js. Hook: game.js towerFC() calls window.TOWER_SHAPE(t). */
(()=>{
'use strict';
const {safe,onReady,onTick}=YD;
const WHITE='#f2f4f6', RAIL='#9aa3ad', DEG=Math.PI/180;

// ---------- geometry helpers (metres around the tower -> lng/lat) ----------
function kx(t){ return 111320*Math.cos(t.lat*DEG); }
function circle(t,r,n){ const k=kx(t), ring=[]; for(let i=0;i<=n;i++){ const a=(i%n)/n*2*Math.PI; ring.push([t.lng+Math.cos(a)*r/k,t.lat+Math.sin(a)*r/111320]); } return ring; }
function wedge(t,r,a0,a1){ const k=kx(t), ring=[[t.lng,t.lat]], n=Math.max(1,Math.ceil((a1-a0)/(5*DEG)));
  for(let i=0;i<=n;i++){ const a=a0+(a1-a0)*i/n; ring.push([t.lng+Math.cos(a)*r/k,t.lat+Math.sin(a)*r/111320]); }
  ring.push([t.lng,t.lat]); return [ring]; }
const F=(geom,b,h,c)=>({type:'Feature',properties:{k:'tw',b:+b.toFixed(2),h:+h.toFixed(2),c},geometry:{type:'Polygon',coordinates:geom}});
const segs=r=>Math.max(16,Math.min(40,Math.round(r*3.2)));

// ---------- the two designs (heights in metres from the ground; measured off the photos) ----------
const D={
  york:{
    // round tank (20 m wide) on a slim column that flares at the base; ~42 m tall
    r(z){ if(z<0.6) return 2.7; if(z<2.2) return 2.7-(z-.6)/1.6*.8;
      const C=34.2, a=10, b=7.8, sph=Math.abs(z-C)<b?a*Math.sqrt(1-((z-C)/b)**2):0;
      const neck=z<25.5?1.9:z<29?1.9+(z-25.5)*.9:0;
      return Math.max(sph,neck,z<26?1.9:0); },
    top:42.0,
    rings:[[0,.6,.6],[.6,2.2,.4],[2.2,25.5,23.3],[25.5,32,.5],[38.4,42,.4]],
    band:{z0:32,z1:38.4,rowH:.32,M:420,Rref:9.7,copies:2,
      pal:['#f2f4f6','#c8202a'],
      draw(x,W,Hm,cx){                                            // x: canvas scaled to metres; y = 0 at the top of the band
        x.fillStyle='#c8202a';
        x.fillRect(0,Hm-(37.95-32),W,.48); x.fillRect(0,Hm-(32.65-32),W,.48);   // the two red bands, all the way round
        x.save(); x.translate(cx,Hm-(33.5-32)); x.font='700 100px Arial, Helvetica, sans-serif';
        const w=x.measureText('YORKVILLE').width; x.scale(14.5/w,3.3/72); x.textAlign='center'; x.textBaseline='alphabetic';
        x.fillText('YORKVILLE',0,0); x.restore(); }},
    extras(t,f){ f.push(F([circle(t,2.8,24),circle(t,2.6,24).reverse()],41.3,42.2,RAIL));     // railing round the hatch
      f.push(F([circle(t,.6,10)],41.9,42.8,RAIL)); }
  },
  osw:{
    // wide onion tank (24 m) tapering into a plain column, on a low pedestal; ~38 m tall
    r(z){ if(z<0.9) return 4.2; if(z<1.5) return 3.3; if(z<18.9) return 2.8;
      if(z<30.8){ const t=(30.8-z)/11.9; return 2.8+9.2*Math.pow(Math.max(0,1-t*t),1.15); }
      const t=Math.min(1,(z-30.8)/7.1); return 12*Math.pow(Math.max(0,1-Math.pow(t,2.1)),1/2.1); },
    top:37.9,
    rings:[[0,.9,.9],[.9,1.5,.6],[1.5,18.9,17.4],[18.9,24.5,.45],[35,37.9,.4]],
    band:{z0:24.5,z1:35,rowH:.35,M:480,Rref:11.3,copies:3,
      pal:['#f2f4f6','#233a5e','#2f86cc','#4c9a3c','#c9741f'],
      draw(x,W,Hm,cx){
        const Z=z=>Hm-(z-24.5);                                   // height above ground -> canvas y
        // blue swoosh under the name: thick on the left, thin on the right, dipping in the middle
        x.fillStyle='#2f86cc'; x.beginPath();
        x.moveTo(cx-8.2,Z(28.4)); x.bezierCurveTo(cx-3,Z(26.9),cx+3,Z(26.9),cx+8.4,Z(28.0));
        x.bezierCurveTo(cx+3,Z(25.9),cx-4,Z(25.2),cx-8.2,Z(26.6)); x.closePath(); x.fill();
        // cattails: green blades and orange heads to the left of the name
        x.strokeStyle='#4c9a3c'; x.lineCap='round'; x.lineWidth=.38;
        for(const [bx,tx,tz] of [[-7.6,-8.4,32.6],[-7.2,-6.6,33.4],[-7.0,-5.4,31.6]]){ x.beginPath(); x.moveTo(cx+bx,Z(28.2)); x.quadraticCurveTo(cx+bx,Z(30.5),cx+tx,Z(tz)); x.stroke(); }
        x.fillStyle='#c9741f';
        for(const [hx,hz] of [[-7.9,32.9],[-6.6,33.9]]){ x.beginPath(); x.ellipse(cx+hx,Z(hz),.42,.95,0,0,7); x.fill(); }
        // "Village Of" (small) and "Oswego" (large), navy
        x.fillStyle='#233a5e'; x.textAlign='left'; x.textBaseline='alphabetic';
        x.save(); x.translate(cx-4.2,Z(32.3)); x.font='600 100px Optima, Candara, "Segoe UI", Georgia, serif';
        let w=x.measureText('Village Of').width; x.scale(5.4/w,1.35/70); x.fillText('Village Of',0,0); x.restore();
        x.save(); x.translate(cx-6.9,Z(28.9)); x.font='600 100px Optima, Candara, "Segoe UI", Georgia, serif';
        w=x.measureText('Oswego').width; x.scale(14.8/w,3.3/70); x.fillText('Oswego',0,0); x.restore(); }},
    extras(t,f){ f.push(F([circle(t,3.25,24),circle(t,3.0,24).reverse()],37.4,38.5,RAIL));
      f.push(F([circle(t,.5,10)],37.6,39.0,RAIL)); }
  }
};

// ---------- unrolled tank picture -> grid of colour runs (built once per design) ----------
function hexRGB(h){ const n=parseInt(h.slice(1),16); return [n>>16&255,n>>8&255,n&255]; }
function bandRuns(d){
  const B=d.band; if(B.runs) return B.runs;
  const P=20, circ=2*Math.PI*B.Rref, Hm=B.z1-B.z0, W=Math.ceil(circ*P), H=Math.ceil(Hm*P);
  const c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
  x.scale(P,P);
  for(let i=0;i<B.copies;i++) for(const sh of [-circ,0,circ]){ x.save(); B.draw(x,circ,Hm,circ*(i+.5)/B.copies+sh); x.restore(); }   // wrap round the seam
  const px=x.getImageData(0,0,W,H).data, pal=B.pal.map(hexRGB), rows=Math.round(Hm/B.rowH), runs=[];
  for(let row=0;row<rows;row++){                                  // row 0 = lowest ring
    const y0=Math.floor(H-(row+1)*H/rows), y1=Math.max(y0+1,Math.floor(H-row*H/rows)), line=[];
    for(let j=0;j<B.M;j++){
      const x0=Math.floor(j*W/B.M), x1=Math.max(x0+1,Math.floor((j+1)*W/B.M));
      let r=0,g=0,b=0,a=0,n=0;
      for(let yy=y0;yy<y1;yy++) for(let xx=x0;xx<x1;xx++){ const o=(yy*W+xx)*4, al=px[o+3]/255; r+=px[o]*al; g+=px[o+1]*al; b+=px[o+2]*al; a+=al; n++; }
      let ci=0;
      if(a/n>.42){ let best=1e9; for(let p=1;p<pal.length;p++){ const q=pal[p], e=(r/a-q[0])**2+(g/a-q[1])**2+(b/a-q[2])**2; if(e<best){ best=e; ci=p; } } }
      line.push(ci);
    }
    const rr=[]; let s=0; for(let j=1;j<=B.M;j++) if(j===B.M||line[j]!==line[s]){ rr.push([line[s],s,j]); s=j; }
    if(rr.length>1&&rr[0][0]===rr[rr.length-1][0]){ const l=rr.pop(); rr[0]=[l[0],l[1]-B.M,rr[0][2]]; }   // join across the seam
    runs.push(rr);
  }
  return (B.runs=runs);
}

// ---------- which design a tower gets ----------
function kind(t){
  const s=((t.raw||'')+' '+(t.op||'')+' '+(t.name||'')).toLowerCase();
  if(/oswego/.test(s)) return 'osw'; if(/yorkville/.test(s)) return 'york';
  if(/montgomery|plano|aurora|naperville|plainfield|sandwich|millbrook|newark|bristol/.test(s)) return null;
  if(t.lat>41.63&&t.lat<41.73&&t.lng>-88.40&&t.lng<-88.27) return 'osw';
  if(t.lat>41.58&&t.lat<41.70&&t.lng>-88.55&&t.lng<=-88.40) return 'york';
  return null;
}
function hash(s){ let h=2166136261; for(const ch of String(s)) h=Math.imul(h^ch.charCodeAt(0),16777619); return (h>>>0)/4294967296; }
const near=t=>meters(t.lat,t.lng,S.lat,S.lng)<(POWER?2000:3000);

function shape(t){
  const k=kind(t); if(!k) return null;
  const d=D[k], f=[], B=d.band, detail=near(t);
  const ring=(z0,z1)=>{ const r=d.r((z0+z1)/2); if(r>.15) f.push(F([circle(t,r,segs(r))],z0,z1,WHITE)); };
  for(const [z0,z1,dz] of d.rings) for(let z=z0;z<z1-1e-6;z+=dz) ring(z,Math.min(z1,z+dz));
  if(!detail){ for(let z=B.z0;z<B.z1-1e-6;z+=.7) ring(z,Math.min(B.z1,z+.7)); }
  else{
    const runs=bandRuns(d), rot=hash(t.id||t.lng)*2*Math.PI, dA=2*Math.PI/B.M;
    runs.forEach((rr,i)=>{ const z0=B.z0+i*B.rowH, z1=z0+B.rowH, r=d.r((z0+z1)/2);
      if(rr.length===1){ f.push(F([circle(t,r,segs(r))],z0,z1,B.pal[rr[0][0]])); return; }
      for(const [ci,j0,j1] of rr) f.push(F(wedge(t,r,rot+j0*dA,rot+j1*dA),z0,z1,B.pal[ci])); });
  }
  d.extras(t,f);
  return f;
}

window.TOWER_SHAPE=t=>safe('tower shape',()=>shape(t))||null;
let shown='';
function refresh(){ if(typeof towers==='undefined'||typeof drawTowers!=='function') return;
  const key=towers.filter(t=>kind(t)&&near(t)).map(t=>t.id).join(',');   // redraw only when the set of close towers changes
  if(key!==shown){ shown=key; drawTowers(); } }
onReady(function towerLooks(){ shown='-'; refresh(); });
onTick(3000,function towerDetail(){ refresh(); });
})();
