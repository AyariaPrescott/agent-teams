(function (root) {
  'use strict';
  const R = root.EmberRules || (typeof require === 'function' ? require('./balance.js') : null);
  class Battle {
    constructor({ rng = Math.random, relic = null } = {}) {
      this.rng = rng; this.relic = relic;
      this.hero = { hp: R.heroHp + (relic === 'heart' ? 10 : 0), maxHp: R.heroHp + (relic === 'heart' ? 10 : 0), block: 0 };
      this.columns = R.gridColumns; this.rows = R.gridRows;
      this.maxCellLayers = R.maxCellLayers;
      this.enemy = { hp: 0, maxHp: 0, block: 0, strength: 0, cells: Array.from({ length: this.columns * this.rows }, (_, i) => this.clampLayers(R.enemyLayers[i])), armor: Array(this.columns * this.rows).fill(false) };
      this.syncEnemy(); this.enemy.maxHp = this.enemy.hp;
      this.energy = 3; this.turn = 1; this.intentIndex = 0; this.status = 'playing'; this.phase = 'player'; this.played = 0;
      this.allCards = R.deck.map((id, i) => ({ id, uid: `card-${i}` }));
      this.hand = this.allCards.slice(0, 5); this.drawPile = this.shuffle(this.allCards.slice(5)); this.discardPile = []; this.exhaustPile = [];
      this.log = ['你举起提灯，石门守卫从沉眠中醒来。'];
    }
    shuffle(cards) {
      const a = [...cards];
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    }
    get intent() { const base = R.intents[this.intentIndex]; return { ...base, damage: base.damage ? base.damage + this.enemy.strength : 0 }; }
    definition(card) { const d = { ...R.cards[typeof card === 'string' ? card : card.id] }; if (d.shape) { d.damage = d.shape.length; d.pierce = this.relic === 'blade'; } return d; }
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
      if (!shape.length || !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(rotation)) return { ok: false, reason: '请先选择一个生命格作为形状的左上角。', cells: [], hits: [], blocked: [] };
      const cells = shape.map(([dx, dy]) => {
        const cx = x + dx, cy = y + dy, inBounds = cx >= 0 && cx < this.columns && cy >= 0 && cy < this.rows, index = cy * this.columns + cx;
        const layers = inBounds ? this.enemy.cells[index] : 0;
        return { x: cx, y: cy, index, inBounds, layers, alive: layers > 0, armored: inBounds && this.enemy.armor[index] };
      });
      const fits = cells.every(c => c.inBounds);
      const hits = cells.filter(c => c.alive && (!c.armored || d.pierce));
      const blocked = cells.filter(c => c.alive && c.armored && !d.pierce);
      const ok = fits && hits.length + blocked.length > 0;
      return { ok, cells, hits, blocked, x, y, rotation, reason: !fits ? '形状超出棋盘，请向内移动或旋转。' : !ok ? '这里已经全空，请换一个仍有生命格的位置。' : '' };
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
        const value = plan.hits.length * (this.enemy.cells.length + 1) + plan.blocked.length;
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
    damage(target, value) {
      const blocked = Math.min(target.block, value);
      target.block -= blocked; const lost = Math.min(target.hp, Math.max(0, value - blocked)); target.hp -= lost;
      return { lost, blocked };
    }
    checkResult() {
      if (this.enemy.hp <= 0) { this.status = 'won'; this.phase = 'finished'; this.log.push('石门守卫崩解。余烬之后，仍有前路。'); }
      else if (this.hero.hp <= 0) { this.status = 'lost'; this.phase = 'finished'; this.log.push('提灯熄灭了。你可以重新挑战这道石门。'); }
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
      (card.id === 'focus' ? this.exhaustPile : this.discardPile).push(card);
      const hit = { lost: 0, blocked: 0, cleared: 0 };
      if (plan) {
        for (const c of plan.blocked) { this.enemy.armor[c.index] = false; hit.blocked++; }
        for (const c of plan.hits) { this.enemy.cells[c.index] = Math.max(0, this.enemy.cells[c.index] - 1); this.enemy.armor[c.index] = false; hit.lost++; if (this.enemy.cells[c.index] === 0) hit.cleared++; }
        this.syncEnemy();
      }
      this.hero.block += d.block; this.energy += d.energy;
      if (d.draw) this.draw(d.draw);
      const parts = [plan ? `${d.shapeName}在第${plan.y + 1}行第${plan.x + 1}列 / ${((plan.rotation % 4) + 4) % 4 * 90}°，削去 ${hit.lost} 层生命、击碎 ${hit.cleared} 格${hit.blocked ? `，破甲 ${hit.blocked} 格` : ''}` : '', d.block ? `+${d.block} 格挡` : '', d.draw ? `抽 ${d.draw} 张` : '', d.energy ? '+1 能量 · 消耗' : ''].filter(Boolean);
      this.log.push(`第 ${this.turn} 回合 · ${d.name}：${parts.join('，')}。`); this.checkResult();
      return { ok: true, card, definition: d, hit, plan };
    }
    endTurn() {
      if (this.status !== 'playing' || this.phase !== 'player') return { ok: false };
      this.phase = 'enemy'; this.discardPile.push(...this.hand); this.hand = [];
      this.enemy.armor.fill(false); this.syncEnemy();
      const intent = this.intent;
      const hit = intent.damage ? this.damage(this.hero, intent.damage) : { lost: 0, blocked: 0 };
      if (intent.block) this.grantArmor(intent.block);
      this.enemy.strength += intent.strength;
      this.log.push(`${intent.name}：${intent.damage ? `造成 ${hit.lost} 伤害，格挡吸收 ${hit.blocked}` : `为 ${this.enemy.block} 个生命格覆甲`}${intent.strength ? `，随后力量 +${intent.strength}` : ''}。`);
      if (this.checkResult() === 'lost') return { ok: true, intent, hit };
      this.intentIndex = (this.intentIndex + 1) % R.intents.length; this.turn++; this.energy = 3; this.hero.block = 0; this.phase = 'player'; this.draw(5);
      return { ok: true, intent, hit };
    }
  }
  root.EmberBattle = Battle;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Battle, rules: R };
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  let battle = new Battle(), busy = false, sound = false, auto = false, context, modalOpen = false, reward = null;
  let selectedUid = null, rotation = 0, anchor = { x: 1, y: 1 }, anchorChosen = false;
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
  function shapeArt(points) {
    const columns = Math.max(...points.map(p => p[0])) + 1, rows = Math.max(...points.map(p => p[1])) + 1;
    return `<span class="poly-art"><span class="shape-preview-grid" style="--shape-cols:${columns};--shape-rows:${rows}">${points.map(([x, y]) => `<i style="grid-column:${x + 1};grid-row:${y + 1}"></i>`).join('')}</span></span>`;
  }
  const art = id => {
    if (R.cards[id].shape) return shapeArt(R.cards[id].shape);
    const common = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';
    const drawings = {
      strike: '<path d="m38 83 46-55 9-4-3 12-45 55Z" fill="currentColor" opacity=".18"/><path d="m38 83 46-55 9-4-3 12-45 55M31 72l21 17m-17-8-9 14m4-28L18 75m73-25 13-1M67 21l-4-9"/>',
      guard: '<path d="m64 20 31 12-4 37c-3 12-18 23-27 29-9-6-24-17-27-29l-4-37Z" fill="currentColor" opacity=".12"/><path d="m64 20 31 12-4 37c-3 12-18 23-27 29-9-6-24-17-27-29l-4-37ZM64 31v53M44 44l20-9 20 9M45 53h38M25 39l-9-4m86 4 9-4"/>',
      heavy: '<path d="m65 27 23 10 7 17-17 8-22-8-6-15Z" fill="currentColor" opacity=".2"/><path d="m65 27 23 10 7 17-17 8-22-8-6-15Zm-9 27-21 40 8 4 22-39M63 34l18 8m-50 3-11-9m69 48 14 7m-36-8-3 15M35 23l-3-7"/>',
      ember: '<path d="M66 16c3 20-12 27-10 44 7-6 15-10 15-20 23 25 23 48-6 55-36 2-44-26-26-47-1 16 5 20 9 21-5-23 18-27 18-53Z" fill="currentColor" opacity=".22"/><path d="M66 16c3 20-12 27-10 44 7-6 15-10 15-20 23 25 23 48-6 55-36 2-44-26-26-47-1 16 5 20 9 21-5-23 18-27 18-53ZM62 75c-9 10-4 18 5 13M27 31l-3-9m70 12 4-8m-2 44 10-1"/>',
      insight: '<path d="M17 59s19-28 47-28 47 28 47 28-19 27-47 27S17 59 17 59Z" fill="currentColor" opacity=".12"/><path d="M17 59s19-28 47-28 47 28 47 28-19 27-47 27S17 59 17 59Z"/><circle cx="64" cy="59" r="17"/><circle cx="64" cy="59" r="5"/><path d="M64 17v-8M36 23l-5-7m61 7 5-7M64 99v8"/>',
      parry: '<path d="m56 24 28 11-4 30c-2 9-14 18-24 24-10-6-22-15-24-24l-4-30Z" fill="currentColor" opacity=".12"/><path d="m56 24 28 11-4 30c-2 9-14 18-24 24-10-6-22-15-24-24l-4-30ZM56 36v37m13 20 34-55 5-3-1 10-32 51m-10-13 17 9M93 20l3-9"/>',
      focus: '<circle cx="64" cy="57" r="28" opacity=".4"/><path d="m64 18 8 29 28 10-28 8-8 30-8-30-28-8 28-10 8-29Z" fill="currentColor" opacity=".2"/><path d="m64 18 8 29 28 10-28 8-8 30-8-30-28-8 28-10 8-29ZM25 27l-6-6m84 6 6-6M26 87l-7 7m84-7 6 7"/>'
    };
    return `<svg viewBox="0 0 128 112" ${common} stroke-width="2" aria-hidden="true"><circle cx="64" cy="57" r="43" opacity=".12"/>${drawings[id]}</svg>`;
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
    for (const cell of [...plan.hits, ...plan.blocked]) {
      const element = $('enemy-grid').children[cell.index], blocked = !plan.hits.some(c => c.index === cell.index);
      element.classList.add(blocked ? 'cell-cracked' : cell.layers > 1 ? 'cell-peeled' : 'cell-shattered');
      const point = effectPoint(element);
      effect(`cell-flash ${blocked ? 'armor-effect' : ''}`, point);
      const shards = !blocked && cell.layers > 1 ? 3 : 5;
      for (let i = 0; i < shards; i++) effect(`cell-shard ${blocked ? 'armor-effect' : 'layer-shard'}`, point, { '--layer-color': R.layerColors[cell.layers - 1], '--dx': `${Math.cos(i * Math.PI * .4) * (22 + i * 3)}px`, '--dy': `${Math.sin(i * Math.PI * .4) * 25 - 16}px`, '--spin': `${i * 87 + 45}deg` });
    }
    floatText('enemy-actor', hit.lost ? `−${hit.lost}` : `破甲 ${hit.blocked}`, hit.lost ? 'damage' : 'block');
    announceImpact(d.name, hit.lost ? `−${hit.lost}` : '破甲', `${hit.lost ? `削去 ${hit.lost} 层 · 击碎 ${hit.cleared} 格` : '护甲碎裂'}${hit.blocked ? ` · 破甲 ${hit.blocked} 格` : ''}`, hit.lost ? 'damage' : 'block');
    tone(hit.lost ? 150 : 360, .2, hit.lost ? 'sawtooth' : 'triangle');
  }
  function selectedCard() { return battle.hand.find(c => c.uid === selectedUid); }
  function clearPlacement() { selectedUid = null; rotation = 0; anchorChosen = false; }
  function renderGrid() {
    $('enemy-grid').style.setProperty('--grid-cols', battle.columns);
    $('enemy-grid').innerHTML = battle.enemy.cells.map((layers, i) => `<button class="hp-cell ${layers ? 'alive' : 'empty'} ${layers > 1 ? 'layered' : ''} ${layers && battle.enemy.armor[i] ? 'armored' : ''}" data-cell="${i}" data-layers="${layers}" style="--layer-color:${R.layerColors[Math.max(0, layers - 1)]}" aria-label="第${Math.floor(i / battle.columns) + 1}行第${i % battle.columns + 1}列，${layers ? `${layers}层生命${battle.enemy.armor[i] ? '，有护甲' : ''}` : '已破损'}" title="${layers ? `${layers}层生命 · 命中削1层${battle.enemy.armor[i] ? ' · 需先破甲' : ''}` : '空格'}" ${busy || battle.status !== 'playing' ? 'disabled' : ''}><span>${layers || '·'}</span>${layers && battle.enemy.armor[i] ? '<i class="cell-armor" aria-hidden="true">◇</i>' : ''}</button>`).join('');
    $('enemy-cell-count').textContent = `${battle.enemy.cells.filter(layers => layers > 0).length} 格 · 每格最多 ${battle.maxCellLayers} 层`;
    paintPlacement();
  }
  function paintPlacement() {
    const card = selectedCard(), pending = !!card && !auto && !busy && battle.status === 'playing';
    const plan = pending ? battle.planAttack(card, { ...anchor, rotation }) : null;
    const cells = [...$('enemy-grid').children];
    cells.forEach(e => e.classList.remove('preview-hit', 'preview-block', 'preview-empty', 'preview-invalid', 'is-anchor'));
    if (plan) {
      for (const c of plan.cells) if (c.inBounds) cells[c.index].classList.add(!plan.ok && plan.reason.startsWith('形状超出') ? 'preview-invalid' : c.alive ? c.armored && !battle.definition(card).pierce ? 'preview-block' : 'preview-hit' : 'preview-empty');
      const index = anchor.y * battle.columns + anchor.x; if (cells[index]) cells[index].classList.add('is-anchor');
    }
    $('enemy-grid-panel').classList.toggle('placing', pending);
    $('rotate-attack').disabled = !pending; $('cancel-attack').disabled = !pending;
    $('placement-title').textContent = pending ? `${battle.definition(card).name} · ${battle.definition(card).shapeName} · ${rotation * 90}°` : auto ? 'AUTO 已开启 · 点攻击牌直接打出' : '选攻击牌 → 点格子立即攻击';
    $('placement-preview').innerHTML = pending ? shapeArt(battle.shapeFor(card, rotation)) : '<span class="idle-crosshair">⌖</span>';
    $('placement-status').textContent = !pending ? auto ? '自动选择落点和旋转；每格削1层，优先扣血。' : '数字与颜色表示层数，命中各削1层，0层才碎裂。' : !plan.ok ? plan.reason : `点击即削 ${plan.hits.length} 层 · 碎 ${plan.hits.filter(c => c.layers === 1).length} 格${plan.blocked.length ? ` · 破甲 ${plan.blocked.length} 格` : ''} · R旋转`;
    $('auto-button').setAttribute('aria-pressed', String(auto)); $('auto-button').classList.toggle('active', auto);
    $('auto-button').disabled = busy || battle.status !== 'playing';
    $('auto-state').textContent = auto ? '开' : '关';
    $('hand-shortcuts').textContent = auto ? 'AUTO · 点牌直接攻击  /  A 切换' : '选牌 1–9 · 点格攻击 · R 旋转';
    document.querySelectorAll('.card').forEach(e => e.classList.toggle('selected', e.dataset.uid === selectedUid));
  }
  function setAnchor(index, chosen = false) { if (!selectedCard() || busy || modalOpen) return; anchor = { x: index % battle.columns, y: Math.floor(index / battle.columns) }; if (chosen) anchorChosen = true; paintPlacement(); }
  function rotateAttack() { if (!selectedCard() || busy || modalOpen) return; rotation = (rotation + 1) % 4; paintPlacement(); tone(320, .06); }
  function cancelAttack() { if (!selectedUid) return; clearPlacement(); paintPlacement(); toast('已取消放置，未消耗卡牌或能量。'); }
  function toggleAuto() {
    if (busy || modalOpen || battle.status !== 'playing') return;
    auto = !auto; clearPlacement(); render(); tone(auto ? 520 : 300, .08);
    toast(auto ? 'AUTO 开启 · 点击攻击牌，自动选落点并打出' : 'AUTO 关闭 · 选牌后点击格子立即攻击');
  }
  function render() {
    $('turn').textContent = String(battle.turn).padStart(2, '0'); $('energy').textContent = battle.energy;
    $('energy-orb').classList.toggle('empty', battle.energy === 0);
    $('hero-hp').textContent = `${battle.hero.hp} / ${battle.hero.maxHp}`; $('hero-hp-fill').style.width = `${battle.hero.hp / battle.hero.maxHp * 100}%`;
    $('enemy-hp').textContent = `${battle.enemy.hp} / ${battle.enemy.maxHp}`;
    $('hero-health').setAttribute('aria-valuenow', battle.hero.hp); $('hero-health').setAttribute('aria-valuemax', battle.hero.maxHp);
    $('enemy-health').setAttribute('aria-valuenow', battle.enemy.hp);
    $('enemy-health').setAttribute('aria-valuemax', battle.enemy.maxHp);
    $('hero-status').innerHTML = battle.hero.block ? `<span class="status shield" title="下次你的回合开始时清空">${icon('shield')} ${battle.hero.block} 格挡</span>` : '<span class="subtle-status">提灯仍在燃烧</span>';
    $('enemy-status').innerHTML = (battle.enemy.block ? `<span class="status shield" title="先破甲，再次命中才削1层生命">${icon('shield')} ${battle.enemy.block} 格护甲</span>` : '') + (battle.enemy.strength ? `<span class="status strength" title="攻击伤害永久增加">${icon('sword')} +${battle.enemy.strength}</span>` : '');
    const intent = battle.intent;
    $('intent-value').innerHTML = `${icon(intent.type === 'attack' ? 'sword' : 'shield')} <b>${intent.damage || intent.block}</b>${intent.strength ? '<small>随后 +3 力量</small>' : ''}`;
    $('intent-label').textContent = intent.name;
    $('enemy-intent').classList.toggle('defensive', intent.type === 'defend');
    $('enemy-intent').title = intent.damage ? `回合结束后攻击 ${intent.damage} 点${intent.strength ? '，之后永久增加3点力量' : ''}` : `为${intent.block}个生命格覆甲，护甲在下一次敌方行动前清空`;
    $('draw-count').textContent = battle.drawPile.length; $('discard-count').textContent = battle.discardPile.length;
    $('hand-count').textContent = battle.hand.length; $('exhaust-count').textContent = battle.exhaustPile.length ? `已消耗 ${battle.exhaustPile.length}` : '';
    $('phase-label').textContent = busy ? '守卫行动' : '你的回合'; $('end-turn').disabled = busy || battle.status !== 'playing';
    $('hand').style.setProperty('--cards', battle.hand.length);
    $('hand').innerHTML = battle.hand.map((card, i) => {
      const d = battle.definition(card), affordable = d.cost <= battle.energy;
      const desc = (d.shape ? `<span><b>${d.shape.length}</b> 格${d.shapeName} · 各削1层</span><small>${auto ? '自动落点' : '点格即出'}</small>` : '') + (d.block ? `<span>获得 <b>${d.block}</b> 点格挡。</span>` : '') + (d.pierce ? '<small>穿甲 · 直接削生命层</small>' : '') + (d.draw ? `抽 <b>${d.draw}</b> 张牌。` : '') + (d.energy ? `获得 <b>1</b> 点能量。<small>消耗 · 本局不再洗回</small>` : '');
      return `<button class="card card-${card.id} ${!affordable ? 'unaffordable' : ''}" style="--r:${(i - (battle.hand.length - 1) / 2) * 2.5}deg;--i:${i}" data-uid="${card.uid}" ${busy ? 'disabled' : ''} aria-label="${i + 1}号牌 ${d.name}，消耗${d.cost}能量，${d.description}" title="${affordable ? d.shape ? auto ? '点击自动攻击' : '选中后点击格子立即攻击' : '点击打出' : '能量不足'}"><span class="card-cost">${d.cost}</span><span class="card-heading">${d.name}</span><span class="card-art">${art(card.id)}</span><span class="card-type">${d.type === 'attack' ? '形 状 攻 击' : '技 能'}</span><span class="card-description">${desc}</span><span class="card-key">${i + 1}</span><span class="card-corner">✦</span></button>`;
    }).join('');
    $('arena').classList.toggle('victory', battle.status === 'won'); $('enemy-figure').classList.toggle('defeated', battle.status === 'won');
    $('relic-badge').hidden = !battle.relic; $('relic-badge').textContent = battle.relic === 'heart' ? '✦ 残火之心 · 生命 +10' : '✦ 淬火刀锋 · 形状攻击穿甲';
    renderGrid();
  }
  function play(uid) {
    if (busy || modalOpen) return;
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
      selectedUid = uid; rotation = 0; anchor = { x: 1, y: 1 }; anchorChosen = false; render(); tone(300, .08);
      toast(`${d.name}已选中 · 点击生命格立即攻击，R旋转`); return;
    }
    clearPlacement(); resolvePlay(uid);
  }
  function resolvePlay(uid, placement = null) {
    const result = battle.play(uid, placement); if (!result.ok) { tone(90); toast(result.reason); return; }
    clearPlacement();
    $('first-hint').classList.add('dismissed'); render();
    if (result.plan) attackFeedback(result); else tone(440, .15);
    if (result.definition.block) { floatText('hero-actor', `+${result.definition.block} 格挡`, 'block'); if (!result.plan) shake('hero-figure', 'shield-up'); }
    if (battle.status === 'won') { const serial = battleSerial; setTimeout(() => { if (serial === battleSerial) showResult(); }, 1000); }
  }
  function confirmAttack() { const card = selectedCard(); if (!card || busy || modalOpen || !anchorChosen) return; const plan = battle.planAttack(card, { ...anchor, rotation }); if (!plan.ok) { toast(plan.reason); return; } resolvePlay(card.uid, { ...anchor, rotation }); }
  function endTurn() {
    if (busy || modalOpen || battle.status !== 'playing') return;
    clearPlacement(); const serial = battleSerial; busy = true; $('first-hint').classList.add('dismissed'); render();
    if (battle.intent.damage) shake('enemy-figure', 'attacking');
    toast(`${battle.intent.name} · ${battle.intent.damage ? `${battle.intent.damage}点攻击来袭` : '守卫正在覆甲'}`);
    setTimeout(() => {
      if (serial !== battleSerial) return;
      const result = battle.endTurn();
      busy = false; render();
      if (result.intent.damage) {
        strikeEffect('enemy-figure', 'hero-figure', !result.hit.lost);
        if (result.hit.lost) { shake('hero-figure'); shake('hero-health', 'impact-pulse'); floatText('hero-actor', `−${result.hit.lost}`, 'damage'); tone(75, .28, 'sawtooth'); }
        else { shake('hero-figure', 'shield-up'); floatText('hero-actor', `格挡 ${result.hit.blocked}`, 'block'); tone(360, .2); }
        announceImpact(result.intent.name, result.hit.lost ? `−${result.hit.lost}` : '格挡', `受到 ${result.hit.lost} 点伤害${result.hit.blocked ? ` · 格挡吸收 ${result.hit.blocked}` : ''}`, result.hit.lost ? 'hero-damage' : 'block');
        if (result.hit.blocked && result.hit.lost) floatText('hero-actor', `格挡 ${result.hit.blocked}`, 'block secondary');
      } else {
        shake('enemy-grid-panel', 'shield-up'); announceImpact(result.intent.name, `+${battle.enemy.block}`, '生命格覆甲', 'block'); tone(360, .2);
      }
      if (battle.status !== 'playing') setTimeout(() => { if (serial === battleSerial) showResult(); }, 1000); else toast(`第 ${battle.turn} 回合 · 能量恢复，抽取 5 张牌`);
    }, 650);
  }
  function openModal(title, content, className = '') { modalOpen = true; $('modal-title').textContent = title; $('modal-body').innerHTML = content; $('modal-panel').className = `modal-panel ${className}`; $('modal').hidden = false; $('modal-close').focus(); }
  function closeModal() { modalOpen = false; $('modal').hidden = true; $('end-turn').focus(); }
  function restart(relic = null) { battleSerial++; battle = new Battle({ relic }); reward = null; busy = false; clearPlacement(); clearTimeout(impactTimer); $('combat-effects').replaceChildren(); $('combat-banner').classList.remove('visible'); closeModal(); render(); toast(relic ? '带着遗物，再次踏入回廊。' : '新的挑战开始了。'); }
  function showPile(pile) {
    const names = { draw: '抽牌堆', discard: '弃牌堆', deck: '初始牌组', exhaust: '消耗区' };
    const cards = pile === 'draw' ? battle.drawPile : pile === 'discard' ? battle.discardPile : pile === 'exhaust' ? battle.exhaustPile : battle.allCards;
    const counts = {}; cards.forEach(c => counts[c.id] = (counts[c.id] || 0) + 1);
    openModal(`${names[pile]} · ${cards.length} 张`, `<p class="modal-note">${pile === 'draw' ? '以下按类型展示，不代表抽取顺序。抽牌堆耗尽时，弃牌会重新洗入。' : pile === 'discard' ? '打出的牌和回合结束时的手牌会进入这里。' : pile === 'exhaust' ? '消耗的牌在本局战斗中不会再被抽到。' : '这是一场独立遭遇战。击败守卫后，可选择遗物重试。'}</p><div class="pile-list">${Object.entries(counts).map(([id, count]) => { const d = battle.definition(id); return `<div class="pile-item"><span class="mini-art ${id}">${art(id)}</span><div><strong>${d.name} <small>×${count}</small></strong><p>${d.description}</p></div><span class="mini-cost">${d.cost}</span></div>`; }).join('') || '<p class="empty-pile">这里暂时没有牌。</p>'}</div>`);
  }
  function showHelp() {
    openModal('提灯旅人的战斗手册', `<div class="help-grid"><div>${icon('star')}<h3>点击即出牌</h3><p>每回合3能量。选攻击牌，悬停预览，再点击生命格立即攻击，无需二次确认。无效落点不会消耗卡牌或能量。</p></div><div>${icon('eye')}<h3>AUTO · 免放置</h3><p>开启AUTO，点击攻击牌直接打出。系统自动选择落点和旋转，优先削去最多生命层，其次破甲；出牌和结束回合仍由你决定。</p></div><div>${icon('shield')}<h3>生命最多叠9层</h3><p>数字和九种颜色表示1–9层，每层1生命。形状覆盖的格子各削1层，3→2→1→0，降到0才碎裂。总生命等于所有格子的层数之和，当前初始总生命仍为24。</p></div><div>${icon('flame')}<h3>旋转、护甲与格挡</h3><p>手动按R旋转，红色边框表示削层，蓝色边框表示先破甲，数字仍显示当前层数。守卫给3格覆甲，刀锋可穿甲；你的格挡在下回合清空。</p></div></div><div class="shortcut-line"><kbd>1</kbd>–<kbd>9</kbd> 出牌 <span>·</span> <kbd>R</kbd> 旋转 <span>·</span> <kbd>A</kbd> AUTO <span>·</span> <kbd>E</kbd> 结束回合</div><p class="modal-note">手动模式支持方向键移动预览、Enter直接攻击；Esc取消选牌或关闭弹窗。守卫循环：9点攻击 → 3格覆甲 → 5点攻击后力量+3。</p>`);
  }
  function showResult() {
    if (battle.status === 'playing') return;
    const won = battle.status === 'won';
    openModal(won ? '石门已开' : '提灯熄灭', `<div class="result-emblem">${icon(won ? 'flame' : 'shield')}</div><p class="result-eyebrow">${won ? 'ENCOUNTER CLEARED' : 'THE EMBERS WILL RETURN'}</p><p class="result-story">${won ? '最后一格生命熄灭，石门守卫化作碎石。<br>带走一件遗物，再试试不同的形状组合。' : '这一次，余烬没能穿过石门。<br>安排攻击的落点，也记得格挡守卫的反击。'}</p><div class="result-stats"><div><b>${battle.turn}</b><span>战斗回合</span></div><div><b>${battle.played}</b><span>打出卡牌</span></div><div><b>${battle.hero.hp}</b><span>剩余生命</span></div></div>${won ? `<div class="reward-label">选择一件遗物，用于下一次挑战</div><div class="rewards"><button data-reward="heart">${icon('flame')}<b>残火之心</b><span>最大生命 +10</span></button><button data-reward="blade">${icon('sword')}<b>淬火刀锋</b><span>形状攻击直接穿甲</span></button></div>` : ''}<button class="gold-button result-restart" id="result-restart">${won ? '不带遗物重新挑战' : '再点燃一次提灯'} ${icon('arrow')}</button><p class="result-footnote">方格生命版 · 余烬回廊 / 01</p>`, 'result-panel');
  }
  document.addEventListener('click', e => {
    const card = e.target.closest('[data-uid]'); if (card) play(card.dataset.uid);
    const chosen = e.target.closest('[data-reward]'); if (chosen) { reward = chosen.dataset.reward; document.querySelectorAll('[data-reward]').forEach(b => b.classList.toggle('selected', b === chosen)); $('result-restart').innerHTML = `带着${reward === 'heart' ? '残火之心' : '淬火刀锋'}重试 ${icon('arrow')}`; tone(500); }
    if (e.target.closest('#result-restart')) restart(reward);
  });
  $('end-turn').addEventListener('click', endTurn); $('help-button').addEventListener('click', showHelp);
  $('enemy-grid').addEventListener('pointerover', e => { const cell = e.target.closest('[data-cell]'); if (cell) setAnchor(Number(cell.dataset.cell)); });
  $('enemy-grid').addEventListener('focusin', e => { const cell = e.target.closest('[data-cell]'); if (cell) setAnchor(Number(cell.dataset.cell), true); });
  $('enemy-grid').addEventListener('click', e => { const cell = e.target.closest('[data-cell]'); if (!cell || busy || modalOpen || battle.status !== 'playing') return; if (auto) { toast('AUTO已开启，点击攻击牌即可出牌。'); return; } if (!selectedCard()) { toast('先选择一张攻击牌，再点击格子立即攻击。'); return; } setAnchor(Number(cell.dataset.cell), true); confirmAttack(); });
  $('rotate-attack').addEventListener('click', rotateAttack); $('cancel-attack').addEventListener('click', cancelAttack); $('auto-button').addEventListener('click', toggleAuto);
  $('draw-pile').addEventListener('click', () => showPile('draw')); $('discard-pile').addEventListener('click', () => showPile('discard'));
  $('deck-button').addEventListener('click', () => showPile('deck'));
  $('log-button').addEventListener('click', () => openModal('战斗记录', `<ol class="battle-log">${battle.log.map(l => `<li>${l}</li>`).join('')}</ol>`));
  $('restart-button').addEventListener('click', () => openModal('重新踏入回廊？', '<p class="modal-note">当前战斗会重新开始，遗物也会重置。</p><button class="gold-button" id="confirm-restart">重新挑战</button>'));
  $('modal-body').addEventListener('click', e => { if (e.target.closest('#confirm-restart')) restart(); });
  $('sound-button').addEventListener('click', () => { sound = !sound; $('sound-button').classList.toggle('active', sound); $('sound-button').setAttribute('aria-pressed', String(sound)); $('sound-button').title = sound ? '关闭音效' : '开启音效'; toast(sound ? '音效已开启' : '音效已关闭'); if (sound) tone(500); });
  $('modal-close').addEventListener('click', closeModal); $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && modalOpen) { closeModal(); return; }
    if (modalOpen) { if (e.key === 'Tab') { const list = [...$('modal').querySelectorAll('button:not([disabled])')]; if (e.shiftKey && document.activeElement === list[0]) { e.preventDefault(); list.at(-1).focus(); } else if (!e.shiftKey && document.activeElement === list.at(-1)) { e.preventDefault(); list[0].focus(); } } return; }
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'Escape' && selectedUid) { e.preventDefault(); cancelAttack(); return; }
    if (e.key.toLowerCase() === 'a') { e.preventDefault(); toggleAuto(); return; }
    if (selectedCard() && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); anchor.x = Math.max(0, Math.min(battle.columns - 1, anchor.x + (e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0))); anchor.y = Math.max(0, Math.min(battle.rows - 1, anchor.y + (e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0))); anchorChosen = true; paintPlacement(); return; }
    if (e.key.toLowerCase() === 'r' && selectedUid) { e.preventDefault(); rotateAttack(); return; }
    if (e.key === 'Enter' && selectedUid) { e.preventDefault(); confirmAttack(); return; }
    if (/^[1-9]$/.test(e.key)) { const c = battle.hand[Number(e.key) - 1]; if (c) { e.preventDefault(); play(c.uid); } }
    if (e.key.toLowerCase() === 'e') { e.preventDefault(); endTurn(); }
  });
  $('help-button').innerHTML = icon('info'); $('sound-button').innerHTML = icon('sound'); $('restart-button').innerHTML = icon('reset');
  $('deck-button').innerHTML = `${icon('cards')} <span>牌组</span> <b>10</b>`;
  $('draw-symbol').innerHTML = icon('cards'); $('discard-symbol').innerHTML = icon('cards');
  $('end-turn').innerHTML = `结束回合 ${icon('arrow')}<kbd>E</kbd>`;
  $('layer-legend').innerHTML = `<span class="layer-legend-label">层数</span>${R.layerColors.map((color, i) => `<span class="layer-swatch" style="--layer-color:${color}" title="${i + 1}层生命">${i + 1}</span>`).join('')}`;
  root.emberGame = { get battle() { return battle; }, get auto() { return auto; }, restart, play, endTurn, showResult, confirmAttack, rotateAttack, cancelAttack, toggleAuto };
  render();
})(typeof globalThis !== 'undefined' ? globalThis : this);
