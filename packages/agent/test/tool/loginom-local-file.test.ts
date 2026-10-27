import { expect } from "bun:test"
import { open } from "node:fs/promises"
import { Cause, Effect, Exit, Layer } from "effect"
import { LayerNode } from "@loginom-ai-agent/core/effect/layer-node"
import { FSUtil } from "@loginom-ai-agent/core/fs-util"
import { PermissionV1 } from "@loginom-ai-agent/core/v1/permission"
import { SessionProjector } from "@loginom-ai-agent/core/session/projector"
import { Agent } from "@/agent/agent"
import { Session } from "@/session/session"
import { MessageID } from "@/session/schema"
import { snapshotLoginomFile } from "@/tool/loginom-local-file"
import { Tool } from "@/tool/tool"
import { TestInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(LayerNode.group([Agent.node, Session.node, SessionProjector.node, FSUtil.node])),
    testInstanceStoreLayer,
  ),
)
const context = Effect.gen(function* () {
  const sessions = yield* Session.Service
  const session = yield* sessions.create({ permission: [{ permission: "*", pattern: "*", action: "allow" }] })
  return {
    sessionID: session.id,
    messageID: MessageID.ascending(),
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => Effect.void,
    ask: () => Effect.void,
  } satisfies Tool.Context
})

it.instance("snapshots the authorized realpath when a symlink changes during a permission request", () =>
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const instance = yield* TestInstance
    const first = instance.directory + "/first.csv",
      second = instance.directory + "/second.csv",
      alias = instance.directory + "/alias.csv"
    yield* fs.writeFile(first, Uint8Array.from([0, 255, 1]))
    yield* fs.writeFile(second, Uint8Array.from([0, 255, 2]))
    yield* fs.symlink(first, alias)
    const ctx = yield* context
    const result = yield* snapshotLoginomFile(alias, {
      ...ctx,
      ask: () => fs.remove(alias).pipe(Effect.andThen(fs.symlink(second, alias)), Effect.orDie),
    })
    expect(result.sourcePath).toBe(alias)
    expect(result.file).toEqual({ name: "first.csv", data: Buffer.from([0, 255, 1]).toString("base64") })
    expect(yield* fs.readFile(alias)).toEqual(Uint8Array.from([0, 255, 2]))
  }),
)

it.instance("oversize registration errors include the typed cause, exact limit and next step", () =>
  Effect.gen(function* () {
    const instance = yield* TestInstance
    const path = instance.directory + "/large.csv"
    yield* Effect.promise(async () => {
      const file = await open(path, "w")
      try {
        await file.truncate(16 * 1024 * 1024 + 1)
      } finally {
        await file.close()
      }
    })
    const result = yield* snapshotLoginomFile(path, yield* context).pipe(Effect.exit)
    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      expect(String(Cause.squash(result.cause))).toContain("LOGINOM_FILE_TOO_LARGE")
      expect(String(Cause.squash(result.cause))).toContain('"actual":16777217,"limit":16777216')
      expect(String(Cause.squash(result.cause))).toContain("профиль и выборка")
      expect(String(Cause.squash(result.cause))).not.toContain("--file")
    }
  }),
)

for (const mode of ["missing", "directory", "denied"] as const) {
  it.instance(`local file registration reports ${mode} without reading or admitting bytes`, () =>
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const instance = yield* TestInstance
      const path = instance.directory + "/refused.csv"
      if (mode === "directory") yield* fs.makeDirectory(path)
      if (mode === "denied") {
        yield* fs.writeFileString(path, "private bytes")
        yield* fs.chmod(path, 0)
      }
      const result = yield* snapshotLoginomFile(path, yield* context).pipe(Effect.exit)
      if (mode === "denied") yield* fs.chmod(path, 0o600)
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        const text = String(Cause.squash(result.cause))
        expect(text).toContain(
          {
            missing: "LOGINOM_FILE_NOT_FOUND",
            directory: "LOGINOM_FILE_NOT_REGULAR",
            denied: "LOGINOM_FILE_ACCESS_DENIED",
          }[mode],
        )
        expect(text).not.toContain("private bytes")
      }
    }),
  )
}

it.instance(
  "configured deny is reported before an OS-inaccessible requested path is resolved",
  () =>
    Effect.gen(function* () {
      if (process.platform === "win32") return
      const fs = yield* FSUtil.Service
      const sessions = yield* Session.Service
      const instance = yield* TestInstance
      const directory = instance.directory + "/locked",
        path = directory + "/input.csv"
      yield* fs.makeDirectory(directory)
      yield* fs.writeFileString(path, "private")
      const ctx = yield* context
      yield* sessions.setPermission({
        sessionID: ctx.sessionID,
        permission: [{ permission: "read", pattern: "locked/*", action: "deny" }],
      })
      const metadata: unknown[] = []
      const result = yield* Effect.acquireUseRelease(
        fs.chmod(directory, 0),
        () =>
          snapshotLoginomFile(path, {
            ...ctx,
            ask: () => Effect.die("Must not ask for a configured deny"),
            metadata: (value) =>
              Effect.sync(() => {
                metadata.push(value.metadata)
              }),
          }).pipe(Effect.exit),
        () => fs.chmod(directory, 0o700).pipe(Effect.orDie),
      )
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        expect(Cause.squash(result.cause)).toBeInstanceOf(PermissionV1.DeniedError)
        expect(String(Cause.squash(result.cause))).toContain("LOGINOM_FILE_ACCESS_DENIED")
        expect(String(Cause.squash(result.cause))).not.toMatch(/EACCES|--file/)
      }
      expect(metadata).toEqual([{ permissionDenied: true }])
    }),
  { git: true },
)
