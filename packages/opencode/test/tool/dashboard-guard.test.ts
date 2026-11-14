import { afterEach, expect } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Cause, Effect, Exit, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Agent } from "../../src/agent/agent"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Format } from "../../src/format"
import { LSP } from "../../src/lsp/lsp"
import { DashboardSession } from "../../src/product/dashboard-session"
import { Instruction } from "../../src/session/instruction"
import { MessageID, SessionID } from "../../src/session/schema"
import { Truncate } from "../../src/tool/truncate"
import { ApplyPatchTool } from "../../src/tool/apply_patch"
import { GrepTool } from "../../src/tool/grep"
import { ReadTool } from "../../src/tool/read"
import { GlobTool } from "../../src/tool/glob"
import { EditTool } from "../../src/tool/edit"
import { WriteTool } from "../../src/tool/write"
import {
  disposeAllInstances,
  provideInstance,
  testInstanceStoreLayer,
  tmpdirScoped,
  TestInstance,
} from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(disposeAllInstances)
const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(
      LayerNode.group([
        LSP.node,
        FSUtil.node,
        EventV2Bridge.node,
        Format.node,
        CrossSpawnSpawner.node,
        Truncate.node,
        Agent.node,
        Ripgrep.node,
        Instruction.node,
      ]),
    ),
    testInstanceStoreLayer,
  ),
)

const folder = Effect.acquireRelease(
  Effect.promise(async () => {
    await mkdir(DashboardSession.dashboardRoot(), { recursive: true })
    const root = await mkdtemp(path.join(DashboardSession.dashboardRoot(), "guard-"))
    await mkdir(path.join(root, "work", "src"), { recursive: true })
    await mkdir(path.join(root, "control"))
    return { root, work: path.join(root, "work") }
  }),
  (folder) => Effect.promise(() => rm(folder.root, { recursive: true, force: true })),
)

const context = (asks: string[]) => ({
  sessionID: SessionID.make("ses_dashboard-guard"),
  messageID: MessageID.make("msg_dashboard-guard"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: (request: { permission: string }) =>
    Effect.sync(() => {
      asks.push(request.permission)
    }),
})

it.live("dashboard write refuses control files before asking permission", () =>
  Effect.gen(function* () {
    const dirs = yield* folder
    const asks: string[] = []
    const ctx = context(asks)
    const outside = yield* tmpdirScoped()
    yield* Effect.promise(() => symlink(path.join(dirs.root, "control"), path.join(dirs.work, "src", "link"), "dir"))
    yield* Effect.gen(function* () {
      const info = yield* WriteTool
      const tool = yield* info.init()
      for (const target of [
        "../control/binding.json",
        path.join(outside, "absolute.json"),
        "src/link/x.json",
        "src/../sample.json",
      ]) {
        const exit = yield* tool.execute({ filePath: target, content: "synthetic" }, ctx).pipe(Effect.exit)
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.DeniedError)
        expect(yield* Effect.promise(() => Bun.file(path.resolve(dirs.work, target)).exists())).toBe(false)
        expect(asks).toEqual([])
      }
    }).pipe(provideInstance(dirs.work))
  }),
)

it.live("dashboard write allows src but refuses workspace data without asking", () =>
  Effect.gen(function* () {
    const dirs = yield* folder
    const asks: string[] = []
    const ctx = context(asks)
    yield* Effect.gen(function* () {
      const info = yield* WriteTool
      const tool = yield* info.init()
      yield* tool.execute({ filePath: "src/main.tsx", content: "synthetic" }, ctx)
      expect(yield* Effect.promise(() => Bun.file(path.join(dirs.work, "src/main.tsx")).text())).toBe("synthetic")
      expect(asks).not.toContain("external_directory")
      asks.length = 0
      const exit = yield* tool.execute({ filePath: "sample.json", content: "synthetic" }, ctx).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      expect(yield* Effect.promise(() => Bun.file(path.join(dirs.work, "sample.json")).exists())).toBe(false)
      expect(asks).toEqual([])
    }).pipe(provideInstance(dirs.work))
  }),
)

