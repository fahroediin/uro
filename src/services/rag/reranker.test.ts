import { test, expect } from "bun:test";
import { passthroughReranker } from "./reranker";
import type { RetrievedChunk } from "./types";

test("passthrough mengembalikan kandidat apa adanya", async () => {
  const c: RetrievedChunk[] = [
    { parentId: "p1", text: "a", sourceFile: "f", score: 0.5 },
    { parentId: "p2", text: "b", sourceFile: "f", score: 0.9 },
  ];
  const out = await passthroughReranker.rerank("q", c);
  expect(out).toEqual(c);
});
