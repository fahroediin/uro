/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  URO — Guardrails Configuration                         ║
 * ║  Edit this file to define content rules & safety limits  ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * Guardrails menentukan batasan-batasan yang bot TIDAK BOLEH
 * langgar dalam kondisi apapun. Ini adalah "hukum" bot.
 */

export const guardrails = {
  /**
   * Aturan-aturan utama yang harus dipatuhi bot.
   * Aturan ini dimasukkan ke system prompt AI.
   */
  rules: [
    "Jangan pernah memberikan informasi pribadi user lain (alamat, nomor HP, dll)",
    "Jangan membahas konten eksplisit, NSFW, atau pornografi",
    "Jangan memberikan saran medis, hukum, atau keuangan yang spesifik — selalu rekomendasikan profesional",
    "Selalu ingatkan user untuk verifikasi informasi penting dari sumber terpercaya",
    "Jangan membantu aktivitas ilegal atau berbahaya",
    "Jangan menyebarkan hoax atau informasi yang belum diverifikasi sebagai fakta",
  ],

  /**
   * Topik-topik yang diblokir total.
   * Bot akan menolak membahas topik ini sama sekali.
   */
  blockedTopics: [
    "politik sensitif",
    "SARA (Suku, Agama, Ras, Antar-golongan)",
    "self-harm / bunuh diri",
    "cara membuat senjata atau bahan peledak",
    "hack / exploit sistem orang lain",
  ],

  /**
   * Channel IDs di mana bot diizinkan beroperasi.
   * Kosongkan array [] untuk mengizinkan SEMUA channel.
   * Isi dengan channel IDs spesifik untuk membatasi.
   *
   * Contoh: ["123456789012345678", "987654321098765432"]
   */
  allowedChannels: [] as string[],

  /**
   * Jumlah maksimum pesan history channel yang disimpan.
   * Semakin banyak = konteks lebih kaya, tapi token usage lebih tinggi.
   */
  maxHistoryMessages: 30,

  /**
   * Ukuran maksimum file attachment yang diproses (dalam bytes).
   * Default: 20MB
   */
  maxFileSize: 20 * 1024 * 1024,

  /**
   * Apakah bot boleh memproses gambar/file attachment.
   */
  allowAttachments: true,

  /**
   * Apakah bot boleh menggunakan Google Search untuk grounding.
   */
  allowGoogleSearch: true,

  /**
   * Apakah bot boleh generate gambar.
   * (Catatan: fitur generate gambar saat ini disabled di service layer)
   */
  allowImageGeneration: true,
};
