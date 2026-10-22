/* Original body/capacity adaptation by Codex; inspired by RimWorld's health model. */
(function (root) {
  'use strict';
  const parts = [
    { id: 'torso', name: '躯干', maxHp: 24, weight: 24, vital: true, affects: '承载所有部位；毁坏致命' },
    { id: 'neck', name: '颈部', parent: 'torso', maxHp: 10, weight: 3, vital: true, affects: '呼吸、头部连接；毁坏致命' },
    { id: 'head', name: '头部', parent: 'neck', maxHp: 14, weight: 6, vital: true, affects: '意识、感官；毁坏致命' },
    { id: 'brain', name: '大脑', parent: 'head', maxHp: 8, weight: .8, internal: true, vital: true, affects: '意识；毁坏致命' },
    { id: 'leftEye', name: '左眼', parent: 'head', maxHp: 5, weight: 1, affects: '视觉 → 攻击效能' },
    { id: 'rightEye', name: '右眼', parent: 'head', maxHp: 5, weight: 1, affects: '视觉 → 攻击效能' },
    { id: 'leftEar', name: '左耳', parent: 'head', maxHp: 5, weight: 1, affects: '听觉 → 受击倍率' },
    { id: 'rightEar', name: '右耳', parent: 'head', maxHp: 5, weight: 1, affects: '听觉 → 受击倍率' },
    { id: 'heart', name: '心脏', parent: 'torso', maxHp: 12, weight: 1.5, internal: true, vital: true, affects: '血液循环 → 意识、格挡、恢复；毁坏致命' },
    { id: 'leftLung', name: '左肺', parent: 'torso', maxHp: 10, weight: 2, internal: true, affects: '呼吸 → 行动、能量' },
    { id: 'rightLung', name: '右肺', parent: 'torso', maxHp: 10, weight: 2, internal: true, affects: '呼吸 → 行动、能量' },
    { id: 'stomach', name: '胃', parent: 'torso', maxHp: 12, weight: 3, internal: true, affects: '新陈代谢 → 治疗、血容量恢复' },
    { id: 'spine', name: '脊柱', parent: 'torso', maxHp: 12, weight: 1.2, internal: true, affects: '行动；毁坏会倒地' },
    { id: 'leftArm', name: '左臂', parent: 'torso', maxHp: 14, weight: 9, affects: '操作；毁坏连带失去左手' },
    { id: 'leftHand', name: '左手', parent: 'leftArm', maxHp: 8, weight: 4, affects: '操作 → 攻击、格挡' },
    { id: 'rightArm', name: '右臂', parent: 'torso', maxHp: 14, weight: 9, affects: '操作；毁坏连带失去右手' },
    { id: 'rightHand', name: '右手', parent: 'rightArm', maxHp: 8, weight: 4, affects: '操作 → 攻击、格挡' },
    { id: 'leftLeg', name: '左腿', parent: 'torso', maxHp: 18, weight: 11, affects: '行动；毁坏连带失去左脚' },
    { id: 'leftFoot', name: '左脚', parent: 'leftLeg', maxHp: 10, weight: 4, affects: '行动 → 能量、受击倍率' },
    { id: 'rightLeg', name: '右腿', parent: 'torso', maxHp: 18, weight: 11, affects: '行动；毁坏连带失去右脚' },
    { id: 'rightFoot', name: '右脚', parent: 'rightLeg', maxHp: 10, weight: 4, affects: '行动 → 能量、受击倍率' }
  ];
  const capacityNames = { consciousness: '意识', manipulation: '操作', moving: '行动', sight: '视觉', hearing: '听觉', breathing: '呼吸', pumping: '血液循环', metabolism: '新陈代谢' };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  class HeroBody {
    constructor({ relic = null } = {}) {
      this.parts = parts.map(p => { const maxHp = p.maxHp + (relic === 'heart' ? p.id === 'torso' ? 6 : p.id === 'heart' ? 4 : 0 : 0); return { ...p, maxHp, hp: maxHp, bleed: 0, missing: false, detachedBy: null }; });
      this.block = 0; this.blood = 100; this.boostTurns = 0; this.bandages = 3; this.stimulants = 1; this.lastHits = [];
    }
    part(id) { return this.parts.find(p => p.id === id); }
    available(id) { const p = this.part(id); return !!p && !p.missing && p.hp > 0 && (!p.parent || this.available(p.parent)); }
    efficiency(id) { const p = this.part(id); return this.available(id) ? p.hp / p.maxHp : 0; }
    get hp() { return this.parts.reduce((sum, p) => sum + p.hp, 0); }
    get maxHp() { return this.parts.reduce((sum, p) => sum + p.maxHp, 0); }
    get bleeding() { return this.parts.reduce((sum, p) => sum + p.bleed, 0); }
    get pain() { return clamp(this.parts.reduce((sum, p) => sum + (p.maxHp - p.hp) * (p.missing ? .35 : 1), 0) / 80 * (this.boostTurns ? .7 : 1), 0, 1); }
    get capacities() {
      const e = id => this.efficiency(id), enhanced = this.boostTurns > 0;
      const boost = (base, factor) => clamp(base > 0 ? base * (enhanced ? factor : 1) : 0, 0, 1.75);
      const pumping = boost(e('heart') * this.blood / 100, 1.15);
      const breathing = boost((e('leftLung') + e('rightLung')) / 2 * (.7 + .3 * e('neck')), 1.15);
      const circulation = .6 + .2 * pumping + .2 * breathing;
      const consciousness = boost(e('brain') * (.7 + .3 * e('head')) * circulation * (1 - this.pain * .5) * Math.min(1, this.blood / 60), 1.25);
      const manipulation = boost((e('leftArm') * e('leftHand') + e('rightArm') * e('rightHand')) / 2 * consciousness, 1.2);
      const moving = boost((e('leftLeg') * e('leftFoot') + e('rightLeg') * e('rightFoot')) / 2 * e('spine') * consciousness * circulation, 1.2);
      const sense = (a, b) => (.75 * Math.max(e(a), e(b)) + .25 * Math.min(e(a), e(b))) * consciousness;
      const sight = boost(sense('leftEye', 'rightEye'), 1.1), hearing = boost(sense('leftEar', 'rightEar'), 1.1);
      const metabolism = boost(e('stomach') * (.7 + .3 * pumping), 1.15);
      return { consciousness, manipulation, moving, sight, hearing, breathing, pumping, metabolism };
    }
    get effects() {
      const c = this.capacities;
      return { attack: clamp(c.manipulation * (.5 + .5 * c.sight), 0, 2.25), block: clamp(c.manipulation * (.8 + .2 * c.pumping), 0, 2.25), energy: clamp(Math.round(3 * (c.moving + c.breathing) / 2), 1, 5), draw: clamp(Math.round(5 * c.consciousness), 1, 8), incoming: clamp(1 - (c.moving - 1) * .35 - (c.hearing - 1) * .15, .65, 1.6), healing: Math.max(1, Math.round(6 * c.metabolism)) };
    }
    get failureReason() {
      const vital = this.parts.find(p => p.vital && !this.available(p.id));
      if (vital) return `${vital.name}毁坏`;
      if (this.blood <= 0) return '失血殆尽';
      const c = this.capacities;
      if (c.consciousness < .3) return '意识低于30%，失去意识';
      if (c.moving <= .15) return '行动不高于15%，倒地失能';
      return '';
    }
    detachChildren(id, detached) {
      for (const p of this.parts.filter(p => p.parent === id && !p.missing)) {
        p.hp = 0; p.missing = true; p.detachedBy = id; p.bleed = 0; detached.push(p.name); this.detachChildren(p.id, detached);
      }
    }
    injure(id, amount, hits) {
      let p = this.part(id), remaining = amount, lost = 0;
      while (p && remaining > 0) {
        if (!this.available(p.id)) { p = this.part(p.parent); continue; }
        const taken = Math.min(p.hp, remaining), detached = [];
        p.hp -= taken; remaining -= taken; lost += taken; p.bleed += taken * (p.internal ? .45 : .3);
        if (p.hp === 0) { p.missing = true; this.detachChildren(p.id, detached); }
        hits.push({ id: p.id, name: p.name, damage: taken, destroyed: p.missing, detached });
        p = remaining > 0 && !this.failureReason ? this.part(p.parent) : null;
      }
      return lost;
    }
    receiveAttack(value, rng = Math.random) {
      const scaled = Math.max(0, Math.round(value * this.effects.incoming)), blocked = Math.min(this.block, scaled);
      this.block -= blocked;
      let remaining = scaled - blocked, lost = 0; const hits = [], strikes = Math.min(3, remaining);
      for (let i = 0; i < strikes && remaining > 0 && !this.failureReason; i++) {
        const amount = Math.ceil(remaining / (strikes - i)); remaining -= amount;
        const pool = this.parts.filter(p => this.available(p.id)), total = pool.reduce((sum, p) => sum + p.weight, 0);
        let roll = clamp(rng(), 0, 1 - Number.EPSILON) * total;
        const target = pool.find(p => (roll -= p.weight) < 0) || pool[pool.length - 1];
        if (target) lost += this.injure(target.id, amount, hits);
      }
      this.lastHits = hits;
      return { lost, blocked, hits, raw: value, scaled, avoided: Math.max(0, value - scaled), amplified: Math.max(0, scaled - value) };
    }
    advanceTurn() {
      const bleeding = this.bleeding, before = this.blood, c = this.capacities, wasBoosted = this.boostTurns > 0;
      this.blood = clamp(this.blood - bleeding, 0, 100);
      const recovered = this.blood > 0 ? Math.min(100 - this.blood, 1.2 * c.metabolism * Math.min(1.75, c.pumping)) : 0;
      this.blood += recovered;
      if (this.boostTurns > 0) this.boostTurns--;
      return { bleeding, recovered, lostBlood: before - this.blood, expired: wasBoosted && this.boostTurns === 0 };
    }
    canTreat(id) { const p = this.part(id); return !!p && this.bandages > 0 && (p.bleed > 0 || (this.available(id) && p.hp < p.maxHp)); }
    bestTreatment() { return this.parts.filter(p => this.canTreat(p.id)).sort((a, b) => (b.bleed + 1 - b.hp / b.maxHp) - (a.bleed + 1 - a.hp / a.maxHp))[0]; }
    treat(id) {
      const p = this.part(id);
      if (!this.bandages) return { ok: false, reason: '本局包扎次数已用完。' };
      if (!this.canTreat(id)) return { ok: false, reason: p?.missing ? '缺失部位不能再生；残端已无出血，无需再次包扎。' : '这个部位不需要包扎。' };
      const healed = this.available(id) ? Math.min(p.maxHp - p.hp, this.effects.healing) : 0, stopped = p.bleed;
      p.hp += healed; p.bleed = 0; this.blood = Math.min(100, this.blood + 4 * this.capacities.metabolism); this.bandages--;
      return { ok: true, part: p.name + (p.missing ? '残端' : ''), healed, stopped };
    }
    stimulate() {
      if (!this.stimulants) return { ok: false, reason: '本局强化剂已用完。' };
      this.stimulants--; this.boostTurns = 3; return { ok: true };
    }
  }
  HeroBody.partDefinitions = parts; HeroBody.capacityNames = capacityNames;
  root.EmberBody = HeroBody;
  if (typeof module !== 'undefined' && module.exports) module.exports = { HeroBody, parts, capacityNames };
})(typeof globalThis !== 'undefined' ? globalThis : this);
