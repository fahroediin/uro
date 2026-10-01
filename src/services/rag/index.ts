import { ragConfig } from "../../config/rag";
import { createEmbedder } from "./embedder";
import { createDocStore } from "./docStore";
import { createVectorStore } from "./vectorStore";
import { passthroughReranker } from "./reranker";
import { syncFolder } from "./ingestion";
import { readdir, mkdir } from "fs/promises";
import { join } from "path";
import type { DocStore, Embedder, Reranker, RagService, RetrievedChunk, VectorStore } from "./types";

export interface RagOverrides {
  enabled?: boolean;
  embedder?: Embedder;
  vectorStore?: VectorStore;
  docStore?: DocStore;
  reranker?: Reranker;
}

export function createRagService(overrides: RagOverrides = {}): RagService {
  const enabled = overrides.enabled ?? ragConfig.enabled;
  // Dependensi default dibuat malas (lazy): saat disabled / saat test dengan override,
  // tidak ada file SQLite/LanceDB yang dibuka dan tidak ada klien API yang dibangun.
  let embedderInst = overrides.embedder;
  let vectorStoreInst = overrides.vectorStore;
  let docStoreInst = overrides.docStore;
  const getEmbedder = () => (embedderInst ??= createEmbedder());
  const getVectorStore = () => (vectorStoreInst ??= createVectorStore(join(ragConfig.dataPath, "lancedb")));
  const getDocStore = () => (docStoreInst ??= createDocStore(join(ragConfig.dataPath, "parents.sqlite")));
  const reranker = overrides.reranker ?? passthroughReranker;

  return {
    isEnabled() { return enabled; },

    async retrieve(query: string): Promise<string> {
      if (!enabled) return "";
      try {
        const qv = await getEmbedder().embed(query);
        const hits = await getVectorStore().search(qv, ragConfig.childTopK);
        if (hits.length === 0) return "";
        const candidates: RetrievedChunk[] = hits.map((h) => ({
          parentId: h.parentId, text: "", sourceFile: h.sourceFile, score: h.score,
        }));
        const ranked = await reranker.rerank(query, candidates);
        // dedup parentId, skor terbaik, batasi
        const bestByParent = new Map<string, RetrievedChunk>();
        for (const c of ranked) {
          const prev = bestByParent.get(c.parentId);
          if (!prev || c.score > prev.score) bestByParent.set(c.parentId, c);
        }
        const top = [...bestByParent.values()]
          .sort((a, b) => b.score - a.score)
          .slice(0, ragConfig.maxParentsInContext);
        const parents = getDocStore().getParents(top.map((t) => t.parentId));
        if (parents.length === 0) return "";
        return parents
          .map((p) => `Kutipan dari dokumen '${p.sourceFile}':\n${p.text}`)
          .join("\n\n---\n\n");
      } catch (e) {
        console.error("[rag] retrieve gagal:", e);
        return "";
      }
    },

    async sync() {
      if (!enabled) return { indexed: 0, removed: 0 };
      await mkdir(ragConfig.dataPath, { recursive: true });
      const docStore = getDocStore();
      const vectorStore = getVectorStore();
      docStore.init();
      await vectorStore.init();
      return syncFolder({
        documentsPath: ragConfig.documentsPath,
        embedder: getEmbedder(), vectorStore, docStore,
        listFiles: async () => {
          try {
            const entries = await readdir(ragConfig.documentsPath, { withFileTypes: true });
            return entries.filter((e) => e.isFile()).map((e) => e.name);
          } catch { return []; }
        },
        readFile: async (name) => {
          const { extractText } = await import("./extractor");
          return extractText(join(ragConfig.documentsPath, name));
        },
      });
    },
  };
}
