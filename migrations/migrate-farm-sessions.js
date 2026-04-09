/**
 * ═══════════════════════════════════════════════════
 *  MIGRATION: End all active farm sessions
 * ═══════════════════════════════════════════════════
 *
 *  Запускать ОДИН РАЗ после деплоя новой системы фарма.
 *
 *  Что делает:
 *  1. Находит всех игроков с активным farmStart
 *  2. Начисляет им весь накопленный XP (без капа — это легаси)
 *  3. Очищает farmStart
 *  4. Ставит lastFarmEnd = 0 (чтобы сразу можно было начать новый фарм)
 *  5. Прогоняет уровни через систему awardXP
 *
 *  Использование:
 *    node migrations/migrate-farm-sessions.js
 *
 *  Опции:
 *    --dry-run  — только показать что будет сделано, без записи в БД
 */

import { duelModel } from "../models/duel.js";
import { awardXP } from "../commands/leveling.js";
import dotenv from "dotenv";
dotenv.config();

const DRY_RUN = process.argv.includes("--dry-run");
const XP_PER_MINUTE = 1;

async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  FARM SESSION MIGRATION");
  console.log("═══════════════════════════════════════");
  if (DRY_RUN) {
    console.log("  ⚠️  DRY RUN MODE — no DB writes");
  }
  console.log();

  // Подключаемся
  await duelModel.connect();
  const statsColl = duelModel.client.db("SquadJS").collection("mainstats");

  // Находим всех игроков с активным фармом
  const cursor = statsColl.find({
    "duelGame.farmStart": { $exists: true, $ne: null },
  });

  const players = await cursor.toArray();
  console.log(`Найдено игроков с активным фармом: ${players.length}\n`);

  if (players.length === 0) {
    console.log("✅ Никого мигрировать не нужно. Выход.");
    await duelModel.client.close();
    return;
  }

  const now = Date.now();
  let totalProcessed = 0;
  let totalXpAwarded = 0;
  let totalLevelUps = 0;
  const errors = [];

  for (const player of players) {
    try {
      const dg = player.duelGame;
      const farmStart = dg.farmStart;
      const elapsedMs = now - farmStart;
      const elapsedMin = Math.floor(elapsedMs / 60000);
      const xpGain = elapsedMin * XP_PER_MINUTE;
      const oldLevel = dg.level || 1;

      const elapsedDays = (elapsedMs / (1000 * 60 * 60 * 24)).toFixed(1);

      console.log(
        `${player.discordid}: фармил ${elapsedMin} мин (${elapsedDays} дней) → +${xpGain} XP (lvl ${oldLevel})`
      );

      if (DRY_RUN) {
        totalProcessed++;
        totalXpAwarded += xpGain;
        continue;
      }

      // 1. Очищаем farmStart, сбрасываем lastFarmEnd чтобы сразу можно было фармить
      await statsColl.updateOne(
        { discordid: player.discordid },
        {
          $unset: { "duelGame.farmStart": "" },
          $set: { "duelGame.lastFarmEnd": 0 },
          $inc: { "duelGame.totalFarmMinutes": elapsedMin },
        }
      );

      // 2. Начисляем XP через систему левелинга (она сама прокрутит уровни)
      if (xpGain > 0) {
        const result = await awardXP(player.discordid, xpGain);
        const levelUps = result.level - oldLevel;
        if (levelUps > 0) {
          console.log(
            `  └─ повысился до lvl ${result.level} (+${levelUps} уровней, ${result.unspentPoints} очков)`
          );
          totalLevelUps += levelUps;
        }
      }

      totalProcessed++;
      totalXpAwarded += xpGain;
    } catch (err) {
      console.error(`❌ Ошибка для ${player.discordid}:`, err.message);
      errors.push({ id: player.discordid, error: err.message });
    }
  }

  // Итоги
  console.log();
  console.log("═══════════════════════════════════════");
  console.log("  ИТОГО");
  console.log("═══════════════════════════════════════");
  console.log(`Обработано игроков:    ${totalProcessed} / ${players.length}`);
  console.log(`Всего XP начислено:    ${totalXpAwarded}`);
  console.log(`Всего повышений:       ${totalLevelUps}`);
  if (errors.length) {
    console.log(`Ошибок:                ${errors.length}`);
    errors.forEach((e) => console.log(`  - ${e.id}: ${e.error}`));
  }
  if (DRY_RUN) {
    console.log();
    console.log("⚠️  DRY RUN — изменения НЕ записаны.");
    console.log("⚠️  Запустите без --dry-run чтобы применить.");
  } else {
    console.log();
    console.log("✅ Миграция завершена. Игроки могут начать новый фарм.");
  }

  await duelModel.client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("💥 Критическая ошибка миграции:", err);
  process.exit(1);
});
