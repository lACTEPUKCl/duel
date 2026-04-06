import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { duelModel } from "../models/duel.js";
import { logger } from "../utils/logger.js";

/**
 * ═══════════════════════════════
 *  TOURNAMENT SYSTEM
 * ═══════════════════════════════
 *
 * Автоматический еженедельный турнир:
 * 1. Регистрация открывается за 24 часа (четверг)
 * 2. Турнир начинается в пятницу
 * 3. Single elimination bracket
 * 4. Бои симулируются автоматически
 *
 * State хранится в MongoDB collection "tournaments"
 */

const ENTRY_FEE = 500; // Взнос
const SYSTEM_BONUS = 2000; // Бонус от системы к призовому фонду
const REGISTRATION_HOURS = 24;

/**
 * Создать новый турнир (вызывается из scheduler'а)
 */
export async function createTournament(channelId) {
  await duelModel.connect();
  const db = duelModel.client.db("SquadJS");
  const tournColl = db.collection("tournaments");

  // Проверяем нет ли активного
  const active = await tournColl.findOne({
    status: { $in: ["registration", "in_progress"] },
  });
  if (active) return null;

  const tournament = {
    channelId,
    status: "registration",
    participants: [], // [{ discordId, name, level }]
    bracket: [], // заполняется при старте
    currentRound: 0,
    rounds: [],
    entryFee: ENTRY_FEE,
    prizePool: SYSTEM_BONUS,
    createdAt: new Date(),
    startsAt: new Date(Date.now() + REGISTRATION_HOURS * 60 * 60 * 1000),
  };

  const result = await tournColl.insertOne(tournament);
  logger.info(`[TOURNAMENT] Created, ID: ${result.insertedId}`);
  return { ...tournament, _id: result.insertedId };
}

/**
 * Зарегистрировать игрока
 */
export async function registerPlayer(discordId, displayName) {
  await duelModel.connect();
  const db = duelModel.client.db("SquadJS");
  const tournColl = db.collection("tournaments");
  const statsColl = db.collection("mainstats");

  const tourn = await tournColl.findOne({ status: "registration" });
  if (!tourn) return { error: "Нет открытой регистрации на турнир." };

  // Уже зарегистрирован?
  if (tourn.participants.some((p) => p.discordId === discordId)) {
    return { error: "Вы уже зарегистрированы!" };
  }

  // Проверяем баланс
  const player = await statsColl.findOne({ discordid: discordId });
  if (!player?.duelGame) return { error: "Персонаж не создан." };
  if ((player.bonuses || 0) < ENTRY_FEE) {
    return { error: `Недостаточно бонусов. Нужно: ${ENTRY_FEE}` };
  }

  // Списываем взнос
  await statsColl.updateOne(
    { discordid: discordId },
    { $inc: { bonuses: -ENTRY_FEE } }
  );

  // Добавляем в турнир
  const level = player.duelGame.level || 1;
  await tournColl.updateOne(
    { _id: tourn._id },
    {
      $push: {
        participants: { discordId, name: displayName, level },
      },
      $inc: { prizePool: ENTRY_FEE },
    }
  );

  logger.economy(discordId, "tournament_entry", -ENTRY_FEE, "—");

  const updated = await tournColl.findOne({ _id: tourn._id });
  return {
    success: true,
    participantCount: updated.participants.length,
    prizePool: updated.prizePool,
  };
}

/**
 * Запустить турнир — сгенерировать bracket
 */
export async function startTournament() {
  await duelModel.connect();
  const db = duelModel.client.db("SquadJS");
  const tournColl = db.collection("tournaments");

  const tourn = await tournColl.findOne({ status: "registration" });
  if (!tourn) return null;

  let participants = [...tourn.participants];

  if (participants.length < 2) {
    // Отмена — возврат взносов
    const statsColl = db.collection("mainstats");
    for (const p of participants) {
      await statsColl.updateOne(
        { discordid: p.discordId },
        { $inc: { bonuses: ENTRY_FEE } }
      );
    }
    await tournColl.updateOne(
      { _id: tourn._id },
      { $set: { status: "cancelled" } }
    );
    return { cancelled: true, reason: "Недостаточно участников" };
  }

  // Перемешиваем
  participants.sort(() => Math.random() - 0.5);

  // Pad to power of 2 (bye rounds)
  const size = nextPowerOf2(participants.length);
  while (participants.length < size) {
    participants.push({ discordId: "BYE", name: "BYE", level: 0 });
  }

  // Генерируем пары первого раунда
  const firstRound = [];
  for (let i = 0; i < participants.length; i += 2) {
    firstRound.push({
      player1: participants[i],
      player2: participants[i + 1],
      winnerId: null,
    });
  }

  await tournColl.updateOne(
    { _id: tourn._id },
    {
      $set: {
        status: "in_progress",
        bracket: participants,
        currentRound: 1,
        rounds: [firstRound],
        startedAt: new Date(),
      },
    }
  );

  return {
    started: true,
    participantCount: tourn.participants.length,
    totalRounds: Math.log2(size),
    firstRound,
    prizePool: tourn.prizePool,
  };
}

/**
 * Симулировать все бои текущего раунда
 * Возвращает результаты для отображения
 */
