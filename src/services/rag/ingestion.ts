import { randomUUID } from "crypto";
import { makeParents, makeChildren } from "./chunker";
import { hashContent } from "./extractor";
import type { ChildRecord, DocStore, Embedder, ParentRecord, VectorStore } from "./types";

export interface SyncDeps {
  documentsPath: string;
  embedder: Embedder;
  vectorStore: VectorStore;
  docStore: DocStore;
  listFiles: () => Promise<string[]>;         // nama file relatif
  readFile: (name: string) => Promise<string>; // isi teks file
}

export async function syncFolder(deps: SyncDeps): Promise<{ indexed: number; removed: number }> {
  const { embedder, vectorStore, docStore } = deps;
  const names = await deps.listFiles();
  const currentHashes = new Map<string, string>();
  for (const name of names) {
    try {
      const content = await deps.readFile(name);
      if (content && content.trim()) currentHashes.set(name, hashContent(content));
    } catch (e) {
      console.error(`[rag] gagal baca ${name}:`, e);
    }
  }

  const indexed = new Map<string, string>();
  for (const f of await vectorStore.listIndexedFiles()) indexed.set(f.sourceFile, f.sourceHash);

  let removed = 0;
  for (const file of indexed.keys()) {
    if (!currentHashes.has(file)) {
      await vectorStore.deleteBySourceFile(file);
      docStore.deleteBySourceFile(file);
      removed++;
    }
  }

  let indexedCount = 0;
  for (const [file, hash] of currentHashes.entries()) {
    if (indexed.get(file) === hash) continue; // tak berubah
    try {
      await vectorStore.deleteBySourceFile(file);
      docStore.deleteBySourceFile(file);
      const content = await deps.readFile(file);
      const parents = makeParents(content);
      const parentRecords: ParentRecord[] = [];
      const childRecords: ChildRecord[] = [];
      for (const pText of parents) {
        const parentId = randomUUID();
        parentRecords.push({ parentId, text: pText, sourceFile: file, sourceHash: hash });
        const children = makeChildren(pText);
        const vectors = await embedder.embedBatch(children);
        children.forEach((_c, i) => {
          childRecords.push({
            id: randomUUID(), parentId, vector: vectors[i], sourceFile: file, sourceHash: hash,
          });
        });
      }
      docStore.putParents(parentRecords);
      await vectorStore.upsertChildren(childRecords);
      indexedCount++;
    } catch (e) {
      console.error(`[rag] gagal indeks ${file}:`, e);
    }
  }

  return { indexed: indexedCount, removed };
}
