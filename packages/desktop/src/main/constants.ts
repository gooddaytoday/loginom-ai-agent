import { app } from "electron"
import { Product } from "@loginom-ai-agent/product"

type Channel = "dev" | "beta" | "prod"
const raw = import.meta.env.LOGINOM_AI_AGENT_CHANNEL
export const CHANNEL: Channel = raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const UPDATER_ENABLED = app.isPackaged && CHANNEL !== "dev" && Product.updateFeed !== null
export const BROWSER_RECOVERY = app.isPackaged && import.meta.env.LOGINOM_AI_AGENT_BROWSER_RECOVERY === "1"
