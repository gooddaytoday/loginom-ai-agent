import { app } from "electron"
import {
  DESKTOP_LOG_BYTES,
  redactLogValues,
  retainedLogs,
  SIDECAR_LOG_BYTES,
} from "@loginom-ai-agent/loginom-host/local-logs"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { SidecarCredentials } from "../service/sidecar-credentials"
import type { CrashReport } from "./crash-logging"

export const NET_LOG_SIZE = 20 * 1024 * 1024

let files: ReturnType<typeof createLogFiles> | undefined

export function logFiles() {
  return (files ??= createLogFiles())
}

function createLogFiles() {
  const root = join(app.getPath("userData"), "logs")
  const run = join(root, `${stamp()}-${randomUUID()}`)
  const sidecar = serviceLogDirectory()
  const desktopLogs = retainedLogs(root, DESKTOP_LOG_BYTES - NET_LOG_SIZE, [sidecar, join(run, "network.netlog")])
  const sidecarLogs = retainedLogs(sidecar, SIDECAR_LOG_BYTES)

  return {
    root,
    run,
    append: desktopLogs.append,
    prune() {
      desktopLogs.prune()
      sidecarLogs.prune()
    },
  }
}

export function serviceLogDirectory() {
  return join(app.getPath("userData"), "logs", "service")
}

export function serviceSecrets() {
  const password = SidecarCredentials.get()?.password

  return password ? [password] : []
}

export const writeCrash: CrashReport = (message, details) => {
  try {
    const files = logFiles()
    const data = redactLogValues([message, details], serviceSecrets())
    files.append(
      join(files.run, "crash.log"),
      JSON.stringify({ timestamp: new Date().toISOString(), level: "error", data }),
    )
  } catch {
    // A logging error must not replace the original uncaught error.
  }
}

export function stamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "")
}
