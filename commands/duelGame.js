import {
  EmbedBuilder,
  MessageFlags,
  ButtonBuilder,
  ActionRowBuilder,
} from "discord.js";
import { weapons } from "../config/duelConfig.js";
import { awardXP } from "./leveling.js";
import { duelModel } from "../models/duel.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";
import {
  getEffectiveStat,
  computeHitChance,
  computeCritChance,
  getWeaponDamage,
  getTotalDefense,
  getAntiTankBonus,
} from "../utils/combatMath.js";
import { getLevelScaling, COMBAT, DUEL_XP } from "../config/balanceConfig.js";
import { lockForDuel, unlockDuel } from "../utils/duelLock.js";
import { logger } from "../utils/logger.js";
import {
  processDuelBounty,
  createBountyEmbed,
  createBountyCollectedEmbed,
} from "../services/bountyService.js";
import { checkAndAwardTitles, formatTitleNotifications } from "../services/titlesService.js";
import { progressDailyQuest, formatDailyQuestNotifications } from "../services/dailyQuestsService.js";
import { getClassAbilities } from "../config/classAbilities.js";

// ─── Максимальное количество раундов (антибесконечный цикл) ───
const MAX_ROUNDS = 50;

// ─── Получить displayName игрока ───
async function getDisplayName(userId, interaction) {
  try {
    const member = await interaction.guild.members.fetch(userId);
    return (
      member.nickname ||
      member.user.globalName ||
      member.user.username ||
      userId
    ).slice(0, 14);
  } catch {
    try {
      const user = await interaction.client.users.fetch(userId);
      return (user.globalName || user.username || userId).slice(0, 14);
    } catch {}
    return userId.slice(0, 14);
  }
}

