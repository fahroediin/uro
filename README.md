# Uro — Configurable Discord AI Chatbot

> **Uro** — dari kata **Ouroboros**, ular yang memakan ekornya sendiri.
> Simbol siklus tanpa akhir, kebijaksanaan abadi, dan evolusi terus-menerus.

Discord chatbot powered by **Google Gemini AI** dengan **konfigurasi penuh**
atas kepribadian, guardrails, dan gaya respons.

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
    ├── bot.ts             # Entry point
    ├── client.ts          # Discord client setup
    ├── config/
    │   ├── index.ts       # Barrel exports
    │   ├── ai.ts          # Model selection (hemat token)
    │   ├── persona.ts     # Personality config
    │   ├── guardrails.ts  # Safety rules config
    │   ├── response.ts    # Response style config
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

## Cara Kerja

1. **User mention bot** atau **kirim pesan di bot channel**
2. Bot **debounce** pesan (batch pesan cepat jadi satu)
3. **System prompt** di-build dari config (persona + guardrails + response)
4. Prompt + channel history dikirim ke **Gemini AI**
5. Respons dipecah jadi chunks dan dikirim ke Discord

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

## Notes

- Bot menggunakan **Bun runtime** (bukan Node.js).
- Database menggunakan **SQLite** bawaan Bun (`bun:sqlite`).
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
  `messageHandler.ts`.

---

## License

MIT
