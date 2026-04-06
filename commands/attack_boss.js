import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";
import {
  attackBoss,
  distributeBossRewards,
  createBossKillEmbed,
} from "../services/bossService.js";
import { checkAndAwardTitles } from "../services/titlesService.js";
import { formatTitleNotifications } from "../services/titlesService.js";
import { progressDailyQuest, formatDailyQuestNotifications } from "../services/dailyQuestsService.js";

export const data = new SlashCommandBuilder()
  .setName("attack_boss")
  .setDescription("Атаковать текущего мини-босса");

export async function execute(interaction) {
  const userDoc = await checkUserBinding(interaction);
  if (!userDoc) return;

  const result = await attackBoss(interaction.user.id);

  if (result.error) {
    return interaction.reply({
      content: `❌ ${result.error}`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Прогресс дейлика
  const dqCompleted = await progressDailyQuest(interaction.user.id, "boss_hits", 1);

  const hpPercent = ((result.bossHp / result.bossMaxHp) * 100).toFixed(1);
  const hpBar = makeHpBar(result.bossHp, result.bossMaxHp);

  if (result.killed) {
    // Босс убит — раздаём награды
    await interaction.deferReply();
    const rewards = await distributeBossRewards(interaction.user.id);

    if (rewards) {
      const killEmbed = createBossKillEmbed(rewards);
      await interaction.editReply({ embeds: [killEmbed] });

      // Проверяем титулы у всех участников
      for (const r of rewards.contributors) {
        await checkAndAwardTitles(r.userId);
      }
    }
  } else {
    const critStr = result.isCrit ? " 💥 **КРИТ!**" : "";
    let content =
      `⚔️ Вы нанесли **${result.damage}** урона ${result.bossName}!${critStr}\n` +
      `${hpBar} **${result.bossHp}/${result.bossMaxHp}** (${hpPercent}%)`;

    content += formatDailyQuestNotifications(dqCompleted);

    await interaction.reply({
      content,
      flags: MessageFlags.Ephemeral,
    });
  }
}

function makeHpBar(current, max) {
  const pct = Math.max(0, current / max);
  const filled = Math.round(pct * 10);
  return "🟥".repeat(filled) + "⬛".repeat(10 - filled);
}
