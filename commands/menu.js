import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";

/**
 * ═══════════════════════════════════════════════════
 *  /menu — Интерактивное меню всех команд
 * ═══════════════════════════════════════════════════
 *
 * Категории показываются через select menu.
 * Команды без аргументов имеют кнопки быстрого запуска.
 * Команды с аргументами — только описание + пример.
 */

// ─── Структура категорий ───
const CATEGORIES = {
  character: {
    label: "👤 Персонаж",
    description: "Создание, профиль, прокачка",
    color: 0x3498db,
    commands: [
      {
        cmd: "/createcharacter",
        desc: "Создать нового персонажа",
        button: { id: "menu_btn_createchar", label: "Создать" },
      },
      {
        cmd: "/profile",
        desc: "Показать характеристики, уровень и экипировку",
        button: { id: "menu_btn_profile", label: "Профиль" },
      },
      {
        cmd: "/upgrade <стат> <очки>",
        desc: "Улучшить характеристики за очки. Пример: `/upgrade strength 5`",
      },
      {
        cmd: "/resetbuild",
        desc: "Сбросить характеристики и перераспределить очки",
        button: { id: "menu_btn_reset", label: "Сброс билда", style: ButtonStyle.Danger },
      },
      {
        cmd: "/setclass <класс>",
        desc: "Выбрать базовый класс (Warrior/Mage/Archer)",
      },
      {
        cmd: "/changeclass",
        desc: "Продвинуться в продвинутый класс (на lvl 20/40/80)",
        button: { id: "menu_btn_changeclass", label: "Сменить класс" },
      },
      {
        cmd: "/titles",
        desc: "Ваши титулы и достижения",
        button: { id: "menu_btn_titles", label: "Титулы" },
      },
    ],
  },
  combat: {
    label: "⚔️ Бой",
    description: "Дуэли, боссы, турниры",
    color: 0xff4444,
    commands: [
      {
        cmd: "/duel <@игрок> [ставка]",
        desc: "Вызвать игрока на дуэль. Пример: `/duel @user 500`",
      },
      {
        cmd: "/attack_boss",
        desc: "Атаковать текущего мини-босса",
        button: { id: "menu_btn_boss", label: "⚔️ Атаковать босса", style: ButtonStyle.Danger },
      },
      {
        cmd: "/tournament join",
        desc: "Зарегистрироваться на еженедельный турнир",
        button: { id: "menu_btn_tournjoin", label: "🏆 На турнир" },
      },
      {
        cmd: "/tournament status",
        desc: "Статус текущего турнира",
        button: { id: "menu_btn_tournstatus", label: "Статус турнира" },
      },
      {
        cmd: "/leaderboard [тип]",
        desc: "Таблица лидеров",
        button: { id: "menu_btn_leaderboard", label: "📊 Топ" },
      },
    ],
  },
  inventory: {
    label: "🎒 Инвентарь",
    description: "Магазин, предметы, заточка, крафт",
    color: 0x9b59b6,
    commands: [
      {
        cmd: "/inventory",
        desc: "Показать содержимое инвентаря",
        button: { id: "menu_btn_inv", label: "Инвентарь" },
      },
      {
        cmd: "/shop",
        desc: "Магазин улучшений",
        button: { id: "menu_btn_shop", label: "🛒 Магазин" },
      },
      {
        cmd: "/use <тип>",
        desc: "Использовать зелье или экипировать предмет",
      },
      {
        cmd: "/enhance <тип>",
        desc: "Заточить оружие или броню. Пример: `/enhance weapon`",
      },
      {
        cmd: "/craft",
        desc: "Создать предмет из материалов",
        button: { id: "menu_btn_craft", label: "⚒️ Крафт" },
      },
    ],
  },
  progression: {
    label: "📈 Прогресс",
    description: "Фарм, квесты, задания",
    color: 0x2ecc71,
    commands: [
      {
        cmd: "/farm",
        desc: "Встать на фарм опыта (макс. 2 часа)",
        button: { id: "menu_btn_farm", label: "🌾 Фарм" },
      },
      {
        cmd: "/quest",
        desc: "Получить задание и отправиться на квест",
        button: { id: "menu_btn_quest", label: "📜 Квест" },
      },
      {
        cmd: "/daily",
        desc: "Получить ежедневную награду (серия бонусов)",
        button: { id: "menu_btn_daily", label: "🎁 Daily" },
      },
      {
        cmd: "/dailyquests",
        desc: "Ежедневные задания (3 штуки, бонус за все)",
        button: { id: "menu_btn_dq", label: "📋 Задания" },
      },
    ],
  },
};

