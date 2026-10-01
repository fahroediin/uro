import type { Reranker } from "./types";

export const passthroughReranker: Reranker = {
  async rerank(_query, candidates) {
    return candidates;
  },
};
