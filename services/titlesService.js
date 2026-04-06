import { duelModel } from "../models/duel.js";
import { checkNewTitles } from "../config/titlesData.js";
import { awardXP } from "../commands/leveling.js";
import { logger } from "../utils/logger.js";

/**
 * Проверить и выдать новые титулы игроку.
 * Вызывать после значимых действий (дуэль, квест, заточка, и т.д.)
 *
 * @param {string} discordId
 * @returns {Array} — массив новых титулов или []
 */
export async function checkAndAwardTitles(discordId) {
  await duelModel.connect();
  const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
  const doc = await statsColl.findOne({ discordid: discordId });
  if (!doc?.duelGame) return [];

  const newTitles = checkNewTitles(doc.duelGame, doc);
  if (!newTitles.length) return [];

  // Записываем титулы
  const titleIds = newTitles.map((t) => t.id);
  let totalGold = 0;
  let totalXP = 0;

  for (const t of newTitles) {
    if (t.reward?.gold) totalGold += t.reward.gold;
    if (t.reward?.xp) totalXP += t.reward.xp;
  }

  await statsColl.updateOne(
    { discordid: discordId },
    {
      $push: { "duelGame.titles": { $each: titleIds } },
      ...(totalGold > 0 && { $inc: { bonuses: totalGold } }),
    }
  );

  if (totalXP > 0) {
    await awardXP(discordId, totalXP);
  }

  for (const t of newTitles) {
    logger.info(`[TITLE] ${discordId} earned: ${t.name}`);
  }

  return newTitles;
}

/**
 * Форматировать оповещение о новых титулах для embed/text
 */
export function formatTitleNotifications(titles) {
  if (!titles.length) return "";
  const lines = titles.map((t) => {
    let rewardStr = [];
    if (t.reward?.xp) rewardStr.push(`+${t.reward.xp} XP`);
    if (t.reward?.gold) rewardStr.push(`+${t.reward.gold} 💰`);
    return `🏅 **${t.name}** — ${t.desc} (${rewardStr.join(", ")})`;
  });
  return "\n\n🎖️ **Новые титулы!**\n" + lines.join("\n");
}
