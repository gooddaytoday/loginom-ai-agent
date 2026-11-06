import { expect, test } from "bun:test"
import { loginomManagement, setupCandidate } from "../../src/cli/loginom-management"
import type { Loginom } from "@opencode-ai/schema/loginom"

const current: Loginom.View = {
  mode: "custom", endpoint: "https://example.test/mcp", hasApiKey: true, server: "custom", help: { state: "ready" }, cloud: { connected: false },
  revision: 4,
  generation: 2,
  url: "http://example.test/app/",
  username: "user",
  folder: "/user",
  hasPassword: true,
  state: "ready",
}

test("stdin setup distinguishes missing secrets, explicit empty password and replacements", () => {
  expect(setupCandidate("{}", current)).toEqual({
    revision: 4,
    url: "http://example.test/app/",
    username: "user",
    password: { operation: "preserve" },
  })
  expect(setupCandidate('{"password":""}', current).password).toEqual({ operation: "empty" })
  expect(setupCandidate('{"password":"new-password"}', current).password).toEqual({
    operation: "replace",
    value: "new-password",
  })
  // Older setup scripts may still send a key; the built-in knowledge key replaced it.
  for (const json of ['{"apiKey":"old-key"}', '{"apiKey":""}'])
    expect(setupCandidate(json, current)).not.toHaveProperty("apiKey")
  expect(() => setupCandidate('{"password":null}', current)).toThrow("CLI_SETUP_INVALID")
  expect(() => setupCandidate('{"folder":"/not-a-setup-field"}', current)).toThrow("CLI_SETUP_INVALID")
  expect(() => setupCandidate("secret-broken-json", current)).toThrow("CLI_SETUP_INVALID")
})

test("stdin setup admits explicit custom credentials while ignoring a legacy key", () => {
  expect(setupCandidate(JSON.stringify({ mode: "custom", endpoint: "https://stand.test/mcp", apiKey: "custom-canary" }), current)).toMatchObject({
    mode: "custom", endpoint: "https://stand.test/mcp", apiKey: { operation: "replace", value: "custom-canary" },
  })
  expect(setupCandidate('{"apiKey":"legacy-canary"}', current)).not.toHaveProperty("apiKey")
  expect(setupCandidate('{"mode":"custom","apiKey":""}', current).apiKey).toEqual({ operation: "empty" })
})

test("cloud setup saves Loginom settings without attempting browser verification before sign-in", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `
    import { loginomManagement } from './src/cli/loginom-management.ts';
    const current = ${JSON.stringify({ ...current, mode: "cloud", hasApiKey: false, server: "primary", help: { state: "connection-required" }, cloud: { connected: false }, state: "connection-required" })};
    const calls = [];
    const result = await loginomManagement({request: async (operation, input) => {
      calls.push({operation, input});
      if (operation === 'connection.check') return {help: current.help, validationId:'one-use', expiresAt: Date.now()+10000, browser:{state:'unknown'}};
      return current;
    }}, 'setup', {stdinJSON:true, acknowledge:false});
    console.log(JSON.stringify({calls,result}));
  `,
    ],
    { cwd: `${import.meta.dir}/../..`, stdin: new Blob(['{"mode":"cloud"}']), stdout: "pipe", stderr: "pipe" },
  )
  const output = new Response(child.stdout).text()
  const errors = new Response(child.stderr).text()
  expect(await child.exited).toBe(0)
  expect(await errors).toBe("")
  const { calls, result } = JSON.parse(await output)
  expect(calls.find((call: { operation: string }) => call.operation === "connection.check")?.input).toMatchObject({
    mode: "cloud",
    verifyBrowser: false,
  })
  expect(calls.filter((call: { operation: string }) => call.operation === "connection.save")).toHaveLength(1)
  expect(result).toMatchObject({ state: "connection-required", help: { state: "connection-required" } })
})

