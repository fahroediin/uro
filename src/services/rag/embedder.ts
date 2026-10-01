import type { Embedder } from "./types";
import { aiService } from "../googleAi";

type EmbedFn = (texts: string[], taskType: string) => Promise<number[][]>;

export function createEmbedder(embedFn: EmbedFn = aiService.embedTexts): Embedder {
  return {
    async embed(text) {
      const [v] = await embedFn([text], "RETRIEVAL_QUERY");
      return v;
    },
    async embedBatch(texts) {
      return embedFn(texts, "RETRIEVAL_DOCUMENT");
    },
  };
}
