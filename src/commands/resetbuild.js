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

    let usedPoints = 0;
    const cur = userDoc.duelGame.stats;
    usedPoints += (cur.strength || 0) - defaultStats.strength;
    usedPoints += (cur.agility || 0) - defaultStats.agility;
    usedPoints += (cur.intelligence || 0) - defaultStats.intelligence;
    usedPoints += (cur.accuracy || 0) - defaultStats.accuracy;
    usedPoints += Math.max(0, (cur.hp || 0) - defaultStats.hp);
    usedPoints += Math.max(0, (cur.defense || 0) - defaultStats.defense);
    const newUnspent = (userDoc.duelGame.unspentPoints || 0) + usedPoints;

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
