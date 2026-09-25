export type Platform = "discord" | "telegram" | "whatsapp";

export interface NormalizedAttachment {
  url?: string;
  buffer?: ArrayBuffer;
  mimeType: string;
  size: number;
  fileName: string;
}

export interface NormalizedMessage {
  platform: Platform;
  messageId: string;
  chatId: string;
  userId: string;
  userName: string;
  text: string;
  isMentioned: boolean;
  isDirectMessage: boolean;
  repliedTo?: { text: string; userName: string };
  attachments: NormalizedAttachment[];
  timestamp: number;
}

export interface OutgoingMessage {
  text: string;
  image?: Buffer;
  replyToMessageId?: string;
}

export interface PlatformAdapter {
  readonly platform: Platform;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(chatId: string, msg: OutgoingMessage): Promise<void>;
  sendTyping(chatId: string): Promise<void>;
}

export type MessageHandler = (
  msg: NormalizedMessage,
  adapter: PlatformAdapter
) => Promise<void>;
