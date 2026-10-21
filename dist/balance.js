/* Balance proposal: DeepSeek. Adoption and execution: Codex. See the local audit timeline. */
(function (root) {
  const rules = {
    heroHp: 50, enemyHp: 48,
    deck: ['strike', 'guard', 'ember', 'insight', 'heavy', 'strike', 'strike', 'guard', 'parry', 'focus'],
    cards: {
      strike: { name: '直击', cost: 1, type: 'attack', damage: 6, block: 0, draw: 0, burn: 0, energy: 0, description: '造成6点伤害。' },
      guard: { name: '举盾', cost: 1, type: 'skill', damage: 0, block: 6, draw: 0, burn: 0, energy: 0, description: '获得6点格挡，在你的下个回合开始时清空。' },
      heavy: { name: '重砸', cost: 2, type: 'attack', damage: 12, block: 0, draw: 0, burn: 0, energy: 0, description: '造成12点伤害。' },
      ember: { name: '余烬', cost: 1, type: 'skill', damage: 0, block: 0, draw: 0, burn: 4, energy: 0, description: '施加4层灼烧：敌方行动前先扣4点生命，随后灼烧层数-1。' },
      insight: { name: '洞察', cost: 1, type: 'skill', damage: 0, block: 0, draw: 2, burn: 0, energy: 0, description: '抽2张牌。' },
      parry: { name: '招架', cost: 1, type: 'skill', damage: 3, block: 6, draw: 0, burn: 0, energy: 0, description: '获得6点格挡，并反击3点伤害。' },
      focus: { name: '专注', cost: 0, type: 'skill', damage: 0, block: 0, draw: 0, burn: 0, energy: 1, description: '本回合能量+1；打出后消耗，本局不再回到牌库。' }
    },
    intents: [
      { name: '碎门重锤', type: 'attack', damage: 9, block: 0, strength: 0 },
      { name: '石门壁垒', type: 'defend', damage: 0, block: 8, strength: 0 },
      { name: '余烬蓄势', type: 'attack', damage: 5, block: 0, strength: 3 }
    ]
  };
  root.EmberRules = rules;
  if (typeof module !== 'undefined' && module.exports) module.exports = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
