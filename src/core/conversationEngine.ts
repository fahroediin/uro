import { platformConfigs } from "../config/platforms";
import { formatTimestamp } from "../helpers/util";
import type {
  MessageHandler,
  NormalizedMessage,
  OutgoingMessage,
  Platform,
  PlatformAdapter,
} from "./types";

export function shouldRespond(msg: NormalizedMessage): boolean {
  const cfg = platformConfigs[msg.platform];
  return (
    (msg.isDirectMessage && cfg.respondInDM) ||
    msg.isMentioned ||
    cfg.respondChannelIds.includes(msg.chatId)
  );
}

export type DbLike = {
  addChannelMessage(m: {
    messageId: string; channelId: string; content: string; authorId: string;
    authorUsername: string; timestamp: number; repliedMessage: string;
    repliedMessageId: string; repliedTo: string;
  }): void;
  getChannelHistory(chatId: string): { timestamp: number; authorUsername: string; content: string }[];
  pruneChannelHistory(chatId: string): void;
};

export type AiLike = {
  generateText(prompt: string, history: string, sys: string): Promise<string>;
  generateContentWithFileContext(
    prompt: string,
    attachmentMeta: { name: string; contentType: string },
    buffer: ArrayBuffer,
    history: string,
    sys: string
  ): Promise<{ text: string; image?: Buffer }>;
};

export interface EngineDeps {
  db: DbLike;
  ai: AiLike;
  buildSystemPrompt: (userName: string, platform: Platform) => string;
  fetchBuffer?: (url: string) => Promise<ArrayBuffer | null>;
  guardrails: { allowAttachments: boolean; maxFileSize: number; allowedChannels: string[] };
  responseConfig: { typingIndicator: boolean; errorMessages: { generic: string; attachmentFail: string } };
  debounceDelayMs: number;
}

export function createConversationEngine(deps: EngineDeps): { handle: MessageHandler } {
  const processing = new Set<string>();
  const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, { msgs: NormalizedMessage[]; adapter: PlatformAdapter }>();

  async function defaultFetch(url: string): Promise<ArrayBuffer | null> {
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      return await r.arrayBuffer();
    } catch {
      return null;
    }
  }
  const fetchBuffer = deps.fetchBuffer ?? defaultFetch;

  async function processBatch(key: string) {
    const bucket = pending.get(key);
    if (!bucket || bucket.msgs.length === 0) return;
    pending.delete(key);
    const { msgs, adapter } = bucket;
    const primary = msgs[msgs.length - 1];
    if (processing.has(primary.messageId)) return;
    processing.add(primary.messageId);
    try {
      await process(primary, msgs, adapter);
    } finally {
      processing.delete(primary.messageId);
      deps.db.pruneChannelHistory(primary.chatId);
    }
  }

  async function process(primary: NormalizedMessage, all: NormalizedMessage[], adapter: PlatformAdapter) {
    for (const m of all) {
      deps.db.addChannelMessage({
        messageId: m.messageId, channelId: m.chatId, content: m.text.substring(0, 500),
        authorId: m.userId, authorUsername: m.userName, timestamp: m.timestamp,
        repliedMessage: m.repliedTo?.text.substring(0, 50) || "",
        repliedMessageId: "", repliedTo: m.repliedTo?.userName || "",
      });
    }

    if (!shouldRespond(primary)) return;
    if (deps.guardrails.allowedChannels.length > 0) {
      const rawChatId = primary.chatId.includes(":")
        ? primary.chatId.slice(primary.chatId.indexOf(":") + 1)
        : primary.chatId;
      if (
        !deps.guardrails.allowedChannels.includes(primary.chatId) &&
        !deps.guardrails.allowedChannels.includes(rawChatId)
      ) {
        return;
      }
    }

    if (deps.responseConfig.typingIndicator) {
      await adapter.sendTyping(primary.chatId).catch(() => {});
    }

    const sys = deps.buildSystemPrompt(primary.userName, primary.platform);

    let att = deps.guardrails.allowAttachments
      ? all.flatMap((m) => m.attachments).find((a) => a.size <= deps.guardrails.maxFileSize)
      : undefined;

    const history = deps.db
      .getChannelHistory(primary.chatId)
      .map((h) => `[${formatTimestamp(h.timestamp)}] ${h.authorUsername}: ${h.content}`)
      .join("\n");

    let prompt = "";
    if (all.length > 1) {
      prompt += `User sent ${all.length} messages in quick succession:\n`;
      all.forEach((m, i) => { prompt += `Message ${i + 1}: ${m.text}\n`; });
      prompt += `Respond naturally to their complete thought.`;
    } else {
      prompt += primary.text;
    }
    if (primary.repliedTo) {
      prompt += `\n(The user is replying to ${primary.repliedTo.userName}: "${primary.repliedTo.text}")`;
    }

    async function reply(text: string, image?: Buffer) {
      const out: OutgoingMessage = { text, image, replyToMessageId: primary.messageId };
      await adapter.sendMessage(primary.chatId, out);
    }

    if (att) {
      prompt += `\n(The conversation involves an attachment. Analyze it if relevant.)`;
      const buffer = att.buffer ?? (att.url ? await fetchBuffer(att.url) : null);
      if (buffer) {
        const content = await deps.ai.generateContentWithFileContext(
          prompt, { name: att.fileName, contentType: att.mimeType }, buffer, history, sys
        );
        await reply(content.text, content.image);
      } else {
        await reply(deps.responseConfig.errorMessages.attachmentFail);
      }
    } else {
      const text = await deps.ai.generateText(prompt, history, sys);
      await reply(text);
    }
  }

  const handle: MessageHandler = async (msg, adapter) => {
    const key = `${msg.userId}-${msg.chatId}`;
    const existing = timeouts.get(key);
    if (existing) clearTimeout(existing);
    if (!pending.has(key)) pending.set(key, { msgs: [], adapter });
    pending.get(key)!.msgs.push(msg);

    const t = setTimeout(async () => {
      try {
        await processBatch(key);
      } catch {
        await adapter
          .sendMessage(msg.chatId, { text: deps.responseConfig.errorMessages.generic })
          .catch(() => {});
      } finally {
        timeouts.delete(key);
      }
    }, deps.debounceDelayMs);
    timeouts.set(key, t);
  };

  return { handle };
}
