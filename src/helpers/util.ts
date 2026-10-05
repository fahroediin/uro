/**
 * Small formatting/utility helpers used across the bot.
 */

export function getCurrentWibDateTime(): string {
  const now = new Date();
  const wibDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);

  const dayNames = [
    "Minggu",
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jumat",
    "Sabtu",
  ];
  const monthNames = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  const dayName = dayNames[wibDate.getUTCDay()];
  const date = wibDate.getUTCDate();
  const monthName = monthNames[wibDate.getUTCMonth()];
  const year = wibDate.getUTCFullYear();
  const hours = String(wibDate.getUTCHours()).padStart(2, "0");
  const minutes = String(wibDate.getUTCMinutes()).padStart(2, "0");

  return `${dayName}, ${date} ${monthName} ${year} ${hours}:${minutes} WIB`;
}

export const formatTimestamp = (ts: number) =>
  ((d = new Date(ts)) =>
    `[${d.getMonth() + 1}/${d.getDate()}, ${d.getHours() % 12 || 12}:${String(
      d.getMinutes()
    ).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}]`)(new Date(ts));

export function splitTextPreserveWords(text: string, maxChunkSize = 1500) {
  if (!text || text.length <= maxChunkSize) {
    return [text];
  }

  const chunks = [];
  let currentIndex = 0;

  while (currentIndex < text.length) {
    let endIndex = currentIndex + maxChunkSize;

    // If we're at the end of the text, take the rest
    if (endIndex >= text.length) {
      chunks.push(text.slice(currentIndex));
      break;
    }

    // Find the last space before the limit to avoid breaking words
    let lastSpaceIndex = text.lastIndexOf(" ", endIndex);

    // If no space found within reasonable range, look for other word boundaries
    if (lastSpaceIndex <= currentIndex) {
      const wordBoundaries = [
        " ",
        "\n",
        "\t",
        ".",
        ",",
        ";",
        ":",
        "!",
        "?",
        "-",
      ];
      let bestBoundary = -1;

      for (let boundary of wordBoundaries) {
        let boundaryIndex = text.lastIndexOf(boundary, endIndex);
        if (boundaryIndex > currentIndex && boundaryIndex > bestBoundary) {
          bestBoundary = boundaryIndex;
        }
      }

      lastSpaceIndex = bestBoundary > currentIndex ? bestBoundary : endIndex;
    }

    // Extract the chunk
    const chunk = text.slice(currentIndex, lastSpaceIndex).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    // Move to the next position (skip the space/boundary character)
    currentIndex = lastSpaceIndex + 1;
  }

  return chunks;
}

const GREETINGS = [
  "hai",
  "halo",
  "hi",
  "hello",
  "pagi",
  "siang",
  "sore",
  "malam",
  "terima kasih",
  "makasih",
  "thanks",
  "ok",
  "oke",
  "sip",
];

export function isGreeting(text: string): boolean {
  const cleaned = text.toLowerCase().trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  return (
    words.length <= 2 && GREETINGS.some((g) => cleaned.includes(g))
  );
}

/**
 * Jaring pengaman deterministik: buang emoji/pictographic dan em/en-dash dari
 * teks balasan, TANPA merusak simbol kode/operator (=>, !==, {}, dll) atau
 * hyphen biasa. Dipakai saat persona.useEmojis = false.
 */
export function stripDecorations(text: string): string {
  if (!text) return text;
  return (
    text
      // Buang emoji & simbol gambar (Extended_Pictographic) beserta
      // variation selector (U+FE0F) dan zero-width joiner (U+200D).
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu, "")
      // em-dash / en-dash / horizontal bar -> hyphen biasa (jaga alur kalimat).
      .replace(/[–—―]/g, "-")
      // Rapikan spasi ganda yang tersisa setelah penghapusan.
      .replace(/ {2,}/g, " ")
      // Rapikan spasi sebelum tanda baca yang MENGAKHIRI kata (mis. "halo ." ->
      // "halo."), tapi jangan sentuh operator seperti "!==" atau "?." — hanya
      // kalau tanda baca diikuti spasi/akhir string.
      .replace(/ +([.,!?;:])(\s|$)/g, "$1$2")
      .trim()
  );
}
