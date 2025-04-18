import { duelModel } from "../models/duel.js";

const BASE_XP_THRESHOLD = 500;

export function xpThreshold(level) {
  return BASE_XP_THRESHOLD * level;
}

export async function awardXP(discordId, xpAmount) {
  await duelModel.connect();
  const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
  const result = await statsColl.findOneAndUpdate(
    { discordid: discordId },
    { $inc: { "duelGame.xp": xpAmount } },
    { returnDocument: "after", upsert: true }
  );
  const userData = result.value;
  const duelGame = userData.duelGame || {};
  let currentLevel = duelGame.level || 1;
  let currentXP = duelGame.xp || 0;
  let newUnspentPoints = duelGame.unspentPoints || 0;
  let autoHp = duelGame.stats?.hp || 100;
  let autoDef = duelGame.stats?.defense || 10;

  while (currentXP >= xpThreshold(currentLevel)) {
    currentXP -= xpThreshold(currentLevel);
    currentLevel += 1;
    newUnspentPoints += 5;
    autoHp += 10;
    autoDef += 2;
  }

  await statsColl.updateOne(
    { discordid: discordId },
    {
      $set: {
        "duelGame.xp": currentXP,
        "duelGame.level": currentLevel,
        "duelGame.unspentPoints": newUnspentPoints,
        "duelGame.stats.hp": autoHp,
        "duelGame.stats.defense": autoDef,
      },
    }
  );

  return {
    level: currentLevel,
    xp: currentXP,
    unspentPoints: newUnspentPoints,
  };
}
