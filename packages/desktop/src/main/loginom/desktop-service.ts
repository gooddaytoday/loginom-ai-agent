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
    strictRecovery: process.env.LOGINOM_AI_AGENT_STRICT_RECOVERY === "1",
    headless:
      process.env.LOGINOM_AI_AGENT_TEST_ONBOARDING === "1" && process.env.LOGINOM_AI_AGENT_TEST_HEADLESS === "1",
  })
}
