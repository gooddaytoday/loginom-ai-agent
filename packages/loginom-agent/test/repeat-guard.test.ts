import { expect, test } from "bun:test"
import type { ToolContext, ToolDomain } from "@opencode/plugin/promise/tool"
import { Agent } from "@opencode/schema/agent"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { Tool } from "@opencode/schema/tool"
import { repeatGuard } from "../src/repeat-guard"

function setup(options?: { ask?: ToolDomain["ask"]; wait?: Promise<void> }) {
  const forms: string[] = []
  const executed: unknown[] = []
  const guard = repeatGuard({
    ask: async (form, call, signal) => {
      forms.push(form.id)
      return options?.ask?.(form, call, signal) ?? { status: "answered", answer: { decision: "continue" } }
    },
    interrupt: async () => {},
  })
  const sessionID = Session.ID.create()
  const tool = (name = "loginom_dock_node_apply") =>
    guard.wrap({
      name,
      description: "",
      input: {},
      execute: async (input) => {
        executed.push(input)
        await options?.wait
        return { content: "Executed" }
      },
    })
  function call(messageID = SessionMessage.ID.create(), session = sessionID): ToolContext {
    return {
      id: Tool.CallID.make(crypto.randomUUID()),
      agent: Agent.ID.make("build"),
      sessionID: session,
      messageID,
      signal: new AbortController().signal,
      progress: async () => {},
    }
  }
  return { guard, tool, call, sessionID, forms, executed }
}

test("uses business parameters for the group and forwards the original operation IDs", async () => {
  const { tool, call, forms, executed } = setup()
  const apply = tool()
  const input = [
    { operation_id: "id-1", host_context_token: "a", parameters: { rows: 2, path: "one.csv" } },
    { operation_id: "id-2", host_context_token: "b", parameters: { path: "one.csv", rows: 2 } },
    { operation_id: "id-3", host_context_token: "c", parameters: { rows: 2, path: "one.csv" } },
  ]

  const results = []
  for (const args of input) results.push(await apply.execute(args, call()))

  expect(executed).toEqual(input)
  expect(forms).toHaveLength(1)
  const id = results[0]?.metadata?.timelineGroup.id
  expect(typeof id).toBe("string")
  expect(results.map((result) => result.metadata?.timelineGroup)).toEqual([
    { id, attempt: 1 },
    { id, attempt: 2 },
    { id, attempt: 3, formID: forms[0], summary: expect.stringContaining("Агент дважды вызвал") },
  ])
})

test("different calls, parameters, turns and sessions end a streak", async () => {
  const { guard, tool, call, sessionID, forms, executed } = setup()
  const apply = tool()
  const other = tool("loginom_browser_click")
  const args = { parameters: { operation_id: "business-parameter", rows: 2 } }

  await apply.execute(args, call())
  await apply.execute(args, call())
  await apply.execute({ parameters: { ...args.parameters, operation_id: "different" } }, call())
  await apply.execute(args, call())
  await apply.execute(args, call())
  await other.execute(args, call())
  await apply.execute(args, call())
  await apply.execute(args, call(SessionMessage.ID.create(), Session.ID.create()))
  await apply.execute(args, call())
  guard.reset(sessionID)
  await apply.execute(args, call())
  await apply.execute(args, call())

  expect(forms).toEqual([])
  expect(executed).toHaveLength(11)
})

test("keeps operation IDs that name the target of a stop or recovery", async () => {
  const { tool, call, forms } = setup()
  for (const name of ["loginom_dock_node_stop", "loginom_dock_operation_recover"]) {
    const control = tool(name)
    await control.execute({ operation_id: "target-1" }, call())
    await control.execute({ operation_id: "target-1" }, call())
    await control.execute({ operation_id: "target-2" }, call())
  }
  expect(forms).toEqual([])
})

test("parallel calls in one model step do not become a serial streak", async () => {
  const { tool, call, forms } = setup()
  const parallel = tool()
  const messageID = SessionMessage.ID.create()
  await Promise.all(Array.from({ length: 3 }, () => parallel.execute({}, call(messageID))))

  await parallel.execute({}, call())
  await parallel.execute({}, call())
  expect(forms).toEqual([])
})

test("while the third call is paused, a concurrent call cannot dispatch or ask again", async () => {
  const opened = Promise.withResolvers<void>()
  const answer = Promise.withResolvers<Awaited<ReturnType<ToolDomain["ask"]>>>()
  const { tool, call, forms, executed } = setup({
    ask: () => {
      opened.resolve()
      return answer.promise
    },
  })
  const apply = tool()
  await apply.execute({}, call())
  await apply.execute({}, call())

  const third = apply.execute({}, call())
  await opened.promise
  await expect(apply.execute({}, call())).rejects.toThrow("уже обрабатывается")
  expect(executed).toHaveLength(2)
  expect(forms).toHaveLength(1)

  answer.resolve({ status: "answered", answer: { decision: "continue" } })
  await third
  expect(executed).toHaveLength(3)
})
