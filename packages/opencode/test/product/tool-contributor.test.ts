import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import type { Tool as AITool } from "ai"
import { Image } from "@/image/image"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Config } from "@/config/config"
import { TestConfig } from "../fixture/config"
import { createHash } from "node:crypto"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { MessageID, SessionID } from "@/session/schema"
import type { TaskScope } from "@/session/task-scope"
import type { Provider } from "@/provider/provider"
import { toolContributor } from "../../src/product/tool-contributor"
import type { ContributeInput } from "../../src/product/tool-contributor"

const sessionID = SessionID.make("ses_contributor")
const taskMessageID = MessageID.ascending()
const catalogOf = (names: string[]) =>
  names.map((name) => ({
    name,
    description: `${name} tool`,
    inputSchema: {
      type: "object" as const,
      properties: { host_context_token: { type: "string" }, path: { type: "string" } },
      required: ["host_context_token", "path"],
    },
  }))
const catalog = catalogOf(["find", "dock_prepare", "dock_run", "browser_take_screenshot"])

function setup(options: {
  profile: TaskScope.Profile
  task?: boolean
  image?: boolean
  fail?: boolean
  catalog?: ReturnType<typeof catalogOf>
  result?: Pick<CallToolResult, "content" | "_meta">
}) {
  const requested: string[] = []
  const status: { failure?: string } = {}
  const tools: Record<string, AITool> = {}
  const task = options.task === false ? undefined : { sessionID, taskMessageID, profile: options.profile }
  const input = {
    tools,
    loginom: {
      generation: 3,
      async tools() {
        requested.push("catalog")
        if (options.fail) throw Error("LOGINOM_KNOWLEDGE_UNAVAILABLE")
        return { tools: options.catalog ?? catalog }
      },
      async call() {
        return options.result
      },
    },
    loginomStatus: status,
    model: {
      api: { id: "m" },
      providerID: "test",
      capabilities: { input: { image: !!options.image } },
    } as Provider.Model,
    history: [],
    task,
    profile: options.profile,
    plugin: { trigger: () => Effect.void },
    run: { promise: Effect.runPromise },
    truncate: { output: (content: string) => Effect.succeed({ content, truncated: false }) },
    context: () => ({ sessionID, messageID: taskMessageID, callID: "export", ask: () => Effect.void }),
    processor: { message: { id: taskMessageID } },
  } as unknown as ContributeInput
  return { tools, status, requested, run: () => Effect.runPromise(toolContributor.contribute(input)) }
}

const schemaOf = (tool: AITool) =>
  (tool.inputSchema as { jsonSchema: { properties: object; required?: string[] } }).jsonSchema

