import { expect, test } from "bun:test"
import { SessionV1 } from "@loginom-ai-agent/core/v1/session"
import { ProviderV2 } from "@loginom-ai-agent/core/provider"
import { ModelV2 } from "@loginom-ai-agent/core/model"
import { Schema } from "effect"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { TaskScope } from "../../src/session/task-scope"

const sessionID = SessionID.create()
const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }

function user(
  created: number,
  text = "Документируй приложенный пакет",
  options: {
    synthetic?: boolean
    metadata?: Record<string, unknown>
  } = {},
): SessionV1.WithParts {
  const id = MessageID.ascending()
  return {
    info: { id, sessionID, role: "user", time: { created }, agent: "build", model },
    parts: [{ id: PartID.ascending(), sessionID, messageID: id, type: "text", text, ...options }],
  }
}

function activated(
  created: number,
  task: SessionV1.WithParts,
  profile: "package-docs" | "loginom-automation",
): SessionV1.WithParts {
  const id = MessageID.ascending()
  return {
    info: {
      id,
      sessionID,
      role: "assistant",
      parentID: task.info.id,
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
        tool: "skill",
        callID: "activation",
        state: {
          status: "completed",
          input: { name: profile },
          output: "Loaded skill",
          title: "Skill",
          metadata: { activation: { name: profile, profile, digest: "a".repeat(64) } },
          time: { start: created, end: created },
        },
      },
    ],
  }
}

test("legacy history starts each real user task with default and never uses intent keywords as authorization", () => {
  const first = user(1)
  const second = user(2, "Построй сценарий Loginom, затем создай документацию")
  expect(TaskScope.derive({ sessionID, messages: [first] })).toEqual({
    sessionID,
    taskMessageID: first.info.id,
    profile: "default",
  })
  expect(TaskScope.derive({ sessionID, messages: [second, first] })).toEqual({
    sessionID,
    taskMessageID: second.info.id,
    profile: "default",
  })
  expect(TaskScope.derive({ sessionID, messages: [] })).toBeUndefined()
})

test("an applied bundled activation restores the profile, and the next real user request resets it", () => {
  const first = user(1)
  const activation = activated(2, first, "package-docs")
  expect(TaskScope.derive({ sessionID, messages: [activation, first] })).toEqual({
    sessionID,
    taskMessageID: first.info.id,
    profile: "package-docs",
  })
  const next = user(3, "Теперь построй сценарий")
  expect(TaskScope.derive({ sessionID, messages: [activation, next, first] })).toEqual({
    sessionID,
    taskMessageID: next.info.id,
    profile: "default",
  })
})

test("synthetic continuations, compaction-only messages and overflow replay preserve the original task", () => {
  const first = user(1)
  const grant = activated(2, first, "package-docs")
  const continuation = user(3, "Продолжай", { synthetic: true, metadata: { compaction_continue: true } })
  const compaction = user(4)
  compaction.parts = [
    { id: PartID.ascending(), sessionID, messageID: compaction.info.id, type: "compaction", auto: true },
  ]
  const replay = user(5, "Документируй приложенный пакет", { metadata: { compaction_replay_of: first.info.id } })
  expect(TaskScope.derive({ sessionID, messages: [replay, compaction, grant, first, continuation] })).toEqual({
    sessionID,
    taskMessageID: first.info.id,
    profile: "package-docs",
  })
  const afterReplay = activated(6, replay, "package-docs")
  expect(TaskScope.derive({ sessionID, messages: [replay, first, continuation, afterReplay] })).toEqual({
    sessionID,
    taskMessageID: first.info.id,
    profile: "package-docs",
  })
})

test("slash activation is restored from its applied skill body without treating the body as a new task", () => {
  const command = user(1, "/package-docs приложенный пакет")
  command.parts.push({
    id: PartID.ascending(),
    sessionID,
    messageID: command.info.id,
    type: "text",
    text: "Verified bundled skill body",
    synthetic: true,
    metadata: { skill_activation: { name: "package-docs", profile: "package-docs", digest: "b".repeat(64) } },
  })
  const restored = Schema.decodeUnknownSync(SessionV1.WithParts)(JSON.parse(JSON.stringify(command)))
  expect(TaskScope.derive({ sessionID, messages: [restored] })).toEqual({
    sessionID,
    taskMessageID: command.info.id,
    profile: "package-docs",
  })
  const replay = user(2, "Verified bundled skill body", {
    synthetic: true,
    metadata: {
      skill_activation: { name: "package-docs", profile: "package-docs", digest: "b".repeat(64) },
      compaction_replay_of: command.info.id,
    },
  })
  expect(TaskScope.derive({ sessionID, messages: [command, replay] })).toEqual({
    sessionID,
    taskMessageID: command.info.id,
    profile: "package-docs",
  })
})

