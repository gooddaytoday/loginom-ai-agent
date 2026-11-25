import { expect } from "bun:test"
import { Effect, Fiber, Layer } from "effect"
import { rm } from "node:fs/promises"
import { join, relative } from "node:path"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AppProcess } from "@opencode-ai/core/process"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Global } from "@opencode-ai/core/global"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Agent } from "@/agent/agent"
import { Command } from "@/command"
import { InstanceState } from "@/effect/instance-state"
import { Permission } from "@/permission"
import { toolContributor } from "@/product/tool-contributor"
import { Session } from "@/session/session"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { MessageID, SessionID } from "@/session/schema"
import type { Tool } from "@/tool/tool"
import { Skill } from "@/skill"
import { Truncate } from "@/tool/truncate"
import { provideTmpdirInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"

const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(LayerNode.group([Agent.node, AppProcess.node, Command.node, FSUtil.node, Permission.node, RuntimeFlags.node, Session.node, Skill.node, Truncate.node])),
    LayerNode.compile(CrossSpawnSpawner.node),
    testInstanceStoreLayer,
  ),
)

it.live("the chat validates with read permissions and only publishes after one-time consent", () =>
  provideTmpdirInstance((directory) =>
    Effect.gen(function* () {
      const instance = yield* InstanceState.context
      const permissions = yield* Permission.Service
      const resource = join(directory, "columns/references/columns.md")
      yield* Effect.promise(async () => {
        await Bun.write(join(directory, "columns/SKILL.md"), "---\nname: columns\ndescription: Checks columns.\n---\n[Columns](references/columns.md)\n")
        await Bun.write(resource, "id, amount")
        await Bun.write(join(directory, ".agents/skills/columns/SKILL.md"), "---\nname: columns\ndescription: Project override.\n---\n")
      })
      const home = Global.Path.home
      const tools: Tool.Def[] = yield* toolContributor.definitions("default")
      const tool = tools.find((item) => item.id === "skill_install")
      expect(tool).toBeDefined()
      expect((yield* toolContributor.definitions("package-docs")).some((item) => item.id === "skill_install")).toBe(false)
      expect((yield* toolContributor.definitions("loginom-dashboard")).some((item) => item.id === "skill_install")).toBe(false)
      const sessionID = SessionID.make("ses_skill_validation")
      const ctx = {
        agent: "build",
        sessionID,
        messageID: MessageID.ascending(),
        abort: AbortSignal.any([]),
        messages: [],
        metadata: () => Effect.void,
        ask: (request: Omit<PermissionV1.Request, "id" | "sessionID" | "tool">) =>
          permissions.ask({ ...request, sessionID, ruleset: [{ permission: "*", pattern: "*", action: "allow" }] }).pipe(Effect.orDie),
      }
      const args = { action: "validate", source: "columns" }
      const result = yield* tool!.execute(args, ctx)
      expect(JSON.parse(result.output)).toMatchObject({ path: join(directory, "columns"), errors: [], warnings: [] })
      const url = "https://github.com/owner/repository"
      const wrongAction = yield* tool!.execute({ action: "validate", source: url }, ctx)
      expect(JSON.parse(wrongAction.output)).toMatchObject({
        errors: [expect.objectContaining({ message: expect.stringContaining('action: "install"') })],
      })
      const denied = yield* Effect.exit(tool!.execute(args, {
        ...ctx,
        ask: (request) => permissions.ask({ ...request, sessionID, ruleset: [
          { permission: "*", pattern: "*", action: "allow" },
          { permission: "read", pattern: relative(instance.worktree, resource), action: "deny" },
        ] }).pipe(Effect.orDie),
      }))
      expect(denied._tag).toBe("Failure")

      const installation = { action: "install", source: "columns" }
      const installed = join(home, ".agents/skills/columns")
      yield* Effect.addFinalizer(() => Effect.promise(() => rm(installed, { recursive: true, force: true })))
      const pending = pollWithTimeout(
        permissions.list().pipe(Effect.map((requests) => requests.find((request) => request.permission === "skill_install"))),
        "Skill installation did not ask for consent",
      )
      const stopReading = (path: string) => Effect.gen(function* () {
        const abort = new AbortController()
        const stopped = yield* Effect.forkChild(Effect.exit(tool!.execute(installation, {
          ...ctx,
          abort: abort.signal,
          ask: (request) => permissions.ask({ ...request, sessionID, ruleset: [
            { permission: "*", pattern: "*", action: "allow" },
            { permission: "read", pattern: relative(instance.worktree, path), action: "ask" },
          ] }).pipe(Effect.orDie),
        })))
        const readRequest = yield* pollWithTimeout(
          permissions.list().pipe(Effect.map((requests) => requests.find((request) =>
            request.permission === "read" && request.patterns.includes(relative(instance.worktree, path)),
          ))),
          "Skill installation did not ask to read " + path,
        )
        abort.abort()
        yield* pollWithTimeout(
          permissions.list().pipe(Effect.map((requests) => requests.some((request) => request.id === readRequest.id) ? undefined : true)),
          "Cancelled skill installation left a read permission pending",
        ).pipe(
          Effect.ensuring(permissions.reply({ requestID: readRequest.id, reply: "reject" }).pipe(Effect.ignore)),
        )
        expect((yield* Fiber.join(stopped))._tag).toBe("Failure")
      })
      yield* stopReading(join(directory, "columns"))
      yield* stopReading(resource)
      const rejected = yield* Effect.forkChild(Effect.exit(tool!.execute(installation, ctx)))
      const request = yield* pending
      expect(request.metadata.skillInstall).toContain("Папка установки: " + JSON.stringify(installed))
      expect(yield* Effect.promise(() => Bun.file(join(installed, "SKILL.md")).exists())).toBe(false)
      yield* permissions.reply({ requestID: request.id, reply: "reject" })
      expect((yield* Fiber.join(rejected))._tag).toBe("Failure")
      expect(yield* Effect.promise(() => Bun.file(join(installed, "SKILL.md")).exists())).toBe(false)

      const approved = yield* Effect.forkChild(tool!.execute(installation, ctx))
      const fresh = yield* pending
      expect(fresh.id).not.toBe(request.id)
      yield* permissions.reply({ requestID: fresh.id, reply: "once" })
      expect(JSON.parse((yield* Fiber.join(approved)).output)).toMatchObject({
        status: "installed",
        path: installed,
        override: join(directory, ".agents/skills/columns/SKILL.md"),
        warnings: [expect.stringContaining("/columns")],
      })
      expect(yield* Effect.promise(() => Bun.file(join(installed, "references/columns.md")).text())).toBe("id, amount")
      expect(JSON.parse((yield* tool!.execute(installation, ctx)).output)).toMatchObject({ status: "already-installed" })
      yield* stopReading(join(installed, "references/columns.md"))

      const destinationReadRefused = yield* Effect.exit(tool!.execute(installation, {
        ...ctx,
        ask: (request) => permissions.ask({ ...request, sessionID, ruleset: [
          { permission: "*", pattern: "*", action: "allow" },
          { permission: "read", pattern: relative(instance.worktree, join(installed, "references/columns.md")), action: "deny" },
        ] }).pipe(Effect.orDie),
      }))
      expect(destinationReadRefused._tag).toBe("Failure")
      expect(yield* permissions.list()).toEqual([])

      yield* Effect.promise(() => Bun.write(resource, "id, amount, version-two"))
      const declinedUpdate = yield* Effect.forkChild(Effect.exit(tool!.execute(installation, ctx)))
      const replacement = yield* pending
      expect(replacement.metadata.skillInstall).toContain('Замена скилла "columns"')
      expect((replacement.metadata.skillInstall as string[]).some((line) => line.startsWith("Текущая ревизия: "))).toBe(true)
      yield* permissions.reply({ requestID: replacement.id, reply: "reject" })
      expect((yield* Fiber.join(declinedUpdate))._tag).toBe("Failure")
      const installedResource = join(installed, "references/columns.md")
      expect(yield* Effect.promise(() => Bun.file(installedResource).text())).toBe("id, amount")
      const confirmUpdate = yield* Effect.forkChild(tool!.execute(installation, ctx))
      const confirmed = yield* pending
      expect(confirmed.id).not.toBe(replacement.id)
      yield* permissions.reply({ requestID: confirmed.id, reply: "once" })
      expect(JSON.parse((yield* Fiber.join(confirmUpdate)).output).status).toBe("installed")
      expect(yield* Effect.promise(() => Bun.file(installedResource).text())).toBe("id, amount, version-two")

      const networkRefusal = yield* Effect.exit(tool!.execute({
        action: "install", source: "https://github.com/owner/repository",
      }, {
        ...ctx,
        ask: (request) => permissions.ask({ ...request, sessionID, ruleset: [
          { permission: "*", pattern: "*", action: "allow" },
          { permission: "webfetch", pattern: "*", action: "deny" },
        ] }).pipe(Effect.orDie),
      }))
      expect(networkRefusal._tag).toBe("Failure")
      expect(yield* permissions.list()).toEqual([])
    }),
    { config: { command: { columns: { template: "Run the existing columns command." } } } },
  ),
)
