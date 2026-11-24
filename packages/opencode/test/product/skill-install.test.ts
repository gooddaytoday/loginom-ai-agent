import { expect } from "bun:test"
import { Effect, Fiber, Layer } from "effect"
import { join, relative } from "node:path"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AppProcess } from "@opencode-ai/core/process"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Global } from "@opencode-ai/core/global"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Agent } from "@/agent/agent"
import { InstanceState } from "@/effect/instance-state"
import { Permission } from "@/permission"
import { toolContributor } from "@/product/tool-contributor"
import { Session } from "@/session/session"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { MessageID, SessionID } from "@/session/schema"
import type { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { provideTmpdirInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"

const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(LayerNode.group([Agent.node, AppProcess.node, FSUtil.node, Permission.node, RuntimeFlags.node, Session.node, Truncate.node])),
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
      const pending = pollWithTimeout(
        permissions.list().pipe(Effect.map((requests) => requests.find((request) => request.permission === "skill_install"))),
        "Skill installation did not ask for consent",
      )
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
      expect(JSON.parse((yield* Fiber.join(approved)).output)).toMatchObject({ status: "installed", path: installed })
      expect(yield* Effect.promise(() => Bun.file(join(installed, "references/columns.md")).text())).toBe("id, amount")
      expect(JSON.parse((yield* tool!.execute(installation, ctx)).output)).toMatchObject({ status: "already-installed" })
    }),
  ),
)
