import {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { duelModel } from "../models/duel.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";
import { recipes, materials } from "../config/craftingData.js";
import { progressDailyQuest } from "../services/dailyQuestsService.js";

export const data = new SlashCommandBuilder()
  .setName("craft")
  .setDescription("Создать предмет из материалов");

export async function execute(interaction) {
  const userDoc = await checkUserBinding(interaction);
  if (!userDoc) return;

  const inventory = userDoc.duelGame?.inventory || [];
  const balance = userDoc.bonuses || 0;

  // Подсчитываем материалы в инвентаре
  const matCounts = {};
  for (const item of inventory) {
    const id = typeof item === "object" ? item.id : item;
    if (materials.some((m) => m.id === id)) {
      const amt = typeof item === "object" ? item.amount || 1 : 1;
      matCounts[id] = (matCounts[id] || 0) + amt;
    }
  }

  // Формируем список рецептов с доступностью
  const options = recipes.map((r) => {
    const canCraft = r.ingredients.every(
      (ing) => (matCounts[ing.id] || 0) >= ing.amount
    ) && balance >= r.goldCost;

    const ingStr = r.ingredients
      .map((ing) => {
        const have = matCounts[ing.id] || 0;
        const ok = have >= ing.amount ? "✅" : "❌";
        return `${ok}${ing.id} ${have}/${ing.amount}`;
      })
      .join(", ");

    return {
      label: r.name.slice(0, 25),
      description: `${ingStr} | ${balance >= r.goldCost ? "✅" : "❌"}${r.goldCost}💰`.slice(0, 50),
      value: r.id,
    };
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("craft_select")
    .setPlaceholder("Выберите рецепт")
    .addOptions(options);
  const row = new ActionRowBuilder().addComponents(selectMenu);

  // Показываем материалы игрока
  const matStr = materials
    .map((m) => `${m.name}: **${matCounts[m.id] || 0}**`)
    .join(" | ");

  const replyMsg = await interaction.reply({
    content: `📦 Ваши материалы: ${matStr}\n💰 Баланс: **${balance}**\n\nВыберите рецепт:`,
    components: [row],
    flags: MessageFlags.Ephemeral,
    fetchReply: true,
  });

  try {
    const selection = await replyMsg.awaitMessageComponent({
      filter: (i) =>
        i.customId === "craft_select" && i.user.id === interaction.user.id,
      time: 60000,
    });

    const recipeId = selection.values[0];
    const recipe = recipes.find((r) => r.id === recipeId);
    if (!recipe) {
      return selection.update({ content: "Рецепт не найден.", components: [] });
    }

    // Перечитываем данные (anti-race)
    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
    const fresh = await statsColl.findOne({ discordid: interaction.user.id });
    const freshInv = fresh.duelGame?.inventory || [];
    const freshBalance = fresh.bonuses || 0;

    // Проверяем золото
    if (freshBalance < recipe.goldCost) {
      return selection.update({
        content: `❌ Недостаточно золота. Нужно: ${recipe.goldCost}, есть: ${freshBalance}`,
        components: [],
      });
    }

    // Проверяем и списываем материалы
    const newInv = [...freshInv];
    for (const ing of recipe.ingredients) {
      let needed = ing.amount;
      for (let i = newInv.length - 1; i >= 0 && needed > 0; i--) {
        const item = newInv[i];
        const itemId = typeof item === "object" ? item.id : item;
        if (itemId !== ing.id) continue;

        const itemAmt = typeof item === "object" ? item.amount || 1 : 1;
        if (itemAmt <= needed) {
          needed -= itemAmt;
          newInv.splice(i, 1);
        } else {
          item.amount -= needed;
          needed = 0;
        }
      }
      if (needed > 0) {
        return selection.update({
          content: `❌ Недостаточно ${ing.id}. Не хватает: ${needed}`,
          components: [],
        });
      }
    }

    // Добавляем результат
    newInv.push({ ...recipe.result });

    // Сохраняем
    await statsColl.updateOne(
      { discordid: interaction.user.id },
      {
        $set: { "duelGame.inventory": newInv },
        $inc: { bonuses: -recipe.goldCost },
      }
    );

    // Дейлик
    await progressDailyQuest(interaction.user.id, "shop_buys", 1);

    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle(`⚒️ Создано: ${recipe.result.name}`)
      .setDescription(
        recipe.ingredients
          .map((ing) => {
            const mat = materials.find((m) => m.id === ing.id);
            return `${mat?.name || ing.id} × ${ing.amount}`;
          })
          .join("\n") +
        `\n💰 −${recipe.goldCost} бонусов`
      );

    await selection.update({ content: null, embeds: [embed], components: [] });
  } catch (err) {
    console.error(err);
    await interaction.followUp({
      content: "Время ожидания выбора истекло.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