for (const operation of ["write", "edit create", "edit replace", "apply_patch"] as const) {
  it.live(`dashboard ${operation} does not execute source Prettier configuration`, () =>
    Effect.gen(function* () {
      const dirs = yield* folder
      const marker = path.join(dirs.root, "control", "formatter-marker")
      yield* Effect.promise(() =>
        Bun.write(
          path.join(dirs.work, "loginom-ai-agent.json"),
          JSON.stringify({
            formatter: {
              prettier: {
                command: ["node", fileURLToPath(import.meta.resolve("prettier/bin/prettier.cjs")), "--write", "$FILE"],
                extensions: [".tsx"],
              },
            },
          }),
        ),
      )
      yield* Effect.gen(function* () {
        const info = yield* WriteTool
        const tool = yield* info.init()
        const ctx = context([])
        yield* tool.execute(
          {
            filePath: "src/.prettierrc.cjs",
            content: `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "synthetic-boundary-proof"); module.exports = {};`,
          },
          ctx,
        )
        if (operation === "write")
          yield* tool.execute({ filePath: "src/main.tsx", content: "export const value=1" }, ctx)
        if (operation === "edit create" || operation === "edit replace") {
          if (operation === "edit replace")
            yield* Effect.promise(() => Bun.write(path.join(dirs.work, "src/main.tsx"), "export const value=0"))
          const definition = yield* EditTool
          const edit = yield* definition.init()
          yield* edit.execute(
            {
              filePath: "src/main.tsx",
              oldString: operation === "edit create" ? "" : "export const value=0",
              newString: "export const value=1",
            },
            ctx,
          )
        }
        if (operation === "apply_patch") {
          const definition = yield* ApplyPatchTool
          const patch = yield* definition.init()
          yield* patch.execute(
            { patchText: "*** Begin Patch\n*** Add File: src/main.tsx\n+export const value=1\n*** End Patch" },
            ctx,
          )
        }
        expect(yield* Effect.promise(() => Bun.file(marker).exists())).toBe(false)
        expect(yield* Effect.promise(() => Bun.file(path.join(dirs.work, "src/main.tsx")).text())).toBe(
          operation === "apply_patch" ? "export const value=1\n" : "export const value=1",
        )
      }).pipe(provideInstance(dirs.work))
    }),
  )
}

for (const operation of ["write", "read"] as const) {
  it.live(`dashboard ${operation} does not launch configured LSP`, () =>
    Effect.gen(function* () {
      const dirs = yield* folder
      const marker = path.join(dirs.root, "control", "lsp-marker")
      yield* Effect.promise(() =>
        Bun.write(
          path.join(dirs.work, "loginom-ai-agent.json"),
          JSON.stringify({
            lsp: {
              fake: {
                command: [
                  "node",
                  "-e",
                  `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "synthetic-lsp-start"); require(${JSON.stringify(path.resolve(import.meta.dir, "../fixture/lsp/fake-lsp-server.js"))});`,
                ],
                extensions: [".repro"],
              },
            },
          }),
        ),
      )
      yield* Effect.gen(function* () {
        const lsp = yield* LSP.Service
        if (operation === "write") {
          const definition = yield* WriteTool
          const tool = yield* definition.init()
          const result = yield* tool.execute({ filePath: "src/main.repro", content: "synthetic" }, context([]))
          expect(result.output).toContain("successfully")
        }
        if (operation === "read") {
          const file = path.join(dirs.work, "src/main.repro")
          yield* Effect.promise(() => Bun.write(file, "synthetic"))
          const definition = yield* ReadTool
          const tool = yield* definition.init()
          const result = yield* tool.execute({ filePath: file }, context([]))
          expect(result.output).toContain("synthetic")
          // Join any LSP startup from the asynchronous read warm-up.
          yield* lsp.touchFile(file)
        }
        expect(yield* Effect.promise(() => Bun.file(marker).exists())).toBe(false)
        expect(yield* lsp.status()).toEqual([])
        expect(yield* lsp.diagnostics()).toEqual({})
      }).pipe(provideInstance(dirs.work))
    }),
  )
}

it.live("dashboard edit cannot change sample data", () =>
  Effect.gen(function* () {
    const dirs = yield* folder
    yield* Effect.promise(() => Bun.write(path.join(dirs.work, "sample.json"), "old"))
    const asks: string[] = []
    const exit = yield* Effect.gen(function* () {
      const info = yield* EditTool
      const tool = yield* info.init()
      return yield* tool.execute({ filePath: "sample.json", oldString: "old", newString: "new" }, context(asks))
    }).pipe(provideInstance(dirs.work), Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.DeniedError)
    expect(yield* Effect.promise(() => Bun.file(path.join(dirs.work, "sample.json")).text())).toBe("old")
    expect(asks).toEqual([])
  }),
)

it.live("dashboard patches cannot delete protected data", () =>
  Effect.gen(function* () {
    const dirs = yield* folder
    yield* Effect.promise(() => Bun.write(path.join(dirs.work, "snapshot.json"), "old\n"))
    const asks: string[] = []
    const exit = yield* Effect.gen(function* () {
      const info = yield* ApplyPatchTool
      const tool = yield* info.init()
      return yield* tool.execute(
        { patchText: "*** Begin Patch\n*** Delete File: snapshot.json\n*** End Patch" },
        context(asks),
      )
    }).pipe(provideInstance(dirs.work), Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.DeniedError)
    expect(yield* Effect.promise(() => Bun.file(path.join(dirs.work, "snapshot.json")).text())).toBe("old\n")
    expect(asks).toEqual([])
  }),
)

