import { test, expect } from "bun:test";
import { toNormalizedMessage } from "./discordMapper";

function fakeMessage(overrides: any = {}) {
  return {
    id: "m1",
    cleanContent: "halo bot",
    createdTimestamp: 111,
    client: { user: { id: "botid" } },
    guild: { id: "g1" },
    author: { id: "u1", displayName: "Budi" },
    channel: { id: "c1" },
    mentions: { has: (id: string) => id === "botid" },
    attachments: new Map(),
    fetchReference: async () => null,
    ...overrides,
  } as any;
}

test("memetakan field dasar + prefix chatId", async () => {
  const n = await toNormalizedMessage(fakeMessage());
  expect(n.platform).toBe("discord");
  expect(n.chatId).toBe("discord:c1");
  expect(n.userId).toBe("u1");
  expect(n.userName).toBe("Budi");
  expect(n.text).toBe("halo bot");
  expect(n.isMentioned).toBe(true);
  expect(n.isDirectMessage).toBe(false);
  expect(n.timestamp).toBe(111);
});

test("DM: tidak ada guild → isDirectMessage true", async () => {
  const n = await toNormalizedMessage(fakeMessage({ guild: null }));
  expect(n.isDirectMessage).toBe(true);
});

test("attachment dipetakan (mimeType default bila null)", async () => {
  const att = new Map([
    ["a1", { url: "http://x/f.png", contentType: null, size: 10, name: "f.png" }],
  ]);
  const n = await toNormalizedMessage(fakeMessage({ attachments: att }));
  expect(n.attachments.length).toBe(1);
  expect(n.attachments[0].url).toBe("http://x/f.png");
  expect(n.attachments[0].mimeType).toBe("application/octet-stream");
  expect(n.attachments[0].fileName).toBe("f.png");
});

test("repliedTo diringkas dari fetchReference", async () => {
  const n = await toNormalizedMessage(
    fakeMessage({
      fetchReference: async () => ({
        cleanContent: "pesan lama",
        author: { displayName: "Ani" },
      }),
    })
  );
  expect(n.repliedTo).toEqual({ text: "pesan lama", userName: "Ani" });
});
