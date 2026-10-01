import { test, expect } from "bun:test";
import { createConversationEngine } from "./conversationEngine";
import type { NormalizedMessage, OutgoingMessage, PlatformAdapter } from "./types";

function deps(retrieveContext?: (q: string) => Promise<string>) {
  const sent: { chatId: string; msg: OutgoingMessage }[] = [];
  const promptsSeen: string[] = [];
  const d: any = {
    db: { addChannelMessage() {}, getChannelHistory() { return []; }, pruneChannelHistory() {} },
    ai: {
      async generateText(prompt: string) { promptsSeen.push(prompt); return "jawaban"; },
      async generateContentWithFileContext() { return { text: "x" }; },
    },
    buildSystemPrompt: () => "SYS",
    guardrails: { allowAttachments: true, maxFileSize: 999, allowedChannels: [] },
    responseConfig: { typingIndicator: false, errorMessages: { generic: "e", attachmentFail: "f" } },
    debounceDelayMs: 5,
    retrieveContext,
  };
  const adapter: PlatformAdapter = {
    platform: "discord", async start() {}, async stop() {},
    async sendMessage(chatId, msg) { sent.push({ chatId, msg }); }, async sendTyping() {},
  };
  return { d, adapter, sent, promptsSeen };
}
function msg(over: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return { platform: "discord", messageId: "m1", chatId: "discord:c1", userId: "u1", userName: "B",
    text: "berapa harga premium", isMentioned: true, isDirectMessage: false, attachments: [], timestamp: 1, ...over };
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("konteks RAG disisipkan ke prompt saat retrieveContext ada", async () => {
  const { d, adapter, promptsSeen } = deps(async () => "Kutipan dari 'harga.md':\nPremium 100rb.");
  const engine = createConversationEngine(d);
  await engine.handle(msg(), adapter);
  await wait(40);
  expect(promptsSeen[0]).toContain("Premium 100rb.");
});

test("sapaan dilewati (retrieveContext tak dipanggil)", async () => {
  let called = 0;
  const { d, adapter } = deps(async () => { called++; return "X"; });
  const engine = createConversationEngine(d);
  await engine.handle(msg({ text: "halo" }), adapter);
  await wait(40);
  expect(called).toBe(0);
});

test("tanpa retrieveContext → jalan normal", async () => {
  const { d, adapter, sent } = deps(undefined);
  const engine = createConversationEngine(d);
  await engine.handle(msg(), adapter);
  await wait(40);
  expect(sent.length).toBe(1);
});
