import { EmbedBuilder } from "discord.js";
import { duelModel } from "../models/duel.js";
import { getMainStat, getWeaponDamage, getEffectiveStat } from "../utils/combatMath.js";
import { rollMaterialDrop } from "../config/craftingData.js";
import { awardXP } from "../commands/leveling.js";
import { logger } from "../utils/logger.js";

// ─── BOSS CONFIG ───
const BOSSES = [
  { name: "🐉 Древний Дракон", hp: 5000, minReward: 200, maxReward: 1000, xp: 300, tier: "hard" },
  { name: "💀 Король Нежити", hp: 3500, minReward: 150, maxReward: 700, xp: 200, tier: "medium" },
  { name: "🕷️ Гигантский Паук", hp: 2500, minReward: 100, maxReward: 500, xp: 150, tier: "medium" },
  { name: "👹 Огр-вождь", hp: 2000, minReward: 80, maxReward: 400, xp: 120, tier: "easy" },
  { name: "🧌 Троллий Берсерк", hp: 1800, minReward: 70, maxReward: 350, xp: 100, tier: "easy" },
];

const SPAWN_INTERVAL = 4 * 60 * 60 * 1000; // 4 часа
const ATTACK_COOLDOWN = 30 * 1000; // 30 сек между атаками одного игрока

// Состояние текущего босса (in-memory)
let currentBoss = null;

export function getCurrentBoss() {
  return currentBoss;
}

export function spawnBoss() {
  const template = BOSSES[Math.floor(Math.random() * BOSSES.length)];
  currentBoss = {
    ...template,
    maxHp: template.hp,
    currentHp: template.hp,
    contributors: new Map(), // discordId → { damage, attacks, lastAttack }
    spawnedAt: Date.now(),
    alive: true,
  };
  logger.info(`[BOSS] Spawned: ${template.name} (HP: ${template.hp})`);
  return currentBoss;
}

/**
 * Игрок атакует босса
 * @returns {{ damage, isCrit, bossHp, killed, cooldownLeft }}
 */
export async function attackBoss(discordId) {
  if (!currentBoss || !currentBoss.alive) {
    return { error: "Сейчас нет активного босса." };
  }

  // Кулдаун
  const contrib = currentBoss.contributors.get(discordId);
  if (contrib && Date.now() - contrib.lastAttack < ATTACK_COOLDOWN) {
    const left = Math.ceil((ATTACK_COOLDOWN - (Date.now() - contrib.lastAttack)) / 1000);
    return { error: `Кулдаун атаки: ${left} сек.`, cooldownLeft: left };
  }

  // Загружаем статы игрока
  await duelModel.connect();
  const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
  const player = await statsColl.findOne({ discordid: discordId });
  if (!player?.duelGame) {
    return { error: "Персонаж не создан." };
  }

  const dg = player.duelGame;
  const baseDmg = getWeaponDamage(dg);
  const variance = 0.7 + Math.random() * 0.6; // ±30%
  const isCrit = Math.random() < 0.15; // 15% крит по боссу
  let damage = Math.floor(baseDmg * variance);
  if (isCrit) damage = Math.floor(damage * 1.5);
  damage = Math.max(1, damage);

  // Наносим урон
  currentBoss.currentHp = Math.max(0, currentBoss.currentHp - damage);

  // Трекаем вклад
  if (!currentBoss.contributors.has(discordId)) {
    currentBoss.contributors.set(discordId, { damage: 0, attacks: 0, lastAttack: 0 });
  }
  const c = currentBoss.contributors.get(discordId);
  c.damage += damage;
  c.attacks += 1;
  c.lastAttack = Date.now();

  const killed = currentBoss.currentHp <= 0;

  return {
    damage,
    isCrit,
    bossHp: currentBoss.currentHp,
    bossMaxHp: currentBoss.maxHp,
    bossName: currentBoss.name,
    killed,
  };
}

/**
 * Раздать награды после убийства босса
 * @returns {Object} — { killer, contributors, rewards }
 */