describe("toolContributor", () => {
  test("host outputFiles are private metadata while model-facing output stays byte-identical", async () => {
    const text =
      ' {"state":"settled","status":"SUCCEEDED","output":{"file_artifacts":[{"artifact_id":"csv-1","destination":"/server/result.csv"}]}}\n'
    const content = [{ type: "text" as const, text }]
    const files = [{ artifact_id: "csv-1", path: "/runtime/result.csv", name: "result.csv" }]
    const execute = async (outputFiles?: typeof files) => {
      const run = setup({
        profile: "loginom-automation",
        catalog: catalogOf(["dock_node_wait"]),
        result: { content, ...(outputFiles ? { _meta: { outputFiles } } : {}) },
      })
      await run.run()
      const tool = run.tools.loginom_dock_node_wait
      return (await tool.execute!(
        {},
        { toolCallId: "export", abortSignal: new AbortController().signal, messages: [] },
      )) as {
        output: string
        content: typeof content
        metadata: Record<string, unknown>
      }
    }
    const base = await execute()
    const result = await execute(files)
    expect(base.metadata.outputFiles).toBeUndefined()
    expect(result.metadata.outputFiles).toEqual(files)
    expect(result.output).toBe(text)
    expect(result.output).toBe(base.output)
    expect(JSON.stringify(result.content)).toBe(JSON.stringify(base.content))
    expect(result.output).not.toContain("/runtime/")
  })
  test("automation receives the whole catalog under the loginom_ prefix without the host token", async () => {
    const run = setup({ profile: "loginom-automation" })
    await run.run()
    expect(Object.keys(run.tools).toSorted()).toEqual(["loginom_dock_prepare", "loginom_dock_run", "loginom_find"])
    for (const [name, tool] of Object.entries(run.tools)) {
      expect(Object.keys(schemaOf(tool).properties)).toEqual(
        name === "loginom_dock_prepare" ? ["path", "local_package_path"] : ["path"],
      )
      expect(schemaOf(tool).required).toEqual(["path"])
    }
  })

  test("a local file can be registered only by automation, and only when the catalog describes dock actions", async () => {
    const withDescribe = catalogOf(["find", "dock_action_describe"])
    const automation = setup({ profile: "loginom-automation", catalog: withDescribe })
    await automation.run()
    expect(Object.keys(automation.tools).toSorted()).toEqual([
      "loginom_dock_action_describe",
      "loginom_file_admit",
      "loginom_file_profile",
      "loginom_file_sample",
      "loginom_file_scan",
      "loginom_find",
    ])
    const without = setup({ profile: "loginom-automation" })
    await without.run()
    expect(without.tools.loginom_file_admit).toBeUndefined()
    const ordinary = setup({ profile: "default", catalog: withDescribe })
    await ordinary.run()
    expect(ordinary.tools.loginom_file_admit).toBeUndefined()
  })

  test("the default profile receives only the read-only local tools", async () => {
    const run = setup({ profile: "default" })
    await run.run()
    expect(Object.keys(run.tools)).toEqual(["loginom_find"])
  })

  test("a screenshot retains its original file digest and part ID across normalization", async () => {
    const { PhotonImage } = await import("@silvia-odwyer/photon-node")
    const source = new PhotonImage(
      Uint8Array.from({ length: 40_000 }, (_, i) =>
        i % 4 === 3 ? 255 : Math.floor((Math.sin(i + 1) + 1) * 11_111) % 256,
      ),
      100,
      100,
    )
    const bytes = Buffer.from(source.get_bytes())
    source.free()
    const data = bytes.toString("base64")
    const content = [{ type: "image" as const, mimeType: "image/png", data }]
    const run = setup({ profile: "loginom-automation", image: true, result: { content } })
    await run.run()
    const result = (await run.tools.loginom_browser_take_screenshot.execute!(
      {},
      { toolCallId: "shot", messages: [] },
    )) as {
      attachments: SessionV1.FilePart[]
      metadata: Record<string, unknown>
      content: typeof content
    }
    const [file] = result.attachments
    expect(file).toMatchObject({ messageID: taskMessageID, sessionID, url: `data:image/png;base64,${data}` })
    expect(result.metadata.screenshotFiles).toEqual([
      {
        partID: file.id,
        mime: "image/png",
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    ])
    expect(result.content).toEqual(content)
    const limit = TestConfig.layer({
      get: () => Effect.succeed({ attachment: { image: { max_width: 72, max_base64_bytes: 17_000 } } }),
    })
    const resized = await Effect.runPromise(
      Image.Service.use((service) => service.normalize(file)).pipe(
        Effect.provide(LayerNode.compile(Image.node, [[Config.node, limit]])),
      ),
    )
    expect(resized).toMatchObject({ id: file.id, messageID: taskMessageID, sessionID, mime: "image/jpeg" })
    const image = PhotonImage.new_from_byteslice(Buffer.from(resized.url.slice(resized.url.indexOf(",") + 1), "base64"))
    expect(image.get_width()).toBe(72)
    image.free()
  })

  test("a screenshot tool is offered only to a model that accepts images", async () => {
    const text = setup({ profile: "loginom-automation" })
    await text.run()
    expect(text.tools.loginom_browser_take_screenshot).toBeUndefined()
    const vision = setup({ profile: "loginom-automation", image: true })
    await vision.run()
    expect(vision.tools.loginom_browser_take_screenshot).toBeDefined()
  })

  test("a failed catalog request adds nothing and records the failure", async () => {
    const run = setup({ profile: "loginom-automation", fail: true })
    await run.run()
    expect(run.tools).toEqual({})
    expect(run.status.failure).toBe("catalog: LOGINOM_KNOWLEDGE_UNAVAILABLE")
  })

  test("a turn without a task gets no Loginom tools", async () => {
    const run = setup({ profile: "loginom-automation", task: false })
    await run.run()
    expect(run.tools).toEqual({})
  })
})
