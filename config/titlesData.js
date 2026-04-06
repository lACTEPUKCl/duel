/**
 * ═══════════════════════════════
 *  TITLES / ACHIEVEMENTS
 * ═══════════════════════════════
 *
 * Проверяются после каждого значимого действия.
 * Выдаются один раз, хранятся в duelGame.titles[]
 */

export const titles = [
  // ─── ДУЭЛИ ───
  { id: "first_blood", name: "🩸 Первая кровь", desc: "Победи в первой дуэли",
    check: (dg) => (dg.duels?.wins || 0) >= 1, reward: { xp: 100 } },
  { id: "duelist_10", name: "⚔️ Дуэлянт", desc: "10 побед в дуэлях",
    check: (dg) => (dg.duels?.wins || 0) >= 10, reward: { xp: 300, gold: 500 } },
  { id: "duelist_50", name: "⚔️ Мастер дуэлей", desc: "50 побед",
    check: (dg) => (dg.duels?.wins || 0) >= 50, reward: { xp: 1000, gold: 2000 } },
  { id: "duelist_100", name: "⚔️ Легенда арены", desc: "100 побед",
    check: (dg) => (dg.duels?.wins || 0) >= 100, reward: { xp: 3000, gold: 5000 } },

  // ─── СТРИКИ ───
  { id: "streak_5", name: "🔥 В ударе", desc: "Серия 5 побед",
    check: (dg) => (dg.duels?.bestStreak || 0) >= 5, reward: { xp: 200, gold: 500 } },
  { id: "streak_10", name: "🔥🔥 Неостановим", desc: "Серия 10 побед",
    check: (dg) => (dg.duels?.bestStreak || 0) >= 10, reward: { xp: 500, gold: 1500 } },
  { id: "streak_15", name: "🔥🔥🔥 Непобедимый", desc: "Серия 15 побед",
    check: (dg) => (dg.duels?.bestStreak || 0) >= 15, reward: { xp: 1000, gold: 3000 } },

  // ─── УРОВНИ ───
  { id: "level_10", name: "⭐ Новобранец", desc: "Достигни 10 уровня",
    check: (dg) => (dg.level || 1) >= 10, reward: { gold: 300 } },
  { id: "level_20", name: "⭐⭐ Продвинутый", desc: "Достигни 20 уровня",
    check: (dg) => (dg.level || 1) >= 20, reward: { gold: 1000 } },
  { id: "level_40", name: "⭐⭐⭐ Ветеран", desc: "Достигни 40 уровня",
    check: (dg) => (dg.level || 1) >= 40, reward: { gold: 3000 } },
  { id: "level_80", name: "👑 Легенда", desc: "Достигни 80 уровня",
    check: (dg) => (dg.level || 1) >= 80, reward: { gold: 10000 } },

  // ─── ЗАТОЧКА ───
  { id: "enhance_5", name: "🔧 Кузнец", desc: "Заточи предмет до +5",
    check: (dg) => hasEnhance(dg, 5), reward: { xp: 300 } },
  { id: "enhance_7", name: "🔨 Мастер-кузнец", desc: "Заточи до +7",
    check: (dg) => hasEnhance(dg, 7), reward: { xp: 500, gold: 1000 } },
  { id: "enhance_10", name: "⚒️ Легендарный кузнец", desc: "Заточи до +10",
    check: (dg) => hasEnhance(dg, 10), reward: { xp: 2000, gold: 5000 } },

  // ─── КВЕСТЫ ───
  { id: "quests_10", name: "📜 Путник", desc: "Заверши 10 квестов",
    check: (dg) => (dg.questsCompleted || 0) >= 10, reward: { xp: 200 } },
  { id: "quests_50", name: "📜 Путешественник", desc: "Заверши 50 квестов",
    check: (dg) => (dg.questsCompleted || 0) >= 50, reward: { xp: 500, gold: 1000 } },

  // ─── БОСС ───
  { id: "boss_kill", name: "💀 Убийца боссов", desc: "Добей мини-босса",
    check: (dg) => (dg.bossKills || 0) >= 1, reward: { xp: 500 } },
  { id: "boss_10", name: "💀💀 Истребитель", desc: "Добей 10 боссов",
    check: (dg) => (dg.bossKills || 0) >= 10, reward: { xp: 1000, gold: 3000 } },

  // ─── ЭКОНОМИКА ───
  { id: "rich_5k", name: "💰 Богач", desc: "Накопи 5000 бонусов",
    check: (dg, doc) => (doc?.bonuses || 0) >= 5000, reward: { xp: 200 } },
  { id: "rich_20k", name: "💰💰 Магнат", desc: "Накопи 20000 бонусов",
    check: (dg, doc) => (doc?.bonuses || 0) >= 20000, reward: { xp: 500 } },

  // ─── UNDERDOG ───
  { id: "giant_slayer", name: "🗡️ Убийца гигантов", desc: "Победи игрока на 10+ уровней выше",
    check: (dg) => (dg.biggestUpset || 0) >= 10, reward: { xp: 500, gold: 1000 } },

  // ─── DAILY ───
  { id: "daily_7", name: "📅 Неделя!", desc: "7 дней подряд",
    check: (dg) => (dg.dailyStreak || 0) >= 7, reward: { gold: 500 } },
  { id: "daily_30", name: "📅 Месяц!", desc: "30 дней подряд (лучший стрик)",
    check: (dg) => (dg.bestDailyStreak || 0) >= 30, reward: { gold: 3000, xp: 1000 } },
];

function hasEnhance(dg, level) {
  const eq = dg.equipped || {};
  for (const slot of ["weapon", "armor"]) {
    const item = eq[slot];
    if (item && typeof item === "object" && (item.enhance || 0) >= level) return true;
  }
  const inv = dg.inventory || [];
  for (const item of inv) {
    if (typeof item === "object" && (item.enhance || 0) >= level) return true;
  }
  return false;
}

/**
 * Проверить и выдать новые титулы
 * @returns {Array} — массив новых титулов [{id, name, reward}]
 */
export function checkNewTitles(duelGame, fullDoc) {
  const existing = duelGame.titles || [];
  const newTitles = [];
  for (const t of titles) {
    if (existing.includes(t.id)) continue;
    if (t.check(duelGame, fullDoc)) {
      newTitles.push({ id: t.id, name: t.name, desc: t.desc, reward: t.reward });
    }
  }
  return newTitles;
}
