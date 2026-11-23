// Loginom AI Agent (B4.13, decision В-97 п. 4): Desktop 0.4 kept the Loginom connection in `<userData>/loginom/connection`
// with Electron's safeStorage (plaintext on Linux, DPAPI on Windows, the Keychain on macOS). OpenCode 2 runs the Host in
// Desktop's service, in `<data>/loginom` of the service's profile (B2.3), and the Host there knows one codec,
// `cliCredentials`. Before the service starts, the main process moves the active 0.4 connection there once, as a new
// generation. The 0.4 store is only read: 0.4 after a rollback finds it as it left it.
export * as CredentialMigration from "./credential-migration"

import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { cliCredentials } from "@loginom-ai-agent/loginom-host/connection/cli-credentials"
import { connectionStore } from "@loginom-ai-agent/loginom-host/connection/connection-store"
import { credentials } from "@loginom-ai-agent/loginom-host/connection/credentials"
import { Option, Schema } from "effect"
import { serviceData } from "../service/service-identity"

export type Outcome =
  | { readonly state: "none" | "current" | "reset" }
  | { readonly state: "moved"; readonly generation: number }
  | { readonly state: "failed"; readonly step: "read" | "write"; readonly reason: string }

const completed = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ state: Schema.Literal("complete") })),
)

/**
 * Moves the 0.4 connection of `userData` into the store of Desktop's service and says what happened, without a secret:
 * `none` — 0.4 has no connection; `current` — the service already has one, moved before or saved in OpenCode 2;
 * `reset` — 0.4.0 would have removed it; `moved` — the new generation; `failed` — the step and a code. Never rejects.
 * `protection` is Electron's safeStorage, `resources` the application's Loginom resources, which the service's Host
 * also gets: the Keychain helper of `cliCredentials` lives there.
 */
export async function migrate(input: {
  platform: NodeJS.Platform
  protection: Parameters<typeof credentials>[1]
  userData: string
  resources: string
}): Promise<Outcome> {
  const source = path.join(input.userData, "loginom", "connection")
  const root = path.join(serviceData(), "loginom")
  const target = path.join(root, "connection")

  // Files, not stores: a store creates its directories, and reading or writing a record may ask safeStorage, DPAPI or
  // the Keychain. A start with nothing to move touches neither store.
  if (!(await exists(path.join(source, "connection.json")))) return { state: "none" }

  if ((await exists(path.join(target, "connection.json"))) || (await exists(path.join(target, "pending.json"))))
    return { state: "current" }

  const from = connectionStore(source, credentials(input.platform, input.protection))

  const read = await Promise.all([from.read(), from.latestGeneration(), migrated(source)]).catch((error: Error) =>
    failed("read", error),
  )

  if ("state" in read) return read
  const [active, latest, marked] = read

  if (!active) return { state: "none" }

  // The service's store is new, and its own `initialize` marks it migrated to 0.4.0 before the first generation, so the
  // Host keeps a connection to any stand. 0.4.0 removed a connection to a stand other than app.loginom.ai from a profile
  // it had not marked yet (`initialize` in loginom-host/src/connection/connection-store.ts); such a connection does not
  // move.
  if (!marked && (!URL.canParse(active.url) || new URL(active.url).hostname !== "app.loginom.ai"))
    return { state: "reset" }

  return Promise.resolve()
    .then(async () => {
      const to = connectionStore(target, cliCredentials(input.platform, { root, resources: input.resources }))
      // Newer than every 0.4 generation and than a generation an interrupted move left unactivated.
      const generation = Math.max(latest, active.generation, await to.latestGeneration()) + 1
      await to.stage({ ...active, generation })
      await to.activate(generation)

      return { state: "moved" as const, generation }
    })
    .catch((error: Error) => failed("write", error))
}

function exists(file: string) {
  return stat(file).then(
    () => true,
    () => false,
  )
}

async function migrated(directory: string) {
  const text = await readFile(path.join(directory, "v040-migration.json"), "utf8").catch(() => "")

  return Option.isSome(completed(text))
}

// Only a code reaches the outcome and the log: a message can quote what it failed on, such as decrypted JSON.
function failed(step: "read" | "write", error: Error) {
  const reason =
    error instanceof Error && /^LOGINOM_[A-Z_]+$/.test(error.message)
      ? error.message
      : step === "read"
        ? "LOGINOM_STORE_READ_FAILED"
        : "LOGINOM_STORE_WRITE_FAILED"

  return { state: "failed" as const, step, reason }
}
