(function (root) {
  'use strict';
  const R = root.EmberRules || (typeof require === 'function' ? require('./balance.js') : null);
  const Body = root.EmberBody || (typeof require === 'function' ? require('./body.js').HeroBody : null);
  class Battle {
    constructor({ rng = Math.random, relic = null, relics = [], hero = null, deck = R.deck, encounter = null } = {}) {
      this.rng = rng; this.relic = relic; this.relics = [...relics]; this.encounter = encounter;
      this.hero = hero || new Body({ relic }); this.attackRemainder = 0;
      this.columns = R.gridColumns; this.rows = R.gridRows;
      this.maxCellLayers = R.maxCellLayers;
      this.enemy = { hp: 0, maxHp: 0, block: 0, strength: 0, cells: Array.from({ length: this.columns * this.rows }, (_, i) => this.clampLayers((encounter?.layers || R.enemyLayers)[i])), armor: Array(this.columns * this.rows).fill(false) };
      this.syncEnemy(); this.enemy.maxHp = this.enemy.hp;
      this.energy = this.effects.energy + (encounter ? this.relicBonus('openingEnergy') : 0); this.turn = 1; this.intentIndex = 0; this.status = 'playing'; this.phase = 'player'; this.played = 0;
      this.allCards = deck.map((id, i) => ({ id, uid: `card-${i}` }));
      const opening = encounter ? this.shuffle(this.allCards) : this.allCards;
      const initialDraw=Math.min(9,this.effects.draw+(encounter?this.relicBonus('openingDraw'):0));
      this.hand = opening.slice(0, initialDraw); this.drawPile = encounter ? opening.slice(initialDraw) : this.shuffle(opening.slice(initialDraw)); this.discardPile = []; this.exhaustPile = [];
      if(encounter) this.hero.block += this.relicBonus('openingBlock');
      this.log = [`你举起提灯，${encounter?.name || '石门守卫'}从沉眠中醒来。`];
    }
    shuffle(cards) {
      const a = [...cards];
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    }
    relicBonus(key) { return this.relics.reduce((sum,id)=>sum+(R.relics[id]?.[key]||0),0); }
    get effects() { const e={...this.hero.effects}; e.attack*=1+this.relicBonus('attack')+(this.hero.boostTurns?this.relicBonus('boostAttack'):0);e.block*=1+this.relicBonus('guard');e.energy=Math.min(6,e.energy+this.relicBonus('energy'));e.draw=Math.min(9,e.draw+this.relicBonus('draw'));e.healing+=this.relicBonus('healing');return e; }
    get intent() { const base = (this.encounter?.intents || R.intents)[this.intentIndex], enraged = this.encounter?.kind === 'boss' && this.enemy.hp <= this.enemy.maxHp / 2; return { ...base, name: base.name + (enraged && base.damage ? ' · 狂怒' : ''), damage: base.damage ? base.damage + this.enemy.strength + (enraged ? this.encounter.enrage || 0 : 0) : 0 }; }
    definition(card) {
      const d = { ...R.cards[typeof card === 'string' ? card : card.id] }, effects = this.effects;
      if (d.shape) { d.damage = d.shape.length; d.power = effects.attack * (1+(d.powerBonus||0)); d.pierce = !!d.pierce || this.relic === 'blade' || this.relics.includes('blade'); }
      d.block = Math.max(0, Math.floor(d.block * effects.block + 1e-8));
      if (d.draw) d.draw = Math.max(1, Math.round(d.draw * this.hero.capacities.consciousness));
      d.description = [d.shape ? `${d.shape.length}格${d.shapeName}攻击，当前攻效${Math.round(d.power * 100)}%。` : '',d.pierce?'穿甲。':'', d.block ? `获得${d.block}点格挡。` : '', d.draw ? `抽${d.draw}张牌。` : '', d.energy ? `获得${d.energy}能量。` : '',d.heal?`修复最重的存活伤处约${Math.round(d.heal*this.hero.capacities.metabolism)}点。`:'',d.cleanse?'全部止血。':'',d.exhaust?'消耗。':''].filter(Boolean).join('');
      return d;
    }
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
      for (let i = 0; i < count && this.hand.length < 9; i++) {
        if (!this.drawPile.length && this.discardPile.length) { this.drawPile = this.shuffle(this.discardPile); this.discardPile = []; this.log.push('弃牌重新洗入抽牌堆。'); }
        if (!this.drawPile.length) break;
        this.hand.push(this.drawPile.shift());
      }
    }
    checkResult() {
      if (this.enemy.hp <= 0) { this.status = 'won'; this.phase = 'finished'; this.log.push(`${this.encounter?.name || '石门守卫'}崩解。余烬之后，仍有前路。`); }
      else if (this.hero.failureReason) { this.status = 'lost'; this.phase = 'finished'; this.log.push(`提灯熄灭：${this.hero.failureReason}。`); }
      return this.status;
    }
    play(uid, placement = null) {
      if (this.status !== 'playing' || this.phase !== 'player') return { ok: false, reason: '现在不能出牌。' };
      const index = this.hand.findIndex(c => c.uid === uid);
      if (index < 0) return { ok: false, reason: '这张牌不在手中。' };
      const card = this.hand[index], d = this.definition(card);
      if (d.cost > this.energy) return { ok: false, reason: '能量不足，可以结束回合恢复能量。' };
      let plan = null;
      if (d.shape) {
        if (!placement) return { ok: false, requiresPlacement: true, reason: '请在敌人的生命方格上放置攻击形状。' };
        plan = this.planAttack(card, placement);
        if (!plan.ok) return { ok: false, reason: plan.reason };
      }
      this.energy -= d.cost; this.hand.splice(index, 1); this.played++;
      (d.exhaust ? this.exhaustPile : this.discardPile).push(card);
      const hit = { lost: 0, blocked: 0, cleared: 0 };
      if (plan) {
        for (const c of plan.blocked) { this.enemy.armor[c.index] = false; hit.blocked++; }
        for (const c of plan.hits) { this.enemy.cells[c.index] -= c.lost; this.enemy.armor[c.index] = false; hit.lost += c.lost; if (this.enemy.cells[c.index] === 0) hit.cleared++; }
        this.attackRemainder = plan.nextRemainder;
        this.syncEnemy();
      }
      this.hero.block += d.block; this.energy += d.energy;
      if (d.draw) this.draw(d.draw);
      const recovery=(d.heal||d.cleanse)?this.hero.recover(d.heal||0,!!d.cleanse):null;
      const parts = [plan ? `${d.shapeName}在第${plan.y + 1}行第${plan.x + 1}列 / ${((plan.rotation % 4) + 4) % 4 * 90}°，削去 ${hit.lost} 层生命、击碎 ${hit.cleared} 格${hit.blocked ? `，破甲 ${hit.blocked} 格` : ''}` : '', d.block ? `+${d.block} 格挡` : '', d.draw ? `抽 ${d.draw} 张` : '', d.energy ? '+1 能量 · 消耗' : ''].filter(Boolean);
      if(d.energy) parts[parts.length-1]=`+${d.energy}能量${d.exhaust?' · 消耗':''}`;
      if(recovery) parts.push(`${recovery.part||'身体'}修复${recovery.healed}${d.cleanse?'，全部止血':''}`);
      this.log.push(`第 ${this.turn} 回合 · ${d.name}：${parts.join('，')}。`); this.checkResult();
      return { ok: true, card, definition: d, hit, plan, recovery };
    }
    medical(action, partId) {
      if (this.status !== 'playing' || this.phase !== 'player') return { ok: false, reason: '现在无法医疗。' };
      if (this.energy < 1) return { ok: false, reason: '医疗需要1点能量。' };
      const result = action === 'bandage' ? this.hero.treat(partId,this.relicBonus('healing')) : action === 'boost' ? this.hero.stimulate() : { ok: false, reason: '未知医疗操作。' };
      if (!result.ok) return result;
      this.energy--;
      this.log.push(action === 'bandage' ? `包扎${result.part}：修复 ${result.healed} 部位生命并止血。` : '注射战斗强化剂：能力提高，持续当前及后续共3个玩家回合，不恢复缺失部位。');
      return { ...result, action };
    }
    endTurn() {
      if (this.status !== 'playing' || this.phase !== 'player') return { ok: false };
      this.phase = 'enemy'; this.discardPile.push(...this.hand); this.hand = [];
      this.enemy.armor.fill(false); this.syncEnemy();
      const intent = this.intent;
      const hit = intent.damage ? this.hero.receiveAttack(intent.damage, this.rng) : { lost: 0, blocked: 0, hits: [] };
      if (intent.block) this.grantArmor(intent.block);
      this.enemy.strength += intent.strength;
      this.log.push(`${intent.name}：${intent.damage ? `造成 ${hit.lost} 伤害，格挡吸收 ${hit.blocked}` : `为 ${this.enemy.block} 个生命格覆甲`}${intent.strength ? `，随后力量 +${intent.strength}` : ''}。`);
      for (const wound of hit.hits) this.log.push(`命中${wound.name} −${wound.damage}${wound.destroyed ? ' · 部位毁坏' : ''}${wound.detached.length ? ` · 连带缺失：${wound.detached.join('、')}` : ''}。`);
      if (this.checkResult() === 'lost') return { ok: true, intent, hit };
      const recovery = this.hero.advanceTurn();
      if (recovery.bleeding > 0) this.log.push(`流血 ${recovery.bleeding.toFixed(1)}，恢复血容量 ${recovery.recovered.toFixed(1)}；血容量 ${this.hero.blood.toFixed(1)}%。`);
      if (recovery.expired) this.log.push('强化剂到期，身体能力重新计算。');
      if (this.checkResult() === 'lost') return { ok: true, intent, hit, recovery };
      this.intentIndex = (this.intentIndex + 1) % (this.encounter?.intents || R.intents).length; this.turn++; this.hero.block = 0; this.phase = 'player';
      this.energy = this.effects.energy; this.draw(this.effects.draw);
      return { ok: true, intent, hit, recovery };
    }
  }
  root.EmberBattle = Battle;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Battle, rules: R };
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  const Floor = root.EmberFloor, A = root.EmberArt, SAVE_KEY = 'ember-corridor.save.v1', BACKUP_KEY = SAVE_KEY + '.backup';
  for (const [key, value] of Object.entries({scene:A.scene,map:A.map,hero:A.hero,boss:A.boss,cards:A.cards,rooms:A.rooms,enemies:A.enemies,'cards-extra':A.cardsExtra})) document.documentElement.style.setProperty(`--art-${key}`,`url("${value}")`);
  $('hero-figure').src = A.hero;
  $('scene-image').src=A.scene;
  const artErrors=new Set();
  const escapeHtml = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let run = new Floor(), battle = new Battle({hero:run.hero,deck:run.deck}), busy = false, sound = false, auto = false, context, modalOpen = false;
  let savedAt = null, saveError = '', memoryBackup = null, pendingImport = null, startupNotice = '';
  let selectedUid = null, rotation = 0, anchor = { x: 1, y: 1 }, anchorChosen = false;
  let aim = { x: (battle.columns - 1) / 2, y: (battle.rows - 1) / 2 }, aimSource = 'keyboard', edgeSnapped = false;
  let aimFrame = 0, queuedAim = null, wheelAmount = 0, lastWheelAt = 0, lastWheelTurn = -Infinity;
  let selectedPart = 'torso';
  let toastTimer, impactTimer, battleSerial = 0;
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
  const art = id => {
    const index=['strike','guard','heavy','ember','insight','parry','focus','cross','sweep','wall'].indexOf(id);
    const extra=['hook','zigzag','diagonal','spear','ring','burst','fork','cleave','needle','crescent','bulwark','retreat','channel','renew','suture','clarity','feint','brace','pulse','backstab'].indexOf(id),expanded=index<0&&!artErrors.has('cardsExtra'),i=expanded?extra:index<0?(R.cards[id].shape?2:4):index;
    return `<span class="painted-card-art ${expanded?'expanded-card-art':''}" style="--art-x:${i%5*25}%;--art-y:${expanded?Math.floor(i/5)/3*100:Math.floor(i/5)*100}%"></span>${R.cards[id].shape?`<span class="card-shape-badge">${shapeArt(R.cards[id].shape)}</span>`:''}`;
  };
  function tone(freq = 200, dur = .12, type = 'sine') {
    if (!sound) return;
    try { context ||= new (root.AudioContext || root.webkitAudioContext)(); context.resume(); const o = context.createOscillator(), g = context.createGain(); o.type = type; o.frequency.setValueAtTime(freq, context.currentTime); o.frequency.exponentialRampToValueAtTime(freq * .55, context.currentTime + dur); g.gain.setValueAtTime(.035, context.currentTime); g.gain.exponentialRampToValueAtTime(.001, context.currentTime + dur); o.connect(g).connect(context.destination); o.start(); o.stop(context.currentTime + dur); } catch (_) { sound = false; }
  }
  function toast(text) { $('toast').textContent = text; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2400); }
  function floatText(target, text, kind = '') { const e = document.createElement('span'); e.className = `float-text ${kind}`; e.textContent = text; $(target).appendChild(e); setTimeout(() => e.remove(), 1300); }
  function shake(target, cls = 'hit') { const e = $(target); clearTimeout(shakeTimers.get(e)); e.classList.remove('hit', 'attacking', 'shield-up', 'impact-pulse'); void e.offsetWidth; e.classList.add(cls); shakeTimers.set(e, setTimeout(() => e.classList.remove(cls), 650)); }
  function effectPoint(element) {
    const a = $('arena').getBoundingClientRect(), b = element.getBoundingClientRect();
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
    shake('hero-figure', 'attacking'); shake('enemy-figure'); shake('enemy-grid-panel', 'impact-pulse');
    strikeEffect('hero-figure', 'enemy-figure', !hit.lost);
    for (const cell of plan.cells.filter(c => c.lost > 0 || c.breaksArmor)) {
      const element = $('enemy-grid').children[cell.index], blocked = cell.lost === 0;
      element.classList.add(blocked ? 'cell-cracked' : cell.layers > cell.lost ? 'cell-peeled' : 'cell-shattered');
      const point = effectPoint(element);
      effect(`cell-flash ${blocked ? 'armor-effect' : ''}`, point);
      const shards = !blocked && cell.layers > cell.lost ? 3 : 5;
      for (let i = 0; i < shards; i++) effect(`cell-shard ${blocked ? 'armor-effect' : 'layer-shard'}`, point, { '--layer-color': R.layerColors[cell.layers - 1], '--dx': `${Math.cos(i * Math.PI * .4) * (22 + i * 3)}px`, '--dy': `${Math.sin(i * Math.PI * .4) * 25 - 16}px`, '--spin': `${i * 87 + 45}deg` });
    }
    floatText('enemy-actor', hit.lost ? `−${hit.lost}` : hit.blocked ? `破甲 ${hit.blocked}` : '弱击', hit.lost ? 'damage' : 'block');
    announceImpact(d.name, hit.lost ? `−${hit.lost}` : hit.blocked ? '破甲' : '弱击', `${hit.lost ? `削去 ${hit.lost} 层 · 击碎 ${hit.cleared} 格` : hit.blocked ? '护甲碎裂' : '能力不足，本次未造成伤害'}${hit.blocked ? ` · 破甲 ${hit.blocked} 格` : ''}`, hit.lost ? 'damage' : 'block');
    tone(hit.lost ? 150 : 360, .2, hit.lost ? 'sawtooth' : 'triangle');
  }
  function saveRun(backup = false) {
    const data=run.snapshot({auto,sound}), raw=JSON.stringify(data);
    if(backup) memoryBackup=raw;
    try {
      if(backup) { const previous=localStorage.getItem(SAVE_KEY); if(previous) { memoryBackup=previous; localStorage.setItem(BACKUP_KEY,previous); } }
      localStorage.setItem(SAVE_KEY,raw); savedAt=data.savedAt; saveError='';
    } catch (_) { saveError='自动存档不可用，请导出'; }
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
    battleSerial++; clearPlacement(); busy=false; run=next;
    battle=run.battle || new Battle({hero:run.hero,relics:run.relics,deck:run.deck,rng:()=>0});
    selectedPart=battle.hero.bestTreatment()?.id || 'torso'; aim={x:2.5,y:1.5}; aimSource='keyboard';
    clearTimeout(impactTimer); $('combat-effects').replaceChildren(); $('combat-banner').classList.remove('visible');
  }
  function downloadSave(raw,name) {
    const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
    const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function exportSave() { saveRun(); downloadSave(JSON.stringify(run.snapshot({auto,sound}),null,2),`余烬回廊-第1层-${new Date().toISOString().replace(/[:.]/g,'-')}.json`); }
  function showSaveMenu() {
    if(busy) return;
    let backup=memoryBackup; try { backup=backup || localStorage.getItem(BACKUP_KEY); } catch (_) { /* Export remains available. */ }
    openModal('旅途存档',`<p class="modal-note">每次出牌、回合结算、选择节点和领取奖励后自动保存。再次打开同一个本地网站会继续当前旅途；导出文件可在不同浏览器或电脑间转移。</p><div class="save-summary"><b>第一层 · ${run.visited.length}/${run.stations} 站</b><span>${run.gold} 金币 · ${run.deck.length} 张牌 · 身体 ${run.hero.hp}/${run.hero.maxHp}</span><span>${escapeHtml(saveError || (savedAt?'已保存于 '+new Date(savedAt).toLocaleString():'尚未保存'))}</span></div><div class="save-actions"><button class="gold-button" data-save-export>导出当前存档 ↓</button><button class="outline-button" data-save-import>导入存档 ↑</button>${backup?'<button class="outline-button" data-save-backup>导出替换前备份</button>':''}</div><p class="modal-note">导入会先校验并显示确认；替换前的当前进度会另存一份本机备份。浏览器清理数据或切换本地网址可能使自动存档不再可见，请用导出文件保留进度。</p>`);
  }
  function mapMarkup(interactive=true) {
    const available=new Set(run.available.map(n=>n.id)),seen=new Set(run.visited),expanded=run.routeVersion===2,w=expanded?760:540,h=expanded?1160:710;
    const point=n=>expanded?{x:90+n.lane*145,y:1080-n.row*90}:{x:100+n.lane*170,y:650-n.row*82};
    const edges=run.nodes.flatMap(a=>run.nodes.filter(b=>run.linked(a,b)).map(b=>{
      const p=point(a),q=point(b),traveled=seen.has(a.id)&&(seen.has(b.id)||run.nodeId===b.id);
      return '<path class="route-edge '+(traveled?'traveled':'')+'" d="M'+p.x+' '+p.y+' C'+p.x+' '+(p.y-40)+' '+q.x+' '+(q.y+40)+' '+q.x+' '+q.y+'"/>';
    })).join('');
    return '<div class="route-canvas '+(expanded?'expanded-map':'')+'" style="--map-ratio:'+w+'/'+h+'"><svg viewBox="0 0 '+w+' '+h+'" aria-hidden="true">'+edges+'<text x="'+w/2+'" y="'+(h-20)+'" text-anchor="middle" class="map-start-label">提灯的起点</text></svg>'+run.nodes.map(n=>{
      const p=point(n),type=Floor.types[n.type],enabled=interactive&&available.has(n.id),current=run.nodeId===n.id;
      const detail=['battle','elite','boss'].includes(n.type)?R.enemies[n.variant].name:n.type==='event'?R.events[n.variant].title:type.name;
      return '<button class="route-node type-'+n.type+' '+(seen.has(n.id)?'visited':'')+' '+(available.has(n.id)?'available':'')+' '+(current?'current':'')+'" style="left:'+p.x/w*100+'%;top:'+p.y/h*100+'%" data-node="'+n.id+'" '+(enabled?'':'disabled')+' title="第'+(n.row+1)+'站 · '+detail+(enabled?' · 点击前往':'')+'" aria-label="第'+(n.row+1)+'站 '+detail+(enabled?'，可前往':'')+'"><i>'+nodeIcon(n.type)+'</i><span>'+type.name+'</span>'+(seen.has(n.id)?'<b>✓</b>':'')+'</button>';
    }).join('')+'</div>';
  }
  function nodeAction(action,title,note,disabled=false) { return '<button class="node-choice" data-node-choice="'+action+'" '+(disabled?'disabled':'')+'><b>'+title+'</b><span>'+note+'</span><i>↗</i></button>'; }
  function roomArt(cell) { return '<div class="room-illustration" style="--room-x:'+(cell%3*50)+'%;--room-y:'+Math.floor(cell/3)*100+'%" aria-hidden="true"></div>'; }
  function relicMarkup(id) { const r=R.relics[id];return '<div class="loot-relic"><span>✦</span><div><b>'+r.name+'</b><p>'+r.description+'</p></div></div>'; }
  function showRelics() { if(busy)return;openModal('旅人遗物 · '+run.relics.length+' / '+Object.keys(R.relics).length,'<p class="modal-note">遗物效果在本次旅途中持续生效。精英和Boss胜利时保证掉落一件未拥有的遗物，结算自动领取。</p><div class="relic-collection">'+Object.keys(R.relics).map(id=>'<div class="'+(run.relics.includes(id)?'owned':'unowned')+'">'+relicMarkup(id)+'<small>'+(run.relics.includes(id)?'已拥有':'尚未获得')+'</small></div>').join('')+'</div>'); }
  function renderRoute() {
    $('route-map').innerHTML=mapMarkup();
    const h=run.hero,type=Floor.types[run.node?.type],boss=run.nodes.find(n=>n.type==='boss');
    let content='';
    if(run.screen==='node') {
      const n=run.node,cell={camp:0,shop:1,treasure:2,event:3}[n.type];
      content=roomArt(cell)+'<span class="room-emblem">'+nodeIcon(n.type)+'</span><span class="eyebrow">第 '+(n.row+1)+' / '+run.stations+' 站</span><h2>'+(n.type==='event'?run.event.title:type.name)+'</h2><p>'+(n.type==='event'?run.event.story:type.note)+'</p><div class="node-choices">';
      if(n.type==='camp')content+=nodeAction('rest','靠近营火','存活部位修复40%，止血，血容量+45。')+nodeAction('train','学习「'+R.cards[run.trainingCard].name+'」',R.cards[run.trainingCard].description)+nodeAction('purge','精简直击','移除一张直击，牌组至少保留5张。',!!run.canEffect({remove:'strike'}));
      if(n.type==='event')content+=run.event.choices.map(c=>nodeAction(c.id,c.label+(c.cost?' · ¤ '+c.cost:''),c.text,!!run.canEffect(c.effects,c.cost))).join('');
      if(n.type==='treasure')content+=run.roomRelics.map(id=>nodeAction('relic:'+id,R.relics[id].name,R.relics[id].description)).join('')+nodeAction('gold','带走钱币','获得55金币。');
      if(n.type==='shop') {
        content+=run.shop.map(item=>{const sold=run.bought.includes(item.id),owned=item.relic&&run.relics.includes(item.relic),reason=run.canEffect({remove:item.remove},item.cost);return '<button class="node-choice shop-item" data-buy="'+item.id+'" '+(sold||owned||reason?'disabled':'')+'><b>'+item.name+' <em>¤ '+item.cost+'</em></b><span>'+(sold?'已售出':owned?'已经拥有':item.description)+'</span></button>';}).join('');
        content+=nodeAction('leave','离开商店','保留剩余金币，继续选择路线。');
      }
      content+='</div>';
    } else content='<div class="journey-illustration" aria-hidden="true"></div><span class="eyebrow">选择你的道路</span><h2>'+(run.visited.length?'余火仍在前方':'踏入回廊')+'</h2><p>沿连线选择下一站。'+(run.routeVersion===1?'当前保留旧存档路线，新旅途将启用十二站四十七节点。':'五条纵向道路，在岔口交汇；每次旅途的节点、敌人与事件都会变化。')+'</p><div class="journey-meter"><b>'+run.visited.length+'<small> / '+run.stations+' 站</small></b><span>终点 · '+R.enemies[boss.variant].name+'</span></div><p class="node-tip">普通战斗赚取卡牌，精英与Boss掉落遗物。营火、事件和商店可以修复伤势。</p>';
    $('node-panel').innerHTML=content+'<div class="journey-health"><span>旅人身体 <b>'+h.hp+'/'+h.maxHp+'</b></span><span>血容量 <b>'+Math.round(h.blood)+'%</b> · 意识 <b>'+Math.round(h.capacities.consciousness*100)+'%</b></span><button class="outline-button" data-open-health>身体与无限包扎 ↗</button></div><div class="journey-relics"><button class="outline-button" data-open-relics>✦ 遗物 '+run.relics.length+' / 16</button></div>';
    $('map-legend').innerHTML=Object.entries(Floor.types).map(([id,t])=>'<span><b>'+nodeIcon(id)+'</b>'+t.name+'</span>').join('');
  }

  function renderRun() {
    const inCombat=['battle','reward','lost','cleared'].includes(run.screen);
    document.querySelector('.game-shell').classList.toggle('map-mode',!inCombat);
    $('arena').hidden=!inCombat; document.querySelector('.hand-zone').hidden=!inCombat; $('expedition-view').hidden=inCombat;
    $('run-progress').textContent=`${run.visited.length} / ${run.stations}`;
    $('run-gold').textContent=run.gold; $('route-button').textContent=['reward','lost','cleared'].includes(run.screen)?'查看结算':'路线';
    $('deck-button').innerHTML=`${icon('cards')} <span>牌组</span> <b>${run.deck.length}</b>`;
    $('footer-status').textContent=run.node?`第 ${run.node.row+1} 站 · ${Floor.types[run.node.type].name}`:`第一层 · ${run.stations}站 / ${run.nodes.length}节点`;
    const e=battle.encounter;
    $('encounter-name').textContent=e?.name || '残火之径'; $('enemy-name').textContent=e?.name || '石门守卫'; $('enemy-role').textContent=e?.role || '';
    $('encounter-eyebrow').textContent=`第一层 · 第 ${(run.node?.row || 0)+1} / ${run.stations} 站${e?.kind==='boss'?' · BOSS':e?.kind==='elite'?' · 精英':''}`;
    $('encounter-note').textContent=e?.kind==='boss'?`半血后攻击额外+${e.enrage||0} · 胜利掉落遗物`:'鼠标居中放置 · 点击即攻击';
    $('arena').classList.toggle('boss-encounter',e?.kind==='boss'); $('arena').classList.toggle('elite-encounter',e?.kind==='elite');
    const sprite=e?.sprite??'sentinel',atlas=typeof sprite==='number'&&!artErrors.has('enemies'),fallback=typeof sprite==='string'?A[sprite]:(e?.kind==='boss'?A.boss:e?.kind==='elite'?A.elite:A.sentinel);
    if($('enemy-fallback').getAttribute('src')!==fallback) $('enemy-fallback').src=fallback;
    $('enemy-fallback').style.visibility=atlas?'hidden':'visible';$('enemy-atlas-sprite').hidden=!atlas;
    if(atlas){$('enemy-atlas-sprite').style.setProperty('--enemy-x',`${sprite%4/3*100}%`);$('enemy-atlas-sprite').style.setProperty('--enemy-y',`${Math.floor(sprite/4)*100}%`);}
    const cell=e?.sceneCell;$('scene-room').hidden=cell==null||artErrors.has('rooms');
    if(cell!=null){$('scene-room').style.setProperty('--room-x',`${cell%3*50}%`);$('scene-room').style.setProperty('--room-y',`${Math.floor(cell/3)*100}%`);}
    $('arena').setAttribute('aria-label',`${e?.name || '回廊'}战斗场景`); $('enemy-actor').setAttribute('aria-label',e?.name || '敌人'); $('enemy-grid-panel').setAttribute('aria-label',`${e?.name || '敌人'}的生命方格`);
    $('enemy-grid-panel').querySelector('h2').textContent='生命方格';
    $('enemy-health').setAttribute('aria-label','敌人剩余总生命');
    $('sound-button').classList.toggle('active',sound); $('sound-button').setAttribute('aria-pressed',String(sound));
    $('relic-badge').hidden=!run.relics.length; $('relic-badge').textContent=`✦ ${run.relics.length} 件遗物 · 点击查看`;
    $('relic-badge').title=run.relics.map(id=>R.relics[id].name+'：'+R.relics[id].description).join('\n');
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
    if(run.screen==='battle') openModal('第一层 · 当前路线',`<p class="modal-note">完成当前战斗后，才能前往下一个节点。</p><div class="route-preview">${mapMarkup(false)}</div>`,'map-modal');
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
    $('placement-status').textContent = !pending ? auto ? '自动选择落点和旋转，按当前能力计算实际伤害。' : '图案中心跟随鼠标 · R/滚轮旋转 · 右键取消。' : !plan.ok ? plan.reason : `削 ${plan.damage} 层 · 碎 ${plan.cleared} 格${plan.blocked.length ? ` · 破甲 ${plan.blocked.length} 格` : ''} · 攻效 ${Math.round(battle.effects.attack * 100)}%${edgeSnapped ? ' · 边缘吸附' : ''}`;
    $('auto-button').setAttribute('aria-pressed', String(auto)); $('auto-button').classList.toggle('active', auto);
    $('auto-button').disabled = busy || battle.status !== 'playing';
    $('auto-state').textContent = auto ? '开' : '关';
    $('hand-shortcuts').textContent = auto ? 'AUTO · 点牌直接攻击  /  A 切换' : '选牌 1–9 · 鼠标居中 · R/滚轮旋转';
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
    $('body-vitals').innerHTML = `<div><span>血容量</span><b class="${h.blood < 65 ? 'text-danger' : ''}">${h.blood.toFixed(0)}%</b></div><div><span>疼痛</span><b>${Math.round(h.pain * 100)}%</b></div><div><span>每回合流血</span><b class="${h.bleeding ? 'text-danger' : ''}">${h.bleeding.toFixed(1)}</b></div><p>${h.lastHits.length ? h.lastHits.map(hit => `${hit.name} −${hit.damage}${hit.destroyed ? ' 毁坏' : ''}`).join(' / ') : '尚未受伤。点击部位查看详情。'}</p>`;
    $('capacity-effects').innerHTML = `<span>攻击 <b>${Math.round(effects.attack * 100)}%</b></span><span>格挡 <b>${Math.round(effects.block * 100)}%</b></span><span>受击 <b>×${effects.incoming.toFixed(2)}</b></span><span>下回合 <b>${effects.energy}能量 / ${effects.draw}牌</b></span>`;
    $('treatment-part').innerHTML = h.parts.map(part => `<option value="${part.id}" ${selectedPart === part.id ? 'selected' : ''}>${part.name} · ${part.missing ? '缺失' : `${part.hp}/${part.maxHp}`}${part.bleed ? ' · 流血' : ''}</option>`).join('');
    $('part-description').textContent = `${p.name}：${p.affects}${p.detachedBy ? ` · 因${h.part(p.detachedBy).name}毁坏而缺失` : ''}`;
    $('bandage-button').textContent = '包扎 ∞ · 1能量';
    $('bandage-button').disabled = busy || modalOpen || battle.status !== 'playing' || battle.energy < 1 || !h.canTreat(p.id);
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
    openModal('旅人 · 身体与机能', `<p class="modal-note">每个部位独立承伤。父部位毁坏会连带失去子部位；要害失效、意识低于30%、行动不高于15%或血容量耗尽，单人战斗即失败。下列命中率是每段伤害在当前存活部位中的权重，属于本游戏改编规则。</p><div class="capacity-grid health-capacities">${capacityCards()}</div><div class="health-part-list">${h.parts.map(p => `<button data-body-part="${p.id}" class="health-part-row ${p.missing ? 'missing' : p.hp < p.maxHp ? 'injured' : ''} ${selectedPart === p.id ? 'selected' : ''}"><span>${p.internal ? '◇ ' : ''}${p.name}${p.vital ? ' <small>要害</small>' : ''}</span><b>${p.missing ? '缺失' : `${p.hp} / ${p.maxHp}`}</b><small>${p.affects}<br>${p.missing ? p.detachedBy ? `随${h.part(p.detachedBy).name}缺失` : '毁坏；残端可止血，不能再生' : `命中权重 ${(p.weight / sumWeights * 100).toFixed(1)}% · 流血 ${p.bleed.toFixed(1)}/回合`}</small></button>`).join('')}</div><p class="modal-note">已选 ${h.part(selectedPart).name} · 包扎修复最多${battle.effects.healing}点并止血（次数无限）；强化提高机能、持续3个玩家回合（默认每场1次，遗物可增加）。两者均消耗1能量，缺失部位不会再生。</p><div class="health-modal-actions"><button class="gold-button" data-medical="bandage" ${battle.energy < 1 || !h.canTreat(selectedPart) || battle.status !== 'playing' ? 'disabled' : ''}>包扎所选部位 · 无限次</button><button class="gold-button" data-medical="boost" ${battle.energy < 1 || !h.stimulants || battle.status !== 'playing' ? 'disabled' : ''}>战斗强化剂 · 剩${h.stimulants}次</button></div>`, 'health-modal');
    $('modal-body').insertAdjacentHTML('afterbegin',`<div class="health-anatomy">${bodyDiagram()}</div>`);
    if (run.screen !== 'battle') $('modal-body').querySelectorAll('[data-medical]').forEach(b=>b.disabled=true);
    if (['reward','lost','cleared'].includes(run.screen)) $('modal-body').insertAdjacentHTML('beforeend', '<button class="gold-button result-restart" data-open-result>返回战斗结算</button>');
    renderHealth();
  }
  function render() {
    $('turn').textContent = String(battle.turn).padStart(2, '0'); $('energy').textContent = battle.energy;
    $('energy-orb').classList.toggle('empty', battle.energy === 0);
    $('energy-max').textContent = `/ ${battle.effects.energy}`; $('energy-orb').title = `当前能量 ${battle.energy}，按当前能力与遗物下回合恢复 ${battle.effects.energy}`;
    $('hero-hp').textContent = `${battle.hero.hp} / ${battle.hero.maxHp}`; $('hero-hp-fill').style.width = `${battle.hero.hp / battle.hero.maxHp * 100}%`;
    $('enemy-hp').textContent = `${battle.enemy.hp} / ${battle.enemy.maxHp}`;
    $('hero-health').setAttribute('aria-valuenow', battle.hero.hp); $('hero-health').setAttribute('aria-valuemax', battle.hero.maxHp);
    $('enemy-health').setAttribute('aria-valuenow', battle.enemy.hp);
    $('enemy-health').setAttribute('aria-valuemax', battle.enemy.maxHp);
    $('hero-status').innerHTML = battle.hero.block ? `<span class="status shield" title="下次你的回合开始时清空">${icon('shield')} ${battle.hero.block} 格挡</span>` : `<span class="subtle-status">${battle.hero.failureReason || `血容量 ${battle.hero.blood.toFixed(0)}%`}</span>`;
    $('enemy-status').innerHTML = (battle.enemy.block ? `<span class="status shield" title="护甲吸收1点冲击；穿甲忽略护甲">${icon('shield')} ${battle.enemy.block} 格护甲</span>` : '') + (battle.enemy.strength ? `<span class="status strength" title="攻击伤害永久增加">${icon('sword')} +${battle.enemy.strength}</span>` : '');
    const intent = battle.intent;
    $('intent-value').innerHTML = `${icon(intent.type === 'attack' ? 'sword' : 'shield')} <b>${intent.damage || intent.block}</b>${intent.strength ? `<small>随后 +${intent.strength} 力量</small>` : ''}`;
    $('intent-label').textContent = intent.name;
    $('enemy-intent').classList.toggle('defensive', intent.type === 'defend');
    $('enemy-intent').title = intent.damage ? `攻击 ${intent.damage}，按当前受击倍率约 ${Math.round(intent.damage * battle.hero.effects.incoming)} 点；先格挡，再按部位权重分配最多3段${intent.strength ? `，随后力量+${intent.strength}` : ''}` : `为${intent.block}个生命格覆甲，护甲在下一次敌方行动前清空`;
    $('draw-count').textContent = battle.drawPile.length; $('discard-count').textContent = battle.discardPile.length;
    $('hand-count').textContent = battle.hand.length; $('exhaust-count').textContent = battle.exhaustPile.length ? `已消耗 ${battle.exhaustPile.length}` : '';
    $('phase-label').textContent = busy ? '敌方行动' : battle.status === 'playing' ? '你的回合' : '战斗结束'; $('end-turn').disabled = busy || run.screen !== 'battle' || battle.status !== 'playing';
    $('hand').style.setProperty('--cards', battle.hand.length);
    $('hand').innerHTML = battle.hand.map((card, i) => {
      const d = battle.definition(card), affordable = d.cost <= battle.energy;
      const desc = (d.shape ? `<span><b>${d.shape.length}</b> 格${d.shapeName} · 攻效${Math.round(d.power * 100)}%</span><small>${auto ? '自动落点' : '点格即出'}</small>` : '') + (R.cards[card.id].block ? `<span>格挡 <b>${d.block}</b></span>` : '') + (d.pierce ? '<small>穿甲</small>' : '') + (d.draw ? `<span>抽 <b>${d.draw}</b> 张牌</span>` : '') + (d.energy ? `<span>能量 <b>+${d.energy}</b></span>` : '') + (d.heal?`<span>修复伤处 <b>${Math.round(d.heal*battle.hero.capacities.metabolism)}</b></span>`:'')+(d.cleanse?'<small>全部止血</small>':'')+(d.exhaust?'<small>消耗</small>':'');
      return `<button class="card card-${card.id} ${!affordable ? 'unaffordable' : ''}" style="--r:${(i - (battle.hand.length - 1) / 2) * 2.5}deg;--i:${i}" data-uid="${card.uid}" ${busy ? 'disabled' : ''} aria-label="${i + 1}号牌 ${d.name}，消耗${d.cost}能量，${d.description}" title="${affordable ? d.shape ? auto ? '点击自动攻击' : '选中后点击格子立即攻击' : '点击打出' : '能量不足'}"><span class="card-cost">${d.cost}</span><span class="card-heading">${d.name}</span><span class="card-art">${art(card.id)}</span><span class="card-type">${d.type === 'attack' ? '形 状 攻 击' : '技 能'}</span><span class="card-description">${desc}</span><span class="card-key">${i + 1}</span><span class="card-corner">✦</span></button>`;
    }).join('');
    $('arena').classList.toggle('victory', battle.status === 'won'); $('enemy-figure').classList.toggle('defeated', battle.status === 'won');
    renderGrid(); renderHealth(); renderRun();
  }
  function play(uid) {
    if (busy || modalOpen || run.screen !== 'battle') return;
    const card = battle.hand.find(c => c.uid === uid); if (!card || battle.status !== 'playing') return;
    const d = battle.definition(card);
    if (d.cost > battle.energy) { toast('能量不足，可以结束回合恢复能量。'); return; }
    if (d.shape) {
      if (auto) {
        const placement = battle.autoPlacement(card);
        if (!placement) { toast('没有可命中的位置，未消耗卡牌或能量。'); return; }
        resolvePlay(uid, placement); return;
      }
      if (selectedUid === uid) { cancelAttack(); return; }
      flushPointerAim(); selectedUid = uid; rotation = 0; anchorChosen = false; wheelAmount = 0; lastWheelAt = 0; lastWheelTurn = -Infinity; aimAt(aim.x, aim.y, true); render(); tone(300, .08);
      toast(`${d.name}已选中 · 图案中心跟随鼠标，点击攻击，滚轮旋转`); return;
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
    if (battle.status === 'won') { const serial = battleSerial; setTimeout(() => { if (serial === battleSerial) showResult(); }, 1000); }
  }
  function confirmAttack() { const card = selectedCard(); if (!card || busy || modalOpen || !anchorChosen) return; const plan = battle.planAttack(card, { ...anchor, rotation }); if (!plan.ok) { toast(plan.reason); return; } resolvePlay(card.uid, { ...anchor, rotation }); }
  function endTurn() {
    if (busy || modalOpen || run.screen !== 'battle' || battle.status !== 'playing') return;
    clearPlacement(); const serial = battleSerial, intent=battle.intent;
    // Resolve and save atomically before playing feedback; reloading cannot skip this enemy turn.
    const result=battle.endTurn(); commitAction();
    busy = true; $('first-hint').classList.add('dismissed'); render();
    if (intent.damage) shake('enemy-figure', 'attacking');
    toast(`${intent.name} · ${intent.damage ? `${intent.damage}点攻击来袭` : '敌人正在覆甲'}`);
    setTimeout(() => {
      if (serial !== battleSerial) return;
      if (result.hit.hits.length) selectedPart = battle.hero.bestTreatment()?.id || result.hit.hits[0].id;
      busy = false; render();
      if (result.intent.damage) {
        strikeEffect('enemy-figure', 'hero-figure', !result.hit.lost);
        if (result.hit.lost) { shake('hero-figure'); shake('hero-health', 'impact-pulse'); floatText('hero-actor', `−${result.hit.lost}`, 'damage'); tone(75, .28, 'sawtooth'); }
        else { shake('hero-figure', 'shield-up'); floatText('hero-actor', `格挡 ${result.hit.blocked}`, 'block'); tone(360, .2); }
        announceImpact(result.intent.name, result.hit.lost ? `−${result.hit.lost}` : '格挡', `${result.hit.hits.length ? result.hit.hits.map(wound => `${wound.name} −${wound.damage}${wound.destroyed ? ' 毁坏' : ''}`).join(' / ') : '伤害已被格挡'}${result.hit.blocked ? ` · 格挡 ${result.hit.blocked}` : ''}`, result.hit.lost ? 'hero-damage' : 'block');
        $('body-diagram').querySelectorAll('[data-body-part]').forEach(e => { if (result.hit.hits.some(wound => wound.id === e.dataset.bodyPart)) e.classList.add('just-hit'); });
        if (result.hit.blocked && result.hit.lost) floatText('hero-actor', `格挡 ${result.hit.blocked}`, 'block secondary');
      } else {
        shake('enemy-grid-panel', 'shield-up'); announceImpact(result.intent.name, `+${battle.enemy.block}`, '生命格覆甲', 'block'); tone(360, .2);
      }
      if (battle.status !== 'playing') setTimeout(() => { if (serial === battleSerial) showResult(); }, 1000); else toast(`第 ${battle.turn} 回合 · ${battle.energy} 能量 / 抽牌 ${battle.effects.draw} · ${battle.hero.bleeding ? '正在流血，可选择部位包扎' : '留意身体机能'}`);
    }, 650);
  }
  function openModal(title, content, className = '') { modalOpen = true; $('modal-title').textContent = title; $('modal-body').innerHTML = content; $('modal-panel').className = `modal-panel ${className}`; $('modal').hidden = false; $('modal-close').focus(); }
  function closeModal() { modalOpen = false; $('modal').hidden = true; (run.screen==='battle'?$('end-turn'):$('route-button')).focus(); renderHealth(); }
  function restart() { saveRun(true); adoptRun(new Floor()); saveRun(); closeModal(); render(); }
  function showPile(pile) {
    const names = { draw: '抽牌堆', discard: '弃牌堆', deck: '初始牌组', exhaust: '消耗区' };
    const cards = pile === 'draw' ? battle.drawPile : pile === 'discard' ? battle.discardPile : pile === 'exhaust' ? battle.exhaustPile : battle.allCards;
    const counts = {}; cards.forEach(c => counts[c.id] = (counts[c.id] || 0) + 1);
    openModal(`${names[pile]} · ${cards.length} 张`, `<p class="modal-note">${pile === 'draw' ? '以下按类型展示，不代表抽取顺序。抽牌堆耗尽时，弃牌会重新洗入。' : pile === 'discard' ? '打出的牌和回合结束时的手牌会进入这里。' : pile === 'exhaust' ? '消耗的牌在本局战斗中不会再被抽到。' : '这一层的完整牌组。战斗奖励、商店和营火可加入新牌，下一场战斗会重新洗牌。'}</p><div class="pile-list">${Object.entries(counts).map(([id, count]) => { const d = battle.definition(id); return `<div class="pile-item"><span class="mini-art ${id}">${art(id)}</span><div><strong>${d.name} <small>×${count}</small></strong><p>${d.description}</p></div><span class="mini-cost">${d.cost}</span></div>`; }).join('') || '<p class="empty-pile">这里暂时没有牌。</p>'}</div>`);
  }
  function showHelp() {
    openModal('提灯旅人的旅途手册','<div class="help-grid"><div>'+icon('star')+'<h3>十二站与交汇路线</h3><p>新旅途有47个节点、五条道路和交汇岔口。沿连接向上选择，最后挑战三种首领之一。旧存档保留八站路线，新开旅途进入扩展地图。</p></div><div>'+icon('sword')+'<h3>三十张卡牌</h3><p>包含钩形、折线、斜线、环形、九宫等攻击，以及格挡、抽牌、能量、治疗和止血。选牌后以鼠标居中放置，点格即出；R/滚轮旋转，右键取消。AUTO点牌自动攻击。</p></div><div>'+icon('shield')+'<h3>无限包扎与身体</h3><p>包扎没有次数上限，每次仍花1能量，修复一个存活部位并止血，缺失部位不能再生。强化剂每场1次，炼金试管增加至2次。能力与遗物都影响实际效果。</p></div><div>'+icon('flame')+'<h3>遗物与第一层难度</h3><p>普通敌人10–18生命、精英22–28、Boss34–42。精英和Boss获胜时自动获得一件未拥有的遗物，并保存结算。16种遗物可影响攻击、格挡、能量、抽牌、恢复、金币和商店价格。</p></div></div><p class="modal-note">每次完整动作后自动保存，导入支持v1/v2并保留替换前备份。旧存档当前敌人按剩余比例降低生命；继续旧路线即可使用新卡牌、无限包扎和遗物规则。新地图的敌人、事件、商店与首领随种子变化。</p><div class="shortcut-line"><kbd>1</kbd>–<kbd>9</kbd> 出牌 · <kbd>R</kbd> 旋转 · <kbd>A</kbd> AUTO · <kbd>E</kbd> 结束回合</div>');
  }
  function showResult() {
    if(!['reward','lost','cleared'].includes(run.screen))return;
    const cleared=run.screen==='cleared',won=run.screen==='reward'||cleared,loot=run.lastLoot;
    const cards=run.offers.map(id=>{const d=R.cards[id];return '<button class="reward-card" data-card-reward="'+id+'"><span class="mini-art">'+art(id)+'</span><b>'+d.name+' <small>'+d.cost+'能量</small></b><span>'+d.description+'</span></button>';}).join('');
    const drops=loot?.relics.length?'<div class="loot-section"><p>已自动获得遗物</p>'+loot.relics.map(relicMarkup).join('')+'</div>':'';
    const story=cleared?escapeHtml(battle.encounter.name)+'已被击败。<br>你走过了残火之径。':won?escapeHtml(battle.encounter.name)+'已被击败。<br>'+(loot?.gold?'获得 '+loot.gold+' 金币。':'金币奖励已入账。')+'选择一张卡牌，或跳过。':escapeHtml(run.hero.failureReason)+'。<br>这次旅途结束，存档仍可导出留存。';
    openModal(cleared?'第一层 · 首领已败':won?'战利品':'提灯熄灭','<div class="result-emblem">'+icon(won?'flame':'shield')+'</div><p class="result-eyebrow">'+(cleared?'FLOOR I CLEARED':won?'ENCOUNTER CLEARED':'THE EMBERS WILL RETURN')+'</p><p class="result-story">'+story+'</p>'+drops+(loot?.fallbackGold?'<p class="modal-note">已拥有全部遗物，重复掉落转为45金币。</p>':'')+'<div class="result-stats"><div><b>'+(run.visited.length+(won&&!cleared?1:0))+'</b><span>完成节点</span></div><div><b>'+run.gold+'</b><span>金币</span></div><div><b>'+run.deck.length+'</b><span>牌组</span></div></div><button class="result-health-link" data-open-health>查看身体与无限包扎 ↗</button>'+(run.screen==='reward'?'<div class="card-rewards">'+cards+'</div><button class="outline-button" data-card-reward="skip">跳过卡牌，继续路线 →</button>':'<button class="gold-button" data-new-run>重新点亮提灯</button><button class="outline-button" data-save-export>导出这次旅途</button>')+'<p class="result-footnote">奖励已结算 · 自动存档状态见顶部</p>','result-panel');
  }

  document.addEventListener('click', e => {
    const bodyPart = e.target.closest('[data-body-part]'); if (bodyPart) selectBodyPart(bodyPart.dataset.bodyPart);
    const medical = e.target.closest('[data-medical]'); if (medical) useMedical(medical.dataset.medical);
    if (e.target.closest('[data-open-health]')) showHealth();
    if (e.target.closest('[data-open-result]')) showResult();
    if (e.target.closest('[data-open-relics]')) showRelics();
    const card = e.target.closest('[data-uid]'); if (card) play(card.dataset.uid);
    const node=e.target.closest('[data-node]'); if(node && !node.disabled) routeAction(node.dataset.node);
    const choice=e.target.closest('[data-node-choice]'); if(choice && !choice.disabled && !modalOpen) { const result=run.choose(choice.dataset.nodeChoice); if(result.ok) afterNodeAction(); else if(result.reason)toast(result.reason); }
    const buy=e.target.closest('[data-buy]'); if(buy && !buy.disabled && !modalOpen) { const result=run.buy(buy.dataset.buy); if(result.ok) { adoptRun(run); saveRun(); render(); } else if(result.reason)toast(result.reason); }
    const cardReward=e.target.closest('[data-card-reward]'); if(cardReward && run.chooseCard(cardReward.dataset.cardReward)) afterNodeAction();
    if(e.target.closest('[data-save-export]')) exportSave();
    if(e.target.closest('[data-save-import]')) { $('save-file').value=''; $('save-file').click(); }
    if(e.target.closest('[data-save-backup]')) { let raw=memoryBackup; try { raw=raw||localStorage.getItem(BACKUP_KEY); } catch (_) {} if(raw) downloadSave(raw,'余烬回廊-替换前备份.json'); }
    if(e.target.closest('[data-confirm-import]') && pendingImport) { saveRun(true); const imported=pendingImport; pendingImport=null; adoptRun(imported.run); auto=imported.options.auto; sound=imported.options.sound; saveRun(); closeModal(); render(); if(['reward','lost','cleared'].includes(run.screen)) showResult(); }
    if(e.target.closest('[data-new-run]')) openModal('开始新的旅途？','<p class="modal-note">当前旅途将被替换。替换前进度会保存为本机备份，也可先导出文件。</p><div class="save-actions"><button class="outline-button" data-save-export>先导出当前存档</button><button class="gold-button" id="confirm-restart">开始新旅途</button></div>');
  });
  $('end-turn').addEventListener('click', endTurn); $('help-button').addEventListener('click', showHelp);
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
  $('restart-button').addEventListener('click', () => { if(!busy) openModal('开始新的旅途？', '<p class="modal-note">当前这一层的进度将被替换，替换前会保存一份本机备份。</p><div class="save-actions"><button class="outline-button" data-save-export>先导出存档</button><button class="gold-button" id="confirm-restart">开始新旅途</button></div>'); });
  $('modal-body').addEventListener('click', e => { if (e.target.closest('#confirm-restart')) restart(); });
  $('sound-button').addEventListener('click', () => { sound = !sound; saveRun(); $('sound-button').classList.toggle('active', sound); $('sound-button').setAttribute('aria-pressed', String(sound)); $('sound-button').title = sound ? '关闭音效' : '开启音效'; toast(sound ? '音效已开启' : '音效已关闭'); if (sound) tone(500); });
  $('route-button').addEventListener('click',showRoute); $('save-button').addEventListener('click',showSaveMenu);
  $('relic-badge').addEventListener('click',showRelics);
  $('asset-warning').addEventListener('click',()=>openModal('图片资源未完整加载','<p class="modal-note">以下本地图片加载失败：'+[...artErrors].map(escapeHtml).join('、')+'。已尽量保留基础场景和角色作为回退。</p><p class="modal-note">可以刷新页面，或直接打开项目中的独立离线HTML；使用dist版本时，请保持assets目录完整。</p>'));
  $('save-file').addEventListener('change',async e=>{
    const file=e.target.files[0]; if(!file) return;
    try {
      if(file.size>131072) throw new Error('存档文件过大，请选择本游戏导出的 JSON 文件。');
      const raw=await file.text(); let data;
      try { data=JSON.parse(raw); } catch (_) { throw new Error('文件不是有效的 JSON 存档。'); }
      pendingImport=Floor.restore(data,Battle);
      const imported=pendingImport.run;
      openModal('确认导入这次旅途？',`<p class="modal-note">文件：${escapeHtml(file.name)}</p><div class="save-summary"><b>第一层 · ${imported.visited.length}/${imported.stations} 站</b><span>${imported.gold} 金币 · ${imported.deck.length} 张牌</span><span>身体 ${imported.hero.hp}/${imported.hero.maxHp} · ${imported.screen==='cleared'?'已通关':imported.screen==='lost'?'旅途结束':'旅途中'}</span></div><p class="modal-note">导入将替换当前进度，并保留替换前的本机备份。</p><button class="gold-button" data-confirm-import>确认导入</button>`);
    } catch(error) { pendingImport=null; openModal('未导入存档',`<p class="modal-note">${escapeHtml(error instanceof SyntaxError?'文件不是有效的存档。':error.message)}</p><p class="modal-note">当前旅途没有改变。</p>`); }
  });
  $('modal-close').addEventListener('click', closeModal); $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Tab') aimSource = 'keyboard';
    if (!modalOpen && e.target.closest('[data-body-part]') && ['Enter', ' '].includes(e.key)) { e.preventDefault(); selectBodyPart(e.target.closest('[data-body-part]').dataset.bodyPart); return; }
    if (e.key === 'Escape' && modalOpen) { closeModal(); return; }
    if (modalOpen) { if (e.key === 'Tab') { const list = [...$('modal').querySelectorAll('button:not([disabled])')]; if (e.shiftKey && document.activeElement === list[0]) { e.preventDefault(); list.at(-1).focus(); } else if (!e.shiftKey && document.activeElement === list.at(-1)) { e.preventDefault(); list[0].focus(); } } return; }
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
  root.emberGame = { get run() { return run; }, get battle() { return battle; }, get auto() { return auto; }, restart, play, endTurn, showResult, showHealth, useMedical, confirmAttack, rotateAttack, cancelAttack, toggleAuto, exportSave };
  try {
    const raw=localStorage.getItem(SAVE_KEY);
    if(raw) {
      if(raw.length>131072) throw new Error('已有存档过大');
      const data=JSON.parse(raw),restored=Floor.restore(data,Battle);
      adoptRun(restored.run); auto=restored.options.auto; sound=restored.options.sound; savedAt=typeof data.savedAt==='string'&&!isNaN(Date.parse(data.savedAt))?data.savedAt:null;
      if(restored.migrated)saveRun(true);
    } else saveRun();
  } catch (_) { saveError='存档不可读，可导出或重开'; startupNotice='本地存档暂时无法读取，原记录尚未替换。你可在存档菜单导出备份，或开始新旅途。'; try { memoryBackup=localStorage.getItem(SAVE_KEY); if(memoryBackup) localStorage.setItem(BACKUP_KEY,memoryBackup); } catch (_) {} }
  $('sound-button').classList.toggle('active',sound); $('sound-button').setAttribute('aria-pressed',String(sound));
  render();
  // Asset loading is part of the player's page; failures retain available local artwork.
  for(const [key,url] of Object.entries(A)){
    const img=new Image();img.onerror=()=>{artErrors.add(key);$('asset-warning').hidden=false;$('asset-warning').title=[...artErrors].join('、');if(key==='rooms')document.documentElement.classList.add('room-art-unavailable');render();};img.src=url;
  }
  if(startupNotice) openModal('本地存档提示',`<p class="modal-note">${startupNotice}</p><button class="outline-button" data-save-backup>导出原始备份</button>`);
  else if(['reward','lost','cleared'].includes(run.screen)) showResult();
})(typeof globalThis !== 'undefined' ? globalThis : this);
