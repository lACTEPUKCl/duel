import {
  EmbedBuilder,
  MessageFlags,
  ButtonBuilder,
  ActionRowBuilder,
} from "discord.js";
import { weapons } from "../config/duelConfig.js";
import { awardXP } from "./leveling.js";
import { duelModel } from "../models/duel.js";
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

function getEffectiveStat(character, key) {
  const base = character.duelGame.stats[key] || 0;
  const classId = character.duelGame.stats.class;
  const classDef = getClassDefinition(classId);
  const mult = classDef.statMultipliers?.[key] ?? 0;
  const bonusFromClass = Math.floor(base * mult);
  let result = base + bonusFromClass;

  if (key === "accuracy") {
    const w = character.duelGame.equipped?.weapon;
    if (w && w.stats?.accuracyBonus) {
      result += Math.floor(result * w.stats.accuracyBonus);
    }
  }
  if (key === "defense") {
    const a = character.duelGame.equipped?.armor;
    if (a && a.stats?.defensePercentBonus) {
      result += Math.floor(result * a.stats.defensePercentBonus);
    }
  }
  return result;
}

function getMainSkill(character) {
  const cls = (character.duelGame.stats.class || "warrior").toLowerCase();
  if (cls === "mage") return getEffectiveStat(character, "intelligence");
  if (cls === "archer") return getEffectiveStat(character, "agility");
  return getEffectiveStat(character, "strength");
}

function computeHitChance(character) {
  const effAcc = getEffectiveStat(character, "accuracy");
  const main = getMainSkill(character);
  const ratio = main > 0 ? Math.min(effAcc / main, 1) : 0;
  return 0.3 + 0.6 * ratio;
}

function computeCritChance(character) {
  const effAgi = getEffectiveStat(character, "agility");
  const main = getMainSkill(character);
  const baseCrit = 0.1 + 0.4 * Math.min(effAgi / main, 1);
  const w = character.duelGame.equipped?.weapon;
  const bonusCrit = w?.stats?.critChanceBonus || 0;
  return baseCrit + bonusCrit;
}

function getWeaponDamage(character) {
  const main = getMainSkill(character);
  const w = character.duelGame.equipped?.weapon;
  const dmgBonus = w?.stats?.damagePercentBonus || 0;
  return main * (1 + dmgBonus);
}

function getTotalDefense(character) {
  return getEffectiveStat(character, "defense");
}

async function simulateDuel(challenger, opponent, interaction) {
  await duelModel.connect();
  const statsColl = duelModel.client.db("SquadJS").collection("mainstats");

  let hpC = getEffectiveStat(challenger, "hp") || 100;
  let hpO = getEffectiveStat(opponent, "hp") || 100;
  const firstC = Math.random() < 0.5;
  const log = [];
  let rnd = 1;

  const getDisplayName = async (userId, interaction) => {
    try {
      const member = await interaction.guild.members.fetch(userId);
      if (member.nickname) return member.nickname.slice(0, 14);
      if (member.user.globalName) return member.user.globalName.slice(0, 14);
      if (member.user.username) return member.user.username.slice(0, 14);
      return userId.slice(0, 14);
    } catch (error) {
      console.error(`Ошибка получения данных пользователя ${userId}:`, error);

      try {
        const user = await interaction.client.users.fetch(userId);
        if (user.globalName) return user.globalName.slice(0, 14);
        if (user.username) return user.username.slice(0, 14);
      } catch (e) {
        console.error(`Ошибка получения данных через REST API ${userId}:`, e);
      }

      return userId.slice(0, 14);
    }
  };

  const [nameC, nameO] = await Promise.all([
    getDisplayName(challenger.discordid, interaction),
    getDisplayName(opponent.discordid, interaction),
  ]);

  log.push("Раунд |   Атакующий    | Урон  |    Защитник    |   HP");
  log.push("-".repeat(56));

  while (hpC > 0 && hpO > 0 && rnd <= 20) {
    const isCAtt = firstC ? rnd % 2 === 1 : rnd % 2 === 0;
    const [att, def, aName, dName] = isCAtt
      ? [challenger, opponent, nameC, nameO]
      : [opponent, challenger, nameO, nameC];

    const hit = computeHitChance(att);
    const crit = computeCritChance(att);
    const atkEff =
      att.duelGame.activeEffects?.potion_damage?.remaining > 0 ? 0.1 : 0;
    const defEff =
      def.duelGame.activeEffects?.potion_defense?.remaining > 0 ? 0.1 : 0;

    const raw =
      getWeaponDamage(att) * (0.8 + Math.random() * 0.4) * (1 + atkEff);
    const defVal =
      getTotalDefense(def) * (0.2 + Math.random() * 0.2) * (1 - defEff);
    let dmg = 0;
    if (Math.random() <= hit) {
      dmg = Math.max(1, raw - defVal);
      dmg = Math.random() < crit ? Math.floor(dmg * 1.5) : Math.floor(dmg);
    }

    if (isCAtt) hpO = Math.max(0, hpO - dmg);
    else hpC = Math.max(0, hpC - dmg);

    log.push(
      `${String(rnd).padEnd(6)}| ` +
        `${aName.padEnd(15)}| ` +
        `${String(dmg).padStart(5)} | ` +
        `${dName.padEnd(15)}| ` +
        `${String(isCAtt ? hpO : hpC).padStart(5)}`
    );
    rnd++;
  }

  [challenger, opponent].forEach((c) => {
    const effs = c.duelGame.activeEffects || {};
    for (const e in effs) {
      if (effs[e].remaining > 0) effs[e].remaining--;
      if (effs[e].remaining <= 0) delete effs[e];
    }
  });

  await statsColl.updateOne(
    { discordid: challenger.discordid },
    { $set: { "duelGame.activeEffects": challenger.duelGame.activeEffects } }
  );
  await statsColl.updateOne(
    { discordid: opponent.discordid },
    { $set: { "duelGame.activeEffects": opponent.duelGame.activeEffects } }
  );

  const winnerId = hpC > hpO ? challenger.discordid : opponent.discordid;
  const loserId = hpC > hpO ? opponent.discordid : challenger.discordid;
  return { winnerId, loserId, battleLog: log };
}

