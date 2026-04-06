import { EmbedBuilder } from "discord.js";
import { logger } from "../utils/logger.js";

/**
 * ═══════════════════════════════
 *  BOUNTY SYSTEM
 * ═══════════════════════════════
 *
 * Автоматически назначает баунти на игроков с win streak 5+.
 * Кто убьёт — получает награду.
 * Баунти финансируется системой (не из кармана жертвы).
 */

const STREAK_THRESHOLD = 5;

// Награда за баунти = базовая + (streak × множитель)
const BOUNTY_BASE = 200;
const BOUNTY_PER_STREAK = 100;
const BOUNTY_MAX = 2000;

/**
 * Рассчитать баунти за текущий стрик
 */
export function calculateBounty(streak) {
  if (streak < STREAK_THRESHOLD) return 0;
  return Math.min(
    BOUNTY_BASE + (streak - STREAK_THRESHOLD) * BOUNTY_PER_STREAK,
    BOUNTY_MAX
  );
}

/**
 * Проверить нужно ли обновить стрик и баунти после дуэли.
 * Вызывается из duelGame.js после определения победителя.
 *
 * @param {Object} statsColl — MongoDB collection
 * @param {string} winnerId
 * @param {string} loserId
 * @returns {{ bountyCollected, bountyAmount, newBountyTarget, newBountyAmount, winStreak }}
 */
export async function processDuelBounty(statsColl, winnerId, loserId) {
  const result = {
    bountyCollected: false,
    bountyAmount: 0,
    newBountyTarget: null,
    newBountyAmount: 0,
    winStreak: 0,
    streakBroken: false,
    loserOldStreak: 0,
  };

  // 1. Обновляем стрик победителя
  const winnerDoc = await statsColl.findOneAndUpdate(
    { discordid: winnerId },
    {
      $inc: { "duelGame.duels.winStreak": 1 },
    },
    { returnDocument: "after" }
  );
  const winStreak = winnerDoc.value?.duelGame?.duels?.winStreak || 1;
  result.winStreak = winStreak;

  // Обновляем лучший стрик
  const bestStreak = winnerDoc.value?.duelGame?.duels?.bestStreak || 0;
  if (winStreak > bestStreak) {
    await statsColl.updateOne(
      { discordid: winnerId },
      { $set: { "duelGame.duels.bestStreak": winStreak } }
    );
  }

  // 2. Сбрасываем стрик проигравшего
  const loserDoc = await statsColl.findOne({ discordid: loserId });
  const loserStreak = loserDoc?.duelGame?.duels?.winStreak || 0;
  result.loserOldStreak = loserStreak;

  if (loserStreak >= STREAK_THRESHOLD) {
    result.streakBroken = true;
    // Победитель собирает баунти за проигравшего
    result.bountyCollected = true;
    result.bountyAmount = calculateBounty(loserStreak);

    await statsColl.updateOne(
      { discordid: winnerId },
      { $inc: { bonuses: result.bountyAmount } }
    );

    logger.economy(winnerId, "bounty_collected", result.bountyAmount, "—");
  }

  // Сбрасываем стрик проигравшего
  await statsColl.updateOne(
    { discordid: loserId },
    { $set: { "duelGame.duels.winStreak": 0 } }
  );

  // 3. Проверяем: стал ли победитель новой целью баунти?
  if (winStreak >= STREAK_THRESHOLD) {
    result.newBountyTarget = winnerId;
    result.newBountyAmount = calculateBounty(winStreak);
  }

  return result;
}

/**
 * Embed для объявления нового баунти
 */
export function createBountyEmbed(userId, streak, amount) {
  return new EmbedBuilder()
    .setColor(0xff6600)
    .setTitle("🎯 Новый баунти!")
    .setDescription(
      `<@${userId}> на серии из **${streak}** побед!\n\n` +
      `💰 За его голову назначена награда: **${amount}** бонусов\n` +
      `Победите его в дуэли и заберите награду!`
    );
}

/**
 * Embed для сбора баунти
 */
export function createBountyCollectedEmbed(hunterId, targetId, amount, oldStreak) {
  return new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("🏴‍☠️ Баунти собран!")
    .setDescription(
      `<@${hunterId}> остановил серию <@${targetId}> из **${oldStreak}** побед!\n\n` +
      `💰 Награда: **${amount}** бонусов`
    );
}

export { STREAK_THRESHOLD };
