import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { duelModel } from "../models/duel.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";
import {
  STAT_CAPS,
  SOFT_CAPS,
  STAT_POINT_VALUES,
} from "../config/balanceConfig.js";

// Человекочитаемые названия
const STAT_LABELS = {
  strength: "Сила",
  agility: "Ловкость",
  intelligence: "Интеллект",
  accuracy: "Точность",
  hp: "HP",
  defense: "Защита",
};

export const data = new SlashCommandBuilder()
  .setName("upgrade")
  .setDescription("Инвестируйте очки для улучшения характеристик")
  .addStringOption((option) =>
    option
      .setName("стат")
      .setDescription("Выберите характеристику для улучшения")
      .setRequired(true)
      .addChoices(
        { name: "Сила", value: "strength" },
        { name: "Ловкость", value: "agility" },
        { name: "Интеллект", value: "intelligence" },
        { name: "Точность", value: "accuracy" },
        { name: "HP", value: "hp" },
        { name: "Защита", value: "defense" }
      )
  )
  .addIntegerOption((option) =>
    option
      .setName("очки")
      .setDescription("Количество очков для инвестиций (макс 50 за раз)")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(50)
  );

export async function execute(interaction) {
  const userDoc = await checkUserBinding(interaction);
  if (!userDoc) return;

  if (!userDoc.duelGame) {
    return interaction.reply({
      content: "❌ Персонаж не создан. Используйте /createcharacter.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const stat = interaction.options.getString("стат");
  const points = interaction.options.getInteger("очки");
  const available = userDoc.duelGame.unspentPoints || 0;

  // Проверка очков
  if (points > available) {
    return interaction.reply({
      content: `❌ Недостаточно очков. Доступно: **${available}**`,
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
    const currentStats = { ...userDoc.duelGame.stats };
    const currentValue = currentStats[stat] || (stat === "hp" ? 100 : 10);
    const cap = STAT_CAPS[stat] || 150;
    const softCap = SOFT_CAPS[stat] || 80;
    const perPoint = STAT_POINT_VALUES[stat] || 1;

    // Проверка: уже на капе?
    if (currentValue >= cap) {
      return interaction.reply({
        content: `❌ **${STAT_LABELS[stat]}** уже на максимуме (**${cap}**).`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Рассчитываем реальный прирост с учётом капа
    let actualPoints = 0;
    let newValue = currentValue;

    for (let i = 0; i < points; i++) {
      if (newValue >= cap) break;

      // Diminishing returns: после soft cap — 50% эффективности
      const increment =
        newValue >= softCap
          ? Math.ceil(perPoint * 0.5)
          : perPoint;

      newValue = Math.min(newValue + increment, cap);
      actualPoints++;
    }

    // Если ни одно очко не дало эффекта
    if (actualPoints === 0 || newValue === currentValue) {
      return interaction.reply({
        content: `❌ **${STAT_LABELS[stat]}** уже на максимуме.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const spent = actualPoints;
    const gained = newValue - currentValue;
    currentStats[stat] = newValue;
    const newUnspent = available - spent;

    await statsColl.updateOne(
      { discordid: interaction.user.id },
      {
        $set: {
          "duelGame.stats": currentStats,
          "duelGame.unspentPoints": newUnspent,
        },
      }
    );

    // Формируем подробный ответ
    const wasInSoftCap = currentValue >= softCap;
    const nowInSoftCap = newValue >= softCap;
    let drNote = "";
    if (nowInSoftCap && !wasInSoftCap) {
      drNote = `\n⚠️ Вы достигли soft cap (**${softCap}**). Дальнейшие вложения дают **50%** эффективности.`;
    } else if (wasInSoftCap) {
      drNote = `\n⚠️ Diminishing returns: эффективность **50%** (soft cap **${softCap}**).`;
    }

    let capNote = "";
    if (newValue >= cap) {
      capNote = `\n🔒 Достигнут максимум (**${cap}**)!`;
    }

    return interaction.reply({
      content:
        `✅ Вложено **${spent}** оч. в **${STAT_LABELS[stat]}**: ` +
        `**${currentValue}** → **${newValue}** (+${gained})` +
        `\nОсталось очков: **${newUnspent}**` +
        drNote +
        capNote,
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error(err);
    return interaction.reply({
      content: "❌ Ошибка при обновлении характеристик.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
