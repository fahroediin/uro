import { Database } from "bun:sqlite";
import type { DocStore, ParentRecord } from "./types";

export function createDocStore(dbPath: string): DocStore {
  const db = new Database(dbPath);
  return {
    init() {
      db.run(`CREATE TABLE IF NOT EXISTS rag_parents (
        parentId TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        sourceFile TEXT NOT NULL,
        sourceHash TEXT NOT NULL
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_rag_parents_file ON rag_parents (sourceFile)`);
    },
    putParents(records: ParentRecord[]) {
      const stmt = db.prepare(
        "INSERT OR REPLACE INTO rag_parents (parentId, text, sourceFile, sourceHash) VALUES (?, ?, ?, ?)"
      );
      for (const r of records) stmt.run(r.parentId, r.text, r.sourceFile, r.sourceHash);
    },
    getParents(parentIds: string[]): ParentRecord[] {
      if (parentIds.length === 0) return [];
      const placeholders = parentIds.map(() => "?").join(",");
      return db
        .prepare(`SELECT * FROM rag_parents WHERE parentId IN (${placeholders})`)
        .all(...parentIds) as ParentRecord[];
    },
    deleteBySourceFile(sourceFile: string) {
      db.prepare("DELETE FROM rag_parents WHERE sourceFile = ?").run(sourceFile);
    },
  };
}
