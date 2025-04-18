import {
  SlashCommandBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { duelModel } from "../models/duel.js";
import { weapons } from "../config/duelConfig.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";
import { classes } from "../classes/classes.js";

function getClassDefinition(classId) {
  if (classes[classId]) return classes[classId];
  for (const baseKey of Object.keys(classes)) {
    const adv = classes[baseKey].advanced;
    for (const lvl of Object.keys(adv)) {
      const found = adv[lvl].find((o) => o.id === classId);
      if (found) return found;
    }
  }
  return { statMultipliers: {} };
}

function getEffectiveStat(statsObj, key) {
  const base = statsObj[key] || 0;
  const classId = statsObj.class;
  const classDef = getClassDefinition(classId);
  const mult = classDef.statMultipliers?.[key] ?? 0;
  const bonus = Math.floor(base * mult);
  return base + bonus;
}

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
      if (opponentOption.bot) {
        return interaction.reply({
          content: "❌ Нельзя вызвать бота!",
          flags: MessageFlags.Ephemeral,
        });
      }
      if (opponentId === challengerId) {
        return interaction.reply({
          content: "❌ Нельзя вызвать самого себя!",
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    if (betAmount > 1000) {
      return interaction.reply({
        content: "❌ Максимальная ставка - 1000 бонусов!",
        flags: MessageFlags.Ephemeral,
      });
    }

    const existing = await duelModel.findPendingDuel(challengerId);
    if (existing) {
      return interaction.reply({
        content: "❌ Вы уже участвуете в активной дуэли!",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (opponentOption) {
      const oppExisting = await duelModel.findPendingDuel(opponentId);
      if (oppExisting) {
        return interaction.reply({
          content: `❌ ${opponentOption.username} уже участвует в другой дуэли!`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
    const challengerData = await statsColl.findOne({ discordid: challengerId });

    if (!challengerData?.duelGame) {
      return interaction.reply({
        content:
          "❌ У вас нет созданного персонажа. Используйте команду `/createcharacter`, чтобы создать своего героя.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const duelStats = challengerData.duelGame.stats || {};
    const strength = getEffectiveStat(duelStats, "strength");
    const agility = getEffectiveStat(duelStats, "agility");
    const intelligence = getEffectiveStat(duelStats, "intelligence");
    const accuracy = getEffectiveStat(duelStats, "accuracy");
    const hp = getEffectiveStat(duelStats, "hp");
    const defense = getEffectiveStat(duelStats, "defense");
    const level = challengerData.duelGame.level || 1;
    const className = classes[duelStats.class]?.name || duelStats.class || "—";
    const weaponId = challengerData.duelGame.equipped?.weapon;
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
    const duelsStr =
      `🏆 Победы: ${wins}\n` +
      `❌ Поражения: ${losses}\n` +
      `📊 Винрейт: ${winrate}\n` +
      `⚔️ Всего боёв: ${total}`;
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
      )
      .setThumbnail(weapon.image || null);

    const button = new ButtonBuilder()
      .setCustomId(`duel_accept_${interaction.id}`)
      .setLabel("Принять дуэль")
      .setStyle(ButtonStyle.Success);

    const replyMsg = await interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(button)],
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
