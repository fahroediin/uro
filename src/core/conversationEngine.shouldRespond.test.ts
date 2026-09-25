import { test, expect } from "bun:test";
import { shouldRespond } from "./conversationEngine";
import type { NormalizedMessage } from "./types";

function base(over: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return {
    platform: "discord",
    messageId: "m",
    chatId: "discord:other",
    userId: "u",
    userName: "U",
    text: "t",
    isMentioned: false,
    isDirectMessage: false,
    attachments: [],
    timestamp: 0,
    ...over,
  };
}

test("balas bila di-mention", () => {
  expect(shouldRespond(base({ isMentioned: true }))).toBe(true);
});

test("discord: DM tidak dibalas (respondInDM false)", () => {
  expect(shouldRespond(base({ isDirectMessage: true }))).toBe(false);
});

test("telegram: DM dibalas (respondInDM true)", () => {
  expect(
    shouldRespond(base({ platform: "telegram", isDirectMessage: true, chatId: "tg:1" }))
  ).toBe(true);
});

test("bukan mention & bukan channel terdaftar → tidak dibalas", () => {
  expect(shouldRespond(base())).toBe(false);
});
