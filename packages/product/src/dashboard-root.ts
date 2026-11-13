import { homedir } from "node:os"
import { join } from "node:path"
import { profilePaths } from "./cli-profile"
import { productChannel, productSlug } from "./index"

export const DASHBOARD_SESSION_MARKER = "loginom_dashboard"

// Desktop and CLI must create folders under the same data root as the backend.
export function dashboardDataRoot(env: NodeJS.ProcessEnv) {
  const data = env.LOGINOM_AI_AGENT_CLI_ROOT
    ? profilePaths(env.LOGINOM_AI_AGENT_CLI_ROOT).data
    : join(
        env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
        productSlug(productChannel(env.LOGINOM_AI_AGENT_CHANNEL ?? "prod")),
      )
  return join(data, "dashboards")
}
