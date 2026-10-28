import {
  createAttachmentReceipt,
  bindAttachmentReceipt,
  attachmentReceiptSource,
} from "@loginom-ai-agent/loginom-host/attachment-receipt"
import { pathToFileURL } from "node:url"
import { ProviderV2 } from "@loginom-ai-agent/core/provider"
import { ModelV2 } from "@loginom-ai-agent/core/model"
import { expect } from "bun:test"
import { open } from "node:fs/promises"
import { Cause, Effect, Exit, Layer } from "effect"
import { LayerNode } from "@loginom-ai-agent/core/effect/layer-node"
import { FSUtil } from "@loginom-ai-agent/core/fs-util"
import { PermissionV1 } from "@loginom-ai-agent/core/v1/permission"
import { SessionProjector } from "@loginom-ai-agent/core/session/projector"
import { Agent } from "@/agent/agent"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { admitLoginomFileReference, authorizeLoginomFile, snapshotLoginomFile } from "@/tool/loginom-local-file"
import { admitLoginomLocalFile } from "@/tool/loginom-local-file"
import { fileReferences } from "@loginom-ai-agent/loginom-host/file-reference"
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

for (const size of [16 * 1024 * 1024, 16 * 1024 * 1024 + 1])
  it.instance(`public local admission selects the byte/reference boundary at ${size}`, () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const ctx = yield* context
      const source = instance.directory + "/source.csv"
      yield* Effect.promise(async () => {
        const file = await open(source, "w")
        try {
          await file.truncate(size)
        } finally {
          await file.close()
        }
      })
      const references = fileReferences(instance.directory + "/references")
      const owner = { chat: ctx.sessionID, userMessage: "msg_original", generation: 1, run: "run" }
      const ipc: unknown[] = []
      const host = {
        reserveReference: (userMessage: string, name: string) => references.reserve({ ...owner, userMessage }, name),
        discardReference: (grant: string) => references.discard(owner, grant),
        admitReference: async (reference: Parameters<typeof references.commit>[1]) => {
          ipc.push(reference)
          await references.commit(owner, reference)
          return { artifact_id: "reference", bytes: reference.snapshot.size }
        },
        admit: async (_message: string, files: { name: string; data: string }[]) => {
          expect(Buffer.from(files[0].data, "base64").length).toBe(size)
          ipc.push("byte-admission")
          return [{ artifact_id: "bytes", bytes: size }]
        },
      }
      const result = yield* admitLoginomLocalFile(source, ctx, host, owner.userMessage)
      expect(result.artifact).toMatchObject({
        artifact_id: size > 16 * 1024 * 1024 ? "reference" : "bytes",
        bytes: size,
      })
      if (size > 16 * 1024 * 1024) {
        expect(JSON.stringify(ipc)).not.toMatch(/"(?:data|base64|buffer)":/)
        expect(yield* admitLoginomLocalFile(source, ctx, host, owner.userMessage)).toEqual(result)
        expect(ipc.length).toBe(1)
      } else expect(ipc).toEqual(["byte-admission"])
      yield* Effect.promise(() => references.close())
    }),
  )

it.instance(
  "private reference admission authorizes before reserving, stages over the byte limit and sends only a descriptor",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const ctx = yield* context
      const source = instance.directory + "/large.csv"
      yield* Effect.promise(async () => {
        const file = await open(source, "w")
        try {
          await file.truncate(16 * 1024 * 1024 + 1)
        } finally {
          await file.close()
        }
      })
      const references = fileReferences(instance.directory + "/references")
      const owner = { chat: ctx.sessionID, userMessage: "msg_original", generation: 1, run: "run" }
      const captured: unknown[] = []
      const result = yield* admitLoginomFileReference(
        source,
        ctx,
        {
          reserveReference: (userMessage, name) => references.reserve({ ...owner, userMessage }, name),
          discardReference: (grant) => references.discard(owner, grant),
          admitReference: (reference) => {
            captured.push(JSON.parse(JSON.stringify(reference)))
            return references
              .commit(owner, reference)
              .then((value) => ({ bytes: value.snapshot.size, sha256: value.snapshot.sha256 }))
          },
        },
        owner.userMessage,
      )
      expect(result.artifact).toMatchObject({ bytes: 16 * 1024 * 1024 + 1 })
      expect(JSON.stringify(captured)).not.toMatch(/"(?:data|base64|buffer)":/)
      yield* Effect.promise(() => references.close())
    }),
)