// ─── Чистая симуляция боя (без DB) ───
// Экспортируем для турнира
export function simulateCombat(
  challengerDG,
  opponentDG,
  nameC,
  nameO,
  levelC,
  levelO
) {
  let hpC = getEffectiveStat(challengerDG, "hp") || 100;
  let hpO = getEffectiveStat(opponentDG, "hp") || 100;
  const startHpC = hpC;
  const startHpO = hpO;
  const firstC = Math.random() < 0.5;

  // Загружаем пассивки классов
  const abilitiesC = getClassAbilities(challengerDG.stats?.class);
  const abilitiesO = getClassAbilities(opponentDG.stats?.class);

  // Предрассчёт onBattleStart эффектов
  const battleStartC = {};
  const battleStartO = {};
  for (const ab of abilitiesC) {
    if (ab.type === "onBattleStart") {
      if (ab.effect === "guaranteedFirstHit") battleStartC.guaranteedHit = true;
      if (ab.effect === "guaranteedFirstCrit") {
        battleStartC.guaranteedCritRounds = ab.rounds || 1;
        battleStartC.critMultiplierOverride = ab.critMultiplier || null;
      }
    }
  }
  for (const ab of abilitiesO) {
    if (ab.type === "onBattleStart") {
      if (ab.effect === "guaranteedFirstHit") battleStartO.guaranteedHit = true;
      if (ab.effect === "guaranteedFirstCrit") {
        battleStartO.guaranteedCritRounds = ab.rounds || 1;
        battleStartO.critMultiplierOverride = ab.critMultiplier || null;
      }
    }
  }

  // Счётчики атак каждого
  let attackCountC = 0;
  let attackCountO = 0;

  const fullLog = [
    "Раунд |   Атакующий    | Урон  |    Защитник    |   HP",
    "-".repeat(56),
  ];

  let rnd = 1;
  while (hpC > 0 && hpO > 0 && rnd <= MAX_ROUNDS) {
    const isCAtt = firstC ? rnd % 2 === 1 : rnd % 2 === 0;
    const [attDG, defDG] = isCAtt
      ? [challengerDG, opponentDG]
      : [opponentDG, challengerDG];
    const [attLvl, defLvl] = isCAtt ? [levelC, levelO] : [levelO, levelC];
    const [attStartHp, defStartHp] = isCAtt
      ? [startHpC, startHpO]
      : [startHpO, startHpC];
    const [attAbilities, defAbilities] = isCAtt
      ? [abilitiesC, abilitiesO]
      : [abilitiesO, abilitiesC];
    const attBattleStart = isCAtt ? battleStartC : battleStartO;
    const attAttackCount = isCAtt ? attackCountC : attackCountO;
    const aName = isCAtt ? nameC : nameO;
    const dName = isCAtt ? nameO : nameC;
    const attCurrentHp = isCAtt ? hpC : hpO;
    const defCurrentHp = isCAtt ? hpO : hpC;

    let hit = computeHitChance(attDG);
    let crit = computeCritChance(attDG);

    // ── onBattleStart: guaranteed hit/crit ──
    if (attBattleStart.guaranteedHit && attAttackCount === 0) {
      hit = 1.0;
    }
    let forceCrit = false;
    let critMultOverride = null;
    if (
      attBattleStart.guaranteedCritRounds &&
      attAttackCount < attBattleStart.guaranteedCritRounds
    ) {
      forceCrit = true;
      critMultOverride = attBattleStart.critMultiplierOverride;
    }

    // ── onAttack abilities ──
    let atkAbilityBonus = 0;
    let doubleStrike = false;
    for (const ab of attAbilities) {
      if (ab.type !== "onAttack") continue;
      if (ab.effect === "lowHpDamageBoost") {
        if (attCurrentHp / attStartHp < ab.hpThreshold) {
          atkAbilityBonus += ab.bonus;
        }
      }
      if (ab.effect === "earlyDamageBoost") {
        if (attAttackCount < (ab.rounds || 3)) {
          atkAbilityBonus += ab.bonus;
        }
      }
      if (ab.effect === "doubleStrike") {
        if (Math.random() < (ab.chance || 0)) doubleStrike = true;
      }
    }

    // ── onDefend abilities ──
    let blocked = false;
    let dodged = false;
    let reflectPercent = 0;
    for (const ab of defAbilities) {
      if (ab.type !== "onDefend") continue;
      if (ab.effect === "block" && Math.random() < (ab.chance || 0)) blocked = true;
      if (ab.effect === "dodge" && Math.random() < (ab.chance || 0)) dodged = true;
      if (ab.effect === "reflect" && Math.random() < (ab.chance || 0)) {
        reflectPercent = ab.reflectPercent || 0;
      }
    }

    // Зелья
    const atkEff = attDG.activeEffects?.potion_damage?.remaining > 0 ? 0.1 : 0;
    const defEff = defDG.activeEffects?.potion_defense?.remaining > 0 ? 0.1 : 0;

    // Level scaling
    const { atkMod, defMod } = getLevelScaling(attLvl, defLvl);
    const antiTank = getAntiTankBonus(attStartHp, defStartHp);

    // Расчёт урона
    const variance =
      1 - COMBAT.damageVariance + Math.random() * COMBAT.damageVariance * 2;
    const raw =
      getWeaponDamage(attDG) *
      variance *
      (1 + atkEff + antiTank + atkAbilityBonus) *
      atkMod;
    const defVal =
      getTotalDefense(defDG) *
      COMBAT.defenseEffectiveness *
      (1 - defEff) *
      defMod;

    let dmg = 0;
    let isCrit = false;
    let isMiss = true;
    let statusTag = "";

    if (dodged) {
      statusTag = "УКЛОН";
    } else if (blocked) {
      statusTag = "БЛОК";
    } else if (Math.random() <= hit) {
      isMiss = false;
      dmg = Math.max(COMBAT.minDamage, raw - defVal);
      isCrit = forceCrit || Math.random() < crit;
      const critMult = critMultOverride || COMBAT.critMultiplier;
      dmg = isCrit ? Math.floor(dmg * critMult) : Math.floor(dmg);

      // Reflect
      if (reflectPercent > 0) {
        const reflected = Math.floor(dmg * reflectPercent);
        if (isCAtt) hpC = Math.max(0, hpC - reflected);
        else hpO = Math.max(0, hpO - reflected);
        statusTag = `↩${reflected}`;
      }
    }

    // Наносим урон
    if (isCAtt) hpO = Math.max(0, hpO - dmg);
    else hpC = Math.max(0, hpC - dmg);

    // Double strike — второй удар (50% силы)
    let dmg2 = 0;
    if (doubleStrike && !isMiss && !dodged && !blocked) {
      dmg2 = Math.floor(dmg * 0.5);
      if (isCAtt) hpO = Math.max(0, hpO - dmg2);
      else hpC = Math.max(0, hpC - dmg2);
    }

    // Форматирование лога
    let dmgStr;
    if (dodged) dmgStr = "УКЛОН";
    else if (blocked) dmgStr = " БЛОК";
    else if (isMiss) dmgStr = " МИМО";
    else {
      const totalDmg = dmg + dmg2;
      dmgStr = isCrit ? `${totalDmg}💥` : String(totalDmg);
      if (doubleStrike && dmg2 > 0) dmgStr += "×2";
      if (statusTag.startsWith("↩")) dmgStr += statusTag;
    }

    fullLog.push(
      `${String(rnd).padEnd(6)}| ` +
        `${aName.padEnd(15)}| ` +
        `${dmgStr.padStart(5)} | ` +
        `${dName.padEnd(15)}| ` +
        `${String(isCAtt ? hpO : hpC).padStart(5)}`
    );

    // Инкрементим счётчик атак
    if (isCAtt) attackCountC++;
    else attackCountO++;

    rnd++;
  }

  const battleLog = [fullLog[0], fullLog[1], ...fullLog.slice(2).slice(-20)];

  return {
    winnerIsChallenger: hpC >= hpO,
    battleLog,
    totalRounds: rnd - 1,
  };
}

