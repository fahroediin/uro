import { test, expect } from "bun:test";
import { buildSystemPrompt } from "./systemPrompt";

test("platform label muncul di prompt sesuai argumen", () => {
  expect(buildSystemPrompt("Budi", "telegram")).toContain("Platform: Telegram");
  expect(buildSystemPrompt("Budi", "whatsapp")).toContain("Platform: WhatsApp");
});

test("default platform adalah discord", () => {
  expect(buildSystemPrompt("Budi")).toContain("Platform: Discord server");
});