test("connect polls short requests beyond 180 seconds and never waits for the browser launcher", async () => {
  const calls: string[] = []
  const opened: string[] = []
  const clock = { now: 0 }
  const pending: Loginom.View = {
    ...current,
    mode: "cloud",
    server: "primary",
    hasApiKey: false,
    state: "connection-required",
    help: { state: "connection-required" },
    cloud: {
      connected: false,
      pending: { userCode: "SAFE-CODE", verificationUrl: "https://example.test/device", expiresAt: 240_000 },
    },
  }
  const result = await loginomManagement(
    {
      request: async (operation) => {
        calls.push(operation)
        if (operation === "connection.cloud-start" || (clock.now && clock.now < 181_000)) return pending
        if (clock.now)
          return {
            ...pending,
            cloud: { connected: true, email: "user@example.test" },
            help: { state: "ready" },
            state: "ready",
          }
        return { ...pending, cloud: { connected: false } }
      },
    },
    "connect",
    {
      stdinJSON: false,
      acknowledge: false,
      now: () => clock.now,
      wait: async (ms) => {
        clock.now += ms
      },
      openUrl: async (url) => {
        opened.push(url)
        return new Promise(() => {})
      },
    },
  )
  expect(result).toMatchObject({ cloud: { connected: true, email: "user@example.test" } })
  expect(clock.now).toBe(181_000)
  expect(calls).toEqual(["connection.status", "connection.cloud-start", ...Array(181).fill("connection.status")])
  expect(opened).toEqual(["https://example.test/device"])
})

test("disconnect returns safe offline revocation status from the Host", async () => {
  const calls: string[] = []
  const result = await loginomManagement(
    {
      request: async (operation) => {
        calls.push(operation)
        return { ...current, cloud: { connected: false, failure: "LOGINOM_CLOUD_REVOKE_UNCONFIRMED" } }
      },
    },
    "disconnect",
    { stdinJSON: false, acknowledge: false },
  )
  expect(calls).toEqual(["connection.status", "connection.cloud-disconnect"])
  expect(result).toMatchObject({
    mode: "custom",
    hasApiKey: true,
    cloud: { connected: false, failure: "LOGINOM_CLOUD_REVOKE_UNCONFIRMED" },
  })
})

test.each(["LOGINOM_CLOUD_ACCESS_DENIED", "LOGINOM_CLOUD_EXPIRED", "invalid-reply"])(
  "connect clears unfinished sign-in after %s",
  async (failure) => {
    const calls: string[] = []
    const pending = {
      ...current,
      cloud: {
        connected: false,
        pending: { userCode: "SAFE-CODE", verificationUrl: "https://example.test/device", expiresAt: 1000 },
      },
    }
    const clock = { now: 0 }
    await expect(
      loginomManagement(
        {
          request: async (operation) => {
            calls.push(operation)
            if (operation === "connection.cloud-start") return pending
            if (operation === "connection.status" && clock.now)
              return failure === "invalid-reply" ? {} : { ...pending, cloud: { connected: false, failure } }
            return current
          },
        },
        "connect",
        {
          stdinJSON: false,
          acknowledge: false,
          now: () => clock.now,
          wait: async (ms) => {
            clock.now += ms
          },
          openUrl: async () => {
            throw Error("browser unavailable")
          },
        },
      ),
    ).rejects.toThrow(failure === "invalid-reply" ? "LOGINOM_REPLY_INVALID" : failure)
    expect(calls.at(-1)).toBe("connection.cloud-cancel")
  },
)

test("connect expires against the returned deadline even when status remains pending", async () => {
  const calls: string[] = []
  const clock = { now: 0 }
  await expect(
    loginomManagement(
      {
        request: async (operation) => {
          calls.push(operation)
          return {
            ...current,
            cloud: {
              connected: false,
              pending: { userCode: "SAFE-CODE", verificationUrl: "https://example.test/device", expiresAt: 2000 },
            },
          }
        },
      },
      "connect",
      {
        stdinJSON: false,
        acknowledge: false,
        now: () => clock.now,
        wait: async (ms) => {
          clock.now += ms
        },
        openUrl: async () => {},
      },
    ),
  ).rejects.toThrow("LOGINOM_CLOUD_EXPIRED")
  expect(clock.now).toBe(2000)
  expect(calls).toEqual([
    "connection.status",
    "connection.cloud-start",
    "connection.status",
    "connection.status",
    "connection.cloud-cancel",
  ])
})

