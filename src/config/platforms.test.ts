import { test, expect } from "bun:test";
import { platformConfigs } from "./platforms";

test("discord: respondChannelIds ber-prefix, chunk 2000, markdown aktif", () => {
  const d = platformConfigs.discord;
  expect(d.maxChunkSize).toBe(2000);
  expect(d.useMarkdown).toBe(true);
  expect(d.respondInDM).toBe(false);
  expect(d.respondChannelIds.every((id) => id.startsWith("discord:"))).toBe(true);
});

test("telegram & whatsapp punya limit chunk masing-masing", () => {
  expect(platformConfigs.telegram.maxChunkSize).toBe(4096);
  expect(platformConfigs.whatsapp.maxChunkSize).toBe(65000);
  expect(platformConfigs.telegram.respondInDM).toBe(true);
  expect(platformConfigs.whatsapp.respondInDM).toBe(true);
});
