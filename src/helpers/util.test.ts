import { test, expect } from "bun:test";
import { isGreeting } from "./util";

test("sapaan pendek → true", () => {
  expect(isGreeting("halo")).toBe(true);
  expect(isGreeting("makasih ya")).toBe(true);
});
test("pertanyaan nyata → false", () => {
  expect(isGreeting("berapa harga paket premium")).toBe(false);
  expect(isGreeting("halo, tolong jelaskan kebijakan refund dong")).toBe(false);
});
