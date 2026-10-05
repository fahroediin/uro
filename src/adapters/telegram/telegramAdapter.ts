import { Bot, type Context } from "grammy";
import { platformConfigs } from "../../config/platforms";
import { splitTextPreserveWords } from "../../helpers/util";
import type { MessageHandler, OutgoingMessage, Platform, PlatformAdapter } from "../../core/types";
import { toNormalizedMessage } from "./telegramMapper";

export function splitForTelegram(text: string): string[] {
  return splitTextPreserveWords(text, platformConfigs.telegram.maxChunkSize);
}

export class TelegramAdapter implements PlatformAdapter {
  readonly platform: Platform = "telegram";
  private bot: Bot;

  constructor(private token: string, private handler: MessageHandler) {
    this.bot = new Bot(token);
  }

  async start(): Promise<void> {
    // Hanya pesan teks pada fase-1.
    this.bot.on("message:text", async (ctx: Context) => {
      try {
        const normalized = toNormalizedMessage(ctx);
        await this.handler(normalized, this);
      } catch (e) {
        console.error("Telegram mapping/handle error:", e);
      }
    });

    this.bot.catch((err) => {
      console.error("Telegram bot error:", err);
    });

    // start() long-polling TIDAK di-await: ia berjalan sampai bot berhenti.
    // Kita tunggu bot.init() supaya tahu bot valid & info bot termuat, lalu
    // biarkan polling jalan di latar.
    await this.bot.init();
    console.log(`🐍 Uro online (Telegram) as @${this.bot.botInfo.username}`);
    void this.bot.start();
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }

  async sendTyping(chatId: string): Promise<void> {
    const id = chatId.replace(/^telegram:/, "");
    await this.bot.api.sendChatAction(id, "typing").catch(() => {});
  }

  async sendMessage(chatId: string, msg: OutgoingMessage): Promise<void> {
    try {
      const id = chatId.replace(/^telegram:/, "");
      const chunks = splitForTelegram(msg.text);
      let first = true;
      for (const chunk of chunks) {
        if (!first) {
          await new Promise((r) => setTimeout(r, platformConfigs.telegram.multiMessageDelayMs));
        }
        // Reply ke pesan pemicu hanya pada chunk pertama (best-effort).
        if (first && msg.replyToMessageId) {
          await this.bot.api.sendMessage(id, chunk, {
            reply_parameters: { message_id: Number(msg.replyToMessageId), allow_sending_without_reply: true },
          });
        } else {
          await this.bot.api.sendMessage(id, chunk);
        }
        first = false;
      }

      // Fase-1 plain text: image (bila ada dari RAG/gen) dikirim sebagai info,
      // pengiriman media Telegram belum diimplementasi.
      if (msg.image) {
        await this.bot.api
          .sendMessage(id, "(gambar tidak dapat dikirim di Telegram pada versi ini)")
          .catch(() => {});
      }
    } catch (e) {
      console.error("Telegram sendMessage error:", e);
    }
  }
}