it.live("dashboard patches validate move destinations before changing any file", () =>
  Effect.gen(function* () {
    const dirs = yield* folder
    const source = path.join(dirs.work, "src", "main.tsx")
    yield* Effect.promise(() => Bun.write(source, "old\n"))
    const asks: string[] = []
    const exit = yield* Effect.gen(function* () {
      const info = yield* ApplyPatchTool
      const tool = yield* info.init()
      return yield* tool.execute(
        {
          patchText:
            "*** Begin Patch\n*** Update File: src/main.tsx\n*** Move to: sample.json\n@@\n-old\n+new\n*** End Patch",
        },
        context(asks),
      )
    }).pipe(provideInstance(dirs.work), Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.DeniedError)
    expect(yield* Effect.promise(() => Bun.file(source).text())).toBe("old\n")
    expect(yield* Effect.promise(() => Bun.file(path.join(dirs.work, "sample.json")).exists())).toBe(false)
    expect(asks).toEqual([])
  }),
)

it.live("dashboard glob rejects parent searches without permission questions", () =>
  Effect.gen(function* () {
    const dirs = yield* folder
    const asks: string[] = []
    const exit = yield* Effect.gen(function* () {
      const info = yield* GlobTool
      const tool = yield* info.init()
      return yield* tool.execute({ path: "..", pattern: "*" }, context(asks))
    }).pipe(provideInstance(dirs.work), Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.DeniedError)
    expect(asks).toEqual([])
  }),
)

it.live("dashboard grep rejects parent searches without permission questions", () =>
  Effect.gen(function* () {
    const dirs = yield* folder
    const asks: string[] = []
    const exit = yield* Effect.gen(function* () {
      const info = yield* GrepTool
      const tool = yield* info.init()
      return yield* tool.execute({ path: "..", pattern: "synthetic" }, context(asks))
    }).pipe(provideInstance(dirs.work), Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.DeniedError)
    expect(asks).toEqual([])
  }),
)

it.live("dashboard write refuses file symlinks even when their target is in src", () =>
  Effect.gen(function* () {
    const dirs = yield* folder
    const source = path.join(dirs.work, "src", "main.tsx")
    const link = path.join(dirs.work, "src", "file.ts")
    yield* Effect.promise(async () => {
      await Bun.write(source, "old")
      await symlink(source, link)
    })
    const asks: string[] = []
    const exit = yield* Effect.gen(function* () {
      const info = yield* WriteTool
      const tool = yield* info.init()
      return yield* tool.execute({ filePath: link, content: "new" }, context(asks))
    }).pipe(provideInstance(dirs.work), Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.DeniedError)
    expect(yield* Effect.promise(() => Bun.file(source).text())).toBe("old")
    expect(asks).toEqual([])
  }),
)

it.live("dashboard read rejects dangling links as permission denial", () =>
  Effect.gen(function* () {
    const dirs = yield* folder
    const link = path.join(dirs.work, "src", "dangling.ts")
    yield* Effect.promise(() => symlink("../../control/new.json", link))
    const asks: string[] = []
    const exit = yield* Effect.gen(function* () {
      const info = yield* ReadTool
      const tool = yield* info.init()
      return yield* tool.execute({ filePath: link }, context(asks))
    }).pipe(provideInstance(dirs.work), Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.DeniedError)
    expect(asks).toEqual([])
  }),
)

it.live("dashboard reads work through an outside alias, while git and internal bypass cannot expose control", () =>
  Effect.gen(function* () {
    const dirs = yield* folder
    const outside = yield* tmpdirScoped()
    const alias = path.join(outside, "dashboard-alias")
    yield* Effect.promise(async () => {
      await Bun.write(path.join(dirs.work, "sample.json"), "synthetic")
      await Bun.write(path.join(dirs.work, "src", "main.tsx"), "synthetic")
      await Bun.write(path.join(dirs.root, "control", "binding.json"), "private synthetic")
      await symlink(dirs.work, alias, "dir")
      expect(Bun.spawnSync(["git", "init", dirs.root]).exitCode).toBe(0)
    })
    const asks: string[] = []
    yield* Effect.gen(function* () {
      const info = yield* ReadTool
      const tool = yield* info.init()
      for (const filePath of ["sample.json", dirs.work + "/src/../src/main.tsx", alias + "/src/../src/main.tsx"]) {
        const result = yield* tool.execute({ filePath }, context(asks))
        expect(result.output).toContain("synthetic")
        expect(asks).not.toContain("external_directory")
      }
      const writeInfo = yield* WriteTool
      const write = yield* writeInfo.init()
      yield* write.execute({ filePath: alias + "/src/../src/main.tsx", content: "alias synthetic" }, context(asks))
      expect(yield* Effect.promise(() => Bun.file(path.join(dirs.work, "src", "main.tsx")).text())).toBe(
        "alias synthetic",
      )
      expect(asks).not.toContain("external_directory")
      asks.length = 0
      for (const bypassCwdCheck of [false, true]) {
        const exit = yield* tool
          .execute(
            { filePath: path.join(dirs.root, "control", "binding.json") },
            { ...context(asks), extra: { bypassCwdCheck } },
          )
          .pipe(Effect.exit)
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.DeniedError)
        expect(asks).toEqual([])
      }
    }).pipe(provideInstance(alias))
  }),
)

