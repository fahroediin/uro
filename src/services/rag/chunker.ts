// Pecah teks menjadi potongan <= chunkSize dengan overlap, mencoba berhenti di batas spasi.
function splitWithOverlap(text: string, chunkSize: number, overlap: number): string[] {
  const clean = text.trim();
  if (!clean || clean.length <= chunkSize) return clean ? [clean] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + chunkSize, clean.length);
    if (end < clean.length) {
      const lastSpace = clean.lastIndexOf(" ", end);
      if (lastSpace > start) end = lastSpace;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

export function makeParents(fullText: string, chunkSize = 2000, overlap = 200): string[] {
  return splitWithOverlap(fullText, chunkSize, overlap);
}

export function makeChildren(parentText: string, targetSize = 400, overlap = 80): string[] {
  return splitWithOverlap(parentText, targetSize, overlap);
}
