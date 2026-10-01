/* AudioWorklet engines (js/enh/sound.js picks one per car).
   AMC Javelin: a synthesized AMC 401 V8 with true dual exhaust (no recording is used — it's built from the engine's
   own rhythm). Each cylinder firing sends a pressure pulse down its bank's pipe; the 1-8-4-3-6-5-7-2 firing order
   puts uneven runs of pulses into each bank (L R R L R L L R), which is what gives a cross-plane V8 its burble.
   A long-duration cam makes the idle lope: the firing strength wanders cylinder to cylinder at low rpm.
   Left bank plays left, right bank right. Parameters (set from js/enh/sound.js):
     rpm   engine speed           load  throttle 0..1 (0 = coasting / overrun)        gain  master volume */
class AMC401 extends AudioWorkletProcessor{
  static get parameterDescriptors(){ return [
    {name:'rpm',defaultValue:700,minValue:300,maxValue:6500,automationRate:'k-rate'},
    {name:'load',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},
    {name:'gain',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'}]; }
  constructor(){
    super();
    this.ph=0; this.idx=0;
    this.order=[0,1,1,0,1,0,0,1];                          // banks for firing order 1-8-4-3-6-5-7-2 (odd = left on an AMC V8)
    this.cylAmp=[1,.93,1.04,.88,1.02,.95,1.06,.9];          // small cylinder-to-cylinder differences
    this.b=[0,1].map(()=>({env:0,amp:0,low:0,band:0,lp:0,dc:0,dcx:0}));
    this.wob=0; this.seed=12345; this.pop=0;
  }
  rnd(){ this.seed=(this.seed*1664525+1013904223)>>>0; return this.seed/4294967296; }
  process(_in,outputs,P){
    const out=outputs[0], L=out[0], R=out[1]||out[0], n=L.length, sr=sampleRate;
    const rpm0=P.rpm[0], load=P.load[0], gain=P.gain[0];
    if(gain<=1e-4){ for(let i=0;i<n;i++){ L[i]=0; if(R!==L) R[i]=0; } return true; }
    const idle=Math.max(0,1-(rpm0-650)/1400);                // 1 at idle, 0 above ~2000 rpm
    // muffler / pipe colour: dark and thumpy at idle, opening up with rpm and throttle
    const fc=Math.min(1900,150+rpm0*.11+load*650+(1-load)*rpm0*.02), f=2*Math.sin(Math.PI*fc/sr), q=.55;
    const tau=(.0035+.004*idle)*sr, dec=Math.exp(-1/tau);
    const lpA=1-Math.exp(-2*Math.PI*Math.min(5200,900+load*2600+rpm0*.35)/sr);
    const drive=.9+load*1.6, lvl=.6+.45*load+.12*Math.min(1,rpm0/3500);   // louder with throttle and revs
    for(let i=0;i<n;i++){
      // the lope: engine speed itself wanders a little at idle
      this.wob+=(this.rnd()-.5)*.02; this.wob*=.9995;
      const rpm=rpm0*(1+idle*.045*Math.sin(this.wob*6)+idle*.02*this.wob);
      this.ph+=rpm/60*4/sr;                                    // four firings per crank revolution
      if(this.ph>=1){ this.ph-=1; this.idx=(this.idx+1)&7;
        const k=this.order[this.idx], bk=this.b[k];
        let a=this.cylAmp[this.idx]*(.55+.6*load)*(1+(this.rnd()-.5)*(.18+.55*idle));
        if(idle>.4&&this.rnd()<.06*idle) a*=.45;               // a lazy cylinder now and then (big cam at idle)
        if(load<.05&&rpm0>2200&&this.rnd()<.02) this.pop=1;    // overrun crackle when lifting at high revs
        bk.env=1; bk.amp=a; }
      let mixL=0, mixR=0;
      for(let k=0;k<2;k++){ const bk=this.b[k];
        const ex=bk.env*bk.amp*(.75+.5*(this.rnd()-.5)); bk.env*=dec;
        bk.low+=f*bk.band; const hi=ex-bk.low-q*bk.band; bk.band+=f*hi;   // pipe resonance (state-variable filter)
        let y=bk.low*1.6+bk.band*.35;
        y=Math.tanh(y*drive)*.9;                               // pipes break up a little under load
        bk.lp+=lpA*(y-bk.lp);
        const o=bk.lp-bk.dcx+.995*bk.dc; bk.dcx=bk.lp; bk.dc=o;   // remove DC
        if(k===0){ mixL+=o*.78; mixR+=o*.22; } else { mixR+=o*.78; mixL+=o*.22; } }
      if(this.pop>0){ const p=(this.rnd()-.5)*this.pop*.9; mixL+=p; mixR+=p*.8; this.pop*=.992; if(this.pop<.01) this.pop=0; }
      L[i]=Math.tanh(mixL*lvl*2)*gain; if(R!==L) R[i]=Math.tanh(mixR*lvl*2)*gain;
    }
    return true;
  }
}
registerProcessor('amc401',AMC401);

/* Ford Explorer ST: 3.0 L twin-turbo EcoBoost V6 (60°, firing order 1-4-2-5-3-6, so the banks fire strictly in turn
   and the note is smooth and even — three firings per crank revolution). The turbines soak up the sharp edges of
   the exhaust pulses, so it's a smoother, raspier drone than the V8, with the turbos' whistle and whoosh rising with
   boost and a soft flutter from the recirculating valves when you lift. Extra parameter:
     boost  0..1, how hard the turbos are working (spools up and down with a lag, set by sound.js) */
class EcoBoost30 extends AudioWorkletProcessor{
  static get parameterDescriptors(){ return [
    {name:'rpm',defaultValue:650,minValue:300,maxValue:7000,automationRate:'k-rate'},
    {name:'load',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},
    {name:'boost',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},
    {name:'gain',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'}]; }
  constructor(){
    super();
    this.ph=0; this.idx=0; this.cylAmp=[1,.97,1.02,.99,1.01,.96];
    this.b=[0,1].map(()=>({env:0,amp:0,low:0,band:0,lp:0,dc:0,dcx:0}));
    this.seed=987654; this.tph=0; this.wl=0; this.wb=0; this.prevBoost=0; this.bov=0; this.bl=0; this.bb=0; this.hum=0;
  }
  rnd(){ this.seed=(this.seed*1664525+1013904223)>>>0; return this.seed/4294967296; }
  process(_in,outputs,P){
    const out=outputs[0], L=out[0], R=out[1]||out[0], n=L.length, sr=sampleRate;
    const rpm=P.rpm[0], load=P.load[0], boost=P.boost[0], gain=P.gain[0];
    if(gain<=1e-4){ for(let i=0;i<n;i++){ L[i]=0; if(R!==L) R[i]=0; } this.prevBoost=boost; return true; }
    // recirculating valve: a quick drop in boost (lifting off) gives a short soft flutter
    if(this.prevBoost-boost>.08&&this.prevBoost>.35) this.bov=Math.min(1,this.prevBoost);
    this.prevBoost=boost;
    const fc=Math.min(2600,230+rpm*.17+load*520), f=2*Math.sin(Math.PI*fc/sr), q=.5;
    const dec=Math.exp(-1/(.0022*sr));                          // short pulses: turbines smooth the exhaust
    const lpA=1-Math.exp(-2*Math.PI*Math.min(6000,1300+load*1800+rpm*.4)/sr);
    const drive=1+load*1.2, lvl=.5+.35*load+.15*Math.min(1,rpm/4500);
    // turbo whistle and intake whoosh
    const tf=2400+5200*boost, tw=2*Math.PI*tf/sr, wA=.018*boost*boost;
    const wf=2*Math.sin(Math.PI*Math.min(3000,700+900*boost)/sr), wAmp=.05*boost*(.3+.7*load);
    const bf=2*Math.sin(Math.PI*900/sr);
    for(let i=0;i<n;i++){
      this.ph+=rpm/60*3/sr;                                    // three firings per crank revolution
      if(this.ph>=1){ this.ph-=1; this.idx=(this.idx+1)%6;
        const bk=this.b[this.idx&1];                           // banks alternate every firing
        bk.env=1; bk.amp=this.cylAmp[this.idx]*(.5+.55*load)*(1+(this.rnd()-.5)*.08); }
      let mixL=0, mixR=0;
      for(let k=0;k<2;k++){ const bk=this.b[k];
        const ex=bk.env*bk.amp*(.8+.4*(this.rnd()-.5)); bk.env*=dec;
        bk.low+=f*bk.band; const hi=ex-bk.low-q*bk.band; bk.band+=f*hi;
        let y=bk.low*1.3+bk.band*.55;                          // more mid-range "rasp" than the V8
        y=Math.tanh(y*drive)*.85;
        bk.lp+=lpA*(y-bk.lp);
        const o=bk.lp-bk.dcx+.995*bk.dc; bk.dcx=bk.lp; bk.dc=o;
        if(k===0){ mixL+=o*.62; mixR+=o*.38; } else { mixR+=o*.62; mixL+=o*.38; } }   // quad tips: wide but centred
      // whistle (with a little wobble) and whoosh (band-passed noise)
      this.tph+=tw*(1+.004*Math.sin(this.tph*.0007)); if(this.tph>6.283185307) this.tph-=6.283185307;
      const whistle=Math.sin(this.tph)*wA;
      const nz=this.rnd()-.5; this.wl+=wf*this.wb; const wh=nz-this.wl-.6*this.wb; this.wb+=wf*wh;
      let s=whistle+this.wb*wAmp;
      if(this.bov>0){ const flutter=.6+.4*Math.sin(i*2*Math.PI*28/sr+this.bov*40);
        this.bl+=bf*this.bb; const bh=(this.rnd()-.5)-this.bl-.8*this.bb; this.bb+=bf*bh;
        s+=this.bb*.09*this.bov*flutter; this.bov*=.99985; if(this.bov<.02) this.bov=0; }
      L[i]=(Math.tanh(mixL*lvl*2)+s)*gain; if(R!==L) R[i]=(Math.tanh(mixR*lvl*2)+s)*gain;
    }
    return true;
  }
}
registerProcessor('ecoboost30',EcoBoost30);
