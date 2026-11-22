import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { Cause, Effect, Exit } from "effect"
import fs from "node:fs/promises"
import path from "node:path"
import { tempGlobalLayer } from "../../core/test/fixture/global"
import { tmpdir } from "../../core/test/fixture/tmpdir"
import { LegacyMigrate } from "../src/legacy-migrate"
import { restoreLegacy } from "./fixture/legacy/restore"
import { startServer } from "./fixture/server"

// The rest of a 0.4 profile beside its sessions (B3.2). Fixtures 0.4-config.jsonc and 0.4-auth.json were written by
// 0.4 itself (fixture/legacy/generate-settings.ts); the provider key in them is made up.
// - The configuration file stays in the channel's config directory, the one OpenCode 2 reads. These tests pin that
//   OpenCode 2 reads the file as 0.4 wrote it, with the 0.4 keys normalized, and writes it without rewriting them.
// - The provider keys move with the sessions: LegacyMigrate imports the auth.json beside the 0.4 database. Here the
//   process data directory holds no auth.json, so OpenCode 2's own import of that file, which runs when it creates an
//   empty database, cannot stand in for the step.
const fixtures = path.join(import.meta.dir, "fixture", "legacy")
const key = "fixture-provider-key"

const migrate = (input: LegacyMigrate.Input) =>
  Effect.runPromiseExit(LegacyMigrate.run(input).pipe(Effect.provide(tempGlobalLayer)))

const failure = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? String(Cause.squash(exit.cause)) : "the migration succeeded"

const credentials = (file: string) => {
  const db = new Database(file, { readonly: true })
  const rows = db
    .query<
      { integration_id: string; label: string; value: string },
      []
    >("SELECT integration_id, label, value FROM credential ORDER BY integration_id")
    .all()
  db.close()
  return rows.map((row) => ({ ...row, value: JSON.parse(row.value) }))
}

const hash = async (file: string) =>
  new Bun.CryptoHasher("sha256").update(await Bun.file(file).arrayBuffer()).digest("hex")

// A 0.4 profile directory: the database and, beside it, the provider keys as 0.4 kept them.
async function profile(directory: string, version: "0.3.9" | "0.4" = "0.4", auth = true) {
  await fs.mkdir(directory, { recursive: true })
  const database = path.join(directory, "loginom-ai-agent.db")
  await restoreLegacy(version, database)
  if (auth) await fs.copyFile(path.join(fixtures, "0.4-auth.json"), path.join(directory, "auth.json"))
  return database
}

describe("0.4 profile", () => {
  test("OpenCode 2 reads the configuration 0.4 wrote and writes it without rewriting the 0.4 keys", async () => {
    await using dir = await tmpdir("loginom-legacy-config-")
    const global = path.join(dir.path, "global")
    const project = path.join(dir.path, "project")
    const other = path.join(dir.path, "other")
    const file = path.join(global, "loginom-ai-agent.jsonc")
    await Promise.all([global, project, other].map((directory) => fs.mkdir(directory, { recursive: true })))
    const original = await Bun.file(path.join(fixtures, "0.4-config.jsonc")).text()
    await Bun.write(file, original)

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const server = yield* startServer(global)
          const document = async (directory: string) => {
            const url = new URL("/api/config", server.base)
            url.searchParams.set("location[directory]", directory)
            const entries = (await (await fetch(url, { headers: server.headers })).json()) as {
              type: string
              path?: string
              info?: Record<string, unknown>
            }[]
            return entries.find((entry) => entry.type === "document" && entry.path === file)?.info
          }

          const read = yield* Effect.promise(() => document(project))
          expect(read).toEqual({
            $schema: "urn:loginom-ai-agent:config",
            shell: "/bin/bash",
            model: { providerID: "stub", model: "stub-model" },
            providers: {
              stub: {
                name: "Stub provider",
                package: "aisdk:@ai-sdk/openai-compatible",
                settings: { baseURL: "http://127.0.0.1:4010/v1" },
                models: { "stub-model": { name: "Stub model" } },
              },
            },
          })

          const response = yield* Effect.promise(() =>
            fetch(new URL("/api/experimental/config", server.base), {
              method: "PATCH",
              headers: { ...server.headers, "content-type": "application/json" },
              body: JSON.stringify({ shell: "/bin/zsh" }),
            }),
          )
          expect(response.status).toBe(204)
          // Only the changed value differs: the 0.4 keys stay as 0.4 wrote them.
          expect(yield* Effect.promise(() => Bun.file(file).text())).toBe(
            original.replace('"shell": "/bin/bash"', '"shell": "/bin/zsh"') + "\n",
          )
          // A Location that loads the configuration after the write reads it as before, with the new value.
          expect(yield* Effect.promise(() => document(other))).toEqual({ ...read, shell: "/bin/zsh" })
        }),
      ),
    )
  })

  test("its provider keys move with the sessions into the database at its own path, and a rerun changes nothing", async () => {
    await using dir = await tmpdir("loginom-legacy-keys-")
    const source = await profile(dir.path)
    const backup = path.join(dir.path, "loginom-ai-agent.v1-backup.db")

    const exit = await migrate({ source, target: source, backup })

    expect(failure(exit)).toBe("the migration succeeded")
    expect(Exit.isSuccess(exit) && "summary" in exit.value && exit.value.summary.credentials).toEqual(["stub"])
    expect(credentials(source)).toEqual([{ integration_id: "stub", label: "API key", value: { type: "key", key } }])

    const migrated = await hash(source)
    const again = await migrate({ source, target: source, backup })

    expect(Exit.isSuccess(again) && again.value.status).toBe("already-migrated")
    expect(Exit.isSuccess(again) && "summary" in again.value && again.value.summary.credentials).toEqual(["stub"])
    expect(await hash(source)).toBe(migrated)
  })

  test("a profile added to an existing database brings its keys, and an integration that has one keeps it", async () => {
    await using dir = await tmpdir("loginom-legacy-keys-")
    const target = path.join(dir.path, "next", "loginom-ai-agent.db")
    const empty = await profile(path.join(dir.path, "first"), "0.3.9", false)
    expect(failure(await migrate({ source: empty, target, backup: path.join(dir.path, "unused.db") }))).toBe(
      "the migration succeeded",
    )
    expect(credentials(target)).toEqual([])

    // OpenCode 2 never runs its import on a database it has already created.
    const second = await profile(path.join(dir.path, "second"))
    const exit = await migrate({ source: second, target, backup: path.join(dir.path, "unused.db") })

    expect(failure(exit)).toBe("the migration succeeded")
    expect(Exit.isSuccess(exit) && "summary" in exit.value && exit.value.summary.credentials).toEqual(["stub"])
    expect(credentials(target)).toEqual([{ integration_id: "stub", label: "API key", value: { type: "key", key } }])

    // A copy of the same profile with another key: its sessions are already there, and so is the key.
    const third = await profile(path.join(dir.path, "third"))
    await Bun.write(
      path.join(dir.path, "third", "auth.json"),
      JSON.stringify({ stub: { type: "api", key: "fixture-other-key" } }),
    )
    const exitThird = await migrate({ source: third, target, backup: path.join(dir.path, "unused.db") })

    expect(failure(exitThird)).toBe("the migration succeeded")
    expect(Exit.isSuccess(exitThird) && "summary" in exitThird.value && exitThird.value.summary.present).toBe(4)
    expect(credentials(target)).toEqual([{ integration_id: "stub", label: "API key", value: { type: "key", key } }])
  })
})
