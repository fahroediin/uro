/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║  URO — AI Model Configuration                            ║
 * ║  Pilih model & setting yang dipakai untuk semua AI call    ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * PENTING soal FREE TIER (tanpa billing):
 * - Rate limit Gemini dihitung PER-PROJECT, bukan per API key.
 *   Beberapa key di project yang sama = kuota yang sama (rotasi percuma).
 *   Untuk kuota terpisah: buat tiap key di Google Cloud PROJECT berbeda,
 *   atau aktifkan billing (Tier 1) — Flash-Lite sangat murah.
 * - Google Search grounding GRATIS hanya di model Gemini 2.5
 *   (500 request/hari). Di Gemini 3.x, grounding TIDAK tersedia di free tier.
 *
 * Karena bot ini mengandalkan Google Search (lihat guardrails.allowGoogleSearch),
 * default dipakai model 2.5 Flash-Lite: hemat token + grounding gratis.
 *
 * Kalau sudah AKTIFKAN BILLING, disarankan pindah ke:
 *   "gemini-3.5-flash-lite"  (atau alias "gemini-flash-lite-latest")
 * untuk kualitas lebih baik dengan biaya per-token tetap rendah.
 */

export const aiConfig = {
  /** Model utama untuk balasan teks & grounding Google Search. */
  textModel: "gemini-2.5-flash-lite",

  /** Model untuk pesan yang menyertakan attachment/file. */
  fileModel: "gemini-2.5-flash-lite",
} as const;
