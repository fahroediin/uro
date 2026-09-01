import { AttachmentBuilder, Message } from "discord.js";
import env from "../../env";
import { formatTimestamp, splitTextPreserveWords } from "../helpers/util";
import { dbService } from "../services/database";
import { aiService } from "../services/googleAi";
import { guardrails, responseConfig, buildSystemPrompt } from "../config";

const BOT_CHANNEL_ID = env.BOT_CHANNEL_ID;
const MAX_FILE_SIZE = guardrails.maxFileSize;

// --- FIX FOR DUPLICATE MESSAGES ---
// Holds IDs of messages currently being processed to avoid double handling.
const processingMessages = new Set<string>();

// --- DEBOUNCE MECHANISM ---
// Pending timeouts and accumulated messages per user+channel.
const debounceTimeouts = new Map<string, NodeJS.Timeout>();
const pendingMessages = new Map<string, Message[]>();
const DEBOUNCE_DELAY = responseConfig.debounceDelayMs;

/**
 * Fetch a buffer from a URL (used for attachment analysis).
 */
async function getBufferFromUrl(url: string): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch attachment: ${response.statusText}`);
      return null;
    }
    return await response.arrayBuffer();
  } catch (error) {
    console.error("Error fetching buffer from URL:", error);
    return null;
  }
}

/**
 * Process accumulated messages for a user in a channel.
 */
async function processAccumulatedMessages(userChannelKey: string) {
  const messages = pendingMessages.get(userChannelKey);
  if (!messages || messages.length === 0) return;

  pendingMessages.delete(userChannelKey);

  const primaryMessage = messages[messages.length - 1];

  if (processingMessages.has(primaryMessage.id)) {
    console.warn(
      `Already processing message ID: ${primaryMessage.id}. Ignoring duplicate event.`
    );
    return;
  }

  processingMessages.add(primaryMessage.id);

  try {
    await processMessage(primaryMessage, messages);
  } finally {
    processingMessages.delete(primaryMessage.id);
    dbService.pruneChannelHistory(primaryMessage.channel.id);
  }
}

/**
 * Main message processing logic.
 */
async function processMessage(primaryMessage: Message, allMessages: Message[]) {
  const isMentioned = primaryMessage.mentions.has(primaryMessage.client.user!.id);
  const isBotChannel = primaryMessage.channel.id === BOT_CHANNEL_ID;

  const messageReference = await primaryMessage.fetchReference().catch(() => null);

  // Log every message to the database for channel history.
  for (const msg of allMessages) {
    const msgReference = await msg.fetchReference().catch(() => null);
    dbService.addChannelMessage({
      messageId: msg.id,
      channelId: msg.channel.id,
      content: msg.cleanContent.substring(0, 500),
      authorId: msg.author.id,
      authorUsername: msg.author.displayName,
      timestamp: msg.createdTimestamp,
      repliedMessage: msgReference?.cleanContent?.substring(0, 50) || "",
      repliedMessageId: msgReference?.id || "",
      repliedTo: msg.mentions.repliedUser?.globalName || "",
    });
  }

  // Only respond if mentioned or inside the designated bot channel.
  if (!isMentioned && !isBotChannel) {
    return; // Messages are logged; nothing else to do.
  }

  // Channel allowlist check (if configured).
  if (
    guardrails.allowedChannels.length > 0 &&
    !guardrails.allowedChannels.includes(primaryMessage.channel.id)
  ) {
    return;
  }

  // Helper: send a reply, splitting long content into chunks.
  async function sendReply(content: string, files: AttachmentBuilder[] = []) {
    try {
      if (!primaryMessage.channel.isSendable()) return;

      const chunks = splitTextPreserveWords(content, responseConfig.maxChunkSize);
      let fileAttachment = files;
      let isFirstMessage = true;

      for (const chunk of chunks) {
        if (!isFirstMessage) {
          await new Promise((resolve) =>
            setTimeout(resolve, responseConfig.multiMessageDelayMs)
          );
        }

        const replyOptions = { content: chunk, files: fileAttachment };

        isBotChannel || !isFirstMessage
          ? await primaryMessage.channel.send(replyOptions)
          : await primaryMessage.reply(replyOptions);

        fileAttachment = [];
        isFirstMessage = false;
      }
    } catch (error) {
      console.error("Failed to send reply:", error);
    }
  }

  if (responseConfig.typingIndicator && "sendTyping" in primaryMessage.channel) {
    await primaryMessage.channel.sendTyping();
  }

  // Build the system prompt from config.
  const systemInstruction = buildSystemPrompt(primaryMessage.author.displayName);

  // Find an attachment to analyze: author's most recent, else the replied-to one.
  let authorAttachment: any = null;
  if (guardrails.allowAttachments) {
    for (let i = allMessages.length - 1; i >= 0; i--) {
      authorAttachment = allMessages[i].attachments.find(
        (att) => att.size <= MAX_FILE_SIZE
      );
      if (authorAttachment) break;
    }
  }

  const referenceAttachment = guardrails.allowAttachments
    ? messageReference?.attachments.find((att) => att.size <= MAX_FILE_SIZE)
    : undefined;

  // Build channel history context string.
  const channelHistory = dbService
    .getChannelHistory(primaryMessage.channel.id)
    .map(
      (msg) =>
        `[${formatTimestamp(msg.timestamp)}] ${msg.authorUsername}: ${msg.content}`
    )
    .join("\n");

  // Build the user prompt.
  let prompt = "";
  if (allMessages.length > 1) {
    prompt += `User sent ${allMessages.length} messages in quick succession:\n`;
    allMessages.forEach((msg, index) => {
      prompt += `Message ${index + 1}: ${msg.cleanContent}\n`;
    });
    prompt += `Respond naturally to their complete thought.`;
  } else {
    prompt += `${primaryMessage.cleanContent}`;
  }

  if (messageReference) {
    prompt += `\n(The user is replying to ${
      primaryMessage.mentions.repliedUser?.globalName || "a previous message"
    }: "${messageReference.cleanContent}")`;
  }

  const contextAttachment = authorAttachment || referenceAttachment;

  if (contextAttachment) {
    prompt += `\n(The conversation involves an attachment. Analyze it if relevant.)`;
    const fileBuffer = await getBufferFromUrl(contextAttachment.url);

    if (fileBuffer) {
      const content = await aiService.generateContentWithFileContext(
        prompt,
        contextAttachment,
        fileBuffer,
        channelHistory,
        systemInstruction
      );

      const fileAttachment: AttachmentBuilder[] = [];
      if (content.image) {
        fileAttachment.push(
          new AttachmentBuilder(content.image, { name: "generated-image.png" })
        );
      }

      await sendReply(content.text, fileAttachment);
    } else {
      await sendReply(responseConfig.errorMessages.attachmentFail);
    }
  } else {
    const content = await aiService.generateText(
      prompt,
      channelHistory,
      systemInstruction
    );
    await sendReply(content);
  }
}

export async function handleMessage(message: Message) {
  // Ignore bots and channels we can't send messages in.
  if (message.author.bot || !message.channel.isSendable()) return;

  const userChannelKey = `${message.author.id}-${message.channel.id}`;

  const existingTimeout = debounceTimeouts.get(userChannelKey);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  if (!pendingMessages.has(userChannelKey)) {
    pendingMessages.set(userChannelKey, []);
  }
  pendingMessages.get(userChannelKey)!.push(message);

  const timeout = setTimeout(async () => {
    try {
      await processAccumulatedMessages(userChannelKey);
    } catch (error) {
      console.error(
        "An unexpected error occurred in processAccumulatedMessages:",
        error
      );
      const messages = pendingMessages.get(userChannelKey);
      if (messages && messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        await lastMessage
          .reply(responseConfig.errorMessages.generic)
          .catch(() => {});
      }
    } finally {
      debounceTimeouts.delete(userChannelKey);
    }
  }, DEBOUNCE_DELAY);

  debounceTimeouts.set(userChannelKey, timeout);
}
