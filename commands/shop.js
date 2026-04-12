import {
  SlashCommandBuilder,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} from "discord.js";
import { duelModel } from "../models/duel.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";
import { gameItems } from "../utils/gameItems.js";

export const shopItems = gameItems.filter((item) => item.canBeSold);

export const data = new SlashCommandBuilder()
  .setName("shop")
  .setDescription("Магазин улучшений — просмотр и покупка товаров");

export async function execute(interaction) {
  const userDoc = await checkUserBinding(interaction);
  if (!userDoc) return;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🛒 Магазин улучшений")
    .setDescription(`Ваш баланс: **${userDoc.bonuses || 0}** бонусов`)
    .addFields(
      shopItems.map((item) => ({
        name: `${item.name} — ${item.price} бонусов`,
        value: `${item.description}\n**Эффект:** ${item.stats}`,
        inline: false,
      }))
    );

  const selectMenu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("shop_buy")
      .setPlaceholder("Выберите товар")
      .addOptions(
        shopItems.map((item) => ({
          label: item.name,
          description: `${item.price} бонусов | ${item.stats.slice(0, 50)}`,
          value: item.id,
        }))
      )
  );

  await interaction.reply({
    embeds: [embed],
    components: [selectMenu],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleShopSelect(interaction) {
  if (!interaction.isStringSelectMenu() || interaction.customId !== "shop_buy")
    return;
  await interaction.deferUpdate();

  const itemId = interaction.values[0];
  const item = shopItems.find((i) => i.id === itemId);
  if (!item) {
    return interaction.followUp({
      content: "❌ Предмет не найден",
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");

    // Атомарная покупка: проверка баланса + списание + добавление в инвентарь за одну операцию
    const MAX_INVENTORY = 500;
    const result = await statsColl.findOneAndUpdate(
      {
        discordid: interaction.user.id,
        bonuses: { $gte: item.price },
        // Ограничение размера инвентаря
        $expr: {
          $lt: [
            { $size: { $ifNull: ["$duelGame.inventory", []] } },
            MAX_INVENTORY,
          ],
        },
      },
      {
        $inc: { bonuses: -item.price },
        $push: {
          "duelGame.inventory": {
            id: item.id,
            name: item.name,
            enhance: 0,
            stats: {
              damagePercentBonus: item.damagePercentBonus || 0,
              defensePercentBonus: item.defensePercentBonus || 0,
              accuracyBonus: item.accuracyBonus || 0,
              critChanceBonus: item.critChanceBonus || 0,
            },
          },
        },
      },
      { returnDocument: "after" }
    );

    if (!result.value) {
      // Определяем причину отказа
      const user = await statsColl.findOne({
        discordid: interaction.user.id,
      });
      if (!user || (user.bonuses || 0) < item.price) {
        return interaction.followUp({
          content: `❌ Недостаточно бонусов! Нужно: ${item.price}, у вас: ${
            user?.bonuses || 0
          }`,
          flags: MessageFlags.Ephemeral,
        });
      }
      return interaction.followUp({
        content: `❌ Инвентарь полон (макс. ${MAX_INVENTORY} предметов)!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle(`✅ Куплено: ${item.name}`)
      .addFields(
        { name: "Цена", value: `${item.price} бонусов`, inline: true },
        {
          name: "Баланс",
          value: `${result.value.bonuses}`,
          inline: true,
        },
        { name: "Эффект", value: item.stats, inline: false }
      );

    await interaction.followUp({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error("Ошибка покупки:", err);
    await interaction.followUp({
      content: "❌ Ошибка при покупке",
      flags: MessageFlags.Ephemeral,
    });
  }
}
