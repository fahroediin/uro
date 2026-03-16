/**
 * Parses text from file attachment (limited to ~5000 tokens)
 */

import type { Content } from "@google/genai";
import type { Message } from "discord.js";
import { aiService } from "../services/googleAi";

/**
 * Fetches the chain of messages this message is replying to.
 * @param message The starting message of the reply chain.
 * @returns A promise that resolves to the conversation history as a Content array.
 */
export async function getReplyChainHistory(
  message: Message
): Promise<Content[]> {
  const history: Content[] = [];
  let currentMessage: Message | null = message;

  // Traverse up the reply chain from the current message's reference
  while (currentMessage && currentMessage.reference?.messageId) {
    try {
      currentMessage = await currentMessage.channel.messages.fetch(
        currentMessage.reference.messageId
      );
      if (currentMessage) {
        history.unshift({
          role: currentMessage.author.bot ? "model" : "user",
          parts: [{ text: currentMessage.content }],
        });
      }
    } catch (error) {
      console.error("Failed to fetch replied message:", error);
      currentMessage = null;
    }
  }
  return history;
}

/**
 * Uses AI to detect if the message is requesting image generation (minimal tokens)
 */
export async function detectImageGenerationIntent(content: string): Promise<{
  isImageRequest: boolean;
  imagePrompt: string;
}> {
  try {
    const response = await aiService.generateTextIntent(content);
    const json = extractJson(response);

    if (json) {
      return {
        isImageRequest: json.isImageRequest || false,
        imagePrompt: json.imagePrompt || "",
      };
    }
  } catch (error) {
    console.error("Intent detection failed:", error);
  }

  const lowerContent = content.toLowerCase();
  const imageKeywords = ["ggg"];
  const hasImageKeyword = imageKeywords.some((keyword) =>
    lowerContent.includes(keyword)
  );

  const imagePrompt = hasImageKeyword ? content.replace("ggg", "") : "";

  return {
    isImageRequest: hasImageKeyword,
    imagePrompt: imagePrompt,
  };
}

function extractJson(str: string) {
  if (typeof str !== "string") {
    return null;
  }

  // Find the first occurrence of '{' or '[' to determine the start of JSON
  const firstBrace = str.indexOf("{");
  const firstBracket = str.indexOf("[");

  let startIndex = -1;

  if (firstBrace === -1 && firstBracket === -1) {
    return null; // No JSON structure found
  }

  if (firstBrace === -1) {
    startIndex = firstBracket;
  } else if (firstBracket === -1) {
    startIndex = firstBrace;
  } else {
    startIndex = Math.min(firstBrace, firstBracket);
  }

  // Starting from the potential start, try to parse substrings
  for (let i = startIndex; i < str.length; i++) {
    const subString = str.substring(startIndex, i + 1);
    try {
      // If parsing succeeds, we've found the full JSON object/array
      return JSON.parse(subString);
    } catch (e) {
      // Ignore parsing errors and continue to extend the substring
      // This is expected as we build the string char-by-char
    }
  }

  // If the loop completes without a successful parse, no valid JSON was found
  return null;
}

export const formatTimestamp = (ts: number) =>
  ((d = new Date(ts)) =>
    `[${d.getMonth() + 1}/${d.getDate()}, ${d.getHours() % 12 || 12}:${String(
      d.getMinutes()
    ).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}]`)(new Date(ts));

export function splitTextPreserveWords(text: string, maxChunkSize = 1500) {
  if (!text || text.length <= maxChunkSize) {
    return [text];
  }

  const chunks = [];
  let currentIndex = 0;

  while (currentIndex < text.length) {
    let endIndex = currentIndex + maxChunkSize;

    // If we're at the end of the text, take the rest
    if (endIndex >= text.length) {
      chunks.push(text.slice(currentIndex));
      break;
    }

    // Find the last space before the limit to avoid breaking words
    let lastSpaceIndex = text.lastIndexOf(" ", endIndex);

    // If no space found within reasonable range, look for other word boundaries
    if (lastSpaceIndex <= currentIndex) {
      // Look for other word boundary characters
      const wordBoundaries = [
        " ",
        "\n",
        "\t",
        ".",
        ",",
        ";",
        ":",
        "!",
        "?",
        "-",
      ];
      let bestBoundary = -1;

      for (let boundary of wordBoundaries) {
        let boundaryIndex = text.lastIndexOf(boundary, endIndex);
        if (boundaryIndex > currentIndex && boundaryIndex > bestBoundary) {
          bestBoundary = boundaryIndex;
        }
      }

      lastSpaceIndex = bestBoundary > currentIndex ? bestBoundary : endIndex;
    }

    // Extract the chunk
    const chunk = text.slice(currentIndex, lastSpaceIndex).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    // Move to the next position (skip the space/boundary character)
    currentIndex = lastSpaceIndex + 1;
  }

  return chunks;
}
