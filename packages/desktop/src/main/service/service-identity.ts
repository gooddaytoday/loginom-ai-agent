import { homedir } from "node:os"
import path from "node:path"

// Fork seam (catalog CAT-13, U5): Desktop looks for its background service in the registration file the CLI writes
// under the same identity (`ServiceConfig.filename` in packages/cli), in the CLI's state root (`Global.Path.state` in
// packages/util). It never adopts the default `service.json` of another product or profile running the same version.
// Read at call time: the isolated development server moves XDG_STATE_HOME before it asks.
export function serviceFile() {
  const identity = process.env.LOGINOM_AI_AGENT_SERVICE_IDENTITY?.replace(/[^a-zA-Z0-9._-]/g, "-")
  if (!identity) return undefined
  const state = process.env.XDG_STATE_HOME || path.join(homedir(), ".local", "state")
  return path.join(state, "loginom-ai-agent", `service-${identity}.json`)
}
