import { test, expect } from "bun:test";
import { createRagService } from "./index";
import { createDocStore } from "./docStore";
import type { Embedder, VectorStore } from "./types";

test("retrieve mengembalikan konteks parent berlabel sumber", async () => {
  const docStore = createDocStore(":memory:"); docStore.init();
  docStore.putParents([{ parentId: "p1", text: "Harga premium 100rb.", sourceFile: "harga.md", sourceHash: "h" }]);
  const vectorStore: VectorStore = {
    async init() {}, async upsertChildren() {},
    async search() { return [{ parentId: "p1", sourceFile: "harga.md", score: 0.9 }]; },
    async deleteBySourceFile() {}, async listIndexedFiles() { return []; },
  };
  const embedder: Embedder = { async embed() { return [0.1]; }, async embedBatch(t) { return t.map(() => [0.1]); } };

  const rag = createRagService({ embedder, vectorStore, docStore, enabled: true });
  const ctx = await rag.retrieve("berapa harga premium");
  expect(ctx).toContain("harga.md");
  expect(ctx).toContain("Harga premium 100rb.");
});

test("retrieve → '' saat disabled", async () => {
  const rag = createRagService({ enabled: false });
  expect(await rag.retrieve("apa saja")).toBe("");
});

test("retrieve → '' saat embed melempar (graceful)", async () => {
  const docStore = createDocStore(":memory:"); docStore.init();
  const vectorStore: VectorStore = {
    async init() {}, async upsertChildren() {}, async search() { return []; },
    async deleteBySourceFile() {}, async listIndexedFiles() { return []; },
  };
  const embedder: Embedder = { async embed() { throw new Error("API down"); }, async embedBatch() { return []; } };
  const rag = createRagService({ embedder, vectorStore, docStore, enabled: true });
  expect(await rag.retrieve("x")).toBe("");
});
