import { test, expect } from "bun:test";
import type { RetrievedChunk, ChildRecord, ParentRecord, RagService } from "./types";
import { ragConfig } from "../../config/rag";

test("tipe RAG dapat dibentuk sesuai kontrak", () => {
  const rc: RetrievedChunk = { parentId: "p1", text: "isi", sourceFile: "a.md", score: 0.9 };
  const cr: ChildRecord = { id: "c1", parentId: "p1", vector: [0.1], sourceFile: "a.md", sourceHash: "h" };
  const pr: ParentRecord = { parentId: "p1", text: "isi", sourceFile: "a.md", sourceHash: "h" };
  expect(rc.parentId).toBe("p1");
  expect(cr.vector.length).toBe(1);
  expect(pr.sourceFile).toBe("a.md");
});

test("ragConfig default aman (OFF) & nilai konsisten", () => {
  expect(ragConfig.enabled).toBe(false);
  expect(ragConfig.childTopK).toBe(10);
  expect(ragConfig.maxParentsInContext).toBe(4);
  expect(ragConfig.embedModel).toBe("gemini-embedding-001");
});
