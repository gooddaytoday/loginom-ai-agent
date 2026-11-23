import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"
import { OpenCode, type EventSubscribeOutput } from "@opencode/client/promise"
import { runNonInteractivePrompt } from "../../src/run/noninteractive"
import { RunProduct } from "../../src/run/product"
import { Standalone } from "../../src/standalone"

// Loginom AI Agent (B2.7a4): the product's `run` by its recorded tool calls. The cases of 0.4
// `test/cli/run-outcome.test.ts` (`a080f7725c:packages/opencode`) with OpenCode 2's `read` (`path`, no error past the end
// of a file), the exit codes of design §10 and the flags the product CLI keeps for `evals` and `run-check.py`.

type Part = Parameters<ReturnType<typeof RunProduct.outcome>["observe"]>[0]

function part(tool: string, input: Record<string, unknown>, failed: boolean, error = "failed"): Part {
  return {
    id: "part",
    sessionID: "session",
    tool,
    state: failed ? { status: "error", input, error } : { status: "completed", input, metadata: {} },
  }
}

function missing(path: string, input: Record<string, unknown> = {}) {
  return part("read", { path, ...input }, true, `File not found: ${path}`)
}

function completed(tool: string, input: Record<string, unknown>, metadata: Record<string, unknown>): Part {
  return { id: "part", sessionID: "session", tool, state: { status: "completed", input, metadata } }
}

