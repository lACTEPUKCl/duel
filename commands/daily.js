import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { duelModel } from "../models/duel.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";
import { awardXP } from "./leveling.js";
import { logger } from "../utils/logger.js";

const DAILY_COOLDOWN = 24 * 60 * 60 * 1000; // 24 часа
const STREAK_RESET = 48 * 60 * 60 * 1000; // 48 часов — серия сбрасывается
const MAX_STREAK_BONUS = 7; // Максимальный множитель серии

export const data = new SlashCommandBuilder()
  .setName("daily")
  .setDescription("Получить ежедневную награду");

export async function execute(interaction) {
  const userDoc = await checkUserBinding(interaction);
  if (!userDoc) return;

  try {
    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
    const user = await statsColl.findOne({ discordid: interaction.user.id });

    if (!user?.duelGame) {
      return interaction.reply({
        content:
          "❌ Персонаж не создан. Используйте /createcharacter.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const now = Date.now();
    const lastDaily = user.duelGame.cooldowns?.daily || 0;

    // Проверка кулдауна
    if (now - lastDaily < DAILY_COOLDOWN) {
      const remainingMs = DAILY_COOLDOWN - (now - lastDaily);
      const hours = Math.floor(remainingMs / 3600000);
      const minutes = Math.ceil((remainingMs % 3600000) / 60000);
      return interaction.reply({
        content: `⏰ Следующая награда через **${hours}ч ${minutes}мин**.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Рассчитываем серию
    let streak;
    if (lastDaily && now - lastDaily < STREAK_RESET) {
      streak = Math.min(
        (user.duelGame.dailyStreak || 0) + 1,
        MAX_STREAK_BONUS
      );
    } else {
      streak = 1;
    }

    // Награды масштабируются с серией
    const goldReward = 100 + (streak - 1) * 20; // 100–220
    const xpReward = 50 + (streak - 1) * 10; // 50–110

    // Атомарное обновление
    await statsColl.updateOne(
      { discordid: interaction.user.id },
      {
        $inc: { bonuses: goldReward },
        $set: {
          "duelGame.cooldowns.daily": now,
          "duelGame.dailyStreak": streak,
        },
      }
    );

    // XP через систему левелинга
    const { level, xp, unspentPoints } = await awardXP(
      interaction.user.id,
      xpReward
    );

    logger.economy(
      interaction.user.id,
      "daily_claim",
      goldReward,
      (user.bonuses || 0) + goldReward
    );

    // Формируем embed
    const streakEmoji =
      streak >= 7 ? "🔥" : streak >= 4 ? "⚡" : streak >= 2 ? "✨" : "📅";
    const streakBar = "🟩".repeat(streak) + "⬜".repeat(MAX_STREAK_BONUS - streak);

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(`${streakEmoji} Ежедневная награда!`)
      .setDescription(
        `**Серия:** ${streak} / ${MAX_STREAK_BONUS} дней\n${streakBar}\n\n` +
          `💰 Золото: **+${goldReward}**\n` +
          `✨ Опыт: **+${xpReward}**\n\n` +
          (streak < MAX_STREAK_BONUS
            ? `Завтра бонус будет ещё больше! (${100 + streak * 20}💰 / ${50 + streak * 10}✨)`
            : `🔥 **Максимальная серия!** Продолжайте заходить каждый день!`)
      )
      .setFooter({
        text: `Уровень: ${level} | XP: ${xp} | Очки: ${unspentPoints}`,
      });

    return interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error("Ошибка в daily:", err);
    return interaction.reply({
      content: "❌ Ошибка при получении награды.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
