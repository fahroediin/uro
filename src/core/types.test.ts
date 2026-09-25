import { test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import type { NormalizedMessage, OutgoingMessage, PlatformAdapter } from "./types";

test("NormalizedMessage & OutgoingMessage dapat dibentuk sesuai kontrak", () => {
  const msg: NormalizedMessage = {
    platform: "discord",
    messageId: "m1",
    chatId: "discord:c1",
    userId: "u1",
    userName: "Budi",
    text: "halo",
    isMentioned: true,
    isDirectMessage: false,
    attachments: [],
    timestamp: 123,
  };
  const out: OutgoingMessage = { text: "hai" };
  expect(msg.chatId.startsWith("discord:")).toBe(true);
  expect(out.text).toBe("hai");
});

test("core/types.ts tidak meng-import discord.js", () => {
  const src = readFileSync(join(import.meta.dir, "types.ts"), "utf8");
  expect(src.includes("discord.js")).toBe(false);
});
