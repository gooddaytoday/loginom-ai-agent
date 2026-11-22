import { expect, test } from "bun:test"
import { BrowserRecovery } from "../src/browser-recovery"

// Browser recovery state from the session's context (guarantee G4), ported from 0.4
// `a080f7725c:packages/opencode/test/session/browser-recovery.test.ts` with OpenCode 2 messages: a tool call is a part of
// an assistant message, the reminder is a synthetic message.
type Messages = Parameters<typeof BrowserRecovery.active>[0]
type Message = Messages[number]

const time = { created: 1 }

function call(tool: string, input: Record<string, unknown>, output: string, id: string): Message {
  return {
    type: "assistant",
    id: `msg_${id}`,
    time,
    agent: "build",
    model: { id: "test-model", providerID: "test" },
    content: [
      {
        type: "tool",
        id,
        name: tool,
        state: { status: "completed", input, content: [{ type: "text", text: output }] },
        time,
      },
    ],
  } as Message
}

function reminder(attempt: string): Message {
  return {
    type: "synthetic",
    id: `msg_reminder_${attempt}`,
    time,
    text: BrowserRecovery.reminder("op-1"),
    metadata: { browser_recovery_reminder: attempt },
  }
}

const start = (id = "start-1", phase = "browser") =>
  call(
    "loginom_dock_browser_recovery",
    { action: "start", operation_id: "op-1" },
    JSON.stringify({ phase, operation_id: "op-1", budget: { calls_left: 30 } }),
    id,
  )

test("an attempt is active from start until a reply leaves the browser phase", () => {
  expect(BrowserRecovery.active([])).toBeUndefined()
  const started = start()
  expect(BrowserRecovery.active([started])).toEqual({ operationID: "op-1", attempt: "start-1", reminded: false })
  // Ordinary browser replies are text, not a phase report.
  const click = call("loginom_browser_click", { target: "e1" }, "### Ran Playwright code\nclicked\n\n{}", "c1")
  expect(BrowserRecovery.active([started, click])?.attempt).toBe("start-1")
  const finished = call(
    "loginom_dock_browser_recovery",
    { action: "finish", operation_id: "op-1" },
    JSON.stringify({ phase: "dock", operation_id: "op-1", verification: { status: "continuable" } }),
    "finish-1",
  )
  expect(BrowserRecovery.active([started, click, finished])).toBeUndefined()
  const exhausted = call(
    "loginom_browser_click",
    { target: "e1" },
    JSON.stringify({ phase: "stopped", operation_id: "op-1", stopped: { code: "budget_exhausted" } }),
    "c2",
  )
  expect(BrowserRecovery.active([started, click, exhausted])).toBeUndefined()
})

test("the reminder is counted once per attempt and a new start resets it", () => {
  expect(BrowserRecovery.active([start(), reminder("start-1")])).toEqual({
    operationID: "op-1",
    attempt: "start-1",
    reminded: true,
  })
  // A reminder of an earlier attempt does not cover a new start.
  expect(BrowserRecovery.active([start(), reminder("start-1"), start("start-2")])).toEqual({
    operationID: "op-1",
    attempt: "start-2",
    reminded: false,
  })
  // Another synthetic message, such as a restart notice, is no reminder.
  const notice: Message = {
    type: "synthetic",
    id: "msg_notice",
    time,
    text: "restarted",
    metadata: { notice: "restart" },
  }
  expect(BrowserRecovery.active([start(), notice])?.reminded).toBe(false)
})

test("a start that ended in stopped is not an active attempt", () => {
  expect(BrowserRecovery.active([start("start-1", "stopped")])).toBeUndefined()
})
