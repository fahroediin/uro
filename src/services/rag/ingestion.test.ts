import { test, expect } from "bun:test";
import { syncFolder } from "./ingestion";
import { createDocStore } from "./docStore";
import type { Embedder, VectorStore } from "./types";

function fakeVectorStore(): VectorStore & { _files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    _files: files,
    async init() {},
    async upsertChildren(recs) { for (const r of recs) files.set(r.sourceFile, r.sourceHash); },
    async search() { return []; },
    async deleteBySourceFile(f) { files.delete(f); },
    async listIndexedFiles() { return [...files.entries()].map(([sourceFile, sourceHash]) => ({ sourceFile, sourceHash })); },
  };
}
const fakeEmbedder: Embedder = {
  async embed() { return [0.1]; },
  async embedBatch(texts) { return texts.map(() => [0.1]); },
};

test("file baru diindeks; file hilang dihapus; tak berubah dilewati", async () => {
  const docStore = createDocStore(":memory:"); docStore.init();
  const vectorStore = fakeVectorStore();
  let files: Record<string, string> = { "a.md": "isi A yang cukup panjang untuk dipecah." };

  const deps = {
    documentsPath: "docs",
    embedder: fakeEmbedder,
    vectorStore,
    docStore,
    listFiles: async () => Object.keys(files),
    readFile: async (name: string) => files[name],
  };

  const r1 = await syncFolder(deps);
  expect(r1.indexed).toBe(1);
  expect((await vectorStore.listIndexedFiles()).length).toBe(1);

  // jalankan lagi tanpa perubahan → tidak reindex
  const r2 = await syncFolder(deps);
  expect(r2.indexed).toBe(0);

  // hapus file → removed
  files = {};
  const r3 = await syncFolder(deps);
  expect(r3.removed).toBe(1);
  expect((await vectorStore.listIndexedFiles()).length).toBe(0);
});
