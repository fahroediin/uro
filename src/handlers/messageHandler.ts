import { AttachmentBuilder, Message } from "discord.js";
import env from "../../env";
import {
  detectImageGenerationIntent,
  formatTimestamp,
  splitTextPreserveWords,
} from "../helpers/util";
import { dbService } from "../services/database";
import { aiService } from "../services/googleAi";
import {
  persona,
  guardrails,
  responseConfig,
  buildSystemPrompt,
} from "../config";

const BOT_CHANNEL_ID = env.BOT_CHANNEL_ID;
const MAX_FILE_SIZE = guardrails.maxFileSize;

// --- FIX FOR DUPLICATE MESSAGES ---
// This Set will hold the IDs of messages currently being processed.
// This prevents race conditions where a message event might be fired twice.
const processingMessages = new Set<string>();

// --- DEBOUNCE MECHANISM ---
// Store pending timeouts for each user in each channel
const debounceTimeouts = new Map<string, NodeJS.Timeout>();
// Store accumulated messages for each user in each channel
const pendingMessages = new Map<string, Message[]>();
// Debounce delay from config
const DEBOUNCE_DELAY = responseConfig.debounceDelayMs;

/**
 * A helper function to fetch a buffer from a URL.
 */
async function getBufferFromUrl(url: string): Promise<ArrayBuffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch attachment: ${response.statusText}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return arrayBuffer;
  } catch (error) {
    console.error("Error fetching buffer from URL:", error);
    return null;
  }
}

/**
 * Process accumulated messages for a user in a channel
 */
