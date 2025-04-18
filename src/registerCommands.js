import { Client, GatewayIntentBits, Events } from "discord.js";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config } from "dotenv";

config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const commandsPath = join(__dirname, "commands");
const commandFiles = readdirSync(commandsPath).filter((file) =>
  file.endsWith(".js")
);

const localCommands = [];
for (const file of commandFiles) {
  const filePath = join(commandsPath, file);
  const command = await import(pathToFileURL(filePath).href);
  if ("data" in command && "execute" in command) {
    localCommands.push(command.data.toJSON());
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) {
    console.error("Guild not found!");
    await client.destroy();
    return;
  }

  console.log("Удаляю существующие команды...");
  const registeredCommands = await guild.commands.fetch();
  for (const command of registeredCommands.values()) {
    await command.delete();
  }
  console.log("Существующие команды удалены.");
  console.log("Регистрирую новые команды...");
  for (const command of localCommands) {
    await guild.commands.create(command);
  }
  console.log(`Зарегистрировано ${localCommands.length} команд.`);

  await client.destroy();
});

client.login(process.env.CLIENT_TOKEN);
