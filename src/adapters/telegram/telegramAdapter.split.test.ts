import { test, expect } from "bun:test";
import { splitForTelegram } from "./telegramAdapter";

test("teks pendek -> satu chunk", () => {
  expect(splitForTelegram("halo")).toEqual(["halo"]);
});

test("teks > 4096 -> beberapa chunk, masing-masing <= 4096", () => {
  const long = "kata ".repeat(1500); // ~7500 char
  const chunks = splitForTelegram(long);
  expect(chunks.length).toBeGreaterThan(1);
  for (const c of chunks) expect(c.length).toBeLessThanOrEqual(4096);
});
