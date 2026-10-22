/* Seeded expanded floor, content rewards and versioned save migration. Codex. */
(function(root){
  'use strict';
  const R=root.EmberRules||require('./balance.js'),Body=root.EmberBody||require('./body.js').HeroBody;
  const types={battle:{name:'战斗',mark:'⚔',note:'击败敌人，获得金币与三选一卡牌。'},elite:{name:'精英',mark:'♜',note:'获得更多金币、卡牌及一件未拥有的遗物。'},event:{name:'事件',mark:'?',note:'探索遗迹，作出不同的选择。'},shop:{name:'商店',mark:'¤',note:'购买卡牌、遗物、治疗，或精简牌组。'},camp:{name:'营火',mark:'♨',note:'恢复身体、学习卡牌，或移除一张直击。'},treasure:{name:'宝箱',mark:'◇',note:'从两件遗物中选择一件，或带走金币。'},boss:{name:'关底 Boss',mark:'♛',note:'击败本层首领，获得遗物并完成第一层。'}};
  const legacyLayout=[[[0,'battle'],[2,'battle']],[[0,'event'],[1,'battle'],[2,'shop']],[[0,'camp'],[1,'elite'],[2,'event']],[[0,'battle'],[2,'treasure']],[[0,'shop'],[1,'camp'],[2,'elite']],[[0,'event'],[2,'battle']],[[0,'camp'],[2,'treasure']],[[1,'boss']]];
  const rows=[
    [[0,2,4],['battle','battle','battle']],
    [[0,1,3,4],['event','battle','shop','event']],
    [[0,1,2,3,4],['battle','camp','event','battle','shop']],
    [[0,1,3,4],['elite','event','battle','elite']],
    [[0,1,2,3,4],['shop','battle','camp','event','battle']],
    [[0,1,3,4],['treasure','event','battle','treasure']],
    [[0,1,2,3,4],['battle','elite','event','battle','shop']],
    [[0,1,3,4],['camp','shop','elite','camp']],
    [[0,1,2,3,4],['event','battle','treasure','elite','event']],
    [[0,1,3,4],['elite','event','battle','shop']],
    [[0,2,4],['camp','treasure','camp']],
    [[2],['boss']]
  ];
  const rng=seed=>{let state=seed>>>0||1;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;state>>>=0;return state/4294967296;};};
  const pick=(array,random)=>array[Math.floor(random()*array.length)];
  const shuffle=(array,random)=>{const a=[...array];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  const hash=text=>[...text].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261);
  function makeMap(seed,version){
    const random=rng(seed^0x6a09e667),normals=Object.keys(R.enemies).filter(id=>R.enemies[id].kind==='battle');
    const layout=version===1?legacyLayout:rows.map(([lanes,kinds])=>{const shuffled=shuffle(kinds,random);return lanes.map((lane,i)=>[lane,shuffled[i]]);});
    return layout.flatMap((row,r)=>row.map(([lane,type])=>{
      const pool=type==='event'?Object.keys(R.events):type==='battle'?(r<3?normals.slice(0,6):normals):Object.keys(R.enemies).filter(id=>R.enemies[id].kind===type);
      return {id:'r'+r+'c'+lane,row:r,lane,type,variant:pool.length?pick(pool,random):null};
    }));
  }
  const connects=(a,b,version=2)=>b.row===a.row+1&&(b.type==='boss'||Math.abs(a.lane-b.lane)<=(version===2&&[5,8].includes(a.row)?2:1));
  const masks=[
    [7,8,9,10,6,11,1,2,3,4,13,14,15,16,19,20],
    [7,8,9,13,14,15,19,20,21],
    [1,2,3,4,6,7,10,11,12,13,16,17,19,20,21,22],
    [0,1,7,8,14,15,21,22]
  ];
  function layers(hp,style){const cells=Array(24).fill(0),mask=masks[style%4];for(let i=0;i<hp;i++)cells[mask[i%mask.length]]++;return cells;}
  function encounter(node){
    const d=R.enemies[node.variant],hp=d.hp+(d.kind==='battle'?Math.min(3,Math.floor(node.row/3)):d.kind==='elite'?Math.min(2,Math.floor(node.row/4)):0);
    return {...d,id:node.id,enemyId:node.variant,layers:layers(hp,d.style),reward:d.kind==='boss'?85:d.kind==='elite'?42:22+node.row*2,role:types[d.kind].name+' · '+d.name,sceneCell:d.kind==='boss'?5:d.kind==='elite'?4:node.row%3===0?3:null};
  }
  function oldEncounter(node){
    const r=node.row,boss=node.type==='boss',elite=node.type==='elite',damage=boss?10:elite?9:5+Math.floor(r/2);
    const I=(name,damage=0,block=0,strength=0)=>({name,type:damage?'attack':'defend',damage,block,strength});
    return {layers:boss?[0,3,4,4,3,0,3,5,6,6,5,3,2,4,5,5,4,2,0,2,3,3,2,0]:elite?R.enemyLayers.map(v=>v?v+1:0):R.enemyLayers.map((v,i)=>Math.max(0,v-(r<2&&i%3===0?1:0))+(r>3&&v>1?1:0)),intents:[I('攻击',damage),I('覆甲',0,boss?6:elite?4:3),I('蓄势',damage-2,0,boss?2:1)]};
  }
  const assert=(condition,message='存档内容不完整或数值无效。')=>{if(!condition)throw new Error(message);};
  const integer=(v,min,max)=>Number.isInteger(v)&&v>=min&&v<=max;
  const number=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
  const ids=(v,allowed,min,max)=>Array.isArray(v)&&v.length>=min&&v.length<=max&&v.every(x=>typeof x==='string'&&allowed.includes(x));
  class Floor{
    constructor({seed=(Date.now()>>>0)||1,routeVersion=2}={}){
      this.seed=seed>>>0||1;this.rngState=this.seed;this.routeVersion=routeVersion;this.nodes=makeMap(this.seed,routeVersion);this.stations=routeVersion===1?8:12;
      this.gold=60;this.deck=[...R.deck];this.relics=[];this.hero=new Body();this.visited=[];this.nodeId=null;this.screen='map';this.battle=null;this.offers=[];this.bought=[];this.roomRelics=[];this.lastLoot=null;this.migrated=false;
    }
    random(){let x=this.rngState;x^=x<<13;x^=x>>>17;x^=x<<5;this.rngState=x>>>0;return this.rngState/4294967296;}
    get node(){return this.nodes.find(n=>n.id===this.nodeId);}
    linked(a,b){return connects(a,b,this.routeVersion);}
    get available(){if(this.screen!=='map')return[];const last=this.nodes.find(n=>n.id===this.visited.at(-1));return this.nodes.filter(n=>last?this.linked(last,n):n.row===0);}
    get event(){return R.events[this.node?.variant];}
    get trainingCard(){return pick(['cross','ring','cleave','retreat','suture','spear'],rng(this.seed^hash(this.nodeId||'')));}
    get shop(){
      if(this.node?.type!=='shop')return[];
      const random=rng(this.seed^hash(this.nodeId)),cards=shuffle(R.rewardPool,random).slice(0,4),relic=pick(Object.keys(R.relics),random);
      const base=this.routeVersion===1?[{id:'heal',name:'战地治疗',description:'存活部位修复30%，止血，血容量+40。',cost:30,heal:.3},...['sweep','wall'].map(id=>({id,name:R.cards[id].name,description:R.cards[id].description,cost:30,card:id})),{id:'blade',name:R.relics.blade.name,description:R.relics.blade.description,cost:60,relic:'blade'}]
        :[{id:'heal',name:'战地治疗',description:'存活部位修复30%，止血，血容量+40。',cost:30,heal:.3},...cards.map(id=>({id:'card:'+id,name:R.cards[id].name,description:R.cards[id].description,cost:R.cards[id].cost>=2?35:28,card:id})),{id:'relic:'+relic,name:R.relics[relic].name,description:R.relics[relic].description,cost:60,relic},{id:'remove',name:'精简直击',description:'移除一张直击；牌组至少保留5张。',cost:20,remove:'strike'}];
      return base.map(item=>({...item,cost:Math.ceil(item.cost*(this.relics.includes('compass')?.8:1))}));
    }
    addRelic(id){
      if(!R.relics[id]||this.relics.includes(id))return false;this.relics.push(id);
      if(id==='heart')for(const [part,amount]of[['torso',6],['heart',4]]){const p=this.hero.part(part);p.maxHp+=amount;if(this.hero.available(part))p.hp+=amount;}
      return true;
    }
    dropRelic(){const pool=Object.keys(R.relics).filter(id=>!this.relics.includes(id));if(!pool.length){this.gold+=45;return null;}const id=pick(pool,()=>this.random());this.addRelic(id);return id;}
    enter(id,Battle){
      if(!this.available.some(n=>n.id===id))return false;this.nodeId=id;this.bought=[];this.offers=[];this.lastLoot=null;this.roomRelics=[];
      if(['battle','elite','boss'].includes(this.node.type)){
        this.hero.block=0;this.hero.boostTurns=0;this.hero.bandages=3;this.hero.stimulants=this.relics.includes('supplies')?2:1;this.hero.lastHits=[];
        if(this.relics.includes('phoenix'))this.hero.blood=Math.min(100,this.hero.blood+15);
        this.battle=new Battle({hero:this.hero,relics:this.relics,deck:this.deck,encounter:encounter(this.node),rng:()=>this.random()});this.screen='battle';
      }else{
        this.battle=null;this.screen='node';
        if(this.node.type==='treasure')this.roomRelics=shuffle(Object.keys(R.relics).filter(id=>!this.relics.includes(id)),()=>this.random()).slice(0,2);
      }return true;
    }
    finishBattle(){
      if(this.screen!=='battle'||!this.battle||this.battle.status==='playing')return;
      if(this.battle.status==='lost'){this.screen='lost';return;}
      const gold=Math.ceil(encounter(this.node).reward*(this.relics.includes('coin')?1.25:1));this.gold+=gold;
      this.lastLoot={gold,relics:[],fallbackGold:0};
      if(['elite','boss'].includes(this.node.type)){const id=this.dropRelic();if(id)this.lastLoot.relics.push(id);else this.lastLoot.fallbackGold=45;}
      if(this.relics.includes('chalice'))this.heal(.08,12);
      if(this.node.type==='boss'){this.visited.push(this.nodeId);this.screen='cleared';return;}
      this.offers=shuffle(R.rewardPool,()=>this.random()).slice(0,3);this.screen='reward';
    }
    heal(ratio,blood=0){for(const p of this.hero.parts){if(ratio>0&&this.hero.available(p.id))p.hp=Math.min(p.maxHp,p.hp+Math.max(1,Math.ceil(p.maxHp*ratio)));p.bleed=0;}this.hero.blood=Math.min(100,this.hero.blood+blood);}
    leave(){
      this.visited.push(this.nodeId);this.hero.block=0;this.hero.boostTurns=0;this.heal(.05,10);
      this.nodeId=null;this.battle=null;this.offers=[];this.bought=[];this.roomRelics=[];this.lastLoot=null;this.screen=this.hero.failureReason?'lost':'map';
    }
    chooseCard(id){if(this.screen!=='reward'||(id!=='skip'&&!this.offers.includes(id)))return false;if(id!=='skip')this.deck.push(id);this.leave();return true;}
    canEffect(e,cost=0){
      if(this.gold<cost)return'金币不足。';
      if(e.bloodCost&&this.hero.blood<=25)return'血容量需要高于25%。';
      if(e.remove&&(this.deck.length<=5||!this.deck.includes(e.remove)))return'需要可移除的直击，且牌组至少保留5张。';
      return'';
    }
    applyEffect(e){
      if(e.gold)this.gold+=e.gold;if(e.heal||e.blood||e.cleanse)this.heal(e.heal||0,e.blood||0);
      if(e.bloodCost)this.hero.blood-=e.bloodCost;
      if(e.card)this.deck.push(e.card);if(e.remove)this.deck.splice(this.deck.indexOf(e.remove),1);
      if(e.relic&&!this.addRelic(e.relic))this.gold+=45;if(e.randomRelic)this.dropRelic();
    }
    choose(action){
      if(this.screen!=='node')return{ok:false};
      const type=this.node.type;
      if(type==='event'){
        const c=this.event.choices.find(c=>c.id===action);if(!c)return{ok:false};const reason=this.canEffect(c.effects,c.cost);if(reason)return{ok:false,reason};this.gold-=c.cost;this.applyEffect(c.effects);
      }else if(type==='camp'&&['rest','train','purge'].includes(action)){
        if(action==='rest')this.heal(.4,45);else if(action==='train')this.deck.push(this.trainingCard);else{const reason=this.canEffect({remove:'strike'});if(reason)return{ok:false,reason};this.applyEffect({remove:'strike'});}
      }else if(type==='treasure'){
        if(action==='gold')this.gold+=55;else{const id=action.startsWith('relic:')?action.slice(6):action;if(!this.roomRelics.includes(id)||!this.addRelic(id))return{ok:false,reason:'这件遗物无法领取。'};}
      }else if(!(type==='shop'&&action==='leave'))return{ok:false};
      this.leave();return{ok:true};
    }
    buy(id){
      if(this.screen!=='node'||this.node.type!=='shop')return{ok:false};const item=this.shop.find(i=>i.id===id);
      if(!item||this.bought.includes(id)||(item.relic&&this.relics.includes(item.relic)))return{ok:false,reason:'已售出或已拥有。'};
      const effect={heal:item.heal,blood:item.heal?40:0,card:item.card,relic:item.relic,remove:item.remove},reason=this.canEffect(effect,item.cost);
      if(reason)return{ok:false,reason};this.gold-=item.cost;this.bought.push(id);this.applyEffect(effect);return{ok:true};
    }
    snapshot(options={}){
      const h=this.hero,b=this.battle;
      return{format:'ember-corridor',version:2,savedAt:new Date().toISOString(),options:{auto:!!options.auto,sound:!!options.sound},run:{
        seed:this.seed,rngState:this.rngState,routeVersion:this.routeVersion,gold:this.gold,deck:[...this.deck],relics:[...this.relics],visited:[...this.visited],nodeId:this.nodeId,screen:this.screen,offers:[...this.offers],bought:[...this.bought],roomRelics:[...this.roomRelics],lastLoot:this.lastLoot?{gold:this.lastLoot.gold,relics:[...this.lastLoot.relics],fallbackGold:this.lastLoot.fallbackGold}:null,
        hero:{parts:h.parts.map(p=>({id:p.id,hp:p.hp,bleed:p.bleed,missing:p.missing,detachedBy:p.detachedBy})),block:h.block,blood:h.blood,boostTurns:h.boostTurns,bandages:3,stimulants:h.stimulants},
        battle:b?{cells:[...b.enemy.cells],armor:[...b.enemy.armor],maxHp:b.enemy.maxHp,strength:b.enemy.strength,energy:b.energy,turn:b.turn,intentIndex:b.intentIndex,status:b.status,played:b.played,attackRemainder:b.attackRemainder,hand:b.hand.map(c=>c.uid),draw:b.drawPile.map(c=>c.uid),discard:b.discardPile.map(c=>c.uid),exhaust:b.exhaustPile.map(c=>c.uid),log:b.log.slice(-120)}:null}};
    }
    static restore(data,Battle){
      assert(data&&data.format==='ember-corridor'&&[1,2].includes(data.version),'不是本游戏支持的存档版本。');
      const old=data.version===1,s=data.run;assert(s&&typeof s==='object');
      assert(integer(s.seed,1,4294967295)&&integer(s.rngState,1,4294967295)&&integer(s.gold,0,100000));
      const version=old?1:s.routeVersion;assert([1,2].includes(version));const run=new Floor({seed:s.seed,routeVersion:version}),nodeIds=run.nodes.map(n=>n.id),relicIds=Object.keys(R.relics);
      assert(ids(s.deck,Object.keys(R.cards),5,120)&&ids(s.relics,relicIds,0,16)&&new Set(s.relics).size===s.relics.length);
      assert(ids(s.visited,nodeIds,0,run.stations)&&new Set(s.visited).size===s.visited.length);
      s.visited.forEach((id,i)=>assert(i?run.linked(run.nodes.find(n=>n.id===s.visited[i-1]),run.nodes.find(n=>n.id===id)):run.nodes.find(n=>n.id===id).row===0));
      assert(['map','node','battle','reward','lost','cleared'].includes(s.screen));
      const n=run.nodes.find(n=>n.id===s.nodeId),last=run.nodes.find(n=>n.id===s.visited.at(-1));
      assert(s.nodeId===null||!!n);if(s.screen==='map')assert(s.nodeId===null&&(!last||last.type!=='boss'));
      if(n&&s.screen!=='cleared')assert(!s.visited.includes(n.id)&&(last?run.linked(last,n):n.row===0));
      if(['node','battle','reward','cleared'].includes(s.screen))assert(!!n);
      if(s.screen==='node')assert(!['battle','elite','boss'].includes(n.type));
      if(['battle','reward','cleared'].includes(s.screen))assert(['battle','elite','boss'].includes(n.type));
      if(s.screen==='cleared')assert(n.type==='boss'&&s.visited.at(-1)===n.id);
      assert(ids(s.offers,R.rewardPool,s.screen==='reward'?3:0,s.screen==='reward'?3:0)&&new Set(s.offers).size===s.offers.length);
      run.rngState=s.rngState;run.gold=s.gold;run.deck=[...s.deck];run.relics=[...s.relics];run.visited=[...s.visited];run.nodeId=s.nodeId;run.screen=s.screen;run.offers=[...s.offers];
      assert(ids(s.bought,n?.type==='shop'?run.shop.map(i=>i.id):[],0,7)&&new Set(s.bought).size===s.bought.length);run.bought=[...s.bought];
      const room=old?[]:s.roomRelics;assert(ids(room,relicIds,0,2)&&new Set(room).size===room.length);assert(!room.length||(s.screen==='node'&&n.type==='treasure'&&room.every(id=>!s.relics.includes(id))));run.roomRelics=[...room];
      if(old&&s.screen==='node'&&n.type==='treasure')run.roomRelics=relicIds.filter(id=>!run.relics.includes(id)).slice(0,2);
      const h=s.hero;assert(h&&Array.isArray(h.parts)&&h.parts.length===Body.partDefinitions.length);run.hero=new Body({relic:s.relics.includes('heart')?'heart':null});
      for(const p of run.hero.parts){const matches=h.parts.filter(x=>x&&x.id===p.id);assert(matches.length===1);const x=matches[0];assert(integer(x.hp,0,p.maxHp)&&number(x.bleed,0,1000)&&typeof x.missing==='boolean'&&x.missing===(x.hp===0));assert(x.detachedBy===null||(x.missing&&x.detachedBy===p.parent));p.hp=x.hp;p.bleed=x.bleed;p.missing=x.missing;p.detachedBy=x.detachedBy;}
      for(const p of run.hero.parts)if(p.parent&&!run.hero.available(p.parent))assert(p.missing);
      assert(number(h.blood,0,100)&&integer(h.block,0,10000)&&integer(h.boostTurns,0,3)&&integer(h.bandages,0,3)&&integer(h.stimulants,0,run.relics.includes('supplies')?2:1));
      for(const key of ['block','blood','boostTurns','stimulants'])run.hero[key]=h[key];
      if(s.battle!==null){
        assert(n&&['battle','elite','boss'].includes(n.type)&&['battle','reward','lost','cleared'].includes(s.screen));const x=s.battle,e=encounter(n),oldE=old?oldEncounter(n):null,maxHp=e.layers.reduce((a,b)=>a+b,0);
        assert(Array.isArray(x.cells)&&x.cells.length===24&&x.cells.every((v,i)=>integer(v,0,old?oldE.layers[i]:9)));
        assert(Array.isArray(x.armor)&&x.armor.length===24&&x.armor.every((v,i)=>typeof v==='boolean'&&(!v||x.cells[i]>0)));
        if(!old)assert(x.maxHp===maxHp&&x.cells.reduce((a,b)=>a+b,0)<=maxHp);
        assert(integer(x.strength,0,100000)&&integer(x.energy,0,100)&&integer(x.turn,1,10000)&&integer(x.intentIndex,0,2)&&integer(x.played,0,100000)&&number(x.attackRemainder,0,1-Number.EPSILON));
        assert(['playing','won','lost'].includes(x.status));const cards=s.deck.map((id,i)=>({id,uid:'card-'+i})),uids=cards.map(c=>c.uid),areas=['hand','draw','discard','exhaust'];
        for(const key of areas)assert(ids(x[key],uids,0,key==='hand'?9:120));const all=areas.flatMap(key=>x[key]);assert(all.length===cards.length&&new Set(all).size===cards.length);assert(x.exhaust.every(uid=>!!R.cards[cards.find(c=>c.uid===uid).id].exhaust));
        assert(Array.isArray(x.log)&&x.log.length<=120&&x.log.every(l=>typeof l==='string'&&l.length<=500));
        const b=new Battle({hero:run.hero,relics:run.relics,deck:run.deck,encounter:e,rng:()=>0});b.rng=()=>run.random();b.allCards=cards;
        // Constructor may grant opening block; replace it with the exact saved value.
        run.hero.block=h.block;
        for(const[from,to]of[['hand','hand'],['draw','drawPile'],['discard','discardPile'],['exhaust','exhaustPile']])b[to]=x[from].map(uid=>cards.find(c=>c.uid===uid));
        b.enemy.cells=[...x.cells];b.enemy.armor=[...x.armor];b.enemy.strength=old?Math.floor(x.strength/2):x.strength;
        if(old){const oldMax=oldE.layers.reduce((a,b)=>a+b,0),sum=b.enemy.cells.reduce((a,b)=>a+b,0),target=Math.min(sum,Math.ceil(sum/oldMax*maxHp));let remaining=sum;while(remaining>target){const largest=Math.max(...b.enemy.cells),i=b.enemy.cells.indexOf(largest);b.enemy.cells[i]--;remaining--;}}
        b.syncEnemy();b.enemy.maxHp=maxHp;
        for(const key of ['energy','turn','intentIndex','status','played','attackRemainder'])b[key]=x[key];b.phase=b.status==='playing'?'player':'finished';b.log=[...x.log];if(old)b.log.push('存档已升级：当前敌人按剩余比例降低生命，包扎次数限制解除。');run.battle=b;
        assert((b.status==='won'&&b.enemy.hp===0)||(b.status==='lost'&&b.enemy.hp>0&&!!run.hero.failureReason)||(b.status==='playing'&&b.enemy.hp>0&&!run.hero.failureReason));
        assert(s.screen==='battle'?b.status==='playing':s.screen==='lost'?b.status==='lost':b.status==='won');
      }else assert(!['battle','reward','cleared'].includes(s.screen));
      if(s.screen==='reward')assert(n.type!=='boss');if(!['lost','cleared'].includes(s.screen))assert(!run.hero.failureReason);if(s.screen==='lost')assert(!!run.hero.failureReason);
      if(!old&&s.lastLoot!==null){const loot=s.lastLoot;assert(['reward','cleared'].includes(s.screen)&&loot&&integer(loot.gold,0,1000)&&integer(loot.fallbackGold,0,45)&&ids(loot.relics,relicIds,0,1)&&loot.relics.every(id=>run.relics.includes(id)));run.lastLoot={gold:loot.gold,relics:[...loot.relics],fallbackGold:loot.fallbackGold};}
      if(old&&['reward','cleared'].includes(s.screen)){run.lastLoot={gold:0,relics:[],fallbackGold:0};if(['elite','boss'].includes(n.type)){const id=run.dropRelic();if(id)run.lastLoot.relics.push(id);else run.lastLoot.fallbackGold=45;}}
      run.migrated=old;
      return{run,options:{auto:data.options?.auto===true,sound:data.options?.sound===true},migrated:old};
    }
  }
  Floor.types=types;Floor.encounter=encounter;Floor.legacyLayout=legacyLayout;Floor.nodes=makeMap(1,2);Floor.connects=connects;
  root.EmberFloor=Floor;if(typeof module!=='undefined'&&module.exports)module.exports=Floor;
})(typeof globalThis!=='undefined'?globalThis:this);
