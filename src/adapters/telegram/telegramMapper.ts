import type { Context } from "grammy";
import type { NormalizedMessage } from "../../core/types";

/**
 * Terjemahkan grammy Context (pesan teks) -> NormalizedMessage.
 * Fase-1: fokus teks; attachment Telegram belum dipetakan.
 */
export function toNormalizedMessage(ctx: Context): NormalizedMessage {
  const msg: any = ctx.message;
  const chat: any = ctx.chat;
  const from: any = ctx.from ?? {};
  const botId = (ctx as any).me?.id;
  const botUsername = (ctx as any).me?.username;

  const text: string = msg?.text ?? "";
  const isDirectMessage = chat?.type === "private";

  // Di grup: dianggap "mention" bila menyebut @botusername ATAU me-reply pesan bot.
  const mentionsBot =
    !!botUsername && text.toLowerCase().includes(`@${botUsername.toLowerCase()}`);
  const repliesToBot = !!botId && msg?.reply_to_message?.from?.id === botId;
  const isMentioned = isDirectMessage ? true : mentionsBot || repliesToBot;

  const repliedRaw = msg?.reply_to_message;
  const repliedTo = repliedRaw
    ? {
        text: String(repliedRaw.text ?? ""),
        userName: String(repliedRaw.from?.first_name ?? repliedRaw.from?.username ?? ""),
      }
    : undefined;

  return {
    platform: "telegram",
    messageId: String(msg?.message_id ?? ""),
    chatId: `telegram:${chat?.id}`,
    userId: String(from.id ?? ""),
    userName: String(from.first_name ?? from.username ?? "User"),
    text,
    isMentioned,
    isDirectMessage,
    repliedTo,
    attachments: [],
    timestamp: (msg?.date ?? Math.floor(Date.now() / 1000)) * 1000,
  };
}
