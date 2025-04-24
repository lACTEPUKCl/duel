import {
  SlashCommandBuilder,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { duelModel } from "../models/duel.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";

function getSuccessRate(level) {
  if (level >= 9) return 0.1;
  switch (level) {
    case 0:
      return 0.9;
    case 1:
      return 0.8;
    case 2:
      return 0.7;
    case 3:
      return 0.6;
    case 4:
      return 0.5;
    case 5:
      return 0.4;
    case 6:
      return 0.3;
    case 7:
      return 0.2;
    case 8:
      return 0.15;
    default:
      return 0.1;
  }
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

    const successRate = getSuccessRate(chosenItem.enhance || 0);
    const roll = Math.random();
    let resultText;

    if (roll < successRate) {
      if (scrollIndex >= 0 && scrollIndex < inventory.length) {
        inventory.splice(scrollIndex, 1);
      }
      chosenItem.enhance = (chosenItem.enhance || 0) + 1;
      chosenItem.stats = chosenItem.stats || {};
      if (type === "weapon") {
        chosenItem.stats.damagePercentBonus =
          (chosenItem.stats.damagePercentBonus || 0) + 0.05;
      } else {
        chosenItem.stats.defensePercentBonus =
          (chosenItem.stats.defensePercentBonus || 0) + 0.05;
      }
      resultText = `✅ Успех! Ваше ${
        type === "weapon" ? "оружие" : "броня"
      } теперь +${chosenItem.enhance}.`;
    } else {
      resultText = `❌ Провал! Ваше ${
        type === "weapon" ? "оружие" : "броня"
      } было сломано.`;

      if (entry.source === "inventory") {
        const itemIndex = entry.index;
        [scrollIndex, itemIndex]
          .sort((a, b) => b - a)
          .forEach((i) => {
            if (i >= 0 && i < inventory.length) {
              inventory.splice(i, 1);
            }
          });
      } else {
        delete equipped[type];
        if (scrollIndex >= 0 && scrollIndex < inventory.length) {
          inventory.splice(scrollIndex, 1);
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
