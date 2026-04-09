import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";
import {
  attackBoss,
  distributeBossRewards,
  createBossKillEmbed,
  createBossSpawnEmbed,
  createBossAttackRow,
  getCurrentBoss,
} from "../services/bossService.js";
import {
  checkAndAwardTitles,
  formatTitleNotifications,
} from "../services/titlesService.js";
import {
  progressDailyQuest,
  formatDailyQuestNotifications,
} from "../services/dailyQuestsService.js";
import { logger } from "../utils/logger.js";

export const data = new SlashCommandBuilder()
  .setName("attack_boss")
  .setDescription("Атаковать текущего мини-босса");

export async function execute(interaction) {
  return handleBossAttack(interaction, false);
}

/**
 * Универсальный обработчик атаки босса
 * @param {Interaction} interaction
 * @param {boolean} fromButton — true если вызван из кнопки на embed'е
 */
export async function handleBossAttack(interaction, fromButton) {
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
  const dqCompleted = await progressDailyQuest(
    interaction.user.id,
    "boss_hits",
    1
  );

  const hpPercent = ((result.bossHp / result.bossMaxHp) * 100).toFixed(1);
  const hpBar = makeHpBar(result.bossHp, result.bossMaxHp);

  if (result.killed) {
    // ═══ БОСС УБИТ ═══
    await interaction.deferReply();
    const rewards = await distributeBossRewards(interaction.user.id);

    if (rewards) {
      const killEmbed = createBossKillEmbed(rewards);
      await interaction.editReply({ embeds: [killEmbed] });

      // Обновляем оригинальный embed (если из кнопки) — убираем кнопку
      if (fromButton) {
        try {
          const deadEmbed = new EmbedBuilder()
            .setColor(0x666666)
            .setTitle(`💀 ${rewards.bossName} побеждён`)
            .setDescription("Бой окончен. Ждите следующего босса!");
          await interaction.message.edit({
            embeds: [deadEmbed],
            components: [],
          });
        } catch (e) {
          logger.error("Failed to update boss msg:", e.message);
        }
      }

      // Проверяем титулы у всех участников
      for (const r of rewards.contributors) {
        await checkAndAwardTitles(r.userId);
      }
    }
  } else {
    // ═══ ОБЫЧНЫЙ УДАР ═══
    const critStr = result.isCrit ? " 💥 **КРИТ!**" : "";
    let content =
      `⚔️ Вы нанесли **${result.damage}** урона ${result.bossName}!${critStr}\n` +
      `${hpBar} **${result.bossHp}/${result.bossMaxHp}** (${hpPercent}%)`;
    content += formatDailyQuestNotifications(dqCompleted);

    // Эфемерный ответ игроку
    await interaction.reply({
      content,
      flags: MessageFlags.Ephemeral,
    });

    // Обновляем оригинальный embed с новым HP (если из кнопки)
    if (fromButton) {
      try {
        const boss = getCurrentBoss();
        if (boss?.alive) {
          const updatedEmbed = createBossSpawnEmbed(boss);
          await interaction.message.edit({
            embeds: [updatedEmbed],
            components: [createBossAttackRow()],
          });
        }
      } catch (e) {
        logger.error("Failed to update boss embed:", e.message);
      }
    }
  }
}

function makeHpBar(current, max) {
  const pct = Math.max(0, current / max);
  const filled = Math.round(pct * 10);
  return "🟥".repeat(filled) + "⬛".repeat(10 - filled);
}
