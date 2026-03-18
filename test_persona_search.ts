import { GoogleGenAI } from "@google/genai";
import env from "./env";
import { buildSystemPrompt } from "./src/config/systemPrompt";
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEYS.split(",")[0] });
async function run() {
  const systemInstruction = buildSystemPrompt("User123");
  console.log("Testing with gemini-2.5-flash-lite...");
  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: "skor barca vs new castle td",
      config: { tools: [{ googleSearch: {} }], systemInstruction }
    });
    console.log("Result:", res.text?.substring(0, 150));
    console.log("Grounding:", !!res.candidates?.[0]?.groundingMetadata);
  } catch(e: any) { console.error(e.message); }
}
run();
