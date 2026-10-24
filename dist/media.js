/* Ember Corridor: original procedural score, layered foley and presentation-only motion. */
(function(root){
  'use strict';
  const KEY='ember-corridor.media.v1';
  const defaults={music:true,effects:true,muted:false,musicVolume:.28,effectsVolume:.7,motion:'auto'};
  const themes={
    explore:{name:'雾枝间的微光',bpm:66,level:.85,pad:1,pluck:.55,beat:.08},
    battle:{name:'余火交锋',bpm:98,level:.85,pad:.65,pluck:.8,beat:.55},
    boss:{name:'灰冠之下',bpm:116,level:.82,pad:.8,pluck:.85,beat:.82},
    rest:{name:'未熄的营火',bpm:60,level:.82,pad:1,pluck:.4,beat:0},
    shop:{name:'林间行商',bpm:82,level:.8,pad:.55,pluck:.8,beat:.15},
    victory:{name:'余烬仍有回声',bpm:88,level:.8,pad:.8,pluck:.7,beat:.12},
    defeat:{name:'提灯熄灭之后',bpm:54,level:.72,pad:1,pluck:.3,beat:0}
  };
  const motifs={
    explore:[12,null,7,10,null,7,3,null,10,null,7,5,null,3,2,null],
    battle:[0,7,12,10,7,null,3,7,0,7,14,12,10,7,3,null],
    boss:[0,0,7,12,10,7,3,2,0,7,15,14,12,10,7,2],
    rest:[12,null,null,7,null,10,null,null,7,null,3,null,5,null,2,null],
    shop:[12,null,7,3,10,null,7,null,14,null,10,7,5,3,2,null],
    victory:[12,null,16,19,24,null,19,null,16,null,14,12,7,null,12,null],
    defeat:[7,null,null,null,3,null,2,null,0,null,null,null,-2,null,-5,null]
  };
  const minorChords=[[0,3,7,10],[-4,0,3,7],[-2,2,5,9],[-5,-2,2,5]];
  const majorChords=[[0,4,7,11],[-5,0,4,7],[-2,2,5,9],[-7,-3,0,4]];
  const hz=midi=>440*Math.pow(2,(midi-69)/12);
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
  function create(){
    let prefs={...defaults},storageError=false;
    try{
      const raw=root.localStorage.getItem(KEY),saved=raw&&raw.length<4096?JSON.parse(raw):null;
      if(saved&&typeof saved==='object'){
        for(const k of ['music','effects','muted'])if(typeof saved[k]==='boolean')prefs[k]=saved[k];
        for(const k of ['musicVolume','effectsVolume'])if(typeof saved[k]==='number'&&Number.isFinite(saved[k]))prefs[k]=clamp(saved[k],0,1);
        if(['auto','full','reduced','off'].includes(saved.motion))prefs.motion=saved.motion;
      }
    }catch(_){storageError=true;}
    const reduced=root.matchMedia('(prefers-reduced-motion: reduce)');
    let ctx,master,musicBus,fxBus,noiseBuffer,timer=null,layer=null,layers=new Set();
    let unlocked=false,error='',desired={kind:'explore',floor:1},noiseSeed=0x7123a9c5;
    let disposed=false,lastUi=0,sceneKey='',knownHand=new Set();
    const voices=new Set(),animations=new Set(),retireTimers=new Set(),pulses=new WeakMap();
    const motion=()=>prefs.motion==='auto'?(reduced.matches?'reduced':'full'):prefs.motion;
    const active=()=>!prefs.muted&&(prefs.music&&prefs.musicVolume>0||prefs.effects&&prefs.effectsVolume>0);
    function notify(){
      if(root.document.body){root.document.body.dataset.motion=motion();root.document.body.dataset.audio=active()?'on':'off';root.document.body.dataset.mediaPaused=String(root.document.hidden);}
      root.document.dispatchEvent(new CustomEvent('ember:media-state'));
    }
    function trim(record){
      voices.delete(record);for(const node of record.nodes){try{node.disconnect();}catch(_){}}
    }
    function stopVoice(record){try{record.source.stop();}catch(_){}trim(record);}
    function clearVoices(predicate){for(const v of [...voices])if(!predicate||predicate(v))stopVoice(v);}
    function ramp(param,value,seconds=.12){
      if(!ctx)return;param.cancelScheduledValues(ctx.currentTime);param.setValueAtTime(param.value,ctx.currentTime);param.linearRampToValueAtTime(value,ctx.currentTime+seconds);
    }
    function mix(){
      if(!ctx)return;
      ramp(master.gain,prefs.muted?0:.75);
      ramp(musicBus.gain,prefs.music?prefs.musicVolume:0);
      ramp(fxBus.gain,prefs.effects?prefs.effectsVolume:0);
    }
    function init(){
      if(ctx)return;
      const Audio=root.AudioContext||root.webkitAudioContext;if(!Audio)throw new Error('unsupported');
      ctx=new Audio({latencyHint:'interactive'});
      master=ctx.createGain();musicBus=ctx.createGain();fxBus=ctx.createGain();
      const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-16;limiter.knee.value=18;limiter.ratio.value=5;limiter.attack.value=.004;limiter.release.value=.16;
      const warmth=ctx.createBiquadFilter();warmth.type='lowpass';warmth.frequency.value=4800;warmth.Q.value=.35;
      musicBus.connect(warmth).connect(master);fxBus.connect(master);master.connect(limiter).connect(ctx.destination);
      master.gain.value=prefs.muted?0:.75;musicBus.gain.value=prefs.music?prefs.musicVolume:0;fxBus.gain.value=prefs.effects?prefs.effectsVolume:0;
      noiseBuffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate),ctx.sampleRate);
      const samples=noiseBuffer.getChannelData(0);
      for(let i=0;i<samples.length;i++){noiseSeed^=noiseSeed<<13;noiseSeed^=noiseSeed>>>17;noiseSeed^=noiseSeed<<5;samples[i]=((noiseSeed>>>0)/4294967295)*2-1;}
      const reverb=ctx.createConvolver(),impulse=ctx.createBuffer(2,Math.ceil(ctx.sampleRate*1.7),ctx.sampleRate),wet=ctx.createGain();
      for(let c=0;c<2;c++){const data=impulse.getChannelData(c);for(let i=0;i<data.length;i++)data[i]=samples[(i*13+c*941)%samples.length]*Math.pow(1-i/data.length,2)*.3;}
      reverb.buffer=impulse;wet.gain.value=.22;warmth.connect(reverb).connect(wet).connect(master);
      ctx.addEventListener('statechange',()=>{if(ctx.state!=='running')stopMusic();else if(unlocked&&!root.document.hidden)startMusic();notify();});
    }
    function oscillator(bus,start,freq,duration,volume,type='sine',slide=0,attack=.005,group='fx'){
      if(!ctx||voices.size>=72||group==='fx'&&[...voices].filter(v=>v.group==='fx').length>=28)return;
      const source=ctx.createOscillator(),gain=ctx.createGain(),record={source,nodes:[source,gain],group,bus};
      source.type=type;source.frequency.setValueAtTime(Math.max(20,freq),start);
      if(slide)source.frequency.exponentialRampToValueAtTime(Math.max(20,slide),start+duration);
      const peak=clamp(volume,0,.4),a=Math.min(attack,duration*.4);
      gain.gain.setValueAtTime(.0001,start);gain.gain.linearRampToValueAtTime(peak,start+a);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
      source.connect(gain).connect(bus);voices.add(record);source.onended=()=>trim(record);source.start(start);source.stop(start+duration+.02);
    }
    function noise(bus,start,duration,volume,cutoff=1500,filterType='lowpass',group='fx'){
      if(!ctx||voices.size>=72||group==='fx'&&[...voices].filter(v=>v.group==='fx').length>=28)return;
      const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain(),record={source,nodes:[source,filter,gain],group,bus};
      source.buffer=noiseBuffer;filter.type=filterType;filter.frequency.value=cutoff;filter.Q.value=.7;
      gain.gain.setValueAtTime(.0001,start);gain.gain.linearRampToValueAtTime(clamp(volume,0,.25),start+.003);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
      source.connect(filter).connect(gain).connect(bus);voices.add(record);source.onended=()=>trim(record);source.start(start);source.stop(start+duration+.02);
    }
    function stopMusic(){
      if(timer!==null){root.clearInterval(timer);timer=null;}
      clearVoices(v=>v.group==='music');
      for(const bus of layers){try{bus.disconnect();}catch(_){}}
      layers.clear();layer=null;
      for(const id of retireTimers)root.clearTimeout(id);retireTimers.clear();
    }
    function retire(old){
      ramp(old.bus.gain,0,.8);
      const id=root.setTimeout(()=>{retireTimers.delete(id);clearVoices(v=>v.bus===old.bus);layers.delete(old.bus);try{old.bus.disconnect();}catch(_){}},950);
      retireTimers.add(id);
    }
    function newLayer(){
      if(layer)retire(layer);
      const bus=ctx.createGain();bus.gain.value=.0001;bus.connect(musicBus);layers.add(bus);
      layer={...desired,bus,step:0,next:ctx.currentTime+.055};ramp(bus.gain,1,.9);
    }
    function score(part,step,time){
      const theme=themes[part.kind],beat=60/theme.bpm,bar=Math.floor(step/8),tick=step%8,rootNote=50+[0,2,-2,5,7][part.floor-1];
      const chords=part.kind==='victory'?majorChords:minorChords,chord=chords[Math.floor(bar/2)%chords.length],gain=theme.level;
      if(tick===0){
        for(let i=0;i<3;i++){
          oscillator(part.bus,time,hz(rootNote+chord[i]-12),beat*4.8,.024*theme.pad*gain,'sine',0,.32,'music');
          oscillator(part.bus,time+.015,hz(rootNote+chord[i]),beat*4.2,.008*theme.pad*gain,'triangle',0,.3,'music');
        }
        oscillator(part.bus,time,hz(rootNote+chord[0]-24),beat*2.8,.042*gain,'sine',0,.08,'music');
      }
      const note=motifs[part.kind][step%16];
      if(note!==null){
        const pitch=rootNote+12+note+(Math.floor(step/16)%2?-12:0);
        oscillator(part.bus,time,hz(pitch),beat*1.1,.025*theme.pluck*gain,'triangle',0,.012,'music');
        oscillator(part.bus,time+.006,hz(pitch+12),beat*.7,.008*theme.pluck*gain,'sine',0,.006,'music');
      }
      if((part.kind==='battle'||part.kind==='boss')&&tick%2===0)
        oscillator(part.bus,time,hz(rootNote+chord[(tick/2)%3]-12),beat*.4,.024*gain,'triangle',0,.004,'music');
      if(theme.beat){
        if(tick===0||tick===4)oscillator(part.bus,time,105, .18,.09*theme.beat,'sine',38,.002,'music');
        if(tick===2||tick===6)noise(part.bus,time,.11,.035*theme.beat,1700,'bandpass','music');
        if(tick%2===1)noise(part.bus,time,.035,.018*theme.beat,5200,'highpass','music');
      }
    }
    function schedule(){
      if(!layer||ctx.state!=='running')return;
      const duration=30/themes[layer.kind].bpm;
      if(layer.next<ctx.currentTime-.25)layer.next=ctx.currentTime+.03;
      let count=0;while(layer.next<ctx.currentTime+.22&&count++<4){score(layer,layer.step,layer.next);layer.step=(layer.step+1)%64;layer.next+=duration;}
    }
    function startMusic(){
      if(disposed||!ctx||ctx.state!=='running'||!unlocked||root.document.hidden||!prefs.music||prefs.muted||prefs.musicVolume===0)return;
      if(!layer)newLayer();if(timer===null){schedule();timer=root.setInterval(schedule,90);}
    }
    function scene(kind,floor=1){
      const next={kind:Object.hasOwn(themes,kind)?kind:'explore',floor:clamp(Math.trunc(floor)||1,1,5)};
      if(next.kind===desired.kind&&next.floor===desired.floor)return;
      desired=next;if(layer&&ctx?.state==='running'&&!root.document.hidden&&!prefs.muted&&prefs.music)newLayer();startMusic();notify();
    }
    function unlock(event){
      if(disposed||event&&!event.isTrusted||root.document.hidden||!active())return;
      try{
        init();const resumed=ctx.resume();
        Promise.resolve(resumed).then(()=>{if(disposed)return;unlocked=ctx.state==='running';error='';startMusic();notify();}).catch(()=>{error='点一下声音面板重试开启';notify();});
      }catch(_){error='此浏览器暂时无法播放声音';notify();}
    }
    function set(patch){
      for(const k of ['music','effects','muted'])if(typeof patch[k]==='boolean')prefs[k]=patch[k];
      for(const k of ['musicVolume','effectsVolume'])if(typeof patch[k]==='number'&&Number.isFinite(patch[k]))prefs[k]=clamp(patch[k],0,1);
      if(['auto','full','reduced','off'].includes(patch.motion))prefs.motion=patch.motion;
      try{root.localStorage.setItem(KEY,JSON.stringify(prefs));storageError=false;}catch(_){storageError=true;}
      mix();if(!prefs.music||prefs.muted||!prefs.musicVolume)stopMusic();else startMusic();
      if(!prefs.effects||prefs.muted)clearVoices(v=>v.group==='fx');
      if(motion()!=='full')for(const animation of [...animations])animation.cancel();
      notify();
    }
    function sfx(kind,options={}){
      if(disposed||!ctx||!unlocked||ctx.state!=='running'||root.document.hidden||prefs.muted||!prefs.effects||!prefs.effectsVolume)return;
      const t=ctx.currentTime+.004,intensity=clamp(options.strength||1,.5,2);
      const note=(freq,duration=.12,gain=.07,type='sine',delay=0,slide=0)=>oscillator(fxBus,t+delay,freq,duration,gain,type,slide);
      const dust=(duration=.12,gain=.06,cutoff=2200,delay=0,filter='bandpass')=>noise(fxBus,t+delay,duration,gain,cutoff,filter);
      const chime=(notes,level=.045)=>notes.forEach((n,i)=>{note(hz(n),.5,level,'sine',i*.065);note(hz(n+12),.25,level*.22,'triangle',i*.065);});
      switch(kind){
        case 'ui': if(t-lastUi<.075)return;lastUi=t;note(640,.045,.025,'triangle',0,380);break;
        case 'select':dust(.075,.04,3200);note(420,.09,.04,'triangle',.02,560);break;
        case 'rotate':note(760,.04,.035,'triangle',0,1040);note(380,.045,.018,'sine',.025);break;
        case 'card':dust(.14,.075,2200);note(180,.12,.025,'triangle',0,330);break;
        case 'draw':for(let i=0;i<Math.min(4,options.count||2);i++)dust(.055,.028,3000+i*350,i*.045);break;
        case 'hit':dust(.14,.1*intensity,1800);note(140,.19,.1,'triangle',0,48);note(720,.07,.045,'sine',.018,250);if(options.broken)chime([81,86],.025);break;
        case 'heavy':dust(.25,.15,950);note(92,.34,.16,'sine',0,28);note(190,.18,.06,'sawtooth',.025,44);break;
        case 'armor':dust(.18,.07,4200);[610,1031,1727].forEach((f,i)=>note(f,.25,.035,'triangle',i*.01));break;
        case 'block':note(370,.3,.075,'sine');note(740,.22,.04,'triangle',.015);dust(.045,.04,3800);break;
        case 'hurt':note(105,.25,.12,'triangle',0,36);dust(.18,.085,750);break;
        case 'break':dust(.3,.13,1350);note(80,.35,.12,'sawtooth',0,28);break;
        case 'shield':chime([62,69,74],.045);note(185,.4,.055,'sine',0,370);break;
        case 'heal':chime([74,81,86,89],.045);dust(.4,.016,2800,.08,'lowpass');break;
        case 'boost':chime([62,69,74,81,86],.045);note(180,.35,.045,'triangle',0,540);break;
        case 'turn':note(140,.16,.07,'sine',0,65);note(280,.1,.035,'triangle',.09);dust(.08,.03,1700,.11);break;
        case 'enemy':dust(.28,.055,1000);note(110,.3,.04,'triangle',0,65);break;
        case 'burn':dust(.25,.055,2500);note(190,.11,.025,'triangle',.03,70);break;
        case 'bleed':note(480,.09,.045,'sine',0,140);note(240,.12,.03,'sine',.06,80);break;
        case 'rupture':dust(.06,.075,3600);note(960,.12,.035,'triangle',.01,240);break;
        case 'sinking':note(220,.6,.05,'sine',0,70);note(330,.5,.025,'sine',.04,110);break;
        case 'tremor':note(65,.4,.08,'sine',0,35);dust(.3,.045,450,0,'lowpass');break;
        case 'move':for(let i=0;i<3;i++){dust(.065,.028,650,i*.14,'lowpass');note(110,.06,.02,'sine',i*.14,70);}break;
        case 'grapple':dust(.25,.065,2200);note(230,.25,.045,'triangle',0,960);note(760,.09,.04,'sine',.18);break;
        case 'glide':dust(.7,.045,1200,0,'lowpass');chime([74,81,86],.03);break;
        case 'coin':chime([88,93,100],.035);break;
        case 'relic':chime([62,69,74,81,86,93],.045);break;
        case 'upgrade':chime([69,74,78,81,86],.045);break;
        case 'victory':chime([62,66,69,74,78,81],.05);break;
        case 'defeat':chime([62,57,53,50],.045);break;
        case 'error':note(165,.08,.05,'triangle');note(147,.13,.04,'triangle',.09);break;
        default:note(440,.07,.025,'sine');
      }
    }

    function animate(element,frames,options={}){
      if(disposed||!element||!element.animate||motion()==='off'||root.document.hidden)return null;
      const previous=pulses.get(element);if(previous)previous.cancel();
      const keyframes=motion()==='reduced'?frames.map((f,i)=>({opacity:f.opacity??(i?1:.7)})):frames;
      const animation=element.animate(keyframes,{duration:motion()==='reduced'?150:320,easing:'cubic-bezier(.2,.75,.25,1)',...options});
      animations.add(animation);pulses.set(element,animation);
      const done=()=>{animations.delete(animation);if(pulses.get(element)===animation)pulses.delete(element);};
      animation.onfinish=done;animation.oncancel=done;return animation;
    }
    function present(view){
      scene(view.kind,view.floor);
      const changed=sceneKey!==view.key,hadScene=!!sceneKey;
      root.document.body.dataset.phase=view.phase;
      if(changed){
        sceneKey=view.key;
        const surface=root.document.getElementById(view.screen==='map'||view.screen==='node'?'expedition-view':'arena');
        animate(surface,[{opacity:.25,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:440});
        if(view.screen==='map'){
          const nodes=root.document.querySelectorAll('#route-map .sea-node:not(.sea-unknown):not(.sea-unknown-combat)');
          [...nodes].slice(0,18).forEach((el,i)=>animate(el,[{opacity:.1},{opacity:1}],{duration:300,delay:Math.min(i*22,260)}));
        }
        if(hadScene&&(view.kind==='victory'||view.kind==='defeat'))sfx(view.kind);
      }
      const fresh=view.hand.filter(id=>!knownHand.has(id));knownHand=new Set(view.hand);
      if(view.screen==='battle'){
        const cards=[...root.document.querySelectorAll('#hand .card')].filter(el=>fresh.includes(el.dataset.uid));
        cards.forEach((el,i)=>animate(el,[{opacity:.1,transform:'translateY(26px) rotate(-4deg)'},{opacity:1,transform:'translateY(0) rotate(0deg)'}],{duration:340,delay:i*45}));
        if(fresh.length&&hadScene&&!changed)sfx('draw',{count:fresh.length});
      }
    }
    function burst(element,kind='hit'){
      if(motion()==='off'||!element)return;
      animate(element,[{opacity:.7,filter:'brightness(1.8)'},{opacity:1,filter:'brightness(1)'}],{duration:kind==='heal'?520:270});
    }
    function travel(fromId,toId,path=[]){
      const map=root.document.querySelector('#route-map .sea-map'),from=map?.querySelector('[data-node="'+fromId+'"]'),to=map?.querySelector('[data-node="'+toId+'"]');
      if(motion()!=='full'||!map||!from||!to)return;
      const dot=root.document.createElement('span');dot.className='travel-beacon';dot.setAttribute('aria-hidden','true');map.appendChild(dot);
      const route=[from,...path.map(id=>map.querySelector('[data-node="'+id+'"]')).filter(Boolean)];if(route.at(-1)!==to)route.push(to);
      const frames=route.map((node,i)=>({left:node.style.left,top:node.style.top,opacity:i?1:.3}));
      const animation=dot.animate(frames,{duration:clamp(route.length*110+250,450,1200),easing:'linear'});
      animations.add(animation);
      const finish=()=>{animations.delete(animation);dot.remove();};animation.onfinish=finish;animation.oncancel=finish;
    }
    function pause(){
      stopMusic();clearVoices();
      for(const animation of [...animations])animation.cancel();
      if(ctx&&ctx.state==='running')ctx.suspend().catch(()=>{});notify();
    }
    function visibility(){
      if(root.document.hidden){pause();return;}
      if(unlocked&&active())unlock();else notify();
    }
    function genericClick(event){
      if(!event.isTrusted)return;
      const button=event.target.closest('button,summary');if(!button||button.disabled||button.matches('[data-uid],[data-cell],[data-media-test]'))return;
      sfx('ui');
    }
    root.document.addEventListener('pointerdown',unlock,{capture:true,passive:true});
    root.document.addEventListener('keydown',unlock,true);
    root.document.addEventListener('click',genericClick,true);
    root.document.addEventListener('visibilitychange',visibility);
    root.addEventListener('pagehide',pause);
    root.addEventListener('pageshow',visibility);
    reduced.addEventListener('change',notify);
    notify();
    return{
      get settings(){return {...prefs};},get motion(){return motion();},get audible(){return active();},
      get status(){
        return {ready:!!ctx&&ctx.state==='running'&&unlocked,theme:themes[desired.kind].name,error,storageError,
          text:error||(!active()?'已静音':!ctx||!unlocked||ctx.state!=='running'?'首次点击后播放':prefs.music&&prefs.musicVolume?'正在播放 · '+themes[desired.kind].name:'配乐已关闭 · 音效独立开启')};
      },
      scene,set,unlock,sfx,present,animate,burst,travel,
      dispose(){disposed=true;pause();if(ctx)ctx.close().catch(()=>{});root.document.removeEventListener('pointerdown',unlock,true);root.document.removeEventListener('keydown',unlock,true);root.document.removeEventListener('click',genericClick,true);root.document.removeEventListener('visibilitychange',visibility);root.removeEventListener('pagehide',pause);root.removeEventListener('pageshow',visibility);reduced.removeEventListener('change',notify);}
    };
  }
  root.EmberMedia=Object.freeze({create,themes:Object.freeze(Object.fromEntries(Object.entries(themes).map(([id,t])=>[id,t.name])))});
})(typeof globalThis!=='undefined'?globalThis:this);

