import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { duelModel } from "../models/duel.js";
import { logger } from "../utils/logger.js";

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Таблица лидеров")
  .addStringOption((opt) =>
    opt
      .setName("тип")
      .setDescription("Тип рейтинга")
      .setRequired(false)
      .addChoices(
        { name: "Уровень", value: "level" },
        { name: "Победы", value: "wins" },
        { name: "Винрейт", value: "winrate" }
      )
  );

export async function execute(interaction) {
  try {
    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
    const type = interaction.options.getString("тип") || "level";

    // Сортировка и фильтрация
    let sort, filter, title, emoji;
    switch (type) {
      case "wins":
        sort = { "duelGame.duels.wins": -1 };
        filter = { "duelGame.duels.wins": { $gt: 0 } };
        title = "Топ по победам";
        emoji = "🏆";
        break;
      case "winrate":
        // Для винрейта нужен минимум 10 боёв
        sort = { "duelGame.duels.wins": -1 };
        filter = {
          $expr: {
            $gte: [
              {
                $add: [
                  { $ifNull: ["$duelGame.duels.wins", 0] },
                  { $ifNull: ["$duelGame.duels.losses", 0] },
                ],
              },
              10,
            ],
          },
        };
        title = "Топ по винрейту (мин. 10 боёв)";
        emoji = "📊";
        break;
      default:
        sort = { "duelGame.level": -1, "duelGame.xp": -1 };
        filter = { "duelGame.level": { $gte: 1 } };
        title = "Топ по уровню";
        emoji = "⭐";
        break;
    }

    const players = await statsColl
      .find({ duelGame: { $exists: true }, ...filter })
      .sort(sort)
      .limit(15)
      .toArray();

    if (!players.length) {
      return interaction.reply({
        content: "Пока нет игроков для отображения.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Для винрейта — досортировать в JS
    if (type === "winrate") {
      players.sort((a, b) => {
        const aw = a.duelGame.duels?.wins || 0;
        const al = a.duelGame.duels?.losses || 0;
        const bw = b.duelGame.duels?.wins || 0;
        const bl = b.duelGame.duels?.losses || 0;
        const awr = (aw + al) > 0 ? aw / (aw + al) : 0;
        const bwr = (bw + bl) > 0 ? bw / (bw + bl) : 0;
        return bwr - awr || bw - aw; // При равном ВР — больше побед выше
      });
    }

    // Получаем имена через Discord
    const lines = [];
    const top10 = players.slice(0, 10);

    for (let i = 0; i < top10.length; i++) {
      const p = top10[i];
      const dg = p.duelGame;
      const wins = dg.duels?.wins || 0;
      const losses = dg.duels?.losses || 0;
      const total = wins + losses;
      const wr = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0";
      const lvl = dg.level || 1;
      const cls = dg.stats?.class || "—";

      // Медаль для топ-3
      const medal =
        i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**${i + 1}.**`;

      let displayName;
      try {
        const member = await interaction.guild.members.fetch(p.discordid);
        displayName =
          member.nickname ||
          member.user.globalName ||
          member.user.username ||
          p.discordid;
      } catch {
        displayName = p.discordid;
      }
      displayName = displayName.slice(0, 16);

      let statLine;
      switch (type) {
        case "wins":
          statLine = `${wins}W / ${losses}L (${wr}%) — Lv.${lvl}`;
          break;
        case "winrate":
          statLine = `${wr}% — ${wins}W / ${losses}L — Lv.${lvl}`;
          break;
        default:
          statLine = `Lv.**${lvl}** — ${wins}W/${losses}L (${wr}%) — ${cls}`;
          break;
      }

      lines.push(`${medal} **${displayName}** — ${statLine}`);
    }

    // Позиция текущего игрока
    const myIdx = players.findIndex(
      (p) => p.discordid === interaction.user.id
    );
    let footer = "";
    if (myIdx >= 0) {
      footer = `Ваше место: #${myIdx + 1}`;
    } else {
      footer = "Вас нет в рейтинге";
    }

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle(`${emoji} ${title}`)
      .setDescription(lines.join("\n"))
      .setFooter({ text: footer })
      .setTimestamp();

    return interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    logger.error("Ошибка в leaderboard:", err);
    return interaction.reply({
      content: "❌ Ошибка при загрузке таблицы лидеров.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
