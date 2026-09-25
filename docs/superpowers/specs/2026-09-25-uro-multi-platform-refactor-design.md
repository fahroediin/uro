# Uro — Refactor Multi-Platform (Core + Adapter)

- **Tanggal:** 2026-09-25
- **Status:** Disetujui untuk implementasi (Fase 1)
- **Cakupan Fase 1:** Pisahkan core dari Discord; siapkan interface untuk Telegram & WhatsApp; chunking per-platform. Discord tetap 100% berfungsi.
- **Di luar cakupan (fase terpisah berikutnya):** integrasi `laya` (gerbang keputusan lokal), RAG dokumen. Ditolak dari cakupan: streaming, intent-orchestrator, image-generation (image-gen memang sudah sengaja dihapus dari Uro).

---

## 1. Latar & Masalah

Uro saat ini terkunci ke Discord. Otak AI sudah bersih (`services/googleAi.ts`, `services/keyRotator.ts`, `config/*` tidak meng-import `discord.js`), tetapi jembatan pemrosesan (`handlers/messageHandler.ts`) dan kabel (`client.ts`, `bot.ts`) memakai tipe & API Discord secara langsung: `Message`, `message.reply()`, `AttachmentBuilder`, `cleanContent`, `mentions`.

Tujuan: menjadikan core benar-benar platform-agnostic sehingga menambah Telegram (grammy) dan WhatsApp (whatsapp-web.js) di masa depan hanya berarti menambah satu folder adapter, tanpa menyentuh core.

Kriteria keberhasilan Fase 1:
1. `grep -r "discord.js" src/core` menghasilkan nol.
2. Discord tetap berperilaku sama (mention, DM, attachment, pesan panjang ter-split) — diverifikasi manual dengan token asli.
3. Menambah adapter baru tidak memerlukan perubahan pada `src/core/*`.
4. History antar-platform tidak tercampur.

---

## 2. Arsitektur

Tiga lapis dengan ketergantungan satu arah:

```
adapters/*  →  core/*  →  services/* & config/*
```

Core tidak pernah meng-import `adapters/*` maupun `discord.js`.

### Struktur folder

```
src/
├── bot.ts                      # [UBAH] registrasi & start semua adapter aktif
├── core/                       # [BARU] platform-agnostic
│   ├── types.ts                #   NormalizedMessage, OutgoingMessage, PlatformAdapter, MessageHandler
│   ├── conversationEngine.ts   #   ex-messageHandler: debounce, history, attachment, "kapan balas"
│   └── platformRegistry.ts     #   start/stop adapter yang env-nya tersedia
├── adapters/                   # [BARU]
│   └── discord/
│       ├── discordAdapter.ts   #   implements PlatformAdapter; satu-satunya import discord.js
│       └── discordMapper.ts    #   Message → NormalizedMessage (prefix "discord:")
├── config/
│   ├── ai.ts persona.ts guardrails.ts response.ts   # tetap
│   ├── platforms.ts            # [BARU] PlatformConfig per-platform
│   ├── systemPrompt.ts         # [UBAH] terima argumen platform
│   └── index.ts                # [UBAH] tambah export platforms
├── handlers/messageHandler.ts  # [HAPUS] pindah ke core/conversationEngine.ts
├── client.ts                   # [HAPUS] jadi bagian discordAdapter.ts
├── services/                   # database.ts, keyRotator.ts, googleAi.ts — TIDAK berubah
└── helpers/util.ts             # tetap (splitTextPreserveWords dipakai adapter)
```

---

## 3. Tipe Data (`src/core/types.ts`)

