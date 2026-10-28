import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import type { Tool as AITool } from "ai"
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
  } as unknown as ContributeInput
  return { tools, status, requested, run: () => Effect.runPromise(toolContributor.contribute(input)) }
}

const schemaOf = (tool: AITool) =>
  (tool.inputSchema as { jsonSchema: { properties: object; required?: string[] } }).jsonSchema

describe("toolContributor", () => {
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
