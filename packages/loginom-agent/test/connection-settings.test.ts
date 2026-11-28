import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NodeHostStartupError } from "@loginom-ai-agent/loginom-host/node-client"
import { ConnectionSettingsRpc, type Candidate, type Issue } from "@loginom-ai-agent/loginom-host/settings-rpc"
import { connectionSettings } from "../src/connection-settings"
import { ServiceHost, type Connection } from "../src/host"

test("the settings RPC answers while the Host handshake is pending", async () => {
  const data = await mkdtemp(join(tmpdir(), "settings-handshake-"))
  const handshake = Promise.withResolvers<Connection>()
  const connection: Connection = {
    port: { postMessage() {}, on() {}, start() {} },
    close: async () => {},
    request: async () => ({
      revision: 1,
      generation: 1,
      url: "https://loginom.example/app/",
      username: "analyst",
      folder: "/analyst",
      hasPassword: true,
      state: "ready",
    }),
  }
  await ServiceHost.start({ data, connect: () => handshake.promise })
  try {
    const settings = connectionSettings()
    const status = await Promise.race([settings.status(), Bun.sleep(300).then(() => "waiting for handshake")])
    expect(status).toEqual({ ok: true, state: "starting" })

    handshake.resolve(connection)
    await handshake.promise
    expect(await settings.status()).toMatchObject({ ok: true, value: { state: "ready", username: "analyst" } })
  } finally {
    handshake.resolve(connection)
    await ServiceHost.close()
    await rm(data, { recursive: true, force: true })
  }
})

test.each([
  ["LOGINOM_HOST_TIMEOUT", "LOGINOM_HOST_TIMEOUT"],
  ["private startup detail", "LOGINOM_HOST_REQUEST_FAILED"],
])("the settings RPC reports a rejected handshake with a safe reason (%s)", async (message, reason) => {
  const data = await mkdtemp(join(tmpdir(), "settings-handshake-"))
  const handshake = Promise.withResolvers<Connection>()
  await ServiceHost.start({ data, connect: () => handshake.promise })
  try {
    handshake.reject(new NodeHostStartupError(new Error(message), true))
    await handshake.promise.catch(() => undefined)

    const result = await connectionSettings().status()
    const unavailable = { ok: false, issue: "unavailable", reason } as const
    expect(result).toEqual(unavailable)
    expect(await ConnectionSettingsRpc.methods.status.output["~standard"].validate(result)).toEqual({ value: unavailable })
  } finally {
    await ServiceHost.close()
    await rm(data, { recursive: true, force: true })
  }
})

test("the settings RPC emits only the display status, even for a migrated address", async () => {
  const settings = connectionSettings(async () => ({
    revision: 3,
    generation: 2,
    url: "https://legacy:synthetic-password@loginom.example/app/?ticket=synthetic-token#synthetic-fragment",
    username: "analyst",
    folder: "/analyst",
    hasPassword: true,
    state: "pending",
    application: { state: "pending", tasks: 2 },
    password: "synthetic-password",
    apiKey: "synthetic-key",
  }))
  const result = await settings.status()
  expect(result).toEqual({
    ok: true,
    value: {
      revision: 3,
      generation: 2,
      url: "https://loginom.example/app/",
      username: "analyst",
      folder: "/analyst",
      hasPassword: true,
      state: "pending",
      application: { state: "pending", tasks: 2 },
      failed: false,
    },
  })
})

test.each([
  ["LOGINOM_PENDING_CLEAR_FAILED", { pendingOutcome: "pendingCleanupFailed" }],
  ["LOGINOM_PENDING_RESUME_FAILED", { pendingOutcome: "pendingResumeFailed" }],
  ["LOGINOM_PENDING_NOT_APPLIED", { pendingOutcome: "pendingNotApplied" }],
])("settings report %s while the original connection is ready", async (failure, outcome) => {
  const settings = connectionSettings(async () => ({
    revision: 2,
    generation: 1,
    url: "https://loginom.example/app/",
    username: "analyst",
    folder: "/analyst",
    hasPassword: true,
    state: "ready",
    failure,
  }))
  const result = await settings.status()
  const validated = await ConnectionSettingsRpc.methods.status.output["~standard"].validate(result)
  expect(validated).toMatchObject({
    value: { ok: true, value: { generation: 1, state: "ready", failed: true, ...outcome } },
  })
})

test("settings keep the write failure alongside the cleanup warning", async () => {
  const settings = connectionSettings(async () => ({
    revision: 2, generation: 1, url: "https://loginom.example/app/", username: "analyst", folder: "/analyst",
    hasPassword: true, state: "ready", failure: "LOGINOM_STORE_WRITE_FAILED", cleanupFailure: "LOGINOM_PENDING_CLEAR_FAILED",
  }))
  expect(await settings.status()).toMatchObject({
    ok: true, value: { pendingOutcome: "pendingWriteFailed", pendingCleanupFailed: true },
  })
})

const input = {
  revision: 0,
  url: "https://loginom.example/",
  username: "analyst",
  password: { operation: "replace", value: "synthetic-password" },
} satisfies Candidate

test.each([
  ["LOGINOM_KNOWLEDGE_AUTH_FAILED", "knowledgeAuthFailed"],
  ["LOGINOM_LOGIN_UNAVAILABLE", "loginUnavailable"],
  ["LOGINOM_LOGIN_REJECTED", "credentialsRejected"],
] satisfies [string, Issue][])(
  "settings RPC translates %s without including the private cause",
  async (code, issue) => {
    const settings = connectionSettings(async () => {
      throw new Error(code, { cause: { password: input.password.value, apiKey: "synthetic-key" } })
    })
    expect(await settings.check(input, { signal: new AbortController().signal })).toEqual({ ok: false, issue })
  },
)

test("malformed Loginom settings input does not echo the password", async () => {
  const schema = ConnectionSettingsRpc.methods.check.input["~standard"]
  const invalid = await schema.validate({ ...input, password: { operation: input.password.value } })
  expect(invalid.issues).toBeDefined()
  expect(JSON.stringify(invalid)).not.toContain(input.password.value)
})

test("the settings RPC reports an unavailable service without a transport error", async () => {
  const settings = connectionSettings(async () => {
    throw new Error("LOGINOM_HOST_NOT_READY")
  })
  expect(await settings.status()).toEqual({ ok: false, issue: "unavailable" })
})

test("settings reject URL parameters before calling the Host and pass the active check signal", async () => {
  let called: AbortSignal | undefined
  const settings = connectionSettings(async (_method, _input, _timeout, signal) => {
    called = signal
    return { validationId: "checked", expiresAt: 1 }
  })
  const context = { signal: new AbortController().signal }
  const input = {
    revision: 0,
    url: "https://loginom.example/app/",
    username: "analyst",
    password: { operation: "empty" },
  } satisfies Candidate
  expect(await settings.check({ ...input, url: input.url + "?ticket=synthetic" }, context)).toEqual({
    ok: false,
    issue: "invalidAddress",
  })
  expect(called).toBeUndefined()
  expect(await settings.check(input, context)).toMatchObject({ ok: true })
  expect(called).toBe(context.signal)
})