describe("tool outcome", () => {
  test("a successful unrelated call cannot erase an unresolved failure", () => {
    const outcome = RunProduct.outcome()
    outcome.observe(part("apply", { operation_id: "one", value: 1 }, true))
    outcome.observe(part("read", { operation_id: "one", value: 1 }, false))
    outcome.observe(part("apply", { operation_id: "two", value: 1 }, false))
    expect(outcome.failed()).toBe(true)
    outcome.observe(part("apply", { operation_id: "one", value: 1 }, false))
    expect(outcome.failed()).toBe(false)
  })

  test("exact argument retry ignores object key order but preserves array order", () => {
    const outcome = RunProduct.outcome()
    outcome.observe(part("lookup", { b: { z: 1, a: 2 }, a: [1, 2] }, true))
    outcome.observe(part("lookup", { a: [2, 1], b: { a: 2, z: 1 } }, false))
    expect(outcome.failed()).toBe(true)
    outcome.observe(part("lookup", { a: [1, 2], b: { a: 2, z: 1 } }, false))
    expect(outcome.failed()).toBe(false)
  })

  test.each(["permission.rejected", undefined])("a successful read cannot clear a permission denial: %s", (type) => {
    const outcome = RunProduct.outcome()
    const failure = missing("/data/poitns.csv")
    if (failure.state.status !== "error") throw Error("invalid fixture")
    failure.state.type = type
    if (!type) failure.state.metadata = { permissionDenied: true }
    outcome.observe(failure)
    outcome.observe(part("read", { path: "/data/points.csv" }, false))
    expect(outcome.failed()).toBe(true)
    expect(outcome.verdict(undefined).errors[0]?.type).toBe("CLI_PERMISSION_REJECTED")
  })

  test.each(["/data/poitns.csv", "/data/poins.csv", "/data/POINTS.csv", "/data/orders.csv"])(
    "a successful read repairs the missing filename %s",
    (path) => {
      const outcome = RunProduct.outcome()
      outcome.observe(missing(path))
      expect(outcome.failed()).toBe(true)
      outcome.observe(part("read", { path: "/data/points.csv" }, false))
      expect(outcome.failed()).toBe(false)
    },
  )

  test("a successful read repairs only the latest matching missing file", () => {
    const outcome = RunProduct.outcome()
    outcome.observe(missing("/data/orders.csv"))
    outcome.observe(missing("/data/customers.csv"))
    outcome.observe(part("read", { path: "/data/products.csv" }, false))
    expect(outcome.failed()).toBe(true)
    outcome.observe(part("read", { path: "/data/orders.csv" }, true))
    outcome.observe(part("read", { path: "/data/orders.csv" }, false))
    expect(outcome.failed()).toBe(false)
  })

  test("an exact read retry preserves other missing files", () => {
    const outcome = RunProduct.outcome()
    outcome.observe(missing("/data/orders.csv"))
    outcome.observe(missing("/data/customers.csv"))
    outcome.observe(part("read", { path: "/data/orders.csv" }, false))
    expect(outcome.failed()).toBe(true)
    outcome.observe(part("read", { path: "/data/customers.csv" }, false))
    expect(outcome.failed()).toBe(false)
  })

  test("a repeated missing read becomes the latest matching failure", () => {
    const outcome = RunProduct.outcome()
    outcome.observe(missing("/data/orders.csv"))
    outcome.observe(missing("/data/customers.csv"))
    outcome.observe(missing("/data/orders.csv"))
    outcome.observe(part("read", { path: "/data/products.csv" }, false))
    expect(outcome.failed()).toBe(true)
    outcome.observe(part("read", { path: "/data/customers.csv" }, true))
    outcome.observe(part("read", { path: "/data/customers.csv" }, false))
    expect(outcome.failed()).toBe(false)
  })

  test.each([{ path: "/other/points.csv" }, { path: "/data/points.txt" }, { path: "/data/points.csv", offset: 20 }])(
    "an unrelated read does not repair a missing read: %j",
    (input) => {
      const outcome = RunProduct.outcome()
      outcome.observe(missing("/data/poitns.csv"))
      outcome.observe(part("read", input, false))
      expect(outcome.failed()).toBe(true)
    },
  )

  test("only a successful read can repair the missing read", () => {
    const outcome = RunProduct.outcome()
    outcome.observe(missing("/data/poitns.csv"))
    outcome.observe(part("glob", { path: "/data/points.csv" }, false))
    outcome.observe(missing("/data/points.csv"))
    expect(outcome.failed()).toBe(true)
    outcome.observe(completed("read", { path: "/data/points.csv" }, { isError: true }))
    expect(outcome.failed()).toBe(true)
    outcome.observe(part("read", { path: "/data/points.csv" }, false))
    expect(outcome.failed()).toBe(true)
    outcome.observe(part("read", { path: "/data/poitns.csv" }, false))
    expect(outcome.failed()).toBe(false)
  })

  test("a corrected read preserves other unresolved failures", () => {
    const outcome = RunProduct.outcome()
    outcome.observe(missing("/data/poitns.csv"))
    outcome.observe(missing("/other/orders.csv"))
    outcome.observe(part("read", { path: "/data/points.csv" }, false))
    expect(outcome.failed()).toBe(true)
    outcome.observe(part("read", { path: "/other/orders.csv" }, false))
    expect(outcome.failed()).toBe(false)
  })

  test("a missing read without a successful read remains unresolved", () => {
    const outcome = RunProduct.outcome()
    outcome.observe(missing("/data/poitns.csv"))
    expect(outcome.failed()).toBe(true)
    outcome.observe(part("glob", { pattern: "*.csv" }, false))
    expect(outcome.failed()).toBe(true)
  })

  test("a corrected path cannot repair a different read error", () => {
    const outcome = RunProduct.outcome()
    outcome.observe(part("read", { path: "/data/poitns.csv" }, true))
    outcome.observe(part("read", { path: "/data/points.csv" }, false))
    expect(outcome.failed()).toBe(true)
  })

  test("a pending or running corrected read cannot repair a failure", () => {
    const outcome = RunProduct.outcome()
    outcome.observe(missing("/data/poitns.csv"))
    outcome.observe({
      id: "part",
      sessionID: "session",
      tool: "read",
      state: { status: "running", input: { path: "/data/points.csv" } },
    })
    expect(outcome.failed()).toBe(true)
  })

  test("a corrected read in another session cannot repair a failure", () => {
    const outcome = RunProduct.outcome()
    outcome.observe(missing("/data/poitns.csv"))
    outcome.observe({ ...part("read", { path: "/data/points.csv" }, false), sessionID: "other-session" })
    expect(outcome.failed()).toBe(true)
  })

  test("invalid and MCP error markers cannot be mistaken for completed success", () => {
    const outcome = RunProduct.outcome()
    outcome.observe(completed("probe", {}, { isError: true }))
    expect(outcome.failed()).toBe(true)
    outcome.observe(part("probe", {}, false))
    expect(outcome.failed()).toBe(false)
    outcome.observe(part("invalid", { tool: "unknown", error: "not available" }, false))
    outcome.observe(part("probe", {}, false))
    expect(outcome.failed()).toBe(true)
  })

  test("an arbitrary MCP operation_id does not imply the Loginom operation contract", () => {
    const outcome = RunProduct.outcome()
    outcome.observe(part("generic_mcp", { operation_id: "one", value: 1 }, true))
    outcome.observe(part("generic_mcp", { operation_id: "one", value: 2 }, false))
    expect(outcome.failed()).toBe(true)
    outcome.observe(part("generic_mcp", { value: 1, operation_id: "one" }, false))
    expect(outcome.failed()).toBe(false)
  })

  test("a Loginom tool error does not fail the run", () => {
    const outcome = RunProduct.outcome()
    outcome.observe(part("loginom_dock_artifact_deliver", { operation_id: "deliver" }, true))
    expect(outcome.failed()).toBe(false)
    outcome.observe(part("shell", { command: "ls" }, true))
    expect(outcome.failed()).toBe(true)
    outcome.observe(part("invalid", { tool: "loginom_missing", error: "not available" }, false))
    expect(outcome.failed()).toBe(true)
  })

  test("a running Loginom retry does not fail the run", () => {
    const outcome = RunProduct.outcome()
    outcome.observe(part("loginom_apply", { operation_id: "one" }, true))
    outcome.observe(completed("loginom_apply", { operation_id: "one" }, { loginomPending: true }))
    expect(outcome.failed()).toBe(false)
  })

  // 0.4 `standalone-preflight` «lazy scenario preparation…» and «a real Help refusal…» by the calls they record: a Help
  // refusal is not a connection failure, an unresolved scenario preparation is.
  test("only unresolved scenario connection admission preserves the lazy preflight failure", () => {
    const outcome = RunProduct.outcome()
    outcome.observe(part("loginom_read", { uris: "help://component" }, true, "LOGINOM_CONNECTION_NOT_READY"))
    expect(outcome.connectionFailure()).toBeUndefined()
    expect(outcome.verdict(undefined)).toEqual({ errors: [], exit: 0 })

    outcome.observe(part("loginom_dock_prepare", {}, true, "LOGINOM_CONFIG_REQUIRED"))
    expect(outcome.connectionFailure()).toBe("LOGINOM_CONFIG_REQUIRED")
    outcome.observe(part("loginom_dock_diagnostics", {}, false))
    expect(outcome.connectionFailure()).toBe("LOGINOM_CONFIG_REQUIRED")
    outcome.observe(completed("loginom_dock_prepare", {}, { loginomPending: true }))
    expect(outcome.verdict(undefined)).toEqual({ errors: [RunProduct.code("LOGINOM_CONFIG_REQUIRED")], exit: 2 })
    outcome.observe(part("loginom_dock_prepare", {}, false))
    expect(outcome.connectionFailure()).toBeUndefined()
    expect(outcome.failed()).toBe(false)
  })

  test.each([
    "LOGINOM_CONNECTION_NOT_READY",
    "LOGINOM_LOGIN_REJECTED",
    "LOGINOM_ACCOUNT_MISMATCH",
    "LOGINOM_LOGIN_UNAVAILABLE",
    "LOGINOM_BROWSER_START_FAILED",
  ])("lazy browser admission keeps the connection failure contract: %s", (failure) => {
    const outcome = RunProduct.outcome()
    outcome.observe(part("loginom_dock_prepare", {}, true, failure))
    expect(outcome.verdict(undefined)).toEqual({ errors: [RunProduct.code("LOGINOM_CONNECTION_NOT_READY")], exit: 1 })
    outcome.observe(part("loginom_dock_prepare", {}, false))
    expect(outcome.connectionFailure()).toBeUndefined()
  })
})

