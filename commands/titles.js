import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";
import { titles as allTitles } from "../config/titlesData.js";

export const data = new SlashCommandBuilder()
  .setName("titles")
  .setDescription("Показать ваши титулы и достижения");

export async function execute(interaction) {
  const userDoc = await checkUserBinding(interaction);
  if (!userDoc) return;

  const earned = userDoc.duelGame?.titles || [];
  const total = allTitles.length;

  if (earned.length === 0) {
    return interaction.reply({
      content: `У вас пока нет титулов (0/${total}). Продолжайте играть!`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Разделяем на полученные и неполученные
  const earnedList = [];
  const lockedList = [];

  for (const t of allTitles) {
    if (earned.includes(t.id)) {
      earnedList.push(`🏅 **${t.name}** — ${t.desc}`);
    } else {
      lockedList.push(`🔒 ~~${t.name}~~ — ${t.desc}`);
    }
  }

  let desc = earnedList.join("\n");
  if (lockedList.length > 0) {
    // Показываем первые 5 недостающих
    desc += "\n\n**Следующие цели:**\n";
    desc += lockedList.slice(0, 5).join("\n");
    if (lockedList.length > 5) {
      desc += `\n...и ещё ${lockedList.length - 5}`;
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle(`🎖️ Титулы (${earned.length}/${total})`)
    .setDescription(desc)
    .setFooter({
      text: "Титулы зарабатываются автоматически при выполнении условий",
    });

  return interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}