// Маппинг кнопок → команды для делегирования
const BUTTON_TO_COMMAND = {
  menu_btn_createchar: "createcharacter",
  menu_btn_profile: "profile",
  menu_btn_reset: "resetbuild",
  menu_btn_changeclass: "changeclass",
  menu_btn_titles: "titles",
  menu_btn_boss: "attack_boss",
  menu_btn_tournstatus: null, // спец обработка
  menu_btn_tournjoin: null, // спец
  menu_btn_leaderboard: "leaderboard",
  menu_btn_inv: "inventory",
  menu_btn_shop: "shop",
  menu_btn_craft: "craft",
  menu_btn_farm: "farm",
  menu_btn_quest: "quest",
  menu_btn_daily: "daily",
  menu_btn_dq: "dailyquests",
};

// ─── Slash Command ───
export const data = new SlashCommandBuilder()
  .setName("menu")
  .setDescription("Интерактивное меню всех команд");

export async function execute(interaction) {
  const { embed, components } = buildCategoryView("character");
  await interaction.reply({
    embeds: [embed],
    components,
    flags: MessageFlags.Ephemeral,
  });
}

// ─── Сборка view для категории ───
function buildCategoryView(categoryKey) {
  const cat = CATEGORIES[categoryKey];
  if (!cat) return null;

  const lines = cat.commands.map((c) => `**${c.cmd}**\n${c.desc}`);

  const embed = new EmbedBuilder()
    .setColor(cat.color)
    .setTitle(`📘 Меню — ${cat.label}`)
    .setDescription(lines.join("\n\n"))
    .setFooter({
      text: "Выберите категорию ниже • Кнопки запускают команды напрямую",
    });

  // Select menu — выбор категории
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("menu_category")
    .setPlaceholder("Выберите категорию...")
    .addOptions(
      Object.entries(CATEGORIES).map(([key, c]) => ({
        label: c.label,
        description: c.description,
        value: key,
        default: key === categoryKey,
      }))
    );

  const components = [new ActionRowBuilder().addComponents(selectMenu)];

  // Кнопки команд (макс 5 на ряд, макс 2 ряда = 10 кнопок)
  const buttonsInCategory = cat.commands.filter((c) => c.button);
  const rows = [];
  for (let i = 0; i < buttonsInCategory.length; i += 5) {
    const row = new ActionRowBuilder();
    for (const c of buttonsInCategory.slice(i, i + 5)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(c.button.id)
          .setLabel(c.button.label)
          .setStyle(c.button.style || ButtonStyle.Primary)
      );
    }
    rows.push(row);
  }

  return { embed, components: [...components, ...rows] };
}

// ─── Обработчик выбора категории (select menu) ───
export async function handleMenuSelect(interaction) {
  const categoryKey = interaction.values[0];
  const view = buildCategoryView(categoryKey);
  if (!view) {
    return interaction.update({
      content: "Категория не найдена.",
      embeds: [],
      components: [],
    });
  }
  await interaction.update({
    embeds: [view.embed],
    components: view.components,
  });
}

// ─── Обработчик кнопок меню ───
export async function handleMenuButton(interaction) {
  const id = interaction.customId;

  // Спец обработка для турнира
  if (id === "menu_btn_tournjoin") {
    const { registerPlayer } = await import("../services/tournamentService.js");
    const member = interaction.guild?.members.cache.get(interaction.user.id);
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
      content: `✅ Зарегистрированы! Участников: **${result.participantCount}** | Фонд: **${result.prizePool}** 💰`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (id === "menu_btn_tournstatus") {
    // Делегируем в /tournament status — но subcommand сложно эмулировать
    // Просто показываем статус через прямой запрос
    const { duelModel } = await import("../models/duel.js");
    await duelModel.connect();
    const tourn = await duelModel.client
      .db("SquadJS")
      .collection("tournaments")
      .findOne({ status: { $in: ["registration", "in_progress"] } });

    if (!tourn) {
      return interaction.reply({
        content: "Сейчас нет активного турнира. Следующий — в четверг!",
        flags: MessageFlags.Ephemeral,
      });
    }
    const status =
      tourn.status === "registration"
        ? `📝 Регистрация (участников: ${tourn.participants.length})`
        : `⚔️ В процессе (раунд ${tourn.currentRound})`;
    return interaction.reply({
      content: `🏆 Турнир: ${status}\nФонд: **${tourn.prizePool}** 💰`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Обычные кнопки — делегируем в команду
  const cmdName = BUTTON_TO_COMMAND[id];
  if (!cmdName) {
    return interaction.reply({
      content: "Неизвестная кнопка.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const command = interaction.client.commands.get(cmdName);
  if (!command) {
    return interaction.reply({
      content: `Команда /${cmdName} не найдена.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // Подмешиваем безопасный options shim — некоторые команды читают options.getXxx()
  // На button interaction options отсутствует, поэтому даём заглушку с null defaults.
  if (!interaction.options) {
    interaction.options = {
      getUser: () => null,
      getString: () => null,
      getInteger: () => null,
      getBoolean: () => null,
      getSubcommand: () => null,
    };
  }

  await command.execute(interaction);
}
