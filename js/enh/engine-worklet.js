/* AudioWorklet engines (js/enh/sound.js picks one per vehicle). All synthesized — no recordings are used.
   Each engine is built from its own rhythm: every cylinder firing sends a smooth pressure pulse down its exhaust,
   which rings in a pipe resonance and is then muffled. To sound deep on a phone speaker (which can't play the low
   firing note itself), the pulses are kept smooth and periodic so the low harmonics carry the pitch, the pipe
   resonance stays low, the top end is rolled off, and a "body" low-boost is added. (The first versions used sharp,
   noisy pulses and bright pipes, which the owner said sounded like a chain saw — 2026-09-30.)
   Shared parameters (set from js/enh/sound.js):
     rpm   engine speed     load  throttle 0..1 (0 = coasting / overrun)     gain  master volume
     boost 0..1 (turbo engines) how hard the turbo is working */

// one exhaust "bank": a smooth firing pulse -> pipe resonance (state-variable filter) -> gentle saturation ->
// low-pass muffler -> DC removal -> low "body" boost
function bank(){ return {env:0,sm:0,amp:0,low:0,band:0,lp:0,dc:0,dcx:0,body:0}; }
function runBank(bk,c,noise){
  bk.env*=c.dec; bk.sm+=(bk.env-bk.sm)*c.atk;                   // rounded pulse: fast rise, slower fall (no click)
  const ex=bk.sm*bk.amp*(1+noise);
  bk.low+=c.f*bk.band; const hi=ex-bk.low-c.q*bk.band; bk.band+=c.f*hi;
  let y=bk.low*c.lowMix+bk.band*c.bandMix;
  y=Math.tanh(y*c.drive);
  bk.lp+=c.lpA*(y-bk.lp);
  const o=bk.lp-bk.dcx+.997*bk.dc; bk.dcx=bk.lp; bk.dc=o;
  bk.body+=c.bodyA*(o-bk.body);                                  // low shelf: add back the bottom end
  return o+bk.body*c.bodyGain;
}
// o: atkMs, decMs, periodMs (time between firings), fc, q, lowMix, bandMix, drive, lpHz, bodyHz, bodyGain.
// Pulses are kept shorter than the gap between firings, or at high revs they'd run together into a flat (silent) push.
function coefs(sr,o){
  const atkMs=Math.min(o.atkMs,.12*o.periodMs), decMs=Math.min(o.decMs,.3*o.periodMs);
  return {atk:1-Math.exp(-1/(atkMs*.001*sr)), dec:Math.exp(-1/(decMs*.001*sr)), f:2*Math.sin(Math.PI*o.fc/sr), q:o.q,
    lowMix:o.lowMix, bandMix:o.bandMix, drive:o.drive, lpA:1-Math.exp(-2*Math.PI*o.lpHz/sr),
    bodyA:1-Math.exp(-2*Math.PI*o.bodyHz/sr), bodyGain:o.bodyGain}; }
const silence=(L,R,n)=>{ for(let i=0;i<n;i++){ L[i]=0; if(R!==L) R[i]=0; } };

/* AMC Javelin: AMC 401 V8 with true dual exhaust. Cross-plane crank, firing order 1-8-4-3-6-5-7-2 -> uneven runs of
   pulses into each bank (L R R L R L L R): the V8 burble. A long-duration cam gives the idle lope (firing strength and
   engine speed wander at low rpm). Left bank plays left, right bank right. Overrun crackle when lifting at high revs. */
