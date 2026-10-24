(function (root) {
  'use strict';
  const R = root.EmberRules || (typeof require === 'function' ? require('./balance.js') : null);
  const Body = root.EmberBody || (typeof require === 'function' ? require('./body.js').HeroBody : null);
  const S = root.EmberStatuses || (typeof require === 'function' ? require('./statuses.js') : null);
  const P = root.EmberProgression || (typeof require === 'function' ? require('./progression.js') : null);
  const E = root.EmberExploration || (typeof require === 'function' ? require('./exploration.js') : null);
  class Battle {
    constructor({ rng = Math.random, relic = null, relics = [], techs = [], hero = null, deck = R.deck, encounter = null } = {}) {
      this.rng = rng; this.relic = relic; this.relics = [...relics]; this.techs=[...techs];this.tech=P.bonuses(techs);this.baseEncounter=encounter;
      this.hero = hero || new Body({ relic }); this.attackRemainder = 0;this.heroState=S.create();this.statusEvents=[];this.statusHits=[];
      this.columns = R.gridColumns; this.rows = R.gridRows;
      this.maxCellLayers = R.maxCellLayers;
      this.encounters=encounter?.members||[encounter];this.targetIndex=0;
      this.members=this.encounters.map(e=>{const cells=Array.from({length:this.columns*this.rows},(_,i)=>this.clampLayers((e?.layers||R.enemyLayers)[i])),hp=cells.reduce((a,b)=>a+b,0);return{...S.create(),hp,maxHp:hp,block:0,strength:0,intentIndex:0,cells,armor:Array(cells.length).fill(false)};});
      this.energy = this.effects.energy + (encounter ? this.relicBonus('openingEnergy')+this.tech.openingEnergy : 0); this.turn = 1; this.intentIndex = 0; this.status = 'playing'; this.phase = 'player'; this.played = 0;
      this.allCards = deck.map((id, i) => ({ id, uid: `card-${i}` }));
      const opening = encounter ? this.shuffle(this.allCards) : this.allCards;
      const initialDraw=this.effects.draw+(encounter?this.relicBonus('openingDraw')+this.tech.openingDraw:0);
      this.hand = opening.slice(0,Math.min(9,initialDraw));this.pendingDraw=opening.slice(9,initialDraw);this.overflowSelection=[];
      this.drawPile = encounter ? opening.slice(initialDraw) : this.shuffle(opening.slice(initialDraw)); this.discardPile = []; this.exhaustPile = [];
      if(encounter) this.hero.block += this.relicBonus('openingBlock')+this.relicBonus('turnBlock')+this.tech.openingBlock+this.tech.turnBlock;
      this.log = [`你举起提灯，${encounter?.name || '石门守卫'}从沉眠中醒来。`];
    }
    get enemy(){return this.members[this.targetIndex];}
    get encounter(){return this.encounters[this.targetIndex];}
    get intentIndex(){return this.enemy.intentIndex;}
    set intentIndex(value){this.enemy.intentIndex=value;}
    get living(){return this.members.map((e,i)=>e.hp>0?i:-1).filter(i=>i>=0);}
    get overflowCount(){return this.pendingDraw.length;}
    selectTarget(index){if(!Number.isInteger(index)||!this.members[index]?.hp||this.phase!=='player'||this.status!=='playing')return false;this.targetIndex=index;return true;}
    intentFor(index){
      const e=this.encounters[index],m=this.members[index],base=(e?.intents||R.intents)[m.intentIndex],enraged=e?.kind==='boss'&&m.hp<=m.maxHp/2;
      if(m.staggered)return{name:'失衡 · 跳过行动',type:'stagger',damage:0,block:0,strength:0,inflict:[]};
      const profile=e?.statusesEnabled?R.enemyStatusProfiles[e.enemyId]:null,active=base.damage&&profile&&(m.intentIndex===2||(profile.kind==='tremor'&&m.intentIndex===0));
      return{...base,name:base.name+(enraged&&base.damage?' · 狂怒':'')+(active?' · '+R.statuses[profile.kind].name:''),damage:base.damage?Math.max(1,base.damage+m.strength+(enraged?e.enrage||0:0)-m.dread):0,inflict:active?[profile]:[],tremorBurst:active&&profile.kind==='tremor'&&m.intentIndex===2};
    }
    shuffle(cards) {
      const a = [...cards];
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    }
    relicBonus(key) { return this.relics.reduce((sum,id)=>sum+(R.relics[id]?.[key]||0),0); }
    get effects() { const e={...this.hero.effects}; e.attack*=(1+this.relicBonus('attack')+this.tech.attack+(this.hero.boostTurns?this.relicBonus('boostAttack'):0))*Math.max(.25,1-this.heroState.dread*.1);e.block*=1+this.relicBonus('guard')+this.tech.guard;e.energy=Math.min(6,e.energy+this.relicBonus('energy'));e.draw+=this.relicBonus('draw');e.healing+=this.relicBonus('healing')+this.tech.healing;e.incoming*=this.heroState.staggered?1.25:1;return e; }
    get intent() {return this.intentFor(this.targetIndex);}
    definition(card) {
      const d = { ...R.cards[typeof card === 'string' ? card : card.id] }, effects = this.effects;
      if (d.shape) { d.damage = d.shape.length; d.power = effects.attack * (1+(d.powerBonus||0))*(this.enemy.staggered?1.25:1); d.pierce = !!d.pierce || this.relic === 'blade' || this.relics.includes('blade'); }
      d.block = Math.max(0, Math.floor(d.block * effects.block + 1e-8));
      if (d.draw) d.draw = Math.max(1, Math.round(d.draw * this.hero.capacities.consciousness));
      if(d.inflict)d.inflict=d.inflict.map(a=>({...a,potency:Math.min(20,a.potency+this.tech.statusPotency)}));
      d.description = [d.shape ? `${d.shape.length}格${d.shapeName}攻击，当前攻效${Math.round(d.power * 100)}%。` : '',d.pierce?'穿甲。':'', d.block ? `获得${d.block}点格挡。` : '', d.draw ? `抽${d.draw}张牌。` : '', d.energy ? `获得${d.energy}能量。` : '',d.heal?`修复最重的存活伤处约${Math.round(d.heal*this.hero.capacities.metabolism)}点。`:'',d.cleanse?'全部止血。':'',d.exhaust?'消耗。':''].filter(Boolean).join('');
      d.description+=R.describeAffliction(d);
      return d;
    }
    stateFor(who){return who==='hero'?this.heroState:this.enemy;}
    staggerThreshold(who){return who==='hero'?8:Math.max(3,Math.ceil(this.enemy.maxHp*.2));}
    emitStatus(kind,who,text,amount=0){const event={kind,who,index:who==='enemy'?this.targetIndex:null,text,amount};this.statusEvents.push(event);this.log.push(text);}
    statusDamage(who,amount,kind){
      let lost=0;
      if(who==='enemy'){
        for(let i=0;i<amount&&this.enemy.hp>0;i++){const largest=Math.max(...this.enemy.cells),index=this.enemy.cells.indexOf(largest);this.enemy.cells[index]--;lost++;this.syncEnemy();}
      }else if(kind==='bleed'){lost=Math.min(this.hero.blood,amount);this.hero.blood-=lost;}
      else{
        const pool=this.hero.parts.filter(p=>this.hero.available(p.id)),total=pool.reduce((sum,p)=>sum+p.weight,0);
        let roll=this.rng()*total;const target=pool.find(p=>(roll-=p.weight)<0)||pool.at(-1),hits=[];
        if(target&&!this.hero.failureReason)lost=this.hero.injure(target.id,amount,hits);this.statusHits.push(...hits);
      }
      const name=who==='hero'?'旅人':this.encounter?.name||'敌人';
      this.emitStatus(kind,who,name+' · '+R.statuses[kind].name+' −'+lost+(who==='hero'&&kind==='bleed'?' 血容量':' 生命'),lost);return lost;
    }
    triggerDamage(who,kind){const p=S.consume(this.stateFor(who),kind);if(p)this.statusDamage(who,p,kind);}
    onHurt(who,burst=false){
      const alive=()=>who==='hero'?!this.hero.failureReason:this.enemy.hp>0,state=this.stateFor(who);
      if(!alive())return;this.triggerDamage(who,'rupture');if(!alive())return;
      const sinking=S.consume(state,'sinking');if(sinking){state.dread=Math.min(9,state.dread+sinking);this.emitStatus('sinking',who,(who==='hero'?'旅人':this.encounter?.name||'敌人')+' · 沉沦触发，攻击压制 '+state.dread+'。');}
      if(burst&&state.ailments.tremor&&!state.staggered){
        const p=state.ailments.tremor.potency,threshold=this.staggerThreshold(who);state.stagger+=p;
        if(state.stagger>=threshold){state.stagger=0;state.staggered=true;}
        this.emitStatus('tremor',who,(who==='hero'?'旅人':this.encounter?.name||'敌人')+' · 震颤爆发 '+p+'，'+(state.staggered?'陷入失衡！':'失衡进度 '+state.stagger+'/'+threshold+'。'));
      }
    }
    inflict(who,effects){
      if(who==='hero'?!!this.hero.failureReason:!this.enemy.hp)return;
      for(const a of effects||[]){S.add(this.stateFor(who),a);this.emitStatus(a.kind,who,(who==='hero'?'旅人':this.encounter?.name||'敌人')+' · 获得'+R.statuses[a.kind].name+' '+a.potency+'威力 / '+a.count+'次数。');}
    }
    canBandage(id){return this.hero.canTreat(id)||!!this.heroState.ailments.bleed;}
    shapeFor(card, rotation = 0) {
      let points = (this.definition(card).shape || []).map(p => [...p]);
      for (let i = 0; i < ((rotation % 4) + 4) % 4; i++) {
        const height = Math.max(...points.map(p => p[1])) + 1;
        points = points.map(([x, y]) => [height - 1 - y, x]);
      }
      return points;
    }
    planAttack(card, { x, y, rotation = 0 } = {}) {
      const d = this.definition(card), shape = this.shapeFor(card, rotation);
      if (!shape.length || !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(rotation)) return { ok: false, reason: '请先选择攻击图案的落点。', cells: [], hits: [], blocked: [] };
      let remainder = this.attackRemainder;
      const cells = shape.map(([dx, dy]) => {
        const cx = x + dx, cy = y + dy, inBounds = cx >= 0 && cx < this.columns && cy >= 0 && cy < this.rows, index = cy * this.columns + cx;
        const layers = inBounds ? this.enemy.cells[index] : 0;
        const exact = d.power + remainder, force = Math.floor(exact + 1e-8); remainder = Math.max(0, exact - force);
        const armored = inBounds && this.enemy.armor[index], breaksArmor = layers > 0 && armored && !d.pierce && force > 0;
        const lost = Math.min(layers, Math.max(0, force - (breaksArmor ? 1 : 0)));
        return { x: cx, y: cy, index, inBounds, layers, alive: layers > 0, armored, force, lost, breaksArmor };
      });
      const fits = cells.every(c => c.inBounds);
      const hits = cells.filter(c => c.lost > 0), blocked = cells.filter(c => c.breaksArmor);
      const occupied = cells.some(c => c.alive), ok = fits && occupied && d.power > 0;
      return { ok, cells, hits, blocked, damage: hits.reduce((sum, c) => sum + c.lost, 0), cleared: hits.filter(c => c.lost === c.layers).length, nextRemainder: remainder, x, y, rotation, reason: !fits ? '形状超出棋盘，请向内移动或旋转。' : !occupied ? '这里已经全空，请换一个仍有生命格的位置。' : d.power <= 0 ? '操作能力已丧失，无法打出攻击；可以使用技能或医疗。' : '' };
    }
    clampLayers(value) { return Math.max(0, Math.min(this.maxCellLayers, Math.trunc(Number(value) || 0))); }
    syncEnemy() {
      this.enemy.cells = this.enemy.cells.map(value => this.clampLayers(value));
      this.enemy.hp = this.enemy.cells.reduce((sum, layers) => sum + layers, 0);
      this.enemy.armor = this.enemy.armor.map((armored, i) => !!armored && this.enemy.cells[i] > 0);
      this.enemy.block = this.enemy.armor.filter(Boolean).length;
    }
    autoPlacement(card) {
      let best = null, score = -1;
      for (let rotation = 0; rotation < 4; rotation++) for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.columns; x++) {
        const plan = this.planAttack(card, { x, y, rotation });
        const value = plan.damage * (this.enemy.cells.length + 1) + plan.blocked.length;
        if (plan.ok && value > score) { best = { x, y, rotation }; score = value; }
      }
      return best;
    }
    grantArmor(count) {
      this.enemy.armor.fill(false);
      for (let i = 0; i < this.enemy.cells.length && count > 0; i++) if (this.enemy.cells[i]) { this.enemy.armor[i] = true; count--; }
      this.syncEnemy();
    }
    draw(count) {
      for (let i = 0; i < count; i++) {
        if (!this.drawPile.length && this.discardPile.length) { this.drawPile = this.shuffle(this.discardPile); this.discardPile = []; this.log.push('弃牌重新洗入抽牌堆。'); }
        if (!this.drawPile.length) break;
        (this.hand.length<9?this.hand:this.pendingDraw).push(this.drawPile.shift());
      }
    }
    toggleOverflow(uid){
      if(!this.overflowCount||this.status!=='playing'||![...this.hand,...this.pendingDraw].some(c=>c.uid===uid))return false;
      const i=this.overflowSelection.indexOf(uid);if(i>=0)this.overflowSelection.splice(i,1);else if(this.overflowSelection.length<this.overflowCount)this.overflowSelection.push(uid);else return false;return true;
    }
    confirmOverflow(){
      if(!this.overflowCount||this.status!=='playing'||this.overflowSelection.length!==this.overflowCount)return false;
      const all=[...this.hand,...this.pendingDraw],selected=new Set(this.overflowSelection);
      if(selected.size!==this.overflowCount||![...selected].every(uid=>all.some(c=>c.uid===uid)))return false;
      const discarded=all.filter(c=>selected.has(c.uid));this.hand=all.filter(c=>!selected.has(c.uid));this.discardPile.push(...discarded);this.pendingDraw=[];this.overflowSelection=[];
      this.log.push('整理手牌：确认弃置'+discarded.map(c=>R.cards[c.id].name).join('、')+'，保留'+this.hand.length+'张。');return true;
    }
    checkResult() {
      if (this.hero.failureReason) { this.status = 'lost'; this.phase = 'finished'; this.log.push(`提灯熄灭：${this.hero.failureReason}。`); }
      else if (!this.living.length) { this.status = 'won'; this.phase = 'finished'; this.log.push('全部敌人已被击败。余烬之后，仍有前路。'); }
      else if(!this.enemy.hp)this.targetIndex=this.living[0];
      return this.status;
    }
    play(uid, placement = null) {
      if (this.status !== 'playing' || this.phase !== 'player') return { ok: false, reason: '现在不能出牌。' };
      if(this.overflowCount)return{ok:false,reason:'请先选择并确认超出上限的弃牌。'};
      const index = this.hand.findIndex(c => c.uid === uid);
      if (index < 0) return { ok: false, reason: '这张牌不在手中。' };
      const card = this.hand[index], d = this.definition(card),targetIndex=this.targetIndex,targetName=this.encounter?.name||'石门守卫';
      if(d.shape&&this.heroState.staggered)return{ok:false,reason:'失衡中，本回合不能使用攻击牌；可使用技能、包扎或强化剂。'};
      if (d.cost > this.energy) return { ok: false, reason: '能量不足，可以结束回合恢复能量。' };
      let plan = null;
      if (d.shape) {
        if (!placement) return { ok: false, requiresPlacement: true, reason: '请在敌人的生命方格上放置攻击形状。' };
        plan = this.planAttack(card, placement);
        if (!plan.ok) return { ok: false, reason: plan.reason };
      }
      this.energy -= d.cost; this.hand.splice(index, 1); this.played++;
      (d.exhaust ? this.exhaustPile : this.discardPile).push(card);
      this.statusEvents=[];this.statusHits=[];
      const hit = { lost: 0, blocked: 0, cleared: 0 };
      if(plan){
        this.triggerDamage('hero','bleed');
        if(this.hero.failureReason){this.log.push(d.name+"因出血致命而中断，已消耗卡牌和能量。");this.checkResult();return{ok:true,card,definition:d,hit,plan:null,recovery:null,targetIndex,targetName,interrupted:true,statusEvents:[...this.statusEvents]};}
        this.heroState.dread=0;
      }
      if (plan) {
        for (const c of plan.blocked) { this.enemy.armor[c.index] = false; hit.blocked++; }
        for (const c of plan.hits) { this.enemy.cells[c.index] -= c.lost; this.enemy.armor[c.index] = false; hit.lost += c.lost; if (this.enemy.cells[c.index] === 0) hit.cleared++; }
        this.attackRemainder = plan.nextRemainder;
        this.syncEnemy();
        if(hit.lost){this.onHurt('enemy',d.tremorBurst);this.inflict('enemy',d.inflict);}
      }
      this.hero.block += d.block; this.energy += d.energy;
      if (d.draw) this.draw(d.draw);
      const recovery=(d.heal||d.cleanse)?this.hero.recover(d.heal||0,!!d.cleanse):null;
      if(d.purge?.length){S.purge(this.heroState,d.purge);this.emitStatus('cleanse','hero',d.name+' · '+R.describeAffliction({purge:d.purge}));}
      if(d.cleanse)S.purge(this.heroState,['bleed']);
      const parts = [plan ? `${d.shapeName}在第${plan.y + 1}行第${plan.x + 1}列 / ${((plan.rotation % 4) + 4) % 4 * 90}°，削去 ${hit.lost} 层生命、击碎 ${hit.cleared} 格${hit.blocked ? `，破甲 ${hit.blocked} 格` : ''}` : '', d.block ? `+${d.block} 格挡` : '', d.draw ? `抽 ${d.draw} 张` : '', d.energy ? '+1 能量 · 消耗' : ''].filter(Boolean);
      if(d.energy) parts[parts.length-1]=`+${d.energy}能量${d.exhaust?' · 消耗':''}`;
      if(recovery) parts.push(`${recovery.part||'身体'}修复${recovery.healed}${d.cleanse?'，全部止血':''}`);
      this.log.push(`第 ${this.turn} 回合 · ${d.name}${plan?' → '+targetName:''}：${parts.join('，')}。`); this.checkResult();
      return { ok: true, card, definition: d, hit, plan, recovery,targetIndex,targetName,statusEvents:[...this.statusEvents] };
    }
    medical(action, partId) {
      if (this.status !== 'playing' || this.phase !== 'player') return { ok: false, reason: '现在无法医疗。' };
      if(this.overflowCount)return{ok:false,reason:'请先确认弃牌。'};
      if (this.energy < 1) return { ok: false, reason: '医疗需要1点能量。' };
      const result = action === 'bandage' ? this.hero.canTreat(partId)?this.hero.treat(partId,this.relicBonus('healing')+this.tech.healing):this.heroState.ailments.bleed?{ok:true,part:'战术出血',healed:0,stopped:0}:{ok:false,reason:'没有需要处理的伤口或战术出血。'} : action === 'boost' ? this.hero.stimulate() : { ok: false, reason: '未知医疗操作。' };
      if (!result.ok) return result;
      if(action==='bandage')S.purge(this.heroState,['bleed']);else S.purge(this.heroState,['sinking','tremor']);
      this.energy--;
      this.log.push(action === 'bandage' ? `包扎${result.part}：修复 ${result.healed} 部位生命并止血。` : '注射战斗强化剂：能力提高，持续当前及后续共3个玩家回合，不恢复缺失部位。');
      return { ...result, action };
    }
    endTurn() {
      if (this.status !== 'playing' || this.phase !== 'player'||this.overflowCount) return { ok: false };
      this.phase = 'enemy'; this.discardPile.push(...this.hand); this.hand = [];
      this.statusEvents=[];this.statusHits=[];this.heroState.staggered=false;
      const focused=this.targetIndex,actions=[],hit={lost:0,blocked:0,hits:[]};
      const finish=(recovery=null)=>{
        this.targetIndex=this.members[focused].hp?focused:(this.living[0]??focused);this.hero.lastHits=[...hit.hits,...this.statusHits];
        const intent=actions.length===1?actions[0].intent:{name:actions.length?'敌方联合行动':'状态结算',type:actions.some(a=>a.intent.damage)?'attack':'defend',damage:actions.reduce((s,a)=>s+a.intent.damage,0),block:actions.reduce((s,a)=>s+a.intent.block,0),strength:0};
        return{ok:true,intent,hit,recovery,actions,statusEvents:[...this.statusEvents],statusHits:[...this.statusHits]};
      };
      for(const m of this.members){m.armor.fill(false);m.block=0;}
      for(const index of this.living){
        this.targetIndex=index;const intent=this.intent,name=this.encounter?.name||'石门守卫';
        if(this.enemy.staggered){
          this.enemy.staggered=false;this.emitStatus('tremor','enemy',name+' · 失衡，跳过本次行动。');
          actions.push({index,name,intent,hit:{lost:0,blocked:0,hits:[]}});this.intentIndex=(this.intentIndex+1)%(this.encounter?.intents||R.intents).length;continue;
        }
        if(intent.damage){this.triggerDamage('enemy','bleed');if(!this.enemy.hp)continue;this.enemy.dread=0;}
        const damage=intent.damage?this.hero.receiveAttack(intent.damage*(this.heroState.staggered?1.25:1),this.rng):{lost:0,blocked:0,hits:[]};
        if(damage.lost){this.onHurt('hero',intent.tremorBurst);this.inflict('hero',intent.inflict);}
        if(intent.block)this.grantArmor(intent.block);this.enemy.strength+=intent.strength;
        actions.push({index,name,intent,hit:damage});hit.lost+=damage.lost;hit.blocked+=damage.blocked;hit.hits.push(...damage.hits);
        this.log.push(`${name} · ${intent.name}：${intent.damage?`造成 ${damage.lost} 伤害，格挡吸收 ${damage.blocked}`:`为 ${this.enemy.block} 个生命格覆甲`}${intent.strength?`，力量 +${intent.strength}`:''}。`);
        for(const wound of damage.hits)this.log.push(`命中${wound.name} −${wound.damage}${wound.destroyed?' · 部位毁坏':''}${wound.detached.length?' · 连带缺失：'+wound.detached.join('、'):''}。`);
        this.intentIndex=(this.intentIndex+1)%(this.encounter?.intents||R.intents).length;
        if(this.hero.failureReason)break;
      }
      if(this.checkResult()!=='playing')return finish();
      for(const index of this.living){this.targetIndex=index;this.triggerDamage('enemy','burn');S.consume(this.enemy,'tremor');}
      if(this.checkResult()!=='playing')return finish();
      this.triggerDamage('hero','burn');S.consume(this.heroState,'tremor');
      if(this.checkResult()!=='playing')return finish();
      const recovery = this.hero.advanceTurn();
      if (recovery.bleeding > 0) this.log.push(`流血 ${recovery.bleeding.toFixed(1)}，恢复血容量 ${recovery.recovered.toFixed(1)}；血容量 ${this.hero.blood.toFixed(1)}%。`);
      if (recovery.expired) this.log.push('强化剂到期，身体能力重新计算。');
      if (this.checkResult() !== 'playing') return finish(recovery);
      this.turn++; this.hero.block = this.relicBonus('turnBlock')+this.tech.turnBlock; this.phase = 'player';
      this.energy = this.effects.energy; this.draw(this.effects.draw);
      return finish(recovery);
    }
  }
  root.EmberBattle = Battle;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Battle, rules: R };
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const Floor = root.EmberFloor, A = root.EmberArt, SAVE_KEY = 'ember-corridor.save.v1', BACKUP_KEY = SAVE_KEY + '.backup', PROFILE_KEY='ember-corridor.profile.v1', PROFILE_BACKUP_KEY=PROFILE_KEY+'.backup', MAX_SAVE_SIZE=2097152;
  const phoneUI=document.documentElement.dataset.ui==='phone';
  const artErrors=new Set(),artReady=new Set();
  function setArtImage(element,key){element.hidden=artErrors.has(key);if(element.dataset.artKey!==key){element.dataset.artKey=key;element.src=A[key];}}
  function cropAtlas(element,index,columns,rows){element.style.width=columns*100+'%';element.style.height=rows*100+'%';element.style.left=-(index%columns)*100+'%';element.style.top=-Math.floor(index/columns)*100+'%';}
  setArtImage($('hero-figure'),'hero');setArtImage($('scene-image'),'forest');setArtImage($('expedition-backdrop'),'forest');
  setArtImage($('scene-room-image'),'rooms');setArtImage($('enemy-atlas-image'),'enemies');
  const escapeHtml = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let profile=new P.Profile(),profileIssue='';
  try{const raw=localStorage.getItem(PROFILE_KEY);if(raw){if(raw.length>MAX_SAVE_SIZE)throw new Error();profile=P.Profile.restore(JSON.parse(raw));}}catch(_){profileIssue='永久科技记录暂时无法读取，将尝试从旅途存档恢复。';}
  let run = new Floor({profile}), battle = new Battle({hero:run.hero,deck:run.deck,techs:run.techs}), busy = false, sound = false, auto = false, context, modalOpen = false;
  let savedAt = null, saveError = '', memoryBackup = null, pendingImport = null, startupNotice = '';
  let selectedUid = null, rotation = 0, anchor = { x: 1, y: 1 }, anchorChosen = false;
  let aim = { x: (battle.columns - 1) / 2, y: (battle.rows - 1) / 2 }, aimSource = 'keyboard', edgeSnapped = false;
  let aimFrame = 0, queuedAim = null, wheelAmount = 0, lastWheelAt = 0, lastWheelTurn = -Infinity;
  let selectedPart = 'torso';
  let toastTimer, impactTimer, battleSerial = 0;
  let selectedTech='grip',relicBarKey=null;
  let selectedSeaNode=null,seaViewKey='';
  let seaDrag=null,ignoreSeaClick=false;
  const shakeTimers = new WeakMap();
  const icon = (kind, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${{
    sword: '<path d="m5 19 4-4m-3-2 5 5M8 15l9-11 3-1-1 4-10 9M4 20l2-2"/>',
    shield: '<path d="m12 3 8 3v6c0 4-5 7-8 9-3-2-8-5-8-9V6l8-3Z"/><path d="M12 7v9M8 11h8"/>',
    flame: '<path d="M13 2c2 6-1 7-1 10 3-1 4-3 4-5 6 7 4 14-4 14S2 13 8 7c-1 5 0 5 1 6 0-4 4-6 4-11Z"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    star: '<path d="m12 2 2 7 7 3-7 2-2 8-2-8-7-2 7-3 2-7Z"/>',
    cards: '<rect x="7" y="4" width="12" height="16" rx="2"/><path d="m5 6-2 1 2 14 11 1M10 8h6m-6 4h6m-6 4h3"/>',
    reset: '<path d="M4 9a8 8 0 1 1 0 7M4 3v6h6"/>',
    sound: '<path d="m3 9 4 0 5-4v14l-5-4H3V9Z"/><path d="M16 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 10v7m0-11v1"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>'
  }[kind] || ''}</svg>`;
  const nodeIcon = type => `<svg class="node-symbol" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${{
    battle:'<path d="m8 24 15-17 3-1-1 4L10 26M6 18l8 7m-7-2-3 4M24 22 9 7 6 6l1 4 15 15m-4-1 7-7m-2 6 4 4"/>',
    elite:'<path d="m6 12 4-6 6 3 6-3 4 6-3 10-7 6-7-6Z"/><path d="m10 15 4 2m8-2-4 2m-4 5h4m-2-5v3M10 6l-1-4m13 4 1-4"/>',
    event:'<path d="M10 10c0-8 14-8 14 0 0 5-8 5-8 10m0 6v1"/><path d="m5 6-2 3m23 15 3-2"/>',
    shop:'<path d="M8 12h16l3 16H5Z"/><path d="M11 12V8a5 5 0 0 1 10 0v4m-5 5v7m-3-5c0-3 6-3 6 0s-6 0-6 3 6 3 6 0"/>',
    camp:'<path d="M17 3c3 7-5 9-2 15 3-1 5-4 5-7 9 10 3 15-4 15S4 20 9 13c0 4 2 5 3 5-2-6 6-9 5-15Z"/><path d="m7 28 18-1m-18-1 18 3"/>',
    treasure:'<path d="M5 14h22v13H5Zm0 0 3-8h16l3 8M9 6v21m14-21v21"/><path d="M14 13h4v7h-4Z"/>',
    boss:'<path d="m4 9 6 5 6-9 6 9 6-5-3 15H7Z"/><path d="M8 28h16m-14-9 2 1m10-1-2 1m-6 3h4"/>'
  }[type] || ''}</svg>`;
  function shapeArt(points) {
    const columns = Math.max(...points.map(p => p[0])) + 1, rows = Math.max(...points.map(p => p[1])) + 1;
    return `<span class="poly-art"><span class="shape-preview-grid" style="--shape-cols:${columns};--shape-rows:${rows}">${points.map(([x, y]) => `<i style="grid-column:${x + 1};grid-row:${y + 1}"></i>`).join('')}</span></span>`;
  }
  function atlasArt(key,index,columns,rows,extra=''){
    return `<span class="atlas-frame ${extra}" aria-hidden="true"><img class="atlas-image" data-art-key="${key}" src="${A[key]}" alt="" draggable="false" style="width:${columns*100}%;height:${rows*100}%;left:${-(index%columns)*100}%;top:${-Math.floor(index/columns)*100}%"></span>`;
  }
  const art = id => {
    const artId=R.cards[id].art||id;
    const index=['strike','guard','heavy','ember','insight','parry','focus','cross','sweep','wall'].indexOf(artId);
    const extra=['hook','zigzag','diagonal','spear','ring','burst','fork','cleave','needle','crescent','bulwark','retreat','channel','renew','suture','clarity','feint','brace','pulse','backstab'].indexOf(artId),expanded=index<0&&extra>=0&&!artErrors.has('cardsExtra'),i=expanded?extra:index<0?(R.cards[id].shape?2:4):index;
    const picture=expanded?atlasArt('cardsExtra',i,5,4,'painted-card-art'):!artErrors.has('cards')?atlasArt('cards',i,5,2,'painted-card-art'):'<span class="art-placeholder">✦</span>';
    return picture+(R.cards[id].shape?`<span class="card-shape-badge">${shapeArt(R.cards[id].shape)}</span>`:'');
  };
  function tone(freq = 200, dur = .12, type = 'sine') {
    if (!sound) return;
    try { context ||= new (root.AudioContext || root.webkitAudioContext)(); context.resume(); const o = context.createOscillator(), g = context.createGain(); o.type = type; o.frequency.setValueAtTime(freq, context.currentTime); o.frequency.exponentialRampToValueAtTime(freq * .55, context.currentTime + dur); g.gain.setValueAtTime(.035, context.currentTime); g.gain.exponentialRampToValueAtTime(.001, context.currentTime + dur); o.connect(g).connect(context.destination); o.start(); o.stop(context.currentTime + dur); } catch (_) { sound = false; }
  }
  function toast(text) { $('toast').textContent = text; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2400); }
  function floatText(target, text, kind = '') { const e = document.createElement('span'); e.className = `float-text ${kind}`; e.textContent = text; $(target).appendChild(e); setTimeout(() => e.remove(), 1300); }
  function shake(target, cls = 'hit') { const e = $(target); clearTimeout(shakeTimers.get(e)); e.classList.remove('hit', 'attacking', 'shield-up', 'impact-pulse'); void e.offsetWidth; e.classList.add(cls); shakeTimers.set(e, setTimeout(() => e.classList.remove(cls), 650)); }
  function effectPoint(element) {
    const a = $('arena').getBoundingClientRect();let b = element.getBoundingClientRect();
    if(!b.width&&!b.height&&element.id==='hero-figure')b=$('hero-actor').getBoundingClientRect();
    if(phoneUI)return{x:b.left+b.width/2,y:b.top+b.height/2};
    return { x: b.left + b.width / 2 - a.left, y: b.top + b.height / 2 - a.top };
  }
  function effect(className, point, styles = {}) {
    const e = document.createElement('span'); e.className = className; e.style.left = `${point.x}px`; e.style.top = `${point.y}px`;
    Object.entries(styles).forEach(([key, value]) => e.style.setProperty(key, value));
    $('combat-effects').appendChild(e); setTimeout(() => e.remove(), 1000); return e;
  }
  function strikeEffect(from, to, blocked = false) {
    const a = effectPoint($(from)), b = effectPoint($(to));
    const beam = effect(`attack-trail ${blocked ? 'armor-effect' : ''}`, a, { '--trail-length': `${Math.hypot(b.x - a.x, b.y - a.y)}px`, '--trail-angle': `${Math.atan2(b.y - a.y, b.x - a.x)}rad` });
    beam.appendChild(document.createElement('i'));
    effect(`impact-ring ${blocked ? 'armor-effect' : ''}`, b);
  }
  function announceImpact(name, value, detail, kind = '') {
    const banner = $('combat-banner'); clearTimeout(impactTimer);
    $('impact-name').textContent = name; $('impact-value').textContent = value; $('impact-detail').textContent = detail;
    banner.className = `combat-banner ${kind}`; void banner.offsetWidth; banner.classList.add('visible');
    impactTimer = setTimeout(() => banner.classList.remove('visible'), 1500);
  }
  function attackFeedback(result) {
    const { hit, plan, definition: d } = result;
    const target=battle.members.length>1?'enemy-slot-'+result.targetIndex:'enemy-figure',sameTarget=result.targetIndex===battle.targetIndex;
    shake('hero-figure', 'attacking'); shake(target);if(sameTarget)shake('enemy-grid-panel', 'impact-pulse');
    strikeEffect('hero-figure', target, !hit.lost);
    for (const cell of plan.cells.filter(c => sameTarget&&(c.lost > 0 || c.breaksArmor))) {
      const element = $('enemy-grid').children[cell.index], blocked = cell.lost === 0;
      element.classList.add(blocked ? 'cell-cracked' : cell.layers > cell.lost ? 'cell-peeled' : 'cell-shattered');
      const point = effectPoint(element);
      effect(`cell-flash ${blocked ? 'armor-effect' : ''}`, point);
      const shards = !blocked && cell.layers > cell.lost ? 3 : 5;
      for (let i = 0; i < shards; i++) effect(`cell-shard ${blocked ? 'armor-effect' : 'layer-shard'}`, point, { '--layer-color': R.layerColors[cell.layers - 1], '--dx': `${Math.cos(i * Math.PI * .4) * (22 + i * 3)}px`, '--dy': `${Math.sin(i * Math.PI * .4) * 25 - 16}px`, '--spin': `${i * 87 + 45}deg` });
    }
    floatText(battle.members.length>1?target:'enemy-actor', hit.lost ? `−${hit.lost}` : hit.blocked ? `破甲 ${hit.blocked}` : '弱击', hit.lost ? 'damage' : 'block');
    announceImpact(d.name, hit.lost ? `−${hit.lost}` : hit.blocked ? '破甲' : '弱击', `${result.targetName} · ${hit.lost ? `削去 ${hit.lost} 层 · 击碎 ${hit.cleared} 格` : hit.blocked ? '护甲碎裂' : '本次未造成伤害'}${hit.blocked ? ` · 破甲 ${hit.blocked} 格` : ''}`, hit.lost ? 'damage' : 'block');
    tone(hit.lost ? 150 : 360, .2, hit.lost ? 'sawtooth' : 'triangle');
  }
  function saveRun(backup = false) {
    const errors=[];
    // Merge other tabs' permanent records before either copy is saved. Active run bonuses stay frozen.
    try {
      const stored=localStorage.getItem(PROFILE_KEY);
      if(stored){try{if(stored.length>MAX_SAVE_SIZE)throw new Error();profile.merge(P.Profile.restore(JSON.parse(stored)));}catch(_){localStorage.setItem(PROFILE_BACKUP_KEY,stored);}}
      localStorage.setItem(PROFILE_KEY,JSON.stringify(profile.snapshot()));
    }catch(_){errors.push('永久科技保存失败');}
    const data=run.snapshot({auto,sound}),raw=JSON.stringify(data);
    if(backup)memoryBackup=raw;
    try {
      if(backup){const previous=localStorage.getItem(SAVE_KEY);if(previous){memoryBackup=previous;localStorage.setItem(BACKUP_KEY,previous);}}
      localStorage.setItem(SAVE_KEY,raw);savedAt=data.savedAt;
    }catch(_){errors.push('旅途保存失败');}
    saveError=errors.length?errors.join('，')+'，请导出':'';
    updateSaveBadge();
  }
  function updateSaveBadge() {
    $('save-state').textContent=saveError || (savedAt?'已自动保存':'本地存档');
    $('save-button').classList.toggle('save-error',!!saveError);
    $('save-button').setAttribute('aria-label',`存档管理：${saveError || (savedAt?'已自动保存':'可导出或导入')}`);
    $('save-button').title=saveError || (savedAt?`上次保存 ${new Date(savedAt).toLocaleTimeString()} · 点击导出或导入`:'导出 / 导入 JSON 存档');
  }
  function commitAction() { run.finishBattle(); saveRun(); }
  function adoptRun(next) {
    profile.merge(next.profile);next.profile=profile;
    selectedSeaNode=null;
    battleSerial++; clearPlacement(); busy=false; run=next;
    battle=run.battle || new Battle({hero:run.hero,relics:run.relics,techs:run.techs,deck:run.deck,rng:()=>0});
    selectedPart=battle.hero.bestTreatment()?.id || 'torso'; aim={x:2.5,y:1.5}; aimSource='keyboard';
    clearTimeout(impactTimer); $('combat-effects').replaceChildren(); $('combat-banner').classList.remove('visible');
  }
  function downloadSave(raw,name) {
    const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
    const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function exportSave() { saveRun(); downloadSave(JSON.stringify(run.snapshot({auto,sound}),null,2),`余烬回廊-第${run.floorNumber}层-${new Date().toISOString().replace(/[:.]/g,'-')}.json`); }
  function showSaveMenu() {
    if(busy) return;
    let backup=memoryBackup; try { backup=backup || localStorage.getItem(BACKUP_KEY); } catch (_) { /* Export remains available. */ }
    openModal('旅途存档',`<p class="modal-note">每次出牌、回合结算、选择节点和领取奖励后自动保存。再次打开同一个本地网站会继续当前旅途；永久科技和点数重开保留，导出文件可在不同浏览器或电脑间转移。</p><div class="save-summary"><b>${run.label} · ${run.visited.length}/${run.stations}站</b><span>${run.gold} 金币 · ${run.deck.length} 张牌 · 身体 ${run.hero.hp}/${run.hero.maxHp}</span><span>${escapeHtml(saveError || (savedAt?'已保存于 '+new Date(savedAt).toLocaleString():'尚未保存'))}</span></div><div class="save-actions"><button class="gold-button" data-save-export>导出旅途与永久科技 ↓</button><button class="outline-button" data-save-import>导入存档 ↑</button>${backup?'<button class="outline-button" data-save-backup>导出替换前备份</button>':''}</div><p class="modal-note">导入会先校验并显示确认；替换前的当前进度会另存一份本机备份。浏览器清理数据或切换本地网址可能使自动存档不再可见，请用导出文件保留进度。</p>`);
  }
  function mapMarkup(interactive=true) {
    if(run.exploration)return seaMapMarkup(interactive);
    const available=new Set(run.available.map(n=>n.id)),seen=new Set(run.visited),expanded=run.routeVersion!==1,w=expanded?760:540,h=expanded?1160:710;
    const point=n=>run.point(n);
    const edges=run.nodes.flatMap(a=>run.nodes.filter(b=>run.linked(a,b)).map(b=>{
      const p=point(a),q=point(b),traveled=seen.has(a.id)&&(seen.has(b.id)||run.nodeId===b.id);
      const middle=(p.y+q.y)/2;
      return '<path class="route-edge '+(traveled?'traveled':'')+'" d="M'+p.x+' '+p.y+' C'+p.x+' '+middle+' '+q.x+' '+middle+' '+q.x+' '+q.y+'"/>';
    })).join('');
    return '<div class="route-canvas '+(expanded?'expanded-map':'')+' '+(run.routeVersion>=3?'woven-map':'')+'" style="--map-ratio:'+w+'/'+h+';--map-inline-size:'+(w/h*100)+'cqh"><img class="route-paper" data-art-key="map" src="'+A.map+'" alt="" draggable="false" aria-hidden="true"><svg viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none" aria-hidden="true"><text x="'+w/2+'" y="37" text-anchor="middle" class="map-shape-label">'+run.mapName+'</text>'+edges+'<text x="'+w/2+'" y="'+(h-20)+'" text-anchor="middle" class="map-start-label">提灯的起点</text></svg>'+run.nodes.map(n=>{
      const p=point(n),type=Floor.types[n.type],enabled=interactive&&available.has(n.id),current=run.nodeId===n.id;
      const detail=['battle','elite','boss'].includes(n.type)?R.enemies[n.variant].name:n.type==='event'?R.events[n.variant].title:type.name;
      return '<button class="route-node type-'+n.type+' '+(seen.has(n.id)?'visited':'')+' '+(available.has(n.id)?'available':'')+' '+(current?'current':'')+'" style="left:'+p.x/w*100+'%;top:'+p.y/h*100+'%" data-node="'+n.id+'" '+(enabled?'':'disabled')+' title="第'+(n.row+1)+'站 · '+detail+(enabled?' · 点击前往':'')+'" aria-label="第'+(n.row+1)+'站 '+detail+(enabled?'，可前往':'')+'"><i>'+nodeIcon(n.type)+'</i><span>'+type.name+'</span>'+(seen.has(n.id)?'<b>✓</b>':'')+'</button>';
    }).join('')+'</div>';
  }
  function nodeAction(action,title,note,disabled=false) { return '<button class="node-choice" data-node-choice="'+action+'" '+(disabled?'disabled':'')+'><b>'+title+'</b><span>'+note+'</span><i>↗</i></button>'; }
  function seaDisplay(n){if(n.type==='origin')return'origin';if(run.visited.includes(n.id))return'clearing';if(run.exploration.seen.includes(n.id))return n.type;return ['battle','elite'].includes(n.type)?'unknown-combat':'unknown';}
  function seaName(n){const type=seaDisplay(n);return type==='clearing'?E.labels.clearing:type.startsWith('unknown')?E.labels[type]:['battle','elite','boss'].includes(type)?R.enemies[n.variant].name:type==='event'?run.event&&run.nodeId===n.id?run.event.title:R.events[n.variant].title:E.labels[type];}
  function seaMapMarkup(interactive){
    const state=run.exploration,available=new Set(run.available.map(n=>n.id)),selected=run.nodes.find(n=>n.id===selectedSeaNode),route=selected?run.routePlan(selected.id):null,at=run.nodes.find(n=>n.id===state.position),path=route?.path.length?[at.id,...route.path]:[],pair=(a,b)=>[a,b].sort().join('|'),highlight=new Set(path.slice(1).map((id,i)=>pair(path[i],id)));
    const edges=run.nodes.flatMap(n=>n.next.filter(id=>n.id<id).map(id=>{const end=run.nodes.find(v=>v.id===id);return '<path class="sea-edge '+(highlight.has(pair(n.id,id))?'preview':'')+'" d="M'+n.x+' '+n.y+' L'+end.x+' '+end.y+'"/>';})).join('');
    const jump=route?.mode!=='walk'&&path.length?'<path class="sea-jump" d="M'+at.x+' '+at.y+' L'+selected.x+' '+selected.y+'"/>':'';
    const modes=interactive?'<div class="sea-modes" aria-label="移动方式">'+Object.entries(E.modes).map(([id,m])=>'<button data-sea-mode="'+id+'" aria-pressed="'+(state.mode===id)+'" '+(id!=='walk'&&!state.devices[id]?'disabled':'')+'>'+m.name+(id==='walk'?'':' <b>'+state.devices[id]+'</b>')+'</button>').join('')+'</div>':'';
    return '<div class="sea-map-frame '+(interactive?'':'readonly')+'"><div class="sea-toolbar"><div class="sea-movement-count"><span>行动力</span><b>'+state.steps+'</b><small>步</small><em>本层初始 '+E.budgets[run.floorNumber-1]+' 步</em></div>'+modes+'<button class="sea-guide-button" data-sea-help aria-label="探索与移动说明">?</button></div><div class="sea-map-viewport" tabindex="0" aria-label="四向探索地图，可滚动"><div class="route-canvas sea-map" style="aspect-ratio:'+E.width+'/'+E.height+'"><svg class="sea-paths" viewBox="0 0 '+E.width+' '+E.height+'" preserveAspectRatio="none" aria-hidden="true">'+edges+jump+'</svg>'+run.nodes.map(n=>{const type=seaDisplay(n),current=n.id===state.position,chosen=n.id===selectedSeaNode;return '<button class="route-node sea-node sea-'+type+' '+(available.has(n.id)?'available':'')+' '+(current?'current':'')+' '+(chosen?'chosen':'')+'" style="left:'+n.x/E.width*100+'%;top:'+n.y/E.height*100+'%" data-node="'+n.id+'" '+(interactive&&run.screen==='map'?'':'disabled')+' title="'+escapeHtml(seaName(n))+'" aria-label="'+escapeHtml(seaName(n))+(current?'，当前位置':'，点击预览路线')+'" aria-pressed="'+chosen+'">'+E.glyph(type)+'<span class="sea-label">'+E.labels[type]+'</span>'+(current?'<strong class="sea-position">旅人</strong>':'')+'</button>';}).join('')+'</div></div><div class="sea-map-caption"><span>四向连通 · 空地可回走 · 未知地点靠近后揭示</span><button data-sea-locate>定位旅人 ⊕</button></div></div>';
  }
  function locateSea(){const viewport=$('route-map').querySelector('.sea-map-viewport'),current=$('route-map').querySelector('.sea-node.current');if(viewport&&current){viewport.scrollTop=Math.max(0,current.offsetTop-viewport.clientHeight/2);viewport.scrollLeft=Math.max(0,current.offsetLeft-viewport.clientWidth/2);}}
  function seaPanel(){
    const state=run.exploration,n=run.nodes.find(n=>n.id===selectedSeaNode),plan=n?run.routePlan(n.id):null;
    const exhausted=state.steps===0?'<div class="sea-pursuit"><b>行动力耗尽 · 追猎将至</b><p>迎战第 '+(state.pursuits+1)+' 波追猎。胜利后返回地图恢复4步；没有金币、卡牌或遗物奖励，追猎逐波增强。</p><button class="gold-button" data-start-pursuit>迎战追猎 · 恢复4步</button></div>':'';
    return '<div class="sea-preview">'+exhausted+'<span class="eyebrow">'+E.modes[state.mode].name+' · '+state.steps+' 步剩余</span><h2>'+(n?escapeHtml(seaName(n)):'选择探索目的地')+'</h2><p>'+(n?(seaDisplay(n).startsWith('unknown')?'此处内容尚未揭示。靠近后会揭雾，移动装置可越过未完成节点。':seaDisplay(n)==='clearing'?'已经完成的节点，仅供通行，不能重复领取奖励。':Floor.types[n.type].note):'点击地图节点预览路线、距离与消耗，再确认移动。')+'</p><p class="sea-mode-note">'+E.modes[state.mode].note+'</p>'+(plan?'<div class="sea-route-cost"><b>'+(plan.cost?plan.cost+' 步':'—')+'</b><span>'+(plan.ok?(plan.mode==='walk'?'沿小径经过 '+plan.path.length+' 格':'消耗1次'+E.modes[plan.mode].name):escapeHtml(plan.reason))+'</span></div><button class="gold-button sea-confirm" data-sea-move="'+n.id+'" '+(plan.ok?'':'disabled')+'>确认前往'+(plan.cost?' · '+plan.cost+'步':'')+'</button>':'')+'<small class="sea-progress">已处理 '+run.visited.length+' / '+run.stations+' 个节点 · 击败本层首领可前往下一层</small></div>';
  }
  function showExplorationHelp(){openModal('树海探索 · 移动与行动力','<p class="modal-note">沿四向连通的小径自由探索，也可以返回已经完成的空地。点节点先看路线，再确认移动。徒步按经过格数扣行动力，途中不能穿过未完成节点。</p><div class="status-guide">'+Object.entries(E.modes).map(([id,m])=>'<article><h3>'+m.name+'</h3><p>'+m.note+'</p></article>').join('')+'<article><h3>补给、观测与追猎</h3><p>每层补给节点一次增加4步及1次折跃索；观测台揭示2格内节点。行动力耗尽后迎战追猎，胜利确认返回时恢复4步，不给其他战利品，下一波更强。</p></article></div><p class="modal-note">五层初始14/13/12/11/10步，每层重置装置为2次折跃索与1次滑翔翼。已完成地点变空地，只能走过，不反复治疗或给奖。旧档当前层保留旧路线，下一层进入新地图。位置、步数、装置与迷雾自动保存。</p>');}
  function roomArt(cell) { return '<div class="room-illustration" aria-hidden="true">'+atlasArt('rooms',cell,3,2)+'</div>'; }
  function relicIcon(id){const [color,path]=P.relicIcons[id]||['#e8bd7c','m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z'];return '<svg class="relic-mark" style="color:'+color+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+path+'"/></svg>';}
  function relicMarkup(id) { const r=R.relics[id];return '<div class="loot-relic"><span>'+relicIcon(id)+'</span><div><b>'+r.name+'</b><p>'+r.description+'</p></div></div>'; }
  function hideRelicTooltip(){$('relic-tooltip').hidden=true;}
  function showRelicTooltip(button){
    if(phoneUI||modalOpen||!button)return;const id=button.dataset.relicId,r=R.relics[id];if(!r)return;
    const tip=$('relic-tooltip');tip.innerHTML='<b>'+r.name+'</b><p>'+r.description+'</p>';tip.hidden=false;
    const rect=button.getBoundingClientRect();tip.style.left=Math.max(8,Math.min(rect.left,innerWidth-tip.offsetWidth-8))+'px';tip.style.top=Math.min(rect.bottom+8,Math.max(8,innerHeight-tip.offsetHeight-8))+'px';
  }
  function renderRelics(){
    const key=run.relics.join('|');if(key!==relicBarKey){hideRelicTooltip();relicBarKey=key;$('relic-slots').innerHTML=run.relics.length?run.relics.map((id,i)=>'<button class="relic-slot" data-relic-id="'+id+'" aria-label="'+R.relics[id].name+'，第'+(i+1)+'件遗物，点击查看效果">'+relicIcon(id)+'</button>').join(''):'<span class="relic-empty">尚无遗物</span>';}
    $('relic-count').textContent=run.relics.length;$('tech-points').textContent=profile.points;$('tech-button').disabled=busy;
    $('tech-button').setAttribute('aria-label','永久科技树，可用'+profile.points+'点');
  }
  function showRelic(id){if(busy||!run.relics.includes(id))return;if(run.screen==='battle'&&battle.overflowCount){showOverflow();return;}openModal(R.relics[id].name,relicMarkup(id)+'<p class="modal-note">本次旅途的第 '+(run.relics.indexOf(id)+1)+' 件遗物 · 跨层持续生效</p><button class="outline-button" data-open-relics>查看遗物图鉴</button>');}
  function showTech(){
    if(busy)return;if(run.screen==='battle'&&battle.overflowCount){showOverflow();return;}
    const oldTree=$('modal-body').querySelector('.tech-tree-scroll'),treeScroll=oldTree?.scrollLeft||0,keepTechFocus=!!document.activeElement?.closest('[data-tech-select],[data-tech-unlock]');
    const selected=P.nodes.find(n=>n.id===selectedTech)||P.nodes[0],owned=profile.unlocked.includes(selected.id),reason=profile.reason(selected.id);
    const branches=P.branches.map((b,i)=>'<div class="tech-branch" style="left:'+(i*300+150)/9+'%"><b>'+b.name+'</b><span>'+b.note+'</span></div>').join('');
    const links=P.nodes.map(n=>{const x=P.branches.findIndex(b=>b.id===n.branch)*300+150,y=n.tier*170;return '<path class="'+(profile.unlocked.includes(n.id)?'lit':'')+'" d="M'+x+' '+(n.tier===1?80:y-170+56)+' V'+(y-56)+'"/>';}).join('');
    const techNodes=P.nodes.map(n=>{const unlocked=profile.unlocked.includes(n.id),available=!profile.reason(n.id),active=run.techs.includes(n.id);return '<button class="tech-node '+(unlocked?'unlocked':available?'available':'locked')+' '+(selected.id===n.id?'selected':'')+'" style="left:'+(P.branches.findIndex(b=>b.id===n.branch)*300+150)/9+'%;top:'+n.tier*170+'px" data-tech-select="'+n.id+'" aria-pressed="'+(selected.id===n.id)+'"><small>'+['Ⅰ','Ⅱ','Ⅲ'][n.tier-1]+' · '+(unlocked?'已解锁':n.cost+' 点')+'</small><b>'+n.name+'</b><span>'+n.description+'</span><em>'+(active?'本局生效':unlocked?'下次新旅途生效':'曾通第'+n.minFloor+'层')+'</em></button>';}).join('');
    openModal('余火传承 · 永久科技','<div class="tech-summary"><div><b>'+profile.points+'</b><span>可用科技点</span></div><div><b>'+profile.bestFloor+' / 5</b><span>最高通层</span></div><div><b>'+profile.unlocked.length+' / 9</b><span>永久解锁</span></div></div><p class="modal-note">击败各层首领分别获得 <strong>1 / 1 / 2 / 2 / 3 点</strong>。同一旅途的同一层只计一次；新旅途可以再次赚取。点数与已解锁科技在重开时保留，<strong>新解锁能力下次新旅途生效</strong>。</p><div class="tech-tree-scroll" tabindex="0" aria-label="科技树，窄屏可左右滑动"><div class="tech-tree"><svg viewBox="0 0 900 610" preserveAspectRatio="none" aria-hidden="true"><path d="M150 65H750"/>'+links+'</svg>'+branches+techNodes+'</div></div><div class="tech-detail" aria-live="polite"><div><small>'+P.branches.find(b=>b.id===selected.branch).name+' · '+selected.cost+' 点</small><h3>'+selected.name+'</h3><p>'+selected.description+'</p><span>'+(owned?(run.techs.includes(selected.id)?'已永久解锁 · 本局生效':'已永久解锁 · 下次新旅途生效'):reason||'条件满足，可以解锁。')+'</span></div><button class="gold-button" data-tech-unlock="'+selected.id+'" '+(reason?'disabled':'')+'>'+(owned?'已解锁':'解锁 · '+selected.cost+' 点')+'</button></div><div class="save-actions"><button class="outline-button" data-save-export>导出旅途与永久科技</button><button class="outline-button" data-save-import>导入存档</button>'+(['reward','lost','cleared'].includes(run.screen)?'<button class="outline-button" data-open-result>返回结算</button>':'')+'</div><p class="modal-note">树中的连线表示前置科技，三条分支可同时发展。永久科技会独立保存在本地，并随旅途存档导出；导入会合并通层记录和已解锁科技。'+escapeHtml(saveError)+'</p>','tech-panel');
    $('modal-body').querySelector('.tech-tree-scroll').scrollLeft=treeScroll;
    if(keepTechFocus)$('modal-body').querySelector('[data-tech-select="'+selected.id+'"]').focus({preventScroll:true});
  }
  function cardEffects(id){
    const d=R.cards[id];return '<span class="choice-effect"><span class="effect-meta">'+d.cost+' 能量 · '+(d.upgraded?'已强化':d.type==='attack'?'形状攻击':'技能')+'</span>'+(d.shape?'<span class="effect-shape" aria-label="'+d.shapeName+'形状">'+shapeArt(d.shape)+'</span>':'')+'<span class="effect-copy">'+d.description+'</span><small>基础效果；战斗时受身体机能、遗物与本局科技影响。</small></span>';
  }
  function effectDetails(e){return(e.card?'<span class="choice-detail"><b>卡牌 · '+R.cards[e.card].name+'</b>'+cardEffects(e.card)+'</span>':'')+(e.relic?'<span class="choice-detail"><b>遗物 · '+R.relics[e.relic].name+'</b><span class="effect-copy">'+R.relics[e.relic].description+'</span></span>':'')+(e.randomRelic?'<span class="choice-detail">随机获得一件本层已解锁且未拥有的遗物；全部拥有则改为45金币。</span>':'');}
  function bloodMarkup(h,withShield=false){
    return '<div class="blood-display '+(withShield&&h.block?'has-block':'')+'"><div class="blood-track '+(h.blood<65?'low-blood':'')+'" role="progressbar" aria-label="血容量" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+h.blood.toFixed(1)+'"><span style="width:'+h.blood+'%"></span><b>血容量 '+h.blood.toFixed(0)+' / 100</b></div>'+(withShield&&h.block?'<span class="block-badge" aria-label="格挡 '+h.block+'" title="格挡 '+h.block+'：先抵挡攻击伤害，下个己方回合开始时清空">'+icon('shield')+'<b>'+h.block+'</b></span>':'')+'</div>';
  }
  function statusMarkup(state,who,interactive=true){
    const tag=interactive?'button':'span',attr=interactive?' type="button" data-open-statuses':'',chips=[];
    for(const [id,a]of Object.entries(state.ailments)){
      const d=R.statuses[id];chips.push('<'+tag+attr+' class="ailment-chip" style="--ailment-color:'+d.color+'" title="'+d.name+'：'+a.potency+'威力 / '+a.count+'次数。'+d.note+'">'+d.mark+' '+d.name+' <b>'+a.potency+'×'+a.count+'</b></'+tag+'>');
    }
    if(state.dread)chips.push('<'+tag+attr+' class="ailment-chip" style="--ailment-color:#92b7ee">☽ 攻击压制 <b>'+state.dread+'</b></'+tag+'>');
    const threshold=who==='hero'?8:Math.max(3,Math.ceil(state.maxHp*.2));
    if(state.staggered||state.stagger)chips.push('<'+tag+attr+' class="ailment-chip" style="--ailment-color:#dfc26e">≋ '+(state.staggered?'失衡':('失衡进度 <b>'+state.stagger+'/'+threshold+'</b>'))+'</'+tag+'>');
    return '<span class="ailment-list">'+chips.join('')+'</span>';
  }
  function showStatuses(){
    if(busy)return;
    openModal('负面状态 · 威力 × 次数','<p class="modal-note">威力决定效果强度，次数决定还能触发几次。重复施加时两者分别相加，上限20威力 / 9次数。攻击型状态每张卡牌或敌人行动最多触发一次，格挡完全挡住攻击时不触发受击状态，也不附加新状态。</p><div class="status-summary"><h3>旅人当前状态</h3>'+statusMarkup(battle.heroState,'hero',false)+'<h3>'+escapeHtml(battle.encounter?.name||'当前目标')+'</h3>'+statusMarkup(battle.enemy,'enemy',false)+'</div><div class="status-guide">'+Object.entries(R.statuses).map(([id,d])=>'<article style="--ailment-color:'+d.color+'"><h3>'+d.mark+' '+d.name+'</h3><p>'+d.note+'</p></article>').join('')+'</div><p class="modal-note">震颤爆发使用本次攻击前已有的震颤；该牌附加的新状态在触发之后生效。敌人失衡阈值为最大生命20%向上取整，至少3；旅人为8。敌人失衡跳过下次行动；旅人失衡期间不能攻击，可用技能或医疗，到下次结束回合时解除。固定状态伤害忽略护甲/格挡，不再次触发破裂等状态。敌人的固定伤害从最厚生命格逐层扣除；己方灼烧/破裂伤害按部位分配，可能留下伤口。</p><p class="modal-note">包扎清除战术出血，并处理所选伤口；强化剂解除沉沦、攻击压制、震颤及失衡。卡牌的解除效果在卡面说明中列出。战术出血与伤口流血独立，状态在本场战斗中生效，伤势和失血会延续。</p>','status-modal');
  }
  function statusFeedback(events=[]){
    for(const [i,event]of events.filter(e=>e.amount>0).slice(0,6).entries()){
      const target=event.who==='hero'?'hero-actor':battle.members.length>1?'enemy-slot-'+event.index:'enemy-actor';
      floatText(target,R.statuses[event.kind].name+' −'+Number(event.amount.toFixed(1)),'damage'+(i?' secondary':''));
    }
    if(events.length)toast(events.slice(-3).map(e=>e.text).join(' / '));
    if(events.some(e=>e.who==='hero'&&e.amount>0)){shake('hero-health','impact-pulse');tone(100,.15);}
  }
  function showDeckAction(){
    const p=run.pendingDeckAction,d=run.deckAction;if(!p||!d)return;
    const upgrading=d.kind==='upgrade',selected=p.selectedIndex,id=selected===null?null:run.deck[selected],next=id&&upgrading?R.upgradeId(id):null;
    const active=document.activeElement?.dataset.deckPick;
    const preview=id?'<div class="deck-preview"><div><h3>'+(upgrading?'强化前':'即将移除')+' · '+R.cards[id].name+'</h3>'+cardEffects(id)+'</div>'+(next?'<div class="upgrade-after"><h3>强化后 · '+R.cards[next].name+'</h3>'+cardEffects(next)+'</div>':'')+'</div>':'<p class="modal-note">点击下方一张牌查看'+(upgrading?'强化前后效果':'完整效果')+'，然后确认。</p>';
    openModal(upgrading?'营火 · 强化一张卡牌':'选择要移除的卡牌','<p class="modal-note">'+(upgrading?'每张牌可永久强化一次，同名牌分别处理；本次强化代替营火其他行动。':'自由选择一张牌，至少保留5张。')+(d.cost?' 确认后支付 '+d.cost+' 金币。':'')+' 取消可返回当前节点。</p>'+preview+'<div class="deck-picker">'+run.deck.map((id,i)=>{const c=R.cards[id],disabled=upgrading&&!R.upgradeId(id);return '<button class="deck-pick '+(selected===i?'picked':'')+' '+(c.upgraded?'upgraded':'')+'" data-deck-pick="'+i+'" aria-pressed="'+(selected===i)+'" '+(disabled?'disabled':'')+'><span class="mini-art">'+art(id)+'</span><b>'+c.name+' <small>第 '+(i+1)+' 张'+(disabled?' · 已强化':'')+'</small></b>'+cardEffects(id)+'</button>';}).join('')+'</div><div class="deck-confirm"><button class="outline-button" data-cancel-deck>取消</button><button class="gold-button" data-confirm-deck '+(id?'':'disabled')+'>确认'+(upgrading?'强化':'移除')+(id?'「'+R.cards[id].name+'」':'')+(d.cost?' · ¤ '+d.cost:'')+'</button></div>','deck-action-panel');
    if(active!==undefined)$('modal-body').querySelector('[data-deck-pick="'+active+'"]')?.focus({preventScroll:true});
    if(id&&upgrading)$('modal-body').querySelector('.deck-pick.picked')?.insertAdjacentHTML('beforeend','<span class="upgrade-inline"><b>强化后 · '+R.cards[next].name+'</b>'+cardEffects(next)+'</span>');
  }
  function campaignTrail(){return '<ol class="campaign-trail" aria-label="五层旅途">'+R.floors.map((f,i)=>'<li class="'+(i+1<run.floorNumber||run.completed?'done':i+1===run.floorNumber?'current':'locked')+'" title="'+f.name+(run.history[i]?' · 已击败'+R.enemies[run.history[i].boss].name:'')+'"><b>'+(i+1<run.floorNumber||run.completed?'✓':i+1)+'</b><span>'+f.name+'</span></li>').join('')+'</ol>';}
  function renderEnemies(){
    const group=battle.members.length>1;$('arena').classList.toggle('multi-enemy',group);$('enemy-formation').hidden=!group;
    if(!group){$('enemy-formation').replaceChildren();return;}
    $('enemy-formation').style.setProperty('--enemy-count',battle.members.length);
    $('enemy-formation').innerHTML=battle.members.map((m,i)=>{
      const e=battle.encounters[i],intent=battle.intentFor(i),atlas=typeof e.sprite==='number'&&artReady.has('enemies')&&!artErrors.has('enemies'),key=typeof e.sprite==='string'?e.sprite:(e.kind==='boss'?'boss':e.kind==='elite'?'elite':'sentinel');
      const fallback=artErrors.has(key)?'sentinel':key;
      const portrait=atlas?atlasArt('enemies',e.sprite,4,2):!artErrors.has(fallback)?'<img data-art-key="'+fallback+'" src="'+A[fallback]+'" alt="" draggable="false">':'<span class="art-placeholder">✦</span>';
      return '<button id="enemy-slot-'+i+'" class="formation-card '+(i===battle.targetIndex?'targeted ':'')+(!m.hp?'fallen':'')+'" data-enemy-target="'+i+'" aria-pressed="'+(i===battle.targetIndex)+'" aria-label="'+e.name+'，生命'+m.hp+'/'+m.maxHp+'，'+(!m.hp?'已击败':m.staggered?'失衡，跳过行动':intent.name+'，'+(intent.damage?'攻击'+intent.damage:'覆甲'+intent.block))+'" '+(busy||!m.hp||battle.status!=='playing'?'disabled':'')+'><strong class="formation-intent">'+(!m.hp?'已击败':m.staggered?'≋ 失衡':(intent.damage?'⚔ '+intent.damage:'◇ '+intent.block)+(intent.strength?' · 力量+'+intent.strength:''))+'</strong>'+(intent.inflict?.length?'<span class="formation-ailment">'+intent.inflict.map(a=>R.statuses[a.kind].name+' '+a.potency+'×'+a.count).join(' · ')+(intent.tremorBurst?' · 爆发':'')+'</span>':'')+'<span class="formation-portrait">'+portrait+'</span><b>'+e.name+'</b><span class="formation-hp"><i><em style="width:'+m.hp/m.maxHp*100+'%"></em></i><small>'+m.hp+' / '+m.maxHp+(m.block?' · ◇'+m.block:'')+'</small></span>'+statusMarkup(m,'enemy',false)+'<span class="formation-target">'+(!m.hp?'已击败':i===battle.targetIndex?'当前目标':'点击选为目标')+'</span></button>';
    }).join('');
  }
  function showOverflow(){
    if(run.screen!=='battle'||busy||!battle.overflowCount)return;
    const focused=document.activeElement?.dataset?.overflowPick,confirmFocused=!!document.activeElement?.matches('[data-confirm-overflow]'),count=battle.overflowCount,selected=new Set(battle.overflowSelection),fresh=new Set(battle.pendingDraw.map(c=>c.uid));
    openModal('手牌超限 · 选择弃'+count+'张','<p class="modal-note">上限9张。新抽到的牌已经保留，可以从原手牌和新牌中选择弃置。先选牌，再确认；确认前可以更换选择。</p><p class="overflow-count" aria-live="polite">已选 '+selected.size+' / '+count+' 张 · 确认后保留9张</p><div class="overflow-cards">'+[...battle.hand,...battle.pendingDraw].map(c=>{const d=battle.definition(c);return '<button class="overflow-card '+(selected.has(c.uid)?'picked':'')+'" data-overflow-pick="'+c.uid+'" aria-pressed="'+selected.has(c.uid)+'"><span class="mini-art">'+art(c.id)+'</span><b>'+d.name+' <small>'+d.cost+'能量</small></b><span>'+d.description+'</span><em>'+(selected.has(c.uid)?'✓ 待弃置':fresh.has(c.uid)?'新抽到':'手牌')+'</em></button>';}).join('')+'</div><div class="overflow-confirm"><button class="gold-button" data-confirm-overflow '+(selected.size===count?'':'disabled')+'>确认弃牌（'+selected.size+'/'+count+'）</button><small>点已选中的牌可取消选择</small></div>','overflow-panel');
    const focus=confirmFocused?$('modal-body').querySelector('[data-confirm-overflow]'):focused?$('modal-body').querySelector('[data-overflow-pick="'+focused+'"]'):$('modal-body').querySelector('[data-overflow-pick]');focus?.focus({preventScroll:true});
  }
  function showRelics() { if(busy)return;if(run.screen==='battle'&&battle.overflowCount){showOverflow();return;}openModal('旅人遗物 · '+run.relics.length+' / '+Object.keys(R.relics).length,'<p class="modal-note">已拥有的遗物按获得顺序排列，效果跨层持续生效。精英与Boss自动掉落本层已解锁且未拥有的遗物，该池全齐时改给45金币。遗物随本次旅途结算；永久科技重开保留。</p><div class="relic-collection">'+[...run.relics,...Object.keys(R.relics).filter(id=>!run.relics.includes(id))].map(id=>'<div class="'+(run.relics.includes(id)?'owned':'unowned')+'">'+relicMarkup(id)+'<small>'+(run.relics.includes(id)?'第 '+(run.relics.indexOf(id)+1)+' 件 · 已拥有':(R.relics[id].minFloor||1)>run.floorNumber?'第'+R.relics[id].minFloor+'层解锁':'尚未获得')+'</small></div>').join('')+'</div>'); }
  function renderRoute() {
    const previousView=$('route-map').querySelector('.sea-map-viewport'),scroll=previousView?{x:previousView.scrollLeft,y:previousView.scrollTop}:null,viewKey=run.journeyId+':'+run.floorNumber+':'+run.routeVersion;
    $('route-map').innerHTML=mapMarkup();
    const nextView=$('route-map').querySelector('.sea-map-viewport');if(nextView){if(scroll&&viewKey===seaViewKey){nextView.scrollLeft=scroll.x;nextView.scrollTop=scroll.y;}else locateSea();}seaViewKey=viewKey;
    const h=run.hero,type=Floor.types[run.node?.type],boss=run.nodes.find(n=>n.type==='boss');
    let content='';
    if(run.screen==='node') {
      const n=run.node,cell={camp:0,shop:1,treasure:2,event:3,cache:2,beacon:3}[n.type];
      content=roomArt(cell)+'<span class="room-emblem">'+(run.exploration?E.glyph(n.type):nodeIcon(n.type))+'</span><span class="eyebrow">'+(run.exploration?'树海坐标 '+(n.gridX+1)+' / '+(n.gridY+1)+' · 剩余'+run.exploration.steps+'步':'第 '+(n.row+1)+' / '+run.stations+' 站')+'</span><h2>'+(n.type==='event'?run.event.title:type.name)+'</h2><p>'+(n.type==='event'?run.event.story:type.note)+'</p><div class="node-choices">';
      if(n.type==='cache')content+=nodeAction('resupply','整理应急补给','行动力+4，折跃索使用次数+1。每个补给点仅能领取一次。');
      if(n.type==='beacon')content+=nodeAction('survey','登上观测台','揭示周围曼哈顿距离2格内的节点内容。');
      if(n.type==='camp')content+=nodeAction('rest','靠近营火','存活部位修复40%，止血，血容量+45。')+nodeAction('upgrade','强化卡牌','自由选择一张未强化卡牌，查看前后对比并永久强化。',!!run.canEffect({upgrade:true}))+nodeAction('train','学习「'+R.cards[run.trainingCard].name+'」',cardEffects(run.trainingCard),!!run.canEffect({card:run.trainingCard}))+nodeAction('purge','移除卡牌','自由选择移除一张牌；牌组至少保留5张。',!!run.canEffect({remove:'any'}));
      if(n.type==='event')content+=run.event.choices.map(c=>nodeAction(c.id,c.label+(c.cost?' · ¤ '+c.cost:''),c.text+effectDetails(c.effects),!!run.canEffect(c.effects,c.cost))).join('');
      if(n.type==='treasure')content+=run.roomRelics.map(id=>nodeAction('relic:'+id,R.relics[id].name,'<span class="effect-copy">'+R.relics[id].description+'</span>')).join('')+nodeAction('gold','带走钱币','获得'+run.treasureGold+'金币。');
      if(n.type==='shop') {
        content+=run.shop.map(item=>{const sold=run.bought.includes(item.id),owned=item.relic&&run.relics.includes(item.relic),reason=run.canEffect({remove:item.remove,card:item.card},item.cost);return '<button class="node-choice shop-item" data-buy="'+item.id+'" '+(sold||owned||reason?'disabled':'')+'><b>'+item.name+' <em>¤ '+item.cost+'</em></b><span>'+(sold?'已售出 · ':owned?'已经拥有 · ':'')+(item.card?cardEffects(item.card):'<span class="effect-copy">'+item.description+'</span>')+'</span></button>';}).join('');
        content+=nodeAction('leave','离开商店','保留剩余金币，继续选择路线。');
      }
      content+='</div>';
    } else content=run.exploration?seaPanel():'<div class="journey-illustration" aria-hidden="true"><img data-art-key="hero" src="'+A.hero+'" alt="" draggable="false"></div><span class="eyebrow">'+run.mapName+'</span><h2>'+(run.visited.length?'余火仍在前方':'踏入'+run.theme.name)+'</h2><p>'+run.theme.story+'</p><div class="journey-meter"><b>'+run.visited.length+'<small> / '+run.stations+' 站</small></b><span>终点 · '+R.enemies[boss.variant].name+'</span></div><p class="node-tip">沿连线选择下一站。精英与Boss掉落遗物；过层可整备身体并选择补给。'+(run.routeVersion<4?'旧存档保留原图，下一层使用新路线。':'各层路线独立生成，岔口与宽窄随旅途变化。')+'</p>';
    $('node-panel').innerHTML=campaignTrail()+content+'<div class="journey-health"><span>旅人身体 <b>'+h.hp+'/'+h.maxHp+'</b></span>'+bloodMarkup(h)+'<span>意识 <b>'+Math.round(h.capacities.consciousness*100)+'%</b></span><button class="outline-button" data-open-health>身体与无限包扎 ↗</button></div><div class="journey-relics"><button class="outline-button" data-open-relics>✦ 遗物 '+run.relics.length+' / '+Object.keys(R.relics).length+'</button></div>';
    $('map-legend').innerHTML=Object.entries(Floor.types).filter(([id])=>run.exploration?!['origin'].includes(id):!['origin','clearing','cache','beacon'].includes(id)).map(([id,t])=>'<span><b>'+(run.exploration?E.glyph(id):nodeIcon(id))+'</b>'+t.name+'</span>').join('');
  }

  function renderRun() {
    const inCombat=['battle','reward','lost','cleared'].includes(run.screen);
    document.body.dataset.floor=run.floorNumber;document.documentElement.style.setProperty('--floor-hue',run.theme.hue+'deg');
    $('expedition-view').classList.toggle('sea-exploration',!!run.exploration);
    $('floor-label').textContent=run.label;
    document.querySelector('.map-intro h1').textContent=run.theme.name;
    document.querySelector('.map-intro .eyebrow').textContent='ACT '+run.floorNumber+' / 5 · '+run.theme.subtitle;
    document.querySelector('.map-intro p').textContent=run.theme.story;
    $('expedition-view').setAttribute('aria-label',run.label+(run.exploration?'，四向树海探索':'路线'));
    $('route-map').setAttribute('aria-label',run.exploration?'四向连通探索地图，移动消耗行动力':'分岔路线，'+run.stations+'站');
    document.querySelector('.map-instruction').textContent=run.exploration?'点节点预览 · 确认移动 · 留意行动力':'从下往上 · 点亮的节点可前往';
    document.querySelector('.game-shell').classList.toggle('map-mode',!inCombat);
    $('arena').hidden=!inCombat; document.querySelector('.hand-zone').hidden=!inCombat; $('expedition-view').hidden=inCombat;
    $('run-progress').textContent=`${run.visited.length} / ${run.stations}`;
    $('run-gold').textContent=run.gold; $('route-button').textContent=['reward','lost','cleared'].includes(run.screen)?'查看结算':'路线';
    $('deck-button').innerHTML=`${icon('cards')} <span>牌组</span> <b>${run.deck.length}</b>`;
    $('footer-status').textContent=run.node?`第${run.floorNumber}层 · 第${run.node.row+1}站 · ${Floor.types[run.node.type].name}`:`${run.label} · ${run.stations}站`;
    if(run.exploration)$('footer-status').textContent=run.exploration.pursuing?'树海追猎 · 第'+run.exploration.pursuits+'波':run.label+' · 行动力 '+run.exploration.steps+'步';
    const e=battle.encounter;
    $('encounter-name').textContent=battle.members.length>1?'敌群 · '+battle.living.length+' / '+battle.members.length+'名存活':e?.name || '残火之径'; $('enemy-name').textContent=e?.name || '石门守卫'; $('enemy-role').textContent=e?.role || '';
    $('encounter-eyebrow').textContent=`第${run.floorNumber}层 · ${run.theme.name} · 第${(run.node?.row || 0)+1}站${e?.kind==='boss'?' · BOSS':e?.kind==='elite'?' · 精英':''}`;
    $('encounter-note').textContent=e?.kind==='boss'?`半血后攻击额外+${e.enrage||0} · 胜利掉落遗物`:phoneUI?'触点居中放置 · 点格即攻击':'鼠标居中放置 · 点击即攻击';
    $('arena').classList.toggle('boss-encounter',battle.baseEncounter?.kind==='boss'); $('arena').classList.toggle('elite-encounter',battle.baseEncounter?.kind==='elite');
    const sprite=e?.sprite??'sentinel',atlas=typeof sprite==='number'&&artReady.has('enemies')&&!artErrors.has('enemies'),fallback=typeof sprite==='string'?sprite:(e?.kind==='boss'?'boss':e?.kind==='elite'?'elite':'sentinel');
    setArtImage($('enemy-fallback'),artErrors.has(fallback)?'sentinel':fallback);
    $('enemy-fallback').style.visibility=atlas?'hidden':'visible';$('enemy-atlas-sprite').hidden=!atlas;
    if(atlas)cropAtlas($('enemy-atlas-image'),sprite,4,2);
    const cell=e?.sceneCell;$('scene-room').hidden=cell==null||artErrors.has('rooms');
    if(cell!=null)cropAtlas($('scene-room-image'),cell,3,2);
    $('arena').setAttribute('aria-label',`${e?.name || '回廊'}战斗场景`); $('enemy-actor').setAttribute('aria-label',e?.name || '敌人'); $('enemy-grid-panel').setAttribute('aria-label',`${e?.name || '敌人'}的生命方格`);
    $('enemy-grid-panel').querySelector('h2').textContent=battle.members.length>1?'目标 · '+e.name:'生命方格';
    $('enemy-health').setAttribute('aria-label','敌人剩余总生命');
    $('sound-button').classList.toggle('active',sound); $('sound-button').setAttribute('aria-pressed',String(sound));
    $('relic-badge').hidden=true;renderRelics();
    if(!inCombat) renderRoute(); updateSaveBadge();
  }
  function routeAction(id) {
    if(busy || modalOpen || !run.enter(id,Battle)) return;
    adoptRun(run); saveRun(); render();
  }
  function afterNodeAction() { adoptRun(run); saveRun(); closeModal(); render(); }
  function showRoute() {
    if(busy) return;
    if(['reward','lost','cleared'].includes(run.screen)) { showResult(); return; }
    if(run.screen==='battle') openModal(run.label,`<p class="modal-note">完成当前战斗后，才能前往下一个节点。</p><div class="route-preview">${mapMarkup(false)}</div>`,'map-modal');
    else { closeModal(); render(); }
  }
  function selectedCard() { return battle.hand.find(c => c.uid === selectedUid); }
  function clearPlacement() { selectedUid = null; rotation = 0; anchorChosen = false; edgeSnapped = false; if (aimFrame) root.cancelAnimationFrame(aimFrame); aimFrame = 0; queuedAim = null; wheelAmount = 0; lastWheelAt = 0; lastWheelTurn = -Infinity; }
  function centeredPlacement(card) {
    const shape = battle.shapeFor(card, rotation), width = Math.max(...shape.map(p => p[0])) + 1, height = Math.max(...shape.map(p => p[1])) + 1;
    const rawX = Math.round(aim.x - (width - 1) / 2), rawY = Math.round(aim.y - (height - 1) / 2);
    const x = Math.max(0, Math.min(battle.columns - width, rawX)), y = Math.max(0, Math.min(battle.rows - height, rawY));
    return { x, y, width, height, shifted: x !== rawX || y !== rawY };
  }
  function aimAt(x, y, force = false) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || busy || modalOpen || auto) return;
    aim = { x, y }; const card = selectedCard(); if (!card) return;
    const next = centeredPlacement(card), changed = force || !anchorChosen || next.x !== anchor.x || next.y !== anchor.y || next.shifted !== edgeSnapped;
    anchor = { x: next.x, y: next.y }; anchorChosen = true; edgeSnapped = next.shifted;
    if (changed) paintPlacement();
  }
  function applyPointerAim(point) {
    if (busy || modalOpen || auto || battle.status !== 'playing') return;
    const cells = $('enemy-grid').children; if (!cells.length) return;
    const first = cells[0].getBoundingClientRect(), next = cells[1].getBoundingClientRect(), below = cells[battle.columns].getBoundingClientRect();
    const stepX = next.left - first.left, stepY = below.top - first.top; if (!stepX || !stepY) return;
    aimSource = 'pointer'; aimAt((point.x - first.left - first.width / 2) / stepX, (point.y - first.top - first.height / 2) / stepY);
  }
  function flushPointerAim() { if (aimFrame) root.cancelAnimationFrame(aimFrame); aimFrame = 0; const point = queuedAim; queuedAim = null; if (point) applyPointerAim(point); }
  function queuePointerAim(e) {
    if (busy || modalOpen || auto || battle.status !== 'playing') return;
    queuedAim = { x: e.clientX, y: e.clientY };
    if (!aimFrame) aimFrame = root.requestAnimationFrame(flushPointerAim);
  }
  function aimAtCell(index) { aimSource = 'keyboard'; aimAt(index % battle.columns, Math.floor(index / battle.columns)); }
  function moveAim(dx, dy) {
    const card = selectedCard(); if (!card || busy || modalOpen) return;
    flushPointerAim(); const placement = centeredPlacement(card); aimSource = 'keyboard';
    const x = Math.max(0, Math.min(battle.columns - placement.width, anchor.x + dx)), y = Math.max(0, Math.min(battle.rows - placement.height, anchor.y + dy));
    aimAt(x + (placement.width - 1) / 2, y + (placement.height - 1) / 2);
  }
  function paintReticle(card, pending) {
    const reticle = $('placement-reticle'); reticle.hidden = !pending; if (!pending) return;
    const placement = centeredPlacement(card), cells = $('enemy-grid').children;
    const first = cells[anchor.y * battle.columns + anchor.x].getBoundingClientRect();
    const last = cells[(anchor.y + placement.height - 1) * battle.columns + anchor.x + placement.width - 1].getBoundingClientRect();
    const panel = $('enemy-grid-panel'), bounds = panel.getBoundingClientRect();
    reticle.style.left = `${(first.left + last.right) / 2 - bounds.left - panel.clientLeft}px`;
    reticle.style.top = `${(first.top + last.bottom) / 2 - bounds.top - panel.clientTop}px`;
    reticle.classList.toggle('edge-snapped', edgeSnapped);
  }
  function renderGrid() {
    $('enemy-grid').style.setProperty('--grid-cols', battle.columns);
    $('enemy-grid').innerHTML = battle.enemy.cells.map((layers, i) => `<button class="hp-cell ${layers ? 'alive' : 'empty'} ${layers > 1 ? 'layered' : ''} ${layers && battle.enemy.armor[i] ? 'armored' : ''}" data-cell="${i}" data-layers="${layers}" style="--layer-color:${R.layerColors[Math.max(0, layers - 1)]}" aria-label="第${Math.floor(i / battle.columns) + 1}行第${i % battle.columns + 1}列，${layers ? `${layers}层生命${battle.enemy.armor[i] ? '，有护甲' : ''}` : '已破损'}" title="${layers ? `${layers}层生命${battle.enemy.armor[i] ? ' · 有护甲' : ''}` : '空格'}" ${busy || battle.status !== 'playing' ? 'disabled' : ''}><span>${layers || '·'}</span>${layers && battle.enemy.armor[i] ? '<i class="cell-armor" aria-hidden="true">◇</i>' : ''}</button>`).join('');
    $('enemy-cell-count').textContent = `${battle.enemy.cells.filter(layers => layers > 0).length} 格 · 每格最多 ${battle.maxCellLayers} 层`;
    $('target-afflictions').innerHTML='<button class="status-guide-link" data-open-statuses>目标状态 · 说明 ↗</button>'+statusMarkup(battle.enemy,'enemy');
    paintPlacement();
  }
  function paintPlacement() {
    const card = selectedCard(), pending = !!card && !auto && !busy && battle.status === 'playing';
    const plan = pending ? battle.planAttack(card, { ...anchor, rotation }) : null;
    const cells = [...$('enemy-grid').children];
    cells.forEach((e, i) => { e.classList.remove('preview-hit', 'preview-block', 'preview-empty', 'preview-invalid', 'is-anchor'); e.querySelector('.cell-forecast')?.remove(); if (pending) e.removeAttribute('title'); else e.title = battle.enemy.cells[i] ? `${battle.enemy.cells[i]}层生命${battle.enemy.armor[i] ? ' · 有护甲' : ''}` : '空格'; });
    if (plan) {
      for (const c of plan.cells) if (c.inBounds) {
        cells[c.index].classList.add(!plan.ok && plan.reason.startsWith('形状超出') ? 'preview-invalid' : c.lost ? 'preview-hit' : c.breaksArmor ? 'preview-block' : 'preview-empty');
        const forecast = document.createElement('em'); forecast.className = 'cell-forecast'; forecast.textContent = c.lost ? `−${c.lost}` : c.breaksArmor ? '◇' : '0'; cells[c.index].appendChild(forecast);
      }
    }
    $('enemy-grid-panel').classList.toggle('placing', pending);
    paintReticle(card, pending);
    $('rotate-attack').disabled = !pending; $('cancel-attack').disabled = !pending;
    $('placement-title').textContent = pending ? `${battle.definition(card).name} · ${battle.definition(card).shapeName} · ${rotation * 90}°` : auto ? 'AUTO 已开启 · 点攻击牌直接打出' : '选攻击牌 → 点格子立即攻击';
    $('placement-preview').innerHTML = pending ? shapeArt(battle.shapeFor(card, rotation)) : '<span class="idle-crosshair">⌖</span>';
    $('placement-status').textContent = !pending ? auto ? '自动选择落点和旋转，按当前能力计算实际伤害。' : phoneUI?'图案以触点居中，点格即打出；下方可旋转或取消。':'图案中心跟随鼠标 · R/滚轮旋转 · 右键取消。' : !plan.ok ? plan.reason : `削 ${plan.damage} 层 · 碎 ${plan.cleared} 格${plan.blocked.length ? ` · 破甲 ${plan.blocked.length} 格` : ''} · 攻效 ${Math.round(battle.effects.attack * 100)}%${edgeSnapped ? ' · 边缘吸附' : ''}`;
    $('auto-button').setAttribute('aria-pressed', String(auto)); $('auto-button').classList.toggle('active', auto);
    $('auto-button').disabled = busy || battle.status !== 'playing';
    $('auto-state').textContent = auto ? '开' : '关';
    $('hand-shortcuts').textContent = phoneUI?(auto?'AUTO · 点牌直接攻击':'左右滑动手牌 · 选牌后点格'):(auto ? 'AUTO · 点牌直接攻击  /  A 切换' : '选牌 1–9 · 鼠标居中 · R/滚轮旋转');
    document.querySelectorAll('.card').forEach(e => e.classList.toggle('selected', e.dataset.uid === selectedUid));
  }
  function rotateAttack(direction = 1) { if (!selectedCard() || busy || modalOpen || auto) return; flushPointerAim(); rotation = (rotation + (direction < 0 ? 3 : 1)) % 4; aimAt(aim.x, aim.y, true); tone(320, .06); }
  function cancelAttack() { if (!selectedUid) return; clearPlacement(); paintPlacement(); toast('已取消放置，未消耗卡牌或能量。'); }
  function toggleAuto() {
    if (busy || modalOpen || run.screen !== 'battle' || battle.status !== 'playing') return;
    auto = !auto; clearPlacement(); saveRun(); render(); tone(auto ? 520 : 300, .08);
    toast(auto ? 'AUTO 开启 · 点击攻击牌，自动选落点并打出' : 'AUTO 关闭 · 选牌后点击格子立即攻击');
  }
  const capacityTips = { consciousness: '大脑、头部、疼痛和失血影响意识；决定抽牌数量，并影响操作、行动与感官。', manipulation: '双臂与双手效率、意识决定操作；影响形状攻击和格挡。', moving: '腿、脚、脊柱、意识与器官决定行动；影响下回合能量和受击倍率。', sight: '双眼与意识决定视觉；影响攻击效能。', hearing: '双耳与意识决定听觉；影响受击倍率。', breathing: '双肺与颈部决定呼吸；影响意识、行动及能量恢复。', pumping: '心脏与血容量决定循环；影响意识、格挡和血容量恢复。', metabolism: '胃与循环决定代谢；影响包扎修复和血容量恢复。' };
  function capacityCards() {
    return Object.entries(battle.hero.capacities).map(([id, value]) => `<div class="capacity-card ${value < .995 ? 'impaired' : value > 1.005 ? 'enhanced' : ''}" title="${capacityTips[id]}"><span>${Body.capacityNames[id]}</span><b>${Math.round(value * 100)}%</b><i><em style="width:${value / 1.75 * 100}%"></em></i></div>`).join('');
  }
  function partNode(id, geometry) {
    const p = battle.hero.part(id), ratio = battle.hero.efficiency(id), color = !ratio ? '#344047' : ratio < .35 ? '#d07968' : ratio < .8 ? '#ddba77' : '#8fb5a0';
    return `<g class="body-part ${selectedPart === id ? 'selected' : ''} ${!ratio ? 'missing' : ''}" data-body-part="${id}" role="button" tabindex="0" aria-label="${p.name}，${p.hp}/${p.maxHp}，${p.affects}" style="--part-color:${color}"><title>${p.name} ${p.hp}/${p.maxHp} · ${p.affects}</title>${geometry}</g>`;
  }
  function bodyDiagram() {
    return `<svg viewBox="0 0 180 235" aria-label="点击身体部位，选择治疗位置">${partNode('torso', '<rect x="62" y="61" width="56" height="75" rx="17"/>')}${partNode('neck', '<rect x="83" y="48" width="14" height="15" rx="4"/>')}${partNode('head', '<ellipse cx="90" cy="29" rx="20" ry="24"/>')}${partNode('leftEar', '<circle cx="68" cy="30" r="5"/>')}${partNode('rightEar', '<circle cx="112" cy="30" r="5"/>')}${partNode('brain', '<ellipse cx="90" cy="20" rx="11" ry="8"/>')}${partNode('leftEye', '<circle cx="82" cy="34" r="4"/>')}${partNode('rightEye', '<circle cx="98" cy="34" r="4"/>')}${partNode('leftArm', '<path d="M58 66 45 68 30 120 47 124 66 79Z"/>')}${partNode('leftHand', '<ellipse cx="35" cy="136" rx="11" ry="14"/>')}${partNode('rightArm', '<path d="m122 66 13 2 15 52-17 4-19-45Z"/>')}${partNode('rightHand', '<ellipse cx="145" cy="136" rx="11" ry="14"/>')}${partNode('leftLeg', '<path d="m66 140 21 0-5 66-19 0Z"/>')}${partNode('rightLeg', '<path d="m93 140 21 0 3 66-19 0Z"/>')}${partNode('leftFoot', '<rect x="54" y="209" width="30" height="17" rx="5"/>')}${partNode('rightFoot', '<rect x="96" y="209" width="30" height="17" rx="5"/>')}${partNode('spine', '<rect x="87" y="83" width="6" height="48" rx="3"/>')}${partNode('leftLung', '<ellipse cx="75" cy="87" rx="9" ry="16"/>')}${partNode('rightLung', '<ellipse cx="105" cy="87" rx="9" ry="16"/>')}${partNode('heart', '<path d="M90 78c-10-8-14 6 0 16 14-10 10-24 0-16Z"/>')}${partNode('stomach', '<ellipse cx="96" cy="115" rx="12" ry="10"/>')}</svg>`;
  }
  function renderHealth() {
    const h = battle.hero, effects = battle.effects, p = h.part(selectedPart) || h.part('torso');
    $('body-diagram').innerHTML = bodyDiagram(); $('capacity-grid').innerHTML = capacityCards();
    $('body-condition').textContent = h.failureReason || (h.boostTurns ? `强化中 · ${h.boostTurns} 回合` : h.parts.some(part => part.hp < part.maxHp) ? '伤势正在影响能力' : '身体机能正常');
    $('body-vitals').innerHTML = bloodMarkup(h)+`<div><span>疼痛</span><b>${Math.round(h.pain * 100)}%</b></div><div><span>每回合流血</span><b class="${h.bleeding ? 'text-danger' : ''}">${h.bleeding.toFixed(1)}</b></div><p>${h.lastHits.length ? h.lastHits.map(hit => `${hit.name} −${hit.damage}${hit.destroyed ? ' 毁坏' : ''}`).join(' / ') : '尚未受伤。点击部位查看详情。'}</p>`;
    $('capacity-effects').innerHTML = `<span>攻击 <b>${Math.round(effects.attack * 100)}%</b></span><span>格挡 <b>${Math.round(effects.block * 100)}%</b></span><span>受击 <b>×${effects.incoming.toFixed(2)}</b></span><span>下回合 <b>${effects.energy}能量 / ${effects.draw}牌</b></span>`;
    $('treatment-part').innerHTML = h.parts.map(part => `<option value="${part.id}" ${selectedPart === part.id ? 'selected' : ''}>${part.name} · ${part.missing ? '缺失' : `${part.hp}/${part.maxHp}`}${part.bleed ? ' · 流血' : ''}</option>`).join('');
    $('part-description').textContent = `${p.name}：${p.affects}${p.detachedBy ? ` · 因${h.part(p.detachedBy).name}毁坏而缺失` : ''}`;
    $('bandage-button').textContent = '包扎 ∞ · 1能量';
    $('bandage-button').disabled = busy || modalOpen || battle.status !== 'playing' || battle.energy < 1 || !battle.canBandage(p.id);
    $('boost-button').textContent = h.boostTurns ? `强化中 · ${h.boostTurns}回合` : `强化 ${h.stimulants}次 · 1能量`;
    $('boost-button').disabled = busy || modalOpen || battle.status !== 'playing' || battle.energy < 1 || !h.stimulants;
    $('treatment-part').disabled = busy || battle.status !== 'playing';
    $('health-button').disabled = busy;
  }
  function selectBodyPart(id) { if (!battle.hero.part(id) || busy) return; selectedPart = id; renderHealth(); if (modalOpen && $('modal-panel').classList.contains('health-modal')) showHealth(); }
  function useMedical(action) {
    if (busy || run.screen !== 'battle' || (modalOpen && !$('modal-panel').classList.contains('health-modal'))) return;
    const result = battle.medical(action, selectedPart);
    if (!result.ok) { toast(result.reason); return; }
    clearPlacement(); commitAction(); render(); shake('hero-figure', 'shield-up'); tone(520, .2);
    toast(result.action === 'bandage' ? result.healed ? `${result.part}修复 ${result.healed} 点，已止血。` : `${result.part}已止血，缺失部位不会再生。` : '强化开启，当前及后续共3个玩家回合生效。');
    if (modalOpen) showHealth();
  }
  function showHealth() {
    const h = battle.hero, sumWeights = h.parts.filter(p => h.available(p.id)).reduce((sum, p) => sum + p.weight, 0);
    openModal('旅人 · 身体与机能', `<p class="modal-note">每个部位独立承伤。父部位毁坏会连带失去子部位；要害失效、意识低于30%、行动不高于15%或血容量耗尽，单人战斗即失败。下列命中率是每段伤害在当前存活部位中的权重，属于本游戏改编规则。</p><div class="capacity-grid health-capacities">${capacityCards()}</div><div class="health-part-list">${h.parts.map(p => `<button data-body-part="${p.id}" class="health-part-row ${p.missing ? 'missing' : p.hp < p.maxHp ? 'injured' : ''} ${selectedPart === p.id ? 'selected' : ''}"><span>${p.internal ? '◇ ' : ''}${p.name}${p.vital ? ' <small>要害</small>' : ''}</span><b>${p.missing ? '缺失' : `${p.hp} / ${p.maxHp}`}</b><small>${p.affects}<br>${p.missing ? p.detachedBy ? `随${h.part(p.detachedBy).name}缺失` : '毁坏；残端可止血，不能再生' : `命中权重 ${(p.weight / sumWeights * 100).toFixed(1)}% · 流血 ${p.bleed.toFixed(1)}/回合`}</small></button>`).join('')}</div><p class="modal-note">已选 ${h.part(selectedPart).name} · 包扎修复最多${battle.effects.healing}点并止血（次数无限）；强化提高机能、持续3个玩家回合（默认每场1次，遗物可增加）。两者均消耗1能量，缺失部位不会再生。</p><div class="health-modal-actions"><button class="gold-button" data-medical="bandage" ${battle.energy < 1 || !battle.canBandage(selectedPart) || battle.status !== 'playing' ? 'disabled' : ''}>包扎所选部位 · 无限次</button><button class="gold-button" data-medical="boost" ${battle.energy < 1 || !h.stimulants || battle.status !== 'playing' ? 'disabled' : ''}>战斗强化剂 · 剩${h.stimulants}次</button></div>`, 'health-modal');
    $('modal-body').insertAdjacentHTML('afterbegin',bloodMarkup(h,true)+statusMarkup(battle.heroState,'hero')+`<div class="health-anatomy">${bodyDiagram()}</div>`);
    if (run.screen !== 'battle') $('modal-body').querySelectorAll('[data-medical]').forEach(b=>b.disabled=true);
    if (['reward','lost','cleared'].includes(run.screen)) $('modal-body').insertAdjacentHTML('beforeend', '<button class="gold-button result-restart" data-open-result>返回战斗结算</button>');
    renderHealth();
  }
  function render() {
    const handScroll=phoneUI?$('hand').scrollLeft:0;
    $('turn').textContent = String(battle.turn).padStart(2, '0'); $('energy').textContent = battle.energy;
    $('energy-orb').classList.toggle('empty', battle.energy === 0);
    $('energy-max').textContent = `/ ${battle.effects.energy}`; $('energy-orb').title = `当前能量 ${battle.energy}，按当前能力与遗物下回合恢复 ${battle.effects.energy}`;
    $('hero-hp').textContent = `${battle.hero.hp} / ${battle.hero.maxHp}`; $('hero-hp-fill').style.width = `${battle.hero.hp / battle.hero.maxHp * 100}%`;
    $('enemy-hp').textContent = `${battle.enemy.hp} / ${battle.enemy.maxHp}`;
    $('hero-health').setAttribute('aria-valuenow', battle.hero.hp); $('hero-health').setAttribute('aria-valuemax', battle.hero.maxHp);
    $('enemy-health').setAttribute('aria-valuenow', battle.enemy.hp);
    $('enemy-health').setAttribute('aria-valuemax', battle.enemy.maxHp);
    $('hero-blood').innerHTML=bloodMarkup(battle.hero,true);
    $('hero-status').innerHTML = `<span class="subtle-status">${battle.hero.failureReason || (battle.hero.bleeding?'流血 '+battle.hero.bleeding.toFixed(1)+' / 回合':'')}${battle.hero.block?' · 格挡 '+battle.hero.block:''}</span>`;
    $('hero-status').insertAdjacentHTML('beforeend',statusMarkup(battle.heroState,'hero'));
    $('enemy-status').innerHTML = (battle.enemy.block ? `<span class="status shield" title="护甲吸收1点冲击；穿甲忽略护甲">${icon('shield')} ${battle.enemy.block} 格护甲</span>` : '') + (battle.enemy.strength ? `<span class="status strength" title="攻击伤害永久增加">${icon('sword')} +${battle.enemy.strength}</span>` : '');
    const intent = battle.intent;
    $('intent-value').innerHTML = `${icon(intent.type === 'attack' ? 'sword' : 'shield')} <b>${intent.damage || intent.block}</b>${intent.strength ? `<small>随后 +${intent.strength} 力量</small>` : ''}`;
    if(battle.enemy.staggered)$('intent-value').innerHTML='<b>失衡</b><small>跳过本次行动</small>';
    $('intent-label').textContent = intent.name;
    $('enemy-intent').classList.toggle('defensive', intent.type === 'defend');
    $('enemy-intent').title = intent.damage ? `攻击 ${intent.damage}，按当前受击倍率约 ${Math.round(intent.damage * battle.effects.incoming)} 点；先格挡，再按部位权重分配最多3段${intent.strength ? `，随后力量+${intent.strength}` : ''}` : `为${intent.block}个生命格覆甲，护甲在下一次敌方行动前清空`;
    if(battle.enemy.staggered)$('enemy-intent').title='失衡：跳过原定行动，之后恢复。';
    else if(intent.inflict?.length)$('enemy-intent').title+='；造成生命伤害后施加'+intent.inflict.map(a=>R.statuses[a.kind].name+' '+a.potency+'威力/'+a.count+'次数').join('、')+(intent.tremorBurst?'，并对已有震颤触发爆发。':'。');
    $('draw-count').textContent = battle.drawPile.length; $('discard-count').textContent = battle.discardPile.length;
    $('hand-count').textContent = battle.hand.length; $('exhaust-count').textContent = battle.exhaustPile.length ? `已消耗 ${battle.exhaustPile.length}` : '';
    $('phase-label').textContent = busy ? '敌方行动' : battle.overflowCount?'需要确认弃牌':battle.status === 'playing' ? '你的回合' : '战斗结束'; $('end-turn').disabled = busy || !!battle.overflowCount || run.screen !== 'battle' || battle.status !== 'playing';
    $('hand').style.setProperty('--cards', battle.hand.length);
    $('hand').innerHTML = battle.hand.map((card, i) => {
      const d = battle.definition(card), affordable = d.cost <= battle.energy && !(d.shape&&battle.heroState.staggered);
      const desc = (d.shape ? `<span><b>${d.shape.length}</b> 格${d.shapeName} · 攻效${Math.round(d.power * 100)}%</span><small>${auto ? '自动落点' : '点格即出'}</small>` : '') + (R.cards[card.id].block ? `<span>格挡 <b>${d.block}</b></span>` : '') + (d.pierce ? '<small>穿甲</small>' : '') + (d.draw ? `<span>抽 <b>${d.draw}</b> 张牌</span>` : '') + (d.energy ? `<span>能量 <b>+${d.energy}</b></span>` : '') + (d.heal?`<span>修复伤处 <b>${Math.round(d.heal*battle.hero.capacities.metabolism)}</b></span>`:'')+(d.cleanse?'<small>全部止血</small>':'')+(d.exhaust?'<small>消耗</small>':'');
      return `<button class="card card-${card.id} ${d.upgraded ? 'upgraded' : ''} ${!affordable ? 'unaffordable' : ''}" style="--r:${(i - (battle.hand.length - 1) / 2) * 2.5}deg;--i:${i}" data-uid="${card.uid}" ${busy ? 'disabled' : ''} aria-label="${i + 1}号牌 ${d.name}，消耗${d.cost}能量，${d.description}" title="${affordable ? d.shape ? auto ? '点击自动攻击' : '选中后点击格子立即攻击' : '点击打出' : battle.heroState.staggered&&d.shape?'失衡中不能攻击；可以使用技能或医疗':'能量不足'}"><span class="card-cost">${d.cost}</span><span class="card-heading">${d.name}</span><span class="card-art">${art(card.id)}</span><span class="card-type">${d.type === 'attack' ? '形 状 攻 击' : '技 能'}</span><span class="card-description">${desc}<small class="card-ailment">${(d.inflict||[]).map(a=>R.statuses[a.kind].name+' '+a.potency+'×'+a.count).join(' · ')}${d.tremorBurst?' · 震颤爆发':''}${d.purge?.length?' · 净化':''}</small></span><span class="card-key">${i + 1}</span><span class="card-corner">✦</span></button>`;
    }).join('');
    if(phoneUI)$('hand').scrollLeft=handScroll;
    $('arena').classList.toggle('victory', battle.status === 'won'); $('enemy-figure').classList.toggle('defeated', battle.status === 'won');
    renderGrid(); renderHealth(); renderRun();renderEnemies();
    if(phoneUI)document.dispatchEvent(new CustomEvent('ember:render',{detail:{screen:run.screen,nodeId:run.nodeId,selectedUid,busy}}));
    if(battle.overflowCount&&!busy)showOverflow();
    else if(run.pendingDeckAction&&!busy&&!modalOpen)showDeckAction();
  }
  function play(uid) {
    if (busy || modalOpen || run.screen !== 'battle') return;
    if(battle.overflowCount){showOverflow();return;}
    const card = battle.hand.find(c => c.uid === uid); if (!card || battle.status !== 'playing') return;
    const d = battle.definition(card);
    if(d.shape&&battle.heroState.staggered){toast('失衡中不能攻击，可使用技能、包扎或强化剂。');return;}
    if (d.cost > battle.energy) { toast('能量不足，可以结束回合恢复能量。'); return; }
    if (d.shape) {
      if (auto) {
        const placement = battle.autoPlacement(card);
        if (!placement) { toast('没有可命中的位置，未消耗卡牌或能量。'); return; }
        resolvePlay(uid, placement); return;
      }
      if (selectedUid === uid) { cancelAttack(); return; }
      flushPointerAim(); selectedUid = uid; rotation = 0; anchorChosen = false; wheelAmount = 0; lastWheelAt = 0; lastWheelTurn = -Infinity; aimAt(aim.x, aim.y, true); render(); tone(300, .08);
      toast(phoneUI?`${d.name}已选中 · 点生命格攻击，下方按钮旋转`:`${d.name}已选中 · 图案中心跟随鼠标，点击攻击，滚轮旋转`); return;
    }
    clearPlacement(); resolvePlay(uid);
  }
  function resolvePlay(uid, placement = null) {
    const result = battle.play(uid, placement); if (!result.ok) { tone(90); toast(result.reason); return; }
    clearPlacement(); commitAction();
    $('first-hint').classList.add('dismissed'); render();
    if (result.plan) attackFeedback(result); else tone(440, .15);
    if (result.definition.block) { floatText('hero-actor', `+${result.definition.block} 格挡`, 'block'); if (!result.plan) shake('hero-figure', 'shield-up'); }
    if (result.recovery) { floatText('hero-actor',`+${result.recovery.healed} 修复`,'block');toast(result.recovery.cleanse?'修复伤处并止住全部出血。':`修复${result.recovery.part||'身体'} ${result.recovery.healed} 点。`); }
    statusFeedback(result.statusEvents);
    if (battle.status !== 'playing') { const serial = battleSerial; setTimeout(() => { if (serial === battleSerial) showResult(); }, 1000); }
  }
  function confirmAttack() { const card = selectedCard(); if (!card || busy || modalOpen || !anchorChosen) return; const plan = battle.planAttack(card, { ...anchor, rotation }); if (!plan.ok) { toast(plan.reason); return; } resolvePlay(card.uid, { ...anchor, rotation }); }
  function endTurn() {
    if (busy || modalOpen || run.screen !== 'battle' || battle.status !== 'playing') return;
    if(battle.overflowCount){showOverflow();return;}
    clearPlacement(); const serial = battleSerial;
    // Resolve and save atomically before playing feedback; reloading cannot skip this enemy turn.
    const result=battle.endTurn();if(!result.ok)return;const intent=result.intent; commitAction();
    busy = true; $('first-hint').classList.add('dismissed'); render();
    if (intent.damage) shake('enemy-figure', 'attacking');
    if(battle.members.length>1)for(const [i,a]of result.actions.entries())setTimeout(()=>{if(serial!==battleSerial)return;shake('enemy-slot-'+a.index,a.intent.damage?'attacking':'shield-up');if(a.intent.damage)strikeEffect('enemy-slot-'+a.index,'hero-figure',!a.hit.lost);},i*180);
    toast(`${intent.name} · ${intent.damage ? `${intent.damage}点攻击来袭` : intent.block?'敌人正在覆甲':'负面状态结算'}`);
    setTimeout(() => {
      if (serial !== battleSerial) return;
      if (result.hit.hits.length) selectedPart = battle.hero.bestTreatment()?.id || result.hit.hits[0].id;
      busy = false; render();
      if (result.intent.damage) {
        if(battle.members.length===1)strikeEffect('enemy-figure', 'hero-figure', !result.hit.lost);
        if (result.hit.lost) { shake('hero-figure'); shake('hero-health', 'impact-pulse'); floatText('hero-actor', `−${result.hit.lost}`, 'damage'); tone(75, .28, 'sawtooth'); }
        else { shake('hero-figure', 'shield-up'); floatText('hero-actor', `格挡 ${result.hit.blocked}`, 'block'); tone(360, .2); }
        announceImpact(result.intent.name, result.hit.lost ? `−${result.hit.lost}` : '格挡', `${result.hit.hits.length ? result.hit.hits.map(wound => `${wound.name} −${wound.damage}${wound.destroyed ? ' 毁坏' : ''}`).join(' / ') : '伤害已被格挡'}${result.hit.blocked ? ` · 格挡 ${result.hit.blocked}` : ''}`, result.hit.lost ? 'hero-damage' : 'block');
        $('body-diagram').querySelectorAll('[data-body-part]').forEach(e => { if (result.hit.hits.some(wound => wound.id === e.dataset.bodyPart)) e.classList.add('just-hit'); });
        if (result.hit.blocked && result.hit.lost) floatText('hero-actor', `格挡 ${result.hit.blocked}`, 'block secondary');
      } else if(result.actions.some(a=>a.intent.block)) {
        shake('enemy-grid-panel', 'shield-up'); announceImpact(result.intent.name, `+${result.actions.reduce((sum,a)=>sum+battle.members[a.index].block,0)}`, '各敌人为自己的生命格覆甲', 'block'); tone(360, .2);
      } else {
        announceImpact('状态结算',battle.status==='won'?'全灭':'失衡',result.statusEvents?.map(e=>e.text).join(' / ')||'敌人跳过行动','damage');
      }
      statusFeedback(result.statusEvents);
      if (battle.status !== 'playing') setTimeout(() => { if (serial === battleSerial) showResult(); }, 1000); else toast(`第 ${battle.turn} 回合 · ${battle.energy} 能量 / 抽牌 ${battle.effects.draw} · ${battle.hero.bleeding ? '正在流血，可选择部位包扎' : '留意身体机能'}`);
    }, 650+Math.max(0,result.actions.length-1)*180);
  }
  function openModal(title, content, className = '') {
    hideRelicTooltip();const panel=$('modal-panel'),keepScroll=(phoneUI||className==='overflow-panel'||className==='deck-action-panel'||className==='tech-panel')&&modalOpen&&panel.className===`modal-panel ${className}`,scroll=panel.scrollTop;
    modalOpen = true; $('modal-title').textContent = title; $('modal-body').innerHTML = content; panel.className = `modal-panel ${className}`; $('modal').hidden = false;
    $('modal-close').disabled=className==='overflow-panel';
    if(keepScroll)panel.scrollTop=scroll;else if(phoneUI){panel.scrollTop=0;$('modal-close').focus({preventScroll:true});}else $('modal-close').focus();
    if(phoneUI)document.dispatchEvent(new CustomEvent('ember:modal'));
  }
  function closeModal() {if(run.screen==='battle'&&battle.overflowCount)return;if(run.pendingDeckAction&&$('modal-panel').classList.contains('deck-action-panel')){run.cancelDeckAction();saveRun();}modalOpen = false; $('modal').hidden = true;$('modal-close').disabled=false; const target=run.screen==='battle'?$('end-turn'):$('route-button');if(phoneUI)target.focus({preventScroll:true});else target.focus();renderHealth();if(phoneUI)document.dispatchEvent(new CustomEvent('ember:modal')); }
  function restart() { saveRun(true); adoptRun(new Floor({profile})); saveRun(); closeModal(); render(); }
  function showPile(pile) {
    const names = { draw: '抽牌堆', discard: '弃牌堆', deck: '初始牌组', exhaust: '消耗区' };
    const cards = pile === 'draw' ? battle.drawPile : pile === 'discard' ? battle.discardPile : pile === 'exhaust' ? battle.exhaustPile : battle.allCards;
    const counts = {}; cards.forEach(c => counts[c.id] = (counts[c.id] || 0) + 1);
    openModal(`${names[pile]} · ${cards.length} 张`, `<p class="modal-note">${pile === 'draw' ? '以下按类型展示，不代表抽取顺序。抽牌堆耗尽时，弃牌会重新洗入。' : pile === 'discard' ? '打出的牌和回合结束时的手牌会进入这里。' : pile === 'exhaust' ? '消耗的牌在本局战斗中不会再被抽到。' : '跨五层延续的完整牌组。战斗奖励、商店和营火可加入新牌，下一场战斗会重新洗牌。'}</p><div class="pile-list">${Object.entries(counts).map(([id, count]) => { const d = battle.definition(id); return `<div class="pile-item"><span class="mini-art ${id}">${art(id)}</span><div><strong>${d.name} <small>×${count}</small></strong><p>${d.description}</p></div><span class="mini-cost">${d.cost}</span></div>`; }).join('') || '<p class="empty-pile">这里暂时没有牌。</p>'}</div>`);
  }
  function showHelp() {
    if(run.exploration){openModal('提灯旅人 · 树海探索手册','<div class="help-grid"><div><h3>四向探索与有限步数</h3><p>点节点预览路线，再确认移动。徒步每经过一格消耗1步，途中不能越过未完成节点；完成的节点变空地，可回走。折跃索与滑翔翼消耗装置次数和1步，可越过节点。迷雾靠近后揭示，地图可拖动浏览。</p></div><div><h3>补给、观测与追猎</h3><p>五层初始14/13/12/11/10步。应急补给一次增加4步及1次折跃索，观测台揭示2格。0步后可迎战追猎，胜利确认返回恢复4步，没有其他战利品，逐波增强；到达首领后仍可用完最后一步完成战斗。</p></div><div><h3>战斗与医疗</h3><p>多敌战斗先点目标，再选攻击牌并点生命格立即攻击；AUTO免放置。手牌最多9张，超额后勾选并确认弃牌。包扎无限次，每次1能量，点身体选择部位；技能、部位伤势和五种负面状态沿用原规则。</p></div><div><h3>余火传承</h3><p>首领给予遗物及科技点。遗物在顶部按获得顺序排列，点图标看效果；永久科技三条分支重开保留，新解锁下次新旅途生效。当前旅途和永久科技一起导出、确认后导入合并；旧档本层保留旧图，过层进入新地图。</p></div></div><div class="save-actions"><button class="outline-button" data-sea-help>详细移动规则</button><button class="outline-button" data-open-tech>永久科技树</button><button class="outline-button" data-open-statuses>战斗状态说明</button></div>');return;}
    if(phoneUI){
      openModal('手机操作手册','<div class="help-grid"><div><h3>滑动手牌，点格攻击</h3><p>左右滑动底部手牌。多敌战斗先点敌人选目标，再选攻击牌、点它的生命格打出；图案以触点为中心。下方按钮可以旋转、取消，开启AUTO后点攻击牌便自动放置。技能点牌直接使用。滑动浏览不会出牌。</p></div><div><h3>把常用操作放在手边</h3><p>能量、抽牌堆、弃牌堆和结束回合位于手牌下方。底部「身体」查看伤势、选择部位包扎或注射强化剂；包扎次数无限，每次1能量。健康面板可上下滑动。</p></div><div><h3>滑动探索回廊</h3><p>地图可以上下和左右滑动，点亮的节点可前往。进入房间后显示事件或商店等选择，处理完再继续走图。旅途共五层，每层独立路线、逐层增强的敌人和关底首领。营火可永久强化一张牌或自由移除卡牌，先选后确认。精英与首领掉落遗物，可在「更多」查看；前四层首领结算选择补给进入下一层，第五层胜利才完成旅途。</p></div><div><h3>把旅途带到手机</h3><p>操作后自动保存。切换设备前在「存档」导出，再在新设备导入。手牌超出9张会显示原手牌与新牌，选足数量后点击确认弃牌，确认前可修改选择。横屏会将战斗与手牌放在两侧；竖屏时手牌与常用按钮保持在底部。</p></div></div>');
      return;
    }
    openModal('提灯旅人的旅途手册','<div class="help-grid"><div>'+icon('star')+'<h3>五层独立路线</h3><p>从残火之径，穿过潮汐书库、铜炉工坊和碎镜天台，抵达群星熔心。每层十二站47节点，四种走向。首层随机挑战三位首领之一，后四层各有专属首领。</p></div><div>'+icon('sword')+'<h3>54张卡牌</h3><p>新卡随楼层解锁，高层战斗奖励保证一张本层新卡。支持多层削伤、穿甲、格挡、抽牌、能量、治疗和止血。营火可选一张牌强化一次，名称带+；移除牌也可自由选择，选后确认。鼠标居中放置，点格即出；R/滚轮旋转，右键取消，AUTO按所选目标自动放置。每场可有1–3名敌人，各自行动，全灭后领奖；手牌超过9张时选牌并确认弃牌，可保留新抽到的牌。</p></div><div>'+icon('shield')+'<h3>医疗与过层补给</h3><p>包扎无限次，每次1能量，不能再生。强化默认每场1次，炼金试管增加至2次。前四层胜利可选择补给，修复存活部位60%、止血、补满血容量、获得35金币和一张卡；再生补给可修复一支缺失部位树。</p></div><div>'+icon('flame')+'<h3>逐层增强的敌人</h3><p>共55种敌人、28件遗物、24类双选事件。首层普通生命10–18，首领34–42；后四层首领生命60/82/108/144。护甲、攻击和狂怒逐渐增强。精英与首领掉落本层已解锁且未拥有的遗物。</p></div></div><p class="modal-note">第五层首领胜利才完成旅途。进度、伤势、牌组和遗物跨层延续；过层、动作与奖励后自动保存。支持v1–v8存档，旧路线与战斗保留，旧首层通关可继续第二层。导入前预览并备份。</p><div class="shortcut-line"><kbd>1</kbd>–<kbd>9</kbd> 出牌 · <kbd>R</kbd> 旋转 · <kbd>A</kbd> AUTO · <kbd>E</kbd> 结束回合</div>');
  }
  function showResult() {
    if(!['reward','lost','cleared'].includes(run.screen))return;
    const cleared=run.screen==='cleared',won=run.screen==='reward'||cleared,loot=run.lastLoot;
    if(run.exploration?.pursuing){openModal(won?'摆脱追猎':'倒在追猎之中','<div class="result-emblem">'+icon(won?'flame':'shield')+'</div><p class="result-story">'+(won?'追猎者暂时退去。确认返回地图后恢复4步行动力；本场不发放金币、卡牌、遗物或科技点。下一波追猎会更强。':escapeHtml(run.hero.failureReason)+'。此前获得的永久科技与点数仍会保留。')+'</p>'+(won?'<button class="gold-button" data-card-reward="skip">返回地图 · 恢复4步</button>':'<button class="gold-button" data-new-run>开始新旅途</button>')+'<div class="save-actions"><button class="outline-button" data-open-tech>永久科技树</button><button class="outline-button" data-save-export>导出旅途与科技</button></div>','result-panel');return;}
    const defeated=battle.encounters.filter(Boolean).map(e=>e.name).join('、')||'敌人';
    const cards=run.offers.map(id=>{const d=R.cards[id];return '<button class="reward-card" data-card-reward="'+id+'" '+(run.deck.length>=120?'disabled':'')+'><span class="mini-art">'+art(id)+'</span><b>'+d.name+'</b>'+cardEffects(id)+'</button>';}).join('');
    const drops=loot?.relics.length?'<div class="loot-section"><p>已自动获得遗物</p>'+loot.relics.map(relicMarkup).join('')+'</div>':'';
    const techReward=cleared?'<div class="tech-clear-reward"><b>余火传承 +'+(loot?.techPoints||0)+' 点 · 已入账</b><span>可用 '+profile.points+' 点，重开保留</span><button class="outline-button" data-open-tech>查看永久科技树 ↗</button></div>':'';
    const story=cleared?escapeHtml(defeated)+'已被击败。<br>'+(run.completed?'五层首领尽数倒下，余火终于化为黎明。':'下一层：'+R.floors[run.floorNumber].name+'。选择一份补给继续旅途。'):won?escapeHtml(defeated)+'已被击败。<br>'+(loot?.gold?'获得 '+loot.gold+' 金币。':'金币奖励已入账。')+'选择一张卡牌，或跳过。':escapeHtml(run.hero.failureReason)+'。<br>这次旅途结束，存档仍可导出留存。';
    let actions=run.screen==='reward'?'<div class="card-rewards">'+cards+'</div><button class="outline-button" data-card-reward="skip">跳过卡牌，继续路线 →</button>':'<button class="gold-button" data-new-run>重新点亮提灯</button>';
    if(cleared&&!run.completed)actions='<p class="ascent-note">前往下一层时：存活部位修复60% · 全部止血 · 血容量补满 · 获得35金币。'+(run.deck.length>=120?'牌组已满，本次不添加补给卡牌。':'')+'</p><div class="ascent-choices">'+run.ascentChoices.map(c=>'<button class="node-choice" data-next-floor="'+c.id+'"><b>'+c.title+' · '+R.cards[c.card].name+'</b><span>'+c.note+cardEffects(c.card)+'</span><i>↗</i></button>').join('')+'</div>';
    openModal(run.completed?'五层旅途 · 黎明已至':cleared?'第'+run.floorNumber+'层 · 首领已败':won?'战利品':'提灯熄灭',campaignTrail()+'<div class="result-emblem">'+icon(won?'flame':'shield')+'</div><p class="result-eyebrow">'+(run.completed?'THE DAWN RETURNS':cleared?'FLOOR '+run.floorNumber+' CLEARED':won?'ENCOUNTER CLEARED':'THE EMBERS WILL RETURN')+'</p><p class="result-story">'+story+'</p>'+techReward+drops+(loot?.fallbackGold?'<p class="modal-note">本层已解锁遗物已集齐，掉落转为45金币。</p>':'')+'<div class="result-stats"><div><b>'+(run.history.reduce((sum,h)=>sum+h.visited.length,0)+run.visited.length+(won&&!cleared?1:0))+'</b><span>完成节点</span></div><div><b>'+run.gold+'</b><span>金币</span></div><div><b>'+run.deck.length+'</b><span>牌组</span></div></div><button class="result-health-link" data-open-health>查看身体与无限包扎 ↗</button>'+actions+(!cleared?'<button class="outline-button" data-open-tech>永久科技 · '+profile.points+' 点</button>':'')+'<button class="outline-button" data-save-export>导出这次旅途</button><p class="result-footnote">奖励已结算 · 过层选择后自动保存</p>','result-panel');
  }

  document.addEventListener('click', e => {
    const moveMode=e.target.closest('[data-sea-mode]');if(moveMode&&!moveMode.disabled&&run.exploration&&run.screen==='map'&&!busy&&!modalOpen){run.exploration.mode=moveMode.dataset.seaMode;saveRun();render();}
    if(e.target.closest('[data-sea-help]'))showExplorationHelp();
    if(e.target.closest('[data-sea-locate]'))locateSea();
    const seaMove=e.target.closest('[data-sea-move]');if(seaMove&&!seaMove.disabled)routeAction(seaMove.dataset.seaMove);
    if(e.target.closest('[data-start-pursuit]')&&!busy&&!modalOpen&&run.startPursuit(Battle)){adoptRun(run);saveRun();render();}
    if(e.target.closest('[data-open-tech]'))showTech();
    const techSelect=e.target.closest('[data-tech-select]');if(techSelect){selectedTech=techSelect.dataset.techSelect;showTech();}
    const techUnlock=e.target.closest('[data-tech-unlock]');if(techUnlock&&!techUnlock.disabled){saveRun();const result=profile.unlock(techUnlock.dataset.techUnlock);if(result.ok){saveRun();renderRelics();showTech();toast('科技已解锁，下次新旅途生效。');}else{showTech();toast(result.reason);}}
    const relicSlot=e.target.closest('[data-relic-id]');if(relicSlot)showRelic(relicSlot.dataset.relicId);
    if(e.target.closest('[data-open-statuses]'))showStatuses();
    const deckPick=e.target.closest('[data-deck-pick]');if(deckPick&&!deckPick.disabled&&run.selectDeckCard(Number(deckPick.dataset.deckPick))){saveRun();showDeckAction();}
    if(e.target.closest('[data-cancel-deck]'))closeModal();
    if(e.target.closest('[data-confirm-deck]')){const result=run.confirmDeckAction();if(result.ok){afterNodeAction();toast('卡牌已更新并自动保存。');}else if(result.reason)toast(result.reason);}
    const target=e.target.closest('[data-enemy-target]');if(target&&!busy&&!modalOpen&&battle.selectTarget(Number(target.dataset.enemyTarget))){saveRun();render();}
    const pick=e.target.closest('[data-overflow-pick]');if(pick&&battle.toggleOverflow(pick.dataset.overflowPick)){saveRun();showOverflow();}
    if(e.target.closest('[data-confirm-overflow]')&&battle.confirmOverflow()){saveRun();closeModal();render();}
    const bodyPart = e.target.closest('[data-body-part]'); if (bodyPart) selectBodyPart(bodyPart.dataset.bodyPart);
    const medical = e.target.closest('[data-medical]'); if (medical) useMedical(medical.dataset.medical);
    if (e.target.closest('[data-open-health]')) showHealth();
    if (e.target.closest('[data-open-result]')) showResult();
    if (e.target.closest('[data-open-relics]')) showRelics();
    const card = e.target.closest('[data-uid]'); if (card) play(card.dataset.uid);
    const node=e.target.closest('[data-node]'); if(node && !node.disabled){if(run.exploration&&!busy&&!modalOpen&&run.screen==='map'){selectedSeaNode=node.dataset.node;render();$('route-map').querySelector('[data-node="'+selectedSeaNode+'"]')?.focus({preventScroll:true});}else routeAction(node.dataset.node);}
    const choice=e.target.closest('[data-node-choice]'); if(choice && !choice.disabled && !modalOpen) { const result=run.choose(choice.dataset.nodeChoice); if(result.ok){if(result.pending){saveRun();render();}else afterNodeAction();} else if(result.reason)toast(result.reason); }
    const buy=e.target.closest('[data-buy]'); if(buy && !buy.disabled && !modalOpen) { const result=run.buy(buy.dataset.buy); if(result.ok) { adoptRun(run); saveRun(); render(); } else if(result.reason)toast(result.reason); }
    const cardReward=e.target.closest('[data-card-reward]'); if(cardReward && run.chooseCard(cardReward.dataset.cardReward)) afterNodeAction();
    const ascent=e.target.closest('[data-next-floor]');if(ascent&&!busy&&run.advanceFloor(ascent.dataset.nextFloor))afterNodeAction();
    if(e.target.closest('[data-save-export]')) exportSave();
    if(e.target.closest('[data-save-import]')) { $('save-file').value=''; $('save-file').click(); }
    if(e.target.closest('[data-save-backup]')) { let raw=memoryBackup; try { raw=raw||localStorage.getItem(BACKUP_KEY); } catch (_) {} if(raw) downloadSave(raw,'余烬回廊-替换前备份.json'); }
    if(e.target.closest('[data-confirm-import]') && pendingImport) { saveRun(true); const imported=pendingImport; pendingImport=null; adoptRun(imported.run); auto=imported.options.auto; sound=imported.options.sound; saveRun(); closeModal(); render(); if(['reward','lost','cleared'].includes(run.screen)) showResult(); }
    if(e.target.closest('[data-new-run]')) showRestart();
  });
  function showRestart(){if(busy)return;openModal('开始新的旅途？','<p class="modal-note">当前旅途将被替换，并保存为本机备份。<strong>永久科技、通层记录和剩余科技点保留</strong>，所有已解锁能力在新旅途生效。</p><div class="save-actions"><button class="outline-button" data-save-export>先导出当前存档</button><button class="gold-button" id="confirm-restart">开始新旅途</button></div>');}
  $('end-turn').addEventListener('click', endTurn); $('help-button').addEventListener('click', showHelp);
  $('route-map').addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0)return;ignoreSeaClick=false;const viewport=e.target.closest('.sea-map-viewport');if(viewport)seaDrag={id:e.pointerId,x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,viewport,moved:false};});
  $('route-map').addEventListener('pointermove',e=>{if(!seaDrag||seaDrag.id!==e.pointerId||!e.buttons)return;const dx=e.clientX-seaDrag.x,dy=e.clientY-seaDrag.y;if(!seaDrag.moved&&Math.hypot(dx,dy)>6){seaDrag.moved=true;seaDrag.viewport.setPointerCapture(e.pointerId);seaDrag.viewport.classList.add('grabbing');}if(seaDrag.moved){e.preventDefault();seaDrag.viewport.scrollLeft=seaDrag.left-dx;seaDrag.viewport.scrollTop=seaDrag.top-dy;}});
  function stopSeaDrag(e){if(!seaDrag||seaDrag.id!==e.pointerId)return;ignoreSeaClick=seaDrag.moved;seaDrag.viewport.classList.remove('grabbing');if(seaDrag.viewport.hasPointerCapture(e.pointerId))seaDrag.viewport.releasePointerCapture(e.pointerId);seaDrag=null;}
  $('route-map').addEventListener('pointerup',stopSeaDrag);$('route-map').addEventListener('pointercancel',stopSeaDrag);
  $('route-map').addEventListener('click',e=>{if(ignoreSeaClick&&e.detail!==0){e.preventDefault();e.stopImmediatePropagation();ignoreSeaClick=false;}},true);
  $('health-button').addEventListener('click', showHealth); $('bandage-button').addEventListener('click', () => useMedical('bandage')); $('boost-button').addEventListener('click', () => useMedical('boost'));
  $('treatment-part').addEventListener('change', e => selectBodyPart(e.target.value));
  $('enemy-grid').addEventListener('pointermove', queuePointerAim);
  $('enemy-grid').addEventListener('pointerdown', e => { if (e.button === 0) { flushPointerAim(); applyPointerAim({ x: e.clientX, y: e.clientY }); } });
  $('enemy-grid').addEventListener('focusin', e => { const cell = e.target.closest('[data-cell]'); if (cell && aimSource === 'keyboard') aimAtCell(Number(cell.dataset.cell)); });
  $('enemy-grid').addEventListener('click', e => {
    if (busy || modalOpen || battle.status !== 'playing') return;
    if (auto) { toast('AUTO已开启，点击攻击牌即可出牌。'); return; }
    if (!selectedCard()) { toast('先选择一张攻击牌，再点击棋盘立即攻击。'); return; }
    flushPointerAim(); const cell = e.target.closest('[data-cell]');
    if (e.detail === 0 && cell && !e.pointerType) aimAtCell(Number(cell.dataset.cell)); else applyPointerAim({ x: e.clientX, y: e.clientY });
    confirmAttack();
  });
  $('enemy-grid').addEventListener('wheel', e => {
    if (!selectedCard() || busy || modalOpen || auto || e.ctrlKey || e.metaKey || !e.deltaY) return;
    e.preventDefault(); const now = performance.now(); if (now - lastWheelAt > 180) wheelAmount = 0; lastWheelAt = now;
    wheelAmount += e.deltaY * (e.deltaMode ? 20 : 1);
    if (Math.abs(wheelAmount) >= 18 && now - lastWheelTurn >= 100) { flushPointerAim(); applyPointerAim({ x: e.clientX, y: e.clientY }); rotateAttack(Math.sign(wheelAmount)); wheelAmount = 0; lastWheelTurn = now; }
  }, { passive: false });
  $('enemy-grid').addEventListener('contextmenu', e => { if (selectedCard() && !busy && !modalOpen) { e.preventDefault(); cancelAttack(); } });
  $('rotate-attack').addEventListener('click', () => rotateAttack()); $('cancel-attack').addEventListener('click', cancelAttack); $('auto-button').addEventListener('click', toggleAuto);
  root.addEventListener('resize', () => { if (selectedCard()) paintPlacement(); });
  $('draw-pile').addEventListener('click', () => showPile('draw')); $('discard-pile').addEventListener('click', () => showPile('discard'));
  $('deck-button').addEventListener('click', () => showPile('deck'));
  $('log-button').addEventListener('click', () => openModal('战斗记录', `<ol class="battle-log">${battle.log.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ol>`));
  $('restart-button').addEventListener('click',showRestart);
  $('modal-body').addEventListener('click', e => { if (e.target.closest('#confirm-restart')) restart(); });
  $('sound-button').addEventListener('click', () => { sound = !sound; saveRun(); $('sound-button').classList.toggle('active', sound); $('sound-button').setAttribute('aria-pressed', String(sound)); $('sound-button').title = sound ? '关闭音效' : '开启音效'; toast(sound ? '音效已开启' : '音效已关闭'); if (sound) tone(500); });
  $('route-button').addEventListener('click',showRoute); $('save-button').addEventListener('click',showSaveMenu);
  $('relic-badge').addEventListener('click',showRelics);
  $('relic-slots').addEventListener('pointerover',e=>showRelicTooltip(e.target.closest('[data-relic-id]')));
  $('relic-slots').addEventListener('focusin',e=>showRelicTooltip(e.target.closest('[data-relic-id]')));
  $('relic-slots').addEventListener('pointerout',e=>{if(!e.target.closest('[data-relic-id]')?.contains(e.relatedTarget))hideRelicTooltip();});$('relic-slots').addEventListener('focusout',hideRelicTooltip);
  root.addEventListener('scroll',hideRelicTooltip,true);root.addEventListener('resize',hideRelicTooltip);
  root.addEventListener('storage',e=>{if(e.key===PROFILE_KEY&&e.newValue){try{if(e.newValue.length>MAX_SAVE_SIZE)return;profile.merge(P.Profile.restore(JSON.parse(e.newValue)));renderRelics();if(modalOpen&&$('modal-panel').classList.contains('tech-panel'))showTech();}catch(_){/* Keep valid in-memory progress. */}}});
  $('asset-warning').addEventListener('click',()=>openModal('图片资源未完整加载','<p class="modal-note">以下本地图片加载失败：'+[...artErrors].map(escapeHtml).join('、')+'。已尽量保留基础场景和角色作为回退。</p><p class="modal-note">可以刷新页面，或直接打开项目中的独立离线HTML；使用dist版本时，请保持assets目录完整。</p>'));
  $('save-file').addEventListener('change',async e=>{
    const file=e.target.files[0]; if(!file) return;
    try {
      if(file.size>MAX_SAVE_SIZE) throw new Error('存档文件过大，请选择本游戏导出的 JSON 文件。');
      const raw=await file.text(); let data;
      try { data=JSON.parse(raw); } catch (_) { throw new Error('文件不是有效的 JSON 存档。'); }
      pendingImport=Floor.restore(data,Battle);
      const imported=pendingImport.run;
      const merged=P.Profile.restore(profile.snapshot()).merge(imported.profile);
      openModal('确认导入这次旅途？',`<p class="modal-note">文件：${escapeHtml(file.name)}</p><div class="save-summary"><b>${imported.label} · ${imported.visited.length}/${imported.stations}站</b><span>${imported.gold} 金币 · ${imported.deck.length} 张牌</span><span>身体 ${imported.hero.hp}/${imported.hero.maxHp} · ${imported.screen==='cleared'?(imported.completed?'五层已通关':'本层已完成，待选择补给'):imported.screen==='lost'?'旅途结束':'旅途中'}</span><span>合并后永久科技 ${merged.unlocked.length} / 9 · 可用 ${merged.points} 点</span></div><p class="modal-note">确认后替换当前旅途并备份，永久科技与通层记录合并。重复导入同一旅途不会重复加点；不同备份已解锁的科技均保留，点数按总收入减解锁成本重新计算。若合并了分开消费的备份，超出的消费先由后续收入补足。本局仍使用导入旅途开始时的科技。</p><button class="gold-button" data-confirm-import>确认导入并合并科技</button>`);
    } catch(error) { pendingImport=null; openModal('未导入存档',`<p class="modal-note">${escapeHtml(error instanceof SyntaxError?'文件不是有效的存档。':error.message)}</p><p class="modal-note">当前旅途没有改变。</p>`); }
  });
  $('modal-close').addEventListener('click', closeModal); $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Tab') aimSource = 'keyboard';
    if (!modalOpen && e.target.closest('[data-body-part]') && ['Enter', ' '].includes(e.key)) { e.preventDefault(); selectBodyPart(e.target.closest('[data-body-part]').dataset.bodyPart); return; }
    if (e.key === 'Escape' && modalOpen) { closeModal(); return; }
    if (modalOpen) { if (e.key === 'Tab') { const list = [...$('modal').querySelectorAll('button:not([disabled]),[tabindex="0"]')]; if (e.shiftKey && document.activeElement === list[0]) { e.preventDefault(); list.at(-1).focus(); } else if (!e.shiftKey && document.activeElement === list.at(-1)) { e.preventDefault(); list[0].focus(); } } return; }
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || run.screen!=='battle') return;
    if (e.key === 'Escape' && selectedUid) { e.preventDefault(); cancelAttack(); return; }
    if (e.key.toLowerCase() === 'a') { e.preventDefault(); toggleAuto(); return; }
    if (selectedCard() && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); moveAim(e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0, e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0); return; }
    if (e.key.toLowerCase() === 'r' && selectedUid) { e.preventDefault(); rotateAttack(e.shiftKey ? -1 : 1); return; }
    if (e.key === 'Enter' && selectedUid) { e.preventDefault(); confirmAttack(); return; }
    if (/^[1-9]$/.test(e.key)) { const c = battle.hand[Number(e.key) - 1]; if (c) { e.preventDefault(); play(c.uid); } }
    if (e.key.toLowerCase() === 'e') { e.preventDefault(); endTurn(); }
  });
  $('help-button').innerHTML = icon('info'); $('sound-button').innerHTML = icon('sound'); $('restart-button').innerHTML = icon('reset');
  $('deck-button').innerHTML = `${icon('cards')} <span>牌组</span> <b>10</b>`;
  $('draw-symbol').innerHTML = icon('cards'); $('discard-symbol').innerHTML = icon('cards');
  $('end-turn').innerHTML = `结束回合 ${icon('arrow')}<kbd>E</kbd>`;
  $('layer-legend').innerHTML = `<span class="layer-legend-label">层数</span>${R.layerColors.map((color, i) => `<span class="layer-swatch" style="--layer-color:${color}" title="${i + 1}层生命">${i + 1}</span>`).join('')}`;
  root.emberGame = { get run() { return run; }, get battle() { return battle; }, get profile(){return profile;}, get auto() { return auto; }, restart, play, endTurn, showResult, showHealth, showTech, useMedical, confirmAttack, rotateAttack, cancelAttack, toggleAuto, exportSave };
  try {
    const raw=localStorage.getItem(SAVE_KEY);
    if(raw) {
      if(raw.length>MAX_SAVE_SIZE) throw new Error('已有存档过大');
      const data=JSON.parse(raw),restored=Floor.restore(data,Battle);
      adoptRun(restored.run); auto=restored.options.auto; sound=restored.options.sound; savedAt=typeof data.savedAt==='string'&&!isNaN(Date.parse(data.savedAt))?data.savedAt:null;
      saveRun(restored.migrated);
      if(profileIssue)startupNotice='已从旅途存档恢复永久科技；不可读的原科技记录已尝试另存本机备份。'+(saveError?'请立即导出保存进度。':'');
    } else saveRun();
  } catch (_) { saveError='存档不可读，可导出或重开'; startupNotice='本地存档暂时无法读取，原记录尚未替换。你可在存档菜单导出备份，或开始新旅途。'; try { memoryBackup=localStorage.getItem(SAVE_KEY); if(memoryBackup) localStorage.setItem(BACKUP_KEY,memoryBackup); } catch (_) {} }
  if(profileIssue&&!startupNotice)startupNotice=profileIssue+'原记录在覆盖前会尝试另存备份，请保留已有导出文件。';
  $('sound-button').classList.toggle('active',sound); $('sound-button').setAttribute('aria-pressed',String(sound));
  render();
  // Browser load events update presentation only; they never advance or save the run.
  let artRefresh=0;
  function refreshArt(){
    if(artRefresh)return;
    artRefresh=root.requestAnimationFrame(()=>{artRefresh=0;render();if(modalOpen&&$('modal-panel').classList.contains('result-panel'))showResult();});
  }
  function artFailed(key){
    if(!Object.hasOwn(A,key)||artErrors.has(key))return;
    artErrors.add(key);artReady.delete(key);$('asset-warning').hidden=false;$('asset-warning').title=[...artErrors].join('、');
    if(key==='rooms')document.documentElement.classList.add('room-art-unavailable');
    if(key==='map')document.documentElement.classList.add('map-art-unavailable');
    for(const img of document.querySelectorAll('img[data-art-key]'))if(img.dataset.artKey===key){
      const frame=img.parentElement;
      if(frame?.classList.contains('painted-card-art')){
        if(key==='cardsExtra'&&!artErrors.has('cards'))frame.outerHTML=atlasArt('cards',2,5,2,'painted-card-art');
        else frame.innerHTML='<span class="art-placeholder">✦</span>';
      }else img.hidden=true;
    }
    if(key==='forest'){
      setArtImage($('scene-image'),'scene');setArtImage($('expedition-backdrop'),'scene');
    }
    refreshArt();
  }
  document.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement)artFailed(e.target.dataset.artKey);},true);
  for(const [key,url] of Object.entries(A)){
    const img=new Image();img.onload=()=>{if(img.naturalWidth&&img.naturalHeight){artReady.add(key);refreshArt();}else artFailed(key);};img.onerror=()=>artFailed(key);img.src=url;
  }
  if(startupNotice) openModal('本地存档提示',`<p class="modal-note">${startupNotice}</p><button class="outline-button" data-save-backup>导出原始备份</button>`);
  else if(['reward','lost','cleared'].includes(run.screen)) showResult();
})(typeof globalThis !== 'undefined' ? globalThis : this);
