import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("info")
  .setDescription("Показать список всех доступных команд");

export async function execute(interaction) {
  const embed = new EmbedBuilder()
    .setTitle("📘 Список команд")
    .setColor(0x3498db)
    .setDescription("Ниже приведены все основные команды бота:")
    .addFields(
      { name: "/createcharacter", value: "Создать нового персонажа" },
      {
        name: "/profile",
        value: "Показать характеристики, уровень и экипировку",
      },
      { name: "/upgrade", value: "Улучшить характеристики за очки" },
      {
        name: "/resetbuild",
        value: "Сбросить характеристики и перераспределить очки",
      },
      {
        name: "/setclass",
        value: "Выбрать базовый класс (Warrior, Mage, Archer)",
      },
      {
        name: "/changeclass",
        value: "Продвинуться в продвинутый класс при достижении уровня",
      },
      {
        name: "/shop",
        value: "Посмотреть товары в магазине и купить предметы",
      },
      { name: "/inventory", value: "Показать содержимое инвентаря" },
      { name: "/use", value: "Использовать зелье или экипировать предмет" },
      { name: "/enhance", value: "Попробовать заточить оружие или броню" },
      {
        name: "/duel",
        value: "Вызвать игрока на дуэль с возможной ставкой бонусов",
      },
      { name: "/quest", value: "Получить задание и отправиться на квест" },
      { name: "/info", value: "Показать это сообщение" }
    )
    .setFooter({ text: "Используйте команды с / (слэш), например: /profile" });

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}
