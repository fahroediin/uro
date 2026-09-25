import { test, expect } from "bun:test";
import { splitForDiscord } from "./discordAdapter";

test("teks pendek → satu chunk", () => {
  expect(splitForDiscord("halo")).toEqual(["halo"]);
});

test("teks > 2000 → beberapa chunk, masing-masing <= 2000", () => {
  const long = "kata ".repeat(600); // ~3000 char
  const chunks = splitForDiscord(long);
  expect(chunks.length).toBeGreaterThan(1);
  for (const c of chunks) expect(c.length).toBeLessThanOrEqual(2000);
});
