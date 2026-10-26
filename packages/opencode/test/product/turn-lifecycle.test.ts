import { afterEach, describe, expect, test } from "bun:test"
import { Cause, Effect, Exit } from "effect"
import { LoginomHost } from "@loginom-ai-agent/loginom-host/adapter"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { MessageID, PartID, SessionID } from "@/session/schema"
import type { Skill } from "@/skill"
import { ProductHooks } from "../../src/product-hooks"

const sessionID = SessionID.make("ses_turn_lifecycle")
const taskMessageID = MessageID.ascending()
const digest = "a".repeat(64)

type Request = { method: string; input: unknown }

function connect(options: { acquire?: "ready" | "refused" } = {}) {
  const requests: Request[] = []
  let receive: ((event: { data: unknown }) => void) | undefined
  LoginomHost.connect({
    start() {},
    on(_event, listener) {
      receive = listener
    },
    postMessage(value) {
      const { id, method, input } = value as { id: string; method: string; input: unknown }
      requests.push({ method, input })
      if (method === "acquire" && options.acquire === "refused")
        return receive?.({ data: { id, error: "LOGINOM_HOST_NOT_READY" } })
      const result =
        method === "acquire" ? { generation: 4 } : method === "scope" ? (input as { scope: unknown }).scope : {}
      receive?.({ data: { id, generation: 4, result } })
    },
  })
  return requests
}

afterEach(() => LoginomHost.disconnect())

const unused = new Proxy({}, { get: () => () => Effect.die("unexpected call") })
function fakes() {
  const written: { kind: "message" | "part"; value: unknown }[] = []
  const sessions = {
    updateMessage: (value: unknown) => Effect.sync(() => void written.push({ kind: "message", value })),
    updatePart: (value: unknown) => Effect.sync(() => void written.push({ kind: "part", value })),
  }
  return { written, input: { sessionID, sessions, agents: unused, permission: unused } as never }
}

const acquire = () => {
  const { written, input } = fakes()
  return { written, run: ProductHooks.turnLifecycle.acquireRun(input) }
}

function recoveryHistory(reminded: boolean): SessionV1.WithParts[] {
  const messageID = MessageID.ascending()
  const base = { sessionID, messageID }
  const tool = (callID: string, action: string): SessionV1.ToolPart => ({
    ...base,
    id: PartID.ascending(),
    type: "tool",
    tool: "loginom_dock_browser_recovery",
    callID,
    state: {
      status: "completed",
      input: { action },
      output: JSON.stringify({ phase: "browser", operation_id: "op-1" }),
      title: "recovery",
      metadata: {},
      time: { start: 1, end: 2 },
    },
  })
  const reminder: SessionV1.TextPart = {
    ...base,
    id: PartID.ascending(),
    type: "text",
    text: "reminder",
    synthetic: true,
    metadata: { browser_recovery_reminder: "start-call" },
  }
  return [
    {
      info: { id: messageID, sessionID, role: "assistant", time: { created: 1 } } as SessionV1.Assistant,
      parts: [tool("start-call", "start"), ...(reminded ? [reminder] : [])],
    },
  ]
}

const user = {
  id: MessageID.ascending(),
  sessionID,
  role: "user",
  agent: "build",
  model: { providerID: "test", modelID: "m" },
  time: { created: 3 },
} as unknown as SessionV1.User
const session = { id: sessionID } as never

