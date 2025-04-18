import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { duelModel } from "../models/duel.js";
import { classes } from "../classes/classes.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";

export const data = new SlashCommandBuilder()
  .setName("changeclass")
  .setDescription(
    "Выберите продвинутый класс для вашего персонажа на основе вашего уровня."
  );

export async function execute(interaction) {
  const userDoc = await checkUserBinding(interaction);
  if (!userDoc) return;

  try {
    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");

    const userData = await statsColl.findOne({
      discordid: interaction.user.id,
    });
    if (!userData) {
      return interaction.reply({
        content: "❌ Пользователь не найден.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const baseClasses = ["warrior", "mage", "archer"];
    const currentClass = (
      userData.duelGame?.stats.class || "novice"
    ).toLowerCase();
    let baseClass = userData.duelGame?.stats.class;

    if (!baseClass) {
      if (baseClasses.includes(currentClass)) {
        baseClass = currentClass;
      } else {
        for (const b of baseClasses) {
          for (const level in classes[b].advanced) {
            if (
              classes[b].advanced[level].some((opt) => opt.id === currentClass)
            ) {
              baseClass = b;
              break;
            }
          }
          if (baseClass) break;
        }
        if (!baseClass) {
          return interaction.reply({
            content:
              "Вы уже имеете продвинутый класс, и базовый класс не определён.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    }

    const userLevel = userData.duelGame?.level || 1;
    const advancedMapping = classes[baseClass].advanced;
    const allThresholds = Object.keys(advancedMapping)
      .map(Number)
      .sort((a, b) => a - b);
    const reached = allThresholds.filter((thr) => thr <= userLevel);

    if (reached.length === 0) {
      const nextThreshold = allThresholds[0];
      const missing = nextThreshold - userLevel;
      return interaction.reply({
        content: `Для класса **${baseClass}** ваш уровень (${userLevel}) пока не позволяет продвижение. До уровня **${nextThreshold}** не хватает **${missing}** ${
          missing === 1 ? "уровня" : "уровней"
        }.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const maxReached = Math.max(...reached);
    const availableAdvanced = advancedMapping[maxReached] || [];
    if (availableAdvanced.length === 0) {
      const higher = allThresholds.filter((thr) => thr > userLevel);
      if (higher.length > 0) {
        const nextThreshold = higher[0];
        const missing = nextThreshold - userLevel;
        return interaction.reply({
          content: `Для класса **${baseClass}** на уровне ${maxReached} продвижение не предусмотрено. До уровня **${nextThreshold}** не хватает **${missing}** ${
            missing === 1 ? "уровня" : "уровней"
          }.`,
          flags: MessageFlags.Ephemeral,
        });
      } else {
        return interaction.reply({
          content: `Для класса **${baseClass}** на уровне ${maxReached} продвижение больше не предусмотрено.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    const options = availableAdvanced.map((opt) => ({
      label: opt.name.slice(0, 25),
      description: opt.description.slice(0, 50),
      value: opt.id,
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("changeclass_select")
      .setPlaceholder("Выберите продвинутый класс")
      .addOptions(options);
    const row = new ActionRowBuilder().addComponents(selectMenu);

    const replyMsg = await interaction.reply({
      content: `Вы достигли уровня ${userLevel} и можете выбрать продвинутый класс:`,
      components: [row],
      flags: MessageFlags.Ephemeral,
      fetchReply: true,
    });

    const selection = await replyMsg.awaitMessageComponent({
      filter: (i) =>
        i.customId === "changeclass_select" &&
        i.user.id === interaction.user.id,
      time: 60000,
    });

    const chosenClass = selection.values[0];
    const chosenOption = availableAdvanced.find(
      (opt) => opt.id === chosenClass
    );
    if (!chosenOption) {
      return selection.update({
        content: "Ошибка: выбранный класс не найден.",
        components: [],
      });
    }

    await statsColl.updateOne(
      { discordid: interaction.user.id },
      { $set: { "duelGame.stats.class": chosenClass } }
    );

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("Класс изменён")
      .setDescription(
        `Поздравляем! Вы стали **${chosenOption.name}**.
${chosenOption.description}`
      );

    await selection.update({
      content: "Класс успешно изменён.",
      embeds: [embed],
      components: [],
    });
  } catch (err) {
    console.error(err);
    return interaction.reply({
      content: "Ошибка при обработке смены класса.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
