import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";
import { duelModel } from "../models/duel.js";

export async function checkUserBinding(interaction) {
  try {
    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
    const userDoc = await statsColl.findOne({ discordid: interaction.user.id });

    if (!userDoc) {
      await interaction.reply({
        content:
          "❌ Ваш аккаунт не привязан к Steam. Пожалуйста, привяжите его, нажав на кнопку ниже.",
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("SteamID")
              .setLabel("Привязать Steam")
              .setStyle(ButtonStyle.Success)
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return null;
    }

    return userDoc;
  } catch (err) {
    console.error("Ошибка при проверке привязки Steam:", err);
    await interaction.reply({
      content: "❌ Ошибка доступа к базе данных.",
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
}
