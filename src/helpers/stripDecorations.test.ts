import { test, expect } from "bun:test";
import { stripDecorations } from "./util";

test("buang emoji ular dan emoji lain", () => {
  expect(stripDecorations("Yuhu juga, Fahrudin. 🐍")).toBe("Yuhu juga, Fahrudin.");
  expect(stripDecorations("halo 😀 dunia ❤️")).toBe("halo dunia");
});

test("buang emoji di tengah kalimat tanpa sisa spasi ganda", () => {
  expect(stripDecorations("oke 🐍 lanjut")).toBe("oke lanjut");
});

test("ganti em-dash dan en-dash dengan tanda baca biasa", () => {
  // em-dash dengan spasi di sekelilingnya -> jadi pemisah koma/spasi wajar
  expect(stripDecorations("jawabannya — ini")).toBe("jawabannya - ini");
  expect(stripDecorations("rentang 1–3")).toBe("rentang 1-3");
});

test("PERTAHANKAN simbol kode & operator (jangan dirusak)", () => {
  expect(stripDecorations("pakai array.flatMap() satu baris")).toBe("pakai array.flatMap() satu baris");
  expect(stripDecorations("0.1 + 0.2 !== 0.3")).toBe("0.1 + 0.2 !== 0.3");
  expect(stripDecorations("const f = () => x")).toBe("const f = () => x");
  expect(stripDecorations("cek port 5432 && restart")).toBe("cek port 5432 && restart");
});

test("PERTAHANKAN hyphen biasa dan flag CLI", () => {
  expect(stripDecorations("anti-bocor")).toBe("anti-bocor");
  expect(stripDecorations("jalankan bun --help")).toBe("jalankan bun --help");
});

test("teks tanpa dekorasi tidak berubah", () => {
  expect(stripDecorations("Error di line 42. Perbaiki lalu restart.")).toBe(
    "Error di line 42. Perbaiki lalu restart."
  );
});

test("string kosong aman", () => {
  expect(stripDecorations("")).toBe("");
});