```typescript
export type Platform = "discord" | "telegram" | "whatsapp";

export interface NormalizedAttachment {
  url?: string;            // Discord punya URL; WA/TG mungkin hanya buffer
  buffer?: ArrayBuffer;    // sebagian platform kirim biner langsung
  mimeType: string;        // default "application/octet-stream"
  size: number;            // untuk cek maxFileSize
  fileName: string;        // untuk displayName Files API
}

export interface NormalizedMessage {
  platform: Platform;
  messageId: string;       // untuk dedup
  chatId: string;          // BER-PREFIX, mis. "discord:123"
  userId: string;          // untuk debounce key
  userName: string;
  text: string;            // sudah dibersihkan mention (ex-cleanContent)
  isMentioned: boolean;
  isDirectMessage: boolean;
  repliedTo?: { text: string; userName: string };
  attachments: NormalizedAttachment[];
  timestamp: number;       // epoch ms
}

export interface OutgoingMessage {
  text: string;            // teks utuh; adapter yang memecah per maxChunkSize
  image?: Buffer;
  replyToMessageId?: string;
}

export interface PlatformAdapter {
  readonly platform: Platform;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(chatId: string, msg: OutgoingMessage): Promise<void>; // adapter memecah chunk
  sendTyping(chatId: string): Promise<void>;                        // no-op bila tak didukung
}

export type MessageHandler = (
  msg: NormalizedMessage,
  adapter: PlatformAdapter
) => Promise<void>;
```

Keputusan desain:
- **`url` DAN `buffer` dua-duanya opsional.** Core: pakai buffer bila ada, jika tidak fetch dari url. Perbedaan platform hidup di data, bukan `if (platform===...)`.
- **`repliedTo` diringkas** ke `{text, userName}` — hanya itu yang dipakai messageHandler sekarang; menyalin objek `Message` akan menyeret balik ketergantungan Discord.
- **`chatId` ber-prefix sejak lahir** (adapter yang menempel). Core & DB tidak tahu platformnya.
- **Split chunk milik adapter**, bukan core — batas panjang beda per platform.

---

## 4. Alur Data End-to-End

```
1. Platform kirim event
2. discordMapper: Message → NormalizedMessage (chatId = "discord:" + channel.id)
3. adapter panggil handler(normalizedMsg, adapter)   # handler = conversationEngine
4. conversationEngine:
   a. debounce per "${userId}-${chatId}"       (logika sekarang)
   b. dedup via processingMessages
   c. dbService.addChannelMessage(...)          (chatId ber-prefix)
   d. cek "kapan balas" (aturan di core, digerakkan platformConfig):
        balas jika (isDirectMessage && cfg.respondInDM)
                 || isMentioned
                 || cfg.respondChannelIds.includes(chatId)
   e. jika tidak balas → return (pesan tetap tercatat)
   f. buildSystemPrompt(userName, platform)
   g. ambil attachment (buffer bila ada, else fetch url), history dari DB
   h. [TITIK HOOK fase berikutnya: laya / RAG — Fase 1 kosong]
   i. aiService.generateText / generateContentWithFileContext  (googleAi.ts, tak berubah)
5. adapter.sendMessage(chatId, {text, image}):
   adapter memecah text per maxChunkSize, kirim tiap chunk, sisipkan delay antar-chunk
```

---

## 5. Config per-platform (`src/config/platforms.ts`)

```typescript
import env from "../../env";
import type { Platform } from "../core/types";

export interface PlatformConfig {
  platformLabel: string;       // untuk systemPrompt
  respondInDM: boolean;
  respondChannelIds: string[]; // chatId ber-prefix (ex-BOT_CHANNEL_ID)
  maxChunkSize: number;        // Discord 2000, Telegram 4096, WA ~65000
  multiMessageDelayMs: number;
  useMarkdown: boolean;        // Discord md != Telegram MarkdownV2
}

export const platformConfigs: Record<Platform, PlatformConfig> = {
  discord:  { platformLabel: "Discord server", respondInDM: false,
              respondChannelIds: [`discord:${env.BOT_CHANNEL_ID}`],
              maxChunkSize: 2000, multiMessageDelayMs: 500, useMarkdown: true },
  telegram: { platformLabel: "Telegram", respondInDM: true, respondChannelIds: [],
              maxChunkSize: 4096, multiMessageDelayMs: 500, useMarkdown: false },
  whatsapp: { platformLabel: "WhatsApp", respondInDM: true, respondChannelIds: [],
              maxChunkSize: 65000, multiMessageDelayMs: 800, useMarkdown: false },
};
```

