import {
  SlashCommandBuilder,
  MessageFlags,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { duelModel } from "../models/duel.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";
import { gameItems } from "../utils/gameItems.js";

function getItemName(id) {
  const item = gameItems.find((i) => i.id === id);
  return item ? item.name : id;
}

export const data = new SlashCommandBuilder()
  .setName("use")
  .setDescription(
    "Используйте предмет из инвентаря: зелье или экипируйте оружие/броню"
  )
  .addStringOption((option) =>
    option
      .setName("item")
      .setDescription("Выберите действие или тип предмета")
      .setRequired(true)
      .addChoices(
        { name: getItemName("potion_damage"), value: "potion_damage" },
        { name: getItemName("potion_defense"), value: "potion_defense" },
        { name: "Экипировать оружие", value: "weapon" },
        { name: "Экипировать броню", value: "armor" }
      )
  );

export async function execute(interaction) {
  const userDoc = await checkUserBinding(interaction);
  if (!userDoc) return;

  const chosenItem = interaction.options.getString("item");

  try {
    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
    const user = await statsColl.findOne({ discordid: interaction.user.id });
    let inventory = user.duelGame.inventory || [];
    let activeEffects = user.duelGame.activeEffects || {};
    let equipped = user.duelGame.equipped || {};

    if (chosenItem === "potion_damage" || chosenItem === "potion_defense") {
      const itemName = getItemName(chosenItem);

      if (activeEffects[chosenItem]?.remaining > 0) {
        return interaction.reply({
          content: `Вы уже используете ${itemName}.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      const potionIndex = inventory.findIndex((item) =>
        typeof item === "object" ? item.id === chosenItem : item === chosenItem
      );
      if (potionIndex === -1) {
        return interaction.reply({
          content: `У вас нет ${itemName} в инвентаре.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      inventory.splice(potionIndex, 1);
      activeEffects[chosenItem] = { remaining: 5 };
      await statsColl.updateOne(
        { discordid: interaction.user.id },
        {
          $set: {
            "duelGame.inventory": inventory,
            "duelGame.activeEffects": activeEffects,
          },
        }
      );
      return interaction.reply({
        content: `Вы использовали ${itemName}. Оно будет действовать на 5 дуэлей.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (chosenItem === "weapon" || chosenItem === "armor") {
      const itemPrefix = chosenItem === "weapon" ? "weapon_" : "armor_";
      const equipmentOptions = [];

      inventory.forEach((invItem, idx) => {
        let id,
          enhanceLevel = 0;
        if (typeof invItem === "string") {
          id = invItem;
        } else {
          id = invItem.id;
          enhanceLevel = invItem.enhance || 0;
        }
        if (id.startsWith(itemPrefix)) {
          const name = getItemName(id);
          const label = enhanceLevel ? `${name} +${enhanceLevel}` : name;
          equipmentOptions.push({
            label: label.slice(0, 25),
            description: "Инвентарь",
            value: JSON.stringify({ index: idx }),
          });
        }
      });

      if (equipmentOptions.length === 0) {
        return interaction.reply({
          content: `У вас нет подходящей экипировки (${chosenItem}) в инвентаре.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("use_equip_select")
        .setPlaceholder("Выберите предмет для экипировки")
        .addOptions(equipmentOptions);
      const row = new ActionRowBuilder().addComponents(selectMenu);

      const selectReply = await interaction.reply({
        content: "Выберите предмет для экипировки:",
        components: [row],
        flags: MessageFlags.Ephemeral,
        fetchReply: true,
      });

      try {
        const selection = await selectReply.awaitMessageComponent({
          filter: (i) =>
            i.customId === "use_equip_select" &&
            i.user.id === interaction.user.id,
          time: 60000,
        });
        const { index } = JSON.parse(selection.values[0]);
        const chosenEquipment = inventory[index];
        const prevEquipped = equipped[chosenItem];

        if (prevEquipped) {
          inventory.push(prevEquipped);
        }

        inventory.splice(index, 1);
        equipped[chosenItem] = chosenEquipment;

        await statsColl.updateOne(
          { discordid: interaction.user.id },
          {
            $set: {
              "duelGame.inventory": inventory,
              "duelGame.equipped": equipped,
            },
          }
        );

        const equipName = getItemName(
          typeof chosenEquipment === "string"
            ? chosenEquipment
            : chosenEquipment.id
        );
        return selection.update({
          content:
            `Вы экипировали ${equipName}.` +
            (prevEquipped
              ? ` Предыдущее было возвращено в инвентарь: ${getItemName(
                  typeof prevEquipped === "string"
                    ? prevEquipped
                    : prevEquipped.id
                )}.`
              : ""),
          components: [],
        });
      } catch (e) {
        console.error(e);
        return interaction.followUp({
          content: "Время ожидания выбора истекло.",
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    return interaction.reply({
      content: "Неизвестный тип предмета.",
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error(err);
    return interaction.reply({
      content: "Ошибка при использовании предмета.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
