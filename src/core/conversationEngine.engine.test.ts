import { test, expect } from "bun:test";
import { createConversationEngine } from "./conversationEngine";
import type { NormalizedMessage, OutgoingMessage, PlatformAdapter } from "./types";

function makeDeps() {
  const sent: { chatId: string; msg: OutgoingMessage }[] = [];
  const added: any[] = [];
  const deps = {
    db: {
      addChannelMessage: (m: any) => added.push(m),
      getChannelHistory: () => [],
      pruneChannelHistory: () => {},
    },
    ai: {
      generateText: async () => "jawaban AI",
      generateContentWithFileContext: async () => ({ text: "jawaban file" }),
    },
    buildSystemPrompt: () => "SYS",
    fetchBuffer: async () => null,
    guardrails: { allowAttachments: true, maxFileSize: 999999, allowedChannels: [] as string[] },
    responseConfig: {
      typingIndicator: false,
      errorMessages: { generic: "error umum", attachmentFail: "gagal file" },
    },
    debounceDelayMs: 5,
  };
  const adapter: PlatformAdapter = {
    platform: "discord",
    start: async () => {},
    stop: async () => {},
    sendMessage: async (chatId, msg) => { sent.push({ chatId, msg }); },
    sendTyping: async () => {},
  };
  return { deps, adapter, sent, added };
}

function msg(over: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return {
    platform: "discord", messageId: "m1", chatId: "discord:c1", userId: "u1",
    userName: "Budi", text: "halo", isMentioned: true, isDirectMessage: false,
    attachments: [], timestamp: 1, ...over,
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("pesan yang dibalas memanggil AI dan mengirim balasan", async () => {
  const { deps, adapter, sent, added } = makeDeps();
  const engine = createConversationEngine(deps as any);
  await engine.handle(msg(), adapter);
  await wait(40);
  expect(added.length).toBe(1);              // tercatat ke history
  expect(sent.length).toBe(1);               // ada balasan
  expect(sent[0].msg.text).toBe("jawaban AI");
});

test("pesan tanpa mention di channel non-terdaftar: tercatat tapi tidak dibalas", async () => {
  const { deps, adapter, sent, added } = makeDeps();
  const engine = createConversationEngine(deps as any);
  await engine.handle(msg({ isMentioned: false, chatId: "discord:lain" }), adapter);
  await wait(40);
  expect(added.length).toBe(1);
  expect(sent.length).toBe(0);
});

test("allowedChannels berisi RAW id (tanpa prefix) tetap match dengan chatId ber-prefix", async () => {
  const { deps, adapter, sent, added } = makeDeps();
  // allowedChannels diisi RAW id (tanpa prefix platform), sedangkan chatId pesan
  // yang sesungguhnya sudah diberi prefix "discord:". Gate ini seharusnya tetap
  // meloloskan balasan karena unprefixed id juga dicocokkan.
  deps.guardrails.allowedChannels = ["c1"];
  const engine = createConversationEngine(deps as any);
  // isMentioned: true supaya lolos gate shouldRespond() terlepas dari respondChannelIds,
  // sehingga test ini murni memverifikasi gate allowedChannels di conversationEngine.
  await engine.handle(msg({ isMentioned: true, chatId: "discord:c1" }), adapter);
  await wait(40);
  expect(added.length).toBe(1);
  expect(sent.length).toBe(1);
  expect(sent[0].msg.text).toBe("jawaban AI");
});

test("dua pesan cepat user sama → satu pemanggilan AI (debounce)", async () => {
  const { deps, adapter, sent } = makeDeps();
  let aiCalls = 0;
  (deps.ai as any).generateText = async () => { aiCalls++; return "x"; };
  const engine = createConversationEngine(deps as any);
  await engine.handle(msg({ messageId: "a", text: "satu" }), adapter);
  await engine.handle(msg({ messageId: "b", text: "dua" }), adapter);
  await wait(60);
  expect(aiCalls).toBe(1);
});

test("error dari AI → kirim pesan error generic", async () => {
  const { deps, adapter, sent } = makeDeps();
  (deps.ai as any).generateText = async () => { throw new Error("boom"); };
  const engine = createConversationEngine(deps as any);
  await engine.handle(msg(), adapter);
  await wait(40);
  expect(sent.some((s) => s.msg.text === "error umum")).toBe(true);
});
