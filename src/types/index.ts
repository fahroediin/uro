import { z } from "zod";

export const ChannelMessageSchema = z.object({
  id: z.number().optional(),
  messageId: z.string(),
  channelId: z.string(),
  content: z.string(),
  authorId: z.string(),
  authorUsername: z.string(),
  repliedTo: z.string(),
  repliedMessage: z.string(),
  repliedMessageId: z.string(),
  timestamp: z.number(),
});

export type ChannelMessage = z.infer<typeof ChannelMessageSchema>;
