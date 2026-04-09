import {
  spawnBoss,
  getCurrentBoss,
  createBossSpawnEmbed,
  createBossAttackRow,
  SPAWN_INTERVAL,
} from "./bossService.js";
import {
  createTournament,
  startTournament,
  simulateCurrentRound,
  createRegistrationEmbed,
  createRoundEmbed,
  createChampionEmbed,
  REGISTRATION_HOURS,
} from "./tournamentService.js";
import { logger } from "../utils/logger.js";

// Канал для ивент-сообщений (тот же что для дуэлей)
const EVENT_CHANNEL_ID = process.env.EVENT_CHANNEL || "1362879255293333524";

let client = null;

/**
 * Инициализация scheduler'а — вызывается из index.js после ready
 */
export function initScheduler(discordClient) {
  client = discordClient;

  // ─── BOSS SPAWN — каждые 4 часа ───
  scheduleBoss();
  setInterval(scheduleBoss, SPAWN_INTERVAL);

  // ─── TOURNAMENT — проверяем каждый час ───
  setInterval(checkTournamentCycle, 60 * 60 * 1000);
  // Сразу проверяем при запуске
  setTimeout(checkTournamentCycle, 10 * 1000);

  logger.info("[SCHEDULER] Initialized: boss every 4h, tournament weekly");
}

// ─── BOSS ───
async function scheduleBoss() {
  try {
    if (getCurrentBoss()?.alive) return; // Уже есть живой босс

    const boss = spawnBoss();
    const channel = await getChannel();
    if (!channel) return;

    const embed = createBossSpawnEmbed(boss);
    const row = createBossAttackRow();
    await channel.send({ embeds: [embed], components: [row] });

    logger.info(`[SCHEDULER] Boss spawned: ${boss.name}`);
  } catch (err) {
    logger.error("[SCHEDULER] Boss spawn error:", err);
  }
}

// ─── TOURNAMENT ───
async function checkTournamentCycle() {
  try {
    const now = new Date();
    const day = now.getUTCDay(); // 0=Sun, 4=Thu, 5=Fri
    const hour = now.getUTCHours();

    // Четверг 18:00 UTC — открыть регистрацию
    if (day === 4 && hour === 18) {
      await openTournamentRegistration();
    }

    // Пятница 18:00 UTC — запустить турнир
    if (day === 5 && hour === 18) {
      await runTournament();
    }
  } catch (err) {
    logger.error("[SCHEDULER] Tournament cycle error:", err);
  }
}

async function openTournamentRegistration() {
  const channel = await getChannel();
  if (!channel) return;

  const tournament = await createTournament(EVENT_CHANNEL_ID);
  if (!tournament) {
    logger.info("[SCHEDULER] Tournament already exists, skipping");
    return;
  }

  const { embed, row } = createRegistrationEmbed(tournament);
  await channel.send({ embeds: [embed], components: [row] });

  logger.info("[SCHEDULER] Tournament registration opened");
}

async function runTournament() {
  const channel = await getChannel();
  if (!channel) return;

  // 1. Стартуем турнир
  const startResult = await startTournament();
  if (!startResult) return;

  if (startResult.cancelled) {
    await channel.send({
      embeds: [
        {
          color: 0xff0000,
          title: "🏆 Турнир отменён",
          description: startResult.reason + ". Взносы возвращены.",
        },
      ],
    });
    return;
  }

  await channel.send({
    embeds: [
      {
        color: 0xffd700,
        title: "🏆 Турнир начинается!",
        description: `Участников: **${startResult.participantCount}**\nРаундов: **${startResult.totalRounds}**\nПризовой фонд: **${startResult.prizePool}** бонусов`,
      },
    ],
  });

  // 2. Симулируем раунды с паузами
  // Динамический импорт simulateCombat из duelGame (избегаем circular dep)
  const { simulateCombat } = await import("../commands/duelGame.js");

  let roundNum = 1;
  let finished = false;

  while (!finished) {
    // Пауза между раундами (30 сек)
    await sleep(30 * 1000);

    const roundResult = await simulateCurrentRound(simulateCombat);
    if (!roundResult) break;

    if (roundResult.finished) {
      // Финал
      const champEmbed = createChampionEmbed(
        roundResult.champion,
        roundResult.prizes
      );
      await channel.send({ embeds: [champEmbed] });
      finished = true;
    } else {
      const roundEmbed = createRoundEmbed(
        roundNum,
        roundResult.results,
        0 // prizePool
      );
      await channel.send({ embeds: [roundEmbed] });
      roundNum++;
    }
  }

  logger.info("[SCHEDULER] Tournament completed");
}

// ─── HELPERS ───
async function getChannel() {
  if (!client) return null;
  try {
    return await client.channels.fetch(EVENT_CHANNEL_ID);
  } catch (err) {
    logger.error("[SCHEDULER] Cannot fetch event channel:", err);
    return null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