describe("ProductHooks.turnLifecycle", () => {
  test("the Host lease is released when the run's scope closes, however it ends", async () => {
    for (const end of ["success", "failure"] as const) {
      const requests = connect()
      const { run } = acquire()
      const exit = await Effect.runPromiseExit(
        Effect.scoped(
          Effect.gen(function* () {
            const turn = yield* run
            expect(turn.loginom?.generation).toBe(4)
            if (end === "failure") return yield* Effect.fail("cancelled")
          }),
        ),
      )
      expect(Exit.isFailure(exit)).toBe(end === "failure")
      expect(requests.map((request) => request.method)).toEqual(["acquire", "release"])
      LoginomHost.disconnect()
    }
  })

  test("a refused lease leaves the run without Loginom and says why in the system prompt", async () => {
    connect({ acquire: "refused" })
    const { run } = acquire()
    const turn = await Effect.runPromise(
      Effect.scoped(run.pipe(Effect.map((turn) => ({ loginom: turn.loginom, system: turn.system() })))),
    )
    expect(turn.loginom).toBeUndefined()
    expect(turn.system.join("\n")).toContain("Loginom tools are currently unavailable (acquire:")
  })

  test("without a Host connection the run has no Loginom and no instructions", async () => {
    const { run } = acquire()
    const system = await Effect.runPromise(Effect.scoped(run.pipe(Effect.map((turn) => turn.system()))))
    expect(system).toEqual([])
  })

  test("the first end of turn during browser recovery adds one reminder and continues", async () => {
    const requests = connect()
    const { run, written } = acquire()
    const outcome = await Effect.runPromise(
      Effect.scoped(
        Effect.flatMap(run, (turn) => turn.endTurn({ session, history: recoveryHistory(false), lastUser: user })),
      ),
    )
    expect(outcome).toBe("continue")
    expect(written.map((item) => item.kind)).toEqual(["message", "part"])
    expect(requests.some((request) => request.method === "call")).toBe(false)
  })

  test("the second end of turn stops the recovery attempt and exits", async () => {
    const requests = connect()
    const { run, written } = acquire()
    const task: SessionV1.WithParts = {
      info: { ...user, id: taskMessageID, time: { created: 0 } },
      parts: [{ id: PartID.ascending(), sessionID, messageID: taskMessageID, type: "text", text: "recover" }],
    }
    const history = [task, ...recoveryHistory(true)]
    const outcome = await Effect.runPromise(
      Effect.scoped(Effect.flatMap(run, (turn) => turn.endTurn({ session, history, lastUser: user }))),
    )
    expect(outcome).toBe("exit")
    expect(written).toEqual([])
    const call = requests.find((request) => request.method === "call")
    expect(call?.input).toMatchObject({ name: "dock_browser_recovery", args: { action: "stop", operation_id: "op-1" } })
  })

  test("a skill that is not bundled never requests a profile", async () => {
    const requests = connect()
    const { run } = acquire()
    const source = {
      scope: { sessionID, taskMessageID, profile: "default" as const },
      messageID: MessageID.ascending(),
      callID: "c",
    }
    await Effect.runPromise(
      Effect.scoped(
        Effect.flatMap(run, (turn) =>
          turn.afterTool(
            { name: "review", description: "", location: "/x", content: "", source: "project" } as Skill.Info,
            source,
          ),
        ),
      ),
    )
    expect(requests.some((request) => request.method === "scope")).toBe(false)
  })

  test("a bundled skill requests its profile and the request is the only effect until the next turn", async () => {
    const requests = connect()
    const { run, written } = acquire()
    const source = {
      scope: { sessionID, taskMessageID, profile: "default" as const },
      messageID: MessageID.ascending(),
      callID: "c",
    }
    await Effect.runPromise(
      Effect.scoped(
        Effect.flatMap(run, (turn) =>
          turn.afterTool(
            {
              name: "package-docs",
              description: "",
              location: "/x",
              content: "",
              source: "bundled",
              digest,
            } as Skill.Info,
            source,
          ),
        ),
      ),
    )
    expect(requests.filter((request) => request.method === "scope").map((request) => request.input)).toEqual([
      expect.objectContaining({ mode: "request", scope: { taskMessageID, profile: "package-docs" } }),
    ])
    expect(written).toEqual([])
  })

  test("a bundled skill without a Host lease is denied", async () => {
    const { run } = acquire()
    const source = {
      scope: { sessionID, taskMessageID, profile: "default" as const },
      messageID: MessageID.ascending(),
      callID: "c",
    }
    const exit = await Effect.runPromiseExit(
      Effect.scoped(
        Effect.flatMap(run, (turn) =>
          turn.afterTool(
            {
              name: "package-docs",
              description: "",
              location: "/x",
              content: "",
              source: "bundled",
              digest,
            } as Skill.Info,
            source,
          ),
        ),
      ),
    )
    expect(Exit.isFailure(exit) && Cause.pretty(exit.cause)).toContain("LOGINOM_SCOPE_DENIED")
  })
})
