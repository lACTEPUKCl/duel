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

    const currentClass = (
      userData.duelGame.stats.class || "novice"
    ).toLowerCase();
    if (currentClass === "novice") {
      return interaction.reply({
        content:
          "❌ У вас ещё нет базового класса. Пожалуйста, выберите базовый класс командой /setclass.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const baseClasses = ["warrior", "mage", "archer"];
    let baseClass = currentClass;

    if (!baseClasses.includes(baseClass)) {
      for (const b of baseClasses) {
        const advMap = classes[b].advanced;
        for (const lvl of Object.keys(advMap)) {
          if (advMap[lvl].some((opt) => opt.id === currentClass)) {
            baseClass = b;
            break;
          }
        }
        if (baseClasses.includes(baseClass)) break;
      }
      if (!baseClasses.includes(baseClass)) {
        return interaction.reply({
          content:
            "❌ Не удалось определить ваш базовый класс. Обратитесь к администратору.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    const userLevel = userData.duelGame.level || 1;
    const advancedMapping = classes[baseClass].advanced;
    const thresholds = Object.keys(advancedMapping)
      .map(Number)
      .sort((a, b) => a - b);
    const reached = thresholds.filter((thr) => thr <= userLevel);

    if (reached.length === 0) {
      const next = thresholds[0];
      const missing = next - userLevel;
      return interaction.reply({
        content: `Для класса **${baseClass}** ваш уровень (${userLevel}) пока не позволяет продвижение. До уровня **${next}** не хватает **${missing}** ${
          missing === 1 ? "уровня" : "уровней"
        }.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const maxReached = Math.max(...reached);
    const availableAdvanced = advancedMapping[maxReached] || [];

    if (availableAdvanced.length === 0) {
      const future = thresholds.filter((thr) => thr > userLevel);
      if (future.length > 0) {
        const next = future[0];
        const missing = next - userLevel;
        return interaction.reply({
          content: `Для класса **${baseClass}** на уровне ${maxReached} продвижение не предусмотрено. До уровня **${next}** не хватает **${missing}** ${
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

    const msg = await interaction.reply({
      content: `Вы достигли уровня ${userLevel} и можете выбрать продвинутый класс:`,
      components: [row],
      flags: MessageFlags.Ephemeral,
      fetchReply: true,
    });

    const selection = await msg.awaitMessageComponent({
      filter: (i) =>
        i.customId === "changeclass_select" &&
        i.user.id === interaction.user.id,
      time: 60000,
    });

    const chosenId = selection.values[0];
    const chosen = availableAdvanced.find((opt) => opt.id === chosenId);
    if (!chosen) {
      return selection.update({
        content: "Ошибка: выбранный класс не найден.",
        components: [],
      });
    }

    await statsColl.updateOne(
      { discordid: interaction.user.id },
      { $set: { "duelGame.stats.class": chosenId } }
    );

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("Класс изменён")
      .setDescription(
        `Поздравляем! Вы стали **${chosen.name}**.\n${chosen.description}`
      );

    await selection.update({ content: null, embeds: [embed], components: [] });
  } catch (err) {
    console.error(err);
    return interaction.reply({
      content: "❌ Ошибка при обработке смены класса.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
