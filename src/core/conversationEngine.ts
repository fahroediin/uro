import { platformConfigs } from "../config/platforms";
import type { NormalizedMessage } from "./types";

export function shouldRespond(msg: NormalizedMessage): boolean {
  const cfg = platformConfigs[msg.platform];
  return (
    (msg.isDirectMessage && cfg.respondInDM) ||
    msg.isMentioned ||
    cfg.respondChannelIds.includes(msg.chatId)
  );
}