// ─── Декремент активных эффектов ───
function decrementEffects(duelGame) {
  const effs = duelGame.activeEffects || {};
  for (const e in effs) {
    if (effs[e].remaining > 0) effs[e].remaining--;
    if (effs[e].remaining <= 0) delete effs[e];
  }
  return effs;
}

// ─── Главный обработчик принятия дуэли ───
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

    if (!duel || duel.winnerId) {
      return interaction.reply({
        content: "❌ Дуэль не найдена или уже завершена!",
        flags: MessageFlags.Ephemeral,
      });
    }

    // 2. Проверки
    const currentUserId = interaction.user.id;
    if (currentUserId === duel.challengerId) {
      return interaction.reply({
        content: "❌ Вы не можете принять собственную дуэль!",
        flags: MessageFlags.Ephemeral,
      });
    }

    // 3. Атомарное принятие (назначение оппонента)
    if (duel.opponentId) {
      if (duel.opponentId.toString() !== currentUserId.toString()) {
        return interaction.reply({
          content: "❌ Дуэль уже принята другим игроком!",
          flags: MessageFlags.Ephemeral,
        });
      }
    } else {
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
      duel.opponentId = result.value.opponentId;
      duel.status = result.value.status;
    }

    // 4. Блокировка через duelLock (антидубль)
    if (!lockForDuel(duel.challengerId) || !lockForDuel(duel.opponentId)) {
      unlockDuel(duel.challengerId);
      unlockDuel(duel.opponentId);
      return interaction.reply({
        content: "❌ Один из участников уже в активном бою!",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      // 5. Деактивируем кнопки
      const disabled = interaction.message.components.map((row) =>
        new ActionRowBuilder().addComponents(
          row.components.map((btn) =>
            ButtonBuilder.from(btn).setDisabled(true)
          )
        )
      );
      await interaction.message.edit({ components: disabled });
      await interaction.deferReply();

      // 6. Загружаем данные участников
      const [challengerData, opponentData] = await Promise.all([
        statsColl.findOne({ discordid: duel.challengerId }),
        statsColl.findOne({ discordid: duel.opponentId }),
      ]);

      if (!challengerData?.duelGame || !opponentData?.duelGame) {
        return interaction.editReply({
          content: "❌ У одного из участников нет персонажа. Дуэль отменена.",
        });
      }

      // 7. Получаем имена
      const [nameC, nameO] = await Promise.all([
        getDisplayName(duel.challengerId, interaction),
        getDisplayName(duel.opponentId, interaction),
      ]);

      // 8. Симуляция боя (чистая функция — без DB)
      const levelC = challengerData.duelGame.level || 1;
      const levelO = opponentData.duelGame.level || 1;
      const { winnerIsChallenger, battleLog, totalRounds } = simulateCombat(
        challengerData.duelGame,
        opponentData.duelGame,
        nameC,
        nameO,
        levelC,
        levelO
      );

      const winnerId = winnerIsChallenger
        ? challengerData.discordid
        : opponentData.discordid;
      const loserId = winnerIsChallenger
        ? opponentData.discordid
        : challengerData.discordid;

      // 9. Формируем описание
      let description = "```md\n" + battleLog.join("\n") + "\n```";

      const winnerChar = winnerIsChallenger ? challengerData : opponentData;
      const rawWep = winnerChar.duelGame.equipped?.weapon;
      const winWepId = typeof rawWep === "string" ? rawWep : rawWep?.id;
      const winData = weapons.find((w) => w.id === winWepId) || weapons[0];
      const winPhrase =
        winData.winPhrases[
          Math.floor(Math.random() * winData.winPhrases.length)
        ];
      const deathPhrase =
        winData.deathPhrases[
          Math.floor(Math.random() * winData.deathPhrases.length)
        ];
      description += `\n\nИтог: <@${winnerId}> ${winPhrase} <@${loserId}>, ${deathPhrase}.`;

      // 10. Удаляем оригинальное сообщение
      try {
        await interaction.channel.messages
          .fetch(duel.messageId)
          .then((m) => m.delete());
      } catch {}

      // 11. Записываем результат + статистику
      await duelModel.completeDuel(duel._id, winnerId, { battleLog });

      // Декрементим эффекты
      const challEffects = decrementEffects(challengerData.duelGame);
      const oppEffects = decrementEffects(opponentData.duelGame);

      // Обновляем победителя
      await statsColl.updateOne(
        { discordid: winnerId },
        {
          $inc: {
            ...(duel.betAmount > 0 && { bonuses: duel.betAmount }),
            "duelGame.duels.wins": 1,
          },
          $set: {
            "duelGame.activeEffects":
              winnerId === challengerData.discordid
                ? challEffects
                : oppEffects,
          },
        }
      );

      // Обновляем проигравшего
      await statsColl.updateOne(
        { discordid: loserId },
        {
          $inc: {
            ...(duel.betAmount > 0 && { bonuses: -duel.betAmount }),
            "duelGame.duels.losses": 1,
          },
          $set: {
            "duelGame.activeEffects":
              loserId === challengerData.discordid
                ? challEffects
                : oppEffects,
          },
        }
      );

      // 12. Награда опытом (масштабируется по уровню + underdog бонус)
      const winnerLevel =
        winnerId === challengerData.discordid ? levelC : levelO;
      const loserLevel =
        loserId === challengerData.discordid ? levelC : levelO;

      let winXP = DUEL_XP.winBase + Math.floor(loserLevel * DUEL_XP.winPerLevel);
      const loseXP = DUEL_XP.loseBase;

      // Underdog бонус
      if (loserLevel > winnerLevel) {
        const underdogBonus = Math.min(
          (loserLevel - winnerLevel) * DUEL_XP.underdogBonusPerLevel,
          DUEL_XP.underdogMaxBonus
        );
        winXP += underdogBonus;

        // Трекинг для титула "Убийца гигантов"
        const levelDiff = loserLevel - winnerLevel;
        const winnerDoc = winnerId === challengerData.discordid ? challengerData : opponentData;
        const currentBiggest = winnerDoc.duelGame.biggestUpset || 0;
        if (levelDiff > currentBiggest) {
          await statsColl.updateOne(
            { discordid: winnerId },
            { $set: { "duelGame.biggestUpset": levelDiff } }
          );
        }
      }

      await awardXP(winnerId, winXP);
      await awardXP(loserId, loseXP);

      // 12b. Bounty система — стрики и награды за голову
      const bountyResult = await processDuelBounty(statsColl, winnerId, loserId);

      // 12c. Прогресс дейликов
      const winnerDQ = await progressDailyQuest(winnerId, "duel_wins", 1);
      await progressDailyQuest(winnerId, "duels_played", 1);
      const loserDQ = await progressDailyQuest(loserId, "duels_played", 1);

      // 12d. Титулы
      const winnerTitles = await checkAndAwardTitles(winnerId);
      const loserTitles = await checkAndAwardTitles(loserId);

      // 13. Embed
      let descriptionExtra = "";

      // Bounty collected
      if (bountyResult.bountyCollected) {
        descriptionExtra += `\n\n🏴‍☠️ **Баунти собран!** <@${winnerId}> остановил серию из ${bountyResult.loserOldStreak} побед → **+${bountyResult.bountyAmount}** 💰`;
      }

      // New bounty
      if (bountyResult.newBountyTarget) {
        descriptionExtra += `\n\n🎯 **Новый баунти!** <@${bountyResult.newBountyTarget}> на серии **${bountyResult.winStreak}** побед — за голову **${bountyResult.newBountyAmount}** 💰`;
      }

      // Titles
      if (winnerTitles.length) {
        descriptionExtra += formatTitleNotifications(winnerTitles);
      }

      const embed = new EmbedBuilder()
        .setColor(winnerId === interaction.user.id ? 0x00ff00 : 0xff0000)
        .setTitle(
          `🎯 ${
            interaction.guild.members.cache.get(winnerId)?.displayName ||
            "Победитель"
          } побеждает!`
        )
        .setDescription(description + descriptionExtra)
        .addFields(
          {
            name: "Победитель",
            value: `<@${winnerId}> (+${winXP} XP) 🔥${bountyResult.winStreak}`,
            inline: true,
          },
          {
            name: "Проигравший",
            value: `<@${loserId}> (+${loseXP} XP)`,
            inline: true,
          }
        );

      if (duel.betAmount > 0) {
        embed.addFields({
          name: "Выигрыш",
          value: `${duel.betAmount} бонусов`,
          inline: true,
        });
      }

      embed.setFooter({ text: `Раундов: ${totalRounds}` });

      // 14. Логируем
      logger.duel(duel.challengerId, duel.opponentId, winnerId, totalRounds);
      if (duel.betAmount > 0) {
        logger.economy(winnerId, "duel_win", duel.betAmount, "—");
        logger.economy(loserId, "duel_lose", -duel.betAmount, "—");
      }

      // 15. Отправляем результат
      await interaction.editReply({ embeds: [embed] });

      // 16. Таймаут для проигравшего
      interaction.guild.members
        .fetch(loserId)
        .then((m) => m.timeout(10 * 60 * 1000, "Поражение в дуэли"))
        .catch(() => {});
    } finally {
      // ВСЕГДА разблокируем обоих игроков
      unlockDuel(duel.challengerId);
      unlockDuel(duel.opponentId);
    }
  } catch (err) {
    logger.error("Ошибка при обработке дуэли:", err);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: "❌ Произошла ошибка при обработке дуэли",
        });
      } else {
        await interaction.reply({
          content: "❌ Произошла ошибка при обработке дуэли",
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch {}
  }
}
