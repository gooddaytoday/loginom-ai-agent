import { homedir } from "node:os"
import path from "node:path"
import { productChannel, productSlug } from "@loginom-ai-agent/product"

// Fork seam (catalog CAT-13, U5): Desktop looks for its background service in the registration file the CLI writes
// (`ServiceConfig.filename` in packages/cli), in the CLI's state root for the same product channel (`Global.Path.state`
// in packages/util). The build sets the channel to prod, beta or dev, as for the CLI it bundles (`latest` is prod).
// Desktop always names the file: the client's default `service.json` knows no channel, and under an identity the
// default file belongs to another product or profile running the same version.
export const directory = productSlug(productChannel(import.meta.env.LOGINOM_AI_AGENT_CHANNEL))

// Read at call time: the isolated development server moves XDG_STATE_HOME before it asks.
export function serviceFile() {
  const state = process.env.XDG_STATE_HOME || path.join(homedir(), ".local", "state")

  return path.join(state, directory, filename())
}

function filename() {
  const identity = process.env.LOGINOM_AI_AGENT_SERVICE_IDENTITY?.replace(/[^a-zA-Z0-9._-]/g, "-")

  if (identity) return `service-${identity}.json`

  // The development server runs the CLI from source, whose channel is local.
  if (process.env.LOGINOM_AI_AGENT_DESKTOP_SERVER_CHANNEL === "local") return "service-local.json"

  return "service.json"
}
