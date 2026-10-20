import { expect, test } from "bun:test"
import { SessionV1 } from "@loginom-ai-agent/core/v1/session"
import { ProviderV2 } from "@loginom-ai-agent/core/provider"
import { ModelV2 } from "@loginom-ai-agent/core/model"
import { BrowserRecovery } from "../../src/session/browser-recovery"
import { MessageID, PartID, SessionID } from "../../src/session/schema"

const sessionID = SessionID.create()
const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }

function user(
  created: number,
  options: { synthetic?: boolean; metadata?: Record<string, unknown> } = {},
): SessionV1.WithParts {
  const id = MessageID.ascending()
  return {
    info: { id, sessionID, role: "user", time: { created }, agent: "build", model },
    parts: [{ id: PartID.ascending(), sessionID, messageID: id, type: "text", text: "Continue", ...options }],
  }
}

function assistant(created: number, parent: SessionV1.WithParts, recovery?: string): SessionV1.WithParts {
  const id = MessageID.ascending()
  return {
    info: {
      id,
      sessionID,
      role: "assistant",
      parentID: parent.info.id,
      time: { created },
      modelID: model.modelID,
      providerID: model.providerID,
      mode: "build",
      agent: "build",
      path: { cwd: "/workspace", root: "/workspace" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    },
    parts: recovery
      ? [
          {
            id: PartID.ascending(),
            sessionID,
            messageID: id,
            type: "tool",
            tool: "loginom_dock_browser_recovery",
            callID: "recovery",
            state: {
              status: "completed",
              input: { action: "start" },
              output: "Browser recovery",
              title: "Recovery",
              metadata: { loginomBrowserRecovery: { attempt_id: "br-1", state: recovery } },
              time: { start: created, end: created },
            },
          },
        ]
      : [],
  }
}

function input(state = "browser") {
  const task = user(1)
  return { sessionID, messages: [task, assistant(2, task, state), assistant(3, task)] }
}

test("an active attempt in the current task needs one reminder", () => {
  expect(BrowserRecovery.reminder(input())).toEqual({
    attemptID: "br-1",
    text: 'Browser recovery attempt br-1 is still active. Continue the failed step with the allowed loginom_browser_* tools and call loginom_dock_browser_recovery with action "finish" when its result is reached. If no justified action remains, call it with action "stop", follow its next_step and report what was done in the browser, what the runtime verified, what only you attested and what remains unknown. Do not ask the user to fix the Loginom UI. Ending the turn again stops this attempt.',
  })
})

test("late receipts from an earlier task do not control the current attempt", () => {
  const previous = user(0)
  const current = input()
  current.messages.unshift(previous)
  current.messages.push(assistant(4, previous, "stopped"))
  expect(BrowserRecovery.reminder(current)?.attemptID).toBe("br-1")
})

test("a reminder already sent for the attempt is not repeated", () => {
  const current = input()
  const marker = user(4, { synthetic: true, metadata: { browser_recovery_reminder: "br-1" } })
  current.messages.push(marker, assistant(5, marker))
  expect(BrowserRecovery.reminder(current)).toBeUndefined()
  const part = marker.parts[0]
  if (part.type !== "text") throw Error("Expected reminder text")
  part.metadata = { browser_recovery_reminder: "previous-attempt" }
  expect(BrowserRecovery.reminder(current)?.attemptID).toBe("br-1")
})

test("dock, stopped, a failed reply that stopped the attempt, provider errors and earlier tasks need no reminder", () => {
  for (const state of ["dock", "stopped", "handoff", "verifying"])
    expect(BrowserRecovery.reminder(input(state))).toBeUndefined()
  const failed = input()
  const receipt = assistant(4, failed.messages[0], "stopped")
  const part = receipt.parts[0]
  if (part.type !== "tool" || part.state.status !== "completed") throw Error("Expected completed receipt")
  part.state = {
    status: "error",
    input: part.state.input,
    error: "Page changed",
    metadata: part.state.metadata,
    time: part.state.time,
  }
  failed.messages.push(receipt)
  expect(BrowserRecovery.reminder(failed)).toBeUndefined()

  const provider = input()
  const latest = provider.messages[2]
  if (latest.info.role !== "assistant") throw Error("Expected assistant")
  latest.info.error = { name: "UnknownError", data: { message: "Provider failed" } }
  expect(BrowserRecovery.reminder(provider)).toBeUndefined()

  const previous = input()
  previous.messages.push(user(4))
  expect(BrowserRecovery.reminder(previous)).toBeUndefined()
})

test("compaction-only messages and replay preserve an active attempt and its earlier reminder", () => {
  const current = input()
  const compaction = user(5)
  compaction.parts = [
    { id: PartID.ascending(), sessionID, messageID: compaction.info.id, type: "compaction", auto: true },
  ]
  const summary = assistant(6, compaction, "stopped")
  if (summary.info.role !== "assistant") throw Error("Expected assistant")
  summary.info.summary = true
  const replay = user(7, { metadata: { compaction_replay_of: current.messages[0].info.id } })
  current.messages.push(compaction, summary, replay, assistant(8, replay))
  expect(BrowserRecovery.reminder(current)?.attemptID).toBe("br-1")
  current.messages.push(user(4, { synthetic: true, metadata: { browser_recovery_reminder: "br-1" } }))
  expect(BrowserRecovery.reminder(current)).toBeUndefined()
})

test("replay of a prior task cannot suppress or revive the current attempt", () => {
  for (const state of ["browser", "stopped"]) {
    const previous = user(0)
    const current = input(state)
    const replay = user(4, {
      synthetic: true,
      metadata: { compaction_replay_of: previous.info.id, browser_recovery_reminder: "br-1" },
    })
    current.messages.unshift(previous)
    current.messages.push(replay, assistant(5, replay, state === "browser" ? "stopped" : "browser"))
    expect(BrowserRecovery.reminder(current)?.attemptID).toBe(state === "browser" ? "br-1" : undefined)
  }
})

test("revert hides later tasks, receipts and reminder parts", () => {
  const current = input()
  const next = user(4)
  current.messages.push(next)
  expect(BrowserRecovery.reminder({ ...current, revert: { messageID: next.info.id } })?.attemptID).toBe("br-1")
  const receipt = current.messages[1]
  expect(
    BrowserRecovery.reminder({
      ...current,
      revert: { messageID: receipt.info.id, partID: receipt.parts[0].id },
    }),
  ).toBeUndefined()

  const marker = user(4, { synthetic: true, metadata: { browser_recovery_reminder: "br-1" } })
  current.messages[3] = marker
  expect(BrowserRecovery.reminder({ ...current, revert: { messageID: marker.info.id } })?.attemptID).toBe("br-1")
  expect(
    BrowserRecovery.reminder({
      ...current,
      revert: { messageID: marker.info.id, partID: marker.parts[0].id },
    })?.attemptID,
  ).toBe("br-1")
})
