import { app, safeStorage } from "electron"
import { join, resolve } from "node:path"
import { createLoginomHost } from "@loginom-ai-agent/loginom-host/host"
import { credentials } from "./credentials"

export function desktopLoginom() {
  return createLoginomHost({
    root: join(app.getPath("userData"), "loginom"),
    resources: app.isPackaged
      ? join(process.resourcesPath, "loginom")
      : resolve(import.meta.dirname, "../../resources/loginom"),
    codec: credentials(process.platform, safeStorage),
    environment: process.env,
  })
}
