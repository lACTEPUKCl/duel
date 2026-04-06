/**
 * ═══════════════════════════════
 *  CRAFTING SYSTEM — материалы и рецепты
 * ═══════════════════════════════
 */

// ─── МАТЕРИАЛЫ ───
export const materials = [
  { id: "ore", name: "⛏️ Руда", description: "Металлическая руда для ковки оружия" },
  { id: "leather", name: "🧶 Кожа", description: "Прочная кожа для доспехов" },
  { id: "essence", name: "💎 Эссенция", description: "Магическая эссенция из монстров" },
  { id: "dragon_scale", name: "🐉 Чешуя дракона", description: "Редчайший материал с боссов" },
];

// ─── РЕЦЕПТЫ ───
export const recipes = [
  {
    id: "craft_weapon_epic",
    name: "Ковка: Эпическое оружие",
    result: {
      id: "weapon_epic",
      name: "Эпическое оружие",
      enhance: 0,
      stats: { damagePercentBonus: 0.5, accuracyBonus: 0.2, critChanceBonus: 0.1 },
    },
    ingredients: [
      { id: "ore", amount: 5 },
      { id: "essence", amount: 3 },
    ],
    goldCost: 2000,
  },
  {
    id: "craft_armor_epic",
    name: "Ковка: Эпическая броня",
    result: {
      id: "armor_epic",
      name: "Эпическая броня",
      enhance: 0,
      stats: { defensePercentBonus: 0.3 },
    },
    ingredients: [
      { id: "leather", amount: 5 },
      { id: "essence", amount: 3 },
    ],
    goldCost: 2000,
  },
  {
    id: "craft_weapon_legendary",
    name: "Ковка: Легендарное оружие",
    result: {
      id: "weapon_legendary",
      name: "Легендарное оружие",
      enhance: 0,
      stats: { damagePercentBonus: 1.0, accuracyBonus: 0.5, critChanceBonus: 0.2 },
    },
    ingredients: [
      { id: "ore", amount: 12 },
      { id: "essence", amount: 8 },
      { id: "dragon_scale", amount: 2 },
    ],
    goldCost: 5000,
  },
  {
    id: "craft_armor_legendary",
    name: "Ковка: Легендарная броня",
    result: {
      id: "armor_legendary",
      name: "Легендарная броня",
      enhance: 0,
      stats: { defensePercentBonus: 0.5 },
    },
    ingredients: [
      { id: "leather", amount: 12 },
      { id: "essence", amount: 8 },
      { id: "dragon_scale", amount: 2 },
    ],
    goldCost: 5000,
  },
  {
    id: "craft_scroll_weapon",
    name: "Создать: Заточка оружия",
    result: {
      id: "scroll_weapon",
      name: "Заточка оружия",
      enhance: 0,
      stats: {},
    },
    ingredients: [
      { id: "ore", amount: 2 },
      { id: "essence", amount: 1 },
    ],
    goldCost: 300,
  },
  {
    id: "craft_scroll_armor",
    name: "Создать: Усиление брони",
    result: {
      id: "scroll_armor",
      name: "Усиление брони",
      enhance: 0,
      stats: {},
    },
    ingredients: [
      { id: "leather", amount: 2 },
      { id: "essence", amount: 1 },
    ],
    goldCost: 300,
  },
];

// ─── ДРОП МАТЕРИАЛОВ (добавляется к квестовому дропу) ───
export const materialDrops = {
  easy: [
    { id: "ore", name: "⛏️ Руда", chance: 0.6, amount: 1 },
    { id: "leather", name: "🧶 Кожа", chance: 0.6, amount: 1 },
    { id: "essence", name: "💎 Эссенция", chance: 0.3, amount: 1 },
  ],
  medium: [
    { id: "ore", name: "⛏️ Руда", chance: 0.7, amount: [1, 2] },
    { id: "leather", name: "🧶 Кожа", chance: 0.7, amount: [1, 2] },
    { id: "essence", name: "💎 Эссенция", chance: 0.5, amount: 1 },
  ],
  hard: [
    { id: "ore", name: "⛏️ Руда", chance: 0.8, amount: [2, 3] },
    { id: "leather", name: "🧶 Кожа", chance: 0.8, amount: [2, 3] },
    { id: "essence", name: "💎 Эссенция", chance: 0.7, amount: [1, 3] },
    { id: "dragon_scale", name: "🐉 Чешуя дракона", chance: 0.05, amount: 1 },
  ],
  boss: [
    { id: "ore", name: "⛏️ Руда", chance: 1.0, amount: [3, 5] },
    { id: "leather", name: "🧶 Кожа", chance: 1.0, amount: [3, 5] },
    { id: "essence", name: "💎 Эссенция", chance: 1.0, amount: [2, 4] },
    { id: "dragon_scale", name: "🐉 Чешуя дракона", chance: 0.3, amount: [1, 2] },
  ],
};

/**
 * Ролл дропа материалов
 * @param {string} tier — "easy", "medium", "hard", "boss"
 * @returns {Array<{id, name, amount}>} — выпавшие материалы
 */
export function rollMaterialDrop(tier) {
  const table = materialDrops[tier] || materialDrops.easy;
  const results = [];
  for (const entry of table) {
    if (Math.random() <= entry.chance) {
      const amt = Array.isArray(entry.amount)
        ? entry.amount[0] + Math.floor(Math.random() * (entry.amount[1] - entry.amount[0] + 1))
        : entry.amount;
      results.push({ id: entry.id, name: entry.name, amount: amt });
    }
  }
  return results;
}
