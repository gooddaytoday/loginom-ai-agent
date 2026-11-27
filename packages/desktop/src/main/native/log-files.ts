import { app } from "electron"
import { redactLogValues } from "@loginom-ai-agent/loginom-host/local-logs"
import { join } from "node:path"
import { SidecarCredentials } from "../service/sidecar-credentials"
import type { CrashReport } from "./crash-logging"
import { createLogFiles } from "./log-retention"

export { NET_LOG_SIZE, stamp } from "./log-retention"

let files: ReturnType<typeof createLogFiles> | undefined

export function logFiles() {
  return (files ??= createLogFiles(join(app.getPath("userData"), "logs")))
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
