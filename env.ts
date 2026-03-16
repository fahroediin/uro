import { z } from "zod";

const EnvSchema = z.object({
  DISCORD_BOT_TOKEN: z.string(),
  GEMINI_API_KEY: z.string(),
  BOT_CHANNEL_ID: z.string(),
});

export type env = z.infer<typeof EnvSchema>;

const { data: env, error } = EnvSchema.safeParse(Bun.env);

if (error) {
  console.error("❌ Invalid .env:");
  console.error(JSON.stringify(error.flatten().fieldErrors, null, 2));
  process.exit(1);
}

export default env!;
