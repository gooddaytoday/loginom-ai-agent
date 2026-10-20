import { app, safeStorage } from "electron"
import { join, resolve } from "node:path"
import { createLoginomHost } from "@loginom-ai-agent/loginom-host/host"
import { BROWSER_RECOVERY } from "../constants"
import { credentials } from "./credentials"

export function loginomResources() {
  return app.isPackaged
    ? join(process.resourcesPath, "loginom")
    : resolve(import.meta.dirname, "../../resources/loginom")
}

export function desktopLoginom() {
  return createLoginomHost({
    root: join(app.getPath("userData"), "loginom"),
    resources: loginomResources(),
    codec: credentials(process.platform, safeStorage),
    environment: process.env,
    browserRecovery: BROWSER_RECOVERY,
    headless:
      process.env.LOGINOM_AI_AGENT_TEST_ONBOARDING === "1" && process.env.LOGINOM_AI_AGENT_TEST_HEADLESS === "1",
  })
}
