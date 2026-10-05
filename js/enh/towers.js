/* Realistic Oswego, Yorkville and Sugar Grove water towers, modelled on the owner's photos.
   - Oswego: wide white "onion" tank on a plain white column, with the Village of Oswego logo
     (cattails, small "Village Of", navy "Oswego", blue swoosh) three times around the tank.
   - Yorkville: round white tank on a tall slim column that flares at the ground, two thin red bands
     with red "YORKVILLE" between them and the red Yorkville Foxes fox head to the right of the name, twice around the tank.
   - Sugar Grove: white egg-shaped tank (widest above the middle, tapering into a short flared neck) on a slim column,
     topped by a ring of cell antennas and a tall mast. Twice around the tank: navy small-caps serif "SUGAR GROVE"
     (light-blue edge) and a group of four green trees standing on their shadows.
   Towers are still map fill-extrusions (so buildings, terrain and fog hide them correctly): the outline is a stack of
   rings following each tower's real profile, and the lettering is painted onto the rings as thin coloured wedges,
   sampled from an unrolled picture of the tank that's drawn once in code. Only towers within 3 km of the car
   (2 km in battery saver) get the lettering; farther ones keep the shape in plain white.
   Towers in other towns keep the generic shape from game.js. Hook: game.js towerFC() calls window.TOWER_SHAPE(t). */
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

// Yorkville fox head (redrawn from the owner's photo of the tank, 2026-10-04), in design units: x -56..56 (0 = centre line), y 0 (ear tips) .. 142 (chin), y down.
function drawFox(x,lw){
  const R='#c8202a'; x.fillStyle=R; x.strokeStyle=R; x.lineWidth=lw; x.lineJoin='round'; x.lineCap='round';
  // half outline, right side, from the dip between the ears to the chin; the left side is its mirror
  const half=[
    ['C',7,40,12,38,15,30],                 // top of the head rising into the ear
    ['C',19,20,27,8,33,0],                  // inner edge of the ear up to the tip
    ['C',37,10,42,32,44,52],                // outer edge of the ear
    ['Q',45,58,47,63],['L',52,70],['L',46,72],          // ruff tufts down the side of the head
    ['Q',42,76,41,81],['L',43,84],['L',40,87],
    ['Q',41,94,44,98],['L',51,104],['L',46,106],
    ['Q',45,110,44,113],['L',48,118],['L',39,119],
    ['Q',36,121,34,124],['L',36,129],['L',27,128],
    ['C',20,134,8,142.5,0,142.5]];              // jaw tapering to the chin             // jaw to the chin
  const pts=s=>{ const a=[]; for(let i=1;i<s.length;i+=2) a.push([s[i],s[i+1]]); return a; };
  x.beginPath(); x.moveTo(0,40);
  for(const s of half){ const p=pts(s); x[s[0]==='C'?'bezierCurveTo':s[0]==='Q'?'quadraticCurveTo':'lineTo'](...p.flat()); }
  // back up the left side: same segments mirrored and reversed
  let cur=[0,142]; const ends=[[0,40]]; let e=[0,40]; for(const s of half){ const p=pts(s); ends.push(p[p.length-1]); }
  for(let i=half.length-1;i>=0;i--){ const s=half[i], p=pts(s), start=ends[i];
    const ctrl=p.slice(0,-1).reverse().map(q=>[-q[0],q[1]]), to=[-start[0],start[1]];
    x[s[0]==='C'?'bezierCurveTo':s[0]==='Q'?'quadraticCurveTo':'lineTo'](...ctrl.flat(),...to); }
  x.closePath(); x.stroke();
  for(const m of [1,-1]){
    const X=v=>v*m;
    // inner ear, filled
    x.beginPath(); x.moveTo(X(32),6); x.bezierCurveTo(X(26),17,X(20),33,X(21),43);
    x.bezierCurveTo(X(22),51,X(33),54,X(39),46); x.bezierCurveTo(X(40),30,X(36),15,X(32),6); x.fill();
    // eye: slanted almond, round at the outer top, pointed at the inner bottom
    const A=[17.5,72], B=[6.5,91], dx=B[0]-A[0], dy=B[1]-A[1], L=Math.hypot(dx,dy), px=-dy/L, py=dx/L;
    x.beginPath(); x.moveTo(X(A[0]-px*0),A[1]);
    x.bezierCurveTo(X(A[0]+px*6+dx*.05),A[1]+py*6+dy*.05, X(B[0]+px*3.2-dx*.3),B[1]+py*3.2-dy*.3, X(B[0]),B[1]);
    x.bezierCurveTo(X(B[0]-px*2.2-dx*.3),B[1]-py*2.2-dy*.3, X(A[0]-px*5+dx*.05),A[1]-py*5+dy*.05, X(A[0]),A[1]); x.fill();
    // brow marks, tick under the eye, muzzle line, cheek-to-nose line
    x.beginPath(); x.moveTo(X(12),59); x.lineTo(X(13),68.5);
    x.moveTo(X(15),95); x.lineTo(X(18.5),91.5);
    x.moveTo(X(5),94); x.bezierCurveTo(X(5.5),100,X(6),106,X(6.5),111);
    x.moveTo(X(28),93); x.bezierCurveTo(X(26),104,X(17),110,X(8.5),113.5); x.stroke();
  }
  x.beginPath(); x.ellipse(0,118,4.4,5.6,0,0,7); x.fill();       // nose
}

