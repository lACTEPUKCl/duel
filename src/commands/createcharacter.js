import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { duelModel } from "../models/duel.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";

export const data = new SlashCommandBuilder()
  .setName("createcharacter")
  .setDescription("Создать нового персонажа");

export async function execute(interaction) {
  const userDoc = await checkUserBinding(interaction);
  if (!userDoc) return;

  if (userDoc.duelGame) {
    return interaction.reply({
      content: "✅ Ваш персонаж уже создан.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle("Создание персонажа")
    .setDescription("Выберите класс для вашего персонажа:")
    .addFields(
      {
        name: "Warrior",
        value: "Базовый воин, владеющий физическим боем. Сильный и выносливый.",
      },
      {
        name: "Mage",
        value:
          "Базовый маг, владеющий заклинаниями. Обладает высоким интеллектом.",
      },
      {
        name: "Archer",
        value: "Базовый стрелок, мастер дальнего боя. Имеет отличную ловкость.",
      }
    )
    .setColor(0x3498db);

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("createchar_select")
    .setPlaceholder("Выберите класс для персонажа")
    .addOptions([
      { label: "Warrior", description: "Базовый воин", value: "warrior" },
      { label: "Mage", description: "Базовый маг", value: "mage" },
      { label: "Archer", description: "Базовый стрелок", value: "archer" },
    ]);
  const row = new ActionRowBuilder().addComponents(selectMenu);

  const replyMsg = await interaction.reply({
    content: "Выберите класс для создания персонажа:",
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral,
    fetchReply: true,
  });

  try {
    const selection = await replyMsg.awaitMessageComponent({
      filter: (i) =>
        i.customId === "createchar_select" && i.user.id === interaction.user.id,
      time: 60000,
    });
    const chosenClass = selection.values[0];

    const defaultDuelGame = {
      level: 1,
      xp: 0,
      unspentPoints: 5,
      stats: {
        strength: 10,
        agility: 10,
        intelligence: 10,
        accuracy: 10,
        hp: 100,
        defense: 10,
        class: chosenClass,
      },
      duels: { wins: 0, losses: 0 },
    };

    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
    await statsColl.updateOne(
      { discordid: interaction.user.id },
      { $set: { duelGame: defaultDuelGame } }
    );

    await selection.update({
      content: `✅ Персонаж создан! Вы выбрали класс: **${chosenClass}**.`,
      embeds: [],
      components: [],
    });
  } catch (err) {
    console.error(err);
    await interaction.followUp({
      content: "❌ Время ожидания выбора истекло или произошла ошибка.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
