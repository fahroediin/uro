# 🐍 Uro — Configurable Discord AI Chatbot

> **Uro** — dari kata **Ouroboros**, ular yang memakan ekornya sendiri.
> Simbol siklus tanpa akhir, kebijaksanaan abadi, dan evolusi terus-menerus.

Discord chatbot powered by **Google Gemini AI** dengan **konfigurasi penuh**
atas kepribadian, guardrails, dan gaya respons.

---

## ✨ Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| 🎭 **Persona Engine** | Atur nama, kepribadian, backstory, dan gaya bahasa bot |
| 🛡️ **Guardrails** | Definisikan aturan ketat, topik terlarang, dan batasan |
| 💬 **Response Config** | Kontrol tone, format, timing, dan pesan error |
| 📎 **File Analysis** | Analisis file attachment (gambar, dokumen, dll) via Files API |
| 🔍 **Google Search** | Grounding respons dengan pencarian Google (fakta terkini) |
| 📝 **Channel History** | Konteks percakapan via SQLite database |
| ⏱️ **Message Debouncing** | Batch pesan cepat jadi satu respons |
| 🔑 **API Key Rotation** | Multi-key dengan cooldown otomatis saat kena rate limit |

> ℹ️ Image generation **tidak diaktifkan**. Kodenya (beserta intent-detection
> per pesan) sudah dihapus untuk menghemat token. Lihat catatan di bawah untuk
> mengaktifkannya kembali.

---

## 🚀 Quick Start

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

## ⚙️ Konfigurasi

Semua konfigurasi ada di folder `src/config/`. **Tidak perlu mengubah kode
logic** — cukup edit file config.

### 🤖 Model AI (`src/config/ai.ts`)

Menentukan **model Gemini** yang dipakai. Default dipilih untuk **hemat token**
(tier Flash-Lite: latensi rendah, biaya kecil, thinking minimal):

```typescript
export const aiConfig = {
  textModel: "gemini-3.5-flash-lite", // balasan teks + Google Search
  fileModel: "gemini-3.5-flash-lite", // pesan dengan attachment
};
```

Mau selalu ikut versi terbaru? Pakai alias `"gemini-flash-lite-latest"`.
Mau lebih pintar (tapi lebih boros)? Pakai `"gemini-flash-latest"`.

### 🎭 Persona (`src/config/persona.ts`)

Mengatur **siapa bot ini**: `name`, `identity`, `personality`, `backstory`,
`languageStyle`, `useEmojis`, `exampleResponses`, `mustDo`, `mustNot`.

### 🛡️ Guardrails (`src/config/guardrails.ts`)

Mengatur **batasan ketat**: `rules`, `blockedTopics`, `allowedChannels`,
`maxHistoryMessages`, `maxFileSize`, `allowAttachments`, `allowGoogleSearch`.

### 💬 Response Style (`src/config/response.ts`)

Mengatur **cara bot merespons**: `tone`, `replyStyle`, `maxResponseLength`,
`useMarkdown`, `splitLongMessages`, `maxChunkSize`, `typingIndicator`,
`debounceDelayMs`, `multiMessageDelayMs`, dan `errorMessages`.

---

## 📁 Struktur Project

```
uro/
├── env.ts                 # Environment variable validation (zod)
├── package.json
├── tsconfig.json
├── .env.example           # Template environment vars
└── src/
    ├── bot.ts             # Entry point
    ├── client.ts          # Discord client setup
    ├── config/
    │   ├── index.ts       # Barrel exports
    │   ├── ai.ts          # 🤖 Model selection (hemat token)
    │   ├── persona.ts     # 🎭 Personality config
    │   ├── guardrails.ts  # 🛡️ Safety rules config
    │   ├── response.ts    # 💬 Response style config
    │   └── systemPrompt.ts # Prompt builder (DO NOT edit)
    ├── handlers/
    │   └── messageHandler.ts  # Message processing logic
    ├── helpers/
    │   └── util.ts        # Utility functions
    ├── services/
    │   ├── database.ts    # SQLite database service
    │   ├── keyRotator.ts  # API key rotation + cooldown
    │   └── googleAi.ts    # Gemini AI service
    └── types/
        └── index.ts       # Type definitions
```

---

## 📖 Cara Kerja

1. **User mention bot** atau **kirim pesan di bot channel**
2. Bot **debounce** pesan (batch pesan cepat jadi satu)
3. **System prompt** di-build dari config (persona + guardrails + response)
4. Prompt + channel history dikirim ke **Gemini AI**
5. Respons dipecah jadi chunks dan dikirim ke Discord

---

## 📝 Notes

- Bot menggunakan **Bun runtime** (bukan Node.js).
- Database menggunakan **SQLite** bawaan Bun (`bun:sqlite`).
- **Model default hemat token** (`gemini-3.5-flash-lite`). Ganti di
  `src/config/ai.ts`.
- **Key rotation**: isi `GEMINI_API_KEYS` dengan beberapa key dipisah koma;
  key yang kena rate limit akan di-cooldown ~60 detik lalu dipakai lagi.
- **Region diblokir?** Kalau VPS Anda di negara yang diblokir Gemini
  ("User location is not supported"), set `GEMINI_BASE_URL` ke proxy di
  region yang didukung (mis. Cloudflare Worker yang meneruskan ke
  `generativelanguage.googleapis.com`). Kosongkan untuk koneksi langsung.
- **Image generation dihapus**. Untuk mengaktifkan kembali: tambahkan fungsi
  generate di `googleAi.ts` dengan model image GA (mis.
  `gemini-3.1-flash-image` / Nano Banana 2), lalu set
  `allowImageGeneration: true` di `guardrails.ts` dan sambungkan kembali di
  `messageHandler.ts`.

---

## 📄 License

MIT
