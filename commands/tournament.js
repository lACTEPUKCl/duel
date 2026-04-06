import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";
import { registerPlayer } from "../services/tournamentService.js";
import { duelModel } from "../models/duel.js";

export const data = new SlashCommandBuilder()
  .setName("tournament")
  .setDescription("Управление турниром")
  .addSubcommand((sub) =>
    sub.setName("join").setDescription("Зарегистрироваться на турнир")
  )
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Статус текущего турнира")
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "join") {
    const userDoc = await checkUserBinding(interaction);
    if (!userDoc) return;

    const member = interaction.guild.members.cache.get(interaction.user.id);
    const name = (
      member?.nickname ||
      interaction.user.globalName ||
      interaction.user.username
    ).slice(0, 16);

    const result = await registerPlayer(interaction.user.id, name);

    if (result.error) {
      return interaction.reply({
        content: `❌ ${result.error}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      content:
        `✅ Вы зарегистрированы на турнир!\n` +
        `Участников: **${result.participantCount}**\n` +
        `Призовой фонд: **${result.prizePool}** бонусов`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (sub === "status") {
    await duelModel.connect();
    const db = duelModel.client.db("SquadJS");
    const tournColl = db.collection("tournaments");
    const tourn = await tournColl.findOne({
      status: { $in: ["registration", "in_progress"] },
    });

    if (!tourn) {
      return interaction.reply({
        content: "Сейчас нет активного турнира. Следующий — в четверг!",
        flags: MessageFlags.Ephemeral,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("🏆 Текущий турнир");

    if (tourn.status === "registration") {
      const timeLeft = Math.max(
        0,
        Math.ceil((new Date(tourn.startsAt) - Date.now()) / 3600000)
      );
      embed.setDescription(
        `Статус: **Регистрация**\n` +
        `Участников: **${tourn.participants.length}**\n` +
        `Призовой фонд: **${tourn.prizePool}** бонусов\n` +
        `До начала: ~**${timeLeft}** часов`
      );
    } else {
      embed.setDescription(
        `Статус: **В процессе** (раунд ${tourn.currentRound})\n` +
        `Участников: **${tourn.participants.length}**\n` +
        `Призовой фонд: **${tourn.prizePool}** бонусов`
      );
    }

    return interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  }
}
