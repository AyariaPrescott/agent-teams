const test = require('node:test');
const assert = require('node:assert/strict');
const { Battle, rules } = require('../dist/game.js');
const fixed = () => .4;
test('opening hand, energy and card conservation are deterministic', () => {
  const b = new Battle({ rng: fixed });
  assert.deepEqual(b.hand.map(c => c.id), ['strike', 'guard', 'ember', 'insight', 'heavy']);
  assert.equal(b.energy, 3); assert.equal(b.hero.hp, 50); assert.equal(b.enemy.hp, 48);
  assert.equal(b.hand.length + b.drawPile.length + b.discardPile.length + b.exhaustPile.length, rules.deck.length);
});
test('unaffordable cards preserve energy, HP and hand', () => {
  const b = new Battle({ rng: fixed }); b.energy = 1;
  const heavy = b.hand.find(c => c.id === 'heavy');
  assert.equal(b.play(heavy.uid).ok, false); assert.equal(b.energy, 1); assert.equal(b.enemy.hp, 48); assert.equal(b.hand.length, 5);
});
test('block absorbs attacks and clears on the next player turn', () => {
  const b = new Battle({ rng: fixed }); b.play(b.hand.find(c => c.id === 'guard').uid);
  assert.equal(b.hero.block, 6); const result = b.endTurn();
  assert.equal(result.hit.blocked, 6); assert.equal(result.hit.lost, 3); assert.equal(b.hero.hp, 47);
  assert.equal(b.hero.block, 0); assert.equal(b.energy, 3); assert.equal(b.turn, 2); assert.equal(b.hand.length, 5);
});
test('burn bypasses block and a burn kill cancels the enemy attack', () => {
  const b = new Battle({ rng: fixed }); b.enemy.hp = 4; b.enemy.block = 20; b.enemy.burn = 4;
  const result = b.endTurn(); assert.equal(result.burnKill, true); assert.equal(b.status, 'won'); assert.equal(b.hero.hp, 50);
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
  assert.equal(b.enemy.block, 8); assert.equal(b.intent.damage, 5);
  b.endTurn(); assert.equal(b.enemy.block, 0); assert.equal(b.enemy.strength, 3); assert.equal(b.intent.damage, 12);
});
test('skipping turns produces a reachable loss and refuses further actions', () => {
  const b = new Battle({ rng: fixed }); for (let i = 0; i < 20 && b.status === 'playing'; i++) b.endTurn();
  assert.equal(b.status, 'lost'); assert.equal(b.hero.hp, 0); assert.equal(b.endTurn().ok, false);
});
test('a sensible card policy wins the encounter across varied shuffles', () => {
  for (let seed = 1; seed <= 30; seed++) {
    let s = seed; const b = new Battle({ rng: () => ((s = s * 16807 % 2147483647) / 2147483647) });
    for (let turn = 0; turn < 15 && b.status === 'playing'; turn++) {
      for (let moves = 0; moves < 20 && b.status === 'playing'; moves++) {
        const priority = ['focus', 'ember', 'parry', 'heavy', 'strike', 'insight', 'guard'];
        const choices = b.hand.filter(c => b.definition(c).cost <= b.energy).sort((a, c) => priority.indexOf(a.id) - priority.indexOf(c.id));
        if (!choices.length) break; b.play(choices[0].uid);
      }
      if (b.status === 'playing') b.endTurn();
    }
    assert.equal(b.status, 'won', `seed ${seed}`); assert.ok(b.hero.hp > 0);
  }
});
test('reward relics have their displayed effects on a new battle', () => {
  const heart = new Battle({ relic: 'heart' }); assert.equal(heart.hero.maxHp, 60);
  const blade = new Battle({ relic: 'blade' }); assert.equal(blade.definition('strike').damage, 8); assert.equal(blade.definition('parry').damage, 5);
  assert.equal(blade.definition('guard').damage, 0);
});
