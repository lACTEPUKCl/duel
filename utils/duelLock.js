/**
 * In-memory lock для предотвращения одновременных дуэлей
 * Если бот перезапустится — блокировки сбросятся, но это ок:
 * MongoDB TTL index на duels и так почистит старые записи.
 */

const activePlayers = new Map(); // discordId → timestamp

/**
 * Попытаться заблокировать игрока для дуэли
 * @returns {boolean} true если заблокировали, false если уже в бою
 */
export function lockForDuel(userId) {
  if (activePlayers.has(userId)) return false;
  activePlayers.set(userId, Date.now());
  return true;
}

/**
 * Разблокировать игрока после завершения дуэли
 */
export function unlockDuel(userId) {
  activePlayers.delete(userId);
}

/**
 * Проверить, участвует ли игрок в дуэли
 */
export function isInDuel(userId) {
  return activePlayers.has(userId);
}

// Автоочистка зависших блокировок (30 мин таймаут)
setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of activePlayers) {
    if (now - ts > 30 * 60 * 1000) activePlayers.delete(id);
  }
}, 60 * 1000);
