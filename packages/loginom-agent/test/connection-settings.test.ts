import { expect, test } from "bun:test"
import { ConnectionSettingsRpc, type Candidate } from "@loginom-ai-agent/loginom-host/settings-rpc"
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

test("Loginom credential rejection and malformed input do not echo secrets", async () => {
  const input = {
    revision: 0,
    url: "https://loginom.example",
    username: "analyst",
    password: { operation: "replace", value: "synthetic-password" },
  } satisfies Candidate
  const settings = connectionSettings(async () => {
    throw new Error("LOGINOM_LOGIN_REJECTED", { cause: input.password.value })
  })
  expect(await settings.check(input, { signal: new AbortController().signal })).toEqual({
    ok: false,
    issue: "credentialsRejected",
  })

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

test.skipIf(process.platform !== "linux")(
  "Linux settings distinguish a missing password store from a failed save",
  async () => {
    const settings = connectionSettings(async (method) => {
      const failure = "LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE"
      if (method !== "connection.status") throw Error(failure)
      return {
        revision: 0,
        generation: 0,
        url: "https://loginom.example/app/",
        username: "analyst",
        folder: "/analyst",
        hasPassword: false,
        state: "recoverable-error",
        failure,
      }
    })
    const expected = { ok: false, issue: "secretServiceUnavailable" } as const
    expect(await settings.status()).toEqual(expected)
    expect(await settings.save({ revision: 0, validationId: "checked" })).toEqual(expected)
  },
)

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