describe("final state", () => {
  test("a run without failures ends with no error and exit code 0", () => {
    const outcome = RunProduct.outcome()
    outcome.observe(part("read", { path: "/data/points.csv" }, false))
    expect(outcome.verdict(undefined)).toEqual({ errors: [], exit: 0 })
  })

  test("a declined permission comes first, then the session's failure; the code is 1", () => {
    const outcome = RunProduct.outcome()
    outcome.reject()
    outcome.observe(part("shell", { command: "false" }, true))
    const failure = { type: "provider.transport", message: "reset" }
    expect(outcome.verdict(failure)).toEqual({ errors: [RunProduct.code("CLI_PERMISSION_REJECTED"), failure], exit: 1 })
  })

  test("a tool failure the run did not correct is reported only without another error", () => {
    const outcome = RunProduct.outcome()
    outcome.observe(part("shell", { command: "false" }, true))
    expect(outcome.verdict(undefined)).toEqual({ errors: [RunProduct.code("CLI_TOOL_FAILED")], exit: 1 })
    const failure = { type: "unknown", message: "Session failed" }
    expect(outcome.verdict(failure)).toEqual({ errors: [failure], exit: 1 })
  })

  test.each(["LOGINOM_CALL_UNCERTAIN", 'LOGINOM_RECOVERY_REQUIRED: {"operation_id":"one"}'])(
    "a Loginom call that needs recovery gives exit code 4 whatever else failed: %s",
    (error) => {
      const outcome = RunProduct.outcome()
      outcome.observe(part("shell", { command: "false" }, true))
      outcome.observe(part("loginom_dock_node_apply", { operation_id: "one" }, true, error))
      expect(outcome.verdict(undefined)).toEqual({
        errors: [RunProduct.code("CLI_TOOL_FAILED"), RunProduct.code("LOGINOM_RECOVERY_REQUIRED")],
        exit: 4,
      })
      expect(outcome.cancelled()).toEqual([
        RunProduct.code("LOGINOM_RECOVERY_REQUIRED"),
        RunProduct.code("CLI_CANCELLED"),
      ])
    },
  )

  test("another tool's recovery code is not a Loginom recovery", () => {
    const outcome = RunProduct.outcome()
    outcome.observe(part("webfetch", { url: "https://example.com" }, true, "LOGINOM_CALL_UNCERTAIN"))
    expect(outcome.verdict(undefined).exit).toBe(1)
    expect(outcome.cancelled()).toEqual([RunProduct.code("CLI_CANCELLED")])
  })

  test("errors carry 0.4's name, message and status code next to OpenCode 2's fields", () => {
    expect(RunProduct.error(RunProduct.code("CLI_TOOL_FAILED"))).toEqual({
      type: "CLI_TOOL_FAILED",
      message: "CLI_TOOL_FAILED",
      name: "CLI_TOOL_FAILED",
      data: { message: "CLI_TOOL_FAILED" },
    })
    expect(RunProduct.error({ type: "provider.rate-limit", message: "slow down", status: 429 })).toMatchObject({
      name: "APIError",
      data: { message: "slow down", statusCode: 429 },
    })
    expect(RunProduct.error({ type: "provider.auth", message: "bad key", status: 401 }).name).toBe("ProviderAuthError")
    expect(RunProduct.error({ type: "provider.no-route", message: "no model" }).name).toBe("ProviderModelNotFoundError")
    expect(RunProduct.error({ type: "unknown", message: "boom" })).toEqual({
      type: "unknown",
      message: "boom",
      name: "unknown",
      data: { message: "boom" },
    })
  })

  test("session.status is busy, a retry with its attempt, or idle", () => {
    expect(RunProduct.status({ type: "busy" })).toEqual({ status: { type: "busy" } })
    expect(
      RunProduct.status({
        type: "retry",
        attempt: 2,
        at: 1000,
        error: { type: "provider.rate-limit", message: "429" },
      }),
    ).toEqual({ status: { type: "retry", attempt: 2, message: "429", next: 1000 } })
  })
})

