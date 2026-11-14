import { app, safeStorage } from "electron"
import { join, resolve } from "node:path"
import {
  createLoginomHost,
  verifyInstallationResources,
  warmInstallationBrowser,
} from "@loginom-ai-agent/loginom-host/host"
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
    resourceVersion: app.getVersion(),
    codec: credentials(process.platform, safeStorage),
    environment: process.env,
    headless:
      process.env.LOGINOM_AI_AGENT_TEST_ONBOARDING === "1" && process.env.LOGINOM_AI_AGENT_TEST_HEADLESS === "1",
    // Only the packaged app with its own resources may carry the baked capability.
    browserRecovery: import.meta.env.LOGINOM_AI_AGENT_BROWSER_RECOVERY === true && app.isPackaged,
  })
}

export async function verifyDesktopResources() {
  const root = join(app.getPath("userData"), "loginom")
  const resources = loginomResources()
  const verified = await verifyInstallationResources({
    root,
    resources,
    resourceVersion: app.getVersion(),
  })
  if (process.platform === "win32") {
    // Warmup is advisory. Full integrity/cache failures above and below remain fatal.
    await warmInstallationBrowser({ root, resources, verified }).catch(() => undefined)
    return verifyInstallationResources({ root, resources, resourceVersion: app.getVersion(), forceHash: false })
  }
  return verified
}
