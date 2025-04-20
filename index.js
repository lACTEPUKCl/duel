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
import { duelModel } from "./models/duel.js";
import { handleShopSelect } from "./commands/shop.js";
import { handleButton as handleQuestButton } from "./commands/quest.js";
import * as farm from "./commands/farm.js";
dotenv.config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

await duelModel.connect().catch((err) => {
  console.error("Failed to connect to MongoDB:", err);
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
    if (interaction.isCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) await command.execute(interaction);
    } else if (
      interaction.isButton() &&
      interaction.customId.startsWith("duel_accept_")
    ) {
      await handleDuelAccept(interaction);
    } else if (interaction.customId.startsWith("duel_cancel_")) {
      return handleDuelCancel(interaction);
    } else if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "shop_buy"
    ) {
      await handleShopSelect(interaction);
    } else if (
      interaction.isButton() &&
      (interaction.customId.startsWith("quest_accept") ||
        interaction.customId.startsWith("quest_decline") ||
        interaction.customId.startsWith("quest_new"))
    ) {
      await handleQuestButton(interaction);
    } else if (interaction.customId.startsWith("farm_"))
      return farm.handleFarmButton(interaction);
  } catch (error) {
    console.error("Interaction error:", error);
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
      console.error("Failed to send error message:", err);
    }
  }
});

client.once("ready", () => {
  console.log(`Бот запущен как ${client.user.tag}`);
  setInterval(
    () => duelModel.cleanupExpiredDuels().catch(console.error),
    15 * 60 * 1000
  );
});

client.login(process.env.CLIENT_TOKEN);
