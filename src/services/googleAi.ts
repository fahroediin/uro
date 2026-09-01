import {
  createPartFromUri,
  HarmBlockThreshold,
  HarmCategory,
  type Part,
} from "@google/genai";
import type { Attachment } from "discord.js";
import { aiConfig, guardrails } from "../config";
import { keyRotator } from "./keyRotator";

const RATE_LIMIT_MESSAGE =
  "Duh, Uro lagi kena limit dari Google nih (Quota Exceeded / 429). Bentar ya, kasih waktu Uro buat napas semenit, baru coba lagi! 🐍";

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

export const aiService = {
  /**
   * Generates a text response with system instruction from config.
   * @param prompt The user-facing prompt.
   * @param channelHistory Recent channel messages for context.
   * @param systemInstruction The system prompt built from config.
   */
  generateText: async (
    prompt: string,
    channelHistory: string,
    systemInstruction: string
  ): Promise<string> => {
    try {
      return await keyRotator.execute(async (ai) => {
        console.log("generateText");

        const parts: Part[] = [];
        if (channelHistory.trim()) {
          parts.push({
            text: `[Channel History Context]\n${channelHistory}\n\n[User Prompt]\n${prompt}`,
          });
        } else {
          parts.push({ text: prompt });
        }

        const response = await ai.models.generateContent({
          model: aiConfig.textModel,
          contents: [{ role: "user", parts }],
          config: {
            systemInstruction: systemInstruction,
            tools: guardrails.allowGoogleSearch ? [{ googleSearch: {} }] : [],
            safetySettings: safetySettings,
          },
        });

        return response.text || "Something wrong";
      });
    } catch (e: any) {
      if (e.message === "RATE_LIMIT_EXHAUSTED") {
        return RATE_LIMIT_MESSAGE;
      }
      throw e;
    }
  },

  /**
   * Generates a response using an uploaded file (image/document) as context.
   * Channel history is passed inline as text (no extra Files API upload).
   */
  generateContentWithFileContext: async (
    prompt: string,
    attachment: Attachment,
    attachmentBuffer: ArrayBuffer,
    channelHistory: string,
    systemInstruction: string
  ): Promise<{ text: string; image?: Buffer }> => {
    try {
      return await keyRotator.execute(async (ai) => {
        console.log(
          prompt.substring(0, 10),
          "... generateContentWithFileContext()"
        );

        // Sanitize filename for the Files API displayName.
        const sanitizeFileName = (filename: string): string =>
          filename
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-+|-+$/g, "")
            .substring(0, 25) || "attachment";

        // Inline channel history as text — cheaper and faster than uploading
        // it through the Files API just to delete it moments later.
        const promptText = channelHistory.trim()
          ? `[Channel History Context]\n${channelHistory}\n\n[User Prompt]\n${prompt}`
          : prompt;
        const parts: Part[] = [{ text: promptText }];

        // Upload ONLY the real attachment and wait for it to finish processing.
        const uploaded = await ai.files.upload({
          file: new Blob([attachmentBuffer], {
            type: attachment.contentType || "application/octet-stream",
          }),
          config: {
            displayName: sanitizeFileName(attachment.name),
            mimeType: attachment.contentType || "application/octet-stream",
          },
        });

        let ready = uploaded;
        if (uploaded.name) {
          let status = await ai.files.get({ name: uploaded.name });
          while (status.state === "PROCESSING") {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            status = await ai.files.get({ name: uploaded.name });
          }
          ready = status;
        }

        if (ready.state !== "FAILED" && ready.uri && ready.mimeType) {
          parts.push(createPartFromUri(ready.uri, ready.mimeType));
        }

        const response = await ai.models.generateContent({
          model: aiConfig.fileModel,
          contents: [{ role: "user", parts }],
          config: {
            systemInstruction: systemInstruction,
            safetySettings: safetySettings,
          },
        });

        // Extract response content.
        let textOutput = "";
        let imgOutput: Buffer | undefined = undefined;
        response.candidates?.[0]?.content?.parts?.forEach((part) => {
          if (part.text) textOutput += part.text;
          else if (part.inlineData?.data)
            imgOutput = Buffer.from(part.inlineData.data, "base64");
        });

        // Cleanup uploaded file (best-effort).
        if (uploaded.name)
          ai.files.delete({ name: uploaded.name }).catch(() => null);

        return { text: textOutput || "Something wrong", image: imgOutput };
      });
    } catch (e: any) {
      if (e.message === "RATE_LIMIT_EXHAUSTED") {
        return { text: RATE_LIMIT_MESSAGE };
      }
      throw e;
    }
  },
};
