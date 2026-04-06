import {
  SlashCommandBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  AttachmentBuilder,
} from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { duelModel } from "../models/duel.js";
import { weapons } from "../config/duelConfig.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";
import { classes } from "../classes/classes.js";
import {
  getClassDefinition,
  getBaseClassId,
} from "../utils/classHelpers.js";
import { getEffectiveStat } from "../utils/combatMath.js";

export const data = new SlashCommandBuilder()
  .setName("duel")
  .setDescription("Вызвать участника на дуэль")
  .addUserOption((option) =>
    option.setName("противник").setDescription("Кого вызываем на дуэль")
  )
  .addIntegerOption((option) =>
    option
      .setName("ставка")
      .setDescription(
        "Сколько бонусов ставим (0 = без ставки, 1000 = максимум)"
      )
      .setMinValue(0)
      .setMaxValue(1000)
  );

export async function execute(interaction) {
  try {
    const userDoc = await checkUserBinding(interaction);
    if (!userDoc) return;

    const challengerId = interaction.user.id;
    const opponentOption = interaction.options.getUser("противник");
    const opponentId = opponentOption ? opponentOption.id : null;
    const betAmount = interaction.options.getInteger("ставка") || 0;
    const ALLOWED_CHANNEL = "1362879255293333524";

    if (interaction.channel.id !== ALLOWED_CHANNEL) {
      return interaction.reply({
        content: `❌ Эту команду можно использовать только в канале <#${ALLOWED_CHANNEL}>.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (opponentOption) {
      if (opponentOption.bot)
        return interaction.reply({
          content: "❌ Нельзя вызвать бота!",
          flags: MessageFlags.Ephemeral,
        });
      if (opponentId === challengerId)
        return interaction.reply({
          content: "❌ Нельзя вызвать самого себя!",
          flags: MessageFlags.Ephemeral,
        });
    }
    if (betAmount > 1000)
      return interaction.reply({
        content: "❌ Максимальная ставка - 1000 бонусов!",
        flags: MessageFlags.Ephemeral,
      });

    const existing = await duelModel.findPendingDuel(challengerId);
    if (existing)
      return interaction.reply({
        content: "❌ Вы уже участвуете в активной дуэли!",
        flags: MessageFlags.Ephemeral,
      });
    if (opponentOption) {
      const oppExisting = await duelModel.findPendingDuel(opponentId);
      if (oppExisting)
        return interaction.reply({
          content: `❌ ${opponentOption.username} уже участвует в другой дуэли!`,
          flags: MessageFlags.Ephemeral,
        });
    }

    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
    const challengerData = await statsColl.findOne({ discordid: challengerId });
    if (!challengerData?.duelGame)
      return interaction.reply({
        content:
          "❌ У вас нет созданного персонажа. Используйте `/createcharacter`.",
        flags: MessageFlags.Ephemeral,
      });

    const dg = challengerData.duelGame;
    const duelStats = dg.stats || {};
    const strength = getEffectiveStat(dg, "strength");
    const agility = getEffectiveStat(dg, "agility");
    const intelligence = getEffectiveStat(dg, "intelligence");
    const accuracy = getEffectiveStat(dg, "accuracy");
    const hp = getEffectiveStat(dg, "hp");
    const defense = getEffectiveStat(dg, "defense");
    const level = dg.level || 1;
    const classDef = getClassDefinition(duelStats.class);
    const className = classDef.name || duelStats.class || "—";

    const rawWeapon = challengerData.duelGame.equipped?.weapon;
    const weaponId = typeof rawWeapon === "string" ? rawWeapon : rawWeapon?.id;
    const weapon = weapons.find((w) => w.id === weaponId) || weapons[0];

    const statsStr =
      `⭐️ Уровень: ${level} (${className})\n` +
      `🔪 Оружие: ${weapon.name}\n` +
      `💪 Сила: ${strength}\n` +
      `🏃 Ловкость: ${agility}\n` +
      `🧠 Интеллект: ${intelligence}\n` +
      `🎯 Точность: ${accuracy}\n` +
      `❤️ HP: ${hp}\n` +
      `🛡 Защита: ${defense}`;

    const wins = challengerData.duelGame.duels?.wins || 0;
    const losses = challengerData.duelGame.duels?.losses || 0;
    const total = wins + losses;
    const winrate = total ? ((wins / total) * 100).toFixed(1) + "%" : "0%";
    const duelsStr = `🏆 Победы: ${wins}\n❌ Поражения: ${losses}\n📊 Винрейт: ${winrate}\n⚔️ Всего боёв: ${total}`;

    const attacker =
      interaction.guild.members.cache.get(challengerId) ||
      (await interaction.guild.members.fetch(challengerId));
    const attackerName = attacker.user.globalName || attacker.user.username;
    const opponentName = opponentOption
      ? interaction.guild.members.cache.get(opponentId)?.globalName ||
        opponentOption.username
      : "";
    const duelTitle = opponentOption
      ? `⚔️ ${attackerName} вызывает ${opponentName}!`
      : `⚔️ ${attackerName} начинает дуэль! (Любой может принять)`;

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(duelTitle)
      .addFields(
        { name: "📊 Статы участника", value: statsStr, inline: true },
        { name: "📈 Рекорд дуэлей", value: duelsStr, inline: true },
        {
          name: "💰 Ставка",
          value: betAmount ? `${betAmount} бонусов` : "Нет",
          inline: true,
        }
      );

    // Атачмент для иконки с fallback
    const baseClass = getBaseClassId(duelStats.class);
    let imageName = `${baseClass}_${weaponId}.png`;
    let filePath = path.join(__dirname, "..", "images", imageName);
    if (!fs.existsSync(filePath)) {
      imageName = `default_${weaponId}.png`;
      filePath = path.join(__dirname, "..", "images", imageName);
      if (!fs.existsSync(filePath)) {
        imageName = "default_weapon_basic.png";
        filePath = path.join(__dirname, "..", "images", imageName);
      }
    }
    const attachment = new AttachmentBuilder(filePath, { name: imageName });
    embed.setThumbnail(`attachment://${imageName}`);

    const acceptBtn = new ButtonBuilder()
      .setCustomId(`duel_accept_${interaction.id}`)
      .setLabel("Принять дуэль")
      .setStyle(ButtonStyle.Success);
    const cancelBtn = new ButtonBuilder()
      .setCustomId(`duel_cancel_${interaction.id}`)
      .setLabel("Отменить дуэль")
      .setStyle(ButtonStyle.Danger);

    const replyMsg = await interaction.reply({
      embeds: [embed],
      files: [attachment],
      components: [new ActionRowBuilder().addComponents(acceptBtn, cancelBtn)],
      fetchReply: true,
    });

    await duelModel.createDuel(
      interaction.id,
      challengerId,
      opponentId,
      betAmount,
      weaponId,
      replyMsg.id
    );
  } catch (err) {
    console.error("Ошибка в команде duel:", err);
    await interaction.reply({
      content: "❌ Произошла ошибка при создании дуэли",
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function handleDuelCancel(interaction) {
  try {
    const interactionId = interaction.customId.split("_").slice(2).join("_");
    await duelModel.connect();
    const duelsColl = duelModel.client.db("SquadJS").collection("duels");
    const duel = await duelsColl.findOne({ interactionId });
    if (!duel) {
      return interaction.reply({
        content: "❌ Дуэль не найдена.",
        flags: MessageFlags.Ephemeral,
      });
    }
    const userId = interaction.user.id;
    if (![duel.challengerId, duel.opponentId].includes(userId)) {
      return interaction.reply({
        content: "❌ Вы не участник этой дуэли.",
        flags: MessageFlags.Ephemeral,
      });
    }
    await duelsColl.deleteOne({ interactionId });
    await interaction.message.edit({ components: [] });
    return interaction.reply({
      content: "✅ Дуэль отменена.",
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error("Ошибка отмены дуэли:", err);
    return interaction.reply({
      content: "❌ Не удалось отменить дуэль.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
