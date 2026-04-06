import { getClassDefinition, getMainStatKey } from "./classHelpers.js";
import {
  STAT_CAPS,
  SOFT_CAPS,
  COMBAT,
} from "../config/balanceConfig.js";

// ─── DIMINISHING RETURNS ───
// Применяет soft cap к базовому стату
function applySoftCap(key, rawValue) {
  const soft = SOFT_CAPS[key];
  const hard = STAT_CAPS[key];
  if (!soft || !hard) return rawValue;

  if (rawValue <= soft) return rawValue;

  // Часть до soft cap — полная, после — половинная
  const overSoft = rawValue - soft;
  const effectiveOver = Math.floor(overSoft * 0.5);
  return Math.min(soft + effectiveOver, hard);
}

/**
 * Получить эффективное значение стата с учётом:
 * 1. Diminishing returns (soft cap)
 * 2. Множителя класса
 * 3. Бонусов экипировки
 */
export function getEffectiveStat(duelGame, key) {
  const stats = duelGame.stats || {};
  const rawBase = stats[key] || 0;

  // Шаг 1: применяем diminishing returns к базе
  const base = applySoftCap(key, rawBase);

  // Шаг 2: множитель класса
  const classDef = getClassDefinition(stats.class);
  const mult = classDef.statMultipliers?.[key] ?? 0;
  let result = base + Math.floor(base * mult);

  // Шаг 3: бонусы экипировки
  if (key === "accuracy") {
    const w = duelGame.equipped?.weapon;
    if (w && typeof w === "object" && w.stats?.accuracyBonus) {
      result += Math.floor(result * w.stats.accuracyBonus);
    }
  }
  if (key === "defense") {
    const a = duelGame.equipped?.armor;
    if (a && typeof a === "object" && a.stats?.defensePercentBonus) {
      result += Math.floor(result * a.stats.defensePercentBonus);
    }
  }
  return result;
}

/**
 * Значение главного аттрибута
 */
export function getMainStat(duelGame) {
  const key = getMainStatKey(duelGame.stats?.class);
  return getEffectiveStat(duelGame, key);
}

/**
 * Шанс попадания (0.4 — 0.92)
 * Формула: baseHit + (maxHit - baseHit) × ratio
 * ratio = accuracy / mainStat, capped at 1
 */
export function computeHitChance(duelGame) {
  const effAcc = getEffectiveStat(duelGame, "accuracy");
  const main = getMainStat(duelGame);
  const ratio = main > 0 ? Math.min(effAcc / main, 1) : 0;
  return (
    COMBAT.baseHitChance +
    (COMBAT.maxHitChance - COMBAT.baseHitChance) * ratio
  );
}

/**
 * Шанс крита (0.05 — 0.40 + оружие)
 */
export function computeCritChance(duelGame) {
  const effAcc = getEffectiveStat(duelGame, "accuracy");
  const main = getMainStat(duelGame);
  const ratio = main > 0 ? Math.min(effAcc / main, 1) : 0;
  const baseCrit =
    COMBAT.baseCritChance +
    (COMBAT.maxCritChance - COMBAT.baseCritChance) * ratio;
  const w = duelGame.equipped?.weapon;
  const bonusCrit =
    typeof w === "object" ? w.stats?.critChanceBonus || 0 : 0;
  return Math.min(baseCrit + bonusCrit, 0.50); // жёсткий потолок 50%
}

/**
 * Урон оружием
 */
export function getWeaponDamage(duelGame) {
  const main = getMainStat(duelGame);
  const w = duelGame.equipped?.weapon;
  const dmgBonus =
    typeof w === "object" ? w.stats?.damagePercentBonus || 0 : 0;
  return main * (1 + dmgBonus);
}

/**
 * Суммарная защита
 */
export function getTotalDefense(duelGame) {
  return getEffectiveStat(duelGame, "defense");
}

/**
 * Anti-tank бонус: если у цели HP сильно больше чем у атакующего,
 * атакующий получает % бонус к урону.
 * Это не даёт тупо качать HP и быть неубиваемым.
 */
export function getAntiTankBonus(attackerHp, defenderHp) {
  if (!COMBAT.antiTankEnabled) return 0;
  const ratio = defenderHp / Math.max(attackerHp, 1);
  if (ratio <= COMBAT.antiTankThreshold) return 0;
  const overPercent = (ratio - COMBAT.antiTankThreshold) * 100;
  return Math.min(
    overPercent * COMBAT.antiTankBonusPerPercent,
    COMBAT.antiTankMaxBonus
  );
}
