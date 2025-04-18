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

async function simulateDuel(challenger, opponent) {
  await duelModel.connect();
  const statsColl = duelModel.client.db("SquadJS").collection("mainstats");

  let hpC = getEffectiveStat(challenger, "hp") || 100;
  let hpO = getEffectiveStat(opponent, "hp") || 100;
  const firstC = Math.random() < 0.5;
  const log = [];
  let rnd = 1;
  const nameC = (challenger.nickname || challenger.discordid).slice(0, 14);
  const nameO = (opponent.nickname || opponent.discordid).slice(0, 14);

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
      getTotalDefense(def) * (0.4 + Math.random() * 0.3) * (1 - defEff);
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
    const [challengerData, opponentData] = await Promise.all([
      statsColl.findOne({ discordid: duel.challengerId }),
      statsColl.findOne({ discordid: duel.opponentId }),
    ]);
    const interactionId = interaction.customId.split("_").slice(2).join("_");
    const duel = await duelModel.findPendingDuelByInteractionId(interactionId);
    if (!duel) {
      return interaction.editReply({
        content: "❌ Дуэль не найдена или уже завершена!",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (duel.opponentId && interaction.user.id !== duel.opponentId) {
      return interaction.reply({
        content: "❌ Эта кнопка активна только для указанного оппонента.",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (duel.challengerId === interaction.user.id) {
      return interaction.reply({
        content: "❌ Вы не можете принять свою собственную дуэль.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!challengerData?.duelGame) {
      return interaction.editReply({
        content:
          "❌ Инициатор дуэли ещё не создал персонажа. Пусть выполнит `/createcharacter`.",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (!opponentData?.duelGame) {
      return interaction.editReply({
        content:
          "❌ Противник ещё не создал персонажа. Он должен выполнить `/createcharacter`.",
        flags: MessageFlags.Ephemeral,
      });
    }
    if (!duel.opponentId) {
      const oppData = await statsColl.findOne({
        discordid: interaction.user.id,
      });
      if (!oppData?.duelGame) {
        return interaction.editReply({
          content: "❌ Для участия создайте персонажа (/createcharacter).",
          flags: MessageFlags.Ephemeral,
        });
      }
      if (duel.betAmount > 0 && (oppData.bonuses || 0) < duel.betAmount) {
        return interaction.editReply({
          content: `❌ Недостаточно бонусов! У вас ${oppData.bonuses || 0}`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const disabled = interaction.message.components.map((row) =>
        new ActionRowBuilder().addComponents(
          row.components.map((btn) => ButtonBuilder.from(btn).setDisabled(true))
        )
      );
      await interaction.message.edit({ components: disabled });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await duelsColl.updateOne(
        { _id: duel._id },
        { $set: { opponentId: interaction.user.id } }
      );
      duel.opponentId = interaction.user.id;
    }

    challengerData.nickname =
      interaction.guild.members.cache.get(challengerData.discordid)
        ?.displayName || challengerData.discordid;
    opponentData.nickname =
      interaction.guild.members.cache.get(opponentData.discordid)
        ?.displayName || opponentData.discordid;
    const { winnerId, loserId, battleLog } = await simulateDuel(
      challengerData,
      opponentData
    );
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

    try {
      await interaction.channel.messages
        .fetch(duel.messageId)
        .then((m) => m.delete());
    } catch {}
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

    await awardXP(winnerId, 100);
    await awardXP(loserId, 30);
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
    if (duel.betAmount > 0)
      embed.addFields({
        name: "Выигрыш",
        value: `${duel.betAmount} бонусов`,
        inline: true,
      });
    await interaction.followUp({ embeds: [embed] });

    interaction.guild.members
      .fetch(loserId)
      .then((m) => m.timeout(5 * 60 * 1000, "Поражение в дуэли"))
      .catch(() => {});
  } catch (err) {
    console.error("Ошибка при обработке дуэли:", err);
    await interaction.editReply({
      content: "❌ Произошла ошибка при обработке дуэли",
      flags: MessageFlags.Ephemeral,
    });
  }
}
