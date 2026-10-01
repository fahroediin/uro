import { createHash } from "crypto";

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function extractText(filePath: string): Promise<string> {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".txt") || lower.endsWith(".md")) {
    return await Bun.file(filePath).text();
  }
  return ""; // fase-1: hanya txt/md
}
