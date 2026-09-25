import env from "../../env";
import type { Platform } from "../core/types";

export interface PlatformConfig {
  platformLabel: string;
  respondInDM: boolean;
  respondChannelIds: string[];
  maxChunkSize: number;
  multiMessageDelayMs: number;
  useMarkdown: boolean;
}

export const platformConfigs: Record<Platform, PlatformConfig> = {
  discord: {
    platformLabel: "Discord server",
    respondInDM: false,
    respondChannelIds: [`discord:${env.BOT_CHANNEL_ID}`],
    maxChunkSize: 2000,
    multiMessageDelayMs: 500,
    useMarkdown: true,
  },
  telegram: {
    platformLabel: "Telegram",
    respondInDM: true,
    respondChannelIds: [],
    maxChunkSize: 4096,
    multiMessageDelayMs: 500,
    useMarkdown: false,
  },
  whatsapp: {
    platformLabel: "WhatsApp",
    respondInDM: true,
    respondChannelIds: [],
    maxChunkSize: 65000,
    multiMessageDelayMs: 800,
    useMarkdown: false,
  },
};
