import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";
import { gameItems } from "../utils/gameItems.js";

export const data = new SlashCommandBuilder()
  .setName("inventory")
  .setDescription("Показать инвентарь персонажа");

export async function execute(interaction) {
  const userDoc = await checkUserBinding(interaction);
  if (!userDoc) return;

  const inventory = userDoc.duelGame?.inventory || [];
  if (inventory.length === 0) {
    return interaction.reply({
      content: "Ваш инвентарь пуст.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const grouped = {};
  inventory.forEach((item) => {
    const normalized =
      typeof item === "object" ? item : { id: item, enhance: 0 };
    const key = `${normalized.id}-${normalized.enhance || 0}`;

    if (grouped[key]) {
      grouped[key].count++;
    } else {
      const configItem = gameItems.find((i) => i.id === normalized.id) || {};
      grouped[key] = {
        item: {
          ...normalized,
          name: configItem.name || normalized.id,
          description: configItem.description,
          stats: configItem.stats,
        },
        count: 1,
      };
    }
  });

  const embed = new EmbedBuilder()
    .setColor(0x00bfff)
    .setTitle("🎒 Ваш инвентарь")
    .setDescription(
      Object.values(grouped)
        .map((entry, idx) => {
          const { item, count } = entry;
          const name =
            item.enhance > 0 ? `${item.name} +${item.enhance}` : item.name;
          const displayName = count > 1 ? `${name} (x${count})` : name;

          return (
            `**${displayName}**\n` +
            `${item.description || "Описание недоступно"}\n` +
            `*Эффект:* ${item.stats || "—"}`
          );
        })
        .join("\n\n")
    )
    .setFooter({ text: "Используйте /use для применения предметов" });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
