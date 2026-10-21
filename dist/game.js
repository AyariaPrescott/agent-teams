(function (root) {
  'use strict';
  const R = root.EmberRules || (typeof require === 'function' ? require('./balance.js') : null);
  class Battle {
    constructor({ rng = Math.random, relic = null } = {}) {
      this.rng = rng; this.relic = relic;
      this.hero = { hp: R.heroHp + (relic === 'heart' ? 10 : 0), maxHp: R.heroHp + (relic === 'heart' ? 10 : 0), block: 0 };
      this.enemy = { hp: R.enemyHp, maxHp: R.enemyHp, block: 0, burn: 0, strength: 0 };
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
    definition(card) { const d = { ...R.cards[typeof card === 'string' ? card : card.id] }; if (this.relic === 'blade' && d.damage) d.damage += 2; return d; }
    draw(count) {
      for (let i = 0; i < count && this.hand.length < 9; i++) {
        if (!this.drawPile.length && this.discardPile.length) { this.drawPile = this.shuffle(this.discardPile); this.discardPile = []; this.log.push('弃牌重新洗入抽牌堆。'); }
        if (!this.drawPile.length) break;
        this.hand.push(this.drawPile.shift());
      }
    }
    damage(target, value, bypass = false) {
      const blocked = bypass ? 0 : Math.min(target.block, value);
      target.block -= blocked; const lost = Math.min(target.hp, Math.max(0, value - blocked)); target.hp -= lost;
      return { lost, blocked };
    }
    checkResult() {
      if (this.enemy.hp <= 0) { this.status = 'won'; this.phase = 'finished'; this.log.push('石门守卫崩解。余烬之后，仍有前路。'); }
      else if (this.hero.hp <= 0) { this.status = 'lost'; this.phase = 'finished'; this.log.push('提灯熄灭了。你可以重新挑战这道石门。'); }
      return this.status;
    }
    play(uid) {
      if (this.status !== 'playing' || this.phase !== 'player') return { ok: false, reason: '现在不能出牌。' };
      const index = this.hand.findIndex(c => c.uid === uid);
      if (index < 0) return { ok: false, reason: '这张牌不在手中。' };
      const card = this.hand[index], d = this.definition(card);
      if (d.cost > this.energy) return { ok: false, reason: '能量不足，可以结束回合恢复能量。' };
      this.energy -= d.cost; this.hand.splice(index, 1); this.played++;
      (card.id === 'focus' ? this.exhaustPile : this.discardPile).push(card);
      const hit = d.damage ? this.damage(this.enemy, d.damage) : { lost: 0, blocked: 0 };
      this.hero.block += d.block; this.enemy.burn += d.burn; this.energy += d.energy;
      if (d.draw) this.draw(d.draw);
      const parts = [d.damage ? `${hit.lost} 伤害${hit.blocked ? `（挡住 ${hit.blocked}）` : ''}` : '', d.block ? `+${d.block} 格挡` : '', d.burn ? `+${d.burn} 灼烧` : '', d.draw ? `抽 ${d.draw} 张` : '', d.energy ? '+1 能量 · 消耗' : ''].filter(Boolean);
      this.log.push(`第 ${this.turn} 回合 · ${d.name}：${parts.join('，')}。`); this.checkResult();
      return { ok: true, card, definition: d, hit };
    }
    endTurn() {
      if (this.status !== 'playing' || this.phase !== 'player') return { ok: false };
      this.phase = 'enemy'; this.discardPile.push(...this.hand); this.hand = [];
      this.enemy.block = 0;
      if (this.enemy.burn > 0) { const amount = this.enemy.burn; this.damage(this.enemy, amount, true); this.enemy.burn--; this.log.push(`灼烧造成 ${amount} 伤害，剩余 ${this.enemy.burn} 层。`); }
      if (this.checkResult() === 'won') return { ok: true, burnKill: true, damage: 0 };
      const intent = this.intent;
      const hit = intent.damage ? this.damage(this.hero, intent.damage) : { lost: 0, blocked: 0 };
      this.enemy.block += intent.block; this.enemy.strength += intent.strength;
      this.log.push(`${intent.name}：${intent.damage ? `造成 ${hit.lost} 伤害，格挡吸收 ${hit.blocked}` : `获得 ${intent.block} 格挡`}${intent.strength ? `，随后力量 +${intent.strength}` : ''}。`);
      if (this.checkResult() === 'lost') return { ok: true, intent, hit };
      this.intentIndex = (this.intentIndex + 1) % R.intents.length; this.turn++; this.energy = 3; this.hero.block = 0; this.phase = 'player'; this.draw(5);
      return { ok: true, intent, hit };
    }
  }
  root.EmberBattle = Battle;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Battle, rules: R };
  if (typeof document === 'undefined') return;

  const $ = id => document.getElementById(id);
  let battle = new Battle(), busy = false, sound = false, context, modalOpen = false, reward = null;
  let toastTimer, battleSerial = 0;
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
  const art = id => {
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
  function floatText(target, text, kind = '') { const e = document.createElement('span'); e.className = `float-text ${kind}`; e.textContent = text; $(target).appendChild(e); setTimeout(() => e.remove(), 1000); }
  function shake(target, cls = 'hit') { $(target).classList.remove(cls); void $(target).offsetWidth; $(target).classList.add(cls); setTimeout(() => $(target).classList.remove(cls), 500); }
  function render() {
    $('turn').textContent = String(battle.turn).padStart(2, '0'); $('energy').textContent = battle.energy;
    $('energy-orb').classList.toggle('empty', battle.energy === 0);
    $('hero-hp').textContent = `${battle.hero.hp} / ${battle.hero.maxHp}`; $('hero-hp-fill').style.width = `${battle.hero.hp / battle.hero.maxHp * 100}%`;
    $('enemy-hp').textContent = `${battle.enemy.hp} / ${battle.enemy.maxHp}`; $('enemy-hp-fill').style.width = `${battle.enemy.hp / battle.enemy.maxHp * 100}%`;
    $('hero-health').setAttribute('aria-valuenow', battle.hero.hp); $('hero-health').setAttribute('aria-valuemax', battle.hero.maxHp);
    $('enemy-health').setAttribute('aria-valuenow', battle.enemy.hp);
    $('hero-status').innerHTML = battle.hero.block ? `<span class="status shield" title="下次你的回合开始时清空">${icon('shield')} ${battle.hero.block} 格挡</span>` : '<span class="subtle-status">提灯仍在燃烧</span>';
    $('enemy-status').innerHTML = (battle.enemy.block ? `<span class="status shield">${icon('shield')} ${battle.enemy.block}</span>` : '') + (battle.enemy.burn ? `<span class="status burn" title="敌方行动前受到等同层数的伤害，随后减少1层">${icon('flame')} ${battle.enemy.burn}</span>` : '') + (battle.enemy.strength ? `<span class="status strength" title="攻击伤害永久增加">${icon('sword')} +${battle.enemy.strength}</span>` : '');
    const intent = battle.intent;
    $('intent-value').innerHTML = `${icon(intent.type === 'attack' ? 'sword' : 'shield')} <b>${intent.damage || intent.block}</b>${intent.strength ? '<small>随后 +3 力量</small>' : ''}`;
    $('intent-label').textContent = intent.name;
    $('enemy-intent').classList.toggle('defensive', intent.type === 'defend');
    $('enemy-intent').title = intent.damage ? `回合结束后攻击 ${intent.damage} 点${intent.strength ? '，之后永久增加3点力量' : ''}` : `回合结束后获得 ${intent.block} 格挡，持续到下一次敌方行动前`;
    $('draw-count').textContent = battle.drawPile.length; $('discard-count').textContent = battle.discardPile.length;
    $('hand-count').textContent = battle.hand.length; $('exhaust-count').textContent = battle.exhaustPile.length ? `已消耗 ${battle.exhaustPile.length}` : '';
    $('phase-label').textContent = busy ? '守卫行动' : '你的回合'; $('end-turn').disabled = busy || battle.status !== 'playing';
    $('hand').style.setProperty('--cards', battle.hand.length);
    $('hand').innerHTML = battle.hand.map((card, i) => {
      const d = battle.definition(card), affordable = d.cost <= battle.energy;
      const desc = (d.damage ? `造成 <b>${d.damage}</b> 点伤害。` : '') + (d.block ? `获得 <b>${d.block}</b> 点格挡。` : '') + (d.burn ? `施加 <b>${d.burn}</b> 层灼烧。<small>敌方行动前触发，逐回合减少。</small>` : '') + (d.draw ? `抽 <b>${d.draw}</b> 张牌。` : '') + (d.energy ? `获得 <b>1</b> 点能量。<small>消耗 · 本局不再洗回</small>` : '');
      return `<button class="card card-${card.id} ${!affordable ? 'unaffordable' : ''}" style="--r:${(i - (battle.hand.length - 1) / 2) * 2.5}deg;--i:${i}" data-uid="${card.uid}" ${busy ? 'disabled' : ''} aria-label="${i + 1}号牌 ${d.name}，消耗${d.cost}能量，${d.description}" title="${affordable ? '点击打出' : '能量不足'}"><span class="card-cost">${d.cost}</span><span class="card-heading">${d.name}</span><span class="card-art">${art(card.id)}</span><span class="card-type">${d.type === 'attack' ? '攻 击' : '技 能'}</span><span class="card-description">${desc}</span><span class="card-key">${i + 1}</span><span class="card-corner">✦</span></button>`;
    }).join('');
    $('arena').classList.toggle('victory', battle.status === 'won'); $('enemy-figure').classList.toggle('defeated', battle.status === 'won');
    $('relic-badge').hidden = !battle.relic; $('relic-badge').textContent = battle.relic === 'heart' ? '✦ 残火之心 · 生命 +10' : '✦ 淬火刀锋 · 伤害 +2';
  }
  function play(uid) {
    if (busy || modalOpen) return;
    const result = battle.play(uid); if (!result.ok) { tone(90); toast(result.reason); return; }
    $('first-hint').classList.add('dismissed'); tone(result.definition.type === 'attack' ? 180 : 440, .15, result.definition.type === 'attack' ? 'triangle' : 'sine');
    if (result.definition.damage) { shake('enemy-figure'); floatText('enemy-actor', result.hit.lost ? `−${result.hit.lost}` : '格挡', 'damage'); }
    if (result.definition.block) floatText('hero-actor', `+${result.definition.block}`, 'block');
    if (result.definition.burn) { shake('enemy-figure', 'ignited'); floatText('enemy-actor', `灼烧 +${result.definition.burn}`, 'burn'); }
    render(); if (battle.status === 'won') setTimeout(showResult, 650);
  }
  function endTurn() {
    if (busy || modalOpen || battle.status !== 'playing') return;
    const serial = battleSerial; busy = true; $('first-hint').classList.add('dismissed'); render(); toast('石门守卫正在行动…');
    setTimeout(() => {
      if (serial !== battleSerial) return;
      const result = battle.endTurn();
      if (result.hit?.lost) { shake('hero-figure'); floatText('hero-actor', `−${result.hit.lost}`, 'damage'); tone(80, .25, 'triangle'); }
      else if (result.hit?.blocked) { floatText('hero-actor', '已格挡', 'block'); tone(360); }
      if (result.burnKill) floatText('enemy-actor', '余烬燃尽', 'burn');
      busy = false; render();
      if (battle.status !== 'playing') setTimeout(showResult, 550); else toast(`第 ${battle.turn} 回合 · 能量恢复，抽取 5 张牌`);
    }, 650);
  }
  function openModal(title, content, className = '') { modalOpen = true; $('modal-title').textContent = title; $('modal-body').innerHTML = content; $('modal-panel').className = `modal-panel ${className}`; $('modal').hidden = false; $('modal-close').focus(); }
  function closeModal() { modalOpen = false; $('modal').hidden = true; $('end-turn').focus(); }
  function restart(relic = null) { battleSerial++; battle = new Battle({ relic }); reward = null; busy = false; closeModal(); render(); toast(relic ? '带着遗物，再次踏入回廊。' : '新的挑战开始了。'); }
  function showPile(pile) {
    const names = { draw: '抽牌堆', discard: '弃牌堆', deck: '初始牌组', exhaust: '消耗区' };
    const cards = pile === 'draw' ? battle.drawPile : pile === 'discard' ? battle.discardPile : pile === 'exhaust' ? battle.exhaustPile : battle.allCards;
    const counts = {}; cards.forEach(c => counts[c.id] = (counts[c.id] || 0) + 1);
    openModal(`${names[pile]} · ${cards.length} 张`, `<p class="modal-note">${pile === 'draw' ? '以下按类型展示，不代表抽取顺序。抽牌堆耗尽时，弃牌会重新洗入。' : pile === 'discard' ? '打出的牌和回合结束时的手牌会进入这里。' : pile === 'exhaust' ? '消耗的牌在本局战斗中不会再被抽到。' : '这是一场独立遭遇战。击败守卫后，可选择遗物重试。'}</p><div class="pile-list">${Object.entries(counts).map(([id, count]) => { const d = battle.definition(id); return `<div class="pile-item"><span class="mini-art ${id}">${art(id)}</span><div><strong>${d.name} <small>×${count}</small></strong><p>${d.description}</p></div><span class="mini-cost">${d.cost}</span></div>`; }).join('') || '<p class="empty-pile">这里暂时没有牌。</p>'}</div>`);
  }
  function showHelp() {
    openModal('提灯旅人的战斗手册', `<div class="help-grid"><div>${icon('star')}<h3>每回合 3 能量</h3><p>点击卡牌打出，左上角数字是能量消耗。每回合抽 5 张，手牌最多 9 张。</p></div><div>${icon('eye')}<h3>先看敌人意图</h3><p>守卫头顶显示下一步行动。攻击前多留格挡，防御回合可以准备余烬。</p></div><div>${icon('shield')}<h3>格挡不是永久护盾</h3><p>格挡先吸收伤害，在该角色下次行动开始时清空；你的回合开始时清空你的格挡。</p></div><div>${icon('flame')}<h3>让余烬继续燃烧</h3><p>灼烧无视格挡，在敌方行动前造成层数等量伤害，然后减少 1 层。</p></div></div><div class="shortcut-line"><kbd>1</kbd>–<kbd>9</kbd> 出对应的牌 <span>·</span> <kbd>E</kbd> 结束回合 <span>·</span> <kbd>Esc</kbd> 关闭弹窗</div><p class="modal-note">守卫循环：9点攻击 → 8点格挡 → 5点攻击后力量+3。力量会提升之后的攻击。专注打出后消耗；洞察可以抽牌。</p>`);
  }
  function showResult() {
    if (battle.status === 'playing') return;
    const won = battle.status === 'won';
    openModal(won ? '石门已开' : '提灯熄灭', `<div class="result-emblem">${icon(won ? 'flame' : 'shield')}</div><p class="result-eyebrow">${won ? 'ENCOUNTER CLEARED' : 'THE EMBERS WILL RETURN'}</p><p class="result-story">${won ? '守卫化作碎石，回廊深处传来微光。<br>带走一件遗物，再试试不同的出牌思路。' : '这一次，余烬没能穿过石门。<br>留意守卫的意图，格挡能让旅程更长。'}</p><div class="result-stats"><div><b>${battle.turn}</b><span>战斗回合</span></div><div><b>${battle.played}</b><span>打出卡牌</span></div><div><b>${battle.hero.hp}</b><span>剩余生命</span></div></div>${won ? `<div class="reward-label">选择一件遗物，用于下一次挑战</div><div class="rewards"><button data-reward="heart">${icon('flame')}<b>残火之心</b><span>最大生命 +10</span></button><button data-reward="blade">${icon('sword')}<b>淬火刀锋</b><span>所有卡牌伤害 +2</span></button></div>` : ''}<button class="gold-button result-restart" id="result-restart">${won ? '不带遗物重新挑战' : '再点燃一次提灯'} ${icon('arrow')}</button><p class="result-footnote">单关原型 · 余烬回廊 / 01</p>`, 'result-panel');
  }
  document.addEventListener('click', e => {
    const card = e.target.closest('[data-uid]'); if (card) play(card.dataset.uid);
    const chosen = e.target.closest('[data-reward]'); if (chosen) { reward = chosen.dataset.reward; document.querySelectorAll('[data-reward]').forEach(b => b.classList.toggle('selected', b === chosen)); $('result-restart').innerHTML = `带着${reward === 'heart' ? '残火之心' : '淬火刀锋'}重试 ${icon('arrow')}`; tone(500); }
    if (e.target.closest('#result-restart')) restart(reward);
  });
  $('end-turn').addEventListener('click', endTurn); $('help-button').addEventListener('click', showHelp);
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
    if (/^[1-9]$/.test(e.key)) { const c = battle.hand[Number(e.key) - 1]; if (c) { e.preventDefault(); play(c.uid); } }
    if (e.key.toLowerCase() === 'e') { e.preventDefault(); endTurn(); }
  });
  $('help-button').innerHTML = icon('info'); $('sound-button').innerHTML = icon('sound'); $('restart-button').innerHTML = icon('reset');
  $('deck-button').innerHTML = `${icon('cards')} <span>牌组</span> <b>10</b>`;
  $('draw-symbol').innerHTML = icon('cards'); $('discard-symbol').innerHTML = icon('cards');
  $('end-turn').innerHTML = `结束回合 ${icon('arrow')}<kbd>E</kbd>`;
  root.emberGame = { get battle() { return battle; }, restart, play, endTurn, showResult };
  render();
})(typeof globalThis !== 'undefined' ? globalThis : this);
