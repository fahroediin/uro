import { GoogleGenAI } from "@google/genai";
import env from "./env";

async function run() {
  const keys = env.GEMINI_API_KEYS.split(",");
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i].trim();
    if (!key) continue;
    const ai = new GoogleGenAI({ apiKey: key });
    try {
      console.log(`Checking key ${i+1}...`);
      await ai.models.generateContent({ model: "gemini-2.5-flash-lite", contents: "test" });
      console.log(`Key ${i+1} OK`);
    } catch(e: any) {
      console.log(`Key ${i+1} FAIL: ${e.message.substring(0, 100)}`);
    }
  }
}
run();
