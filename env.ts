import { z } from "zod";

const EnvSchema = z.object({
  DISCORD_BOT_TOKEN: z.string(),
  GEMINI_API_KEYS: z.string(),
  BOT_CHANNEL_ID: z.string(),
  // (Opsional) Base URL proxy untuk Gemini API. Pakai ini kalau VPS Anda
  // berada di region yang diblokir Gemini — arahkan ke proxy di region yang
  // didukung yang meneruskan ke generativelanguage.googleapis.com.
  GEMINI_BASE_URL: z.string().optional(),
});

export type env = z.infer<typeof EnvSchema>;

const { data: env, error } = EnvSchema.safeParse(Bun.env);

if (error) {
  console.error("❌ Invalid .env:");
  console.error(JSON.stringify(error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export default env!;
