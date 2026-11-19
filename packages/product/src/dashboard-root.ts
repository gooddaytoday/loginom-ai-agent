import { existsSync, realpathSync, statSync } from "node:fs"
import { realpath, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, join } from "node:path"
import { profilePaths } from "./cli-profile"
import { productChannel, productSlug } from "./index"

export const DASHBOARD_SESSION_MARKER = "loginom_dashboard"

const draftId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i

// Preserve the original draft lifetime and any completed deletion.
export function dashboardSessionMarker(previous: unknown, incoming?: unknown) {
  if (previous === "deleted" || incoming === "deleted") return "deleted"
  if (previous === true || (typeof previous === "string" && draftId.test(previous))) return previous
  if (incoming === true || (typeof incoming === "string" && draftId.test(incoming))) return incoming
}

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

export function isDashboardWorkDirectory(directory: string, root: string) {
  if (!existsSync(directory) || !existsSync(root)) return false
  const work = realpathSync(directory)
  return statSync(work).isDirectory() && basename(work) === "work" && dirname(dirname(work)) === realpathSync(root)
}

export async function isDashboardWorkDirectoryAsync(directory: string, root: string) {
  const work = await realpath(directory)
  return basename(work) === "work" && dirname(dirname(work)) === (await realpath(root)) && (await stat(work)).isDirectory()
}
