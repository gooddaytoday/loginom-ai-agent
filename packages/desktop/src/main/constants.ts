import { app } from "electron"
import { appIdentity } from "./app-identity"

type Channel = "local" | "dev" | "beta" | "prod"

const raw = import.meta.env.LOGINOM_AI_AGENT_CHANNEL

export const CHANNEL: Channel = raw === "local" || raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const VERSION = app.isPackaged ? app.getVersion() : (process.env.LOGINOM_AI_AGENT_VERSION ?? app.getVersion())

// Local renderer/server mode keeps the dev application identity.
const identity = appIdentity({ packaged: app.isPackaged, channel: CHANNEL })

export const APP_NAME = identity.name

export const APP_ID = identity.id
