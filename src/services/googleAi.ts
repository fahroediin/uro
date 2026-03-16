import {
  createPartFromUri,
  GenerateContentResponse,
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  Modality,
  Type,
  type Part,
} from "@google/genai";
import type { Attachment } from "discord.js";
import env from "../../env";
import { guardrails } from "../config";

const GEMINI_API_KEY = env.GEMINI_API_KEY!;

// Initialize the correct client
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

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
    console.log("generateText");
    const blob = new Blob([channelHistory], { type: "text/plain" });

    const textPart: Part = { text: prompt };
    const parts: Part[] = [textPart];

    const file = await ai.files.upload({
      file: blob,
      config: {
        displayName: "channel-history.txt",
        mimeType: "text/plain",
      },
    });

    let getFile = await ai.files.get({
      name: file.name || "channel-history.txt",
    });

    while (getFile.state === "PROCESSING") {
      getFile = await ai.files.get({
        name: file.name || "channel-history.txt",
      });
      console.log(`current file status: ${getFile.state}`);
      console.log("File is still processing, retrying in 5 seconds");

      await new Promise((resolve) => {
        setTimeout(resolve, 5000);
      });
    }
    if (file.state === "FAILED") {
    } else {
      if (file.uri && file.mimeType) {
        const fileContent = createPartFromUri(file.uri, file.mimeType);
        parts.push(fileContent);
      }
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: parts }],
      config: {
        systemInstruction: systemInstruction,
        tools: guardrails.allowGoogleSearch ? [{ googleSearch: {} }] : [],
        safetySettings: safetySettings,
      },
    });

    ai.files
      .delete({ name: file.name || "channel-history.txt" })
      .catch(() => null);

    return response.text || "Something wrong";
  },

  generateTextIntent: async (text: string): Promise<string> => {
    console.log("generateTextIntent");

    const systemInstruction = `You are an intent detection model. Analyze the following user text to determine if it's a request to generate an image. If it is, extract the subject of the image. Respond ONLY in the specified JSON format. The user text is: "${text}"`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: systemInstruction,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isImageRequest: {
              type: Type.BOOLEAN,
              description: "True if the user wants to create an image.",
            },
            imagePrompt: {
              type: Type.STRING,
              description:
                "The prompt for the image, if isImageRequest is true.",
            },
          },
          required: ["isImageRequest", "imagePrompt"],
        },
      },
    });

    return response.text || "Mager generate";
  },

  /**
   * Generates an image based on a prompt.
   * @param prompt The text prompt for image generation.
   * @returns A Buffer containing the image data.
   */
  generateImage: async (
    prompt: string
  ): Promise<{ image?: Buffer; text: string }> => {
    console.log("generateImage");

    if (!guardrails.allowImageGeneration) {
      return { text: "Image generation is disabled.", image: undefined };
    }

    return { text: "No image sir, hehe", image: undefined }; // Temporary disable image generation

    let preprompt = `Generate an image with this prompt, don't add a text in the image. Max-width: 500px. Prompt: ${prompt}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-preview-image-generation",
      contents: preprompt,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        safetySettings: safetySettings,
      },
    });

    let textOutput = "";
    let imgOutput: Buffer | undefined = undefined;

    return { text: textOutput, image: imgOutput };
  },

  generateImageToImage: async (
    prompt: string,
    image: ArrayBuffer
  ): Promise<{ image?: Buffer; text: string }> => {
    console.log(prompt.substring(0, 10), "... generateImageToImage()");

    if (!guardrails.allowImageGeneration) {
      return { text: "Image generation is disabled.", image: undefined };
    }

    return { text: "No image sir, hehe", image: undefined }; // Temporary disable image-to-image generation

    const base64String = Buffer.from(image).toString("base64");
    let preprompt = `Generate an image with this prompt, don't add a text in the image. Max-width: 500px. Prompt: ${prompt}`;

    const contents = [
      { text: preprompt },
      {
        inlineData: {
          mimeType: "image/png",
          data: base64String,
        },
      },
    ];

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-preview-image-generation",
      contents,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        safetySettings: safetySettings,
      },
    });

    let textOutput = "";
    let imgOutput: Buffer | undefined = undefined;

    return { text: textOutput, image: imgOutput };
  },

  generateContentWithFileContext: async (
    prompt: string,
    attachment: Attachment,
    attachmentBuffer: ArrayBuffer,
    channelHistory: string,
    systemInstruction: string
  ): Promise<{ text: string; image?: Buffer }> => {
    console.log(
      prompt.substring(0, 10),
      "... generateContentWithFileContext()"
    );

    // Sanitize filename
    const sanitizeFileName = (filename: string): string => {
      return (
        filename
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-+|-+$/g, "")
          .substring(0, 25) || "attachment"
      );
    };

    // Helper function to upload and wait for file processing
    const uploadAndWaitForFile = async (
      blob: Blob,
      displayName: string,
      mimeType: string
    ) => {
      const file = await ai.files.upload({
        file: blob,
        config: { displayName, mimeType },
      });

      let fileStatus = await ai.files.get({ name: file.name || displayName });

      while (fileStatus.state === "PROCESSING") {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        fileStatus = await ai.files.get({ name: file.name || displayName });
      }

      return fileStatus.state === "FAILED" ? null : file;
    };

    const parts: Part[] = [{ text: prompt }];

    // Upload both files
    const [historyFile, attachmentFile] = await Promise.all([
      uploadAndWaitForFile(
        new Blob([channelHistory], { type: "text/plain" }),
        "history.txt",
        "text/plain"
      ),
      uploadAndWaitForFile(
        new Blob([attachmentBuffer], {
          type: attachment.contentType || "application/octet-stream",
        }),
        sanitizeFileName(attachment.name),
        attachment.contentType || "application/octet-stream"
      ),
    ]);

    // Add file parts if uploads succeeded
    [historyFile, attachmentFile].forEach((file) => {
      if (file?.uri && file?.mimeType) {
        parts.push(createPartFromUri(file.uri, file.mimeType));
      }
    });
    const countTokensResponse = await ai.models.countTokens({
      model: "gemini-2.5-flash-lite",
      contents: [{ role: "user", parts }],
    });

    let response: GenerateContentResponse;
    console.log("input token: ", countTokensResponse.totalTokens);

    response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: systemInstruction,
        safetySettings: safetySettings,
      },
    });

    // Extract response content
    let textOutput = "";
    let imgOutput: Buffer | undefined = undefined;

    response.candidates?.[0]?.content?.parts?.forEach((part) => {
      if (part.text) textOutput += part.text;
      else if (part.inlineData?.data)
        imgOutput = Buffer.from(part.inlineData.data, "base64");
    });

    // Cleanup files
    [historyFile, attachmentFile].forEach((file) => {
      if (file?.name) ai.files.delete({ name: file.name }).catch(() => null);
    });

    return { text: textOutput, image: imgOutput };
  },
};