// ---------- the designs (heights in metres from the ground; measured off the photos) ----------
const D={
  york:{
    // round tank (20 m wide) on a slim column that flares at the base; ~42 m tall
    r(z){ if(z<0.6) return 2.7; if(z<2.2) return 2.7-(z-.6)/1.6*.8;
      const C=34.2, a=10, b=7.8, sph=Math.abs(z-C)<b?a*Math.sqrt(1-((z-C)/b)**2):0;
      const neck=z<25.5?1.9:z<29?1.9+(z-25.5)*.9:0;
      return Math.max(sph,neck,z<26?1.9:0); },
    top:42.0, light:42.95,
    rings:[[0,.6,.6],[.6,2.2,.4],[2.2,25.5,23.3],[25.5,32,.5],[38.4,42,.4]],
    band:{z0:32,z1:38.4,rowH:.32,M:420,Rref:9.7,copies:2,
      pal:['#f2f4f6','#c8202a'],
      draw(x,W,Hm,cx){                                            // x: canvas scaled to metres; y = 0 at the top of the band
        x.fillStyle='#c8202a';
        x.fillRect(0,Hm-(37.95-32),W,.48); x.fillRect(0,Hm-(32.65-32),W,.48);   // the two red bands, all the way round
        x.save(); x.translate(cx,Hm-(33.5-32)); x.font='700 100px Arial, Helvetica, sans-serif';
        const w=x.measureText('YORKVILLE').width; x.scale(14.5/w,3.3/72); x.textAlign='center'; x.textBaseline='alphabetic';
        x.fillText('YORKVILLE',0,0); x.restore(); }},
    // the Yorkville Foxes fox head, right of each YORKVILLE: a finer picture laid just outside the band (see decalRects)
    decal:{x:9.9,z0:32.85,z1:37.25,cell:.033,color:'#c8202a',units:[112,142],draw:drawFox},
    extras(t,f){ f.push(F([circle(t,2.8,24),circle(t,2.6,24).reverse()],41.3,42.2,RAIL));     // railing round the hatch
      f.push(F([circle(t,.6,10)],41.9,42.8,RAIL)); }
  },
  sg:{
    // egg tank (19 m wide, widest ~7 m below the top) tapering into a short flared neck on a slim column; ~45 m to the
    // tank top, antenna mast to ~57 m. Measured off the owner's two photos (tank : column width about 4 : 1).
    r(z){ if(z<1) return 3.0; if(z<26) return 2.25; if(z<28.6) return 2.25+(z-26)/2.6*.55;
      if(z<37.7){ const t=(37.7-z)/9.1; return 2.8+6.7*Math.pow(Math.max(0,1-t*t),.8); }
      const t=Math.min(1,(z-37.7)/7.3); return 9.5*Math.sqrt(Math.max(0,1-t*t)); },
    top:45, light:57.3,
    rings:[[0,1,1],[1,26,25],[26,28.6,.65],[28.6,35.5,.45],[42.5,45,.4]],
    band:{z0:35.5,z1:42.5,rowH:7/24,M:480,Rref:9.0,copies:2,
      pal:['#f2f4f6','#1c2a6b','#8098c8','#1f5a3a','#2f8a52','#4aa268','#4a5d98'],
      draw(x,W,Hm,cx){
        const Z=z=>Hm-(z-35.5);
        // ---- "SUGAR GROVE": small caps, big S and G, navy with a light-blue edge ----
        const parts=[['S',1],['UGAR',0],[' ',0],['G',1],['ROVE',0]], FONT='700 100px Georgia, "Times New Roman", serif';
        x.font=FONT; const asc=x.measureText('H').actualBoundingBoxAscent||70, sc=[2.1/asc,2.8/asc];
        let nat=0; for(const [s,b] of parts) nat+=x.measureText(s).width*sc[b]+(s===' '?0:.12);
        const fx=16/nat, x0=cx-14.1, base=Z(37.4);
        for(const [col,dx,dy] of [['#8098c8',-.2,.16],['#1c2a6b',0,0]]){
          x.fillStyle=col; let px=x0+dx;
          for(const [s,b] of parts){ x.save(); x.translate(px,base+dy); x.scale(sc[b]*fx,sc[b]); x.font=FONT; x.textBaseline='alphabetic'; x.fillText(s,0,0); x.restore();
            px+=(x.measureText(s).width*sc[b]+(s===' '?0:.12))*fx; } }
        // ---- the trees, to the right of the name: four trees on a common ground line, each with a shadow ----
        const tx=cx+3.7, g=Z(37.0);
        const blob=(cxm,cz,rx,ry,col)=>{ x.fillStyle=col; for(const [ox,oz,f] of [[0,0,1],[-.55,-.25,.7],[.55,-.2,.72],[-.3,.45,.66],[.35,.45,.62],[0,-.5,.6]]){
          x.beginPath(); x.ellipse(tx+cxm+ox*rx,Z(cz+oz*ry),rx*f,ry*f,0,0,7); x.fill(); } };
        const trunk=(cxm,top)=>{ x.strokeStyle='#1f5a3a'; x.lineCap='round'; x.lineWidth=.26;
          x.beginPath(); x.moveTo(tx+cxm,g); x.lineTo(tx+cxm,Z(top)); x.stroke(); x.lineWidth=.16;
          x.beginPath(); x.moveTo(tx+cxm,Z(top-.3)); x.lineTo(tx+cxm-.45,Z(top+.35)); x.moveTo(tx+cxm,Z(top-.4)); x.lineTo(tx+cxm+.5,Z(top+.3)); x.stroke(); };
        const shadow=(a,b)=>{ x.strokeStyle='#1f5a3a'; x.lineWidth=.22; x.beginPath(); x.moveTo(tx+a,g+.05); x.lineTo(tx+b,g+.3); x.stroke(); };
        const T=[[.8,39.3,.75,1.25,'#4aa268',38.4],[2.3,40.1,1.15,1.45,'#1f5a3a',39.0],[6.8,40.3,1.25,1.15,'#4aa268',39.4],[4.4,40.7,1.7,1.55,'#2f8a52',39.4]];
        for(const t of T){ shadow(t[0]-.3,t[0]-1.6); trunk(t[0],t[5]); }
        for(const t of T) blob(t[0],t[1],t[2],t[3],t[4]);
        for(const t of T) trunk(t[0],t[5]-.6);                     // trunk base stays visible under the canopy
      }},
    extras(t,f){
      f.push(F([circle(t,3.7,24),circle(t,3.45,24).reverse()],44.4,45.4,RAIL));      // antenna platform rail
      for(let i=0;i<9;i++){ const a=i/9*2*Math.PI, k=kx(t), cx=t.lng+Math.cos(a)*3.3/k, cy=t.lat+Math.sin(a)*3.3/111320;   // panel antennas
        const ux=Math.cos(a), uy=Math.sin(a), vx=-uy, vy=ux, P=(u,v)=>[cx+(ux*u+vx*v)/k,cy+(uy*u+vy*v)/111320];
        f.push(F([[P(-.18,-.3),P(.18,-.3),P(.18,.3),P(-.18,.3),P(-.18,-.3)]],45.2,48.6,'#cfd5dc')); }
      f.push(F([circle(t,2.2,16),circle(t,2.0,16).reverse()],47.4,47.8,RAIL));     // antenna frame
      f.push(F([circle(t,.35,8)],44.8,57,RAIL));                                      // mast
      f.push(F([circle(t,1.3,12),circle(t,1.1,12).reverse()],53.6,54.0,RAIL));
      for(let i=0;i<3;i++){ const a=i/3*2*Math.PI+.4, k=kx(t), cx=t.lng+Math.cos(a)*1.2/k, cy=t.lat+Math.sin(a)*1.2/111320;
        f.push(F([[[cx-.12/k,cy-.12/111320],[cx+.12/k,cy-.12/111320],[cx+.12/k,cy+.12/111320],[cx-.12/k,cy+.12/111320],[cx-.12/k,cy-.12/111320]]],53.8,56.2,'#cfd5dc')); } }
  },
  osw:{
    // wide onion tank (24 m) tapering into a plain column, on a low pedestal; ~38 m tall
    r(z){ if(z<0.9) return 4.2; if(z<1.5) return 3.3; if(z<18.9) return 2.8;
      if(z<30.8){ const t=(30.8-z)/11.9; return 2.8+9.2*Math.pow(Math.max(0,1-t*t),1.15); }
      const t=Math.min(1,(z-30.8)/7.1); return 12*Math.pow(Math.max(0,1-Math.pow(t,2.1)),1/2.1); },
    top:37.9, light:39.15,
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


// ---------- decals: a small picture (the Yorkville fox) at a finer grid than the band, laid 3 cm proud of the tank ----------
// Sampled once into cells, merged into rectangles (same columns in consecutive rows), never across a band row so each
// rectangle can sit on its own band ring. Each rectangle becomes a thin curved shell, not a wedge from the centre.
function decalRects(d){
  const C=d.decal; if(C.rects) return C.rects;
  const [uw,uh]=C.units, k=(C.z1-C.z0)/uh, cols=Math.ceil(uw*k/C.cell), rows=Math.round((C.z1-C.z0)/C.cell), P=8;
  const c=document.createElement('canvas'); c.width=cols*P; c.height=rows*P; const x=c.getContext('2d');
  x.scale(P/C.cell*k,P/C.cell*k); x.translate(uw/2,0); C.draw(x,2.5);
  const px=x.getImageData(0,0,c.width,c.height).data, on=[];
  for(let r=0;r<rows;r++){ const line=[]; for(let j=0;j<cols;j++){ let a=0; for(let yy=r*P;yy<(r+1)*P;yy++) for(let xx=j*P;xx<(j+1)*P;xx++) a+=px[(yy*c.width+xx)*4+3]; line.push(a/(P*P*255)>.4); } on.push(line); }
  const B=d.band, bandRow=z=>Math.floor((z-B.z0)/B.rowH+1e-6), rects=[]; let open=new Map();
  for(let r=0;r<rows;r++){                                         // r = 0 at the top
    const zt=C.z1-r*C.cell, zb=zt-C.cell, br=bandRow(zb+C.cell/2), runs=[];
    for(let j=0;j<cols;){ if(!on[r][j]){ j++; continue; } let e=j; while(e<cols&&on[r][e]) e++; runs.push([j,e]); j=e; }
    const next=new Map();
    for(const [j0,j1] of runs){ const key=j0+','+j1, o=open.get(key);
      if(o&&o.br===br){ o.zb=zb; next.set(key,o); } else { const n={j0,j1,zt,zb,br}; rects.push(n); next.set(key,n); } }
    open=next;
  }
  return (C.rects={rects,cols,w:cols*C.cell});
}
function shell(t,ri,ro,a0,a1){ const k=kx(t), n=Math.max(1,Math.ceil((a1-a0)/(4*DEG))), ring=[];
  for(let i=0;i<=n;i++){ const a=a0+(a1-a0)*i/n; ring.push([t.lng+Math.cos(a)*ro/k,t.lat+Math.sin(a)*ro/111320]); }
  for(let i=n;i>=0;i--){ const a=a0+(a1-a0)*i/n; ring.push([t.lng+Math.cos(a)*ri/k,t.lat+Math.sin(a)*ri/111320]); }
  ring.push(ring[0]); return [ring]; }
function decal(t,d,rot,f){
  const C=d.decal, B=d.band, R=decalRects(d), circ=2*Math.PI*B.Rref;
  for(let i=0;i<B.copies;i++){
    const a0=rot+(circ*(i+.5)/B.copies+C.x-R.w/2)/B.Rref;           // same angle convention as the band: x / Rref
    for(const q of R.rects){ const r=d.r(B.z0+(q.br+.5)*B.rowH);    // the band ring this rectangle sits on
      f.push(F(shell(t,r-.3,r+.03,a0+q.j0*C.cell/B.Rref,a0+q.j1*C.cell/B.Rref),q.zb,q.zt,C.color)); } }
}

// ---------- which design a tower gets ----------
// Real village/city limits of Oswego, Yorkville and Sugar Grove (OpenStreetMap, via the same Overpass servers game.js uses).
// Until they arrive (or if they can't be fetched) rough boxes stand in.
const LIMITS={osw:null,york:null,sg:null,tried:0,busy:false};
const haveLimits=()=>!!(LIMITS.osw||LIMITS.york||LIMITS.sg);
function loadLimits(ep=0){
  if(LIMITS.busy||haveLimits()||typeof OVERPASS==='undefined') return; LIMITS.busy=true; LIMITS.tried=Date.now();
  const q='[out:json][timeout:25];rel["boundary"="administrative"]["admin_level"="8"]["name"~"^(Oswego|Yorkville|United City of Yorkville|Sugar Grove|Village of Sugar Grove)$"](41.45,-88.75,41.85,-88.1);out geom;';
  fetch(OVERPASS[ep],{method:'POST',body:'data='+encodeURIComponent(q),headers:{'Content-Type':'application/x-www-form-urlencoded'}})
    .then(r=>{ if(!r.ok) throw new Error('overpass '+r.status); return r.json(); })
    .then(j=>{ for(const el of j.elements||[]){ const nm=((el.tags||{}).name||'').toLowerCase(), key=/oswego/.test(nm)?'osw':/yorkville/.test(nm)?'york':/sugar grove/.test(nm)?'sg':null;
        if(!key) continue; const edges=[];
        for(const m of el.members||[]) if(m.type==='way'&&m.geometry&&(m.role==='outer'||m.role==='inner'||!m.role))
          for(let i=1;i<m.geometry.length;i++){ const a=m.geometry[i-1], b=m.geometry[i]; edges.push([a.lon,a.lat,b.lon,b.lat]); }
        if(edges.length>2) LIMITS[key]=edges; }
      cache.clear(); shown='-'; refresh(); })
    .catch(e=>{ console.warn('town limits',e); if(ep+1<OVERPASS.length){ LIMITS.busy=false; loadLimits(ep+1); } })
    .finally(()=>{ LIMITS.busy=false; });
}
function inside(lng,lat,edges){ let c=false; for(const e of edges){ const [x1,y1,x2,y2]=e;
  if((y1>lat)!==(y2>lat)&&lng<(x2-x1)*(lat-y1)/(y2-y1)+x1) c=!c; } return c; }
const cache=new Map();
function kind(t){
  const id=t.id||(t.lng+','+t.lat); if(cache.has(id)) return cache.get(id);
  let k=null;
  if(LIMITS.osw&&inside(t.lng,t.lat,LIMITS.osw)) k='osw';
  else if(LIMITS.york&&inside(t.lng,t.lat,LIMITS.york)) k='york';
  else if(LIMITS.sg&&inside(t.lng,t.lat,LIMITS.sg)) k='sg';
  else{ const s=((t.raw||'')+' '+(t.op||'')+' '+(t.city||'')+' '+(t.name||'')).toLowerCase();
    if(/oswego/.test(s)) k='osw'; else if(/yorkville/.test(s)) k='york'; else if(/sugar ?grove/.test(s)) k='sg';
    else if(!haveLimits()&&!/montgomery|plano|aurora|naperville|plainfield|sandwich|millbrook|newark|bristol|elburn|big rock|north aurora/.test(s)){
      if(t.lat>41.735&&t.lat<41.81&&t.lng>-88.52&&t.lng<-88.40) k='sg';
      else if(t.lat>41.62&&t.lat<41.74&&t.lng>-88.42&&t.lng<-88.26) k='osw';
      else if(t.lat>41.57&&t.lat<41.73&&t.lng>-88.56&&t.lng<=-88.42) k='york'; } }
  if(haveLimits()) cache.set(id,k);                    // final once the real limits are known
  return k;
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
    if(d.decal) decal(t,d,rot,f);
  }
  d.extras(t,f);
  return f;
}

window.TOWER_SHAPE=t=>safe('tower shape',()=>shape(t))||null;
const lightAt=t=>{ const k=kind(t); return k?D[k].light:52.7; };     // generic tower (game.js): finial top at 52.5 m

let shown='';
function refresh(){ if(typeof towers==='undefined'||typeof drawTowers!=='function') return;
  const key=towers.filter(t=>kind(t)&&near(t)).map(t=>t.id+kind(t)).join(',');   // redraw only when the set of close towers changes
  if(key!==shown){ shown=key; drawTowers(); } }

/* ---------- obstruction beacons on top of every water tower ----------
   Drawn as small glowing dots in a layer over the map (so night darkening doesn't dim them), placed each time the
   map draws using the map's own camera, so they sit exactly on the tank tops in the car and the glider.
   Daylight: brief white strobe. When it gets dark (same darkness the sky and headlights use): slow red flash.
   A dot is hidden when a building stands in front of it. Only towers within 12 km get one. */
const layer=document.createElement('div'); layer.id='beacons';
const fogEl=document.getElementById('fog'); (fogEl&&fogEl.parentNode?fogEl.parentNode.insertBefore(layer,fogEl):document.body.appendChild(layer));   // above the night tint, under fog
const B={list:[],night:null,occT:0};
function syncBeacons(){
  if(typeof towers==='undefined') return;
  const want=towers.filter(t=>meters(t.lat,t.lng,S.lat,S.lng)<12000);
  const ids=new Set(want.map(t=>t.id));
  B.list=B.list.filter(b=>{ if(ids.has(b.t.id)) return true; b.el.remove(); return false; });
  for(const t of want) if(!B.list.find(b=>b.t.id===t.id)){
    const el=document.createElement('i'); el.className='bcn'; el.style.animationDelay=(-hash(t.id)*3).toFixed(2)+'s';
    layer.appendChild(el); B.list.push({t,el,h:0,occ:false}); }
  for(const b of B.list) b.h=lightAt(b.t);
  const night=!!(YD.AT&&YD.AT.k>.45);
  if(night!==B.night){ B.night=night; layer.classList.toggle('night',night); }
}
function screenPt(b){
  const T=map.transform, ll=new maplibregl.LngLat(b.t.lng,b.t.lat), mc=T.locationCoordinate(ll), ter=map.terrain;
  const z=ter?ter.getElevationForLngLatZoom(ll,T.tileZoom)+b.h:b.h, M=ter&&T.pixelMatrix3D?T.pixelMatrix3D:T.pixelMatrix;
  const x=mc.x*T.worldSize, y=mc.y*T.worldSize;
  const w=M[3]*x+M[7]*y+M[11]*z+M[15]; if(w<=0) return null;      // behind the camera
  return [(M[0]*x+M[4]*y+M[8]*z+M[12])/w,(M[1]*x+M[5]*y+M[9]*z+M[13])/w];
}
const OCC=['building-3d','rebuilt-3d'];
function placeBeacons(){
  if(!B.list.length) return;
  const W=innerWidth, H=innerHeight, now=performance.now(), occ=now-B.occT>(POWER?900:450);
  if(occ) B.occT=now;
  const layers=occ?OCC.filter(id=>map.getLayer(id)):null;
  for(const b of B.list){
    let p=null; try{ p=screenPt(b); }catch(e){}
    if(!p||p[0]<-20||p[0]>W+20||p[1]<-20||p[1]>H+20){ if(b.el.style.display!=='none') b.el.style.display='none'; continue; }
    if(occ&&layers.length){ try{ b.occ=map.queryRenderedFeatures([p[0],p[1]+2],{layers}).length>0; }catch(e){ b.occ=false; } }
    if(b.occ){ if(b.el.style.display!=='none') b.el.style.display='none'; continue; }
    const d=meters(b.t.lat,b.t.lng,S.lat,S.lng), sc=Math.max(.45,Math.min(1.3,700/Math.max(d,1)));   // a bit smaller with distance
    if(b.el.style.display==='none') b.el.style.display='';
    b.el.style.transform='translate3d('+p[0].toFixed(1)+'px,'+p[1].toFixed(1)+'px,0) scale('+sc.toFixed(2)+')';
  }
}

onReady(function towerLooks(){ shown='-'; refresh(); loadLimits(); syncBeacons(); map.on('render',()=>safe('beacons',placeBeacons)); });
onTick(3000,function towerDetail(){ refresh(); if(!haveLimits()&&!LIMITS.busy&&Date.now()-LIMITS.tried>120000) loadLimits(); });
onTick(1000,function beaconList(){ syncBeacons(); });
})();
