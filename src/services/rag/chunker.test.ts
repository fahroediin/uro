import { test, expect } from "bun:test";
import { makeParents, makeChildren } from "./chunker";

test("teks pendek → satu parent", () => {
  expect(makeParents("halo dunia")).toEqual(["halo dunia"]);
});

test("teks panjang → beberapa parent dgn overlap, tiap <= chunkSize", () => {
  const long = "kata ".repeat(1200); // ~6000 char
  const parents = makeParents(long, 2000, 200);
  expect(parents.length).toBeGreaterThan(1);
  for (const p of parents) expect(p.length).toBeLessThanOrEqual(2000);
});

test("makeChildren memecah parent jadi potongan lebih kecil", () => {
  const parent = "Kalimat satu. Kalimat dua. " + "isi ".repeat(200);
  const children = makeChildren(parent, 400, 80);
  expect(children.length).toBeGreaterThan(1);
  for (const c of children) expect(c.length).toBeLessThanOrEqual(400 + 80);
});

test("child pendek → satu child", () => {
  expect(makeChildren("cukup pendek").length).toBe(1);
});
