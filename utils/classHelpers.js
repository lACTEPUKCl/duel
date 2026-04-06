import { classes } from "../classes/classes.js";

/**
 * Найти определение класса по ID (базовый или продвинутый)
 * @param {string} classId — "warrior", "gladiator", "archmage" и т.д.
 * @returns {Object} — { name, statMultipliers, ... } или заглушка
 */
export function getClassDefinition(classId) {
  if (!classId) return { name: "—", statMultipliers: {} };
  if (classes[classId]) return classes[classId];
  for (const baseKey of Object.keys(classes)) {
    const adv = classes[baseKey].advanced;
    for (const lvl of Object.keys(adv)) {
      const found = adv[lvl].find((o) => o.id === classId);
      if (found) return found;
    }
  }
  return { name: classId, statMultipliers: {} };
}

/**
 * Определить базовый класс по любому classId
 * "gladiator" → "warrior", "archmage" → "mage", "warrior" → "warrior"
 */
export function getBaseClassId(classId) {
  if (!classId) return "default";
  if (classes[classId]) return classId;
  for (const baseKey of Object.keys(classes)) {
    const adv = classes[baseKey].advanced;
    for (const lvl of Object.keys(adv)) {
      if (adv[lvl].some((o) => o.id === classId)) {
        return baseKey;
      }
    }
  }
  return "default";
}

/**
 * Определить главный аттрибут по классу
 * warrior-ветка → strength, mage-ветка → intelligence, archer-ветка → agility
 */
export function getMainStatKey(classId) {
  const base = getBaseClassId(classId);
  if (base === "mage") return "intelligence";
  if (base === "archer") return "agility";
  return "strength";
}
