# Uro — Configurable Multi-Platform AI Chatbot

> **Uro** — dari kata **Ouroboros**, ular yang memakan ekornya sendiri.
> Simbol siklus tanpa akhir, kebijaksanaan abadi, dan evolusi terus-menerus.

Chatbot AI powered by **Google Gemini** dengan **konfigurasi penuh** atas
kepribadian, guardrails, dan gaya respons — dibangun di atas arsitektur
**core + adapter** yang platform-agnostic. **Discord** aktif sebagai adapter
saat ini; **Telegram** dan **WhatsApp** sudah disiapkan tempatnya sebagai
adapter berikutnya (lihat [Arsitektur Multi-Platform](#arsitektur-multi-platform)).

---

## Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| **Persona Engine** | Atur nama, kepribadian, backstory, dan gaya bahasa bot |
| **Guardrails** | Definisikan aturan ketat, topik terlarang, dan batasan |
| **Response Config** | Kontrol tone, format, timing, dan pesan error |
| **File Analysis** | Analisis file attachment (gambar, dokumen, dll) via Files API |
| **Google Search** | Grounding respons dengan pencarian Google (fakta terkini) |
| **Channel History** | Konteks percakapan via SQLite database |
| **Message Debouncing** | Batch pesan cepat jadi satu respons |
| **API Key Rotation** | Multi-key dengan cooldown otomatis saat kena rate limit |

> Catatan: image generation **tidak diaktifkan**. Kodenya (beserta
> intent-detection per pesan) sudah dihapus untuk menghemat token. Lihat
> catatan di bawah untuk mengaktifkannya kembali.

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (JavaScript runtime)
- Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))
- Google Gemini API Key ([Google AI Studio](https://ai.google.dev/gemini-api/docs))

### Setup

```bash
# 1. Install dependencies
bun install

# 2. Copy env template
cp .env.example .env

# 3. Edit .env with your credentials
# DISCORD_BOT_TOKEN=...
# GEMINI_API_KEYS=key1,key2,...   (comma-separated, boleh 1 key saja)
# BOT_CHANNEL_ID=...

# 4. Run the bot
bun start
```

---

## Konfigurasi

Semua konfigurasi ada di folder `src/config/`. **Tidak perlu mengubah kode
logic** — cukup edit file config.

### Model AI (`src/config/ai.ts`)

Menentukan **model Gemini** yang dipakai. Default `gemini-2.5-flash-lite`:
tier Flash-Lite (hemat token, latensi rendah) dan — penting untuk free tier —
masih dapat Google Search grounding gratis, yang tidak tersedia di Gemini 3.x
free tier.

```typescript
export const aiConfig = {
  textModel: "gemini-2.5-flash-lite", // balasan teks + Google Search
  fileModel: "gemini-2.5-flash-lite", // pesan dengan attachment
};
```

Sudah aktifkan billing? Bisa pindah ke `gemini-3.5-flash-lite` (atau alias
`gemini-flash-lite-latest`) untuk kualitas lebih baik dengan biaya per-token
tetap rendah.

### Persona (`src/config/persona.ts`)

Mengatur **siapa bot ini**: `name`, `identity`, `personality`, `backstory`,
`languageStyle`, `useEmojis`, `exampleResponses`, `mustDo`, `mustNot`.

### Guardrails (`src/config/guardrails.ts`)

Mengatur **batasan ketat**: `rules`, `blockedTopics`, `allowedChannels`,
`maxHistoryMessages`, `maxFileSize`, `allowAttachments`, `allowGoogleSearch`.

### Response Style (`src/config/response.ts`)

Mengatur **cara bot merespons**: `tone`, `replyStyle`, `maxResponseLength`,
`useMarkdown`, `splitLongMessages`, `maxChunkSize`, `typingIndicator`,
`debounceDelayMs`, `multiMessageDelayMs`, dan `errorMessages`.

---

## Struktur Project

```
uro/
├── env.ts                 # Environment variable validation (zod)
├── package.json
├── tsconfig.json
├── .env.example           # Template environment vars
└── src/
    ├── bot.ts             # Entry point — rakit engine, registrasi adapter, start
    ├── core/
    │   ├── types.ts             # NormalizedMessage, PlatformAdapter, OutgoingMessage, dll
    │   ├── conversationEngine.ts # Logic percakapan platform-agnostic (debounce, history, AI)
    │   └── platformRegistry.ts   # Registrasi & start/stop semua adapter
    ├── adapters/
    │   └── discord/
    │       ├── discordAdapter.ts # Implementasi PlatformAdapter untuk Discord
    │       └── discordMapper.ts  # Discord Message -> NormalizedMessage
    ├── config/
    │   ├── index.ts       # Barrel exports
    │   ├── ai.ts          # Model selection (hemat token)
    │   ├── persona.ts     # Personality config
    │   ├── guardrails.ts  # Safety rules config
    │   ├── response.ts    # Response style config
    │   ├── platforms.ts   # Konfigurasi per-platform (chunk size, respondInDM, dll)
    │   └── systemPrompt.ts # Prompt builder, platform-aware (DO NOT edit)
    ├── helpers/
    │   └── util.ts        # Utility functions (split text, formatting waktu, dll)
    ├── services/
    │   ├── database.ts    # SQLite database service
    │   ├── keyRotator.ts  # API key rotation + cooldown
    │   └── googleAi.ts    # Gemini AI service
    └── types/
        └── index.ts       # Type definitions (database, dll)
```

> `client.ts` dan `handlers/messageHandler.ts` (versi Discord-only lama) sudah
> dihapus — digantikan oleh `core/conversationEngine.ts` (logic) dan
> `adapters/discord/` (platform-specific).

---

## Arsitektur Multi-Platform

Uro dipecah jadi tiga lapisan dengan **arah dependensi satu jalan**:

```
adapters/  --->  core/  --->  services/
```

- **`services/`** — hal generik yang tidak tahu apa-apa soal platform atau
  percakapan: database SQLite, key rotator, klien Gemini AI.
- **`core/`** — otak bot. Sama sekali tidak tahu Discord, Telegram, atau
  WhatsApp. Berisi:
  - **`NormalizedMessage`** — bentuk pesan yang seragam lintas platform
    (`platform`, `chatId`, `userId`, `text`, `isMentioned`, `attachments`,
    dll). Semua adapter wajib menerjemahkan pesan mentah platform mereka ke
    bentuk ini.
  - **`PlatformAdapter`** — interface yang wajib diimplementasikan tiap
    platform: `start()`, `stop()`, `sendMessage()`, `sendTyping()`.
  - **`conversationEngine.ts`** — debounce pesan, simpan/ambil history,
    bangun prompt, panggil Gemini, lalu kirim balasan lewat adapter yang
    dikirim ke `handle()`. Tidak pernah mengimpor kode Discord/Telegram
    apa pun.
  - **`platformRegistry.ts`** — mendaftarkan adapter yang aktif dan
    menjalankan `startAll()` / `stopAll()`.
- **`adapters/`** — satu folder per platform. Tiap adapter punya:
  - **mapper** (mis. `discordMapper.ts`) yang mengubah event native platform
    menjadi `NormalizedMessage`.
  - **adapter class** (mis. `discordAdapter.ts`) yang mengimplementasikan
    `PlatformAdapter`, termasuk **chunking pesan panjang sesuai limit
    platform** sebelum dikirim.

Adapter hanya boleh bergantung ke `core/` dan `config/`, tidak sebaliknya —
`core/` tidak pernah mengimpor apa pun dari `adapters/`.

### Chunking per-platform

Tiap platform punya batas panjang pesan berbeda, diatur di
`src/config/platforms.ts` (`maxChunkSize`):

| Platform | Batas karakter per pesan |
|----------|--------------------------|
| Discord  | 2000 |
| Telegram | 4096 |
| WhatsApp | ~65000 |

Pemecahan teks panjang jadi beberapa chunk memakai
`splitTextPreserveWords()` (`src/helpers/util.ts`), yang menjaga agar potongan
tidak memutus kata di tengah.

### Isolasi history per platform

`chatId` pada `NormalizedMessage` selalu diberi **prefix nama platform**,
misalnya `discord:1234567890`. Prefix ini dipakai apa adanya sebagai
`channelId` di database history (`src/services/database.ts`), sehingga
riwayat percakapan Discord, Telegram, dan WhatsApp otomatis terisolasi satu
sama lain meski (secara teori) ada id numerik yang sama di dua platform
berbeda.

---

## Menambah Platform Baru

Core tidak perlu disentuh sama sekali. Langkah untuk menambah adapter baru
(mis. Telegram):

1. Buat folder baru: `src/adapters/telegram/`.
2. Tulis **mapper** (`telegramMapper.ts`) yang mengubah pesan native SDK
   platform tersebut menjadi `NormalizedMessage` (lihat
   `discordMapper.ts` sebagai contoh) — jangan lupa prefix `chatId` dengan
   nama platform, mis. `telegram:...`.
3. Tulis **adapter class** (`telegramAdapter.ts`) yang mengimplementasikan
   `PlatformAdapter` dari `src/core/types.ts`: `start()`, `stop()`,
   `sendMessage()`, `sendTyping()`. Di dalam `sendMessage()`, pecah teks
   panjang sesuai `maxChunkSize` platform tersebut (lihat
   `src/config/platforms.ts`).
4. Tambahkan entri platform baru ke `platformConfigs` di
   `src/config/platforms.ts` (label, `respondInDM`, `maxChunkSize`, dll).
5. Daftarkan adapter di `src/bot.ts`:

   ```typescript
   if (env.TELEGRAM_BOT_TOKEN) {
     registry.register(new TelegramAdapter(env.TELEGRAM_BOT_TOKEN, engine.handle));
   }
   ```

`conversationEngine.ts`, `platformRegistry.ts`, dan seluruh `core/` lainnya
tetap sama persis — tidak ada perubahan logic percakapan untuk platform baru.

---

## Cara Kerja

1. **User mention bot**, **kirim pesan di bot channel**, atau **DM** (kalau
   platform mengizinkan, lihat `respondInDM` di `platforms.ts`)
2. Adapter platform menerjemahkan pesan native menjadi `NormalizedMessage`
3. `conversationEngine` **debounce** pesan (batch pesan cepat jadi satu)
4. **System prompt** di-build dari config (persona + guardrails + response),
   platform-aware
5. Prompt + channel history dikirim ke **Gemini AI**
6. Respons dipecah jadi chunks sesuai limit platform dan dikirim balik lewat
   adapter yang sama

---

## Proxy Region (kalau VPS diblokir Gemini)

Gemini API memblokir sebagian negara. Kalau VPS Anda ada di negara yang
diblokir, request langsung ke Google gagal dengan `FAILED_PRECONDITION` /
**"User location is not supported for the API use"**.

Solusinya: arahkan bot ke **proxy di region yang didukung** lewat variabel
`GEMINI_BASE_URL`. Cara termudah & gratis: **Cloudflare Worker**.

### Cara kerja

```
Tanpa proxy (diblokir):
  Bot (VPS di negara terblokir)  --->  Google Gemini    region not supported

Dengan proxy:
  Bot (VPS)  --->  Cloudflare Worker (jaringan Cloudflare)  --->  Google Gemini   OK
```

Worker berjalan di jaringan Cloudflare (BUKAN di VPS Anda), jadi yang
"menelepon" Google adalah Cloudflare — Google melihat IP Cloudflare, bukan IP
VPS Anda. SDK otomatis menambahkan path `/v1beta/...` ke `GEMINI_BASE_URL`,
jadi Worker cukup meneruskan request apa adanya.

### 1. Buat Cloudflare Worker

Dashboard Cloudflare (gratis, tanpa domain/kartu kredit): **Workers & Pages ->
Create -> Create Worker -> Deploy**, lalu **Edit code**, ganti isinya dengan:

```js
export default {
  async fetch(request) {
    const inUrl = new URL(request.url);
    const upstream =
      "https://generativelanguage.googleapis.com" + inUrl.pathname + inUrl.search;

    // Salin header, buang yang bikin Google menolak / membocorkan lokasi VPS.
    const headers = new Headers(request.headers);
    for (const h of [
      "host", "cf-connecting-ip", "cf-ipcountry", "cf-ray", "cf-visitor",
      "x-forwarded-for", "x-forwarded-proto", "x-real-ip",
    ]) headers.delete(h);

    const resp = await fetch(upstream, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "follow",
    });

    // Teruskan respons Google apa adanya (tetap JSON).
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: resp.headers,
    });
  },
};
```

> **Penting:** header `host` dan `x-forwarded-for` / `cf-connecting-ip` WAJIB
> dibuang. Kalau tidak, Google menolak dengan 403 text/plain (muncul error
> `Failed to parse JSON` di SDK) atau mendeteksi lokasi VPS dari header itu.

**Deploy**, lalu salin URL Worker Anda, mis.
`https://uro-proxy.<akun>.workers.dev`.

### 2. Colok ke bot

Di `.env`:

```
GEMINI_BASE_URL=https://uro-proxy.<akun>.workers.dev
```

Restart bot — di log muncul `Gemini base URL override: ...`. Kosongkan
`GEMINI_BASE_URL` untuk kembali ke koneksi langsung (tanpa proxy).

### 3. Tes proxy (opsional)

Jalankan dari VPS (ganti `PASTE_KEY` dengan salah satu Gemini key):

```bash
curl -s -w "\n[HTTP %{http_code}]\n" -X POST \
  "$GEMINI_BASE_URL/v1beta/models/gemini-2.5-flash-lite:generateContent" \
  -H "x-goog-api-key: PASTE_KEY" -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"halo"}]}]}'
```

- JSON berisi `candidates` -> proxy jalan.
- `FAILED_PRECONDITION` / "User location is not supported" -> data center
  Cloudflare terdekat VPS masih di negara terblokir. Pindahkan proxy ke region
  yang pasti didukung (mis. VPS kecil di Singapura, atau Deno Deploy yang
  region-nya bisa dipilih) dan ganti `GEMINI_BASE_URL` ke URL baru itu.

---

## Roadmap

Fase berikutnya yang direncanakan (belum diimplementasikan):

- **Adapter Telegram** (pakai [grammy](https://grammy.dev/)) dan
  **adapter WhatsApp** (pakai
  [whatsapp-web.js](https://wwebjs.dev/)) — tinggal ikuti langkah di
  [Menambah Platform Baru](#menambah-platform-baru) di atas. Slot pendaftaran
  keduanya sudah disiapkan (dikomentari) di `src/bot.ts`.
- **`laya`** — gerbang keputusan lokal (local decision gate) sebelum request
  diteruskan ke Gemini, untuk mengurangi pemakaian API pada kasus yang tidak
  perlu AI.
- **RAG dokumen** — Q&A berbasis dokumen yang di-retrieve, sebagai kemampuan
  tambahan di atas `conversationEngine` yang sudah ada.

---

## Notes

- Bot menggunakan **Bun runtime** (bukan Node.js).
- Database menggunakan **SQLite** bawaan Bun (`bun:sqlite`).
- **Testing**: jalankan `bun test` untuk menjalankan seluruh unit test
  (`core/`, `adapters/`, `config/` masing-masing punya test sendiri).
- **Model default hemat token** (`gemini-2.5-flash-lite`) — di free tier
  model ini masih dapat Google Search grounding gratis (Gemini 3.x tidak).
  Ganti di `src/config/ai.ts`.
- **Key rotation**: isi `GEMINI_API_KEYS` dengan beberapa key dipisah koma;
  key yang kena rate limit akan di-cooldown ~60 detik lalu dipakai lagi.
- **Region diblokir?** Lihat bagian **Proxy Region** di atas untuk setup
  Cloudflare Worker + `GEMINI_BASE_URL`.
- **Image generation dihapus**. Untuk mengaktifkan kembali: tambahkan fungsi
  generate di `googleAi.ts` dengan model image GA (mis.
  `gemini-3.1-flash-image` / Nano Banana 2), lalu set
  `allowImageGeneration: true` di `guardrails.ts` dan sambungkan kembali di
  `core/conversationEngine.ts`.

---

## License

MIT
