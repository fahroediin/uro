import { test, expect } from "bun:test";
import { createConversationEngine } from "./conversationEngine";
import type { NormalizedMessage, OutgoingMessage, PlatformAdapter } from "./types";

type Saved = {
  channelId: string;
  authorUsername: string;
  content: string;
  authorId: string;
};

function makeDeps(opts: { aiText?: string; generateThrows?: boolean; stripEmoji?: boolean } = {}) {
  const saved: Saved[] = [];
  const sent: { chatId: string; msg: OutgoingMessage }[] = [];
  const d: any = {
    db: {
      addChannelMessage(m: Saved) { saved.push(m); },
      getChannelHistory() { return []; },
      pruneChannelHistory() {},
    },
    ai: {
      async generateText() {
        if (opts.generateThrows) throw new Error("boom");
        return opts.aiText ?? "jawaban bot";
      },
      async generateContentWithFileContext() { return { text: "x" }; },
    },
    buildSystemPrompt: () => "SYS",
    botName: "Uro",
    stripEmoji: opts.stripEmoji ?? false,
    guardrails: { allowAttachments: true, maxFileSize: 999, allowedChannels: [] },
    responseConfig: { typingIndicator: false, errorMessages: { generic: "ERR", attachmentFail: "f" } },
    debounceDelayMs: 5,
  };
  const adapter: PlatformAdapter = {
    platform: "discord", async start() {}, async stop() {},
    async sendMessage(chatId, msg) { sent.push({ chatId, msg }); },
    async sendTyping() {},
  };
  return { d, adapter, saved, sent };
}

function msg(over: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return {
    platform: "discord", messageId: "m1", chatId: "discord:c1", userId: "u1", userName: "Budi",
    text: "berapa harga premium", isMentioned: true, isDirectMessage: false,
    attachments: [], timestamp: 1, ...over,
  };
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("balasan bot disimpan ke history dengan nama bot", async () => {
  const { d, adapter, saved } = makeDeps({ aiText: "Harga premium 100rb." });
  const engine = createConversationEngine(d);
  await engine.handle(msg(), adapter);
  await wait(40);

  // pesan user tercatat
  expect(saved.some((s) => s.authorUsername === "Budi" && s.content.includes("harga premium"))).toBe(true);
  // balasan bot juga tercatat, dengan nama bot
  const botEntry = saved.find((s) => s.authorUsername === "Uro");
  expect(botEntry).toBeDefined();
  expect(botEntry!.content).toContain("Harga premium 100rb.");
  expect(botEntry!.channelId).toBe("discord:c1");
});

test("stripEmoji on: balasan terkirim & tersimpan tanpa emoji", async () => {
  const { d, adapter, saved, sent } = makeDeps({
    aiText: "Yuhu juga, Fahrudin. Ada perlu apa? 🐍",
    stripEmoji: true,
  });
  const engine = createConversationEngine(d);
  await engine.handle(msg(), adapter);
  await wait(40);

  expect(sent[0].msg.text).toBe("Yuhu juga, Fahrudin. Ada perlu apa?");
  const botEntry = saved.find((s) => s.authorUsername === "Uro");
  expect(botEntry!.content.includes("🐍")).toBe(false);
});

test("stripEmoji off: emoji dibiarkan", async () => {
  const { d, adapter, sent } = makeDeps({ aiText: "halo 🐍", stripEmoji: false });
  const engine = createConversationEngine(d);
  await engine.handle(msg(), adapter);
  await wait(40);
  expect(sent[0].msg.text).toBe("halo 🐍");
});

test("pesan error TIDAK disimpan ke history", async () => {
  const { d, adapter, saved } = makeDeps({ generateThrows: true });
  const engine = createConversationEngine(d);
  await engine.handle(msg(), adapter);
  await wait(40);

  // tidak ada entry bot berisi teks error generik
  expect(saved.some((s) => s.authorUsername === "Uro" && s.content.includes("ERR"))).toBe(false);
});
