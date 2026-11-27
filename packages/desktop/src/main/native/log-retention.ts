import { DESKTOP_LOG_BYTES, retainedLogs } from "@loginom-ai-agent/loginom-host/local-logs"
import { retainedServiceLogs } from "@loginom-ai-agent/loginom-host/service-logs"
import { randomUUID } from "node:crypto"
import { join } from "node:path"

export const NET_LOG_SIZE = 20 * 1024 * 1024

export function createLogFiles(root: string) {
  const run = join(root, `${stamp()}-${randomUUID()}`)
  const sidecar = join(root, "service")
  const desktopLogs = retainedLogs(root, DESKTOP_LOG_BYTES - NET_LOG_SIZE, [sidecar, join(run, "network.netlog")])
  const sidecarLogs = retainedServiceLogs(sidecar)

  return {
    root,
    run,
    append: desktopLogs.append,
    prune() {
      desktopLogs.prune()

      return sidecarLogs.prune()
    },
  }
}

export function stamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "")
}
