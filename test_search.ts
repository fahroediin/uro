import { GoogleGenAI } from "@google/genai";
import env from "./env";

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEYS.split(",")[0] });

async function run() {
  const models = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];
  for (const model of models) {
    try {
      console.log(`\nTesting ${model}`);
      const res = await ai.models.generateContent({
        model,
        contents: "Siapa pemenang piala oscar 2024 untuk aktor terbaik?",
        config: { tools: [{ googleSearch: {} }] }
      });
      console.log(`${model} Result: ${res.text?.substring(0, 100)}...`);
      console.log(`Grounding Metadata:`, !!res.candidates?.[0]?.groundingMetadata);
    } catch (e: any) {
      console.error(`${model} Error:`, e.message);
    }
  }
}

run();
