import { test, expect } from "bun:test";
import type { RetrievedChunk, ChildRecord, ParentRecord, RagService } from "./types";
import { ragConfig, isRagEnabled } from "../../config/rag";

test("tipe RAG dapat dibentuk sesuai kontrak", () => {
  const rc: RetrievedChunk = { parentId: "p1", text: "isi", sourceFile: "a.md", score: 0.9 };
  const cr: ChildRecord = { id: "c1", parentId: "p1", vector: [0.1], sourceFile: "a.md", sourceHash: "h" };
  const pr: ParentRecord = { parentId: "p1", text: "isi", sourceFile: "a.md", sourceHash: "h" };
  expect(rc.parentId).toBe("p1");
  expect(cr.vector.length).toBe(1);
  expect(pr.sourceFile).toBe("a.md");
});

test("ragConfig nilai konsisten", () => {
  expect(ragConfig.childTopK).toBe(10);
  expect(ragConfig.maxParentsInContext).toBe(4);
  expect(ragConfig.embedModel).toBe("gemini-embedding-001");
});

test("isRagEnabled: hanya 'true' yang menyalakan (default aman OFF)", () => {
  expect(isRagEnabled("true")).toBe(true);
  expect(isRagEnabled("false")).toBe(false);
  expect(isRagEnabled(undefined)).toBe(false);
  expect(isRagEnabled("")).toBe(false);
  expect(isRagEnabled("1")).toBe(false);
  expect(isRagEnabled("TRUE")).toBe(false); // ketat: harus persis "true"
});
