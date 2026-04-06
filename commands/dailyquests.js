import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";
import { getOrCreateDailyQuests } from "../services/dailyQuestsService.js";
import { dailyQuestBonus } from "../config/dailyQuestsData.js";

export const data = new SlashCommandBuilder()
  .setName("dailyquests")
  .setDescription("Показать ежедневные задания и прогресс");

export async function execute(interaction) {
  const userDoc = await checkUserBinding(interaction);
  if (!userDoc) return;

  const dq = await getOrCreateDailyQuests(interaction.user.id);
  if (!dq) {
    return interaction.reply({
      content: "❌ Персонаж не создан.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const lines = dq.quests.map((q, i) => {
    const check = q.completed ? "✅" : "⬜";
    const progress = q.completed
      ? `${q.target}/${q.target}`
      : `${q.progress || 0}/${q.target}`;
    const rewardStr = [];
    if (q.reward.xp) rewardStr.push(`+${q.reward.xp} XP`);
    if (q.reward.gold) rewardStr.push(`+${q.reward.gold} 💰`);
    return `${check} **${q.text}** — ${progress} (${rewardStr.join(", ")})`;
  });

  const allDone = dq.quests.every((q) => q.completed);
  const bonusLine = allDone
    ? `\n🌟 **Бонус за все 3:** ✅ Получен! (+${dailyQuestBonus.xp} XP, +${dailyQuestBonus.gold} 💰)`
    : `\n🌟 **Бонус за все 3:** ⬜ (+${dailyQuestBonus.xp} XP, +${dailyQuestBonus.gold} 💰)`;

  const embed = new EmbedBuilder()
    .setColor(allDone ? 0x00ff00 : 0x3498db)
    .setTitle("📋 Ежедневные задания")
    .setDescription(lines.join("\n") + bonusLine)
    .setFooter({ text: `Обновляются каждый день | ${dq.date}` });

  return interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}