it.instance("denied local paths never obtain a private reference reservation", () =>
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const ctx = yield* context
    const instance = yield* TestInstance
    yield* sessions.setPermission({
      sessionID: ctx.sessionID,
      permission: [{ permission: "read", pattern: "*", action: "deny" }],
    })
    const result = yield* admitLoginomFileReference(
      instance.directory + "/private.csv",
      ctx,
      {
        reserveReference: async () => {
          throw Error("Must not reserve before authorization")
        },
        admitReference: async () => {
          throw Error("Must not admit a denied path")
        },
        discardReference: async () => {
          throw Error("Must not discard a denied path")
        },
      },
      "msg_original",
    ).pipe(Effect.exit)
    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) expect(String(Cause.squash(result.cause))).toContain("LOGINOM_FILE_ACCESS_DENIED")
  }),
)

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
      expect(String(Cause.squash(result.cause))).toContain(path)
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

for (const mode of ["stable", "changed", "deleted", "deny"] as const) {
  it.instance(`attachment receipt authorization: ${mode}`, () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const sessions = yield* Session.Service
      const fs = yield* FSUtil.Service
      const ctx = yield* context
      const path = instance.directory + "/данные %#.csv"
      yield* fs.writeFileString(path, "amount\n10\n")
      const reference = yield* Effect.promise(() => createAttachmentReceipt(path))
      yield* Effect.promise(() =>
        bindAttachmentReceipt(reference.receipt, path, { session: ctx.sessionID, message: ctx.messageID }),
      )
      yield* sessions.updateMessage({
        id: ctx.messageID,
        sessionID: ctx.sessionID,
        role: "user",
        agent: "build",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
        time: { created: Date.now() },
      })
      yield* sessions.updatePart({
        id: PartID.ascending(),
        sessionID: ctx.sessionID,
        messageID: ctx.messageID,
        type: "file",
        mime: "text/plain",
        filename: reference.filename,
        url: pathToFileURL(path).href,
        source: attachmentReceiptSource(reference),
      })
      if (mode === "changed") yield* fs.writeFileString(path, "amount\n999\n")
      if (mode === "deleted") yield* fs.remove(path)
      if (mode === "deny")
        yield* sessions.setPermission({
          sessionID: ctx.sessionID,
          permission: [{ permission: "read", pattern: "*", action: "deny" }],
        })
      const result = yield* authorizeLoginomFile(path, {
        ...ctx,
        ask: () => Effect.die("Attached input must not ask again"),
      }).pipe(Effect.exit)
      if (mode === "stable") {
        expect(Exit.isSuccess(result)).toBe(true)
        if (Exit.isSuccess(result)) {
          yield* fs.writeFileString(path, "after authorization")
          const after = yield* result.value.verifyAttachment().pipe(Effect.exit)
          expect(Exit.isFailure(after)).toBe(true)
          if (Exit.isFailure(after)) expect(String(Cause.squash(after.cause))).toContain("LOGINOM_FILE_CHANGED")
        }
        return
      }
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result))
        expect(String(Cause.squash(result.cause))).toContain(
          {
            changed: "LOGINOM_FILE_CHANGED",
            deleted: "LOGINOM_FILE_NOT_FOUND",
            deny: "LOGINOM_FILE_ACCESS_DENIED",
          }[mode],
        )
    }),
  )
}
