const test = require('node:test');
const assert = require('node:assert/strict');
const { Battle, rules } = require('../dist/game.js');
const fixed = () => .4;
test('opening hand, energy and card conservation are deterministic', () => {
  const b = new Battle({ rng: fixed });
  assert.deepEqual(b.hand.map(c => c.id), ['strike', 'guard', 'ember', 'insight', 'heavy']);
  assert.equal(b.energy, 3); assert.equal(b.hero.hp, b.hero.maxHp); assert.equal(b.enemy.hp, 24);
  assert.equal(b.hero.parts.length, 22); assert.equal(b.hero.capacities.consciousness, 1);
  assert.equal(b.enemy.cells.length, 24); assert.equal(b.enemy.cells.reduce((sum, layers) => sum + layers, 0), 24);
  assert.ok(b.enemy.cells.every(layers => Number.isInteger(layers) && layers >= 0 && layers <= rules.maxCellLayers));
  assert.equal(b.hand.length + b.drawPile.length + b.discardPile.length + b.exhaustPile.length, rules.deck.length);
});
test('unaffordable cards preserve energy, HP and hand', () => {
  const b = new Battle({ rng: fixed }); b.energy = 1;
  const heavy = b.hand.find(c => c.id === 'heavy');
  assert.equal(b.play(heavy.uid, { x: 0, y: 0 }).ok, false); assert.equal(b.energy, 1); assert.equal(b.enemy.hp, 24); assert.equal(b.hand.length, 5);
});
test('block absorbs attacks and clears on the next player turn', () => {
  const b = new Battle({ rng: fixed }), initialHp = b.hero.hp; b.play(b.hand.find(c => c.id === 'guard').uid);
  assert.equal(b.hero.block, 6); const result = b.endTurn();
  assert.equal(result.hit.blocked, 6); assert.equal(result.hit.lost, 3); assert.equal(b.hero.hp, initialHp - 3);
  assert.equal(result.hit.hits.reduce((sum, wound) => sum + wound.damage, 0), 3);
  assert.equal(b.hero.block, 0); assert.equal(b.energy, b.hero.effects.energy); assert.equal(b.turn, 2); assert.equal(b.hand.length, b.hero.effects.draw);
});
test('shape attacks require placement and removing the last cells finishes combat', () => {
  const b = new Battle({ rng: fixed }); b.enemy.cells = b.enemy.cells.map((_, i) => i < 3 ? 1 : 0); b.syncEnemy();
  const strike = b.hand.find(c => c.id === 'strike'); const energy = b.energy;
  assert.equal(b.play(strike.uid).requiresPlacement, true); assert.equal(b.energy, energy);
  assert.equal(b.play(strike.uid, { x: 5, y: 0 }).ok, false); assert.equal(b.energy, energy);
  const result = b.play(strike.uid, { x: 0, y: 0 }); assert.equal(result.hit.lost, 3); assert.equal(b.status, 'won'); assert.equal(b.hero.hp, b.hero.maxHp);
  assert.equal(b.play('card-0').ok, false); assert.equal(b.endTurn().ok, false);
});
test('draw reshuffles discard, respects hand limit and focus exhausts', () => {
  const b = new Battle({ rng: fixed }); b.play(b.hand.find(c => c.id === 'insight').uid); assert.equal(b.hand.length, 6);
  const focus = b.allCards.find(c => c.id === 'focus');
  for (const a of [b.hand, b.drawPile, b.discardPile]) { const i = a.findIndex(c => c.uid === focus.uid); if (i >= 0) a.splice(i, 1); }
  b.hand.push(focus); const energy = b.energy; assert.equal(b.play(focus.uid).ok, true);
  assert.equal(b.energy, energy + 1); assert.equal(b.exhaustPile[0].uid, focus.uid);
  b.hand = []; b.drawPile = []; b.discardPile = b.allCards.filter(c => c.id !== 'focus'); b.draw(20);
  assert.equal(b.hand.length, 9); assert.equal(b.hand.some(c => c.id === 'focus'), false);
});
test('intent shield survives the player turn and strength boosts later attacks', () => {
  const b = new Battle({ rng: fixed }); b.endTurn(); b.endTurn();
  assert.equal(b.enemy.block, 3); assert.equal(b.enemy.armor.filter(Boolean).length, 3); assert.equal(b.intent.damage, 5);
  b.endTurn(); assert.equal(b.enemy.block, 0); assert.equal(b.enemy.strength, 3); assert.equal(b.intent.damage, 12);
});
test('skipping turns produces a reachable loss and refuses further actions', () => {
  const b = new Battle({ rng: fixed }); for (let i = 0; i < 20 && b.status === 'playing'; i++) b.endTurn();
  assert.equal(b.status, 'lost'); assert.ok(b.hero.failureReason); assert.equal(b.endTurn().ok, false);
});
test('a sensible card policy wins the encounter across varied shuffles', () => {
  for (let seed = 1; seed <= 30; seed++) {
    let s = seed; const b = new Battle({ rng: () => ((s = s * 16807 % 2147483647) / 2147483647) });
    b.medical('boost');
    for (let turn = 0; turn < 15 && b.status === 'playing'; turn++) {
      const wounded = b.hero.bestTreatment(); if (wounded && b.hero.bleeding > 3 && b.hero.bandages && b.energy > 1) b.medical('bandage', wounded.id);
      for (let moves = 0; moves < 20 && b.status === 'playing'; moves++) {
        const priority = ['focus', 'ember', 'parry', 'heavy', 'strike', 'insight', 'guard'];
        const choices = b.hand.filter(c => b.definition(c).cost <= b.energy).sort((a, c) => priority.indexOf(a.id) - priority.indexOf(c.id));
        if (!choices.length) break;
        const card = choices[0]; let placement = null;
        if (b.definition(card).shape) {
          placement = b.autoPlacement(card);
          if (!placement) break;
        }
        b.play(card.uid, placement);
      }
      if (b.status === 'playing') b.endTurn();
    }
    assert.equal(b.status, 'won', `seed ${seed}`); assert.ok(b.hero.hp > 0);
  }
});
test('reward relics have their displayed effects on a new battle', () => {
  const heart = new Battle({ relic: 'heart' }), plain = new Battle(); assert.equal(heart.hero.maxHp, plain.hero.maxHp + 10);
  const blade = new Battle({ relic: 'blade' }); assert.equal(blade.definition('strike').damage, 3); assert.equal(blade.definition('strike').pierce, true);
  blade.grantArmor(3); const strike = blade.hand.find(c => c.id === 'strike'); const hit = blade.play(strike.uid, { x: 1, y: 0 });
  assert.equal(hit.hit.lost, 3); assert.equal(hit.hit.blocked, 0);
  assert.equal(blade.definition('guard').damage, 0);
});
