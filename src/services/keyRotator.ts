import { GoogleGenAI } from "@google/genai";
import env from "../../env";

class KeyRotator {
  private keys: string[];
  private clients: GoogleGenAI[];
  private currentIndex: number = 0;

  constructor() {
    this.keys = (env.GEMINI_API_KEYS || "")
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (this.keys.length === 0) {
      console.error("❌ No GEMINI_API_KEYS provided in .env");
      process.exit(1);
    }

    this.clients = this.keys.map((key) => new GoogleGenAI({ apiKey: key }));
    console.log(`🔑 Initialized KeyRotator with ${this.keys.length} keys.`);
  }

  getClient(): GoogleGenAI {
    return this.clients[this.currentIndex];
  }

  getCurrentKeyMasked(): string {
    const key = this.keys[this.currentIndex];
    if (key.length <= 8) return "***";
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  rotateOnError(): void {
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    console.log(
      `🔄 API Key rotated! Now using key: ${this.getCurrentKeyMasked()}`
    );
  }

  async execute<T>(operation: (client: GoogleGenAI) => Promise<T>): Promise<T> {
    const maxAttempts = this.keys.length;
    let attempts = 0;
    let lastError: any;

    while (attempts < maxAttempts) {
      const client = this.getClient();
      try {
        return await operation(client);
      } catch (error: any) {
        lastError = error;

        console.error(
          `[GenAI Error with key ${this.getCurrentKeyMasked()}]:`,
          error.message || error
        );

        const isRateLimit =
          error?.status === 429 ||
          String(error?.message).includes("429") ||
          String(error?.message).toLowerCase().includes("quota") ||
          String(error?.message).toLowerCase().includes("resource exhausted");

        if (isRateLimit) {
          console.warn(`⚠️ Rate limit hit! Rotating to next key...`);
          this.rotateOnError();
          attempts++;
        } else {
          // Non-rate limit error, throw immediately (e.g., policy violation)
          throw error;
        }
      }
    }

    console.error("❌ All API keys have been exhausted/rate limited.");
    throw new Error("RATE_LIMIT_EXHAUSTED");
  }
}

export const keyRotator = new KeyRotator();
