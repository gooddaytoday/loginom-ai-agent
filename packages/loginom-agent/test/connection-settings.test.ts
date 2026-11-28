import { expect, test } from "bun:test"
import { ConnectionSettingsRpc, type Candidate, type Issue } from "@loginom-ai-agent/loginom-host/settings-rpc"
import { connectionSettings } from "../src/connection-settings"

test("the settings RPC emits only the display status, even for a migrated address", async () => {
  const settings = connectionSettings(async () => ({
    revision: 3,
    generation: 2,
    url: "https://legacy:synthetic-password@loginom.example/app/?ticket=synthetic-token#synthetic-fragment",
    username: "analyst",
    folder: "/analyst",
    hasPassword: true,
    state: "ready",
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
      state: "ready",
      failed: false,
    },
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
