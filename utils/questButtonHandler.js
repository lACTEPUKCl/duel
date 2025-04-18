import { MessageFlags } from "discord.js";
import { duelModel } from "../models/duel.js";

const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;

export async function handleButton(interaction) {
  try {
    await duelModel.connect();
    const statsColl = duelModel.client.db("SquadJS").collection("mainstats");

    const user = await statsColl.findOne({ discordid: interaction.user.id });
    if (!user?.duelGame?.activeQuest) {
      return interaction.reply({
        content: "У вас нет активного квеста.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const activeQuest = user.duelGame.activeQuest;
    const now = Date.now();
    const id = interaction.customId;

    if (activeQuest.finished) {
      const { outcome } = activeQuest;
      const resultText =
        outcome?.outcomeType === "success"
          ? "Вы успешно завершили квест"
          : "Вы проиграли квест";
      let msg =
        `Квест "${activeQuest.description}" завершён.\n` +
        `Результат: ${resultText}.\n` +
        `Награда: XP: ${outcome.xp}, бонусы: ${outcome.bonus}.`;
      if (Array.isArray(outcome.lootResults) && outcome.lootResults.length) {
        msg += `\nВам выпало: ${outcome.lootResults.join(", ")}`;
      }
      return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    }

    if (id.startsWith("quest_accept")) {
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
        content: `Квест "${activeQuest.description}" принят! Ждите завершения квеста.`,
        components: [],
      });
    }

    if (id.startsWith("quest_decline")) {
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
      });
    }

    if (id.startsWith("quest_new")) {
      if (
        user.duelGame.lastQuestFinished &&
        now - user.duelGame.lastQuestFinished < DAILY_COOLDOWN
      ) {
        const remainingMs =
          DAILY_COOLDOWN - (now - user.duelGame.lastQuestFinished);
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        return interaction.reply({
          content: `Новый квест можно получить только через ${remainingMinutes} минут.`,
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
      });
    }

    return interaction.reply({
      content: "Неизвестное действие.",
      flags: MessageFlags.Ephemeral,
    });
  } catch (err) {
    console.error("Ошибка в questButtonHandler:", err);
    return interaction.reply({
      content: "Ошибка при обработке кнопки квеста.",
      flags: MessageFlags.Ephemeral,
    });
  }
}
