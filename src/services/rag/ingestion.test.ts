import { test, expect } from "bun:test";
import { syncFolder } from "./ingestion";
import { createDocStore } from "./docStore";
import type { ChildRecord, Embedder, VectorStore } from "./types";

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

// Fake append-only seperti LanceDB: upsertChildren hanya menambah baris,
// hanya deleteBySourceFile yang menghapus.
function appendOnlyVectorStore() {
  const rows: ChildRecord[] = [];
  const calls = { deleteBySourceFile: [] as string[] };
  const store: VectorStore = {
    async init() {},
    async upsertChildren(recs) { rows.push(...recs); },
    async search() { return []; },
    async deleteBySourceFile(f) {
      calls.deleteBySourceFile.push(f);
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].sourceFile === f) rows.splice(i, 1);
    },
    async listIndexedFiles() {
      const m = new Map<string, string>();
      for (const r of rows) m.set(r.sourceFile, r.sourceHash);
      return [...m.entries()].map(([sourceFile, sourceHash]) => ({ sourceFile, sourceHash }));
    },
  };
  return { store, rows, calls };
}

test("file berubah: reindex menghapus baris lama dulu (tanpa duplikat/stale)", async () => {
  const docStore = createDocStore(":memory:"); docStore.init();
  const { store, rows, calls } = appendOnlyVectorStore();
  let files: Record<string, string> = { "a.md": "versi satu dari dokumen A." };
  const deps = {
    documentsPath: "docs",
    embedder: fakeEmbedder,
    vectorStore: store,
    docStore,
    listFiles: async () => Object.keys(files),
    readFile: async (name: string) => files[name],
  };

  const r1 = await syncFolder(deps);
  expect(r1.indexed).toBe(1);
  const v1Hash = rows[0].sourceHash;
  const v1Ids = new Set(rows.map((r) => r.id));
  const v1Count = rows.length;
  expect(v1Count).toBeGreaterThan(0);

  files = { "a.md": "versi dua dari dokumen A, isinya sudah berbeda." };
  const deletesBefore = calls.deleteBySourceFile.filter((f) => f === "a.md").length;
  const r2 = await syncFolder(deps);

  expect(r2.indexed).toBe(1);
  // delete dipanggil untuk a.md selama reindex
  expect(calls.deleteBySourceFile.filter((f) => f === "a.md").length).toBeGreaterThan(deletesBefore);
  // tak ada baris stale v1: semua baris a.md berhash baru & id baru
  expect(rows.every((r) => r.sourceFile === "a.md" && r.sourceHash !== v1Hash)).toBe(true);
  expect(rows.some((r) => v1Ids.has(r.id))).toBe(false);
  // jumlah baris = jumlah child v2 saja (bukan v1 + v2)
  expect(new Set(rows.map((r) => r.sourceHash)).size).toBe(1);
  expect(rows.length).toBe(v1Count); // kedua versi pendek => 1 child masing-masing
});

test("embed gagal utk satu file: dilewati, file lain tetap terindeks", async () => {
  const docStore = createDocStore(":memory:"); docStore.init();
  const { store, rows } = appendOnlyVectorStore();
  const files: Record<string, string> = {
    "good.md": "dokumen bagus yang normal.",
    "bad.md": "dokumen BOOM yang membuat embed gagal.",
  };
  const boomEmbedder: Embedder = {
    async embed() { return [0.1]; },
    async embedBatch(texts) {
      if (texts.some((t) => t.includes("BOOM"))) throw new Error("rate limit");
      return texts.map(() => [0.1]);
    },
  };
  const deps = {
    documentsPath: "docs",
    embedder: boomEmbedder,
    vectorStore: store,
    docStore,
    listFiles: async () => Object.keys(files),
    readFile: async (name: string) => files[name],
  };

  const origErr = console.error;
  console.error = () => {};
  let result: { indexed: number; removed: number };
  try {
    result = await syncFolder(deps);
  } finally {
    console.error = origErr;
  }

  expect(result.indexed).toBe(1);
  const indexedNames = (await store.listIndexedFiles()).map((f) => f.sourceFile);
  expect(indexedNames).toContain("good.md");
  expect(indexedNames).not.toContain("bad.md");
  expect(rows.some((r) => r.sourceFile === "bad.md")).toBe(false);
});
