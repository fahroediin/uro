import { test, expect } from "bun:test";
import { createDocStore } from "./docStore";

test("put/get parents + delete by source file", () => {
  const store = createDocStore(":memory:");
  store.init();
  store.putParents([
    { parentId: "p1", text: "isi satu", sourceFile: "a.md", sourceHash: "h1" },
    { parentId: "p2", text: "isi dua", sourceFile: "b.md", sourceHash: "h2" },
  ]);
  const got = store.getParents(["p1", "p2"]);
  expect(got.length).toBe(2);
  expect(got.find((p) => p.parentId === "p1")?.text).toBe("isi satu");

  store.deleteBySourceFile("a.md");
  const after = store.getParents(["p1", "p2"]);
  expect(after.length).toBe(1);
  expect(after[0].parentId).toBe("p2");
});