it.instance("ordinary sessions retain writes outside src and external-directory permission for all file tools", () =>
  Effect.gen(function* () {
    const ordinary = yield* TestInstance
    const outside = yield* tmpdirScoped()
    const target = path.join(outside, "file.txt")
    yield* Effect.promise(() => Bun.write(target, "old\n"))
    const asks: string[] = []
    const ctx = {
      ...context(asks),
      ask: (request: { permission: string }) =>
        Effect.gen(function* () {
          asks.push(request.permission)
          if (request.permission === "external_directory") return yield* Effect.die(Error("external request reached"))
        }),
    }
    const writeInfo = yield* WriteTool
    const write = yield* writeInfo.init()
    yield* write.execute({ filePath: "sample.json", content: "ordinary" }, ctx)
    expect(yield* Effect.promise(() => Bun.file(path.join(ordinary.directory, "sample.json")).text())).toBe("ordinary")
    const editInfo = yield* EditTool
    const edit = yield* editInfo.init()
    const patchInfo = yield* ApplyPatchTool
    const patch = yield* patchInfo.init()
    const readInfo = yield* ReadTool
    const read = yield* readInfo.init()
    const globInfo = yield* GlobTool
    const glob = yield* globInfo.init()
    const grepInfo = yield* GrepTool
    const grep = yield* grepInfo.init()
    const operations: Effect.Effect<unknown>[] = [
      write.execute({ filePath: target, content: "new" }, ctx),
      edit.execute({ filePath: target, oldString: "old", newString: "new" }, ctx),
      patch.execute({ patchText: `*** Begin Patch\n*** Delete File: ${target}\n*** End Patch` }, ctx),
      read.execute({ filePath: target }, ctx),
      glob.execute({ path: outside, pattern: "*" }, ctx),
      grep.execute({ path: outside, pattern: "old" }, ctx),
    ]
    for (const operation of operations) {
      asks.length = 0
      const exit = yield* operation.pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toEqual(Error("external request reached"))
      expect(asks).toEqual(["external_directory"])
      expect(yield* Effect.promise(() => Bun.file(target).text())).toBe("old\n")
    }
  }),
)

it.live("dashboard read refuses an absolute symlink followed by parent traversal", () =>
  Effect.gen(function* () {
    const dirs = yield* folder
    yield* Effect.promise(async () => {
      await mkdir(path.join(dirs.root, "control", "child", "child"), { recursive: true })
      await Bun.write(path.join(dirs.root, "control", "secret.txt"), "outside synthetic")
      await Bun.write(path.join(dirs.work, "src", "secret.txt"), "inside synthetic")
      await symlink(path.join(dirs.root, "control", "child"), path.join(dirs.work, "src", "link"), "dir")
    })
    const asks: string[] = []
    yield* Effect.gen(function* () {
      const info = yield* ReadTool
      const tool = yield* info.init()
      const writeInfo = yield* WriteTool
      const write = yield* writeInfo.init()
      for (const traversal of ["/../secret.txt", "/child/../../secret.txt"]) {
        const filePath = path.join(dirs.work, "src", "link") + traversal
        const exit = yield* tool.execute({ filePath }, context(asks)).pipe(Effect.exit)
        if (Exit.isSuccess(exit)) expect(exit.value.output).not.toContain("outside synthetic")
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(Cause.squash(exit.cause)).toBeInstanceOf(PermissionV1.DeniedError)
        expect(asks).toEqual([])
        const written = yield* write.execute({ filePath, content: "new synthetic" }, context(asks)).pipe(Effect.exit)
        expect(Exit.isFailure(written)).toBe(true)
        if (Exit.isFailure(written)) expect(Cause.squash(written.cause)).toBeInstanceOf(PermissionV1.DeniedError)
        expect(yield* Effect.promise(() => Bun.file(path.join(dirs.root, "control", "secret.txt")).text())).toBe(
          "outside synthetic",
        )
        expect(asks).toEqual([])
      }
    }).pipe(provideInstance(dirs.work))
  }),
)
