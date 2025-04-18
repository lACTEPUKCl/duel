import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { duelModel } from "../models/duel.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";

export const data = new SlashCommandBuilder()
  .setName("setclass")
  .setDescription("Установите новый класс для вашего персонажа")
  .addStringOption((option) =>
    option
      .setName("класс")
      .setDescription("Выберите класс")
      .setRequired(true)
      .addChoices(
        { name: "Warrior", value: "warrior" },
        { name: "Mage", value: "mage" },
        { name: "Archer", value: "archer" }
      )
  );

export async function execute(interaction) {
  const userDoc = await checkUserBinding(interaction);
  if (!userDoc) return;

  const chosenClass = interaction.options.getString("класс").toLowerCase();

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

    const currentClass = userData.duelGame?.stats.class;
    if (currentClass && currentClass !== "novice") {
      return interaction.reply({
        content: "❌ Вы уже выбрали класс.",
        flags: MessageFlags.Ephemeral,
      });
    }

    await statsColl.updateOne(
      { discordid: interaction.user.id },
      { $set: { "duelGame.stats.class": chosenClass } }
    );

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("Класс изменён")
      .setDescription(`Поздравляем! Ваш новый класс: **${chosenClass}**`);

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } catch (err) {
    console.error(err);
    await interaction.reply({
      content: "❌ Ошибка при смене класса.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
