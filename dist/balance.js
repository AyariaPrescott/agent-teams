/* Initial balance proposal: DeepSeek. Grid-combat redesign and current values: Codex. */
(function (root) {
  const rules = {
    heroHp: 50, enemyHp: 24, gridColumns: 6, gridRows: 4,
    deck: ['strike', 'guard', 'ember', 'insight', 'heavy', 'strike', 'strike', 'guard', 'parry', 'focus'],
    cards: {
      strike: { name: '直击', cost: 1, type: 'attack', damage: 3, shapeName: '直线', shape: [[0, 0], [1, 0], [2, 0]], block: 0, draw: 0, burn: 0, energy: 0, description: '放置3格直线攻击，移除覆盖的生命格。' },
      guard: { name: '举盾', cost: 1, type: 'skill', damage: 0, block: 6, draw: 0, burn: 0, energy: 0, description: '获得6点格挡，在你的下个回合开始时清空。' },
      heavy: { name: '重砸', cost: 2, type: 'attack', damage: 5, shapeName: 'L形', shape: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], block: 0, draw: 0, burn: 0, energy: 0, description: '放置5格L形攻击，移除覆盖的生命格。' },
      ember: { name: '余烬', cost: 1, type: 'attack', damage: 4, shapeName: '方块', shape: [[0, 0], [1, 0], [0, 1], [1, 1]], block: 0, draw: 0, burn: 0, energy: 0, description: '放置2×2方块攻击，直接移除覆盖的生命格。' },
      insight: { name: '洞察', cost: 1, type: 'skill', damage: 0, block: 0, draw: 2, burn: 0, energy: 0, description: '抽2张牌。' },
      parry: { name: '招架', cost: 1, type: 'attack', damage: 4, shapeName: 'T形', shape: [[0, 0], [1, 0], [2, 0], [1, 1]], block: 3, draw: 0, burn: 0, energy: 0, description: '放置4格T形攻击，并获得3点格挡。' },
      focus: { name: '专注', cost: 0, type: 'skill', damage: 0, block: 0, draw: 0, burn: 0, energy: 1, description: '本回合能量+1；打出后消耗，本局不再回到牌库。' }
    },
    intents: [
      { name: '碎门重锤', type: 'attack', damage: 9, block: 0, strength: 0 },
      { name: '石门壁垒', type: 'defend', damage: 0, block: 3, strength: 0 },
      { name: '余烬蓄势', type: 'attack', damage: 5, block: 0, strength: 3 }
    ]
  };
  root.EmberRules = rules;
  if (typeof module !== 'undefined' && module.exports) module.exports = rules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
