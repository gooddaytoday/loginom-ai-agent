import { app } from "electron"
import { Product } from "@loginom-ai-agent/product"

type Channel = "dev" | "beta" | "prod"
const raw = import.meta.env.LOGINOM_AI_AGENT_CHANNEL
export const CHANNEL: Channel = raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const BUILD_SOURCE = {
  sourceSHA: import.meta.env.LOGINOM_AI_AGENT_SOURCE_SHA,
  sourceDirty: import.meta.env.LOGINOM_AI_AGENT_SOURCE_DIRTY,
}

export const UPDATER_ENABLED = app.isPackaged && CHANNEL !== "dev" && Product.updateFeed !== null