export async function simulateCurrentRound(simulateDuelFn) {
  await duelModel.connect();
  const db = duelModel.client.db("SquadJS");
  const tournColl = db.collection("tournaments");
  const statsColl = db.collection("mainstats");

  const tourn = await tournColl.findOne({ status: "in_progress" });
  if (!tourn) return null;

  const currentRound = tourn.rounds[tourn.currentRound - 1];
  if (!currentRound) return null;

  const results = [];
  const winners = [];

  for (const match of currentRound) {
    // BYE — автопроход
    if (match.player1.discordId === "BYE") {
      match.winnerId = match.player2.discordId;
      winners.push(match.player2);
      results.push({
        winner: match.player2,
        loser: match.player1,
        bye: true,
      });
      continue;
    }
    if (match.player2.discordId === "BYE") {
      match.winnerId = match.player1.discordId;
      winners.push(match.player1);
      results.push({
        winner: match.player1,
        loser: match.player2,
        bye: true,
      });
      continue;
    }

    // Загружаем данные обоих
    const [p1Data, p2Data] = await Promise.all([
      statsColl.findOne({ discordid: match.player1.discordId }),
      statsColl.findOne({ discordid: match.player2.discordId }),
    ]);

    if (!p1Data?.duelGame || !p2Data?.duelGame) {
      // Кто-то удалил персонажа — другой проходит
      const valid = p1Data?.duelGame ? match.player1 : match.player2;
      match.winnerId = valid.discordId;
      winners.push(valid);
      results.push({ winner: valid, loser: null, forfeit: true });
      continue;
    }

    // Симуляция через функцию из duelGame
    const { winnerIsChallenger, totalRounds } = simulateDuelFn(
      p1Data.duelGame,
      p2Data.duelGame,
      match.player1.name,
      match.player2.name,
      p1Data.duelGame.level || 1,
      p2Data.duelGame.level || 1
    );

    const winner = winnerIsChallenger ? match.player1 : match.player2;
    const loser = winnerIsChallenger ? match.player2 : match.player1;
    match.winnerId = winner.discordId;
    winners.push(winner);
    results.push({ winner, loser, rounds: totalRounds });
  }

  // Следующий раунд или финал
  const isLastRound = winners.length <= 1;

  if (isLastRound) {
    // Турнир окончен
    const champion = winners[0];
    const prizePool = tourn.prizePool;
    const prizes = {
      first: Math.floor(prizePool * 0.6),
      second: Math.floor(prizePool * 0.25),
      third: Math.floor(prizePool * 0.15),
    };

    // Определяем 2-е и 3-е место
    const finalLoser = results[results.length - 1]?.loser;

    // Раздаём призы
    if (champion) {
      await statsColl.updateOne(
        { discordid: champion.discordId },
        { $inc: { bonuses: prizes.first, "duelGame.tournamentsWon": 1 } }
      );
    }
    if (finalLoser) {
      await statsColl.updateOne(
        { discordid: finalLoser.discordId },
        { $inc: { bonuses: prizes.second } }
      );
    }

    await tournColl.updateOne(
      { _id: tourn._id },
      {
        $set: {
          status: "completed",
          [`rounds.${tourn.currentRound - 1}`]: currentRound,
          champion: champion?.discordId,
          completedAt: new Date(),
        },
      }
    );

    return { finished: true, results, champion, prizes };
  }

  // Генерируем следующий раунд
  const nextRound = [];
  for (let i = 0; i < winners.length; i += 2) {
    nextRound.push({
      player1: winners[i],
      player2: winners[i + 1] || { discordId: "BYE", name: "BYE", level: 0 },
      winnerId: null,
    });
  }

  await tournColl.updateOne(
    { _id: tourn._id },
    {
      $set: { [`rounds.${tourn.currentRound - 1}`]: currentRound },
      $push: { rounds: nextRound },
      $inc: { currentRound: 1 },
    }
  );

  return {
    finished: false,
    results,
    nextRoundMatches: nextRound.length,
    roundNumber: tourn.currentRound,
  };
}

/**
 * Embeds
 */
export function createRegistrationEmbed(tournament) {
  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🏆 Еженедельный турнир — Регистрация открыта!")
    .setDescription(
      `Формат: **1v1 Single Elimination**\n` +
      `Взнос: **${ENTRY_FEE}** бонусов\n` +
      `Бонус от системы: **${SYSTEM_BONUS}** бонусов\n\n` +
      `Используйте \`/tournament join\` чтобы зарегистрироваться!\n` +
      `Турнир начнётся автоматически через ${REGISTRATION_HOURS} часов.`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("tournament_join")
      .setLabel(`Участвовать (${ENTRY_FEE} бонусов)`)
      .setStyle(ButtonStyle.Success)
  );

  return { embed, row };
}

export function createRoundEmbed(roundNumber, results, prizePool) {
  const lines = results.map((r) => {
    if (r.bye) return `🔹 **${r.winner.name}** — автопроход`;
    if (r.forfeit) return `🔹 **${r.winner.name}** — автопобеда (соперник выбыл)`;
    return `⚔️ **${r.winner.name}** побеждает **${r.loser.name}** (${r.rounds} раундов)`;
  });

  return new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle(`🏆 Турнир — Раунд ${roundNumber}`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Призовой фонд: ${prizePool} бонусов` });
}

export function createChampionEmbed(champion, prizes) {
  return new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("🏆👑 Турнир завершён!")
    .setDescription(
      `**Чемпион: <@${champion.discordId}>** 🎉\n\n` +
      `🥇 1-е место: **${prizes.first}** бонусов\n` +
      `🥈 2-е место: **${prizes.second}** бонусов\n` +
      `🥉 3-е место: **${prizes.third}** бонусов`
    );
}

function nextPowerOf2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export { ENTRY_FEE, REGISTRATION_HOURS };
