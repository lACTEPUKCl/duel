/**
 * ═══════════════════════════════════════════════════════
 *  BALANCE CONFIG — все магические числа в одном месте
 * ═══════════════════════════════════════════════════════
 *
 *  ПРОБЛЕМЫ КОТОРЫЕ ЭТО РЕШАЕТ:
 *  1. Безлимитная прокачка одного стата → SOFT CAPS
 *  2. HP слишком мощный → HP даёт меньше за очко + % урон
 *  3. Нет выравнивания в дуэлях → LEVEL SCALING
 *  4. Линейный рост → DIMINISHING RETURNS
 */

// ─── КАПЫ СТАТОВ ───
// Максимальные значения BASE статов (до множителей класса/экипировки)
// Всё что выше — обрезается при расчёте
export const STAT_CAPS = {
  strength: 150,
  agility: 150,
  intelligence: 150,
  accuracy: 120, // точность меньше т.к. сильно влияет на hit+crit
  hp: 800, // база. С множителем класса (×1.8 titan) = 1440 макс
  defense: 120, // база. С множителем = ~180 макс
};

// ─── SOFT CAP (DIMINISHING RETURNS) ───
// После soft cap каждое очко даёт 50% эффективности
// После hard cap (STAT_CAPS) — 0%
export const SOFT_CAPS = {
  strength: 80,
  agility: 80,
  intelligence: 80,
  accuracy: 60,
  hp: 400,
  defense: 60,
};

/**
 * Применить diminishing returns к вложенным очкам
 * До soft cap: 1 очко = 1 стат
 * Между soft cap и hard cap: 1 очко = 0.5 стата
 * После hard cap: 0
 *
 * @param {string} stat — название стата
 * @param {number} baseValue — текущее базовое значение
 * @param {number} pointsToAdd — сколько очков вкладываем
 * @returns {number} — итоговое значение стата
 */
export function applyStatPoints(stat, baseValue, pointsToAdd) {
  const softCap = SOFT_CAPS[stat] || 80;
  const hardCap = STAT_CAPS[stat] || 150;
  const startBase = stat === "hp" ? 100 : 10; // начальное значение

  let current = baseValue;
  let remaining = pointsToAdd;

  while (remaining > 0 && current < hardCap) {
    const increment = stat === "hp" ? 10 : 1; // HP: 1 очко = 10 hp (но с DR)
    const actualBase = stat === "hp" ? current : current;

    if (actualBase >= hardCap) break;

    if (actualBase < softCap) {
      // Полная эффективность
      current += increment;
    } else {
      // Половинная эффективность
      current += Math.ceil(increment * 0.5);
    }
    remaining--;
  }

  return Math.min(current, hardCap);
}

// ─── СТОИМОСТЬ ОЧКОВ НА HP И DEFENSE ───
// HP: 1 очко = 5 hp (было 10) — нерфим вдвое
// Defense: 1 очко = 1 defense (без изменений, но есть cap)
// Остальные: 1 очко = 1 стат
export const STAT_POINT_VALUES = {
  strength: 1,
  agility: 1,
  intelligence: 1,
  accuracy: 1,
  hp: 5, // НЕРФ: было 10
  defense: 1,
};

// ─── АВТО-РОСТ ПРИ ЛЕВЕЛИНГЕ ───
// За каждый уровень автоматически получаешь:
export const LEVEL_UP_AUTO_STATS = {
  hp: 5, // было 10 → нерф
  defense: 1, // было 2 → нерф
};

// ─── LEVEL SCALING В ДУЭЛЯХ ───
// Система уравнивания шансов при большой разнице уровней
export const DUEL_SCALING = {
  enabled: true,
  // Разница уровней после которой включается компенсация
  levelDiffThreshold: 5,
  // Максимальный бонус/штраф
  maxScaling: 0.35, // 35% макс
  // За каждый уровень разницы (после порога)
  scalingPerLevel: 0.03, // 3% за уровень
};

/**
 * Рассчитать множитель компенсации уровней
 * Слабый получает бонус к урону и снижение получаемого урона
 * Сильный получает обратный штраф
 *
 * @param {number} attackerLevel
 * @param {number} defenderLevel
 * @returns {{ atkMod: number, defMod: number }}
 *   atkMod > 1 = бонус урону, < 1 = штраф
 *   defMod > 1 = больше митигации, < 1 = меньше
 */
export function getLevelScaling(attackerLevel, defenderLevel) {
  if (!DUEL_SCALING.enabled) return { atkMod: 1, defMod: 1 };

  const diff = attackerLevel - defenderLevel;
  const absDiff = Math.abs(diff);

  if (absDiff <= DUEL_SCALING.levelDiffThreshold) {
    return { atkMod: 1, defMod: 1 };
  }

  const effectiveDiff = absDiff - DUEL_SCALING.levelDiffThreshold;
  const scaling = Math.min(
    effectiveDiff * DUEL_SCALING.scalingPerLevel,
    DUEL_SCALING.maxScaling
  );

  if (diff > 0) {
    // Атакующий СИЛЬНЕЕ → штраф
    return { atkMod: 1 - scaling, defMod: 1 - scaling };
  } else {
    // Атакующий СЛАБЕЕ → бонус
    return { atkMod: 1 + scaling, defMod: 1 + scaling };
  }
}

// ─── БОЕВЫЕ ФОРМУЛЫ ───
// % урона который проходит через защиту
// damage = raw_damage - defense * DEFENSE_EFFECTIVENESS
// При defense=100 и effectiveness=0.4 → митигация 40
export const COMBAT = {
  // Множитель эффективности защиты (нерф: защита не должна блокировать 100%)
  defenseEffectiveness: 0.35,
  // Случайный разброс урона
  damageVariance: 0.3, // ±30% (было ±20%)
  // Базовый шанс попадания
  baseHitChance: 0.4, // было 0.3 → баф промахам
  maxHitChance: 0.92, // было ~0.9 → не 100%
  // Крит
  baseCritChance: 0.05, // было 0.1
  maxCritChance: 0.40, // было ~0.5
  critMultiplier: 1.5,
  // Минимальный урон (даже при полном блоке)
  minDamage: 1,
  // Бонус % урона от HP разницы (anti-tank)
  // Если у цели HP > 150% от hp атакующего → атакующий получает бонус
  antiTankEnabled: true,
  antiTankThreshold: 1.5, // 150%
  antiTankBonusPerPercent: 0.005, // 0.5% урона за каждые 1% превышения
  antiTankMaxBonus: 0.25, // макс 25% бонус
};

// ─── XP НАГРАДЫ ЗА ДУЭЛИ ───
export const DUEL_XP = {
  // Победитель: base + (уровень проигравшего × множитель)
  winBase: 50,
  winPerLevel: 5,
  // Проигравший: фиксированный
  loseBase: 25,
  // Бонус за убийство более сильного (underdog)
  underdogBonusPerLevel: 10, // за каждый уровень выше
  underdogMaxBonus: 200,
};

// ─── ФАРМ ───
export const FARM = {
  xpPerMinute: 1,
  maxMinutes: 120,
  cooldownMs: 2 * 60 * 60 * 1000,
};

// ─── ОЧКИ ЗА УРОВЕНЬ ───
export const PROGRESSION = {
  pointsPerLevel: 5,
  baseXpThreshold: 500,
};