export async function handleDuelAccept(interaction) {
  try {
    await duelModel.connect();
    const db = duelModel.client.db("SquadJS");
    const statsColl = db.collection("mainstats");
    const duelsColl = db.collection("duels");

    // 1. Получаем дуэль
    const interactionId = interaction.customId.split("_").slice(2).join("_");
    const duel = await duelModel.findPendingDuelByInteractionId(interactionId);

    // 2. Проверяем существование дуэли
    if (!duel) {
      return interaction.reply({
        content: "❌ Дуэль не найдена или уже завершена!",
        flags: MessageFlags.Ephemeral,
      });
    }

    // 3. Проверяем, не является ли пользователь создателем дуэли
    if (duel.challengerId === interaction.user.id) {
      return interaction.reply({
        content: "❌ Вы не можете принять свою дуэль!",
        flags: MessageFlags.Ephemeral,
      });
    }

    // 4. Если дуэль уже имеет оппонента
    if (duel.opponentId) {
      if (duel.opponentId.toString() !== interaction.user.id.toString()) {
        return interaction.reply({
          content: "❌ Дуэль уже принята другим игроком!",
          flags: MessageFlags.Ephemeral,
        });
      }
      // Продолжаем обработку, если это тот же пользователь
    }

    // 5. Проверяем данные оппонента ДО установки
    const oppData = await statsColl.findOne({
      discordid: interaction.user.id,
    });

    if (!oppData?.duelGame) {
      return interaction.reply({
        content: "❌ Сначала создайте персонажа (/createcharacter)!",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (duel.betAmount > 0 && (oppData.bonuses || 0) < duel.betAmount) {
      return interaction.reply({
        content: `❌ Недостаточно бонусов! Нужно: ${duel.betAmount}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // 6. Атомарная установка оппонента с полной проверкой
    const currentUserId = interaction.user.id;
    const updateResult = await duelsColl.updateOne(
      {
        _id: duel._id,
        $or: [
          { opponentId: { $exists: false } }, // Если оппонента нет
          { opponentId: currentUserId }, // Или если оппонент - текущий пользователь
        ],
      },
      {
        $set: {
          opponentId: String(currentUserId), // Явное преобразование в строку
          updatedAt: new Date(),
        },
      }
    );

    // // Проверяем результат
    // if (updateResult.modifiedCount === 0) {
    //   // Получаем актуальные данные для диагностики
    //   const currentDuelState = await duelsColl.findOne({ _id: duel._id });

    //   console.log("Конфликт при принятии дуэли:", {
    //     duelId: duel._id,
    //     currentOpponent: currentDuelState?.opponentId,
    //     attemptingUser: currentUserId,
    //     duelState: currentDuelState,
    //   });

    //   return interaction.reply({
    //     content: "❌ Дуэль уже принята другим игроком!",
    //     flags: MessageFlags.Ephemeral,
    //   });
    // }

    // Обязательно обновляем локальный объект
    duel.opponentId = currentUserId;

    // 7. Обновляем сообщение
    const disabled = interaction.message.components.map((row) =>
      new ActionRowBuilder().addComponents(
        row.components.map((btn) => ButtonBuilder.from(btn).setDisabled(true))
      )
    );
    await interaction.message.edit({ components: disabled });
    await interaction.deferReply({});

    // 8. Получаем полные данные участников
    const [challengerData, opponentData] = await Promise.all([
      statsColl.findOne({ discordid: duel.challengerId }),
      statsColl.findOne({ discordid: duel.opponentId }),
    ]);

    if (!challengerData?.duelGame || !opponentData?.duelGame) {
      return interaction.reply({
        content: "❌ Ошибка загрузки данных персонажей!",
        flags: MessageFlags.Ephemeral,
      });
    }

    // 10. Симулируем дуэль
    const { winnerId, loserId, battleLog } = await simulateDuel(
      challengerData,
      opponentData,
      interaction
    );

    // 9. Формируем описание результата
    let description = "```md\n" + battleLog.join("\n") + "\n```";

    const winData =
      weapons.find(
        (w) =>
          w.id ===
          (winnerId === challengerData.discordid
            ? challengerData
            : opponentData
          ).duelGame.equipped?.weapon
      ) || weapons[0];
    const winPhrase =
      winData.winPhrases[Math.floor(Math.random() * winData.winPhrases.length)];
    const deathPhrase =
      winData.deathPhrases[
        Math.floor(Math.random() * winData.deathPhrases.length)
      ];
    description += `\n\nИтог: <@${winnerId}> ${winPhrase} <@${loserId}>, ${deathPhrase}.`;

    // 10. Удаляем оригинальное сообщение с вызовом
    try {
      await interaction.channel.messages
        .fetch(duel.messageId)
        .then((m) => m.delete());
    } catch {}

    // 11. Обновляем данные о дуэли и статистику игроков
    await duelModel.completeDuel(duel._id, winnerId, { battleLog });

    await statsColl.updateOne(
      { discordid: winnerId },
      {
        $inc: {
          ...(duel.betAmount > 0 && { bonuses: duel.betAmount }),
          "duelGame.duels.wins": 1,
        },
      }
    );

    await statsColl.updateOne(
      { discordid: loserId },
      {
        $inc: {
          ...(duel.betAmount > 0 && { bonuses: -duel.betAmount }),
          "duelGame.duels.losses": 1,
        },
      }
    );

    // 12. Награждаем опытом
    await awardXP(winnerId, 100);
    await awardXP(loserId, 30);

    // 13. Создаем embed с результатами
    const embed = new EmbedBuilder()
      .setColor(winnerId === interaction.user.id ? 0x00ff00 : 0xff0000)
      .setTitle(
        `🎯 ${
          interaction.guild.members.cache.get(winnerId)?.displayName
        } побеждает!`
      )
      .setDescription(description)
      .addFields(
        { name: "Победитель", value: `<@${winnerId}>`, inline: true },
        { name: "Проигравший", value: `<@${loserId}>`, inline: true }
      );

    if (duel.betAmount > 0) {
      embed.addFields({
        name: "Выигрыш",
        value: `${duel.betAmount} бонусов`,
        inline: true,
      });
    }

    // 14. Отправляем результат
    await interaction.editReply({ embeds: [embed] });

    // 15. Таймаут для проигравшего
    interaction.guild.members
      .fetch(loserId)
      .then((m) => m.timeout(1 * 60 * 1000, "Поражение в дуэли"))
      .catch(() => {});
  } catch (err) {
    console.error("Ошибка при обработке дуэли:", err);
    await interaction.editReply({
      content: "❌ Произошла ошибка при обработке дуэли",
      flags: MessageFlags.Ephemeral,
    });
  }
}
