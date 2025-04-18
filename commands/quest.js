import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { duelModel } from "../models/duel.js";
import { checkUserBinding } from "../utils/checkUserBinding.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const questsData = JSON.parse(
  readFileSync(join(__dirname, "../quests.json"), "utf8")
);
const quests = questsData.quests;
const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;

export const data = new SlashCommandBuilder()
  .setName("quest")
  .setDescription(
    "Управляйте квестами: получите новое задание или смотрите статус активного квеста"
  );

export async function execute(interaction) {
  const userDoc = await checkUserBinding(interaction);
  if (!userDoc) return;

  const now = Date.now();

  try {
    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
    const user = await statsColl.findOne({ discordid: interaction.user.id });

    if (!user.duelGame.activeQuest) {
      if (
        user.duelGame.lastQuestFinished &&
        now - user.duelGame.lastQuestFinished < DAILY_COOLDOWN
      ) {
        const remainingMs =
          DAILY_COOLDOWN - (now - user.duelGame.lastQuestFinished);
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        return interaction.reply({
          content: `Вы уже проходили квест сегодня. Новый квест можно получить через примерно ${remainingMinutes} минут.`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const quest = quests[Math.floor(Math.random() * quests.length)];
      const newQuest = {
        questId: quest.id,
        description: quest.description,
        duration: quest.duration,
        chance: quest.chance,
        success: quest.success,
        failure: quest.failure,
        acceptedAt: null,
        finished: false,
      };

      await statsColl.updateOne(
        { discordid: interaction.user.id },
        { $set: { "duelGame.activeQuest": newQuest } }
      );

      const embed = new EmbedBuilder()
        .setTitle("Новый квест!")
        .setDescription(newQuest.description)
        .addFields(
          {
            name: "Время выполнения",
            value: `${newQuest.duration / 3600000} ч.`,
            inline: true,
          },
          {
            name: "Шанс успеха",
            value: `${Math.floor(newQuest.chance * 100)}%`,
            inline: true,
          },
          {
            name: "Награда при успехе",
            value: `XP: ${newQuest.success.xp}, Бонусы: ${newQuest.success.bonus}`,
            inline: false,
          },
          {
            name: "Последствия провала",
            value: `XP: ${newQuest.failure.xp}, Бонусы: ${newQuest.failure.bonus}`,
            inline: false,
          }
        )
        .setColor(0x3498db);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("quest_accept")
          .setLabel("Принять")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("quest_decline")
          .setLabel("Отказаться")
          .setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    }

    const activeQuest = user.duelGame.activeQuest;
    if (activeQuest.acceptedAt === null) {
      const embed = new EmbedBuilder()
        .setTitle("Предложение квеста")
        .setDescription(activeQuest.description)
        .addFields(
          {
            name: "Время выполнения",
            value: `${activeQuest.duration / 3600000} ч.`,
            inline: true,
          },
          {
            name: "Шанс успеха",
            value: `${Math.floor(activeQuest.chance * 100)}%`,
            inline: true,
          },
          {
            name: "Последствия провала",
            value: `XP: ${activeQuest.failure.xp}, Бонусы: ${activeQuest.failure.bonus}`,
            inline: false,
          }
        )
        .setColor(0x3498db);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("quest_accept")
          .setLabel("Принять")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("quest_decline")
          .setLabel("Отказаться")
          .setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral,
      });
    }

    const finishTime = activeQuest.acceptedAt + activeQuest.duration;
    if (now < finishTime) {
      const remainingMinutes = Math.ceil((finishTime - now) / 60000);
      return interaction.reply({
        content: `Вы находитесь на квесте: "${activeQuest.description}". Осталось примерно ${remainingMinutes} минут.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!activeQuest.finished) {
      const isSuccess = Math.random() < activeQuest.chance;
      const outcome = isSuccess ? activeQuest.success : activeQuest.failure;
      const lootItems = [];
      if (Array.isArray(outcome.loot)) {
        for (const loot of outcome.loot) {
          if (Math.random() < loot.chance) {
            lootItems.push(
              loot.stats
                ? {
                    id: loot.id,
                    name: loot.name,
                    enhance: loot.enhance ?? 0,
                    stats: loot.stats,
                  }
                : { id: loot.id, enhance: 0 }
            );
          }
        }
      }
      activeQuest.finished = true;
      activeQuest.finishedAt = now;
      activeQuest.outcome = { ...outcome, lootItems, isSuccess };

      const updateDoc = {
        $set: {
          "duelGame.activeQuest": activeQuest,
          "duelGame.lastQuestFinished": now,
        },
        $inc: { "duelGame.xp": outcome.xp, bonuses: outcome.bonus },
      };
      if (isSuccess && lootItems.length) {
        updateDoc.$push = { "duelGame.inventory": { $each: lootItems } };
      }
      await statsColl.updateOne({ discordid: interaction.user.id }, updateDoc);
    }

    const {
      lootItems,
      isSuccess,
      xp: outcomeXp,
      bonus: outcomeBonus,
    } = activeQuest.outcome;
    const names = Array.isArray(lootItems)
      ? lootItems.map((item) => item.name || item.id)
      : [];
    const lootText =
      isSuccess && names.length ? `\nВам выпало: ${names.join(", ")}` : "";
    const resultText = isSuccess ? "Победа" : "Поражение";
    const rewardLabel = isSuccess ? "Награда" : "Штраф";

    return interaction.reply({
      content:
        `Квест "${activeQuest.description}" завершён.\n` +
        `Результат: ${resultText}.\n` +
        `${rewardLabel}: XP: ${outcomeXp}, бонусы: ${outcomeBonus}.${lootText}`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error(err);
    return interaction.reply({
      content: "Ошибка при обработке квеста.",
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function handleButton(interaction) {
  const now = Date.now();
  try {
    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");
    const user = await statsColl.findOne({ discordid: interaction.user.id });
    if (!user?.duelGame.activeQuest) {
      return interaction.reply({
        content: "У вас нет активного квеста.",
        flags: MessageFlags.Ephemeral,
      });
    }
    const activeQuest = user.duelGame.activeQuest;
    if (interaction.customId === "quest_accept") {
      if (activeQuest.acceptedAt !== null) {
        return interaction.reply({
          content: "Квест уже принят.",
          flags: MessageFlags.Ephemeral,
        });
      }
      activeQuest.acceptedAt = now;
      await statsColl.updateOne(
        { discordid: interaction.user.id },
        { $set: { "duelGame.activeQuest": activeQuest } }
      );
      return interaction.update({
        content: `Квест "${activeQuest.description}" принят!`,
        components: [],
        flags: MessageFlags.Ephemeral,
      });
    } else if (interaction.customId === "quest_decline") {
      await statsColl.updateOne(
        { discordid: interaction.user.id },
        {
          $unset: { "duelGame.activeQuest": "" },
          $set: { "duelGame.lastQuestFinished": now },
        }
      );
      return interaction.update({
        content:
          "Вы отказались от квеста. Новый квест можно получить через 24 часа.",
        components: [],
        flags: MessageFlags.Ephemeral,
      });
    } else if (interaction.customId === "quest_new") {
      if (
        user.duelGame.lastQuestFinished &&
        now - user.duelGame.lastQuestFinished < DAILY_COOLDOWN
      ) {
        return interaction.reply({
          content:
            "Новый квест можно получить только через сутки после предыдущего.",
          flags: MessageFlags.Ephemeral,
        });
      }
      await statsColl.updateOne(
        { discordid: interaction.user.id },
        { $unset: { "duelGame.activeQuest": "" } }
      );
      return interaction.update({
        content: "Теперь вы можете ввести /quest для получения нового квеста.",
        components: [],
        flags: MessageFlags.Ephemeral,
      });
    } else {
      return interaction.reply({
        content: "Неизвестное действие.",
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (err) {
    console.error(err);
    return interaction.reply({
      content: "Ошибка при обработке кнопки квеста.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
