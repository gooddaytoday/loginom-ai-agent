import { expect, test } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { BrowserRecovery } from "../../src/session/browser-recovery"
import { MessageV2 } from "../../src/session/message-v2"

const sessionID = SessionID.create()
const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }

function reminder(created: number, attempt: string): SessionV1.WithParts {
  const id = MessageID.ascending()
  return {
    info: { id, sessionID, role: "user", time: { created }, agent: "build", model },
    parts: [
      {
        id: PartID.ascending(),
        sessionID,
        messageID: id,
        type: "text",
        text: BrowserRecovery.reminder("op-1"),
        synthetic: true,
        metadata: { browser_recovery_reminder: attempt },
      },
    ],
  }
}

function call(created: number, tool: string, input: Record<string, unknown>, output: string, callID: string) {
  const id = MessageID.ascending()
  const message: SessionV1.WithParts = {
    info: {
      id,
      sessionID,
      role: "assistant",
      parentID: MessageID.ascending(),
      time: { created },
      modelID: model.modelID,
      providerID: model.providerID,
      mode: "build",
      agent: "build",
      path: { cwd: "/workspace", root: "/workspace" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    },
    parts: [
      {
        id: PartID.ascending(),
        sessionID,
        messageID: id,
        type: "tool",
        tool,
        callID,
        state: {
          status: "completed",
          input,
          output,
          title: tool,
          metadata: {},
          time: { start: created, end: created },
        },
      },
    ],
  }
  return message
}

const start = (created: number, callID = "start-1", phase = "browser") =>
  call(
    created,
    "loginom_dock_browser_recovery",
    { action: "start", operation_id: "op-1" },
    JSON.stringify({ phase, operation_id: "op-1", budget: { calls_left: 30 } }),
    callID,
  )

test("an attempt is active from start until a reply leaves the browser phase", () => {
  expect(BrowserRecovery.active([])).toBeUndefined()
  const started = start(1)
  expect(BrowserRecovery.active([started])).toEqual({ operationID: "op-1", attempt: "start-1", reminded: false })
  // Ordinary browser replies are text, not a phase report.
  const click = call(2, "loginom_browser_click", { target: "e1" }, "### Ran Playwright code\nclicked\n\n{}", "c1")
  expect(BrowserRecovery.active([started, click])?.attempt).toBe("start-1")
  const finished = call(
    3,
    "loginom_dock_browser_recovery",
    { action: "finish", operation_id: "op-1" },
    JSON.stringify({ phase: "dock", operation_id: "op-1", verification: { status: "continuable" } }),
    "finish-1",
  )
  expect(BrowserRecovery.active([started, click, finished])).toBeUndefined()
  const exhausted = call(
    3,
    "loginom_browser_click",
    { target: "e1" },
    JSON.stringify({ phase: "stopped", operation_id: "op-1", stopped: { code: "budget_exhausted" } }),
    "c2",
  )
  expect(BrowserRecovery.active([exhausted, click, started])).toBeUndefined()
})

test("the reminder is counted once per attempt and a new start resets it", () => {
  const first = start(1)
  expect(BrowserRecovery.active([first, reminder(2, "start-1")])).toEqual({
    operationID: "op-1",
    attempt: "start-1",
    reminded: true,
  })
  // A reminder of an earlier attempt does not cover a new start.
  expect(BrowserRecovery.active([first, reminder(2, "start-1"), start(3, "start-2")])).toEqual({
    operationID: "op-1",
    attempt: "start-2",
    reminded: false,
  })
})

test("a start that ended in stopped is not an active attempt", () => {
  expect(BrowserRecovery.active([start(1, "start-1", "stopped")])).toBeUndefined()
})

test("a lost runtime reply invalidates the previous lease until another confirmed start", () => {
  const lost = call(2, "loginom_dock_browser_recovery", { action: "finish", operation_id: "op-1" }, "", "finish")
  const part = lost.parts[0]
  if (part.type !== "tool") throw Error("Expected tool call")
  part.state = { status: "error", input: part.state.input, error: "LOGINOM_CALL_UNCERTAIN", time: { start: 2, end: 2 } }
  expect(BrowserRecovery.active([start(1), lost])).toBeUndefined()
  expect(BrowserRecovery.active([start(1), lost, start(3, "fresh")])?.attempt).toBe("fresh")
})

test("compaction without a retained tail still delivers the active task's one reminder", () => {
  const task = reminder(1, "unused")
  const taskText = task.parts[0]
  if (taskText.type !== "text") throw Error("Expected task text")
  task.parts = [{ ...taskText, synthetic: false, metadata: {}, text: "Build the filter" }]
  const started = start(2)
  if (started.info.role !== "assistant") throw Error("Expected assistant")
  started.info.parentID = task.info.id
  const active = reminder(3, "start-1")
  const compact = reminder(4, "unused")
  compact.parts = [{ id: PartID.ascending(), sessionID, messageID: compact.info.id, type: "compaction", auto: true }]
  const summary = {
    info: {
      ...started.info,
      id: MessageID.ascending(),
      parentID: compact.info.id,
      time: { created: 5 },
      summary: true,
      finish: "stop",
    },
    parts: [],
  }
  const messages = [task, started, active, compact, summary]
  const filtered = MessageV2.filterCompacted(messages.toReversed())
  expect(filtered.some((message) => message.info.id === active.info.id)).toBe(false)
  const projected = BrowserRecovery.project(filtered, { sessionID, messages })
  expect(projected.flatMap((message) => message.parts).filter((part) => part.id === active.parts[0].id)).toHaveLength(1)
})

test("a late terminal receipt for an older attempt of the same operation leaves the new one active", () => {
  const receipt = (time: number, action: string, attempt: string, phase: string) => {
    const message = call(time, "loginom_dock_browser_recovery", { action, operation_id: "op-1" }, "", "c" + time)
    const part = message.parts[0]
    if (part.type !== "tool" || part.state.status !== "completed") throw Error("Expected completed call")
    part.state.metadata.browserRecovery = { operation_id: "op-1", attempt_id: attempt, phase }
    return message
  }
  const state = BrowserRecovery.active([
    receipt(1, "start", "first", "browser"),
    receipt(2, "start", "second", "browser"),
    receipt(3, "finish", "first", "dock"),
  ])
  expect(state).toEqual({ operationID: "op-1", attempt: "second", reminded: false })
})