export async function distributeBossRewards(killerDiscordId) {
  if (!currentBoss) return null;

  await duelModel.connect();
  const statsColl = duelModel.client.db("SquadJS").collection("mainstats");

  const totalDamage = [...currentBoss.contributors.values()].reduce(
    (sum, c) => sum + c.damage, 0
  );

  const rewards = [];
  const materialRewards = rollMaterialDrop(currentBoss.tier);

  for (const [userId, contrib] of currentBoss.contributors) {
    const sharePercent = totalDamage > 0 ? contrib.damage / totalDamage : 0;
    const isKiller = userId === killerDiscordId;

    // Золото пропорционально вкладу
    let gold = Math.floor(
      currentBoss.minReward +
      (currentBoss.maxReward - currentBoss.minReward) * sharePercent
    );
    if (isKiller) gold = Math.floor(gold * 1.5); // +50% добивающему

    // XP пропорционально
    let xp = Math.floor(currentBoss.xp * sharePercent);
    if (isKiller) xp = Math.floor(xp * 1.5);
    xp = Math.max(xp, 10); // минимум 10 XP за участие

    // Материалы — шанс пропорционален вкладу (мин 30%)
    const matChanceMod = Math.max(sharePercent, 0.3);
    const playerMats = materialRewards
      .filter(() => Math.random() < matChanceMod)
      .map((m) => ({ ...m }));

    // Обновляем БД
    const pushOps = playerMats.map((m) => ({
      id: m.id,
      name: m.name,
      amount: m.amount,
    }));

    await statsColl.updateOne(
      { discordid: userId },
      {
        $inc: {
          bonuses: gold,
          "duelGame.bossKills": isKiller ? 1 : 0,
          "duelGame.bossContributions": 1,
        },
        ...(pushOps.length && {
          $push: { "duelGame.inventory": { $each: pushOps } },
        }),
      }
    );

    await awardXP(userId, xp);

    rewards.push({
      userId,
      damage: contrib.damage,
      attacks: contrib.attacks,
      sharePercent,
      gold,
      xp,
      materials: playerMats,
      isKiller,
    });
  }

  // Сортируем по урону
  rewards.sort((a, b) => b.damage - a.damage);

  const result = {
    bossName: currentBoss.name,
    totalDamage,
    contributors: rewards,
    killerId: killerDiscordId,
  };

  // Сбрасываем босса
  currentBoss.alive = false;
  currentBoss = null;

  return result;
}

/**
 * Создать embed для спавна босса
 */
export function createBossSpawnEmbed(boss) {
  const hpBar = makeHpBar(boss.currentHp, boss.maxHp);
  return new EmbedBuilder()
    .setColor(0xff4444)
    .setTitle(`${boss.name} появился!`)
    .setDescription(
      `HP: ${hpBar} **${boss.currentHp}/${boss.maxHp}**\n\n` +
      `Используйте \`/attack_boss\` чтобы атаковать!\n` +
      `💰 Награда: ${boss.minReward}–${boss.maxReward} бонусов + материалы\n` +
      `⚡ Кулдаун атаки: 30 сек`
    );
}

/**
 * Создать embed для результатов убийства босса
 */
export function createBossKillEmbed(result) {
  const top5 = result.contributors.slice(0, 5);
  const lines = top5.map((r, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    const killTag = r.isKiller ? " ⚔️" : "";
    return `${medal} <@${r.userId}>${killTag} — ${r.damage} урона (${(r.sharePercent * 100).toFixed(0)}%) → +${r.gold}💰 +${r.xp}✨`;
  });

  return new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle(`${result.bossName} повержен!`)
    .setDescription(
      `Общий урон: **${result.totalDamage}**\n` +
      `Добил: <@${result.killerId}> ⚔️\n\n` +
      lines.join("\n")
    )
    .setFooter({ text: `Участников: ${result.contributors.length}` });
}

function makeHpBar(current, max) {
  const pct = Math.max(0, current / max);
  const filled = Math.round(pct * 10);
  return "🟥".repeat(filled) + "⬛".repeat(10 - filled);
}

export { SPAWN_INTERVAL };
