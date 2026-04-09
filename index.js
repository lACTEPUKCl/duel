import {
  Client,
  GatewayIntentBits,
  Collection,
  MessageFlags,
} from "discord.js";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import { handleDuelAccept } from "./commands/duelGame.js";
import { handleDuelCancel } from "./commands/duel.js";
import { handleBossAttack } from "./commands/attack_boss.js";
import { duelModel } from "./models/duel.js";
import { handleShopSelect } from "./commands/shop.js";
import { handleButton as handleQuestButton } from "./commands/quest.js";
import * as farm from "./commands/farm.js";
import { logger } from "./utils/logger.js";
import { initScheduler } from "./services/eventScheduler.js";
import { registerPlayer } from "./services/tournamentService.js";
dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

await duelModel.connect().catch((err) => {
  logger.error("Failed to connect to MongoDB:", err);
  process.exit(1);
});

const commands = [];
const commandsPath = join(dirname(fileURLToPath(import.meta.url)), "commands");
const commandFiles = readdirSync(commandsPath).filter((file) =>
  file.endsWith(".js")
);

for (const file of commandFiles) {
  const filePath = join(commandsPath, file);
  const command = await import(pathToFileURL(filePath).href);
  if ("data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
  }
}

client.on("interactionCreate", async (interaction) => {
  try {
    // ─── Slash commands ───
    if (interaction.isCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) await command.execute(interaction);
      return;
    }

    // ─── Buttons ───
    if (interaction.isButton()) {
      const id = interaction.customId;

      if (id.startsWith("duel_accept_")) {
        return await handleDuelAccept(interaction);
      }
      if (id.startsWith("duel_cancel_")) {
        return await handleDuelCancel(interaction);
      }
      if (
        id.startsWith("quest_accept") ||
        id.startsWith("quest_decline") ||
        id.startsWith("quest_new")
      ) {
        return await handleQuestButton(interaction);
      }
      if (id.startsWith("farm_")) {
        return await farm.handleFarmButton(interaction);
      }

      // ─── Boss attack button ───
      if (id === "boss_attack") {
        return await handleBossAttack(interaction, true);
      }

      // ─── Menu buttons ───
      if (id.startsWith("menu_")) {
        const { handleMenuButton } = await import("./commands/menu.js");
        return await handleMenuButton(interaction);
      }

      if (id === "tournament_join") {
        const member = interaction.guild?.members.cache.get(
          interaction.user.id
        );
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
            `✅ Вы зарегистрированы! Участников: **${result.participantCount}** | Призовой фонд: **${result.prizePool}** 💰`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    // ─── Select menus ───
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "shop_buy") {
        return await handleShopSelect(interaction);
      }
      if (interaction.customId === "menu_category") {
        const { handleMenuSelect } = await import("./commands/menu.js");
        return await handleMenuSelect(interaction);
      }
    }
  } catch (error) {
    logger.error("Interaction error:", error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Произошла ошибка при выполнении команды",
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.followUp({
          content: "❌ Произошла ошибка при выполнении команды",
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (err) {
      logger.error("Failed to send error message:", err);
    }
  }
});

client.once("ready", () => {
  logger.info(`Бот запущен как ${client.user.tag}`);

  // Очистка просроченных дуэлей
  setInterval(
    () => duelModel.cleanupExpiredDuels().catch((e) => logger.error("Cleanup error:", e)),
    15 * 60 * 1000
  );

  // Инициализация ивент-системы (боссы, турниры)
  initScheduler(client);
});

client.login(process.env.CLIENT_TOKEN);
