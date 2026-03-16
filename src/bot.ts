import env from "../env";
import { client } from "./client";

const DISCORD_BOT_TOKEN = env.DISCORD_BOT_TOKEN;

if (!DISCORD_BOT_TOKEN) {
  throw new Error("DISCORD_BOT_TOKEN is not set in the .env file");
}

client.login(DISCORD_BOT_TOKEN);
