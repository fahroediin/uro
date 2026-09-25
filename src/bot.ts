import env from "../env";
import { buildSystemPrompt, guardrails, responseConfig } from "./config";
import { createConversationEngine } from "./core/conversationEngine";
import { PlatformRegistry } from "./core/platformRegistry";
import { dbService } from "./services/database";
import { aiService } from "./services/googleAi";
import { DiscordAdapter } from "./adapters/discord/discordAdapter";

const engine = createConversationEngine({
  db: dbService,
  ai: aiService,
  buildSystemPrompt,
  guardrails: {
    allowAttachments: guardrails.allowAttachments,
    maxFileSize: guardrails.maxFileSize,
    allowedChannels: guardrails.allowedChannels,
  },
  responseConfig: {
    typingIndicator: responseConfig.typingIndicator,
    errorMessages: {
      generic: responseConfig.errorMessages.generic,
      attachmentFail: responseConfig.errorMessages.attachmentFail,
    },
  },
  debounceDelayMs: responseConfig.debounceDelayMs,
});

const registry = new PlatformRegistry();

if (env.DISCORD_BOT_TOKEN) {
  registry.register(new DiscordAdapter(env.DISCORD_BOT_TOKEN, engine.handle));
}
// Slot masa depan (belum diimplementasi):
// if (env.TELEGRAM_BOT_TOKEN) registry.register(new TelegramAdapter(...));
// if (env.WHATSAPP_ENABLED)   registry.register(new WhatsappAdapter(...));

await registry.startAll();
