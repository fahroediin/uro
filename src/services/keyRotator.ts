import { GoogleGenAI } from "@google/genai";
import env from "../../env";

// How long a rate-limited key is skipped before being retried.
const COOLDOWN_MS = 60_000;

class KeyRotator {
  private keys: string[];
  private clients: GoogleGenAI[];
  private cooldownUntil: number[];
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
    this.cooldownUntil = this.keys.map(() => 0);
    console.log(`🔑 Initialized KeyRotator with ${this.keys.length} keys.`);
  }

  private maskKey(index: number): string {
    const key = this.keys[index];
    if (key.length <= 8) return "***";
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  /** Pick the next key that isn't cooling down. Returns -1 if all are. */
  private nextAvailableIndex(): number {
    const now = Date.now();
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.currentIndex + i) % this.keys.length;
      if (this.cooldownUntil[idx] <= now) {
        this.currentIndex = idx;
        return idx;
      }
    }
    return -1;
  }

  async execute<T>(operation: (client: GoogleGenAI) => Promise<T>): Promise<T> {
    // Try each key at most once per call.
    for (let attempt = 0; attempt < this.keys.length; attempt++) {
      const idx = this.nextAvailableIndex();
      if (idx === -1) break; // every key is cooling down

      try {
        return await operation(this.clients[idx]);
      } catch (error: any) {
        console.error(
          `[GenAI Error with key ${this.maskKey(idx)}]:`,
          error.message || error
        );

        const isRateLimit =
          error?.status === 429 ||
          String(error?.message).includes("429") ||
          String(error?.message).toLowerCase().includes("quota") ||
          String(error?.message).toLowerCase().includes("resource exhausted");

        if (isRateLimit) {
          this.cooldownUntil[idx] = Date.now() + COOLDOWN_MS;
          this.currentIndex = (idx + 1) % this.keys.length;
          console.warn(
            `⚠️ Rate limit on key ${this.maskKey(idx)} — cooling down ${
              COOLDOWN_MS / 1000
            }s, rotating to next key.`
          );
        } else {
          // Non-rate-limit error (e.g. policy violation) — fail fast.
          throw error;
        }
      }
    }

    console.error("❌ All API keys are rate limited / exhausted.");
    throw new Error("RATE_LIMIT_EXHAUSTED");
  }
}

export const keyRotator = new KeyRotator();
