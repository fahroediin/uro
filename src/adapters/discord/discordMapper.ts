import type { Message } from "discord.js";
import type { NormalizedAttachment, NormalizedMessage } from "../../core/types";

export async function toNormalizedMessage(message: Message): Promise<NormalizedMessage> {
  const ref = await message.fetchReference().catch(() => null);

  const attachments: NormalizedAttachment[] = [...message.attachments.values()].map(
    (att: any) => ({
      url: att.url,
      mimeType: att.contentType || "application/octet-stream",
      size: att.size,
      fileName: att.name || "attachment",
    })
  );

  return {
    platform: "discord",
    messageId: message.id,
    chatId: `discord:${message.channel.id}`,
    userId: message.author.id,
    userName: message.author.displayName,
    text: message.cleanContent,
    isMentioned: message.mentions.has(message.client.user!.id),
    isDirectMessage: !message.guild,
    repliedTo: ref
      ? { text: (ref as any).cleanContent ?? "", userName: (ref as any).author.displayName }
      : undefined,
    attachments,
    timestamp: message.createdTimestamp,
  };
}
