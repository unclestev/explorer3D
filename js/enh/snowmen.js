/* Snowmen in front yards (owner 2026-11-23: "when it is snowing and snow accumulates more than 3 inches show snowmen
   randomly in peoples front yards"). Once the snow (js/enh/snowcover.js) is deeper than 3 in, about one house in four
   near the car has a snowman in its front yard — between the street-side wall and the road, clear of the garage, the
   front door's walk and the driveway (spot from js/enh/buildings.js yardSpot). Which houses get one, and how each looks
   (size, top hat or knit cap, scarf colour, which way it's turned, sometimes a small one beside it), comes from where the
   house stands, so the same yards have the same snowmen on every visit. They go away again once the snow melts below
   ~2.5 in. Drawn as stacked extrusions (balls in slices, coal eyes and buttons, carrot nose, stick arms, hat, scarf).
   window.SNOWMEN = {count, build(), force(on) for testing} */
(()=>{
'use strict';
const {safe,onReady,onTick}=YD;
const EMPTY={type:'FeatureCollection',features:[]};
const SNOW=['#f4f6f9','#eef1f5','#f8f9fb'], SCARF=['#b8282e','#2f6b3a','#2b4f8f','#d9a21b','#7a2b6b','#c2531f'], CAP=['#b8282e','#2b4f8f','#2f6b3a','#5a5f66','#d9a21b'];
const CHANCE=.28, ON=3, OFF=2.5;
let on=false, sig='', count=0, forced=null;
function hash(a,b){ let h=(a*374761393+b*668265263)>>>0; h=Math.imul(h^(h>>>13),1274126177)>>>0; return ((h^(h>>>16))>>>0)/4294967296; }

function layer(){ safe('snowmen layer',()=>{
  if(!map.getSource('snowmen')) map.addSource('snowmen',{type:'geojson',data:EMPTY});
  if(!map.getLayer('snowmen')) map.addLayer({id:'snowmen',type:'fill-extrusion',source:'snowmen',
    paint:{'fill-extrusion-color':['get','c'],'fill-extrusion-base':['get','b'],'fill-extrusion-height':['get','h'],'fill-extrusion-vertical-gradient':false,'fill-extrusion-opacity':1}},
    map.getLayer('wall-3d')?'wall-3d':undefined);
  if(on) map.getSource('snowmen').setData(last||EMPTY); }); }
let last=null;

// one snowman at local metres (x,y) of house r, facing (fx,fy), scale k
function snowman(F,r,x,y,fx,fy,k,seed){
  const px=-fy, py=fx;                                                // to its right
  const ll=(lx,ly)=>[r.cx+lx/r.kx,r.cy+ly/r.ky];
  const disc=(cx,cy,rad,b,h,c,n)=>{ const ring=[]; n=n||12; for(let i=0;i<=n;i++){ const a=i/n*Math.PI*2; ring.push(ll(cx+Math.cos(a)*rad,cy+Math.sin(a)*rad)); }
    F.push({type:'Feature',properties:{c,b,h},geometry:{type:'Polygon',coordinates:[ring]}}); };
  // a box: from f0 to f1 metres forward, w wide (sideways offset o), from b to h up
  const box=(f0,f1,o,w,b,h,c,ax,ay)=>{ ax=ax==null?fx:ax; ay=ay==null?fy:ay; const qx=-ay, qy=ax, cx=x+qx*o, cy=y+qy*o;
    const P=[[f0,-w/2],[f1,-w/2],[f1,w/2],[f0,w/2],[f0,-w/2]].map(([u,v])=>ll(cx+ax*u+qx*v,cy+ay*u+qy*v));
    F.push({type:'Feature',properties:{c,b,h},geometry:{type:'Polygon',coordinates:[P]}}); };
  const snow=SNOW[seed%3];
  const ball=(zc,rad,n)=>{ const z0=Math.max(0,zc-rad), z1=zc+rad, dz=(z1-z0)/n;
    for(let i=0;i<n;i++){ const a=z0+i*dz, b=a+dz, m=(a+b)/2-zc, rr=Math.sqrt(Math.max(0,rad*rad-m*m)); disc(x,y,Math.max(.03,rr),a,b,snow,14); } };
  const R1=.42*k, R2=.3*k, R3=.21*k, Z1=.36*k, Z2=Z1+(R1+R2)*.8, Z3=Z2+(R2+R3)*.8;
  ball(Z1,R1,6); ball(Z2,R2,5); ball(Z3,R3,5);
  // face: coal eyes, carrot nose, a smile of coal bits
  for(const s of [-1,1]) box(R3*.72,R3*1.02,s*.075*k,.04*k,Z3+.05*k,Z3+.09*k,'#1b1c1f');
  box(R3*.8,R3+.17*k,0,.045*k,Z3-.02*k,Z3+.025*k,'#e8761f');
  box(R3+.1*k,R3+.17*k,0,.03*k,Z3-.01*k,Z3+.015*k,'#f08a2c');          // the tip, a bit lighter
  for(const s of [-2,-1,0,1,2]) box(R3*.8,R3*1.0,s*.045*k,.025*k,Z3-.09*k+Math.abs(s)*.015*k,Z3-.065*k+Math.abs(s)*.015*k,'#1b1c1f');
  // coal buttons down the middle ball
  for(const dz of [-.12,0,.12]){ const zz=Z2+dz*k, rr=Math.sqrt(Math.max(0,R2*R2-(zz-Z2)*(zz-Z2))); box(rr*.88,rr+.03*k,0,.045*k,zz-.025*k,zz+.02*k,'#1b1c1f'); }
  // stick arms, rising a little toward the hands, with a twig at each end
  for(const s of [-1,1]){ const ax=px*s, ay=py*s, up=hash(seed,s+5)<.5?1:0;
    box(R2*.7,R2+.28*k,0,.035*k,Z2+.06*k,Z2+.095*k,'#5a3d26',ax,ay);
    box(R2+.26*k,R2+.5*k,0,.03*k,Z2+.1*k+up*.06*k,Z2+.13*k+up*.06*k,'#5a3d26',ax,ay);
    box(R2+.42*k,R2+.5*k,.06*k*s,.025*k,Z2+.14*k+up*.06*k,Z2+.2*k+up*.06*k,'#5a3d26',ax,ay); }
  // scarf round the neck, one end hanging down the front
  const sc=SCARF[Math.floor(hash(seed,11)*SCARF.length)], zn=Z3-R3*.95;
  const rm=Math.sqrt(Math.max(0,R2*R2-(zn-Z2)*(zn-Z2)));          // the middle ball is still wide at the neck
  disc(x,y,Math.max(R3*.8,rm)+.025*k,zn-.05*k,zn+.05*k,sc,14);
  box(R2*.97,R2+.035*k,.07*k,.09*k,Z2-.06*k,zn,sc);
  // hat: a black top hat, or a knit cap with a pompom
  const top=Z3+R3*.85;
  if(hash(seed,13)<.6){ disc(x,y,R3*1.12,top,top+.025*k,'#141416',14); disc(x,y,R3*.72,top+.025*k,top+.26*k,'#1b1c1f',14);
    disc(x,y,R3*.74,top+.04*k,top+.075*k,hash(seed,17)<.5?'#8a1c22':'#1b1c1f',14); }
  else { const cc=CAP[Math.floor(hash(seed,19)*CAP.length)]; disc(x,y,R3*.95,top-.06*k,top+.02*k,'#ecebe6',14);
    disc(x,y,R3*.88,top+.02*k,top+.1*k,cc,14); disc(x,y,R3*.6,top+.1*k,top+.15*k,cc,12); disc(x,y,.06*k,top+.15*k,top+.24*k,'#f2f1ec',8); }
}

function build(){ safe('snowmen',()=>{ const src=map.getSource('snowmen'); if(!src) return;
  const reg=window.ROOFS&&ROOFS.doorsNear?ROOFS.doorsNear():[], F=[], keys=[];
  for(const r of reg){ if(!r.house||!r.yard) continue; const seed=(Math.floor(r.cx*1e5)^Math.floor(r.cy*1e5))>>>0;
    if(hash(seed,1)>=CHANCE) continue; keys.push(r.key);
    const Y=r.yard, k=.85+.3*hash(seed,3);
    snowman(F,r,Y.x,Y.y,Y.fx,Y.fy,k,seed);
    if(hash(seed,7)<.18){ const s=hash(seed,9)<.5?1:-1, d=.95+.25*hash(seed,21);   // a little one beside it
      snowman(F,r,Y.x-Y.fy*s*d,Y.y+Y.fx*s*d,Y.fx,Y.fy,.55+.1*hash(seed,23),seed^0x5bd1); } }
  const s=keys.join(';'); if(s===sig) return; sig=s; count=keys.length;
  last={type:'FeatureCollection',features:F}; src.setData(last); }); }
function clear(){ if(!on) return; on=false; sig=''; count=0; last=null; safe('snowmen off',()=>{ const s=map.getSource('snowmen'); if(s) s.setData(EMPTY); }); }

onReady(function snowmen(){ layer(); map.on('styledata',()=>{ if(!map.getLayer('snowmen')) layer(); }); });
onTick(1000,function snowmenTick(){
  const C=window.SNOWCOVER, inch=C?C.inches:0, want=forced!=null?forced:(on?inch>OFF:inch>ON)&&C.level>0;
  if(!want||mode==='glider'){ clear(); return; }
  on=true; build();
});
window.SNOWMEN={get count(){ return count; },build:()=>{ sig=''; build(); },force(v){ forced=v==null?null:!!v; sig=''; }};
})();
