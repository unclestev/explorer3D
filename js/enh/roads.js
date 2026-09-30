/* Road markings, bridges, rivers and creeks. */
(()=>{
'use strict';
const {ENH,EMPTY,PXM,UNDER,mz,mzE,safe,addUnder,srcName,img,addImg,onReady,onTick,psd,polyDist,segX,abbr,post,octa,rrect,ISZ,BILL}=YD;

/* ---------- 1. ROAD MARKINGS, BRIDGES, RIVERS ---------- */
// Real-world road widths. The map style draws roads at a fixed screen width that stops growing past zoom 20, so at
// the chase camera a residential street was only ~1.4 m wide and service roads under 1 m: the ground texture then
// looked as if it had grown over them. Width (m) per road kind, for the road and a slightly wider edge (casing).
// Runs before everything else here, so bridge railings and the asphalt texture pick up these widths.
const ROAD_W=[[/motorway_link|(^|_)link/,6],[/service_track/,4.5],[/path_pedestrian/,2.5],[/secondary_tertiary/,10],
  [/trunk_primary/,12],[/motorway/,14],[/minor|street/,8]];
onReady(function realRoadWidths(){
  for(const l of map.getStyle().layers){
    if(l['source-layer']!=='transportation'||l.type!=='line'||!/^(road|bridge|tunnel)_/.test(l.id)||/rail|hatching|transit|arrow/.test(l.id)) continue;
    const hit=ROAD_W.find(([re])=>re.test(l.id)); if(!hit) continue;
    const casing=/_casing$/.test(l.id), m=hit[1]+(casing?1.4:0);
    safe('road width',()=>map.setPaintProperty(l.id,'line-width',mz(m,casing?1.5:1)));
  }
});

onReady(function roadsAndWater(){
  const src=srcName(), all=map.getStyle().layers, ids=all.map(l=>l.id);
  const after=id=>{ const i=ids.indexOf(id); return i>=0&&i+1<ids.length?ids[i+1]:undefined; };
  // water: deeper blue, visible creeks, a light shoreline
  const RIV='#3b8de0';
  safe('water',()=>{ if(map.getLayer('water')) map.setPaintProperty('water','fill-color','#69acec'); });
  safe('rivers',()=>{ if(map.getLayer('waterway_river')){ map.setPaintProperty('waterway_river','line-color',RIV); map.setPaintProperty('waterway_river','line-width',mz(14,1.5)); } });
  safe('creeks',()=>{ if(map.getLayer('waterway_other')){ map.setPaintProperty('waterway_other','line-color',RIV);
    map.setPaintProperty('waterway_other','line-width',mzE(['match',['get','class'],'canal',8,'stream',3.5,['ditch','drain'],1.5,2.5])); } });
  safe('shore',()=>{ if(map.getLayer('water')&&!map.getLayer('water-shore')) map.addLayer({id:'water-shore',type:'line',source:src,'source-layer':'water',
    paint:{'line-color':'#e0f2fe','line-opacity':.85,'line-width':['interpolate',['linear'],['zoom'],12,.5,18,2.5]}},after('water')); });

  // lane and centre lines (US style): double yellow on two-way major roads, dashed yellow on two-way
  // collectors, dashed white lane lines on one-way carriageways. Residential streets stay unmarked, like the real ones.
  safe('markings',()=>{
    const oneway=['coalesce',['get','oneway'],0], two=['==',oneway,0], one=['!=',oneway,0];
    const base=['all',['==',['geometry-type'],'LineString'],['!=',['coalesce',['get','brunnel'],''],'tunnel'],['!=',['coalesce',['get','ramp'],0],1]];
    const cls=l=>['match',['get','class'],l,true,false];
    const L=(id,filter,paint)=>addUnder({id,type:'line',source:src,'source-layer':'transportation',minzoom:15,filter:base.concat([filter[0],filter[1]]),
      layout:{'line-cap':'butt','line-join':'round'},paint:Object.assign({'line-width':mz(.16,.8)},paint)});
    const Y='#f2c230', W='#f8fafc', DASH=[20,60];                 // 3 m dash, 9 m gap at 0.16 m line width
    L('mk-dy-l',[two,cls(['trunk','primary','secondary'])],{'line-color':Y,'line-offset':mz(-.22)});
    L('mk-dy-r',[two,cls(['trunk','primary','secondary'])],{'line-color':Y,'line-offset':mz(.22)});
    L('mk-cy',[two,cls(['tertiary'])],{'line-color':Y,'line-dasharray':DASH});
    L('mk-lane',[one,cls(['motorway','trunk','primary','secondary'])],{'line-color':W,'line-dasharray':DASH});
  });

  // bridges: a soft shadow around the deck and a railing along each edge, sized from the style's own deck width
  safe('bridges',()=>{
    const firstBridge=(all.find(l=>/^bridge_/.test(l.id))||{}).id;
    all.filter(l=>/^bridge_.*_casing$/.test(l.id)&&!/path_pedestrian/.test(l.id)&&l.type==='line'&&l.paint&&l.paint['line-width']).forEach(l=>{
      const c={type:'line',source:l.source,'source-layer':l['source-layer'],minzoom:Math.max(l.minzoom||0,13)};
      if(l.filter) c.filter=l.filter; if(l.maxzoom) c.maxzoom=l.maxzoom;
      if(!map.getLayer(l.id+'-shadow')) map.addLayer(Object.assign({},c,{id:l.id+'-shadow',
        paint:{'line-color':'#0f172a','line-opacity':.35,'line-gap-width':l.paint['line-width'],'line-width':mz(3,2),'line-blur':mz(3,2)}}),firstBridge);
      addUnder(Object.assign({},c,{id:l.id+'-rail',layout:{'line-cap':'butt','line-join':'round'},
        paint:{'line-color':'#475569','line-gap-width':l.paint['line-width'],'line-width':mz(.45,1.2)}}));
    });
  });
});
})();
