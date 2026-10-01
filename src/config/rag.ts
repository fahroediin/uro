import env from "../../env";

/**
 * RAG menyala hanya jika env RAG_ENABLED bernilai persis "true".
 * Kosong / tidak diisi / nilai lain = mati (default aman OFF).
 */
export function isRagEnabled(value: string | undefined): boolean {
  return value === "true";
}

export const ragConfig = {
  enabled: isRagEnabled(env.RAG_ENABLED),
  documentsPath: "documents",
  dataPath: "rag_data",
  embedModel: "gemini-embedding-001",
  childTopK: 10,
  maxParentsInContext: 4,
  greetingSkip: true,
  syncOnStartBlocking: true,
};
