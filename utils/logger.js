const LOG_LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
const CURRENT_LEVEL =
  LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase() || "INFO"] ?? 2;

function ts() {
  return new Date().toISOString();
}

export const logger = {
  error: (msg, ...args) =>
    CURRENT_LEVEL >= 0 && console.error(`[ERROR] ${ts()} ${msg}`, ...args),
  warn: (msg, ...args) =>
    CURRENT_LEVEL >= 1 && console.warn(`[WARN]  ${ts()} ${msg}`, ...args),
  info: (msg, ...args) =>
    CURRENT_LEVEL >= 2 && console.log(`[INFO]  ${ts()} ${msg}`, ...args),
  debug: (msg, ...args) =>
    CURRENT_LEVEL >= 3 && console.log(`[DEBUG] ${ts()} ${msg}`, ...args),

  // Специализированные логгеры
  duel: (challengerId, opponentId, winnerId, rounds) =>
    console.log(
      `[DUEL]  ${ts()} ${challengerId} vs ${opponentId} → winner:${winnerId} rounds:${rounds}`
    ),
  economy: (userId, action, amount, balance) =>
    console.log(
      `[ECON]  ${ts()} user:${userId} ${action} amount:${amount} bal:${balance}`
    ),
  exploit: (userId, action, details) =>
    console.warn(
      `[EXPLOIT] ${ts()} user:${userId} ${action}: ${details}`
    ),
};
