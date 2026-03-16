import { Client, Events, GatewayIntentBits } from "discord.js";
import { handleMessage } from "./handlers/messageHandler";
import { persona } from "./config";

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

client.once(Events.ClientReady, () => {
  console.log(`🐍 ${persona.name} is online! Logged in as ${client.user?.tag}`);
});

client.on(Events.MessageCreate, handleMessage);
