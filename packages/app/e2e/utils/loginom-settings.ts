import type { Page } from "@playwright/test"
import { NO_PROVIDER } from "./app"
import type { MockServerConfig } from "./mock-server"
import { mockWorkspace } from "./workspace"

export const loginomAddress = "https://loginom.example/app/"
export const loginomDiagnosticKey = "synthetic-knowledge-key"

export async function openLoginomSettings(page: Page, onRpc: MockServerConfig["onRpc"]) {
  await mockWorkspace(page, { directory: "/test/loginom", name: "Loginom demo", provider: NO_PROVIDER, onRpc })
  await page.goto("/settings?tab=loginom")
  return page.getByRole("tabpanel", { name: "Loginom", exact: true }).locator("form")
}

export function loginomSettingsFixture(issue?: "loginUnavailable" | "credentialsRejected") {
  const checks: unknown[] = []
  const saves: unknown[] = []
  const status = {
    revision: 7,
    generation: 4,
    url: loginomAddress,
    username: "analyst",
    folder: "/analyst",
    hasPassword: true,
    state: "ready",
    failed: false,
  }
  const onRpc: MockServerConfig["onRpc"] = ({ rpcID, method, body }) => {
    if (rpcID !== "loginom.connection") return
    switch (method) {
      case "status":
        return { output: { ok: true, value: status } }
      case "check":
        checks.push(body)
        return {
          output: issue
            ? { ok: false, issue, message: `Fixture diagnostic: ${loginomDiagnosticKey}` }
            : { ok: true, value: { validationId: "fixture-validation", expiresAt: Date.now() + 60_000 } },
        }
      case "save":
        saves.push(body)
        return { output: { ok: true, value: { ...status, generation: 5, revision: 8, hasPassword: false } } }
    }
  }
  return { onRpc, checks, saves }
}
