import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { duelModel } from "../models/duel.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";

export const data = new SlashCommandBuilder()
  .setName("resetbuild")
  .setDescription(
    "Сбросьте распределенные очки для перераспределения характеристик"
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

    const defaultStats = {
      strength: 10,
      agility: 10,
      intelligence: 10,
      accuracy: 10,
      hp: 100,
      defense: 10,
      class: "novice",
    };

    const cur = userDoc.duelGame.stats;
    const statFields = [
      "strength",
      "agility",
      "intelligence",
      "accuracy",
      "hp",
      "defense",
    ];
    const usedPoints = statFields.reduce((sum, field) => {
      const curVal = cur[field] || 0;
      const defVal = defaultStats[field];
      return sum + Math.max(0, curVal - defVal);
    }, 0);

    const newUnspent = usedPoints;

    await statsColl.updateOne(
      { discordid: interaction.user.id },
      {
        $set: {
          "duelGame.stats": defaultStats,
          "duelGame.unspentPoints": newUnspent,
        },
      }
    );

    return interaction.reply({
      content: `✅ Ваш билд сброшен. Возвращено ${usedPoints} очков для перераспределения.`,
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
