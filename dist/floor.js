/* One local floor, seeded encounters and explicit save hydration. Authored by Codex. */
(function (root) {
  'use strict';
  const R = root.EmberRules || require('./balance.js');
  const Body = root.EmberBody || require('./body.js').HeroBody;
  const types = {
    battle: { name: '战斗', mark: '⚔', note: '击败构装体，获得金币与一张可选卡牌。' },
    elite: { name: '精英', mark: '♜', note: '更厚的生命层与更强攻击；奖励更多金币。' },
    event: { name: '事件', mark: '?', note: '遗迹里仍有回声。选择补给，或带走旧时代的钱币。' },
    shop: { name: '商店', mark: '¤', note: '用金币购买卡牌、治疗或穿甲遗物。' },
    camp: { name: '营火', mark: '♨', note: '休息修复存活部位，或学习新的形状攻击。' },
    treasure: { name: '宝箱', mark: '◇', note: '带走一件遗物。遗物持续作用于这一层。' },
    boss: { name: '关底 Boss', mark: '♛', note: '灰冠门主 · 半血后攻击强化。击败它，完成这一层。' }
  };
  const layout = [
    [[0,'battle'],[2,'battle']],
    [[0,'event'],[1,'battle'],[2,'shop']],
    [[0,'camp'],[1,'elite'],[2,'event']],
    [[0,'battle'],[2,'treasure']],
    [[0,'shop'],[1,'camp'],[2,'elite']],
    [[0,'event'],[2,'battle']],
    [[0,'camp'],[2,'treasure']],
    [[1,'boss']]
  ];
  const nodes = layout.flatMap((row, r) => row.map(([lane,type]) => ({ id: `r${r}c${lane}`, row:r, lane, type })));
  const nodeById = id => nodes.find(n => n.id === id);
  const connects = (a,b) => b.row === a.row + 1 && (b.type === 'boss' || Math.abs(a.lane-b.lane) <= 1);
  const intent = (name,damage=0,block=0,strength=0) => ({name,type:damage?'attack':'defend',damage,block,strength});
  function encounter(node) {
    const r = node.row, boss = node.type === 'boss', elite = node.type === 'elite';
    const name = boss ? '灰冠门主' : elite ? '铜棘执刑者' : ['苔石哨兵','裂隙巡卫','锈火构装体'][r%3];
    const pattern = boss ? [0,3,4,4,3,0,3,5,6,6,5,3,2,4,5,5,4,2,0,2,3,3,2,0]
      : elite ? R.enemyLayers.map(v=>v ? v+1 : 0)
      : R.enemyLayers.map((v,i)=>Math.max(0,v-(r<2 && i%3===0 ? 1 : 0)) + (r>3 && v>1 ? 1 : 0));
    const damage = boss ? 10 : elite ? 9 : 5 + Math.floor(r/2);
    return { id:node.id, name, kind:node.type, role:boss?'灰冠 · 回廊的终点':elite?'精英 · 铜棘构装体':'遗迹构装体', layers:pattern,
      reward:boss?100:elite?45:24+r*3,
      intents:[intent(boss?'王冠断击':'碎石挥击',damage),intent(boss?'灰冠壁垒':'石壳覆甲',0,boss?6:elite?4:3),intent(boss?'余火审判':'蓄势猛击',damage-2,0,boss?2:1)] };
  }
  const pool = ['ember','parry','guard','insight','heavy','cross','sweep','wall'];
  const assert = (condition,message='存档内容不完整或数值无效。') => { if(!condition) throw new Error(message); };
  const integer = (v,min,max) => Number.isInteger(v) && v>=min && v<=max;
  const number = (v,min,max) => typeof v==='number' && Number.isFinite(v) && v>=min && v<=max;
  const ids = (value,allowed,min,max) => Array.isArray(value) && value.length>=min && value.length<=max && value.every(x=>typeof x==='string' && allowed.includes(x));
  class Floor {
    constructor({seed=(Date.now()>>>0)||1}={}) {
      this.seed=seed>>>0||1; this.rngState=this.seed; this.gold=60; this.deck=[...R.deck]; this.relics=[];
      this.hero=new Body(); this.visited=[]; this.nodeId=null; this.screen='map'; this.battle=null; this.offers=[]; this.bought=[];
    }
    random() { let x=this.rngState; x^=x<<13; x^=x>>>17; x^=x<<5; this.rngState=x>>>0; return this.rngState/4294967296; }
    get node() { return nodeById(this.nodeId); }
    get available() { if(this.screen!=='map') return []; const last=nodeById(this.visited.at(-1)); return nodes.filter(n=>last?connects(last,n):n.row===0); }
    enter(id,Battle) {
      if(!this.available.some(n=>n.id===id)) return false;
      this.nodeId=id; this.bought=[]; this.offers=[];
      if(['battle','elite','boss'].includes(this.node.type)) {
        this.hero.block=0; this.hero.boostTurns=0; this.hero.bandages=3; this.hero.stimulants=1; this.hero.lastHits=[];
        this.battle=new Battle({hero:this.hero,relics:this.relics,deck:this.deck,encounter:encounter(this.node),rng:()=>this.random()});
        this.screen='battle';
      } else { this.battle=null; this.screen='node'; }
      return true;
    }
    finishBattle() {
      if(this.screen!=='battle' || !this.battle || this.battle.status==='playing') return;
      if(this.battle.status==='lost') { this.screen='lost'; return; }
      this.gold+=encounter(this.node).reward;
      if(this.node.type==='boss') { this.visited.push(this.nodeId); this.screen='cleared'; return; }
      const choices=[...pool]; this.offers=[];
      while(this.offers.length<3) this.offers.push(choices.splice(Math.floor(this.random()*choices.length),1)[0]);
      this.screen='reward';
    }
    heal(ratio,blood=25) {
      for(const p of this.hero.parts) { if(this.hero.available(p.id)) p.hp=Math.min(p.maxHp,p.hp+Math.max(1,Math.ceil(p.maxHp*ratio))); p.bleed=0; }
      this.hero.blood=Math.min(100,this.hero.blood+blood);
    }
    addRelic(id) {
      if(this.relics.includes(id)) return false;
      this.relics.push(id);
      if(id==='heart') for(const [part,amount] of [['torso',6],['heart',4]]) { const p=this.hero.part(part); p.maxHp+=amount; if(this.hero.available(part)) p.hp+=amount; }
      return true;
    }
    leave() {
      this.visited.push(this.nodeId); this.hero.block=0; this.hero.boostTurns=0; this.heal(.04,8);
      this.nodeId=null; this.battle=null; this.offers=[]; this.bought=[]; this.screen=this.hero.failureReason?'lost':'map';
    }
    chooseCard(id) {
      if(this.screen!=='reward' || (id!=='skip' && !this.offers.includes(id))) return false;
      if(id!=='skip') this.deck.push(id); this.leave(); return true;
    }
    choose(action) {
      if(this.screen!=='node') return {ok:false};
      const type=this.node.type;
      if(type==='camp' && ['rest','train'].includes(action)) { if(action==='rest') this.heal(.4,45); else this.deck.push('cross'); }
      else if(type==='event' && ['spring','coins'].includes(action)) { if(action==='spring') this.heal(.25,35); else this.gold+=50; }
      else if(type==='treasure' && ['heart','blade','gold'].includes(action)) { if(action==='gold') this.gold+=60; else if(!this.addRelic(action)) return {ok:false,reason:'已经拥有这件遗物。'}; }
      else if(type==='shop' && action==='leave') { /* Purchases are committed separately. */ }
      else return {ok:false};
      this.leave(); return {ok:true};
    }
    buy(id) {
      if(this.screen!=='node' || this.node.type!=='shop') return {ok:false};
      const catalog={heal:{cost:35},sweep:{cost:35},wall:{cost:35},blade:{cost:65}};
      const item=catalog[id];
      if(!item || this.bought.includes(id) || (id==='blade' && this.relics.includes('blade'))) return {ok:false,reason:'这件商品已经售出。'};
      if(this.gold<item.cost) return {ok:false,reason:'金币不足。'};
      this.gold-=item.cost; this.bought.push(id);
      if(id==='heal') this.heal(.3,40); else if(id==='blade') this.addRelic(id); else this.deck.push(id);
      return {ok:true};
    }
    snapshot(options={}) {
      const h=this.hero,b=this.battle;
      return {format:'ember-corridor',version:1,savedAt:new Date().toISOString(),options:{auto:!!options.auto,sound:!!options.sound},
        run:{seed:this.seed,rngState:this.rngState,gold:this.gold,deck:[...this.deck],relics:[...this.relics],visited:[...this.visited],nodeId:this.nodeId,screen:this.screen,offers:[...this.offers],bought:[...this.bought],
          hero:{parts:h.parts.map(p=>({id:p.id,hp:p.hp,bleed:p.bleed,missing:p.missing,detachedBy:p.detachedBy})),block:h.block,blood:h.blood,boostTurns:h.boostTurns,bandages:h.bandages,stimulants:h.stimulants},
          battle:b?{cells:[...b.enemy.cells],armor:[...b.enemy.armor],strength:b.enemy.strength,energy:b.energy,turn:b.turn,intentIndex:b.intentIndex,status:b.status,played:b.played,attackRemainder:b.attackRemainder,
            hand:b.hand.map(c=>c.uid),draw:b.drawPile.map(c=>c.uid),discard:b.discardPile.map(c=>c.uid),exhaust:b.exhaustPile.map(c=>c.uid),log:b.log.slice(-120)}:null}};
    }
    static restore(data,Battle) {
      assert(data && data.format==='ember-corridor' && data.version===1,'不是本游戏的存档，或存档版本暂不支持。');
      const s=data.run; assert(s && typeof s==='object');
      assert(integer(s.seed,1,4294967295) && integer(s.rngState,1,4294967295) && integer(s.gold,0,100000));
      assert(ids(s.deck,Object.keys(R.cards),10,100) && ids(s.relics,['heart','blade'],0,2) && new Set(s.relics).size===s.relics.length);
      assert(ids(s.visited,nodes.map(n=>n.id),0,8) && new Set(s.visited).size===s.visited.length);
      s.visited.forEach((id,i)=>assert(i?connects(nodeById(s.visited[i-1]),nodeById(id)):nodeById(id).row===0));
      assert(['map','node','battle','reward','lost','cleared'].includes(s.screen));
      const n=nodeById(s.nodeId),last=nodeById(s.visited.at(-1));
      assert(s.nodeId===null || !!n);
      assert(s.screen!=='map' || (s.nodeId===null && (!last || last.type!=='boss')));
      if(n && s.screen!=='cleared') assert(!s.visited.includes(n.id) && (last?connects(last,n):n.row===0));
      if(['node','battle','reward','cleared'].includes(s.screen)) assert(!!n);
      if(s.screen==='node') assert(!['battle','elite','boss'].includes(n.type));
      if(['battle','reward','cleared'].includes(s.screen)) assert(['battle','elite','boss'].includes(n.type));
      if(s.screen==='cleared') assert(n.type==='boss' && s.visited.at(-1)===n.id);
      assert(ids(s.offers,pool,s.screen==='reward'?3:0,s.screen==='reward'?3:0) && new Set(s.offers).size===s.offers.length);
      assert(ids(s.bought,['heal','sweep','wall','blade'],0,4) && new Set(s.bought).size===s.bought.length);
      assert(s.bought.length===0 || n?.type==='shop');
      const run=new Floor({seed:s.seed});
      run.rngState=s.rngState; run.gold=s.gold; run.deck=[...s.deck]; run.relics=[...s.relics]; run.visited=[...s.visited]; run.nodeId=s.nodeId; run.screen=s.screen; run.offers=[...s.offers]; run.bought=[...s.bought];
      const h=s.hero; assert(h && Array.isArray(h.parts) && h.parts.length===Body.partDefinitions.length);
      run.hero=new Body({relic:s.relics.includes('heart')?'heart':null});
      for(const p of run.hero.parts) {
        const entries=h.parts.filter(x=>x && x.id===p.id); assert(entries.length===1); const x=entries[0];
        assert(integer(x.hp,0,p.maxHp) && number(x.bleed,0,1000) && typeof x.missing==='boolean' && x.missing===(x.hp===0));
        assert(x.detachedBy===null || (x.missing && x.detachedBy===p.parent));
        p.hp=x.hp; p.bleed=x.bleed; p.missing=x.missing; p.detachedBy=x.detachedBy;
      }
      for(const p of run.hero.parts) if(p.parent && !run.hero.available(p.parent)) assert(p.missing);
      assert(number(h.blood,0,100) && integer(h.block,0,10000) && integer(h.boostTurns,0,3) && integer(h.bandages,0,3) && integer(h.stimulants,0,1));
      for(const key of ['block','blood','boostTurns','bandages','stimulants']) run.hero[key]=h[key];
      if(s.battle!==null) {
        assert(n && ['battle','elite','boss'].includes(n.type) && ['battle','reward','lost','cleared'].includes(s.screen));
        const x=s.battle,e=encounter(n);
        assert(Array.isArray(x.cells) && x.cells.length===24 && x.cells.every((v,i)=>integer(v,0,e.layers[i])));
        assert(Array.isArray(x.armor) && x.armor.length===24 && x.armor.every((v,i)=>typeof v==='boolean' && (!v || x.cells[i]>0)));
        assert(integer(x.strength,0,100000) && integer(x.energy,0,100) && integer(x.turn,1,10000) && integer(x.intentIndex,0,e.intents.length-1) && integer(x.played,0,100000) && number(x.attackRemainder,0,1-Number.EPSILON));
        assert(['playing','won','lost'].includes(x.status));
        const cards=s.deck.map((id,i)=>({id,uid:`card-${i}`})),uids=cards.map(c=>c.uid),areas=['hand','draw','discard','exhaust'];
        for(const key of areas) assert(ids(x[key],uids,0,key==='hand'?9:100));
        const all=areas.flatMap(key=>x[key]); assert(all.length===cards.length && new Set(all).size===cards.length);
        assert(x.exhaust.every(uid=>cards.find(c=>c.uid===uid).id==='focus'));
        assert(Array.isArray(x.log) && x.log.length<=120 && x.log.every(l=>typeof l==='string' && l.length<=500));
        const b=new Battle({hero:run.hero,relics:run.relics,deck:run.deck,encounter:e,rng:()=>0});
        b.rng=()=>run.random(); b.allCards=cards;
        for(const [from,to] of [['hand','hand'],['draw','drawPile'],['discard','discardPile'],['exhaust','exhaustPile']]) b[to]=x[from].map(uid=>cards.find(c=>c.uid===uid));
        b.enemy.cells=[...x.cells]; b.enemy.armor=[...x.armor]; b.enemy.strength=x.strength; b.syncEnemy();
        for(const key of ['energy','turn','intentIndex','status','played','attackRemainder']) b[key]=x[key];
        b.phase=b.status==='playing'?'player':'finished'; b.log=[...x.log]; run.battle=b;
        assert((b.status==='won' && b.enemy.hp===0) || (b.status==='lost' && b.enemy.hp>0 && !!run.hero.failureReason) || (b.status==='playing' && b.enemy.hp>0 && !run.hero.failureReason));
        assert(s.screen==='battle'?b.status==='playing':s.screen==='lost'?b.status==='lost':b.status==='won');
      } else assert(!['battle','reward','cleared'].includes(s.screen));
      if(s.screen==='reward') assert(n.type!=='boss');
      if(!['lost','cleared'].includes(s.screen)) assert(!run.hero.failureReason);
      if(s.screen==='lost') assert(!!run.hero.failureReason);
      return {run,options:{auto:data.options?.auto===true,sound:data.options?.sound===true}};
    }
  }
  Floor.nodes=nodes; Floor.types=types; Floor.connects=connects; Floor.encounter=encounter;
  root.EmberFloor=Floor;
  if(typeof module!=='undefined' && module.exports) module.exports=Floor;
})(typeof globalThis!=='undefined'?globalThis:this);
