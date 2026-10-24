import { afterAll, beforeAll, expect } from "bun:test"
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises"
import { platform, tmpdir } from "node:os"
import { join } from "node:path"
import { Cause, Effect, Exit, Layer } from "effect"
import { LayerNode } from "@loginom-ai-agent/core/effect/layer-node"
import { AppProcess } from "@loginom-ai-agent/core/process"
import { FSUtil } from "@loginom-ai-agent/core/fs-util"
import { PermissionV1 } from "@loginom-ai-agent/core/v1/permission"
import { ProviderV2 } from "@loginom-ai-agent/core/provider"
import { ModelV2 } from "@loginom-ai-agent/core/model"
import { SessionProjector } from "@loginom-ai-agent/core/session/projector"
import { productSkillsDirectory } from "@loginom-ai-agent/product/skills"
import { resourceInventory } from "../../../loginom-runtime/src/resource-inventory.mjs"
import { Agent } from "@/agent/agent"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Permission } from "@/permission"
import { Session } from "@/session/session"
import { MessageID } from "@/session/schema"
import { SyntheticDataTool } from "@/tool/synthetic-data"
import { Truncate } from "@/tool/truncate"
import { Tool } from "@/tool/tool"
import { TestInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const resources = await mkdtemp(join(tmpdir(), "loginom-synthetic-tool-"))

beforeAll(async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
  await cp(productSkillsDirectory, join(resources, "skills"), { recursive: true })
  const nodePath = platform() === "win32" ? "bin/node.exe" : "bin/node"
  await mkdir(join(resources, "bin"))
  await cp(node, join(resources, nodePath))
  for (const script of ["build-package-docs.ts", "build-synthetic-data.ts"]) {
    const builder = Bun.spawn([process.execPath, join(import.meta.dir, "../../../loginom-host/script", script), join(resources, "skills", script.startsWith("build-package") ? "package-docs" : "synthetic-data", "scripts")], { stdout: "pipe", stderr: "pipe" })
    const stdout = new Response(builder.stdout).text()
    const stderr = new Response(builder.stderr).text()
    expect(await builder.exited).toBe(0)
    expect(await stderr).toBe("")
    expect(await stdout).toContain(".mjs")
  }
  await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ protocol: 1, node: nodePath, files: await resourceInventory(resources) }))
})
afterAll(() => rm(resources, { recursive: true, force: true }))

const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(
      LayerNode.group([Agent.node, Session.node, SessionProjector.node, FSUtil.node, AppProcess.node, Truncate.node, RuntimeFlags.node, Permission.node]),
      [[RuntimeFlags.node, RuntimeFlags.layer({ loginomResources: resources })]],
    ),
    testInstanceStoreLayer,
  ),
)

const prepare = Effect.fn("SyntheticDataTest.prepare")(function* () {
  const sessions = yield* Session.Service
  const permissions = yield* Permission.Service
  const agents = yield* Agent.Service
  const agent = yield* agents.get("build")
  const session = yield* sessions.create({})
  const messageID = MessageID.ascending()
  yield* sessions.updateMessage({
    id: messageID,
    sessionID: session.id,
    role: "user",
    agent: agent.name,
    model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
    time: { created: Date.now() },
  })
  const requests: Array<Omit<PermissionV1.Request, "id" | "sessionID" | "tool">> = []
  const ctx: Tool.Context = {
    sessionID: session.id,
    messageID,
    agent: agent.name,
    abort: AbortSignal.any([]),
    messages: [],
    metadata: () => Effect.void,
    ask: (request) =>
      Effect.gen(function* () {
        requests.push(request)
        yield* permissions.ask({ ...request, sessionID: session.id, ruleset: Permission.merge(agent.permission, session.permission ?? []) }).pipe(Effect.orDie)
      }),
  }
  const info = yield* SyntheticDataTool
  return { ctx, requests, tool: yield* info.init() }
})

it.instance(
  "writes a retail preset under the session directory and refuses to replace it",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const fs = yield* FSUtil.Service
      const input = yield* prepare()
      const result = yield* input.tool.execute({ operation: "generate", preset: "retail", params: JSON.stringify({ stores: 3, products: 4, salesPerStore: 5, seed: 3, defects: false }), name: "retail" }, input.ctx)
      const output = JSON.parse(result.output)
      expect(output.ok).toBe(true)
      expect(output.directory).toBe(join(instance.directory, "synthetic-data", "retail"))
      expect(output.files.filter((file: string) => file.includes("sales-"))).toHaveLength(3)
      expect(yield* fs.readJson(output.manifest)).toMatchObject({ seed: 3, defect_count: 0 })
      expect(input.requests.map((request) => request.permission)).toEqual(["edit"])
      expect(input.requests[0]?.patterns.every((pattern) => pattern.replaceAll("\\", "/").startsWith("synthetic-data/retail/"))).toBe(true)
      const again = yield* input.tool.execute({ operation: "generate", preset: "retail", name: "retail" }, input.ctx).pipe(Effect.exit)
      expect(Exit.isFailure(again)).toBe(true)
      if (Exit.isFailure(again)) expect(String(Cause.squash(again.cause))).toContain("SYNTHETIC_DATA_OUTPUT_COLLISION")
    }),
  { git: true },
  30_000,
)
