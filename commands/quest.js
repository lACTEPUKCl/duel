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
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const questsData = JSON.parse(
  readFileSync(join(__dirname, "../quests.json"), "utf8")
);
const quests = questsData.quests;

export const data = new SlashCommandBuilder()
  .setName("quest")
  .setDescription(
    "Управляйте квестами: получите новое задание или смотрите статус активного квеста"
  );

export async function execute(interaction) {
  const userDoc = await checkUserBinding(interaction);
  if (!userDoc) return;

  try {
    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
    const user = await statsColl.findOne({ discordid: interaction.user.id });
    const now = Date.now();
    const activeQuest = user.duelGame.activeQuest;

    if (!activeQuest) {
      const quest = quests[Math.floor(Math.random() * quests.length)];
      const newQuest = {
        questId: quest.id,
        description: quest.description,
        duration: quest.duration,
        success: quest.success,
        acceptedAt: null,
      };

      await statsColl.updateOne(
        { discordid: interaction.user.id },
        { $set: { "duelGame.activeQuest": newQuest } }
      );

      const embed = new EmbedBuilder()
        .setTitle("Новый квест!")
        .setDescription(newQuest.description)
        .addFields(
          {
            name: "Время выполнения",
            value: `${newQuest.duration / 3600000} ч.`,
            inline: true,
          },
          {
            name: "Награда",
            value: `XP: ${newQuest.success.xp}`,
            inline: true,
          }
        )
        .setColor(0x3498db);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("quest_accept")
          .setLabel("Принять")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("quest_decline")
          .setLabel("Отказаться")
          .setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (activeQuest.acceptedAt === null) {
      const embed = new EmbedBuilder()
        .setTitle("Предложение квеста")
        .setDescription(activeQuest.description)
        .addFields(
          {
            name: "Время выполнения",
            value: `${activeQuest.duration / 3600000} ч.`,
            inline: true,
          },
          {
            name: "Награда",
            value: `XP: ${activeQuest.success.xp}`,
            inline: true,
          }
        )
        .setColor(0x3498db);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("quest_accept")
          .setLabel("Принять")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("quest_decline")
          .setLabel("Отказаться")
          .setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    }

    const finishTime = activeQuest.acceptedAt + activeQuest.duration;
    if (now < finishTime) {
      const remainingMinutes = Math.ceil((finishTime - now) / 60000);
      return interaction.reply({
        content: `Вы находитесь на квесте: "${activeQuest.description}". Осталось ~${remainingMinutes} мин.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const { xp, loot } = activeQuest.success;
    const dropped = loot.filter((item) => Math.random() <= item.chance);

    const updateOps = { $inc: { "duelGame.xp": xp } };
    if (dropped.length) {
      updateOps.$push = { "duelGame.inventory": { $each: dropped } };
    }
    await statsColl.updateOne({ discordid: interaction.user.id }, updateOps);

    const resultEmbed = new EmbedBuilder()
      .setTitle("Квест завершён!")
      .setDescription(activeQuest.description)
      .addFields({ name: "Получено XP", value: `${xp}`, inline: true })
      .setColor(0x2ecc71);

    if (dropped.length) {
      resultEmbed.addFields({
        name: "Выпало предметов",
        value: dropped.map((d) => d.name).join(", "),
        inline: false,
      });
    } else {
      resultEmbed.addFields({
        name: "Выпало предметов",
        value: "Ничего",
        inline: false,
      });
    }

    const nextQuest = quests[Math.floor(Math.random() * quests.length)];
    const newQuest = {
      questId: nextQuest.id,
      description: nextQuest.description,
      duration: nextQuest.duration,
      success: nextQuest.success,
      acceptedAt: null,
    };
    await statsColl.updateOne(
      { discordid: interaction.user.id },
      { $set: { "duelGame.activeQuest": newQuest } }
    );

    const questEmbed = new EmbedBuilder()
      .setTitle("Новый квест!")
      .setDescription(newQuest.description)
      .addFields(
        {
          name: "Время выполнения",
          value: `${newQuest.duration / 3600000} ч.`,
          inline: true,
        },
        {
          name: "Награда",
          value: `XP: ${newQuest.success.xp}`,
          inline: true,
        }
      )
      .setColor(0x3498db);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("quest_accept")
        .setLabel("Принять")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("quest_decline")
        .setLabel("Отказаться")
        .setStyle(ButtonStyle.Danger)
    );

    return interaction.reply({
      embeds: [resultEmbed, questEmbed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error(err);
    return interaction.reply({
      content: "Ошибка при обработке квеста.",
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function handleButton(interaction) {
  try {
    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
    const user = await statsColl.findOne({ discordid: interaction.user.id });
    if (!user?.duelGame.activeQuest) {
      return interaction.reply({
        content: "У вас нет активного квеста.",
        flags: MessageFlags.Ephemeral,
      });
    }
    const activeQuest = user.duelGame.activeQuest;
    const now = Date.now();

    if (interaction.customId === "quest_accept") {
      if (activeQuest.acceptedAt !== null) {
        return interaction.reply({
          content: "Квест уже принят.",
          flags: MessageFlags.Ephemeral,
        });
      }
      activeQuest.acceptedAt = now;
      await statsColl.updateOne(
        { discordid: interaction.user.id },
        { $set: { "duelGame.activeQuest": activeQuest } }
      );
      return interaction.update({
        content: `Квест "${activeQuest.description}" принят!`,
        components: [],
        flags: MessageFlags.Ephemeral,
      });
    } else if (interaction.customId === "quest_decline") {
      await statsColl.updateOne(
        { discordid: interaction.user.id },
        { $unset: { "duelGame.activeQuest": "" } }
      );
      return interaction.update({
        content: "Вы отказались от квеста. Можете взять новый через /quest.",
        components: [],
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      content: "Неизвестное действие.",
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error(err);
    return interaction.reply({
      content: "Ошибка при обработке кнопки квеста.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
