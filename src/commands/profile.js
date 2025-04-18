import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { duelModel } from "../models/duel.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";
import { classes } from "../classes/classes.js";

export const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription(
    "Показать информацию о вашем персонаже или другого пользователя"
  )
  .addUserOption((option) =>
    option
      .setName("пользователь")
      .setDescription("Укажите пользователя для просмотра его профиля")
      .setRequired(false)
  );

function getClassDefinition(classId) {
  if (classes[classId]) return classes[classId];
  for (const baseKey of Object.keys(classes)) {
    const adv = classes[baseKey].advanced;
    for (const lvl of Object.keys(adv)) {
      const found = adv[lvl].find((o) => o.id === classId);
      if (found) return found;
    }
  }
  return null;
}

export async function execute(interaction) {
  const targetUser =
    interaction.options.getUser("пользователь") || interaction.user;

  const userDoc = await checkUserBinding(interaction, targetUser.id);
  if (!userDoc) return;

  try {
    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");

    const userData = await statsColl.findOne({ discordid: targetUser.id });
    if (!userData?.duelGame) {
      return interaction.reply({
        content:
          targetUser.id === interaction.user.id
            ? "У вас ещё нет созданного персонажа. Используйте `/createcharacter`."
            : "У этого пользователя нет созданного персонажа.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const {
      level = 0,
      xp = 0,
      stats = {},
      duels = {},
      equipped = {},
    } = userData.duelGame;

    const classId = stats.class;
    const classDef = getClassDefinition(classId) || {
      statMultipliers: {},
      name: classId,
    };
    const multipliers = classDef.statMultipliers || {};
    const className = classDef.name || classId || "—";
    const characterStats = { ...stats };
    delete characterStats.class;
    const finalStats = {};
    for (const [key, baseVal] of Object.entries(characterStats)) {
      const base = baseVal || 0;
      const mult = multipliers[key] || 0;
      const bonus = Math.floor(base * mult);
      finalStats[key] = base + bonus;
    }
    const w = typeof equipped.weapon === "object" ? equipped.weapon : {};
    const a = typeof equipped.armor === "object" ? equipped.armor : {};
    if (finalStats.accuracy !== undefined && w.stats?.accuracyBonus) {
      finalStats.accuracy += Math.floor(
        finalStats.accuracy * w.stats.accuracyBonus
      );
    }
    if (finalStats.defense !== undefined && a.stats?.defensePercentBonus) {
      finalStats.defense += Math.floor(
        finalStats.defense * a.stats.defensePercentBonus
      );
    }

    const statsField = Object.entries(finalStats)
      .map(([k, v]) => `**${k[0].toUpperCase() + k.slice(1)}**: ${v}`)
      .join("\n");

    const weaponLabel = equipped.weapon
      ? typeof equipped.weapon === "string"
        ? equipped.weapon
        : `${equipped.weapon.name} +${equipped.weapon.enhance || 0}`
      : "—";
    const armorLabel = equipped.armor
      ? typeof equipped.armor === "string"
        ? equipped.armor
        : `${equipped.armor.name} +${equipped.armor.enhance || 0}`
      : "—";

    const dmgPct = (w.stats?.damagePercentBonus || 0) * 100;
    const critPct = (w.stats?.critChanceBonus || 0) * 100;
    const accPct = (w.stats?.accuracyBonus || 0) * 100;
    const defPct = (a.stats?.defensePercentBonus || 0) * 100;

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`Профиль ${targetUser.username}`)
      .addFields(
        { name: "Класс", value: className, inline: true },
        { name: "Уровень", value: `${level}`, inline: true },
        { name: "Опыт", value: `${xp}`, inline: true },
        { name: "Характеристики", value: statsField || "—", inline: false },
        {
          name: "Бонусы экипировки",
          value:
            `**Урон**: +${dmgPct.toFixed(0)}%\n` +
            `**Крит шанс**: +${critPct.toFixed(0)}%\n` +
            `**Точность**: +${accPct.toFixed(0)}%\n` +
            `**Защита**: +${defPct.toFixed(0)}%`,
          inline: false,
        },
        {
          name: "Экипировка",
          value: `**Оружие**: ${weaponLabel}\n**Броня**: ${armorLabel}`,
          inline: false,
        },
        {
          name: "Дуэли",
          value: (() => {
            const wins = duels.wins || 0;
            const losses = duels.losses || 0;
            const total = wins + losses;
            const winrate =
              total > 0 ? ((wins / total) * 100).toFixed(1) + "%" : "0%";
            return `🏆 Победы: ${wins}   ❌ Поражения: ${losses}   📊 Винрейт: ${winrate}`;
          })(),
          inline: false,
        }
      )
      .setThumbnail(targetUser.displayAvatarURL({ size: 128 }));

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } catch (err) {
    console.error(err);
    await interaction.reply({
      content: "Произошла ошибка при получении профиля.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
