import {
  AttachmentBuilder, Client, Events, GatewayIntentBits, type Message,
} from "discord.js";
import { platformConfigs } from "../../config/platforms";
import { splitTextPreserveWords } from "../../helpers/util";
import type { MessageHandler, OutgoingMessage, Platform, PlatformAdapter } from "../../core/types";
import { toNormalizedMessage } from "./discordMapper";

export function splitForDiscord(text: string): string[] {
  return splitTextPreserveWords(text, platformConfigs.discord.maxChunkSize);
}

export class DiscordAdapter implements PlatformAdapter {
  readonly platform: Platform = "discord";
  private client: Client;

  constructor(private token: string, private handler: MessageHandler) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
      ],
    });
  }

  async start(): Promise<void> {
    this.client.once(Events.ClientReady, () => {
      console.log(`🐍 Uro online (Discord) as ${this.client.user?.tag}`);
    });
    this.client.on(Events.MessageCreate, async (message: Message) => {
      try {
        if (message.author.bot || !message.channel.isSendable()) return;
        const normalized = await toNormalizedMessage(message);
        await this.handler(normalized, this);
      } catch (e) {
        console.error("Discord mapping/handle error:", e);
      }
    });
    await this.client.login(this.token);
  }

  async stop(): Promise<void> {
    await this.client.destroy();
  }

  async sendTyping(chatId: string): Promise<void> {
    const id = chatId.replace(/^discord:/, "");
    const ch = await this.client.channels.fetch(id).catch(() => null);
    if (ch && "sendTyping" in ch) await (ch as any).sendTyping().catch(() => {});
  }

  async sendMessage(chatId: string, msg: OutgoingMessage): Promise<void> {
    try {
      const id = chatId.replace(/^discord:/, "");
      const ch = await this.client.channels.fetch(id).catch(() => null);
      if (!ch || !("send" in ch)) return;

      const files: AttachmentBuilder[] = [];
      if (msg.image) files.push(new AttachmentBuilder(msg.image, { name: "generated-image.png" }));

      const chunks = splitForDiscord(msg.text);
      let firstFiles = files;
      let first = true;
      for (const chunk of chunks) {
        if (!first) {
          await new Promise((r) => setTimeout(r, platformConfigs.discord.multiMessageDelayMs));
        }
        await (ch as any).send({ content: chunk, files: firstFiles });
        firstFiles = [];
        first = false;
      }
    } catch (e) {
      console.error("Discord sendMessage error:", e);
    }
  }
}