- `responseConfig.maxChunkSize` & `multiMessageDelayMs` **pindah ke sini**. Sisa `responseConfig` (tone, typingIndicator, errorMessages, dst.) tetap global.
- `buildSystemPrompt(userName, platform)` memakai `platformLabel` & `useMarkdown`, mengganti hardcode "Discord server" (systemPrompt.ts:78) & markdown (baris 40).

---

## 6. Registrasi & Startup

`core/platformRegistry.ts`:
- Menyimpan daftar adapter aktif.
- `startAll()`: panggil `adapter.start()` per adapter dalam try/catch masing-masing. Adapter yang gagal ditandai gagal, tidak menghentikan yang lain. Jika tidak ada satu pun yang start → exit dengan pesan jelas.

`bot.ts`:
- Instansiasi adapter yang env-nya tersedia. Fase 1: hanya Discord (`DISCORD_BOT_TOKEN`). Slot Telegram/WhatsApp disebut namun belum diinstansiasi.
- `env.ts`: token non-Discord dijadikan opsional agar Uro tetap jalan Discord-only.

---

## 7. Error Handling

Isolasi kegagalan per perbatasan:
1. **Startup adapter** — try/catch per adapter; satu gagal tidak menjatuhkan lain; semua gagal → exit.
2. **Mapper** — mapping gagal → log & drop pesan itu; listener tetap hidup.
3. **Core `processAccumulatedMessages`** — try/catch menyeluruh; pada error kirim `responseConfig.errorMessages.generic` via `adapter.sendMessage` (mempertahankan messageHandler.ts:238-249).
4. **AI (`googleAi.ts`)** — tidak disentuh; `RATE_LIMIT_EXHAUSTED` & key rotation tetap.
5. **`adapter.sendMessage`** — tiap adapter membungkus pengirimannya; gagal → log, tidak melempar ke core.

---

## 8. Testing

Uro belum punya test. Fase ini menambah `bun test` (tanpa dependency baru) + script `"test": "bun test"`.

**Unit — core (tanpa Discord/jaringan):**
- Tabel aturan "kapan balas" (DM, mention, respondChannelIds, + negatif tetap tercatat).
- Debounce: dua pesan cepat → satu pemrosesan.
- Dedup: messageId sama tidak diproses dua kali.
- Isolasi history: `discord:1` vs `tg:1` tidak tercampur.

**Unit — adapter (objek Discord palsu):**
- `discordMapper`: Message tiruan → NormalizedMessage benar (prefix, isMentioned, repliedTo ringkas, attachment).
- Split chunk: >2000 → banyak chunk di Discord; utuh di WhatsApp; kata tidak terpotong.

**Isolasi dependency:** `aiService` di-mock; DB pakai SQLite `:memory:`.

**Verifikasi manual (sebelum klaim selesai):** jalankan dengan token Discord asli; buktikan mention/DM/attachment/pesan panjang berperilaku sama. Bagian yang butuh token dijalankan oleh pemilik repo.

**Tidak diuji Fase 1:** adapter Telegram/WhatsApp, RAG, laya.

---

## 9. TDD & Pendekatan Implementasi

Implementasi mengikuti test-driven-development: tulis test dulu untuk setiap unit core & mapper, lalu implementasi hingga hijau. Urutan aman (Discord tak pernah putus lebih dari satu langkah):

1. Buat `core/types.ts` (tipe saja, belum memutus apa pun).
2. Buat `config/platforms.ts` + ubah `systemPrompt.ts` menerima `platform` (Discord masih via jalur lama, teruskan "discord").
3. Pindah isi `messageHandler.ts` → `core/conversationEngine.ts` bekerja atas `NormalizedMessage`; buat `discordMapper.ts` + `discordAdapter.ts`; sambungkan lewat registry.
4. Hapus `client.ts` & `handlers/messageHandler.ts` setelah adapter menggantikan sepenuhnya.
5. Verifikasi manual Discord.

Catatan repo: commit langsung ke `main` (tanpa feature branch), sesuai konvensi pemilik.
