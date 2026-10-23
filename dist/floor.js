/* Seeded expanded floor, content rewards and versioned save migration. Codex. */
(function(root){
  'use strict';
  const R=root.EmberRules||require('./balance.js'),Body=root.EmberBody||require('./body.js').HeroBody;
  const types={battle:{name:'战斗',mark:'⚔',note:'击败敌人，获得金币与三选一卡牌。'},elite:{name:'精英',mark:'♜',note:'获得更多金币、卡牌及一件未拥有的遗物。'},event:{name:'事件',mark:'?',note:'探索遗迹，作出不同的选择。'},shop:{name:'商店',mark:'¤',note:'购买卡牌、遗物、治疗，或精简牌组。'},camp:{name:'营火',mark:'♨',note:'恢复身体、强化或学习卡牌，或自由移除一张牌。'},treasure:{name:'宝箱',mark:'◇',note:'从两件遗物中选择一件，或带走金币。'},boss:{name:'关底 Boss',mark:'♛',note:'击败本层首领，获得遗物；第五层胜利即完成旅途。'}};
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
  const routeStyle=seed=>Math.floor(rng(seed^0x510e527f)()*4);
  const routeNames=['蜿蜒峡谷','双翼回廊','斜行长桥','收束深井'];
  const enemyPool=(kind,floor=1)=>Object.keys(R.enemies).filter(id=>R.enemies[id].kind===kind&&(R.enemies[id].floor||1)===floor);
  const legacyPool=kind=>R.legacy.enemies.filter(id=>R.enemies[id].kind===kind);
  const eventPool=floor=>floor===1?[...R.legacy.events]:[...R.legacy.events.filter(id=>['spring','medic','library','altar','sparrow'].includes(id)),...Object.keys(R.events).filter(id=>R.events[id].minFloor===floor)];
  const mapSeed=(seed,floor)=>floor===1?seed:hash(seed+':floor:'+floor)||1;
  function wovenMap(seed,floor=1,campaign=false){
    const random=rng(seed^0xbb67ae85),content=rng(seed^0x6a09e667),style=routeStyle(seed),phase=random()*Math.PI*2;
    // Interior counts sum to 43: variable narrow/wide rows, always 47 nodes in total.
    const counts=[3,...shuffle([2,3,4,4,5,5,5,5,5,5],random),1],nodes=[];
    const normals=campaign?enemyPool('battle',floor):legacyPool('battle');
    counts.forEach((count,row)=>{
      const t=row/11,kinds=shuffle(rows[row][1],content);
      const anchor={1:'event',2:'shop',3:'elite',5:'treasure',10:'camp'}[row];
      if(anchor){const i=kinds.indexOf(anchor);[kinds[0],kinds[i]]=[kinds[i],kinds[0]];}
      const center=380+(style===0?Math.sin(t*Math.PI*2+phase)*78:style===1?Math.sin(t*Math.PI+phase)*42:style===2?(t-.5)*140:Math.sin(t*Math.PI*2+phase)*38);
      const desired=style===1?110+Math.sin(t*Math.PI)*145:style===3?100+Math.abs(t-.5)*290:190+Math.sin(t*Math.PI+phase)*40;
      const spread=Math.max((count-1)*52,desired);
      for(let i=0;i<count;i++){
        const type=kinds[i%kinds.length],pool=type==='event'?(campaign?eventPool(floor):R.legacy.events):type==='battle'?(row<3?normals.slice(0,6):normals):(campaign?enemyPool(type,floor):legacyPool(type));
        nodes.push({id:'r'+row+'c'+i,row,lane:i,type,variant:pool.length?pick(pool,content):null,
          x:Math.round(Math.max(70,Math.min(690,center+(count===1?0:(i/(count-1)*2-1)*spread)+(random()-.5)*18))),
          y:Math.round(1080-row*90+(row===0||row===11?0:(random()-.5)*18)),next:[]});
      }
    });
    for(let row=0;row<11;row++){
      const from=nodes.filter(n=>n.row===row),to=nodes.filter(n=>n.row===row+1);
      const nearest=(list,x)=>[...list].sort((a,b)=>Math.abs(a.x-x)-Math.abs(b.x-x)||a.lane-b.lane);
      // Give every source an exit and every destination an entry; no orphan/dead-end nodes.
      for(const a of from)a.next.push(nearest(to,a.x)[0].id);
      for(const b of to)if(!from.some(a=>a.next.includes(b.id)))nearest(from,b.x)[0].next.push(b.id);
      for(const a of from){
        const second=nearest(to,a.x).find(b=>!a.next.includes(b.id));
        if(second&&Math.abs(second.x-a.x)<280&&random()<.58)a.next.push(second.id);
      }
    }
    if(campaign)for(const node of nodes)node.floorNumber=floor;
    return nodes;
  }
  function makeMap(seed,version,floor=1){
    if(version>=4){const nodes=wovenMap(seed,floor,true);if(version>=5)for(const n of nodes){n.groupCombat=true;n.squadSeed=hash(seed+':'+n.id);}return nodes;}
    if(version===3)return wovenMap(seed);
    const random=rng(seed^0x6a09e667),normals=legacyPool('battle');
    const layout=version===1?legacyLayout:rows.map(([lanes,kinds])=>{const shuffled=shuffle(kinds,random);return lanes.map((lane,i)=>[lane,shuffled[i]]);});
    return layout.flatMap((row,r)=>row.map(([lane,type])=>{
      const pool=type==='event'?R.legacy.events:type==='battle'?(r<3?normals.slice(0,6):normals):legacyPool(type);
      return {id:'r'+r+'c'+lane,row:r,lane,type,variant:pool.length?pick(pool,random):null};
    }));
  }
  const connects=(a,b,version=4)=>b.row===a.row+1&&(version>=3?a.next.includes(b.id):(b.type==='boss'||Math.abs(a.lane-b.lane)<=(version===2&&[5,8].includes(a.row)?2:1)));
  const masks=[
    [7,8,9,10,6,11,1,2,3,4,13,14,15,16,19,20],
    [7,8,9,13,14,15,19,20,21],
    [1,2,3,4,6,7,10,11,12,13,16,17,19,20,21,22],
    [0,1,7,8,14,15,21,22]
  ];
  function layers(hp,style){
    const cells=Array(24).fill(0),mask=[...masks[style%4]];
    // Keep the old silhouette while it fits; extend it before any cell exceeds nine.
    if(hp>mask.length*9)for(let i=0;i<24;i++)if(!mask.includes(i))mask.push(i);
    for(let i=0;i<Math.min(216,hp);i++)cells[mask[i%mask.length]]++;
    return cells;
  }
  function encounter(node){
    const d=R.enemies[node.variant],hp=d.hp+(d.kind==='battle'?Math.min(3,Math.floor(node.row/3)):d.kind==='elite'?Math.min(2,Math.floor(node.row/4)):0);
    const floor=node.floorNumber||1;
    const lead={...d,id:node.id,floorNumber:floor,enemyId:node.variant,layers:layers(hp,d.style),reward:(d.kind==='boss'?85:d.kind==='elite'?42:22+node.row*2)+(floor-1)*(d.kind==='boss'?25:10),role:types[d.kind].name+' · '+d.name,sceneCell:d.kind==='boss'?5:d.kind==='elite'?4:node.row%3===0?3:null};
    if(!node.groupCombat)return lead;
    const random=rng(node.squadSeed),count=d.kind==='battle'?(node.row===0?1:floor>=3&&random()<.35?3:2):d.kind==='elite'?2:floor===1?1:floor>=4?3:2;
    if(count===1)return lead;
    const available=shuffle(enemyPool('battle',floor).filter(id=>id!==node.variant),random),ids=[node.variant,...available.slice(0,count-1)];
    const portions=count===2?[.6,.4]:[.45,.3,.25],budgets=portions.map(p=>Math.floor(hp*p));budgets[count-1]+=hp-budgets.reduce((a,b)=>a+b,0);
    const members=ids.map((id,i)=>{
      const e=R.enemies[id],common=d.kind==='battle',scale=common?(count===2?.6:.4):i===0?1:d.kind==='elite'?.45:.3;
      const health=common?budgets[i]:i===0?hp:Math.max(3,Math.ceil(e.hp*(d.kind==='elite'?.25:count===3?.2:.3)));
      return{...e,id:node.id+':'+i,enemyId:id,floorNumber:floor,layers:layers(health,e.style),role:(i?'同伴 · ':'')+e.name,sceneCell:lead.sceneCell,
        intents:e.intents.map(a=>({...a,damage:a.damage?Math.max(1,Math.ceil(a.damage*scale)):0,block:a.block?Math.max(1,Math.ceil(a.block*scale)):0,strength:i===0?a.strength:0}))};
    });
    return{...lead,members};
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
    constructor({seed=(Date.now()>>>0)||1,routeVersion=5,floorNumber=1}={}){
      this.seed=seed>>>0||1;this.rngState=this.seed;this.floorNumber=floorNumber;this.history=[];this.mapSeed=mapSeed(this.seed,floorNumber);this.routeVersion=routeVersion;this.nodes=makeMap(this.mapSeed,routeVersion,floorNumber);this.stations=routeVersion===1?8:12;
      this.gold=60;this.deck=[...R.deck];this.relics=[];this.hero=new Body();this.visited=[];this.nodeId=null;this.screen='map';this.battle=null;this.offers=[];this.bought=[];this.roomRelics=[];this.lastLoot=null;this.pendingDeckAction=null;this.migrated=false;
    }
    random(){let x=this.rngState;x^=x<<13;x^=x>>>17;x^=x<<5;this.rngState=x>>>0;return this.rngState/4294967296;}
    get node(){return this.nodes.find(n=>n.id===this.nodeId);}
    get theme(){return R.floors[this.floorNumber-1];}
    get label(){return '第'+this.floorNumber+' / 5层 · '+this.theme.name;}
    get completed(){return this.screen==='cleared'&&this.floorNumber===5;}
    get mapName(){return this.theme.name+' · '+(this.routeVersion===1?'旧日石径':routeNames[routeStyle(this.mapSeed)]);}
    get cardPool(){return R.rewardPool.filter(id=>(R.cards[id].minFloor||1)<=this.floorNumber);}
    get relicPool(){return Object.keys(R.relics).filter(id=>(R.relics[id].minFloor||1)<=this.floorNumber);}
    get treasureGold(){return 55+(this.floorNumber-1)*15;}
    get ascentChoices(){
      const i=this.floorNumber-1;
      return [{id:'assault',title:'进攻补给',card:['tidecut','hammerfall','mirrorfan','coronacut'][i],note:'带走下一层的攻击技艺。'},
        {id:'shelter',title:'防护补给',card:['tideguard','steelcoat','reflection','lastwall'][i],note:'带走下一层的防护技艺。'},
        {id:'renewal',title:'再生补给',card:['saltstitch','fieldrepair','moonstitch','rebirth'][i],note:'恢复一支缺失部位树；没有缺失时完全修复存活部位。'}];
    }
    point(node){
      if(this.routeVersion===1)return{x:100+node.lane*170,y:650-node.row*82};
      if(this.routeVersion>=3)return{x:node.x,y:node.y};
      const phase=(this.seed%628)/100,jitter=hash(this.seed+':'+node.id);
      return{x:90+node.lane*145+Math.sin(node.row*.65+phase)*25+(jitter%17-8),y:1080-node.row*90+((jitter>>>8)%15-7)};
    }
    linked(a,b){return connects(a,b,this.routeVersion);}
    get available(){if(this.screen!=='map')return[];const last=this.nodes.find(n=>n.id===this.visited.at(-1));return this.nodes.filter(n=>last?this.linked(last,n):n.row===0);}
    get event(){return R.events[this.node?.variant];}
    get trainingCard(){return pick(this.floorNumber===1?['cross','ring','cleave','retreat','suture','spear']:this.cardPool.filter(id=>R.cards[id].minFloor===this.floorNumber),rng(this.mapSeed^hash(this.nodeId||'')));}
    get shop(){
      if(this.node?.type!=='shop')return[];
      const random=rng(this.mapSeed^hash(this.nodeId)),cards=shuffle(this.routeVersion<4?R.legacy.rewardPool:this.cardPool,random).slice(0,4),relic=pick(this.routeVersion<4?R.legacy.relics:this.relicPool,random);
      const base=this.routeVersion===1?[{id:'heal',name:'战地治疗',description:'存活部位修复30%，止血，血容量+40。',cost:30,heal:.3},...['sweep','wall'].map(id=>({id,name:R.cards[id].name,description:R.cards[id].description,cost:30,card:id})),{id:'blade',name:R.relics.blade.name,description:R.relics.blade.description,cost:60,relic:'blade'}]
        :[{id:'heal',name:'战地治疗',description:'存活部位修复30%，止血，血容量+40。',cost:30,heal:.3},...cards.map(id=>({id:'card:'+id,name:R.cards[id].name,description:R.cards[id].description,cost:R.cards[id].cost>=2?35:28,card:id})),{id:'relic:'+relic,name:R.relics[relic].name,description:R.relics[relic].description,cost:60,relic},{id:'remove',name:'移除卡牌',description:'选择移除任意一张牌；牌组至少保留5张，确认后收费。',cost:20,remove:'any'}];
      if(this.floorNumber>1)base.push({id:'restore',name:'部位再生',description:'恢复一支缺失部位树；没有缺失则全身修复40%。',cost:65,restore:true});
      return base.map(item=>({...item,cost:Math.ceil(item.cost*(this.relics.includes('compass')?.8:1))}));
    }
    addRelic(id){
      if(!R.relics[id]||this.relics.includes(id))return false;this.relics.push(id);
      if(id==='heart')for(const [part,amount]of[['torso',6],['heart',4]]){const p=this.hero.part(part);p.maxHp+=amount;if(this.hero.available(part))p.hp+=amount;}
      return true;
    }
    dropRelic(){const pool=this.relicPool.filter(id=>!this.relics.includes(id));if(!pool.length){this.gold+=45;return null;}const id=pick(pool,()=>this.random());this.addRelic(id);return id;}
    enter(id,Battle){
      if(!this.available.some(n=>n.id===id))return false;this.nodeId=id;this.bought=[];this.offers=[];this.lastLoot=null;this.roomRelics=[];
      if(['battle','elite','boss'].includes(this.node.type)){
        this.hero.block=0;this.hero.boostTurns=0;this.hero.bandages=3;this.hero.stimulants=this.relics.includes('supplies')?2:1;this.hero.lastHits=[];
        if(this.relics.includes('phoenix'))this.hero.blood=Math.min(100,this.hero.blood+15);
        this.battle=new Battle({hero:this.hero,relics:this.relics,deck:this.deck,encounter:encounter(this.node),rng:()=>this.random()});this.screen='battle';
      }else{
        this.battle=null;this.screen='node';
        if(this.node.type==='treasure')this.roomRelics=shuffle(this.relicPool.filter(id=>!this.relics.includes(id)),()=>this.random()).slice(0,2);
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
      // Upper floors guarantee one newly unlocked card, plus two from the full unlocked pool.
      const fresh=this.cardPool.filter(id=>R.cards[id].minFloor===this.floorNumber),first=fresh.length?pick(fresh,()=>this.random()):null;
      this.offers=first?[first,...shuffle(this.cardPool.filter(id=>id!==first),()=>this.random()).slice(0,2)]:shuffle(this.cardPool,()=>this.random()).slice(0,3);this.screen='reward';
    }
    heal(ratio,blood=0){for(const p of this.hero.parts){if(ratio>0&&this.hero.available(p.id))p.hp=Math.min(p.maxHp,p.hp+Math.max(1,Math.ceil(p.maxHp*ratio)));p.bleed=0;}this.hero.blood=Math.min(100,this.hero.blood+blood);}
    restorePart(){
      const root=this.hero.parts.find(p=>p.missing&&(!p.parent||this.hero.available(p.parent)));
      if(!root){this.heal(.4,0);return null;}
      const repair=p=>{p.missing=false;p.detachedBy=null;p.hp=p.maxHp;p.bleed=0;for(const child of this.hero.parts.filter(c=>c.parent===p.id))repair(child);};
      repair(root);return root.name;
    }
    advanceFloor(boon){
      if(this.screen!=='cleared'||this.floorNumber>=5)return false;
      const choice=this.ascentChoices.find(c=>c.id===boon);if(!choice)return false;
      this.history.push({floor:this.floorNumber,routeVersion:this.routeVersion,boss:this.node.variant,visited:[...this.visited],boon});
      this.hero.block=0;this.hero.boostTurns=0;this.heal(.6,100);
      if(boon==='renewal'){if(!this.hero.parts.some(p=>p.missing))this.heal(1,0);else this.restorePart();}
      if(this.deck.length<120)this.deck.push(choice.card);this.gold+=35;this.floorNumber++;this.mapSeed=mapSeed(this.seed,this.floorNumber);this.routeVersion=5;this.nodes=makeMap(this.mapSeed,5,this.floorNumber);this.stations=12;
      this.visited=[];this.nodeId=null;this.battle=null;this.offers=[];this.bought=[];this.roomRelics=[];this.lastLoot=null;this.screen='map';return true;
    }
    leave(){
      this.visited.push(this.nodeId);this.hero.block=0;this.hero.boostTurns=0;this.heal(.05+(this.relics.includes('silverthread')?.08:0),10+(this.relics.includes('silverthread')?10:0));
      this.nodeId=null;this.battle=null;this.offers=[];this.bought=[];this.roomRelics=[];this.lastLoot=null;this.screen=this.hero.failureReason?'lost':'map';
    }
    chooseCard(id){if(this.screen!=='reward'||(id!=='skip'&&(!this.offers.includes(id)||this.deck.length>=120)))return false;if(id!=='skip')this.deck.push(id);this.leave();return true;}
    canEffect(e,cost=0){
      if(this.gold<cost)return'金币不足。';
      if(e.card&&this.deck.length>=120)return'牌组已满（120张），请先精简。';
      if(e.bloodCost&&this.hero.blood<=25)return'血容量需要高于25%。';
      if(e.remove&&this.deck.length<=5)return'牌组至少保留5张，当前无法移除。';
      if(e.upgrade&&!this.deck.some(id=>R.upgradeId(id)))return'所有卡牌都已强化。';
      return'';
    }
    applyEffect(e){
      if(e.gold)this.gold+=e.gold;if(e.heal||e.blood||e.cleanse)this.heal(e.heal||0,e.blood||0);
      if(e.restore)this.restorePart();
      if(e.bloodCost)this.hero.blood-=e.bloodCost;
      if(e.card)this.deck.push(e.card);
      if(e.relic&&!this.addRelic(e.relic))this.gold+=45;if(e.randomRelic)this.dropRelic();
    }
    choose(action){
      if(this.screen!=='node'||this.pendingDeckAction)return{ok:false};
      const type=this.node.type;
      if(type==='event'){
        const c=this.event.choices.find(c=>c.id===action);if(!c)return{ok:false};const reason=this.canEffect(c.effects,c.cost);if(reason)return{ok:false,reason};if(c.effects.remove||c.effects.upgrade)return this.beginDeckAction('event',action);this.gold-=c.cost;this.applyEffect(c.effects);
      }else if(type==='camp'&&['rest','train','purge','upgrade'].includes(action)){
        if(action==='purge'||action==='upgrade')return this.beginDeckAction('camp',action);
        if(action==='rest')this.heal(.4,45);else{const reason=this.canEffect({card:this.trainingCard});if(reason)return{ok:false,reason};this.deck.push(this.trainingCard);}
      }else if(type==='treasure'){
        if(action==='gold')this.gold+=this.treasureGold;else{const id=action.startsWith('relic:')?action.slice(6):action;if(!this.roomRelics.includes(id)||!this.addRelic(id))return{ok:false,reason:'这件遗物无法领取。'};}
      }else if(!(type==='shop'&&action==='leave'))return{ok:false};
      this.leave();return{ok:true};
    }
    buy(id){
      if(this.screen!=='node'||this.node.type!=='shop'||this.pendingDeckAction)return{ok:false};const item=this.shop.find(i=>i.id===id);
      if(!item||this.bought.includes(id)||(item.relic&&this.relics.includes(item.relic)))return{ok:false,reason:'已售出或已拥有。'};
      const effect={heal:item.heal,blood:item.heal?40:0,card:item.card,relic:item.relic,remove:item.remove,restore:item.restore},reason=this.canEffect(effect,item.cost);
      if(reason)return{ok:false,reason};if(item.remove)return this.beginDeckAction('shop',id);this.gold-=item.cost;this.bought.push(id);this.applyEffect(effect);return{ok:true};
    }
    deckActionFor(source,action){
      if(this.screen!=='node'||this.node?.type!==source)return null;
      if(source==='camp'&&['purge','upgrade'].includes(action))return{kind:action==='upgrade'?'upgrade':'remove',effect:action==='upgrade'?{upgrade:true}:{remove:'any'},cost:0};
      const item=source==='shop'?this.shop.find(i=>i.id===action&&!this.bought.includes(i.id)):source==='event'?this.event.choices.find(c=>c.id===action):null;
      const effect=source==='shop'?item:item?.effects;
      if(!effect||!(effect.remove||effect.upgrade))return null;
      return{kind:effect.upgrade?'upgrade':'remove',effect,cost:item.cost||0};
    }
    get deckAction(){const p=this.pendingDeckAction;return p?this.deckActionFor(p.source,p.action):null;}
    beginDeckAction(source,action){
      const d=this.deckActionFor(source,action);if(!d)return{ok:false};const reason=this.canEffect(d.effect,d.cost);if(reason)return{ok:false,reason};
      this.pendingDeckAction={source,action,selectedIndex:null};return{ok:true,pending:true};
    }
    selectDeckCard(index){
      const d=this.deckAction;if(!d||!integer(index,0,this.deck.length-1)||(d.kind==='upgrade'&&!R.upgradeId(this.deck[index])))return false;
      this.pendingDeckAction.selectedIndex=this.pendingDeckAction.selectedIndex===index?null:index;return true;
    }
    cancelDeckAction(){this.pendingDeckAction=null;}
    confirmDeckAction(){
      const p=this.pendingDeckAction,d=this.deckAction;if(!d||!integer(p.selectedIndex,0,this.deck.length-1))return{ok:false,reason:'请先选择一张牌。'};
      const reason=this.canEffect(d.effect,d.cost);if(reason)return{ok:false,reason};const upgraded=R.upgradeId(this.deck[p.selectedIndex]);if(d.kind==='upgrade'&&!upgraded)return{ok:false,reason:'这张牌已经强化过。'};
      this.gold-=d.cost;if(d.kind==='upgrade')this.deck[p.selectedIndex]=upgraded;else this.deck.splice(p.selectedIndex,1);
      this.applyEffect(d.effect);if(p.source==='shop')this.bought.push(p.action);this.pendingDeckAction=null;
      if(p.source!=='shop')this.leave();return{ok:true};
    }
    snapshot(options={}){
      const h=this.hero,b=this.battle;
      return{format:'ember-corridor',version:5,savedAt:new Date().toISOString(),options:{auto:!!options.auto,sound:!!options.sound},run:{
        pendingDeckAction:this.pendingDeckAction?{...this.pendingDeckAction}:null,
        floorNumber:this.floorNumber,history:this.history.map(h=>({...h,visited:[...h.visited]})),
        seed:this.seed,rngState:this.rngState,routeVersion:this.routeVersion,gold:this.gold,deck:[...this.deck],relics:[...this.relics],visited:[...this.visited],nodeId:this.nodeId,screen:this.screen,offers:[...this.offers],bought:[...this.bought],roomRelics:[...this.roomRelics],lastLoot:this.lastLoot?{gold:this.lastLoot.gold,relics:[...this.lastLoot.relics],fallbackGold:this.lastLoot.fallbackGold}:null,
        hero:{parts:h.parts.map(p=>({id:p.id,hp:p.hp,bleed:p.bleed,missing:p.missing,detachedBy:p.detachedBy})),block:h.block,blood:h.blood,boostTurns:h.boostTurns,bandages:3,stimulants:h.stimulants},
        battle:b?{enemies:b.members.map(e=>({cells:[...e.cells],armor:[...e.armor],maxHp:e.maxHp,strength:e.strength,intentIndex:e.intentIndex})),targetIndex:b.targetIndex,energy:b.energy,turn:b.turn,status:b.status,played:b.played,attackRemainder:b.attackRemainder,hand:b.hand.map(c=>c.uid),draw:b.drawPile.map(c=>c.uid),discard:b.discardPile.map(c=>c.uid),exhaust:b.exhaustPile.map(c=>c.uid),pendingDraw:b.pendingDraw.map(c=>c.uid),overflowSelection:[...b.overflowSelection],log:b.log.slice(-120)}:null}};
    }
    static restore(data,Battle){
      assert(data&&data.format==='ember-corridor'&&[1,2,3,4,5].includes(data.version),'不是本游戏支持的存档版本。');
      const old=data.version===1,campaign=data.version>=3,group=data.version>=4,upgrades=data.version>=5,s=data.run;assert(s&&typeof s==='object');
      assert(integer(s.seed,1,4294967295)&&integer(s.rngState,1,4294967295)&&integer(s.gold,0,100000));
      const version=old?1:s.routeVersion,floorNumber=campaign?s.floorNumber:1;
      assert(integer(floorNumber,1,5)&&[1,2,3,4,5].includes(version)&&(campaign||version<4)&&(group||version<5)&&(floorNumber===1||version>=4));
      const run=new Floor({seed:s.seed,routeVersion:version,floorNumber}),nodeIds=run.nodes.map(n=>n.id),relicIds=Object.keys(R.relics);
      if(campaign){
        assert(Array.isArray(s.history)&&s.history.length===floorNumber-1);
        s.history.forEach((h,i)=>{
          assert(h&&h.floor===i+1&&[1,2,3,4,5].includes(h.routeVersion)&&(group||h.routeVersion<5)&&(i===0||h.routeVersion>=4)&&['assault','shelter','renewal'].includes(h.boon));
          const nodes=makeMap(mapSeed(s.seed,h.floor),h.routeVersion,h.floor),steps=h.routeVersion===1?8:12;
          assert(ids(h.visited,nodes.map(n=>n.id),steps,steps)&&new Set(h.visited).size===steps);
          h.visited.forEach((id,j)=>assert(j?connects(nodes.find(n=>n.id===h.visited[j-1]),nodes.find(n=>n.id===id),h.routeVersion):nodes.find(n=>n.id===id).row===0));
          const boss=nodes.find(n=>n.id===h.visited.at(-1));assert(boss.type==='boss'&&h.boss===boss.variant);
          run.history.push({floor:h.floor,routeVersion:h.routeVersion,boss:h.boss,visited:[...h.visited],boon:h.boon});
        });
      }
      assert(ids(s.deck,upgrades?Object.keys(R.cards):R.baseCardIds,5,120)&&ids(s.relics,relicIds,0,relicIds.length)&&new Set(s.relics).size===s.relics.length);
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
      assert(ids(s.bought,n?.type==='shop'?run.shop.map(i=>i.id):[],0,8)&&new Set(s.bought).size===s.bought.length);run.bought=[...s.bought];
      const room=old?[]:s.roomRelics;assert(ids(room,relicIds,0,2)&&new Set(room).size===room.length);assert(!room.length||(s.screen==='node'&&n.type==='treasure'&&room.every(id=>!s.relics.includes(id))));run.roomRelics=[...room];
      if(old&&s.screen==='node'&&n.type==='treasure')run.roomRelics=R.legacy.relics.filter(id=>!run.relics.includes(id)).slice(0,2);
      const h=s.hero;assert(h&&Array.isArray(h.parts)&&h.parts.length===Body.partDefinitions.length);run.hero=new Body({relic:s.relics.includes('heart')?'heart':null});
      for(const p of run.hero.parts){const matches=h.parts.filter(x=>x&&x.id===p.id);assert(matches.length===1);const x=matches[0];assert(integer(x.hp,0,p.maxHp)&&number(x.bleed,0,1000)&&typeof x.missing==='boolean'&&x.missing===(x.hp===0));assert(x.detachedBy===null||(x.missing&&x.detachedBy===p.parent));p.hp=x.hp;p.bleed=x.bleed;p.missing=x.missing;p.detachedBy=x.detachedBy;}
      for(const p of run.hero.parts)if(p.parent&&!run.hero.available(p.parent))assert(p.missing);
      assert(number(h.blood,0,100)&&integer(h.block,0,10000)&&integer(h.boostTurns,0,3)&&integer(h.bandages,0,3)&&integer(h.stimulants,0,run.relics.includes('supplies')?2:1));
      for(const key of ['block','blood','boostTurns','stimulants'])run.hero[key]=h[key];
      if(upgrades&&s.pendingDeckAction!==null){
        const p=s.pendingDeckAction;assert(p&&['shop','camp','event'].includes(p.source)&&typeof p.action==='string');
        const d=run.deckActionFor(p.source,p.action);assert(d&&!run.canEffect(d.effect,d.cost));
        assert(p.selectedIndex===null||(integer(p.selectedIndex,0,run.deck.length-1)&&(d.kind!=='upgrade'||!!R.upgradeId(run.deck[p.selectedIndex]))));
        run.pendingDeckAction={source:p.source,action:p.action,selectedIndex:p.selectedIndex};
      }
      if(s.battle!==null){
        assert(n&&['battle','elite','boss'].includes(n.type)&&['battle','reward','lost','cleared'].includes(s.screen));const x=s.battle,e=encounter(n),configs=e.members||[e],oldE=old?oldEncounter(n):null;
        const enemies=group?x.enemies:[x],targetIndex=group?x.targetIndex:0;
        assert(Array.isArray(enemies)&&enemies.length===configs.length&&integer(targetIndex,0,enemies.length-1));
        enemies.forEach((m,j)=>{
          const maxHp=configs[j].layers.reduce((a,b)=>a+b,0);
          assert(m&&Array.isArray(m.cells)&&m.cells.length===24&&m.cells.every((v,i)=>integer(v,0,old?oldE.layers[i]:9)));
          assert(Array.isArray(m.armor)&&m.armor.length===24&&m.armor.every((v,i)=>typeof v==='boolean'&&(!v||m.cells[i]>0)));
          if(!old)assert(m.maxHp===maxHp&&m.cells.reduce((a,b)=>a+b,0)<=maxHp);
          assert(integer(m.strength,0,100000)&&integer(m.intentIndex,0,2));
        });
        assert(integer(x.energy,0,100)&&integer(x.turn,1,10000)&&integer(x.played,0,100000)&&number(x.attackRemainder,0,1-Number.EPSILON));
        assert(['playing','won','lost'].includes(x.status));const cards=s.deck.map((id,i)=>({id,uid:'card-'+i})),uids=cards.map(c=>c.uid),areas=['hand','draw','discard','exhaust',...(group?['pendingDraw']:[])];
        for(const key of areas)assert(ids(x[key],uids,0,key==='hand'?9:120));const all=areas.flatMap(key=>x[key]);assert(all.length===cards.length&&new Set(all).size===cards.length);assert(x.exhaust.every(uid=>!!R.cards[cards.find(c=>c.uid===uid).id].exhaust));
        if(group){assert(!x.pendingDraw.length||(x.status==='playing'&&x.hand.length===9));assert(ids(x.overflowSelection,[...x.hand,...x.pendingDraw],0,x.pendingDraw.length)&&new Set(x.overflowSelection).size===x.overflowSelection.length);}
        assert(Array.isArray(x.log)&&x.log.length<=120&&x.log.every(l=>typeof l==='string'&&l.length<=500));
        const b=new Battle({hero:run.hero,relics:run.relics,deck:run.deck,encounter:e,rng:()=>0});b.rng=()=>run.random();b.allCards=cards;
        // Constructor may grant opening block; replace it with the exact saved value.
        run.hero.block=h.block;
        for(const[from,to]of[['hand','hand'],['draw','drawPile'],['discard','discardPile'],['exhaust','exhaustPile']])b[to]=x[from].map(uid=>cards.find(c=>c.uid===uid));
        b.pendingDraw=group?x.pendingDraw.map(uid=>cards.find(c=>c.uid===uid)):[];b.overflowSelection=group?[...x.overflowSelection]:[];
        enemies.forEach((m,j)=>{
          b.targetIndex=j;const maxHp=configs[j].layers.reduce((a,b)=>a+b,0);b.enemy.cells=[...m.cells];b.enemy.armor=[...m.armor];b.enemy.strength=old?Math.floor(m.strength/2):m.strength;b.intentIndex=m.intentIndex;
          if(old){const oldMax=oldE.layers.reduce((a,b)=>a+b,0),sum=b.enemy.cells.reduce((a,b)=>a+b,0),target=Math.min(sum,Math.ceil(sum/oldMax*maxHp));let remaining=sum;while(remaining>target){const largest=Math.max(...b.enemy.cells),i=b.enemy.cells.indexOf(largest);b.enemy.cells[i]--;remaining--;}}
          b.syncEnemy();b.enemy.maxHp=maxHp;
        });
        b.targetIndex=targetIndex;
        for(const key of ['energy','turn','status','played','attackRemainder'])b[key]=x[key];b.phase=b.status==='playing'?'player':'finished';b.log=[...x.log];if(old)b.log.push('存档已升级：当前敌人按剩余比例降低生命，包扎次数限制解除。');run.battle=b;
        assert((b.status==='won'&&!b.living.length)||(b.status==='lost'&&b.living.length>0&&!!run.hero.failureReason)||(b.status==='playing'&&b.living.length>0&&b.enemy.hp>0&&!run.hero.failureReason));
        assert(s.screen==='battle'?b.status==='playing':s.screen==='lost'?b.status==='lost':b.status==='won');
      }else assert(!['battle','reward','cleared'].includes(s.screen));
      if(s.screen==='reward')assert(n.type!=='boss');if(!['lost','cleared'].includes(s.screen))assert(!run.hero.failureReason);if(s.screen==='lost')assert(!!run.hero.failureReason);
      if(!old&&s.lastLoot!==null){const loot=s.lastLoot;assert(['reward','cleared'].includes(s.screen)&&loot&&integer(loot.gold,0,1000)&&integer(loot.fallbackGold,0,45)&&ids(loot.relics,relicIds,0,1)&&loot.relics.every(id=>run.relics.includes(id)));run.lastLoot={gold:loot.gold,relics:[...loot.relics],fallbackGold:loot.fallbackGold};}
      if(old&&['reward','cleared'].includes(s.screen)){run.lastLoot={gold:0,relics:[],fallbackGold:0};if(['elite','boss'].includes(n.type)){const id=run.dropRelic();if(id)run.lastLoot.relics.push(id);else run.lastLoot.fallbackGold=45;}}
      run.migrated=!upgrades;
      return{run,options:{auto:data.options?.auto===true,sound:data.options?.sound===true},migrated:!upgrades};
    }
  }
  Floor.types=types;Floor.encounter=encounter;Floor.legacyLayout=legacyLayout;Floor.nodes=makeMap(1,5);Floor.connects=connects;
  root.EmberFloor=Floor;if(typeof module!=='undefined'&&module.exports)module.exports=Floor;
})(typeof globalThis!=='undefined'?globalThis:this);
