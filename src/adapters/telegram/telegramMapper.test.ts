import { test, expect } from "bun:test";
import { toNormalizedMessage } from "./telegramMapper";

// grammy Context tiruan: hanya field yang dipakai mapper.
function fakeCtx(over: any = {}) {
  return {
    message: {
      message_id: 42,
      text: "halo bot",
      date: 1700000000, // detik
      ...(over.message ?? {}),
    },
    chat: { id: 111, type: "private", ...(over.chat ?? {}) },
    from: { id: 222, first_name: "Budi", username: "budi_tg", ...(over.from ?? {}) },
    me: { id: 999, username: "uro_bot" },
    ...over,
  } as any;
}

test("private chat: field dasar + prefix + isDirectMessage true", () => {
  const n = toNormalizedMessage(fakeCtx());
  expect(n.platform).toBe("telegram");
  expect(n.chatId).toBe("telegram:111");
  expect(n.messageId).toBe("42");
  expect(n.userId).toBe("222");
  expect(n.userName).toBe("Budi");
  expect(n.text).toBe("halo bot");
  expect(n.isDirectMessage).toBe(true);
  expect(n.timestamp).toBe(1700000000 * 1000); // detik -> ms
  expect(n.attachments).toEqual([]);
});

test("grup: isDirectMessage false; mention saat text sebut @botusername", () => {
  const n = toNormalizedMessage(
    fakeCtx({ chat: { id: -500, type: "group" }, message: { text: "hai @uro_bot apa kabar" } })
  );
  expect(n.chatId).toBe("telegram:-500");
  expect(n.isDirectMessage).toBe(false);
  expect(n.isMentioned).toBe(true);
});

test("grup: reply ke pesan bot -> isMentioned true", () => {
  const n = toNormalizedMessage(
    fakeCtx({
      chat: { id: -500, type: "group" },
      message: { text: "iya", reply_to_message: { from: { id: 999 } } },
    })
  );
  expect(n.isMentioned).toBe(true);
});

test("grup: pesan biasa tanpa mention/reply -> isMentioned false", () => {
  const n = toNormalizedMessage(
    fakeCtx({ chat: { id: -500, type: "group" }, message: { text: "ngobrol biasa" } })
  );
  expect(n.isMentioned).toBe(false);
});

test("userName fallback ke username bila first_name kosong", () => {
  const n = toNormalizedMessage(fakeCtx({ from: { id: 222, first_name: undefined, username: "budi_tg" } }));
  expect(n.userName).toBe("budi_tg");
});
