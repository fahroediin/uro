/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  URO — Response Style Configuration                      ║
 * ║  Edit this file to control how the bot formats replies    ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * Mengatur output format, timing, dan pesan-pesan error.
 */

export const responseConfig = {
  /**
   * Tone keseluruhan respons bot.
   * Opsi: "formal" | "casual-friendly" | "professional" | "playful"
   */
  tone: "casual-friendly" as const,

  /**
   * Gaya reply — seberapa panjang jawaban default.
   * Opsi: "concise" | "detailed" | "balanced"
   */
  replyStyle: "balanced" as const,

  /**
   * Panjang maksimum respons dalam karakter.
   * Discord limit = 2000 chars per message.
   */
  maxResponseLength: 1800,

  /**
   * Apakah bot boleh menggunakan markdown formatting Discord.
   */
  useMarkdown: true,

  /**
   * Otomatis split pesan panjang ke beberapa message.
   */
  splitLongMessages: true,

  /**
   * Ukuran maksimum per chunk saat splitting (dalam karakter).
   */
  maxChunkSize: 1500,

  /**
   * Tampilkan typing indicator saat bot sedang memproses.
   */
  typingIndicator: true,

  /**
   * Delay debounce (ms) — menunggu user selesai mengetik
   * sebelum memproses batch pesan.
   */
  debounceDelayMs: 2000,

  /**
   * Delay antar pesan saat mengirim multi-chunk reply (ms).
   */
  multiMessageDelayMs: 1000,

  /**
   * Pesan error yang bisa dikustomisasi.
   * Edit sesuai personality bot.
   */
  errorMessages: {
    generic:
      "Waduh, ada yang error di sisi Uro. Coba lagi nanti ya! 🐍💔",
    attachmentFail:
      "Maaf, Uro gagal memproses file yang dikirim. Coba kirim ulang?",
    imageFail:
      "Gagal generate gambar nih. Coba prompt yang beda ya!",
    rateLimited:
      "Sabar dulu ya, Uro lagi sibuk. Tunggu sebentar lalu coba lagi.",
    blockedTopic:
      "Maaf, topik ini di luar batasan yang boleh Uro bahas. Ada hal lain yang bisa dibantu?",
  },
};
