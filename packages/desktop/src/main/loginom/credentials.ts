// Loginom AI Agent (B4.13, decision В-97 п. 4): Desktop's Loginom credentials for its service. 0.4's main process read
// them with safeStorage; OpenCode 2's Host reads `cliCredentials` in the service. This layer moves the 0.4 connection
// (`credential-migration.ts`) and is built before the background service layer, which starts the service. It never
// stops the app: a connection that cannot move leaves the service without one, and the outcome, a code without
// secrets, goes to the main log, which the debug log export carries.
export * as DesktopCredentials from "./credentials"

import { app, safeStorage } from "electron"
import { Effect, Layer } from "effect"
import { CredentialMigration } from "./credential-migration"
import { LoginomResources } from "./resources"

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const outcome = yield* Effect.promise(() =>
      CredentialMigration.migrate({
        platform: process.platform,
        protection: safeStorage,
        userData: app.getPath("userData"),
        resources: LoginomResources.installation(app).resources,
      }),
    )

    if (outcome.state === "failed")
      return yield* Effect.logWarning("Loginom connection of 0.4 not moved to the service", outcome)
    yield* Effect.logInfo("Loginom connection of 0.4 for the service", outcome)
  }),
)
