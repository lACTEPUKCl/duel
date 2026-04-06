/**
 * ═══════════════════════════════════════════════════
 *  CLASS ABILITIES — пассивные навыки классов
 * ═══════════════════════════════════════════════════
 *
 * Каждый класс (базовый + продвинутый) имеет набор пассивок.
 * Они проверяются в бою CombatEngine'ом.
 *
 * Типы:
 *  - onAttack: срабатывает когда этот боец атакует
 *  - onDefend: срабатывает когда этого бойца атакуют
 *  - onBattleStart: один раз в начале боя
 */

export const classAbilities = {
  // ─── БАЗОВЫЕ КЛАССЫ (слабые пассивки) ───
  warrior: {
    passives: [
      {
        id: "tough_skin",
        name: "Толстая кожа",
        description: "5% шанс заблокировать весь урон",
        type: "onDefend",
        chance: 0.05,
        effect: "block",
      },
    ],
  },
  mage: {
    passives: [
      {
        id: "arcane_spark",
        name: "Искра магии",
        description: "5% шанс нанести двойной урон",
        type: "onAttack",
        chance: 0.05,
        effect: "doubleStrike",
      },
    ],
  },
  archer: {
    passives: [
      {
        id: "keen_eye",
        name: "Острый глаз",
        description: "Первая атака всегда попадает",
        type: "onBattleStart",
        effect: "guaranteedFirstHit",
      },
    ],
  },

  // ─── ПРОДВИНУТЫЕ LVL 20 ───
  gladiator: {
    passives: [
      {
        id: "berserker_rage",
        name: "Ярость берсерка",
        description: "+20% урона когда HP < 30%",
        type: "onAttack",
        effect: "lowHpDamageBoost",
        hpThreshold: 0.3,
        bonus: 0.2,
      },
      {
        id: "iron_wall",
        name: "Железная стена",
        description: "12% шанс блока",
        type: "onDefend",
        chance: 0.12,
        effect: "block",
      },
    ],
  },
  warlord: {
    passives: [
      {
        id: "fortify",
        name: "Укрепление",
        description: "15% шанс блока",
        type: "onDefend",
        chance: 0.15,
        effect: "block",
      },
      {
        id: "war_cry",
        name: "Боевой клич",
        description: "+10% урона на первые 3 раунда",
        type: "onAttack",
        effect: "earlyDamageBoost",
        rounds: 3,
        bonus: 0.1,
      },
    ],
  },
  battlemage: {
    passives: [
      {
        id: "spell_surge",
        name: "Волна заклинаний",
        description: "10% шанс двойного удара",
        type: "onAttack",
        chance: 0.1,
        effect: "doubleStrike",
      },
      {
        id: "mana_shield",
        name: "Щит маны",
        description: "8% шанс отразить 50% урона обратно",
        type: "onDefend",
        chance: 0.08,
        effect: "reflect",
        reflectPercent: 0.5,
      },
    ],
  },
  spellbreaker: {
    passives: [
      {
        id: "arcane_overload",
        name: "Перегрузка",
        description: "12% шанс двойного удара",
        type: "onAttack",
        chance: 0.12,
        effect: "doubleStrike",
      },
    ],
  },
  ranger: {
    passives: [
      {
        id: "first_strike",
        name: "Первый удар",
        description: "Первая атака — гарантированный крит",
        type: "onBattleStart",
        effect: "guaranteedFirstCrit",
      },
      {
        id: "evasion",
        name: "Уклонение",
        description: "10% шанс уворота",
        type: "onDefend",
        chance: 0.1,
        effect: "dodge",
      },
    ],
  },
  assassin: {
    passives: [
      {
        id: "backstab",
        name: "Удар в спину",
        description: "Первая атака — гарантированный крит × 2",
        type: "onBattleStart",
        effect: "guaranteedFirstCrit",
        critMultiplier: 2.0,
      },
      {
        id: "shadow_step",
        name: "Шаг тени",
        description: "12% шанс уворота",
        type: "onDefend",
        chance: 0.12,
        effect: "dodge",
      },
    ],
  },

  // ─── ПРОДВИНУТЫЕ LVL 40 ───
  champion: {
    passives: [
      {
        id: "unstoppable",
        name: "Неостановимый",
        description: "15% блок + 25% урон при HP < 25%",
        type: "onDefend",
        chance: 0.15,
        effect: "block",
      },
      {
        id: "champion_rage",
        name: "Гнев чемпиона",
        description: "+25% урона когда HP < 25%",
        type: "onAttack",
        effect: "lowHpDamageBoost",
        hpThreshold: 0.25,
        bonus: 0.25,
      },
    ],
  },
  archmage: {
    passives: [
      {
        id: "arcane_mastery",
        name: "Мастерство магии",
        description: "15% двойной удар + 10% отражение",
        type: "onAttack",
        chance: 0.15,
        effect: "doubleStrike",
      },
      {
        id: "arcane_barrier",
        name: "Барьер",
        description: "10% отражение 50% урона",
        type: "onDefend",
        chance: 0.1,
        effect: "reflect",
        reflectPercent: 0.5,
      },
    ],
  },
  marksman: {
    passives: [
      {
        id: "perfect_aim",
        name: "Идеальный прицел",
        description: "Первые 2 атаки — крит",
        type: "onBattleStart",
        effect: "guaranteedFirstCrit",
        rounds: 2,
      },
      {
        id: "wind_walk",
        name: "Танец ветра",
        description: "15% шанс уворота",
        type: "onDefend",
        chance: 0.15,
        effect: "dodge",
      },
    ],
  },

  // ─── ПРОДВИНУТЫЕ LVL 80 ───
  titan: {
    passives: [
      {
        id: "titan_wall",
        name: "Стена титана",
        description: "20% блок",
        type: "onDefend",
        chance: 0.2,
        effect: "block",
      },
      {
        id: "titan_wrath",
        name: "Гнев титана",
        description: "+30% урон при HP < 20%",
        type: "onAttack",
        effect: "lowHpDamageBoost",
        hpThreshold: 0.2,
        bonus: 0.3,
      },
    ],
  },
  grand_sorcerer: {
    passives: [
      {
        id: "reality_warp",
        name: "Искажение реальности",
        description: "18% двойной удар + 15% отражение",
        type: "onAttack",
        chance: 0.18,
        effect: "doubleStrike",
      },
      {
        id: "void_shield",
        name: "Щит пустоты",
        description: "15% отражение 60% урона",
        type: "onDefend",
        chance: 0.15,
        effect: "reflect",
        reflectPercent: 0.6,
      },
    ],
  },
  storm_archer: {
    passives: [
      {
        id: "storm_volley",
        name: "Шквал стрел",
        description: "Первые 3 атаки — крит",
        type: "onBattleStart",
        effect: "guaranteedFirstCrit",
        rounds: 3,
      },
      {
        id: "storm_dodge",
        name: "Глаз бури",
        description: "18% уворот",
        type: "onDefend",
        chance: 0.18,
        effect: "dodge",
      },
    ],
  },
};

/**
 * Получить пассивки для classId
 */
export function getClassAbilities(classId) {
  return classAbilities[classId]?.passives || [];
}