describe("flags of the product run", () => {
  test("headless flags are dropped before the CLI parses its arguments, and exclude each other", () => {
    expect(Standalone.forward(["run", "--headless", "--format", "json", "--", "--headless"], "/work")).toEqual({
      args: ["run", "--format", "json", "--", "--headless"],
      directory: undefined,
    })
    expect(Standalone.forward(["--no-headless", "/project"], "/work")).toEqual({ args: ["/project"] })
    expect(() => Standalone.forward(["run", "--headless", "--no-headless"], "/work")).toThrow("CLI_ARGUMENT_INVALID")
  })

  test("run --dir names the project directory against the current one", () => {
    expect(Standalone.forward(["run", "--dir", "project", "hello"], "/work")).toEqual({
      args: ["run", "hello"],
      directory: "/work/project",
    })
    expect(Standalone.forward(["run", "--dir=/abs", "hello"], "/work").directory).toBe("/abs")
    expect(() => Standalone.forward(["run", "--dir"], "/work")).toThrow("CLI_ARGUMENT_INVALID")
  })

  test("run --variant joins --model; the default variant is the model's own", () => {
    expect(Standalone.forward(["run", "--model", "openai/gpt", "--variant", "medium", "--", "hi"], "/w").args).toEqual([
      "run",
      "--model",
      "openai/gpt#medium",
      "--",
      "hi",
    ])
    expect(Standalone.forward(["run", "--variant=low", "-m", "openai/gpt"], "/w").args).toEqual([
      "run",
      "--model",
      "openai/gpt#low",
    ])
    expect(Standalone.forward(["run", "--model", "openai/gpt", "--variant", "default"], "/w").args).toEqual([
      "run",
      "--model",
      "openai/gpt",
    ])
    expect(() => Standalone.forward(["run", "--variant", "low"], "/w")).toThrow("CLI_ARGUMENT_INVALID")
    expect(() => Standalone.forward(["run", "--model", "openai/gpt#high", "--variant", "low"], "/w")).toThrow(
      "CLI_ARGUMENT_INVALID",
    )
  })

  test("other commands keep their own flags", () => {
    expect(Standalone.forward(["session", "list", "--dir", "x"], "/w")).toEqual({
      args: ["session", "list", "--dir", "x"],
    })
  })
})

