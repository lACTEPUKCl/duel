import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { duelModel } from "../models/duel.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";

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
      .setDescription("Количество очков для инвестиций")
      .setRequired(true)
      .setMinValue(1)
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

  try {
    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
    const currentStats = {
      strength: 10,
      agility: 10,
      intelligence: 10,
      accuracy: 10,
      hp: 100,
      defense: 10,
      ...userDoc.duelGame.stats,
    };

    if (stat === "hp") {
      currentStats.hp += points * 10;
    } else {
      currentStats[stat] = (currentStats[stat] || 10) + points;
    }

    const newUnspent = (userDoc.duelGame.unspentPoints || 0) - points;
    if (newUnspent < 0) {
      return interaction.reply({
        content: `❌ Недостаточно очков для инвестиций. Доступно: ${
          userDoc.duelGame.unspentPoints || 0
        }`,
        flags: MessageFlags.Ephemeral,
      });
    }

    await statsColl.updateOne(
      { discordid: interaction.user.id },
      {
        $set: {
          "duelGame.stats": currentStats,
          "duelGame.unspentPoints": newUnspent,
        },
      }
    );

    return interaction.reply({
      content: `✅ Вы успешно инвестировали ${points} ${
        points === 1 ? "очко" : "очков"
      } в ${stat}. Новое значение: ${
        currentStats[stat]
      }. Осталось очков: ${newUnspent}.`,
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
