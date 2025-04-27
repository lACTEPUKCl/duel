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
import { checkUserBinding } from "../utils/checkUserBinding.js";

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
  const hitChance = 0.3 + 0.6 * ratio;
  return Math.max(hitChance, 10);
}

function computeCritChance(character) {
  const effAcc = getEffectiveStat(character, "accuracy");
  const main = getMainSkill(character);
  const baseCrit = 0.1 + 0.4 * Math.min(effAcc / main, 1);
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

  // 1. Исходные HP и порядок ходов
  let hpC = getEffectiveStat(challenger, "hp") || 100;
  let hpO = getEffectiveStat(opponent, "hp") || 100;
  const firstC = Math.random() < 0.5;

  // 2. Функция получения отображаемого имени (как было в оригинале)
  const getDisplayName = async (userId, interaction) => {
    try {
      const member = await interaction.guild.members.fetch(userId);
      if (member.nickname) return member.nickname.slice(0, 14);
      if (member.user.globalName) return member.user.globalName.slice(0, 14);
      if (member.user.username) return member.user.username.slice(0, 14);
      return userId.slice(0, 14);
    } catch {
      try {
        const user = await interaction.client.users.fetch(userId);
        if (user.globalName) return user.globalName.slice(0, 14);
        if (user.username) return user.username.slice(0, 14);
      } catch {}
      return userId.slice(0, 14);
    }
  };

  // 3. Вычисляем ники до симуляции
  const [nameC, nameO] = await Promise.all([
    getDisplayName(challenger.discordid, interaction),
    getDisplayName(opponent.discordid, interaction),
  ]);

  // 4. Собираем полный лог
  const fullLog = [
    "Раунд |   Атакующий    | Урон  |    Защитник    |   HP",
    "-".repeat(56),
  ];

  let rnd = 1;
  while (hpC > 0 && hpO > 0) {
    const isCAtt = firstC ? rnd % 2 === 1 : rnd % 2 === 0;
    const [att, def] = isCAtt ? [challenger, opponent] : [opponent, challenger];
    const aName = isCAtt ? nameC : nameO;
    const dName = isCAtt ? nameO : nameC;

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

    fullLog.push(
      `${String(rnd).padEnd(6)}| ` +
        `${aName.padEnd(15)}| ` +
        `${String(dmg).padStart(5)} | ` +
        `${dName.padEnd(15)}| ` +
        `${String(isCAtt ? hpO : hpC).padStart(5)}`
    );

    rnd++;
  }

  // 5. Обновляем оставшиеся эффекты (как в оригинале)
  [challenger, opponent].forEach((c) => {
    const effs = c.duelGame.activeEffects || {};
    for (const e in effs) {
      if (effs[e].remaining > 0) effs[e].remaining--;
      if (effs[e].remaining <= 0) delete effs[e];
    }
  });

  // 6. Сохраняем эффекты в БД
  await statsColl.updateOne(
    { discordid: challenger.discordid },
    { $set: { "duelGame.activeEffects": challenger.duelGame.activeEffects } }
  );
  await statsColl.updateOne(
    { discordid: opponent.discordid },
    { $set: { "duelGame.activeEffects": opponent.duelGame.activeEffects } }
  );

  // 7. Обрезаем лог до 20 последних раундов (после заголовка)
  const battleLog = [fullLog[0], fullLog[1], ...fullLog.slice(2).slice(-20)];

  // 8. Определяем победителя
  const winnerId = hpC > hpO ? challenger.discordid : opponent.discordid;
  const loserId = hpC > hpO ? opponent.discordid : challenger.discordid;

  return { winnerId, loserId, battleLog };
}

export async function handleDuelAccept(interaction) {
  const userDoc = await checkUserBinding(interaction);
  if (!userDoc) return;
  try {
    await duelModel.connect();
    const db = duelModel.client.db("SquadJS");
    const statsColl = db.collection("mainstats");
    const duelsColl = db.collection("duels");

    // 1. Получаем дуэль
    const interactionId = interaction.customId.split("_").slice(2).join("_");
    const duel = await duelModel.findPendingDuelByInteractionId(interactionId);

    // Если дуэль уже завершена (есть победитель) — отклоняем
    if (duel.winnerId) {
      return interaction.reply({
        content: "❌ Эта дуэль уже завершена!",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!duel) {
      return interaction.reply({
        content: "❌ Дуэль не найдена или уже завершена!",
        flags: MessageFlags.Ephemeral,
      });
    }

    // 2. Проверка и атомарное принятие дуэли
    const currentUserId = interaction.user.id;
    if (currentUserId === duel.challengerId) {
      return interaction.reply({
        content: "❌ Вы не можете принять собственную дуэль!",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Если оппонент уже назначен
    if (duel.opponentId) {
      // Если это не вы — отклоняем
      if (duel.opponentId.toString() !== currentUserId.toString()) {
        return interaction.reply({
          content: "❌ Дуэль уже принята другим игроком!",
          flags: MessageFlags.Ephemeral,
        });
      }
      // Если вы уже оппонент — продолжаем без обновления
    } else {
      // Назначаем вас как оппонента и переводим статус
      const result = await duelsColl.findOneAndUpdate(
        {
          _id: duel._id,
          status: "pending",
          $or: [{ opponentId: { $exists: false } }, { opponentId: null }],
        },
        {
          $set: {
            opponentId: currentUserId,
            status: "in-progress",
            updatedAt: new Date(),
          },
        },
        { returnDocument: "after" }
      );
      if (!result.value) {
        return interaction.reply({
          content: "❌ Дуэль уже принята или завершена!",
          flags: MessageFlags.Ephemeral,
        });
      }
      // Обновляем локальный объект статусом и оппонентом
      duel.opponentId = result.value.opponentId;
      duel.status = result.value.status;
    }

    // 4. Деактивируем кнопки
    const disabled = interaction.message.components.map((row) =>
      new ActionRowBuilder().addComponents(
        row.components.map((btn) => ButtonBuilder.from(btn).setDisabled(true))
      )
    );
    await interaction.message.edit({ components: disabled });
    await interaction.deferReply();

    // 5. Загружаем данные участников и симулируем дуэль
    const [challengerData, opponentData] = await Promise.all([
      statsColl.findOne({ discordid: duel.challengerId }),
      statsColl.findOne({ discordid: duel.opponentId }),
    ]);

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
    await awardXP(loserId, 100);

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
      .then((m) => m.timeout(10 * 60 * 1000, "Поражение в дуэли"))
      .catch(() => {});
  } catch (err) {
    console.error("Ошибка при обработке дуэли:", err);
    await interaction.editReply({
      content: "❌ Произошла ошибка при обработке дуэли",
      flags: MessageFlags.Ephemeral,
    });
  }
}