class AMC401 extends AudioWorkletProcessor{
  static get parameterDescriptors(){ return [
    {name:'rpm',defaultValue:700,minValue:300,maxValue:6500,automationRate:'k-rate'},
    {name:'load',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},
    {name:'gain',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'}]; }
  constructor(){ super(); this.ph=0; this.idx=0; this.order=[0,1,1,0,1,0,0,1];
    this.cylAmp=[1,.93,1.04,.88,1.02,.95,1.06,.9]; this.b=[bank(),bank()]; this.wob=0; this.seed=12345; this.pop=0; this.pl=0; }
  rnd(){ this.seed=(this.seed*1664525+1013904223)>>>0; return this.seed/4294967296; }
  process(_in,outputs,P){
    const out=outputs[0], L=out[0], R=out[1]||out[0], n=L.length, sr=sampleRate;
    const rpm0=P.rpm[0], load=P.load[0], gain=P.gain[0];
    if(gain<=1e-4){ silence(L,R,n); return true; }
    const idle=Math.max(0,1-(rpm0-650)/1400);
    const c=coefs(sr,{atkMs:1.1, decMs:5.5+6*idle, periodMs:15000/rpm0, fc:Math.min(760,150+rpm0*.045+load*190), q:.72, lowMix:1.8, bandMix:.16+.3*idle,
      drive:.75+load*.8+1.1*idle, lpHz:Math.min(1900,430+load*650+rpm0*.15), bodyHz:170, bodyGain:1.3});
    const lvl=.62+.4*load+.12*Math.min(1,rpm0/3500);
    for(let i=0;i<n;i++){
      this.wob+=(this.rnd()-.5)*.02; this.wob*=.9995;
      const rpm=rpm0*(1+idle*.045*Math.sin(this.wob*6)+idle*.02*this.wob);
      this.ph+=rpm/60*4/sr;                                    // four firings per crank revolution
      if(this.ph>=1){ this.ph-=1; this.idx=(this.idx+1)&7;
        const bk=this.b[this.order[this.idx]];
        let a=this.cylAmp[this.idx]*(.55+.6*load)*(1+(this.rnd()-.5)*(.14+.5*idle));
        if(idle>.4&&this.rnd()<.06*idle) a*=.45;               // a lazy cylinder now and then (big cam at idle)
        if(load<.05&&rpm0>2200&&this.rnd()<.02) this.pop=1;    // overrun crackle
        bk.env=1; bk.amp=a; }
      const nz=(this.rnd()-.5)*.12;
      const a0=runBank(this.b[0],c,nz), a1=runBank(this.b[1],c,-nz);
      let mixL=a0*.78+a1*.22, mixR=a1*.78+a0*.22;
      if(this.pop>0){ this.pl+=.25*((this.rnd()-.5)-this.pl); const p=this.pl*this.pop*1.4; mixL+=p; mixR+=p*.8; this.pop*=.992; if(this.pop<.01) this.pop=0; }
      L[i]=Math.tanh(mixL*lvl*1.6)*gain; if(R!==L) R[i]=Math.tanh(mixR*lvl*1.6)*gain;
    }
    return true;
  }
}
registerProcessor('amc401',AMC401);

/* Ford Explorer ST: 3.0 L twin-turbo EcoBoost V6 (60°, firing order 1-4-2-5-3-6: the banks fire strictly in turn, an
   even note, three firings per crank revolution). The turbines smooth the exhaust, so it's a smoother drone than the
   V8, with a quiet turbo whistle and whoosh rising with boost and a soft flutter when you lift. (The Navigator's
   3.5 L uses this voice through its own drivetrain.) */
class EcoBoost30 extends AudioWorkletProcessor{
  static get parameterDescriptors(){ return [
    {name:'rpm',defaultValue:650,minValue:300,maxValue:7000,automationRate:'k-rate'},
    {name:'load',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},
    {name:'boost',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},
    {name:'gain',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'}]; }
  constructor(){ super(); this.ph=0; this.idx=0; this.cylAmp=[1,.97,1.02,.99,1.01,.96]; this.b=[bank(),bank()];
    this.seed=987654; this.tph=0; this.wl=0; this.wb=0; this.prevBoost=0; this.bov=0; this.bl=0; this.bb=0; }
  rnd(){ this.seed=(this.seed*1664525+1013904223)>>>0; return this.seed/4294967296; }
  process(_in,outputs,P){
    const out=outputs[0], L=out[0], R=out[1]||out[0], n=L.length, sr=sampleRate;
    const rpm=P.rpm[0], load=P.load[0], boost=P.boost[0], gain=P.gain[0];
    if(gain<=1e-4){ silence(L,R,n); this.prevBoost=boost; return true; }
    if(this.prevBoost-boost>.08&&this.prevBoost>.35) this.bov=Math.min(1,this.prevBoost);
    this.prevBoost=boost;
    const c=coefs(sr,{atkMs:.9, decMs:4.2, periodMs:20000/rpm, fc:Math.min(950,175+rpm*.058+load*230), q:.66, lowMix:1.6, bandMix:.24,
      drive:.85+load*.7, lpHz:Math.min(2300,520+load*850+rpm*.19), bodyHz:190, bodyGain:1.1});
    const lvl=.55+.32*load+.15*Math.min(1,rpm/4500);
    const tf=2200+4200*boost, tw=2*Math.PI*tf/sr, wA=.006*boost*boost;
    const wf=2*Math.sin(Math.PI*Math.min(2200,600+700*boost)/sr), wAmp=.022*boost*(.3+.7*load);
    const bf=2*Math.sin(Math.PI*700/sr);
    for(let i=0;i<n;i++){
      this.ph+=rpm/60*3/sr;                                    // three firings per crank revolution
      if(this.ph>=1){ this.ph-=1; this.idx=(this.idx+1)%6;
        const bk=this.b[this.idx&1]; bk.env=1; bk.amp=this.cylAmp[this.idx]*(.5+.55*load)*(1+(this.rnd()-.5)*.06); }
      const nz=(this.rnd()-.5)*.1;
      const a0=runBank(this.b[0],c,nz), a1=runBank(this.b[1],c,-nz);
      const mixL=a0*.62+a1*.38, mixR=a1*.62+a0*.38;          // quad tips: wide but centred
      this.tph+=tw*(1+.004*Math.sin(this.tph*.0007)); if(this.tph>6.283185307) this.tph-=6.283185307;
      const nzz=this.rnd()-.5; this.wl+=wf*this.wb; const wh=nzz-this.wl-.6*this.wb; this.wb+=wf*wh;
      let s=Math.sin(this.tph)*wA+this.wb*wAmp;
      if(this.bov>0){ const flutter=.6+.4*Math.sin(i*2*Math.PI*24/sr+this.bov*40);
        this.bl+=bf*this.bb; const bh=(this.rnd()-.5)-this.bl-.8*this.bb; this.bb+=bf*bh;
        s+=this.bb*.06*this.bov*flutter; this.bov*=.99985; if(this.bov<.02) this.bov=0; }
      L[i]=(Math.tanh(mixL*lvl*1.7)+s)*gain; if(R!==L) R[i]=(Math.tanh(mixR*lvl*1.7)+s)*gain;
    }
    return true;
  }
}
registerProcessor('ecoboost30',EcoBoost30);

/* John Deere tractor: PowerTech 6.8 L inline-six turbo diesel (as in the 6R row-crop tractors). One bank, firing
   order 1-5-3-6-2-4, three firings per revolution, 850 rpm idle to ~2,100 rated. Out of one vertical stack, so it's
   mono and boomy: long, round pulses into a low stack resonance. On top: the diesel's combustion knock (a short
   "clatter" tick each firing, most noticeable at idle and light load), a low turbo whine and a governor that holds the
   engine speed (sound.js sets rpm from the throttle, not road speed — the IVT transmission does the rest). */
class JD68 extends AudioWorkletProcessor{
  static get parameterDescriptors(){ return [
    {name:'rpm',defaultValue:850,minValue:300,maxValue:2600,automationRate:'k-rate'},
    {name:'load',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},
    {name:'boost',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},
    {name:'gain',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'}]; }
  constructor(){ super(); this.ph=0; this.idx=0; this.cylAmp=[1,.95,1.03,.97,1.02,.94]; this.b=bank();
    this.seed=24680; this.k=0; this.kl=0; this.kb=0; this.tph=0; this.wob=0; }
  rnd(){ this.seed=(this.seed*1664525+1013904223)>>>0; return this.seed/4294967296; }
  process(_in,outputs,P){
    const out=outputs[0], L=out[0], R=out[1]||out[0], n=L.length, sr=sampleRate;
    const rpm0=P.rpm[0], load=P.load[0], boost=P.boost[0], gain=P.gain[0];
    if(gain<=1e-4){ silence(L,R,n); return true; }
    const c=coefs(sr,{atkMs:1.6, decMs:9, periodMs:20000/rpm0, fc:Math.min(430,80+rpm0*.075+load*110), q:.8, lowMix:2, bandMix:.12,
      drive:.9+load*.9, lpHz:Math.min(1300,380+load*420+rpm0*.18), bodyHz:150, bodyGain:1.5});
    const lvl=.55+.45*load+.1*Math.min(1,rpm0/2100);
    const kf=2*Math.sin(Math.PI*1050/sr), kDec=Math.exp(-1/(.0028*sr)), kAmt=.2*(1-.55*load)*(.6+.4*Math.max(0,1-(rpm0-850)/1300));
    const tw=2*Math.PI*(1300+1900*boost)/sr, tA=.004*boost;
    for(let i=0;i<n;i++){
      this.wob+=(this.rnd()-.5)*.01; this.wob*=.9993;            // the governor hunts a little
      const rpm=rpm0*(1+.006*this.wob);
      this.ph+=rpm/60*3/sr;
      if(this.ph>=1){ this.ph-=1; this.idx=(this.idx+1)%6;
        this.b.env=1; this.b.amp=this.cylAmp[this.idx]*(.55+.65*load)*(1+(this.rnd()-.5)*.08);
        this.k=kAmt*(.8+.4*this.rnd()); }                        // combustion knock
      let y=runBank(this.b,c,(this.rnd()-.5)*.1);
      // knock: a short ringing tick (band-passed noise around 1 kHz), kept low so it reads as clatter, not hiss
      const kn=(this.rnd()-.5)*this.k; this.k*=kDec;
      this.kl+=kf*this.kb; const kh=kn-this.kl-.35*this.kb; this.kb+=kf*kh;
      this.tph+=tw; if(this.tph>6.283185307) this.tph-=6.283185307;
      y=Math.tanh(y*lvl*1.7)+this.kb*.55+Math.sin(this.tph)*tA;
      L[i]=y*gain; if(R!==L) R[i]=y*gain;
    }
    return true;
  }
}
registerProcessor('jd68',JD68);
