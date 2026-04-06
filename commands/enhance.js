import {
  SlashCommandBuilder,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { duelModel } from "../models/duel.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";

function getSuccessRate(level) {
  // +0→+1: 90%, +1→+2: 80%, ..., +9→+10: 5%
  const rates = [0.9, 0.8, 0.7, 0.6, 0.5, 0.35, 0.25, 0.15, 0.1, 0.05];
  return rates[level] ?? 0.05;
}

/**
 * Определяет последствия провала заточки:
 *  +0..+2: safe — ничего не происходит (только свиток теряется)
 *  +3..+6: downgrade — уровень падает на 2
 *  +7..+9: destroy — предмет уничтожается
 */
function getFailResult(currentLevel) {
  if (currentLevel <= 2) return "safe";
  if (currentLevel <= 6) return "downgrade";
  return "destroy";
}

export const data = new SlashCommandBuilder()
  .setName("enhance")
  .setDescription(
    "Заточка вашего оружия или брони. Если заточка проваливается – предмет разрушается."
  )
  .addStringOption((option) =>
    option
      .setName("тип")
      .setDescription("Выберите, что заточить: оружие или броня")
      .setRequired(true)
      .addChoices(
        { name: "Оружие", value: "weapon" },
        { name: "Броня", value: "armor" }
      )
  );

export async function execute(interaction) {
  const userDoc = await checkUserBinding(interaction);
  if (!userDoc) return;

  const type = interaction.options.getString("тип");
  const { equipped = {}, inventory = [] } = userDoc.duelGame || {};

  const prefix = type === "weapon" ? "weapon_" : "armor_";
  const items = [];

  if (equipped[type]) {
    const eq = equipped[type];
    const id = typeof eq === "object" ? eq.id : eq;
    if (id.startsWith(prefix)) {
      items.push({
        source: "equipped",
        index: null,
        item: typeof eq === "object" ? eq : { id: eq, enhance: 0, stats: {} },
      });
    }
  }

  inventory.forEach((it, idx) => {
    const id = typeof it === "object" ? it.id : it;
    if (id.startsWith(prefix)) {
      items.push({
        source: "inventory",
        index: idx,
        item: typeof it === "object" ? it : { id: it, enhance: 0, stats: {} },
      });
    }
  });

  if (!items.length) {
    return interaction.reply({
      content: `У вас нет ${
        type === "weapon" ? "оружия" : "брони"
      } для заточки.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const options = items.map(({ source, index, item }) => ({
    label: `${item.name} +${item.enhance}`.slice(0, 25),
    description: (source === "equipped" ? "Экипировано" : "Инвентарь").slice(
      0,
      50
    ),
    value: JSON.stringify({ source, index }),
  }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("enhance_select")
    .setPlaceholder("Выберите предмет для заточки")
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(selectMenu);
  const replyMsg = await interaction.reply({
    content: "Выберите предмет для заточки:",
    components: [row],
    flags: MessageFlags.Ephemeral,
    fetchReply: true,
  });

  try {
    const selection = await replyMsg.awaitMessageComponent({
      filter: (i) =>
        i.customId === "enhance_select" && i.user.id === interaction.user.id,
      time: 60000,
    });

    const { source, index } = JSON.parse(selection.values[0]);
    const entry = items.find(
      (e) => e.source === source && (source === "equipped" || e.index === index)
    );
    if (!entry) {
      return selection.reply({
        content: "Предмет не найден.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const chosenItem = entry.item;
    const scrollName = type === "weapon" ? "scroll_weapon" : "scroll_armor";
    const scrollIndex = inventory.findIndex(
      (it) => typeof it === "object" && it.id === scrollName
    );
    if (scrollIndex === -1) {
      return selection.reply({
        content: `У вас нет свитка заточки для ${
          type === "weapon" ? "оружия" : "брони"
        }.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const currentEnhance = chosenItem.enhance || 0;
    const successRate = getSuccessRate(currentEnhance);
    const roll = Math.random();
    let resultText;

    // Свиток всегда расходуется
    if (scrollIndex >= 0 && scrollIndex < inventory.length) {
      inventory.splice(scrollIndex, 1);
    }

    if (roll < successRate) {
      // ═══ УСПЕХ ═══
      chosenItem.enhance = currentEnhance + 1;
      chosenItem.stats = chosenItem.stats || {};
      if (type === "weapon") {
        chosenItem.stats.damagePercentBonus =
          (chosenItem.stats.damagePercentBonus || 0) + 0.05;
      } else {
        chosenItem.stats.defensePercentBonus =
          (chosenItem.stats.defensePercentBonus || 0) + 0.05;
      }
      resultText =
        `✅ Успех! (шанс ${(successRate * 100).toFixed(0)}%) Ваше ` +
        `${type === "weapon" ? "оружие" : "броня"} теперь **+${chosenItem.enhance}**.`;
    } else {
      // ═══ ПРОВАЛ — тип наказания зависит от уровня ═══
      const failType = getFailResult(currentEnhance);

      if (failType === "safe") {
        // +0..+2: ничего не теряем, только свиток
        resultText =
          `⚠️ Провал! (шанс ${(successRate * 100).toFixed(0)}%) ` +
          `Свиток израсходован, но предмет цел. (Безопасная зона +0–+2)`;
      } else if (failType === "downgrade") {
        // +3..+6: уровень падает на 2
        const dropTo = Math.max(0, currentEnhance - 2);
        const lost = currentEnhance - dropTo;
        chosenItem.enhance = dropTo;
        // Откатываем статы
        if (type === "weapon") {
          chosenItem.stats.damagePercentBonus = Math.max(
            0,
            (chosenItem.stats.damagePercentBonus || 0) - 0.05 * lost
          );
        } else {
          chosenItem.stats.defensePercentBonus = Math.max(
            0,
            (chosenItem.stats.defensePercentBonus || 0) - 0.05 * lost
          );
        }
        resultText =
          `⚠️ Провал! (шанс ${(successRate * 100).toFixed(0)}%) ` +
          `${type === "weapon" ? "Оружие" : "Броня"} понизилось до **+${dropTo}**.`;
      } else {
        // +7..+9: УНИЧТОЖЕНИЕ
        resultText =
          `💥 Провал! (шанс ${(successRate * 100).toFixed(0)}%) Ваше ` +
          `${type === "weapon" ? "оружие" : "броня"} **уничтожено**!`;

        if (entry.source === "equipped") {
          delete equipped[type];
        } else {
          // Удаляем предмет из инвентаря (аккуратно с индексом)
          const itemIndex = entry.index;
          if (itemIndex >= 0 && itemIndex < inventory.length) {
            inventory.splice(itemIndex, 1);
          }
        }
      }
    }

    await duelModel.connect();

    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");

    await statsColl.updateOne(
      { discordid: interaction.user.id },
      {
        $set: {
          "duelGame.inventory": inventory,
          "duelGame.equipped": equipped,
        },
      }
    );

    await selection.update({ content: resultText, components: [] });
  } catch (err) {
    console.error(err);
    await interaction.followUp({
      content: "Время ожидания выбора истекло.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
