# Uro Multi-Platform Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pisahkan core Uro dari Discord menjadi arsitektur core + adapter, sehingga Telegram & WhatsApp bisa ditambahkan tanpa menyentuh core; Discord tetap 100% berfungsi.

**Architecture:** Tiga lapis ketergantungan satu arah `adapters/* → core/* → services/* & config/*`. Adapter menerjemahkan pesan platform ke `NormalizedMessage` dan mengimplementasi `PlatformAdapter`. Core (`conversationEngine`) menerima dependency (db, aiService, config) lewat injeksi agar dapat diuji tanpa jaringan/DB nyata. Chunking pesan keluar milik adapter, dengan `maxChunkSize` per-platform.

**Tech Stack:** Bun, TypeScript, discord.js v14, @google/genai, zod, bun:sqlite, bun test.

**Spec:** `docs/superpowers/specs/2026-09-25-uro-multi-platform-refactor-design.md`

## Global Constraints

- Runtime **Bun**, bukan Node.js. Test pakai `bun test`. Tidak menambah dependency runtime baru di Fase 1.
- Core (`src/core/*`) TIDAK boleh meng-import `discord.js` — dijaga oleh test/grep.
- `chatId` SELALU ber-prefix platform, mis. `discord:<id>`. Adapter yang menempel prefix.
- `services/googleAi.ts` dan `services/keyRotator.ts` TIDAK diubah.
- Skema tabel SQLite TIDAK diubah (`channelId` string generik menampung `chatId` ber-prefix).
- Perilaku Discord harus identik: mention & pesan di `BOT_CHANNEL_ID` dibalas; DM tidak (status quo); attachment dianalisis; pesan panjang di-split ≤2000, kata tidak terpotong; jeda antar-chunk dipertahankan.
- Commit langsung ke `main` (konvensi repo, tanpa feature branch).
- Attribution commit: akhiri pesan commit dengan `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `src/core/types.ts` — [BARU] tipe: `Platform`, `NormalizedAttachment`, `NormalizedMessage`, `OutgoingMessage`, `PlatformAdapter`, `MessageHandler`.
- `src/config/platforms.ts` — [BARU] `PlatformConfig` + `platformConfigs`.
- `src/config/systemPrompt.ts` — [UBAH] `buildSystemPrompt(userName, platform)`.
- `src/config/index.ts` — [UBAH] export `platformConfigs`.
- `src/core/conversationEngine.ts` — [BARU] logika pemrosesan (ex-`messageHandler`), dependency di-inject.
- `src/core/platformRegistry.ts` — [BARU] start/stop adapter.
- `src/adapters/discord/discordMapper.ts` — [BARU] `Message` → `NormalizedMessage`.
- `src/adapters/discord/discordAdapter.ts` — [BARU] `PlatformAdapter` Discord (ex-`client.ts` + pengiriman + chunking).
- `src/bot.ts` — [UBAH] rakit engine + registry + adapter Discord.
- `src/handlers/messageHandler.ts` — [HAPUS] di Task terakhir.
- `src/client.ts` — [HAPUS] di Task terakhir.
- `src/helpers/util.ts` — tetap (`splitTextPreserveWords` dipakai adapter).
- `package.json` — [UBAH] tambah script `"test": "bun test"`.
- Test: `src/core/*.test.ts`, `src/adapters/discord/*.test.ts`.

---

## Task 1: Tipe inti + guard "tidak ada discord.js di core"

**Files:**
- Create: `src/core/types.ts`
- Test: `src/core/types.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `type Platform = "discord" | "telegram" | "whatsapp"`
  - `interface NormalizedAttachment { url?: string; buffer?: ArrayBuffer; mimeType: string; size: number; fileName: string }`
  - `interface NormalizedMessage { platform: Platform; messageId: string; chatId: string; userId: string; userName: string; text: string; isMentioned: boolean; isDirectMessage: boolean; repliedTo?: { text: string; userName: string }; attachments: NormalizedAttachment[]; timestamp: number }`
  - `interface OutgoingMessage { text: string; image?: Buffer; replyToMessageId?: string }`
  - `interface PlatformAdapter { readonly platform: Platform; start(): Promise<void>; stop(): Promise<void>; sendMessage(chatId: string, msg: OutgoingMessage): Promise<void>; sendTyping(chatId: string): Promise<void> }`
  - `type MessageHandler = (msg: NormalizedMessage, adapter: PlatformAdapter) => Promise<void>`

- [ ] **Step 1: Write the failing test**

`src/core/types.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import type { NormalizedMessage, OutgoingMessage, PlatformAdapter } from "./types";

test("NormalizedMessage & OutgoingMessage dapat dibentuk sesuai kontrak", () => {
  const msg: NormalizedMessage = {
    platform: "discord",
    messageId: "m1",
    chatId: "discord:c1",
    userId: "u1",
    userName: "Budi",
    text: "halo",
    isMentioned: true,
    isDirectMessage: false,
    attachments: [],
    timestamp: 123,
  };
  const out: OutgoingMessage = { text: "hai" };
  expect(msg.chatId.startsWith("discord:")).toBe(true);
  expect(out.text).toBe("hai");
});

test("core/types.ts tidak meng-import discord.js", () => {
  const src = readFileSync(join(import.meta.dir, "types.ts"), "utf8");
  expect(src.includes("discord.js")).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/core/types.test.ts`
Expected: FAIL — `Cannot find module './types'`.

- [ ] **Step 3: Write minimal implementation**

`src/core/types.ts`:
```typescript
export type Platform = "discord" | "telegram" | "whatsapp";

export interface NormalizedAttachment {
  url?: string;
  buffer?: ArrayBuffer;
  mimeType: string;
  size: number;
  fileName: string;
}

export interface NormalizedMessage {
  platform: Platform;
  messageId: string;
  chatId: string;
  userId: string;
  userName: string;
  text: string;
  isMentioned: boolean;
  isDirectMessage: boolean;
  repliedTo?: { text: string; userName: string };
  attachments: NormalizedAttachment[];
  timestamp: number;
}

export interface OutgoingMessage {
  text: string;
  image?: Buffer;
  replyToMessageId?: string;
}

export interface PlatformAdapter {
  readonly platform: Platform;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(chatId: string, msg: OutgoingMessage): Promise<void>;
  sendTyping(chatId: string): Promise<void>;
}

export type MessageHandler = (
  msg: NormalizedMessage,
  adapter: PlatformAdapter
) => Promise<void>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/core/types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/types.test.ts
git commit -m "feat(core): tipe pesan netral platform-agnostic

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Config per-platform + script test

**Files:**
- Create: `src/config/platforms.ts`
- Modify: `src/config/index.ts:1-9`, `package.json:6-8`
- Test: `src/config/platforms.test.ts`

**Interfaces:**
- Consumes: `Platform` (Task 1); `env` (default export dari `env.ts`, punya `BOT_CHANNEL_ID`).
- Produces:
  - `interface PlatformConfig { platformLabel: string; respondInDM: boolean; respondChannelIds: string[]; maxChunkSize: number; multiMessageDelayMs: number; useMarkdown: boolean }`
  - `const platformConfigs: Record<Platform, PlatformConfig>`

- [ ] **Step 1: Write the failing test**

`src/config/platforms.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { platformConfigs } from "./platforms";

test("discord: respondChannelIds ber-prefix, chunk 2000, markdown aktif", () => {
  const d = platformConfigs.discord;
  expect(d.maxChunkSize).toBe(2000);
  expect(d.useMarkdown).toBe(true);
  expect(d.respondInDM).toBe(false);
  expect(d.respondChannelIds.every((id) => id.startsWith("discord:"))).toBe(true);
});

test("telegram & whatsapp punya limit chunk masing-masing", () => {
  expect(platformConfigs.telegram.maxChunkSize).toBe(4096);
  expect(platformConfigs.whatsapp.maxChunkSize).toBe(65000);
  expect(platformConfigs.telegram.respondInDM).toBe(true);
  expect(platformConfigs.whatsapp.respondInDM).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/config/platforms.test.ts`
Expected: FAIL — `Cannot find module './platforms'`.

- [ ] **Step 3: Write minimal implementation**

`src/config/platforms.ts`:
```typescript
import env from "../../env";
import type { Platform } from "../core/types";

export interface PlatformConfig {
  platformLabel: string;
  respondInDM: boolean;
  respondChannelIds: string[];
  maxChunkSize: number;
  multiMessageDelayMs: number;
  useMarkdown: boolean;
}

export const platformConfigs: Record<Platform, PlatformConfig> = {
  discord: {
    platformLabel: "Discord server",
    respondInDM: false,
    respondChannelIds: [`discord:${env.BOT_CHANNEL_ID}`],
    maxChunkSize: 2000,
    multiMessageDelayMs: 500,
    useMarkdown: true,
  },
  telegram: {
    platformLabel: "Telegram",
    respondInDM: true,
    respondChannelIds: [],
    maxChunkSize: 4096,
    multiMessageDelayMs: 500,
    useMarkdown: false,
  },
  whatsapp: {
    platformLabel: "WhatsApp",
    respondInDM: true,
    respondChannelIds: [],
    maxChunkSize: 65000,
    multiMessageDelayMs: 800,
    useMarkdown: false,
  },
};
```

Modify `src/config/index.ts` — tambahkan baris:
```typescript
export { platformConfigs } from "./platforms";
export type { PlatformConfig } from "./platforms";
```

Modify `package.json` scripts (dari):
```json
  "scripts": {
    "start": "bun run src/bot.ts"
  },
```
menjadi:
```json
  "scripts": {
    "start": "bun run src/bot.ts",
    "test": "bun test"
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/config/platforms.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config/platforms.ts src/config/platforms.test.ts src/config/index.ts package.json
git commit -m "feat(config): PlatformConfig per-platform + script bun test

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `buildSystemPrompt` menerima platform

**Files:**
- Modify: `src/config/systemPrompt.ts:22-83`
- Test: `src/config/systemPrompt.test.ts`

**Interfaces:**
- Consumes: `Platform` (Task 1); `platformConfigs` (Task 2).
- Produces: `function buildSystemPrompt(userName: string, platform?: Platform): string` — default `platform = "discord"` untuk kompatibilitas jalur lama.

- [ ] **Step 1: Write the failing test**

`src/config/systemPrompt.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { buildSystemPrompt } from "./systemPrompt";

test("platform label muncul di prompt sesuai argumen", () => {
  expect(buildSystemPrompt("Budi", "telegram")).toContain("Platform: Telegram");
  expect(buildSystemPrompt("Budi", "whatsapp")).toContain("Platform: WhatsApp");
});

test("default platform adalah discord", () => {
  expect(buildSystemPrompt("Budi")).toContain("Platform: Discord server");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/config/systemPrompt.test.ts`
Expected: FAIL — prompt lama menuliskan `Platform: Discord server` secara hardcode, sehingga assertion Telegram/WhatsApp gagal.

- [ ] **Step 3: Write minimal implementation**

Di `src/config/systemPrompt.ts`:

1. Tambah import di atas:
```typescript
import type { Platform } from "../core/types";
import { platformConfigs } from "./platforms";
```

2. Ubah tanda tangan fungsi (baris 22):
```typescript
export function buildSystemPrompt(userName: string, platform: Platform = "discord"): string {
```

3. Di dalam fungsi, ambil config platform di awal:
```typescript
  const platformCfg = platformConfigs[platform];
```

4. Ganti baris markdown (semula baris 40) menjadi:
```typescript
- Use ${platformCfg.platformLabel} markdown formatting: ${platformCfg.useMarkdown ? "yes" : "no"}
```

5. Ganti baris `- Platform: Discord server` (semula baris 78) menjadi:
```typescript
- Platform: ${platformCfg.platformLabel}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/config/systemPrompt.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config/systemPrompt.ts src/config/systemPrompt.test.ts
git commit -m "feat(config): systemPrompt platform-aware (label & markdown)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `discordMapper` — Message → NormalizedMessage

**Files:**
- Create: `src/adapters/discord/discordMapper.ts`
- Test: `src/adapters/discord/discordMapper.test.ts`

**Interfaces:**
- Consumes: `NormalizedMessage`, `NormalizedAttachment` (Task 1); `Message` dari `discord.js`.
- Produces: `async function toNormalizedMessage(message: Message): Promise<NormalizedMessage>`. Aturan: `chatId = "discord:" + message.channel.id`; `text = message.cleanContent`; `isMentioned = message.mentions.has(message.client.user!.id)`; `isDirectMessage = !message.guild`; `repliedTo` diisi bila ada reference (via `message.fetchReference()`), berisi `{ text: ref.cleanContent, userName: ref.author.displayName }`; `attachments` dipetakan dari `message.attachments` (`url`, `contentType`→`mimeType` default `"application/octet-stream"`, `size`, `name`→`fileName`); `timestamp = message.createdTimestamp`.

Karena `Message` discord.js sulit dikonstruksi utuh di test, mapper dites dengan objek tiruan bertipe `any` yang meniru bentuk yang dipakai.

- [ ] **Step 1: Write the failing test**

`src/adapters/discord/discordMapper.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { toNormalizedMessage } from "./discordMapper";

function fakeMessage(overrides: any = {}) {
  return {
    id: "m1",
    cleanContent: "halo bot",
    createdTimestamp: 111,
    client: { user: { id: "botid" } },
    guild: { id: "g1" },
    author: { id: "u1", displayName: "Budi" },
    channel: { id: "c1" },
    mentions: { has: (id: string) => id === "botid" },
    attachments: new Map(),
    fetchReference: async () => null,
    ...overrides,
  } as any;
}

test("memetakan field dasar + prefix chatId", async () => {
  const n = await toNormalizedMessage(fakeMessage());
  expect(n.platform).toBe("discord");
  expect(n.chatId).toBe("discord:c1");
  expect(n.userId).toBe("u1");
  expect(n.userName).toBe("Budi");
  expect(n.text).toBe("halo bot");
  expect(n.isMentioned).toBe(true);
  expect(n.isDirectMessage).toBe(false);
  expect(n.timestamp).toBe(111);
});

test("DM: tidak ada guild → isDirectMessage true", async () => {
  const n = await toNormalizedMessage(fakeMessage({ guild: null }));
  expect(n.isDirectMessage).toBe(true);
});

test("attachment dipetakan (mimeType default bila null)", async () => {
  const att = new Map([
    ["a1", { url: "http://x/f.png", contentType: null, size: 10, name: "f.png" }],
  ]);
  const n = await toNormalizedMessage(fakeMessage({ attachments: att }));
  expect(n.attachments.length).toBe(1);
  expect(n.attachments[0].url).toBe("http://x/f.png");
  expect(n.attachments[0].mimeType).toBe("application/octet-stream");
  expect(n.attachments[0].fileName).toBe("f.png");
});

test("repliedTo diringkas dari fetchReference", async () => {
  const n = await toNormalizedMessage(
    fakeMessage({
      fetchReference: async () => ({
        cleanContent: "pesan lama",
        author: { displayName: "Ani" },
      }),
    })
  );
  expect(n.repliedTo).toEqual({ text: "pesan lama", userName: "Ani" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/adapters/discord/discordMapper.test.ts`
Expected: FAIL — `Cannot find module './discordMapper'`.

- [ ] **Step 3: Write minimal implementation**

`src/adapters/discord/discordMapper.ts`:
```typescript
import type { Message } from "discord.js";
import type { NormalizedAttachment, NormalizedMessage } from "../../core/types";

export async function toNormalizedMessage(message: Message): Promise<NormalizedMessage> {
  const ref = await message.fetchReference().catch(() => null);

  const attachments: NormalizedAttachment[] = [...message.attachments.values()].map(
    (att: any) => ({
      url: att.url,
      mimeType: att.contentType || "application/octet-stream",
      size: att.size,
      fileName: att.name || "attachment",
    })
  );

  return {
    platform: "discord",
    messageId: message.id,
    chatId: `discord:${message.channel.id}`,
    userId: message.author.id,
    userName: message.author.displayName,
    text: message.cleanContent,
    isMentioned: message.mentions.has(message.client.user!.id),
    isDirectMessage: !message.guild,
    repliedTo: ref
      ? { text: (ref as any).cleanContent ?? "", userName: (ref as any).author.displayName }
      : undefined,
    attachments,
    timestamp: message.createdTimestamp,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/adapters/discord/discordMapper.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/adapters/discord/discordMapper.ts src/adapters/discord/discordMapper.test.ts
git commit -m "feat(adapter): discordMapper Message -> NormalizedMessage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: conversationEngine — aturan "kapan balas" (murni, ter-inject)

**Files:**
- Create: `src/core/conversationEngine.ts`
- Test: `src/core/conversationEngine.shouldRespond.test.ts`

**Interfaces:**
- Consumes: `NormalizedMessage` (Task 1); `platformConfigs` (Task 2).
- Produces: `function shouldRespond(msg: NormalizedMessage): boolean` (exported). Aturan: `(isDirectMessage && cfg.respondInDM) || isMentioned || cfg.respondChannelIds.includes(chatId)`, dengan `cfg = platformConfigs[msg.platform]`.

Fungsi ini diekspor terpisah agar dapat diuji tanpa DB/AI. Task 6 menambah `createConversationEngine` yang memakainya.

- [ ] **Step 1: Write the failing test**

`src/core/conversationEngine.shouldRespond.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { shouldRespond } from "./conversationEngine";
import type { NormalizedMessage } from "./types";

function base(over: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return {
    platform: "discord",
    messageId: "m",
    chatId: "discord:other",
    userId: "u",
    userName: "U",
    text: "t",
    isMentioned: false,
    isDirectMessage: false,
    attachments: [],
    timestamp: 0,
    ...over,
  };
}

test("balas bila di-mention", () => {
  expect(shouldRespond(base({ isMentioned: true }))).toBe(true);
});

test("discord: DM tidak dibalas (respondInDM false)", () => {
  expect(shouldRespond(base({ isDirectMessage: true }))).toBe(false);
});

test("telegram: DM dibalas (respondInDM true)", () => {
  expect(
    shouldRespond(base({ platform: "telegram", isDirectMessage: true, chatId: "tg:1" }))
  ).toBe(true);
});

test("bukan mention & bukan channel terdaftar → tidak dibalas", () => {
  expect(shouldRespond(base())).toBe(false);
});
```

Catatan: test channel-terdaftar tidak dipakai di sini karena bergantung `BOT_CHANNEL_ID` runtime; dicakup oleh Task 2 (prefix) + verifikasi manual Task 8.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/core/conversationEngine.shouldRespond.test.ts`
Expected: FAIL — `Cannot find module './conversationEngine'` atau `shouldRespond` belum ada.

- [ ] **Step 3: Write minimal implementation**

`src/core/conversationEngine.ts` (awal file — bagian lain ditambah di Task 6):
```typescript
import { platformConfigs } from "../config/platforms";
import type { NormalizedMessage } from "./types";

export function shouldRespond(msg: NormalizedMessage): boolean {
  const cfg = platformConfigs[msg.platform];
  return (
    (msg.isDirectMessage && cfg.respondInDM) ||
    msg.isMentioned ||
    cfg.respondChannelIds.includes(msg.chatId)
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/core/conversationEngine.shouldRespond.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/conversationEngine.ts src/core/conversationEngine.shouldRespond.test.ts
git commit -m "feat(core): shouldRespond digerakkan platformConfig

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: conversationEngine — pemrosesan penuh (debounce, dedup, history, AI) via injeksi

**Files:**
- Modify: `src/core/conversationEngine.ts` (tambah `createConversationEngine`)
- Test: `src/core/conversationEngine.engine.test.ts`

**Interfaces:**
- Consumes: `shouldRespond` (Task 5); `NormalizedMessage`, `OutgoingMessage`, `PlatformAdapter`, `MessageHandler` (Task 1); `splitTextPreserveWords`, `formatTimestamp` (`helpers/util`); tipe layanan lewat parameter.
- Produces:
  - `interface EngineDeps { db: DbLike; ai: AiLike; buildSystemPrompt: (userName: string, platform: Platform) => string; fetchBuffer?: (url: string) => Promise<ArrayBuffer | null>; guardrails: { allowAttachments: boolean; maxFileSize: number; allowedChannels: string[] }; responseConfig: { typingIndicator: boolean; errorMessages: { generic: string; attachmentFail: string } }; debounceDelayMs: number }`
  - `type DbLike = { addChannelMessage(m): void; getChannelHistory(chatId: string): {timestamp:number;authorUsername:string;content:string}[]; pruneChannelHistory(chatId: string): void }`
  - `type AiLike = { generateText(prompt, history, sys): Promise<string>; generateContentWithFileContext(prompt, attachmentMeta, buffer, history, sys): Promise<{text:string; image?:Buffer}> }`
  - `function createConversationEngine(deps: EngineDeps): { handle: MessageHandler }`

Perilaku `handle` memindahkan logika `messageHandler.ts` apa adanya namun atas `NormalizedMessage`: debounce per `${userId}-${chatId}`, dedup `processingMessages` per `messageId`, catat tiap pesan ke `db.addChannelMessage` (channelId = chatId), `shouldRespond` gate, allowlist `guardrails.allowedChannels` (bila diisi, cocokkan `chatId`), typing indicator via `adapter.sendTyping`, pilih attachment (buffer bila ada; else `fetchBuffer(url)`), bangun prompt + history, panggil AI, kirim via `adapter.sendMessage`. Split chunk TIDAK di sini (milik adapter). Error → `adapter.sendMessage(chatId, { text: responseConfig.errorMessages.generic })`.

- [ ] **Step 1: Write the failing test**

`src/core/conversationEngine.engine.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/core/conversationEngine.engine.test.ts`
Expected: FAIL — `createConversationEngine` belum diexport.

- [ ] **Step 3: Write minimal implementation**

Tambahkan ke `src/core/conversationEngine.ts` (di bawah `shouldRespond`). Kode ini adalah pemindahan `messageHandler.ts` ke bentuk ter-inject:
```typescript
import { formatTimestamp, splitTextPreserveWords } from "../helpers/util";
import type {
  MessageHandler,
  NormalizedMessage,
  OutgoingMessage,
  Platform,
  PlatformAdapter,
} from "./types";

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
    if (deps.guardrails.allowedChannels.length > 0 &&
        !deps.guardrails.allowedChannels.includes(primary.chatId)) return;

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
        const b = pending.get(key);
        const last = b?.msgs[b.msgs.length - 1];
        if (last) {
          await adapter
            .sendMessage(last.chatId, { text: deps.responseConfig.errorMessages.generic })
            .catch(() => {});
        }
      } finally {
        timeouts.delete(key);
      }
    }, deps.debounceDelayMs);
    timeouts.set(key, t);
  };

  return { handle };
}
```

Catatan: import `shouldRespond` sudah ada di file yang sama (Task 5), jadi cukup dipanggil langsung.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/core/conversationEngine.engine.test.ts`
Expected: PASS (4 tests). Jalankan juga `bun test src/core` — semua hijau.

- [ ] **Step 5: Commit**

```bash
git add src/core/conversationEngine.ts src/core/conversationEngine.engine.test.ts
git commit -m "feat(core): conversationEngine ter-inject (debounce, history, AI)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: discordAdapter + platformRegistry (chunking di adapter)

**Files:**
- Create: `src/adapters/discord/discordAdapter.ts`
- Create: `src/core/platformRegistry.ts`
- Test: `src/adapters/discord/discordAdapter.split.test.ts`

**Interfaces:**
- Consumes: `PlatformAdapter`, `OutgoingMessage`, `MessageHandler` (Task 1); `toNormalizedMessage` (Task 4); `platformConfigs` (Task 2); `splitTextPreserveWords` (`helpers/util`); `Client`, `AttachmentBuilder`, dll dari `discord.js`.
- Produces:
  - `function splitForDiscord(text: string): string[]` (exported, dites) — pakai `splitTextPreserveWords(text, platformConfigs.discord.maxChunkSize)`.
  - `class DiscordAdapter implements PlatformAdapter` — konstruktor `(token: string, handler: MessageHandler)`.
  - `class PlatformRegistry { register(a: PlatformAdapter): void; startAll(): Promise<void>; stopAll(): Promise<void> }` di `platformRegistry.ts`.

Bagian jaringan (login, kirim ke channel Discord) tidak dites unit; hanya `splitForDiscord` dites. `startAll` membungkus tiap `start()` dalam try/catch dan exit bila semua gagal — diverifikasi manual (Task 8).

- [ ] **Step 1: Write the failing test**

`src/adapters/discord/discordAdapter.split.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { splitForDiscord } from "./discordAdapter";

test("teks pendek → satu chunk", () => {
  expect(splitForDiscord("halo")).toEqual(["halo"]);
});

test("teks > 2000 → beberapa chunk, masing-masing <= 2000", () => {
  const long = "kata ".repeat(600); // ~3000 char
  const chunks = splitForDiscord(long);
  expect(chunks.length).toBeGreaterThan(1);
  for (const c of chunks) expect(c.length).toBeLessThanOrEqual(2000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/adapters/discord/discordAdapter.split.test.ts`
Expected: FAIL — `Cannot find module './discordAdapter'`.

- [ ] **Step 3: Write minimal implementation**

`src/adapters/discord/discordAdapter.ts`:
```typescript
import {
  AttachmentBuilder, Client, Events, GatewayIntentBits, type Message,
} from "discord.js";
import { platformConfigs } from "../../config/platforms";
import { splitTextPreserveWords } from "../../helpers/util";
import type { MessageHandler, OutgoingMessage, Platform, PlatformAdapter } from "../../core/types";
import { toNormalizedMessage } from "./discordMapper";

export function splitForDiscord(text: string): string[] {
  return splitTextPreserveWords(text, platformConfigs.discord.maxChunkSize);
}

export class DiscordAdapter implements PlatformAdapter {
  readonly platform: Platform = "discord";
  private client: Client;

  constructor(private token: string, private handler: MessageHandler) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
      ],
    });
  }

  async start(): Promise<void> {
    this.client.once(Events.ClientReady, () => {
      console.log(`🐍 Uro online (Discord) as ${this.client.user?.tag}`);
    });
    this.client.on(Events.MessageCreate, async (message: Message) => {
      try {
        if (message.author.bot || !message.channel.isSendable()) return;
        const normalized = await toNormalizedMessage(message);
        await this.handler(normalized, this);
      } catch (e) {
        console.error("Discord mapping/handle error:", e);
      }
    });
    await this.client.login(this.token);
  }

  async stop(): Promise<void> {
    await this.client.destroy();
  }

  async sendTyping(chatId: string): Promise<void> {
    const id = chatId.replace(/^discord:/, "");
    const ch = await this.client.channels.fetch(id).catch(() => null);
    if (ch && "sendTyping" in ch) await (ch as any).sendTyping().catch(() => {});
  }

  async sendMessage(chatId: string, msg: OutgoingMessage): Promise<void> {
    try {
      const id = chatId.replace(/^discord:/, "");
      const ch = await this.client.channels.fetch(id).catch(() => null);
      if (!ch || !("send" in ch)) return;

      const files: AttachmentBuilder[] = [];
      if (msg.image) files.push(new AttachmentBuilder(msg.image, { name: "generated-image.png" }));

      const chunks = splitForDiscord(msg.text);
      let firstFiles = files;
      let first = true;
      for (const chunk of chunks) {
        if (!first) {
          await new Promise((r) => setTimeout(r, platformConfigs.discord.multiMessageDelayMs));
        }
        await (ch as any).send({ content: chunk, files: firstFiles });
        firstFiles = [];
        first = false;
      }
    } catch (e) {
      console.error("Discord sendMessage error:", e);
    }
  }
}
```

`src/core/platformRegistry.ts`:
```typescript
import type { PlatformAdapter } from "./types";

export class PlatformRegistry {
  private adapters: PlatformAdapter[] = [];

  register(a: PlatformAdapter): void {
    this.adapters.push(a);
  }

  async startAll(): Promise<void> {
    let ok = 0;
    for (const a of this.adapters) {
      try {
        await a.start();
        ok++;
      } catch (e) {
        console.error(`Gagal start adapter ${a.platform}:`, e);
      }
    }
    if (ok === 0) {
      console.error("Tidak ada adapter yang berhasil start. Keluar.");
      process.exit(1);
    }
  }

  async stopAll(): Promise<void> {
    for (const a of this.adapters) await a.stop().catch(() => {});
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/adapters/discord/discordAdapter.split.test.ts`
Expected: PASS (2 tests). Jalankan `bun test` — seluruh suite hijau.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/discord/discordAdapter.ts src/core/platformRegistry.ts src/adapters/discord/discordAdapter.split.test.ts
git commit -m "feat(adapter): DiscordAdapter + PlatformRegistry (chunking di adapter)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Rakit bot.ts, hapus file lama, verifikasi

**Files:**
- Modify: `src/bot.ts` (tulis ulang)
- Delete: `src/client.ts`, `src/handlers/messageHandler.ts`
- (opsional) hapus folder `src/handlers/` bila kosong.

**Interfaces:**
- Consumes: `createConversationEngine` (Task 6); `DiscordAdapter` (Task 7); `PlatformRegistry` (Task 7); `dbService` (`services/database`); `aiService` (`services/googleAi`); `buildSystemPrompt`, `guardrails`, `responseConfig` (`config`); `env`.
- Produces: entry point yang men-start adapter aktif.

- [ ] **Step 1: Tulis ulang `src/bot.ts`**

```typescript
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
```

- [ ] **Step 2: Hapus file lama**

```bash
git rm src/client.ts src/handlers/messageHandler.ts
```

- [ ] **Step 3: Verifikasi statis — core bersih & test hijau**

Run:
```bash
bun test
grep -rn "discord.js" src/core || echo "CORE BERSIH: tidak ada discord.js"
```
Expected: seluruh test PASS; grep mencetak `CORE BERSIH: ...`.

- [ ] **Step 4: Verifikasi typecheck & boot**

Run:
```bash
bunx tsc --noEmit
```
Expected: tidak ada error tipe. (Jika `tsconfig` tidak menyertakan test, cukup pastikan tak ada error pada src.)

- [ ] **Step 5: Verifikasi manual Discord (dijalankan pemilik repo, butuh token asli)**

Jalankan `bun start` dengan `.env` berisi `DISCORD_BOT_TOKEN`, `GEMINI_API_KEYS`, `BOT_CHANNEL_ID`. Buktikan berperilaku sama seperti sebelum refactor:
1. Mention bot di server → dibalas.
2. Kirim pesan di `BOT_CHANNEL_ID` tanpa mention → dibalas.
3. Kirim pesan di channel lain tanpa mention → TIDAK dibalas (tetap tercatat).
4. Kirim attachment gambar + pertanyaan → dianalisis.
5. Picu balasan panjang (>2000 char) → ter-split rapi, kata tidak terpotong, ada jeda antar-chunk.

JANGAN klaim selesai sampai langkah 5 ini lolos. Jika ada yang berubah perilakunya, hentikan dan perbaiki (systematic-debugging).

- [ ] **Step 6: Commit**

```bash
git add src/bot.ts
git commit -m "refactor: bot.ts pakai registry+adapter; hapus client.ts & messageHandler.ts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Perbarui README (multi-platform + status fase)

**Files:**
- Modify: `README.md`

**Interfaces:** —

- [ ] **Step 1: Update README**

Tambahkan/ubah:
1. Judul & intro: dari "Discord AI Chatbot" → sebut arsitektur multi-platform (Discord aktif; Telegram & WhatsApp disiapkan).
2. Bagian **Struktur Project**: perbarui pohon folder ke `core/`, `adapters/discord/`, `config/platforms.ts`; hapus `client.ts` & `handlers/messageHandler.ts`.
3. Bagian baru **Arsitektur Multi-Platform**: jelaskan `adapters → core → services`, `NormalizedMessage`, `PlatformAdapter`, chunking per-platform, isolasi history via prefix `chatId`.
4. Bagian **Menambah Platform Baru**: langkah singkat — buat folder adapter, implement `PlatformAdapter`, mapper ke `NormalizedMessage`, daftarkan di `bot.ts`.
5. Catatan **Roadmap**: `laya` (gerbang keputusan) & RAG dokumen sebagai fase berikutnya; Telegram (grammy) & WhatsApp (whatsapp-web.js) sebagai adapter berikutnya.
6. Tambah `bun test` di bagian pengembangan.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README arsitektur multi-platform (core + adapter)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- §2 Arsitektur/folder → Task 1,5,6,7,8. ✓
- §3 Tipe data → Task 1. ✓
- §4 Alur end-to-end → Task 6 (proses), Task 7 (kirim+chunk), Task 8 (rakit). ✓
- §5 Config per-platform → Task 2; systemPrompt platform-aware → Task 3. ✓
- §6 Registrasi & startup → Task 7 (registry), Task 8 (bot.ts). ✓
- §7 Error handling → Task 6 (proses/generic), Task 7 (mapper drop, send bungkus, startAll), Task 8 (verifikasi). ✓
- §8 Testing → tiap task punya test; DI + `:memory:`/mock → Task 6. ✓ (Catatan: DB nyata di-mock via injeksi, tidak menyentuh `uro_bot.sqlite`.)
- §9 Urutan implementasi → tercermin di urutan Task 1→8. ✓
- Kriteria "grep core bersih" → Task 8 Step 3; "Discord identik" → Task 8 Step 5. ✓

**2. Placeholder scan:** Tidak ada TBD/TODO. Titik hook laya/RAG sengaja dikosongkan (keputusan spec), bukan placeholder kode. Semua step kode punya blok konkret.

**3. Type consistency:**
- `shouldRespond`, `createConversationEngine`, `EngineDeps`, `DbLike`, `AiLike` konsisten Task 5→6→8.
- `toNormalizedMessage` (Task 4) dipakai `DiscordAdapter` (Task 7). ✓
- `platformConfigs` (Task 2) dipakai Task 3,5,7. ✓
- `splitForDiscord`/`splitTextPreserveWords(text, 2000)` konsisten Task 7. ✓
- `PlatformAdapter.sendTyping/sendMessage/start/stop` konsisten Task 1↔6↔7. ✓
- `dbService` nyata (channelId param) kompatibel dgn `DbLike` (Task 6/8): nama field `addChannelMessage`, `getChannelHistory`, `pruneChannelHistory` cocok dengan `database.ts`. ✓
