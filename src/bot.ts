import env from "../env";
import { buildSystemPrompt, guardrails, responseConfig, persona } from "./config";
import { createConversationEngine } from "./core/conversationEngine";
import { PlatformRegistry } from "./core/platformRegistry";
import { dbService } from "./services/database";
import { aiService } from "./services/googleAi";
import { ragConfig } from "./config/rag";
import { createRagService } from "./services/rag";
import { DiscordAdapter } from "./adapters/discord/discordAdapter";

// RAG (default OFF). Dibangun sebelum engine agar retrieveContext bisa di-inject.
let retrieveContext: ((q: string) => Promise<string>) | undefined;
if (ragConfig.enabled) {
  const rag = createRagService();
  retrieveContext = rag.retrieve;
  // sync() melempar error ke pemanggil -> bungkus agar kegagalan tidak menjatuhkan startup bot.
  try {
    if (ragConfig.syncOnStartBlocking) {
      const r = await rag.sync();
      console.log(`[rag] sync selesai: indexed=${r.indexed} removed=${r.removed}`);
    } else {
      rag
        .sync()
        .then((r) => console.log(`[rag] sync bg: indexed=${r.indexed} removed=${r.removed}`))
        .catch((e) => console.error("[rag] sync bg gagal:", e));
    }
  } catch (e) {
    console.error("[rag] sync saat start gagal:", e);
  }
}

const engine = createConversationEngine({
  db: dbService,
  ai: aiService,
  buildSystemPrompt,
  botName: persona.name,
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
  retrieveContext,
});

const registry = new PlatformRegistry();

if (env.DISCORD_BOT_TOKEN) {
  registry.register(new DiscordAdapter(env.DISCORD_BOT_TOKEN, engine.handle));
}
// Slot masa depan (belum diimplementasi):
// if (env.TELEGRAM_BOT_TOKEN) registry.register(new TelegramAdapter(...));
// if (env.WHATSAPP_ENABLED)   registry.register(new WhatsappAdapter(...));

await registry.startAll();
