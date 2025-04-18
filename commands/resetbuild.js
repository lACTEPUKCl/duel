import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { duelModel } from "../models/duel.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";

export const data = new SlashCommandBuilder()
  .setName("resetbuild")
  .setDescription(
    "Сбросьте распределенные очки, очки для распределения будут равны уровень × 5"
  );

export async function execute(interaction) {
  const userDoc = await checkUserBinding(interaction);
  if (!userDoc) return;

  try {
    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");

    if (!userDoc.duelGame) {
      return interaction.reply({
        content: "❌ Персонаж не создан. Используйте /createcharacter.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const level = userDoc.duelGame.level || 1;

    const defaultStats = {
      strength: 10,
      agility: 10,
      intelligence: 10,
      accuracy: 10,
      hp: 100,
      defense: 10,
      class: "novice",
    };

    const unspentPoints = level * 5;

    await statsColl.updateOne(
      { discordid: interaction.user.id },
      {
        $set: {
          "duelGame.stats": defaultStats,
          "duelGame.unspentPoints": unspentPoints,
        },
      }
    );

    return interaction.reply({
      content: `✅ Ваш билд сброшен. У вас теперь ${unspentPoints} очков для распределения.`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error(err);
    return interaction.reply({
      content: "❌ Ошибка при сбросе характеристик.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
