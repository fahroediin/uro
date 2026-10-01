import { test, expect } from "bun:test";
import { hashContent } from "./extractor";

test("hashContent deterministik & beda utk konten beda", () => {
  expect(hashContent("abc")).toBe(hashContent("abc"));
  expect(hashContent("abc")).not.toBe(hashContent("abd"));
});
