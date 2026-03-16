# 🐍 Uro — Configurable Discord AI Chatbot

> **Uro** — dari kata **Ouroboros**, ular yang memakan ekornya sendiri.
> Simbol siklus tanpa akhir, kebijaksanaan abadi, dan evolusi terus-menerus.

Discord chatbot powered by **Google Gemini AI** dengan **konfigurasi penuh** atas kepribadian, guardrails, dan gaya respons.

---

## ✨ Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| 🎭 **Persona Engine** | Atur nama, kepribadian, backstory, dan gaya bahasa bot |
| 🛡️ **Guardrails** | Definisikan aturan ketat, topik terlarang, dan batasan |
| 💬 **Response Config** | Kontrol tone, format, timing, dan pesan error |
| 📎 **File Analysis** | Analisis file attachment (gambar, dokumen, dll) |
| 🔍 **Google Search** | Grounding respons dengan pencarian Google |
| 🎨 **Image Generation** | Generate gambar dari prompt teks (toggleable) |
| 📝 **Channel History** | Konteks percakapan via SQLite database |
| ⏱️ **Message Debouncing** | Batch pesan cepat jadi satu respons |

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
# GEMINI_API_KEY=...
# BOT_CHANNEL_ID=...

# 4. Run the bot
bun start
```

---

## ⚙️ Konfigurasi

Semua konfigurasi ada di folder `src/config/`. **Tidak perlu mengubah kode logic** — cukup edit file config.

### 🎭 Persona (`src/config/persona.ts`)

Mengatur **siapa bot ini**:

```typescript
export const persona = {
  name: "Uro",                    // Nama bot
  identity: "...",                // Deskripsi identitas
  personality: ["...", "..."],    // Array trait kepribadian
  backstory: "...",               // Latar belakang karakter
  languageStyle: "...",           // Gaya bahasa
  useEmojis: true,                // Boleh pakai emoji?
  exampleResponses: ["..."],      // Contoh respons (guide AI)
  mustDo: ["..."],                // Instruksi positif
  mustNot: ["..."],               // Instruksi negatif
};
```

### 🛡️ Guardrails (`src/config/guardrails.ts`)

Mengatur **batasan ketat**:

```typescript
export const guardrails = {
  rules: ["..."],                 // Aturan yang harus dipatuhi
  blockedTopics: ["..."],         // Topik yang diblokir total
  allowedChannels: [],            // Channel whitelist (kosong = semua)
  maxHistoryMessages: 30,         // Jumlah history yang disimpan
  maxFileSize: 20 * 1024 * 1024,  // Max file size (20MB)
  allowAttachments: true,         // Toggle file analysis
  allowGoogleSearch: true,        // Toggle Google Search
  allowImageGeneration: true,     // Toggle image generation
};
```

### 💬 Response Style (`src/config/response.ts`)

Mengatur **cara bot merespons**:

```typescript
export const responseConfig = {
  tone: "casual-friendly",        // Tone respons
  replyStyle: "balanced",         // Panjang respons
  maxResponseLength: 1800,        // Max karakter
  useMarkdown: true,              // Gunakan markdown Discord
  splitLongMessages: true,        // Auto-split pesan panjang
  maxChunkSize: 1500,             // Max per chunk
  typingIndicator: true,          // Tampilkan "typing..."
  debounceDelayMs: 2000,          // Debounce delay
  errorMessages: { ... },         // Pesan error custom
};
```

---

## 📁 Struktur Project

```
uro/
├── env.ts                 # Environment variable validation
├── package.json
├── tsconfig.json
├── .env.example           # Template environment vars
├── .gitignore
└── src/
    ├── bot.ts             # Entry point
    ├── client.ts          # Discord client setup
    ├── config/
    │   ├── index.ts       # Barrel exports
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

- Bot menggunakan **Bun runtime** (bukan Node.js)
- Database menggunakan **SQLite** bawaan Bun (`bun:sqlite`)
- Image generation saat ini **disabled** di service layer (bisa di-enable)
- Semua lint errors akan hilang setelah `bun install`

---

## 📄 License

MIT
# uro
