import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { duelModel } from "../models/duel.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";
import { classes } from "../classes/classes.js";
import { xpThreshold } from "./leveling.js";
import { getClassDefinition, getMainStatKey } from "../utils/classHelpers.js";
import {
  getEffectiveStat,
  computeHitChance,
  computeCritChance,
  getWeaponDamage,
} from "../utils/combatMath.js";

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

    // Рассчитываем XP до следующего уровня
    const nextXP = xpThreshold(level);
    const xpToNext = Math.max(nextXP - xp, 0);

    const classId = stats.class;
    const classDef = getClassDefinition(classId) || {
      statMultipliers: {},
      name: classId,
    };
    const className = classDef.name || classId || "—";

    // Рассчитываем финальные статы через общую систему
    const dg = userData.duelGame;
    const statKeys = ["strength", "agility", "intelligence", "accuracy", "hp", "defense"];
    const finalStats = {};
    for (const key of statKeys) {
      finalStats[key] = getEffectiveStat(dg, key);
    }

    // Параметры боя через общие функции
    const mainKey = getMainStatKey(classId);
    const avgDamage = getWeaponDamage(dg);
    const hitChance = computeHitChance(dg);
    const critChance = computeCritChance(dg);

    const w = typeof equipped.weapon === "object" ? equipped.weapon : {};
    const a = typeof equipped.armor === "object" ? equipped.armor : {};

    // Формируем поле характеристик
    const statsField = statKeys
      .map((k) => {
        const v = finalStats[k];
        const label = k[0].toUpperCase() + k.slice(1);
        if (k === mainKey) {
          return `**${label}**: ${v} (урон с оружием: ${avgDamage.toFixed(1)})`;
        }
        if (k === "accuracy") {
          return `**${label}**: ${v} (меткость: ${(hitChance * 100).toFixed(
            0
          )}% крит шанс: ${(critChance * 100).toFixed(0)}%)`;
        }
        return `**${label}**: ${v}`;
      })
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

    // Эмбед
    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`Профиль ${targetUser.username}`)
      .addFields(
        { name: "Класс", value: className, inline: true },
        { name: "Уровень", value: `${level}`, inline: true },
        {
          name: "Опыт",
          value: `${xp}/${nextXP} (до следующего: ${xpToNext})`,
          inline: true,
        },
        { name: "Характеристики", value: statsField, inline: false },
        {
          name: "Бонусы экипировки",
          value:
            `**Урон**: +${((w.stats?.damagePercentBonus || 0) * 100).toFixed(0)}%\n` +
            `**Крит шанс**: +${(w.stats?.critChanceBonus * 100 || 0).toFixed(
              0
            )}%\n` +
            `**Точность**: +${(w.stats?.accuracyBonus * 100 || 0).toFixed(
              0
            )}%\n` +
            `**Защита**: +${(a.stats?.defensePercentBonus * 100 || 0).toFixed(
              0
            )}%`,
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
