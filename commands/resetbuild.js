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

    // Авто-рост HP и defense из leveling (с учётом капов)
    const { LEVEL_UP_AUTO_STATS, STAT_CAPS, PROGRESSION } = await import(
      "../config/balanceConfig.js"
    );
    const autoHp = Math.min(
      100 + (level - 1) * LEVEL_UP_AUTO_STATS.hp,
      STAT_CAPS.hp
    );
    const autoDef = Math.min(
      10 + (level - 1) * LEVEL_UP_AUTO_STATS.defense,
      STAT_CAPS.defense
    );

    const defaultStats = {
      strength: 10,
      agility: 10,
      intelligence: 10,
      accuracy: 10,
      hp: autoHp,
      defense: autoDef,
      class: userDoc.duelGame.stats.class || "novice",
    };

    const unspentPoints = level * PROGRESSION.pointsPerLevel;

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