// A subagent's question is this run's too (0.4 followed the run's child sessions). Its tool calls are not in this
// stream, so the declined request itself fails the run. The server is replaced, as in `noninteractive.test.ts`.
describe("the run of the product", () => {
  afterEach(() => {
    mock.restore()
    delete process.env.LOGINOM_AI_AGENT_CLI_ROOT
    process.exitCode = 0
  })

  test("a subagent's permission request the run declines ends it with CLI_PERMISSION_REJECTED", async () => {
    process.env.LOGINOM_AI_AGENT_CLI_ROOT = "/profile"
    const sdk = OpenCode.make({ baseUrl: "https://opencode.test" })
    const values: EventSubscribeOutput[] = [{ id: "evt_connected", type: "server.connected", data: {} }]
    const settled = Promise.withResolvers<void>()
    const pushed = { wake: () => {} }
    const stream = (async function* () {
      while (true) {
        const value = values.shift()
        if (!value) {
          await new Promise<void>((resolve) => (pushed.wake = resolve))
          continue
        }
        if (value.type === "session.execution.succeeded") setTimeout(settled.resolve, 0)
        yield value
      }
    })()
    const replies: string[] = []
    spyOn(sdk.event, "subscribe").mockImplementation((() => stream) as typeof sdk.event.subscribe)
    spyOn(sdk.permission, "list").mockImplementation(() => Promise.resolve([]) as never)
    spyOn(sdk.session.form, "list").mockImplementation(() => Promise.resolve([]) as never)
    spyOn(sdk.permission, "reply").mockImplementation((request) => {
      replies.push(`${request.sessionID} ${request.decision}`)
      return Promise.resolve(undefined) as never
    })
    spyOn(sdk.session, "get").mockImplementation(
      ({ sessionID }) =>
        Promise.resolve({ id: sessionID, parentID: sessionID === "ses_child" ? "ses_1" : undefined }) as never,
    )
    spyOn(sdk.experimental.session, "wait").mockImplementation(() => settled.promise)
    spyOn(sdk.experimental.job, "list").mockImplementation((async () => []) as never)
    spyOn(sdk.session.inbox, "list").mockImplementation((async () => []) as never)
    spyOn(sdk.session, "active").mockImplementation((async () => ({})) as never)
    const prompted = { id: "msg_prompt" }
    spyOn(sdk.message, "list").mockImplementation(
      () =>
        Promise.resolve({
          data: [
            { id: "msg_idle", type: "idle", outcome: "succeeded", time: { created: 5 } },
            { id: prompted.id, type: "user", text: "hello", time: { created: 1 } },
          ],
          cursor: {},
        }) as never,
    )
    spyOn(sdk.session, "prompt").mockImplementation((request) => {
      prompted.id = request.id ?? prompted.id
      values.push(
        {
          id: "evt_delivered",
          created: 0,
          type: "session.inbox.delivered",
          durable: { aggregateID: "ses_1", seq: 0, version: 1 },
          data: { sessionID: "ses_1", inboxID: prompted.id },
        },
        {
          id: "evt_asked",
          created: 1,
          type: "permission.asked",
          data: { id: "per_1", sessionID: "ses_child", action: "edit", resources: ["a.txt"] },
        },
        {
          id: "evt_succeeded",
          created: 2,
          type: "session.execution.succeeded",
          durable: { aggregateID: "ses_1", seq: 1, version: 1 },
          data: { sessionID: "ses_1" },
        },
      )
      pushed.wake()
      return Promise.resolve({ id: prompted.id, sessionID: "ses_1", time: { created: 1 } }) as never
    })
    const stdout: string[] = []
    spyOn(process.stdout, "write").mockImplementation((chunk) => stdout.push(String(chunk)) > 0)
    spyOn(process.stderr, "write").mockImplementation(() => true)
    await runNonInteractivePrompt({
      client: sdk,
      sessionID: "ses_1",
      location: { directory: "/work" },
      message: "hello",
      files: [],
      thinking: false,
      format: "json",
      auto: false,
      standalone: false,
      signal: new AbortController().signal,
      renderTool: () => Promise.resolve(),
      renderToolError: () => Promise.resolve(),
    })
    const events = stdout
      .join("")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    const exit = process.exitCode
    mock.restore()
    expect(replies).toEqual(["ses_child reject"])
    expect(events.map((event) => event.status?.type ?? event.error?.name)).toEqual([
      "busy",
      "idle",
      "CLI_PERMISSION_REJECTED",
    ])
    expect(exit).toBe(1)
  })
})