test("an already connected account never creates another device installation", async () => {
  const calls: string[] = []
  await expect(
    loginomManagement(
      {
        request: async (operation) => {
          calls.push(operation)
          return { ...current, cloud: { connected: true } }
        },
      },
      "connect",
      { stdinJSON: false, acknowledge: false },
    ),
  ).rejects.toThrow("LOGINOM_CLOUD_ALREADY_CONNECTED")
  expect(calls).toEqual(["connection.status"])
})

test.each(["start", "poll", "exchange"])(
  "connect cancels its unfinished device flow during %s without releasing the invocation handler",
  async (phase) => {
    const { withStandaloneCancellation, standaloneCancellation } = await import("../../src/cli/standalone-cancellation")
    const calls: string[] = []
    const listeners = process.listenerCount("SIGINT")
    await withStandaloneCancellation(async () => {
      await expect(
        loginomManagement(
          {
            request: async (operation) => {
              calls.push(operation)
              if (
                (operation === "connection.cloud-start" && phase === "start") ||
                (operation === "connection.status" && calls.length > 2 && phase === "exchange")
              )
                process.emit("SIGINT")
              if (operation === "connection.cloud-cancel") {
                process.emit("SIGINT")
                expect(standaloneCancellation()?.aborted).toBe(true)
                expect(process.listenerCount("SIGINT")).toBe(listeners + 1)
              }
              return {
                ...current,
                cloud: {
                  connected: false,
                  pending: {
                    userCode: "SAFE-CODE",
                    verificationUrl: "https://example.test/device",
                    expiresAt: Date.now() + 60_000,
                  },
                },
              }
            },
          },
          "connect",
          {
            stdinJSON: false,
            acknowledge: false,
            wait: async () => {
              if (phase === "poll") process.emit("SIGINT")
            },
            openUrl: async () => {},
          },
        ),
      ).rejects.toThrow("CLI_CANCELLED")
      expect(calls.at(-1)).toBe("connection.cloud-cancel")
    })
    expect(standaloneCancellation()).toBeUndefined()
    expect(process.listenerCount("SIGINT")).toBe(listeners)
  },
)

test("explicit check retains independent Help and browser results without disabling browser validation", async () => {
  const calls: { operation: string; input: unknown }[] = []
  const result = await loginomManagement(
    {
      request: async (operation, input) => {
        calls.push({ operation, input })
        if (operation === "connection.status") return current
        return {
          help: { state: "connection-required" },
          browser: { state: "verified" },
          validationId: "private-one-use",
          expiresAt: 10_000,
        }
      },
    },
    "check",
    { stdinJSON: false, acknowledge: false },
  )
  expect(calls.map((call) => call.operation)).toEqual(["connection.status", "connection.check"])
  expect(calls[1].input).not.toHaveProperty("verifyBrowser", false)
  expect(result).toEqual({
    ok: true,
    code: "LOGINOM_CONNECTION_VALID",
    help: { state: "connection-required" },
    browser: { state: "verified" },
  })
})

test("pending code and link stay in stderr when automatic browser launch fails", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `
    import {loginomManagement} from './src/cli/loginom-management.ts';
    let tick=0;
    const current=${JSON.stringify(current)};
    const result=await loginomManagement({request:async operation=>{
      if(operation==='connection.cloud-start')return {...current,cloud:{connected:false,pending:{userCode:'SAFE-CODE',verificationUrl:'https://example.test/device',expiresAt:10000}}};
      return {...current,cloud:{connected:tick>0}};
    }},'connect',{stdinJSON:false,acknowledge:false,now:()=>tick,wait:async()=>{tick++},openUrl:async()=>{throw Error('launcher unavailable')}});
    console.log(JSON.stringify(result));
  `,
    ],
    { cwd: `${import.meta.dir}/../..`, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  )
  const output = new Response(child.stdout).text()
  const errors = new Response(child.stderr).text()
  expect(await child.exited).toBe(0)
  const text = await output
  expect(JSON.parse(text)).toMatchObject({ cloud: { connected: true } })
  expect(text.trim().split("\n")).toHaveLength(1)
  expect(text).not.toContain("SAFE-CODE")
  expect(await errors).toBe("Код: SAFE-CODE\nhttps://example.test/device\n")
})
