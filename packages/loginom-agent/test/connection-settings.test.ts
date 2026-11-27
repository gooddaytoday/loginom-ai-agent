import { expect, test } from "bun:test"
import { Definition, type Candidate, type Issue } from "@loginom-ai-agent/loginom-host/settings-rpc"
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
      deviceOnly: false,
    },
  })
})

const input = {
  revision: 0,
  url: "https://loginom.example",
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
    expect(await settings.check(input)).toEqual({ ok: false, issue })
  },
)

test("malformed Loginom settings input does not echo the password", async () => {
  const schema = Definition.methods.check.input["~standard"]
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

test("the settings RPC hides the public address and blocks a check in device mode", async () => {
  let requests = 0
  const settings = connectionSettings(
    async () => {
      requests++
      return {
        revision: 1,
        generation: 1,
        url: "https://app.loginom.ai",
        username: "user",
        folder: "/user",
        hasPassword: true,
        state: "ready",
      }
    },
    () => true,
  )
  expect(await settings.status()).toMatchObject({
    ok: true,
    value: { url: "", state: "unconfigured", deviceOnly: true, hasPassword: false },
  })
  expect(
    await settings.check({
      revision: 1,
      url: "https://app.loginom.ai",
      username: "user",
      password: { operation: "empty" },
    }),
  ).toEqual({ ok: false, issue: "deviceAddress" })
  expect(requests).toBe(1)
})
