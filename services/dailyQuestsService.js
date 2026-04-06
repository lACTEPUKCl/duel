import { duelModel } from "../models/duel.js";
import { generateDailyQuests, dailyQuestBonus } from "../config/dailyQuestsData.js";
import { awardXP } from "../commands/leveling.js";
import { logger } from "../utils/logger.js";

/**
 * Получить или создать дейлики игрока на сегодня
 */
export async function getOrCreateDailyQuests(discordId) {
  await duelModel.connect();
  const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
  const doc = await statsColl.findOne({ discordid: discordId });
  if (!doc?.duelGame) return null;

  const dq = doc.duelGame.dailyQuests;
  const today = new Date().toISOString().slice(0, 10); // "2026-04-06"

  // Если дейлики уже на сегодня — возвращаем
  if (dq && dq.date === today) return dq;

  // Генерируем новые
  const quests = generateDailyQuests();
  const newDq = {
    date: today,
    quests,
    allCompleted: false,
    bonusClaimed: false,
  };

  await statsColl.updateOne(
    { discordid: discordId },
    { $set: { "duelGame.dailyQuests": newDq } }
  );

  return newDq;
}

/**
 * Увеличить прогресс дейлика по типу
 * @param {string} discordId
 * @param {string} questType — "duel_wins", "duels_played", "quests_done" и т.д.
 * @param {number} amount — на сколько увеличить прогресс
 * @returns {Array} — массив только что завершённых квестов [{text, reward}]
 */
export async function progressDailyQuest(discordId, questType, amount = 1) {
  await duelModel.connect();
  const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
  const doc = await statsColl.findOne({ discordid: discordId });
  if (!doc?.duelGame?.dailyQuests) return [];

  const dq = doc.duelGame.dailyQuests;
  const today = new Date().toISOString().slice(0, 10);
  if (dq.date !== today) return []; // Устаревшие

  const justCompleted = [];
  let changed = false;

  for (const q of dq.quests) {
    if (q.completed) continue;
    if (q.type !== questType) continue;

    q.progress = (q.progress || 0) + amount;
    changed = true;

    if (q.progress >= q.target) {
      q.completed = true;
      justCompleted.push({ text: q.text, reward: q.reward });

      // Выдаём награду
      if (q.reward.gold) {
        await statsColl.updateOne(
          { discordid: discordId },
          { $inc: { bonuses: q.reward.gold } }
        );
      }
      if (q.reward.xp) {
        await awardXP(discordId, q.reward.xp);
      }
    }
  }

  // Проверяем все ли выполнены
  const allDone = dq.quests.every((q) => q.completed);
  if (allDone && !dq.bonusClaimed) {
    dq.allCompleted = true;
    dq.bonusClaimed = true;
    justCompleted.push({
      text: "🌟 ВСЕ ДЕЙЛИКИ ВЫПОЛНЕНЫ!",
      reward: dailyQuestBonus,
      isBonus: true,
    });

    if (dailyQuestBonus.gold) {
      await statsColl.updateOne(
        { discordid: discordId },
        { $inc: { bonuses: dailyQuestBonus.gold } }
      );
    }
    if (dailyQuestBonus.xp) {
      await awardXP(discordId, dailyQuestBonus.xp);
    }
  }

  if (changed) {
    await statsColl.updateOne(
      { discordid: discordId },
      { $set: { "duelGame.dailyQuests": dq } }
    );
  }

  return justCompleted;
}

/**
 * Форматировать оповещение о дейликах
 */
export function formatDailyQuestNotifications(completed) {
  if (!completed.length) return "";
  const lines = completed.map((c) => {
    const r = [];
    if (c.reward.xp) r.push(`+${c.reward.xp} XP`);
    if (c.reward.gold) r.push(`+${c.reward.gold} 💰`);
    const emoji = c.isBonus ? "🌟" : "✅";
    return `${emoji} **${c.text}** (${r.join(", ")})`;
  });
  return "\n\n📋 **Дейлики:**\n" + lines.join("\n");
}
