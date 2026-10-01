import * as lancedb from "@lancedb/lancedb";
import type { VectorStore, ChildRecord } from "./types";

const TABLE = "children";

export function createVectorStore(dir: string): VectorStore {
  let db: any = null;
  let table: any = null;

  async function ensureDb() {
    if (!db) db = await lancedb.connect(dir);
    return db;
  }
  async function openTableIfExists() {
    const d = await ensureDb();
    const names = await d.tableNames();
    if (names.includes(TABLE)) table = await d.openTable(TABLE);
    return table;
  }

  return {
    async init() {
      await ensureDb();
      await openTableIfExists();
    },
    async upsertChildren(records: ChildRecord[]) {
      if (records.length === 0) return;
      const d = await ensureDb();
      if (!table) await openTableIfExists();
      if (!table) {
        table = await d.createTable(TABLE, records, { mode: "create" });
      } else {
        await table.add(records);
      }
    },
    async search(vector: number[], k: number) {
      if (!table) await openTableIfExists();
      if (!table) return [];
      const rows = await table.search(vector).limit(k).toArray();
      return rows.map((r: any) => ({
        parentId: r.parentId as string,
        sourceFile: r.sourceFile as string,
        score: 1 / (1 + (r._distance ?? 0)),
      }));
    },
    async deleteBySourceFile(sourceFile: string) {
      if (!table) await openTableIfExists();
      if (!table) return;
      await table.delete(`sourceFile = '${sourceFile.replace(/'/g, "''")}'`);
    },
    async listIndexedFiles() {
      if (!table) await openTableIfExists();
      if (!table) return [];
      const rows = await table.query().toArray();
      const map = new Map<string, string>();
      for (const r of rows) map.set(r.sourceFile as string, r.sourceHash as string);
      return [...map.entries()].map(([sourceFile, sourceHash]) => ({ sourceFile, sourceHash }));
    },
  };
}
