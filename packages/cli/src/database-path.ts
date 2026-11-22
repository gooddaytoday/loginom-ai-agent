import path from "node:path"
import { LOGINOM_AI_AGENT_CHANNEL } from "./version"

export function databasePath(data: string) {
  const filename =
    process.env.LOGINOM_AI_AGENT_DB ??
    (["latest", "dev", "beta", "next", "prod"].includes(LOGINOM_AI_AGENT_CHANNEL) ||
    process.env.LOGINOM_AI_AGENT_DISABLE_CHANNEL_DB === "1" ||
    process.env.LOGINOM_AI_AGENT_DISABLE_CHANNEL_DB === "true"
      ? "loginom-ai-agent.db"
      : `opencode-${LOGINOM_AI_AGENT_CHANNEL.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
  return filename === ":memory:" ? filename : path.resolve(data, filename)
}
