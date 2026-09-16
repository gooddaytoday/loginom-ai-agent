import { productChannel } from "@loginom-ai-agent/product"

export type Channel = "dev" | "beta" | "prod"

export function resolveChannel(): Channel {
  return productChannel(Bun.env.LOGINOM_AI_AGENT_CHANNEL)
}
