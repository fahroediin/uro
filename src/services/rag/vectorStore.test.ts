import { test, expect } from "bun:test";
import { createVectorStore } from "./vectorStore";
import { rmSync } from "fs";

const DIR = `./_test_vec_${Date.now()}`;

test("upsert + search + delete + list (LanceDB)", async () => {
  try {
    const vs = createVectorStore(DIR);
    await vs.init();
    await vs.upsertChildren([
      { id: "a", parentId: "p1", vector: [1, 0, 0], sourceFile: "d1.md", sourceHash: "h1" },
      { id: "b", parentId: "p2", vector: [0, 1, 0], sourceFile: "d2.md", sourceHash: "h2" },
    ]);
    const res = await vs.search([1, 0, 0], 1);
    expect(res.length).toBe(1);
    expect(res[0].parentId).toBe("p1");

    const files = await vs.listIndexedFiles();
    expect(files.map((f) => f.sourceFile).sort()).toEqual(["d1.md", "d2.md"]);

    await vs.deleteBySourceFile("d1.md");
    const after = await vs.listIndexedFiles();
    expect(after.map((f) => f.sourceFile)).toEqual(["d2.md"]);
  } finally {
    rmSync(DIR, { recursive: true, force: true });
  }
});
