import { test, expect } from "bun:test";
import { createEmbedder } from "./embedder";

test("embed memakai RETRIEVAL_QUERY & kembalikan satu vektor", async () => {
  const calls: { texts: string[]; taskType: string }[] = [];
  const fake = async (texts: string[], taskType: string) => {
    calls.push({ texts, taskType });
    return texts.map(() => [0.1, 0.2, 0.3]);
  };
  const emb = createEmbedder(fake);
  const v = await emb.embed("halo");
  expect(v).toEqual([0.1, 0.2, 0.3]);
  expect(calls[0].taskType).toBe("RETRIEVAL_QUERY");
  expect(calls[0].texts).toEqual(["halo"]);
});

test("embedBatch memakai RETRIEVAL_DOCUMENT", async () => {
  const calls: { texts: string[]; taskType: string }[] = [];
  const fake = async (texts: string[], taskType: string) => {
    calls.push({ texts, taskType });
    return texts.map(() => [1, 1]);
  };
  const emb = createEmbedder(fake);
  const vs = await emb.embedBatch(["a", "b"]);
  expect(vs.length).toBe(2);
  expect(calls[0].taskType).toBe("RETRIEVAL_DOCUMENT");
});
