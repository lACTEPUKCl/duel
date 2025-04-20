import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { duelModel } from "../models/duel.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";
import { awardXP } from "./leveling.js";
export const data = new SlashCommandBuilder()
  .setName("farm")
  .setDescription("Начать или закончить фарм опыта (XP)");

export async function execute(interaction) {
  const userDoc = await checkUserBinding(interaction);
  if (!userDoc) return;

  await duelModel.connect();
  const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
  const user = await statsColl.findOne({ discordid: interaction.user.id });
  const now = Date.now();
  const farmStart = user.duelGame?.farmStart;

  if (!farmStart) {
    const embed = new EmbedBuilder()
      .setTitle("Фарм опыта")
      .setDescription("Нажмите «Начать фарм», чтобы начать копить опыт.")
      .setColor(0x3498db);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("farm_start")
        .setLabel("Начать фарм")
        .setStyle(ButtonStyle.Success)
    );
    return interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  } else {
    const elapsedMin = Math.floor((now - farmStart) / 60000);
    const embed = new EmbedBuilder()
      .setTitle("Фарм опыта")
      .setDescription(
        `Вы уже фармите **${elapsedMin}** мин. Нажмите «Закончить фарм», чтобы получить опыт.`
      )
      .setColor(0x3498db);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("farm_end")
        .setLabel("Закончить фарм")
        .setStyle(ButtonStyle.Primary)
    );
    return interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function handleFarmButton(interaction) {
  try {
    const userDoc = await checkUserBinding(interaction);
    if (!userDoc) return;

    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
    const user = await statsColl.findOne({ discordid: interaction.user.id });
    const now = Date.now();
    const farmStart = user.duelGame?.farmStart;

    if (interaction.customId === "farm_start") {
      if (farmStart) {
        return interaction.reply({
          content: "Вы уже фармите.",
          flags: MessageFlags.Ephemeral,
        });
      }
      await statsColl.updateOne(
        { discordid: interaction.user.id },
        { $set: { "duelGame.farmStart": now } }
      );
      return interaction.update({
        content: "Вы начали фарм опыта.",
        components: [],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.customId === "farm_end") {
      if (!farmStart) {
        return interaction.reply({
          content: "Вы ещё не начали фарм.",
          flags: MessageFlags.Ephemeral,
        });
      }

      await statsColl.updateOne(
        { discordid: interaction.user.id },
        { $unset: { "duelGame.farmStart": "" } }
      );

      const elapsedMin = Math.floor((now - farmStart) / 60000);
      const XP_PER_MINUTE = 1;
      const xpGain = elapsedMin * XP_PER_MINUTE;
      const oldLevel = user.duelGame.level || 1;

      const {
        level: newLevel,
        xp: leftoverXp,
        unspentPoints,
      } = await awardXP(interaction.user.id, xpGain);

      let levelText;
      if (newLevel > oldLevel) {
        levelText = `🎉 Поздравляю, вы повысились до **${newLevel}** уровня!`;
      } else {
        levelText = `Ваш уровень остался **${newLevel}**.`;
      }

      return interaction.update({
        content:
          `Вы завершили фарм **${elapsedMin}** мин и получили **${xpGain}** XP.\n` +
          `${levelText} Остаток XP: **${leftoverXp}**, нераспределённых очков: **${unspentPoints}**.`,
        components: [],
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (err) {
    console.error(err);
    return interaction.reply({
      content: "Ошибка при фарме.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