test("revert excludes a later task and activations at or after its part boundary", () => {
  const first = user(1)
  const automation = activated(2, first, "loginom-automation")
  const docs = activated(3, first, "package-docs")
  const next = user(4, "Новая задача")
  const messages = [first, automation, docs, next]
  expect(TaskScope.derive({ sessionID, messages, revert: { messageID: next.info.id } })).toEqual({
    sessionID,
    taskMessageID: first.info.id,
    profile: "package-docs",
  })
  expect(
    TaskScope.derive({ sessionID, messages, revert: { messageID: docs.info.id, partID: docs.parts[0].id } }),
  ).toEqual({
    sessionID,
    taskMessageID: first.info.id,
    profile: "loginom-automation",
  })
  expect(TaskScope.derive({ sessionID, messages, revert: { messageID: first.info.id } })).toBeUndefined()
  expect(messages).toHaveLength(4)
  expect(docs.parts).toHaveLength(1)
})

test("an applied docs task cannot gain automation until a new real user task", () => {
  const first = user(1)
  const automation = activated(2, first, "loginom-automation")
  const docs = activated(3, first, "package-docs")
  const forbidden = activated(4, first, "loginom-automation")
  expect(TaskScope.derive({ sessionID, messages: [first, automation, docs, forbidden] })).toEqual({
    sessionID,
    taskMessageID: first.info.id,
    profile: "package-docs",
  })
  const next = user(5, "Построй новый сценарий")
  expect(
    TaskScope.derive({
      sessionID,
      messages: [first, automation, docs, forbidden, next, activated(6, next, "loginom-automation")],
    }),
  ).toEqual({ sessionID, taskMessageID: next.info.id, profile: "loginom-automation" })
})

test("foreign parts cannot create tasks, grant profiles or turn a request into replay", () => {
  const first = user(1)
  const docs = activated(2, first, "package-docs")
  const forged = user(3, "New request", { metadata: { compaction_replay_of: first.info.id } })
  forged.parts[0].messageID = first.info.id
  const foreign = activated(4, first, "loginom-automation")
  foreign.parts[0].sessionID = SessionID.create()
  expect(TaskScope.derive({ sessionID, messages: [first, docs, forged, foreign] })).toEqual({
    sessionID,
    taskMessageID: first.info.id,
    profile: "package-docs",
  })
  const next = user(5, "Actual new request")
  next.parts.push({
    id: PartID.ascending(),
    sessionID: SessionID.create(),
    messageID: next.info.id,
    type: "text",
    text: "Foreign grant",
    metadata: {
      skill_activation: { name: "loginom-automation", profile: "loginom-automation", digest: "a".repeat(64) },
    },
  })
  expect(TaskScope.derive({ sessionID, messages: [first, docs, forged, foreign, next] })).toEqual({
    sessionID,
    taskMessageID: next.info.id,
    profile: "default",
  })
})

test("pending, malformed, ordinary-skill and unsuccessful tool records never grant a product profile", () => {
  const first = user(1)
  for (const value of [
    { name: "package-docs", profile: "package-docs", digest: "not-a-digest" },
    { name: "external-docs", profile: "package-docs", digest: "a".repeat(64) },
    { name: "package-docs", profile: "package-docs", digest: "a".repeat(64), pending: true },
    { name: "ordinary", profile: "ordinary", digest: "a".repeat(64) },
  ]) {
    const body = user(2, "Loaded skill", { synthetic: true, metadata: { skill_activation: value } })
    expect(TaskScope.derive({ sessionID, messages: [first, body] })?.profile).toBe("default")
  }
  const pending = activated(2, first, "package-docs")
  const tool = pending.parts[0]
  if (tool.type !== "tool" || tool.state.status !== "completed") throw new Error("Expected skill fixture")
  const activation = tool.state.metadata.activation
  tool.state.metadata = { activation_pending: activation }
  expect(TaskScope.derive({ sessionID, messages: [first, pending] })?.profile).toBe("default")
  tool.state = { status: "running", input: {}, time: { start: 2 }, metadata: { activation } }
  expect(TaskScope.derive({ sessionID, messages: [first, pending] })?.profile).toBe("default")
  tool.state = { status: "error", input: {}, error: "failed", time: { start: 2, end: 3 }, metadata: { activation } }
  expect(TaskScope.derive({ sessionID, messages: [first, pending] })?.profile).toBe("default")
  const custom = activated(3, first, "loginom-automation")
  if (custom.parts[0].type === "tool") custom.parts[0].tool = "custom-skill"
  expect(TaskScope.derive({ sessionID, messages: [first, custom] })?.profile).toBe("default")
})

test("late answers and old replay cannot reactivate a task superseded by a real request", () => {
  const first = user(1)
  const docs = activated(2, first, "package-docs")
  const next = user(3, "Построй новый сценарий")
  const replay = user(4, "Old request", {
    metadata: {
      compaction_replay_of: first.info.id,
      skill_activation: { name: "package-docs", profile: "package-docs", digest: "a".repeat(64) },
    },
  })
  const late = activated(5, replay, "package-docs")
  expect(TaskScope.derive({ sessionID, messages: [first, docs, next, replay, late] })).toEqual({
    sessionID,
    taskMessageID: next.info.id,
    profile: "default",
  })
})
