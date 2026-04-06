/**
 * ═══════════════════════════════
 *  DAILY QUESTS — ежедневные задания
 * ═══════════════════════════════
 *
 * Каждый день генерируются 3 случайных задания.
 * За каждое — отдельная награда.
 * За все 3 — бонусная награда.
 */

export const dailyQuestPool = [
  { id: "dq_win_1", text: "Победи в 1 дуэли", type: "duel_wins", target: 1,
    reward: { xp: 30, gold: 50 } },
  { id: "dq_win_2", text: "Победи в 2 дуэлях", type: "duel_wins", target: 2,
    reward: { xp: 60, gold: 100 } },
  { id: "dq_win_3", text: "Победи в 3 дуэлях", type: "duel_wins", target: 3,
    reward: { xp: 100, gold: 200 } },
  { id: "dq_duel_1", text: "Проведи 1 дуэль (любой исход)", type: "duels_played", target: 1,
    reward: { xp: 20, gold: 30 } },
  { id: "dq_duel_3", text: "Проведи 3 дуэли", type: "duels_played", target: 3,
    reward: { xp: 60, gold: 100 } },
  { id: "dq_quest", text: "Заверши квест", type: "quests_done", target: 1,
    reward: { xp: 40, gold: 50 } },
  { id: "dq_farm", text: "Пофарми 30 минут", type: "farm_minutes", target: 30,
    reward: { xp: 30, gold: 40 } },
  { id: "dq_enhance", text: "Заточи предмет", type: "enhances", target: 1,
    reward: { xp: 30, gold: 50 } },
  { id: "dq_shop", text: "Купи что-нибудь в магазине", type: "shop_buys", target: 1,
    reward: { xp: 20, gold: 30 } },
  { id: "dq_daily", text: "Забери ежедневную награду", type: "daily_claimed", target: 1,
    reward: { xp: 10, gold: 20 } },
  { id: "dq_crit", text: "Нанеси крит в дуэли", type: "crits", target: 1,
    reward: { xp: 30, gold: 50 } },
  { id: "dq_boss", text: "Ударь босса", type: "boss_hits", target: 1,
    reward: { xp: 40, gold: 60 } },
];

// Бонус за выполнение всех 3 дейликов
export const dailyQuestBonus = { xp: 100, gold: 200 };

/**
 * Сгенерировать 3 случайных дейлика (без повторов)
 */
export function generateDailyQuests() {
  const shuffled = [...dailyQuestPool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map((q) => ({
    ...q,
    progress: 0,
    completed: false,
  }));
}