async function processAccumulatedMessages(userChannelKey: string) {
  const messages = pendingMessages.get(userChannelKey);
  if (!messages || messages.length === 0) return;

  // Clear the pending messages
  pendingMessages.delete(userChannelKey);

  // Use the most recent message as the primary message
  const primaryMessage = messages[messages.length - 1];

  // Check if we should process this message
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
 * Main message processing logic
 */
async function processMessage(primaryMessage: Message, allMessages: Message[]) {
  // Determine the context of the message
  const isMentioned = primaryMessage.mentions.has(
    primaryMessage.client.user!.id
  );
  const isBotChannel = primaryMessage.channel.id === BOT_CHANNEL_ID;

  // Fetch the replied-to message, if any
  const messageReference = await primaryMessage
    .fetchReference()
    .catch(() => null);

  // Log all messages to our database
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

  // The bot only responds if it's mentioned or if the message is in the designated bot channel.
  if (!isMentioned && !isBotChannel) {
    return; // We've logged the messages, now we can exit.
  }

  // Channel allowlist check (if configured)
  if (
    guardrails.allowedChannels.length > 0 &&
    !guardrails.allowedChannels.includes(primaryMessage.channel.id)
  ) {
    return; // Channel not in allowlist
  }

  // A simplified reply function
  async function sendReply(content: string, files: AttachmentBuilder[] = []) {
    try {
      if (!primaryMessage.channel.isSendable()) return;

      const chunks = splitTextPreserveWords(
        content,
        responseConfig.maxChunkSize
      );
      let fileAttachment = files;
      let isFirstMessage = true;

      for (const chunk of chunks) {
        // Add delay between messages (except for the first one)
        if (!isFirstMessage) {
          await new Promise((resolve) =>
            setTimeout(resolve, responseConfig.multiMessageDelayMs)
          );
        }

        const replyOptions = { content: chunk, files: fileAttachment };

        // Only reply for the first message if it's a reply type, rest are regular sends
        const sentMessage =
          isBotChannel || !isFirstMessage
            ? await primaryMessage.channel.send(replyOptions)
            : await primaryMessage.reply(replyOptions);

        // Clear files after first message and set flag
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

  // --- Build system prompt from config ---
  const systemInstruction = buildSystemPrompt(
    primaryMessage.author.displayName
  );

  // --- DECISION LOGIC ---

  // Check all messages for attachments, prioritizing the most recent
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

  // Combine all message contents for intent detection
  const combinedContent = allMessages.map((msg) => msg.cleanContent).join(" ");
  const intentPrompt = messageReference
    ? `main message: ${combinedContent}, replying to: ${messageReference.cleanContent}`
    : combinedContent;

  const imageIntent = await detectImageGenerationIntent(intentPrompt);

  // --- HANDLE IMAGE GENERATION ---
  if (imageIntent.isImageRequest && guardrails.allowImageGeneration) {
    const imagePrompt = `. Image prompt: ${imageIntent.imagePrompt}`;
    let fullPrompt = combinedContent + imagePrompt;
    if (messageReference) {
      fullPrompt += `. In reply to: ${messageReference.cleanContent}`;
    }

    // Determine which attachment to use (author's or the one from the reply)
    const sourceAttachment =
      authorAttachment ||
      (referenceAttachment?.contentType?.startsWith("image/")
        ? referenceAttachment
        : undefined);

    try {
      let generatedImageBuffer: Buffer | undefined;
      let outputPrompt = "";

      if (sourceAttachment) {
        const imageBuffer = await getBufferFromUrl(sourceAttachment.url);
        if (!imageBuffer)
          return sendReply(responseConfig.errorMessages.attachmentFail);
        const response = await aiService.generateImageToImage(
          fullPrompt,
          imageBuffer
        );
        generatedImageBuffer = response.image;
        outputPrompt = response.text;
      } else {
        const response = await aiService.generateImage(fullPrompt);
        generatedImageBuffer = response.image;
        outputPrompt = response.text;
      }

      let attachment = [];

      if (generatedImageBuffer) {
        const imgAttachment = new AttachmentBuilder(generatedImageBuffer, {
          name: "generated-image.png",
        });

        attachment.push(imgAttachment);
      }

      await sendReply(outputPrompt, attachment);
    } catch (error) {
      console.error("Image generation failed:", error);
      await sendReply(responseConfig.errorMessages.imageFail);
    }
    return;
  }

  // --- HANDLE TEXT GENERATION ---

  // Construct the base prompt with channel history
  const channelHistory = dbService
    .getChannelHistory(primaryMessage.channel.id)
    .map(
      (msg) =>
        `[${formatTimestamp(msg.timestamp)}] ${msg.authorUsername}: ${
          msg.content
        }`
    )
    .join("\n");

  // Create the user prompt (without system info — that's now in systemInstruction)
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

      let fileAttachment = [];
      if (content.image) {
        const attachment = new AttachmentBuilder(content.image, {
          name: "generated-image.png",
        });
        fileAttachment.push(attachment);
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
  // Ignore bots and channels we can't send messages in
  if (message.author.bot || !message.channel.isSendable()) return;

  // Create a unique key for this user in this channel
  const userChannelKey = `${message.author.id}-${message.channel.id}`;

  // Clear any existing timeout for this user/channel combination
  const existingTimeout = debounceTimeouts.get(userChannelKey);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  // Add this message to the pending messages
  if (!pendingMessages.has(userChannelKey)) {
    pendingMessages.set(userChannelKey, []);
  }
  pendingMessages.get(userChannelKey)!.push(message);

  // Set a new timeout
  const timeout = setTimeout(async () => {
    try {
      await processAccumulatedMessages(userChannelKey);
    } catch (error) {
      console.error(
        "An unexpected error occurred in processAccumulatedMessages:",
        error
      );
      // Try to send an error message using the most recent message
      const messages = pendingMessages.get(userChannelKey);
      if (messages && messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        await lastMessage
          .reply(responseConfig.errorMessages.generic)
          .catch(() => {});
      }
    } finally {
      // Clean up
      debounceTimeouts.delete(userChannelKey);
    }
  }, DEBOUNCE_DELAY);

  debounceTimeouts.set(userChannelKey, timeout);
}
