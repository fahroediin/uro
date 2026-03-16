import { Database } from "bun:sqlite";
import type { ChannelMessage } from "../types";
import { guardrails } from "../config";

const db = new Database("uro_bot.sqlite");

// Initialize tables

db.run(
  `CREATE TABLE IF NOT EXISTS channel_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    messageId TEXT NOT NULL,
    channelId TEXT NOT NULL,
    content TEXT NOT NULL,
    authorId TEXT NOT NULL,
    authorUsername TEXT NOT NULL,
    repliedTo TEXT NOT NULL,
    repliedMessage TEXT NOT NULL,
    repliedMessageId TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  )`
);

export const dbService = {
  addChannelMessage: (message: Omit<ChannelMessage, "id">) => {
    db.prepare(
      "INSERT INTO channel_messages (messageId, channelId, content, authorId, authorUsername, repliedTo, repliedMessage, repliedMessageId, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      message.messageId,
      message.channelId,
      message.content,
      message.authorId,
      message.authorUsername,
      message.repliedTo,
      message.repliedMessage,
      message.repliedMessageId,
      message.timestamp
    );
  },

  getChannelHistory: (channelId: string): ChannelMessage[] => {
    const messages = db
      .prepare(
        `SELECT * FROM channel_messages WHERE channelId = ? ORDER BY timestamp DESC LIMIT ${guardrails.maxHistoryMessages}`
      )
      .all(channelId) as ChannelMessage[];
    return messages.reverse();
  },

  pruneChannelHistory: (channelId: string) => {
    const messageCount = db
      .prepare(
        "SELECT COUNT(*) as count FROM channel_messages WHERE channelId = ?"
      )
      .get(channelId) as { count: number };

    if (messageCount.count > guardrails.maxHistoryMessages) {
      const oldestMessage = db
        .prepare(
          "SELECT id FROM channel_messages WHERE channelId = ? ORDER BY timestamp ASC LIMIT 1"
        )
        .get(channelId) as { id: number };

      if (oldestMessage) {
        db.prepare("DELETE FROM channel_messages WHERE id = ?").run(
          oldestMessage.id
        );
      }
    }
  },
};
