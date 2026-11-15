import { expect, spyOn, test } from "bun:test"
import { mkdtemp, open, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createCloudAuth } from "../src/cloud-auth"
import { cloudStore } from "../src/connection/cloud-store"
import { credentials } from "../src/connection/credentials"

function gate<T = void>() {
  return Promise.withResolvers<T>()
}

const pair = {
  installationKey: "site-secret",
  user: { email: "a@example.test" },
  dock: { primary: { apiKey: "p-secret" }, reserve: { apiKey: "r-secret" } },
}

async function fixture(route?: (request: Request) => Response | Promise<Response | undefined> | undefined) {
  const root = await mkdtemp(join(tmpdir(), "cloud-auth-"))
  const store = cloudStore(root, credentials("linux"))
  const calls: { path: string; headers: Headers; body: unknown }[] = []
  let origin = ""
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname
      calls.push({
        path,
        headers: request.headers,
        body:
          request.method === "GET"
            ? undefined
            : await request
                .clone()
                .json()
                .catch(() => undefined),
      })
      const response = await route?.(request)
      if (response) return response
      if (path === "/api/auth/device/code")
        return Response.json({
          device_code: "device-secret",
          user_code: "ABCD-EFGH",
          verification_uri: `${origin}/device`,
          verification_uri_complete: `${origin}/device?user_code=ABCD-EFGH`,
          expires_in: 600,
          interval: 1,
        })
      if (path === "/api/auth/device/token")
        return Response.json({ access_token: "bootstrap-secret", token_type: "Bearer", expires_in: 600 })
      if (path === "/api/agent/connections") return Response.json(pair)
      if (path === "/api/agent/connections/current" && request.method === "DELETE") return new Response(null, { status: 204 })
      return new Response(null, { status: 404 })
    },
  })
  origin = server.url.origin
  return {
    root,
    store,
    calls,
    origin,
    endpoints: { site: origin, primary: `${origin}/primary`, reserve: `${origin}/reserve` },
    async cleanup() {
      server.stop(true)
      await rm(root, { recursive: true, force: true })
    },
  }
}

test("device login returns pending then persists the full pair without bootstrap secrets", async () => {
  const f = await fixture()
  const waiting = gate()
  const persisted = gate()
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    wait: () => waiting.promise,
    changed() {
      if (auth.status().connected) persisted.resolve()
    },
  })
  try {
    await auth.start()
    expect(auth.status()).toEqual({
      connected: false,
      pending: {
        userCode: "ABCD-EFGH",
        verificationUrl: `${f.origin}/device?user_code=ABCD-EFGH`,
        expiresAt: expect.any(Number),
      },
    })
    waiting.resolve()
    await persisted.promise
    expect(await f.store.read()).toEqual({
      kind: "loginom-cloud-v1",
      installationKey: pair.installationKey,
      email: pair.user.email,
      dock: pair.dock,
    })
    expect(auth.status()).toEqual({ connected: true, email: pair.user.email })
    expect(auth.revision()).toBe(1)
    expect(auth.credentials()?.dock).toEqual(pair.dock)
    const publicAndDisk = JSON.stringify(auth.status()) + (await readFile(join(f.root, "cloud.json"), "utf8"))
    expect(publicAndDisk).not.toContain("device-secret")
    expect(publicAndDisk).not.toContain("bootstrap-secret")
    expect(f.calls[0]?.body).toEqual({ client_id: "loginom-ai-agent" })
    expect(f.calls[1]?.body).toEqual({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: "device-secret",
      client_id: "loginom-ai-agent",
    })
    expect(f.calls[2]?.headers.get("authorization")).toBe("Bearer bootstrap-secret")
    expect(f.calls[2]?.headers.get("x-api-key")).toBeNull()
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("device code request aborts a listener that never answers within fifteen seconds", async () => {
  const accepted = gate()
  const f = await fixture(() => {
    accepted.resolve()
    return new Promise<Response>(() => {})
  })
  const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
  try {
    const began = Date.now()
    const start = auth.start()
    await accepted.promise
    await expect(start).rejects.toThrow(/^LOGINOM_CLOUD_UNAVAILABLE$/)
    expect(Date.now() - began).toBeLessThan(17_000)
    expect(auth.status().pending).toBeUndefined()
  } finally {
    await auth.close()
    await f.cleanup()
  }
}, 18_000)

test("poll listener is aborted by remaining device expiry", async () => {
  let origin = ""
  const f = await fixture((request) => {
    if (request.url.endsWith("/device/code"))
      return Response.json({
        device_code: "d",
        user_code: "u",
        verification_uri_complete: `${origin}/device`,
        expires_in: 0.05,
        interval: 0.001,
      })
    if (request.url.endsWith("/device/token")) return new Promise<Response>(() => {})
  })
  origin = f.origin
  const ended = gate()
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    wait: async () => {},
    changed() {
      if (auth.status().failure) ended.resolve()
    },
  })
  try {
    const began = Date.now()
    await auth.start()
    await Promise.race([ended.promise, Bun.sleep(400)])
    expect(auth.status().pending).toBeUndefined()
    expect(Date.now() - began).toBeLessThan(400)
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("authorization_pending waits interval before the next token request", async () => {
  let tokens = 0
  const f = await fixture((request) =>
    request.url.endsWith("/device/token") && ++tokens === 1
      ? Response.json({ error: "authorization_pending" }, { status: 400 })
      : undefined,
  )
  const waits: number[] = []
  const ended = gate()
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    wait: async (ms) => {
      waits.push(ms)
    },
    changed() {
      if (!auth.status().pending) ended.resolve()
    },
  })
  try {
    await auth.start()
    await ended.promise
    expect(auth.status().connected).toBe(true)
    expect(waits).toEqual([1000, 1000])
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("slow_down adds five seconds to subsequent polling intervals", async () => {
  let tokens = 0
  const f = await fixture((request) =>
    request.url.endsWith("/device/token") && ++tokens < 3
      ? Response.json({ error: tokens === 1 ? "slow_down" : "authorization_pending" }, { status: 400 })
      : undefined,
  )
  const waits: number[] = []
  const ended = gate()
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    wait: async (ms) => {
      waits.push(ms)
    },
    changed() {
      if (!auth.status().pending) ended.resolve()
    },
  })
  try {
    await auth.start()
    await ended.promise
    expect(auth.status().connected).toBe(true)
    expect(waits).toEqual([1000, 6000, 6000])
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("access_denied terminates polling with a safe code", async () => {
  const f = await fixture((request) =>
    request.url.endsWith("/device/token")
      ? Response.json({ error: "access_denied", error_description: "server-private-canary" }, { status: 400 })
      : undefined,
  )
  const ended = gate()
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    wait: async () => {},
    changed() {
      if (!auth.status().pending) ended.resolve()
    },
  })
  try {
    await auth.start()
    await ended.promise
    expect(auth.status()).toEqual({ connected: false, failure: "LOGINOM_CLOUD_ACCESS_DENIED" })
    expect(await f.store.read()).toBeUndefined()
    expect(f.calls.filter((x) => x.path.endsWith("/device/token"))).toHaveLength(1)
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("terminal device token HTTP failures stop polling before device expiry", async () => {
  for (const status of [400, 401, 404]) {
    let clock = Date.now()
    const f = await fixture(request => request.url.endsWith("/device/token")
      ? Response.json({ error: "invalid_grant" }, { status }) : undefined)
    const ended = gate()
    const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints,
      now: () => clock, wait: async ms => { clock += ms },
      changed() { if (!auth.status().pending) ended.resolve() },
    })
    try {
      await auth.start()
      await ended.promise
      expect(auth.status()).toEqual({ connected: false, failure: "LOGINOM_CLOUD_UNAVAILABLE" })
      expect(f.calls.filter(call => call.path.endsWith("/device/token"))).toHaveLength(1)
      expect(f.calls.some(call => call.path.endsWith("/connections"))).toBe(false)
    } finally { await auth.close(); await f.cleanup() }
  }
})

test("expired_token terminates polling with expiry status", async () => {
  const f = await fixture((request) =>
    request.url.endsWith("/device/token") ? Response.json({ error: "expired_token" }, { status: 400 }) : undefined,
  )
  const ended = gate()
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    wait: async () => {},
    changed() {
      if (!auth.status().pending) ended.resolve()
    },
  })
  try {
    await auth.start()
    await ended.promise
    expect(auth.status().failure).toBe("LOGINOM_CLOUD_EXPIRED")
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("HTTP429 polling observes Retry-After and the interval", async () => {
  let tokens = 0
  const f = await fixture((request) =>
    request.url.endsWith("/device/token") && ++tokens === 1
      ? Response.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": "7" } })
      : undefined,
  )
  const waits: number[] = []
  const ended = gate()
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    wait: async (ms) => {
      waits.push(ms)
    },
    changed() {
      if (!auth.status().pending) ended.resolve()
    },
  })
  try {
    await auth.start()
    await ended.promise
    expect(auth.status().connected).toBe(true)
    expect(waits).toEqual([1000, 7000])
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("interrupted token response bodies retry within the device polling interval", async () => {
  for (const status of [200, 400]) {
    const f = await fixture()
    const ended = gate()
    const delays: number[] = []
    let tokens = 0
    const auth = await createCloudAuth({
      store: f.store,
      endpoints: f.endpoints,
      wait: async (ms) => { delays.push(ms) },
      fetch(input, init) {
        if (input.endsWith("/device/token") && ++tokens === 1)
          return Promise.resolve(new Response(new ReadableStream({
            start(controller) { controller.error(new TypeError("socket-private-canary")) },
          }), { status }))
        return fetch(input, init)
      },
      changed() { if (!auth.status().pending) ended.resolve() },
    })
    try {
      await auth.start()
      await ended.promise
      expect(auth.status()).toEqual({ connected: true, email: pair.user.email })
      expect(tokens).toBe(2)
      expect(delays).toEqual([1000, 1000])
      expect(await f.store.read()).toMatchObject({ installationKey: pair.installationKey, dock: pair.dock })
    } finally { await auth.close(); await f.cleanup() }
  }
})

test("temporary polling failures wait and cannot extend the original expiry", async () => {
  const f = await fixture((request) =>
    request.url.endsWith("/device/token") ? new Response(null, { status: 503 }) : undefined,
  )
  let clock = 1000
  const waits: number[] = []
  const ended = gate()
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    now: () => clock,
    wait: async (ms) => {
      waits.push(ms)
      clock += ms
    },
    changed() {
      if (!auth.status().pending) ended.resolve()
    },
  })
  try {
    await auth.start()
    await ended.promise
    expect(auth.status().failure).toBe("LOGINOM_CLOUD_EXPIRED")
    expect(waits.length).toBe(600)
    expect(waits.every((ms) => ms === 1000)).toBe(true)
    expect(f.calls.filter((x) => x.path.endsWith("/device/token"))).toHaveLength(599)
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("cancel stops polling and clears pending without a failure", async () => {
  const f = await fixture()
  const entered = gate()
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    wait: (_ms, signal) => {
      entered.resolve()
      return new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(Error("cancelled")), { once: true }),
      )
    },
    changed() {},
  })
  try {
    await auth.start()
    await entered.promise
    await auth.cancel()
    expect(auth.status()).toEqual({ connected: false })
    expect(f.calls.map((x) => x.path)).toEqual(["/api/auth/device/code"])
    expect(await f.store.read()).toBeUndefined()
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("cancel rejects a stale response even when injected fetch ignores abort", async () => {
  const f = await fixture((request) =>
    request.url.endsWith("/revoke-session") ? Response.json({ status: true }) : undefined,
  )
  const accepted = gate()
  const token = gate<Response>()
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    wait: async () => {},
    fetch(input, init) {
      if (input.endsWith("/device/token")) {
        accepted.resolve()
        return token.promise
      }
      return fetch(input, init)
    },
    changed() {},
  })
  try {
    await auth.start()
    await accepted.promise
    const cancellation = auth.cancel()
    token.resolve(Response.json({ access_token: "bootstrap-secret", token_type: "Bearer", expires_in: 600 }))
    await cancellation
    expect(await f.store.read()).toBeUndefined()
    expect(auth.status()).toEqual({ connected: false })
    expect(f.calls.some((x) => x.path === "/api/agent/connections")).toBe(false)
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("cancel prevents a late successful exchange from persisting credentials", async () => {
  const f = await fixture((request) =>
    request.url.endsWith("/revoke-session") ? Response.json({ status: true }) : undefined,
  )
  const accepted = gate()
  const exchange = gate<Response>()
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    wait: async () => {},
    fetch(input, init) {
      if (input.endsWith("/connections")) {
        accepted.resolve()
        return exchange.promise
      }
      return fetch(input, init)
    },
    changed() {},
  })
  try {
    await auth.start()
    await accepted.promise
    const cancellation = auth.cancel()
    exchange.resolve(Response.json(pair))
    await cancellation
    expect(await f.store.read()).toBeUndefined()
    expect(auth.status()).toEqual({ connected: false })
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("cancel revokes the exact received bootstrap session with a bounded authenticated request", async () => {
  const f = await fixture((request) =>
    request.url.endsWith("/revoke-session") ? Response.json({ status: true }) : undefined,
  )
  const accepted = gate()
  const exchange = gate<Response>()
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    wait: async () => {},
    fetch(input, init) {
      if (input.endsWith("/connections")) {
        accepted.resolve()
        return exchange.promise
      }
      return fetch(input, init)
    },
    changed() {},
  })
  try {
    await auth.start()
    await accepted.promise
    const cancellation = auth.cancel()
    exchange.resolve(Response.json(pair))
    await cancellation
    const revoke = f.calls.find((x) => x.path.endsWith("/revoke-session"))
    expect(revoke?.headers.get("authorization")).toBe("Bearer bootstrap-secret")
    expect(revoke?.body).toEqual({ token: "bootstrap-secret" })
    expect(auth.status()).toEqual({ connected: false })
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("unreachable bootstrap cleanup remains bounded and keeps the exchange failure", async () => {
  const f = await fixture((request) =>
    request.url.endsWith("/revoke-session")
      ? new Promise<Response>(() => {})
      : request.url.endsWith("/connections")
        ? new Response("uncertain", { status: 502 })
        : undefined,
  )
  const ended = gate()
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    wait: async () => {},
    changed() {
      if (!auth.status().pending) ended.resolve()
    },
  })
  try {
    const began = Date.now()
    await auth.start()
    await ended.promise
    expect(Date.now() - began).toBeLessThan(6500)
    expect(auth.status().failure).toBe("LOGINOM_CLOUD_UNAVAILABLE")
    expect(await f.store.read()).toBeUndefined()
  } finally {
    await auth.close()
    await f.cleanup()
  }
}, 7000)

test("redirect rejection keeps credentials from a second listener", async () => {
  let reached = 0
  const second = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      reached++
      return Response.json(pair)
    },
  })
  const f = await fixture((request) =>
    request.url.endsWith("/connections")
      ? Response.redirect(second.url.href, 302)
      : request.url.endsWith("/revoke-session")
        ? Response.json({ status: true })
        : undefined,
  )
  const ended = gate()
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    wait: async () => {},
    changed() {
      if (!auth.status().pending) ended.resolve()
    },
  })
  try {
    await auth.start()
    await ended.promise
    expect(reached).toBe(0)
    expect(auth.status().connected).toBe(false)
    expect(await f.store.read()).toBeUndefined()
  } finally {
    await auth.close()
    second.stop(true)
    await f.cleanup()
  }
})

test("a consumed bootstrap session cannot replace the original exchange failure", async () => {
  for (const [response, expected] of [
    [() => new Response("<html>private-canary</html>"), "LOGINOM_CLOUD_PROTOCOL_INVALID"],
    [() => new Response(null, { status: 403 }), "LOGINOM_CLOUD_UNAVAILABLE"],
  ] as const) {
    let sessionActive = true
    const f = await fixture(request => {
      if (request.url.endsWith("/connections")) { sessionActive = false; return response() }
      if (request.url.endsWith("/revoke-session")) {
        expect(sessionActive).toBe(false)
        return new Response(null, { status: 401 })
      }
      return undefined
    })
    const ended = gate()
    const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, wait: async () => {}, changed() {
      if (!auth.status().pending) ended.resolve()
    } })
    try {
      await auth.start()
      await ended.promise
      expect(auth.status()).toEqual({ connected: false, failure: expected })
      expect(await f.store.read()).toBeUndefined()
    } finally { await auth.close(); await f.cleanup() }
  }
})

test("a failed local login write revokes its issued installation after the site consumes the session", async () => {
  let consumed = false
  const f = await fixture(request => {
    if (request.url.endsWith("/connections")) consumed = true
    if (request.url.endsWith("/revoke-session")) return new Response(null, { status: consumed ? 401 : 200 })
    if (request.method === "DELETE") return new Response(null, { status: 204 })
    return undefined
  })
  const ended = gate()
  const auth = await createCloudAuth({
    store: { ...f.store, async write() { throw Error("write-private-canary") } },
    endpoints: f.endpoints,
    wait: async () => {},
    changed() { if (!auth.status().pending) ended.resolve() },
  })
  try {
    await auth.start()
    await ended.promise
    expect(auth.status()).toEqual({ connected: false, failure: "LOGINOM_STORE_WRITE_FAILED" })
    expect(await f.store.read()).toBeUndefined()
    const deleted = f.calls.filter(call => call.path.endsWith("/connections/current"))
    expect(deleted).toHaveLength(1)
    expect(deleted[0]?.headers.get("x-api-key")).toBe(pair.installationKey)
    expect(deleted[0]?.headers.get("authorization")).toBeNull()
  } finally { await auth.close(); await f.cleanup() }
})

test("malformed exchanges never persist a partial pair or expose server data", async () => {
  for (const response of [
    () => Response.json({ ...pair, dock: { primary: pair.dock.primary } }),
    () => new Response("<html>private-canary</html>"),
    () => new Response("{broken-private-canary"),
  ]) {
    const f = await fixture((request) =>
      request.url.endsWith("/connections")
        ? response()
        : request.url.endsWith("/revoke-session")
          ? Response.json({ status: true })
          : undefined,
    )
    const ended = gate()
    const auth = await createCloudAuth({
      store: f.store,
      endpoints: f.endpoints,
      wait: async () => {},
      changed() {
        if (!auth.status().pending) ended.resolve()
      },
    })
    try {
      await auth.start()
      await ended.promise
      expect(auth.status()).toEqual({ connected: false, failure: "LOGINOM_CLOUD_PROTOCOL_INVALID" })
      expect(await f.store.read()).toBeUndefined()
      expect(f.calls.filter((x) => x.path.endsWith("/connections"))).toHaveLength(1)
    } finally {
      await auth.close()
      await f.cleanup()
    }
  }
})

test("verification URLs must have the site origin and contain no credentials", async () => {
  for (const url of [
    "https://foreign.example.test/device",
    "javascript:alert(1)",
    "http://user:password@127.0.0.1/device",
  ]) {
    const f = await fixture((request) =>
      request.url.endsWith("/device/code")
        ? Response.json({
            device_code: "d",
            user_code: "u",
            verification_uri_complete: url,
            expires_in: 600,
            interval: 1,
          })
        : undefined,
    )
    const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
    try {
      await expect(auth.start()).rejects.toThrow(/^LOGINOM_CLOUD_PROTOCOL_INVALID$/)
      expect(auth.status().pending).toBeUndefined()
    } finally {
      await auth.close()
      await f.cleanup()
    }
  }
})

test("repeated start replaces an unfinished attempt and cannot activate its late exchange", async () => {
  const f = await fixture((request) =>
    request.url.endsWith("/revoke-session") ? Response.json({ status: true }) : undefined,
  )
  const firstExchange = gate<Response>()
  const accepted = gate()
  let exchanges = 0
  const ended = gate()
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    wait: async () => {},
    fetch(input, init) {
      if (input.endsWith("/connections") && ++exchanges === 1) {
        accepted.resolve()
        return firstExchange.promise
      }
      return fetch(input, init)
    },
    changed() {
      if (auth.status().connected) ended.resolve()
    },
  })
  try {
    await auth.start()
    await accepted.promise
    const next = auth.start()
    firstExchange.resolve(Response.json({ ...pair, installationKey: "stale-installation" }))
    await next
    await ended.promise
    await Bun.sleep(10)
    expect(auth.credentials()?.installationKey).toBe(pair.installationKey)
    expect(auth.revision()).toBe(1)
    expect((await f.store.read())?.installationKey).toBe(pair.installationKey)
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("connected start refuses before HTTP and preserves the saved credentials", async () => {
  const f = await fixture()
  await f.store.write({
    kind: "loginom-cloud-v1",
    installationKey: pair.installationKey,
    email: pair.user.email,
    dock: pair.dock,
  })
  const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
  try {
    const before = await readFile(join(f.root, "cloud.json"), "utf8")
    await expect(auth.start()).rejects.toThrow(/^LOGINOM_CLOUD_ALREADY_CONNECTED$/)
    expect(f.calls).toHaveLength(0)
    expect(await readFile(join(f.root, "cloud.json"), "utf8")).toBe(before)
    expect(auth.status()).toEqual({ connected: true, email: pair.user.email })
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("disconnect deletes locally, sends only installation auth and permits a new login", async () => {
  const f = await fixture((request) => (request.method === "DELETE" ? new Response(null, { status: 204 }) : undefined))
  await f.store.write({
    kind: "loginom-cloud-v1",
    installationKey: pair.installationKey,
    email: pair.user.email,
    dock: pair.dock,
  })
  const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
  try {
    await auth.disconnect()
    expect(await f.store.read()).toBeUndefined()
    expect(auth.status()).toEqual({ connected: false })
    const logout = f.calls[0]
    expect(logout?.path).toBe("/api/agent/connections/current")
    expect(logout?.headers.get("x-api-key")).toBe(pair.installationKey)
    expect(logout?.headers.get("authorization")).toBeNull()
    await auth.start()
    expect(auth.status().pending).toBeDefined()
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("refresh obtains and persists the pair with installation auth within CallBudget", async () => {
  const fresh = { dock: { primary: { apiKey: "new-primary" }, reserve: { apiKey: "new-reserve" } } }
  const f = await fixture((request) => (request.url.endsWith("/dock-credentials") ? Response.json(fresh) : undefined))
  await f.store.write({
    kind: "loginom-cloud-v1",
    installationKey: pair.installationKey,
    email: pair.user.email,
    dock: pair.dock,
  })
  const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
  try {
    await auth.refresh({ deadline: Date.now() + 1000, signal: new AbortController().signal })
    expect(auth.credentials()?.dock).toEqual(fresh.dock)
    expect((await f.store.read())?.dock).toEqual(fresh.dock)
    expect(auth.revision()).toBe(1)
    expect(f.calls[0]?.path).toBe("/api/agent/dock-credentials")
    expect(f.calls[0]?.headers.get("x-api-key")).toBe(pair.installationKey)
    expect(f.calls[0]?.headers.get("authorization")).toBeNull()
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("generic HTTP failures and invalid refresh payloads preserve saved credentials", async () => {
  for (const response of [
    () => new Response("private-html", { status: 401 }),
    () => new Response("private-html", { status: 403 }),
    () => new Response(null, { status: 429 }),
    () => new Response(null, { status: 503 }),
    () => Response.json({ dock: {} }),
    () => Response.json({ dock: pair.dock }, { status: 403 }),
  ]) {
    const f = await fixture((request) => (request.url.endsWith("/dock-credentials") ? response() : undefined))
    const saved = {
      kind: "loginom-cloud-v1" as const,
      installationKey: pair.installationKey,
      email: pair.user.email,
      dock: pair.dock,
    }
    await f.store.write(saved)
    const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
    try {
      await expect(
        auth.refresh({ deadline: Date.now() + 1000, signal: new AbortController().signal }),
      ).rejects.toThrow()
      expect(auth.credentials()).toEqual(saved)
      expect(await f.store.read()).toEqual(saved)
      expect(auth.revision()).toBe(0)
    } finally {
      await auth.close()
      await f.cleanup()
    }
  }
})

test("only an authenticated structured access_revoked removes credentials durably", async () => {
  const f = await fixture((request) =>
    request.url.endsWith("/dock-credentials")
      ? Response.json({ error: { code: "access_revoked", message: "private-canary" } }, { status: 403 })
      : undefined,
  )
  await f.store.write({
    kind: "loginom-cloud-v1",
    installationKey: pair.installationKey,
    email: pair.user.email,
    dock: pair.dock,
  })
  const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
  try {
    await expect(auth.refresh({ deadline: Date.now() + 1000, signal: new AbortController().signal })).rejects.toThrow(
      /^LOGINOM_CLOUD_CONNECTION_REQUIRED$/,
    )
    expect(auth.credentials()).toBeUndefined()
    expect(await f.store.read()).toBeUndefined()
    expect(auth.status().connected).toBe(false)
    const reopened = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
    expect(reopened.status().connected).toBe(false)
    await reopened.close()
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("a late refresh cannot restore credentials after disconnect", async () => {
  const f = await fixture((request) => (request.method === "DELETE" ? new Response(null, { status: 204 }) : undefined))
  await f.store.write({
    kind: "loginom-cloud-v1",
    installationKey: pair.installationKey,
    email: pair.user.email,
    dock: pair.dock,
  })
  const accepted = gate()
  const response = gate<Response>()
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    fetch(input, init) {
      if (input.endsWith("/dock-credentials")) {
        accepted.resolve()
        return response.promise
      }
      return fetch(input, init)
    },
    changed() {},
  })
  try {
    const refreshing = auth
      .refresh({ deadline: Date.now() + 1000, signal: new AbortController().signal })
      .catch(() => {})
    await accepted.promise
    await auth.disconnect()
    response.resolve(Response.json({ dock: pair.dock }))
    await refreshing
    expect(auth.credentials()).toBeUndefined()
    expect(await f.store.read()).toBeUndefined()
    expect(auth.status().connected).toBe(false)
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("refresh responses from a retired epoch cannot mutate a new login", async () => {
  for (const answer of [
    () => Response.json({ dock: { primary: { apiKey: "stale-primary" }, reserve: { apiKey: "stale-reserve" } } }),
    () => Response.json({ error: { code: "access_revoked", message: "old identity" } }, { status: 403 }),
  ]) {
    const f = await fixture((request) =>
      request.method === "DELETE" ? new Response(null, { status: 204 }) : undefined,
    )
    await f.store.write({
      kind: "loginom-cloud-v1",
      installationKey: "old-site",
      email: pair.user.email,
      dock: pair.dock,
    })
    const accepted = gate()
    const response = gate<Response>()
    const connected = gate()
    const auth = await createCloudAuth({
      store: f.store,
      endpoints: f.endpoints,
      wait: async () => {},
      fetch(input, init) {
        if (input.endsWith("/dock-credentials")) {
          accepted.resolve()
          return response.promise
        }
        return fetch(input, init)
      },
      changed() {
        if (auth.credentials()?.installationKey === pair.installationKey) connected.resolve()
      },
    })
    try {
      const refreshing = auth
        .refresh({ deadline: Date.now() + 1000, signal: new AbortController().signal })
        .catch(() => {})
      await accepted.promise
      await auth.disconnect()
      await auth.start()
      await connected.promise
      response.resolve(answer())
      await refreshing
      expect(auth.credentials()?.installationKey).toBe(pair.installationKey)
      expect(auth.credentials()?.dock).toEqual(pair.dock)
      expect((await f.store.read())?.dock).toEqual(pair.dock)
      expect(auth.revision()).toBe(2)
    } finally {
      await auth.close()
      await f.cleanup()
    }
  }
})

test("a failed refresh write and read-back retain the confirmed credentials until storage recovers", async () => {
  let clock = Date.now()
  let unavailable = false
  const fresh = { primary: { apiKey: "fresh-primary" }, reserve: { apiKey: "fresh-reserve" } }
  const f = await fixture(request => request.url.endsWith("/dock-credentials") ? Response.json({ dock: fresh }) : undefined)
  const previous = { kind: "loginom-cloud-v1" as const, installationKey: pair.installationKey, email: pair.user.email, dock: pair.dock }
  await f.store.write(previous)
  const auth = await createCloudAuth({
    store: {
      ...f.store,
      async read() {
        if (unavailable) throw Error("read-private-canary")
        return f.store.read()
      },
      async write(value) {
        if (unavailable) throw Error("write-private-canary")
        await f.store.write(value)
      },
    },
    endpoints: f.endpoints,
    now: () => clock,
    changed() {},
  })
  const refresh = () => auth.refresh({ deadline: clock + 3000, signal: new AbortController().signal })
  try {
    unavailable = true
    await expect(refresh()).rejects.toThrow("LOGINOM_STORE_WRITE_FAILED")
    expect(auth.credentials()).toEqual(previous)
    expect(auth.status()).toEqual({ connected: true, email: pair.user.email })
    expect(auth.revision()).toBe(0)
    unavailable = false
    expect(await f.store.read()).toEqual(previous)
    clock += 30_000
    await refresh()
    expect(auth.credentials()?.dock).toEqual(fresh)
    expect((await f.store.read())?.dock).toEqual(fresh)
  } finally { await auth.close(); await f.cleanup() }
})

test("post-rename fsync failure reconciles controller revision and status with actual disk", async () => {
  const f = await fixture((request) =>
    request.url.endsWith("/dock-credentials")
      ? Response.json({
          dock: { primary: { apiKey: "fresh-primary-canary" }, reserve: { apiKey: "fresh-reserve-canary" } },
        })
      : undefined,
  )
  await f.store.write({
    kind: "loginom-cloud-v1",
    installationKey: pair.installationKey,
    email: pair.user.email,
    dock: pair.dock,
  })
  const directory = await open(f.root)
  const prototype = Object.getPrototypeOf(directory)
  const sync = prototype.sync
  const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
  const failure = spyOn(prototype, "sync").mockImplementation(async function (this: typeof directory) {
    if ((await this.stat()).isDirectory()) throw Error("fsync-private-canary")
    return sync.call(this)
  })
  try {
    await expect(auth.refresh({ deadline: Date.now() + 1000, signal: new AbortController().signal })).rejects.toThrow(
      /^LOGINOM_STORE_WRITE_FAILED$/,
    )
    expect(auth.credentials()).toEqual(await f.store.read())
    expect(auth.revision()).toBe(1)
    expect(auth.status().connected).toBe(true)
    for (const secret of ["fresh-primary-canary", "fresh-reserve-canary", pair.installationKey, "fsync-private-canary"])
      expect(JSON.stringify(auth.status())).not.toContain(secret)
  } finally {
    failure.mockRestore()
    await directory.close()
    await auth.close()
    await f.cleanup()
  }
})

test("invalid read-back never activates credentials or leaks canaries in status", async () => {
  const f = await fixture((request) =>
    request.url.endsWith("/revoke-session") ? Response.json({ status: true }) : undefined,
  )
  const ended = gate()
  const invalid = cloudStore(f.root, { encode: () => ({ damaged: "disk-private-canary" }), decode: (value) => value })
  const auth = await createCloudAuth({
    store: invalid,
    endpoints: f.endpoints,
    wait: async () => {},
    changed() {
      if (!auth.status().pending) ended.resolve()
    },
  })
  try {
    await auth.start()
    await ended.promise
    expect(auth.credentials()).toBeUndefined()
    expect(await f.store.read()).toBeUndefined()
    expect(auth.revision()).toBe(0)
    expect(auth.status()).toEqual({ connected: false, failure: "LOGINOM_STORE_WRITE_FAILED" })
    for (const secret of [
      "disk-private-canary",
      pair.installationKey,
      pair.dock.primary.apiKey,
      pair.dock.reserve.apiKey,
    ])
      expect(JSON.stringify(auth.status())).not.toContain(secret)
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("disconnect serializes clear after an already started write", async () => {
  const f = await fixture((request) =>
    request.method === "DELETE"
      ? new Response(null, { status: 204 })
      : request.url.endsWith("/dock-credentials")
        ? Response.json({ dock: { primary: { apiKey: "fresh-primary" }, reserve: { apiKey: "fresh-reserve" } } })
        : undefined,
  )
  await f.store.write({
    kind: "loginom-cloud-v1",
    installationKey: pair.installationKey,
    email: pair.user.email,
    dock: pair.dock,
  })
  const writing = gate()
  const release = gate()
  const auth = await createCloudAuth({
    store: {
      ...f.store,
      async write(value) {
        writing.resolve()
        await release.promise
        await f.store.write(value)
      },
    },
    endpoints: f.endpoints,
    changed() {},
  })
  try {
    const refreshing = auth.refresh({ deadline: Date.now() + 1000, signal: new AbortController().signal }).catch((error: Error) => error.message)
    await writing.promise
    const logout = auth.disconnect()
    await Bun.sleep(10)
    release.resolve()
    expect(await refreshing).toBe("LOGINOM_CLOUD_UNAVAILABLE")
    await logout
    expect(await f.store.read()).toBeUndefined()
    expect(auth.credentials()).toBeUndefined()
    expect(auth.status().connected).toBe(false)
  } finally {
    release.resolve()
    await auth.close()
    await f.cleanup()
  }
})

test("offline disconnect finishes locally and reports unconfirmed remote revoke", async () => {
  const accepted = gate<number>()
  const f = await fixture((request) => {
    if (request.method === "DELETE") {
      accepted.resolve(Date.now())
      return new Promise<Response>(() => {})
    }
  })
  await f.store.write({
    kind: "loginom-cloud-v1",
    installationKey: pair.installationKey,
    email: pair.user.email,
    dock: pair.dock,
  })
  const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
  try {
    const disconnecting = auth.disconnect()
    const began = await accepted.promise
    await disconnecting
    expect(Date.now() - began).toBeLessThan(6500)
    expect(auth.status()).toEqual({ connected: false, failure: "LOGINOM_CLOUD_REVOKE_UNCONFIRMED" })
    expect(await f.store.read()).toBeUndefined()
  } finally {
    await auth.close()
    await f.cleanup()
  }
}, 30000)

test("refresh failures expose only safe codes and cannot start without credentials", async () => {
  const f = await fixture((request) =>
    request.url.endsWith("/dock-credentials") ? new Response(null, { status: 429 }) : undefined,
  )
  const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
  try {
    await expect(auth.refresh({ deadline: Date.now() + 1000, signal: new AbortController().signal })).rejects.toThrow(
      /^LOGINOM_CLOUD_CONNECTION_REQUIRED$/,
    )
    expect(f.calls).toHaveLength(0)
  } finally {
    await auth.close()
  }
  await f.store.write({
    kind: "loginom-cloud-v1",
    installationKey: pair.installationKey,
    email: pair.user.email,
    dock: pair.dock,
  })
  const connected = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
  try {
    await expect(
      connected.refresh({ deadline: Date.now() + 1000, signal: new AbortController().signal }),
    ).rejects.toThrow(/^LOGINOM_CLOUD_UNAVAILABLE$/)
  } finally {
    await connected.close()
    await f.cleanup()
  }
})

test("close stops pending polling, preserves credentials and refuses later work", async () => {
  const f = await fixture()
  await f.store.write({
    kind: "loginom-cloud-v1",
    installationKey: pair.installationKey,
    email: pair.user.email,
    dock: pair.dock,
  })
  const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
  try {
    await auth.close()
    await auth.close()
    expect((await f.store.read())?.dock).toEqual(pair.dock)
    await expect(auth.refresh({ deadline: Date.now() + 1000, signal: new AbortController().signal })).rejects.toThrow(
      /^LOGINOM_HOST_CLOSED$/,
    )
    await expect(auth.start()).rejects.toThrow(/^LOGINOM_HOST_CLOSED$/)
    expect(f.calls).toHaveLength(0)
  } finally {
    await f.cleanup()
  }
})

test("an expired CallBudget cannot dispatch refresh and an active budget aborts a hung listener", async () => {
  const f = await fixture((request) =>
    request.url.endsWith("/dock-credentials") ? new Promise<Response>(() => {}) : undefined,
  )
  await f.store.write({
    kind: "loginom-cloud-v1",
    installationKey: pair.installationKey,
    email: pair.user.email,
    dock: pair.dock,
  })
  const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
  try {
    await expect(auth.refresh({ deadline: Date.now() - 100, signal: new AbortController().signal })).rejects.toThrow(
      /^LOGINOM_CLOUD_UNAVAILABLE$/,
    )
    expect(f.calls).toHaveLength(0)
    const began = Date.now()
    await expect(auth.refresh({ deadline: began + 50, signal: new AbortController().signal })).rejects.toThrow(
      /^LOGINOM_CLOUD_UNAVAILABLE$/,
    )
    expect(Date.now() - began).toBeLessThan(400)
    expect(auth.status().connected).toBe(true)
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("close aborts an in-flight refresh listener before its parent deadline", async () => {
  const accepted = gate()
  const f = await fixture((request) => {
    if (request.url.endsWith("/dock-credentials")) {
      accepted.resolve()
      return new Promise<Response>(() => {})
    }
  })
  await f.store.write({
    kind: "loginom-cloud-v1",
    installationKey: pair.installationKey,
    email: pair.user.email,
    dock: pair.dock,
  })
  const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
  try {
    const refreshing = auth
      .refresh({ deadline: Date.now() + 10_000, signal: new AbortController().signal })
      .catch(() => "stopped")
    await accepted.promise
    await auth.close()
    expect(await Promise.race([refreshing, Bun.sleep(200).then(() => "still running")])).toBe("stopped")
    expect((await f.store.read())?.dock).toEqual(pair.dock)
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("invalid device timing is rejected before any polling", async () => {
  for (const timing of [
    { interval: 0, expires_in: 600 },
    { interval: -1, expires_in: 600 },
    { interval: 1, expires_in: 0 },
  ]) {
    let origin = ""
    const f = await fixture((request) =>
      request.url.endsWith("/device/code")
        ? Response.json({ device_code: "d", user_code: "u", verification_uri_complete: `${origin}/device`, ...timing })
        : undefined,
    )
    origin = f.origin
    const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
    try {
      await expect(auth.start()).rejects.toThrow(/^LOGINOM_CLOUD_PROTOCOL_INVALID$/)
      expect(auth.status().pending).toBeUndefined()
    } finally {
      await auth.close()
      await f.cleanup()
    }
  }
})

test("cancel aborts a hung token fetch without retrying an aborted attempt", async () => {
  const accepted = gate()
  const f = await fixture((request) => {
    if (request.url.endsWith("/device/token")) {
      accepted.resolve()
      return new Promise<Response>(() => {})
    }
  })
  const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, wait: async () => {}, changed() {} })
  try {
    await auth.start()
    await accepted.promise
    await auth.cancel()
    expect(auth.status()).toEqual({ connected: false })
    expect(f.calls).toHaveLength(2)
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("cancel after exchange accepts the consumed bootstrap session while retaining installation revoke failures", async () => {
  for (const [status, expected] of [
    [204, { connected: false }],
    [503, { connected: false, failure: "LOGINOM_CLOUD_LOGIN_CLEANUP_UNCONFIRMED" }],
  ] as const) {
    const f = await fixture(request => {
      if (request.url.endsWith("/revoke-session")) return new Response(null, { status: 401 })
      if (request.method === "DELETE") return new Response(null, { status })
      return undefined
    })
    const writing = gate()
    const release = gate()
    const auth = await createCloudAuth({
      store: { ...f.store, async write(value) {
        writing.resolve()
        await release.promise
        await f.store.write(value)
      } },
      endpoints: f.endpoints,
      wait: async () => {},
      changed() {},
    })
    try {
      await auth.start()
      await writing.promise
      const cancellation = auth.cancel()
      release.resolve()
      await cancellation
      expect(auth.status()).toEqual(expected)
      expect(await f.store.read()).toBeUndefined()
      const deletion = f.calls.find(call => call.path.endsWith("/connections/current"))
      const revoke = f.calls.find(call => call.path.endsWith("/revoke-session"))
      expect(deletion?.headers.get("x-api-key")).toBe(pair.installationKey)
      expect(revoke?.headers.get("authorization")).toBe("Bearer bootstrap-secret")
      expect(revoke?.body).toEqual({ token: "bootstrap-secret" })
    } finally { release.resolve(); await auth.close(); await f.cleanup() }
  }
})

test("cancel reports a failed bootstrap cleanup without hiding the revoke result", async () => {
  const f = await fixture()
  const accepted = gate()
  const exchange = gate<Response>()
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    wait: async () => {},
    fetch(input, init) {
      if (input.endsWith("/connections")) {
        accepted.resolve()
        return exchange.promise
      }
      return fetch(input, init)
    },
    changed() {},
  })
  try {
    await auth.start()
    await accepted.promise
    const cancelling = auth.cancel()
    exchange.resolve(Response.json(pair))
    await cancelling
    expect(auth.status()).toEqual({ connected: false, failure: "LOGINOM_CLOUD_LOGIN_CLEANUP_UNCONFIRMED" })
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("close cancels pending polling and an unanswered device-code start", async () => {
  const f = await fixture()
  const waiting = gate()
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    wait: (_ms, signal) => {
      waiting.resolve()
      return new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(Error("cancelled")), { once: true }),
      )
    },
    changed() {},
  })
  try {
    await auth.start()
    await waiting.promise
    await auth.close()
    expect(auth.status().pending).toBeUndefined()
    expect(f.calls).toHaveLength(1)
  } finally {
    await auth.close()
    await f.cleanup()
  }
  const accepted = gate()
  const hung = await fixture(() => {
    accepted.resolve()
    return new Promise<Response>(() => {})
  })
  const starting = await createCloudAuth({ store: hung.store, endpoints: hung.endpoints, changed() {} })
  try {
    const request = starting.start().catch(() => "stopped")
    await accepted.promise
    await starting.close()
    expect(await Promise.race([request, Bun.sleep(200).then(() => "running")])).toBe("stopped")
    expect(starting.status().pending).toBeUndefined()
  } finally {
    await starting.close()
    await hung.cleanup()
  }
})

test("a successful new login clears the previous disconnected failure", async () => {
  const f = await fixture((request) => (request.method === "DELETE" ? new Response(null, { status: 503 }) : undefined))
  await f.store.write({
    kind: "loginom-cloud-v1",
    installationKey: pair.installationKey,
    email: pair.user.email,
    dock: pair.dock,
  })
  const connected = gate()
  let observing = false
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    wait: async () => {},
    changed() {
      if (observing && auth.status().connected) connected.resolve()
    },
  })
  try {
    await auth.disconnect()
    expect(auth.status().failure).toBe("LOGINOM_CLOUD_REVOKE_UNCONFIRMED")
    observing = true
    await auth.start()
    await connected.promise
    expect(auth.status()).toEqual({ connected: true, email: pair.user.email })
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("cancel removes an unfinished login write after it completes and reopening stays disconnected", async () => {
  const f = await fixture((request) =>
    request.url.endsWith("/revoke-session") ? Response.json({ status: true }) : undefined,
  )
  const writing = gate()
  const release = gate()
  const auth = await createCloudAuth({
    store: {
      ...f.store,
      async write(value) {
        writing.resolve()
        await release.promise
        await f.store.write(value)
      },
    },
    endpoints: f.endpoints,
    wait: async () => {},
    changed() {},
  })
  try {
    await auth.start()
    await writing.promise
    const cancelling = auth.cancel()
    release.resolve()
    await cancelling
    expect(await f.store.read()).toBeUndefined()
    expect(auth.credentials()).toBeUndefined()
    const reopened = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
    expect(reopened.status().connected).toBe(false)
    await reopened.close()
  } finally {
    release.resolve()
    await auth.close()
    await f.cleanup()
  }
})

test("failed deletion of a cancelled login is reported without certifying durable cancellation", async () => {
  const f = await fixture((request) =>
    request.url.endsWith("/revoke-session") ? Response.json({ status: true }) : undefined,
  )
  const writing = gate()
  const release = gate()
  const auth = await createCloudAuth({
    store: {
      ...f.store,
      async write(value) {
        writing.resolve()
        await release.promise
        await f.store.write(value)
      },
      async clear() {
        throw Error("delete-private-canary")
      },
    },
    endpoints: f.endpoints,
    wait: async () => {},
    changed() {},
  })
  try {
    await auth.start()
    await writing.promise
    const cancelling = auth.cancel()
    release.resolve()
    await expect(cancelling).rejects.toThrow(/^LOGINOM_STORE_WRITE_FAILED$/)
    expect(auth.status()).toEqual({ connected: false, failure: "LOGINOM_STORE_WRITE_FAILED" })
    expect(await f.store.read()).toBeDefined()
  } finally {
    release.resolve()
    await auth.close().catch(() => {})
    await f.cleanup()
  }
})

test.each([204, 503])("disconnect deletion failure still attempts remote revoke and preserves its storage error: %s", async status => {
  const f = await fixture(request => request.method === "DELETE" ? new Response(null, { status }) : undefined)
  await f.store.write({
    kind: "loginom-cloud-v1",
    installationKey: pair.installationKey,
    email: pair.user.email,
    dock: pair.dock,
  })
  const changes: number[] = []
  const auth = await createCloudAuth({
    store: {
      ...f.store,
      async clear() {
        throw Error("delete-private-canary")
      },
    },
    endpoints: f.endpoints,
    changed() {
      changes.push(auth.revision())
    },
  })
  try {
    await expect(auth.disconnect()).rejects.toThrow(/^LOGINOM_STORE_WRITE_FAILED$/)
    expect(auth.credentials()).toBeUndefined()
    expect(auth.revision()).toBe(1)
    expect(changes).toContain(1)
    expect(auth.status()).toEqual({ connected: false, failure: "LOGINOM_STORE_WRITE_FAILED" })
    expect(await f.store.read()).toBeDefined()
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0]?.path).toBe("/api/agent/connections/current")
    expect(f.calls[0]?.headers.get("x-api-key")).toBe(pair.installationKey)
  } finally {
    await auth.close()
    await f.cleanup()
  }
})

test("late logout failure cannot change a new login status", async () => {
  const f = await fixture()
  await f.store.write({
    kind: "loginom-cloud-v1",
    installationKey: pair.installationKey,
    email: pair.user.email,
    dock: pair.dock,
  })
  const deleting = gate()
  const response = gate<Response>()
  const connected = gate()
  let observing = false
  const auth = await createCloudAuth({
    store: f.store,
    endpoints: f.endpoints,
    wait: async () => {},
    fetch(input, init) {
      if (init.method === "DELETE") {
        deleting.resolve()
        return response.promise
      }
      return fetch(input, init)
    },
    changed() {
      if (observing && auth.status().connected) connected.resolve()
    },
  })
  try {
    const logout = auth.disconnect()
    await deleting.promise
    observing = true
    await auth.start()
    await connected.promise
    response.resolve(new Response(null, { status: 503 }))
    await logout
    expect(auth.status()).toEqual({ connected: true, email: pair.user.email })
  } finally {
    response.resolve(new Response(null, { status: 204 }))
    await auth.close()
    await f.cleanup()
  }
})

test("refresh joins its durable write before the next authenticated revoke demand", async () => {
  const fresh = { primary: { apiKey: "fresh-primary" }, reserve: { apiKey: "fresh-reserve" } }
  let gets = 0
  const f = await fixture(request => request.url.endsWith("/dock-credentials") ? ++gets === 1
    ? Response.json({ dock: fresh })
    : Response.json({ error: { code: "access_revoked", message: "revoked" } }, { status: 403 }) : undefined)
  await f.store.write({ kind: "loginom-cloud-v1", installationKey: pair.installationKey, email: pair.user.email, dock: pair.dock })
  const writing = gate()
  const release = gate()
  let changed = 0
  let completed = 0
  const auth = await createCloudAuth({
    store: { ...f.store, async write(value) { writing.resolve(); await release.promise; await f.store.write(value) } },
    endpoints: f.endpoints, changed() { changed++ },
  })
  try {
    const budget = { deadline: Date.now() + 10_000, signal: new AbortController().signal }
    const first = auth.refresh(budget).then(() => { completed++ })
    await writing.promise
    const second = auth.refresh(budget).then(() => { completed++ })
    await Bun.sleep(20)
    expect(gets).toBe(1)
    expect(completed).toBe(0)
    expect(auth.revision()).toBe(0)
    expect(changed).toBe(0)
    expect(auth.credentials()?.dock).toEqual(pair.dock)
    expect((await f.store.read())?.dock).toEqual(pair.dock)
    release.resolve()
    await Promise.all([first, second])
    expect(auth.revision()).toBe(1)
    expect(changed).toBe(1)
    expect((await f.store.read())?.dock).toEqual(fresh)
    await expect(auth.refresh(budget)).rejects.toThrow("LOGINOM_CLOUD_CONNECTION_REQUIRED")
    expect(gets).toBe(2)
    expect(auth.credentials()).toBeUndefined()
    expect(await f.store.read()).toBeUndefined()
    const reopened = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
    expect(reopened.status().connected).toBe(false)
    await reopened.close()
  } finally { release.resolve(); await auth.close(); await f.cleanup() }
}, 30000)

test("a later cancel or close prevents a replacement login waiting for cleanup", async () => {
  for (const action of ["cancel", "close"] as const) {
    const f = await fixture(request => request.url.endsWith("/revoke-session") ? Response.json({ status: true }) : undefined)
    const writing = gate()
    const release = gate()
    const auth = await createCloudAuth({
      store: { ...f.store, async write(value) {
        writing.resolve()
        await release.promise
        await f.store.write(value)
      } },
      endpoints: f.endpoints,
      wait: async () => {},
      changed() {},
    })
    try {
      await auth.start()
      await writing.promise
      const replacement = auth.start().then(() => undefined, (error: Error) => error.message)
      const stopped = auth[action]()
      release.resolve()
      await stopped
      expect(await replacement).toBe(action === "close" ? "LOGINOM_HOST_CLOSED" : undefined)
      expect(f.calls.filter(call => call.path.endsWith("/device/code"))).toHaveLength(1)
      expect(auth.status()).toEqual({ connected: false })
      expect(await f.store.read()).toBeUndefined()
    } finally {
      release.resolve()
      await auth.close()
      await f.cleanup()
    }
  }
})

test("close joins cancellation of an unfinished login write without dropping its deletion", async () => {
  const f = await fixture((request) =>
    request.url.endsWith("/revoke-session") ? Response.json({ status: true }) : undefined,
  )
  const writing = gate()
  const release = gate()
  const auth = await createCloudAuth({
    store: {
      ...f.store,
      async write(value) {
        writing.resolve()
        await release.promise
        await f.store.write(value)
      },
    },
    endpoints: f.endpoints,
    wait: async () => {},
    changed() {},
  })
  try {
    await auth.start()
    await writing.promise
    const cancelling = auth.cancel()
    const closing = auth.close()
    release.resolve()
    await Promise.all([cancelling, closing])
    expect(auth.status().connected).toBe(false)
    expect(auth.credentials()).toBeUndefined()
    expect(await f.store.read()).toBeUndefined()
    const reopened = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
    try {
      expect(reopened.status().connected).toBe(false)
    } finally {
      await reopened.close()
    }
  } finally {
    release.resolve()
    await auth.close()
    await f.cleanup()
  }
})

test("failed new login cannot reactivate the old record left by a failed disconnect", async () => {
  const f = await fixture((request) =>
    request.url.endsWith("/revoke-session") ? Response.json({ status: true }) : undefined,
  )
  const original = {
    kind: "loginom-cloud-v1" as const,
    installationKey: "disabled-installation",
    email: "old@example.test",
    dock: pair.dock,
  }
  await f.store.write(original)
  const ended = gate()
  let observing = false
  const auth = await createCloudAuth({
    store: {
      ...f.store,
      async write() {
        throw Error("write-before-rename-private-canary")
      },
      async clear() {
        throw Error("clear-private-canary")
      },
    },
    endpoints: f.endpoints,
    wait: async () => {},
    changed() {
      if (observing && !auth.status().pending) ended.resolve()
    },
  })
  try {
    await expect(auth.disconnect()).rejects.toThrow(/^LOGINOM_STORE_WRITE_FAILED$/)
    observing = true
    await auth.start()
    await ended.promise
    expect(auth.credentials()).toBeUndefined()
    expect(auth.status()).toEqual({ connected: false, failure: "LOGINOM_STORE_WRITE_FAILED" })
    expect(auth.revision()).toBe(1)
    expect(await f.store.read()).toEqual(original)
  } finally {
    await auth.close().catch(() => {})
    await f.cleanup()
  }
})

test("a new login record committed before fsync failure still reconciles after failed old deletion", async () => {
  const f = await fixture((request) =>
    request.url.endsWith("/revoke-session") ? Response.json({ status: true })
      : request.url.endsWith("/dock-credentials") ? new Response(null, { status: 503 }) : undefined,
  )
  await f.store.write({
    kind: "loginom-cloud-v1",
    installationKey: "disabled-installation",
    email: "old@example.test",
    dock: { primary: { apiKey: "old-primary" }, reserve: { apiKey: "old-reserve" } },
  })
  const directory = await open(f.root)
  const prototype = Object.getPrototypeOf(directory)
  const sync = prototype.sync
  const ended = gate()
  let observing = false
  const auth = await createCloudAuth({
    store: {
      ...f.store,
      async clear() {
        throw Error("clear-private-canary")
      },
    },
    endpoints: f.endpoints,
    wait: async () => {},
    changed() {
      if (observing && !auth.status().pending) ended.resolve()
    },
  })
  const failure = spyOn(prototype, "sync").mockImplementation(async function (this: typeof directory) {
    if ((await this.stat()).isDirectory()) throw Error("directory-fsync-private-canary")
    return sync.call(this)
  })
  try {
    const budget = { deadline: Date.now() + 5000, signal: new AbortController().signal }
    await expect(auth.refresh(budget)).rejects.toThrow("LOGINOM_CLOUD_UNAVAILABLE")
    expect(f.calls.filter(call => call.path.endsWith("/dock-credentials"))).toHaveLength(1)
    await expect(auth.disconnect()).rejects.toThrow(/^LOGINOM_STORE_WRITE_FAILED$/)
    observing = true
    await auth.start()
    await ended.promise
    expect(auth.credentials()).toEqual(await f.store.read())
    expect(auth.credentials()?.installationKey).toBe(pair.installationKey)
    expect(auth.status()).toEqual({ connected: true, email: pair.user.email, failure: "LOGINOM_STORE_WRITE_FAILED" })
    expect(auth.revision()).toBe(2)
    await expect(auth.refresh(budget)).rejects.toThrow("LOGINOM_CLOUD_UNAVAILABLE")
    expect(f.calls.filter(call => call.path.endsWith("/dock-credentials"))).toHaveLength(2)
  } finally {
    failure.mockRestore()
    await directory.close()
    await auth.close()
    await f.cleanup()
  }
})

test("concurrent refresh waiters share one real HTTP GET", async () => {
  const f = await fixture(request => request.url.endsWith("/dock-credentials")
    ? Response.json({ dock: { primary: { apiKey: "new-primary" }, reserve: { apiKey: "new-reserve" } } }) : undefined)
  await f.store.write({ kind: "loginom-cloud-v1", installationKey: pair.installationKey, email: pair.user.email, dock: pair.dock })
  const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
  try {
    const budget = { deadline: Date.now() + 3000, signal: new AbortController().signal }
    await Promise.all([auth.refresh(budget), auth.refresh(budget)])
    expect(f.calls.filter(call => call.path.endsWith("/dock-credentials"))).toHaveLength(1)
    expect(auth.credentials()?.dock.primary.apiKey).toBe("new-primary")
  } finally { await auth.close(); await f.cleanup() }
}, 30000)

test("a failed refresh write suppresses GET until the demand-only cooldown expires", async () => {
  let clock = Date.now()
  let writable = false
  const fresh = { primary: { apiKey: "new-primary" }, reserve: { apiKey: "new-reserve" } }
  const f = await fixture(request => request.url.endsWith("/dock-credentials") ? Response.json({ dock: fresh }) : undefined)
  await f.store.write({ kind: "loginom-cloud-v1", installationKey: pair.installationKey, email: pair.user.email, dock: pair.dock })
  const auth = await createCloudAuth({
    store: { ...f.store, async write(value) {
      if (!writable) throw Error("write-private-canary")
      await f.store.write(value)
    } },
    endpoints: f.endpoints,
    now: () => clock,
    changed() {},
  })
  const refresh = () => auth.refresh({ deadline: clock + 3000, signal: new AbortController().signal })
  try {
    await expect(refresh()).rejects.toThrow("LOGINOM_STORE_WRITE_FAILED")
    expect(auth.credentials()?.dock).toEqual(pair.dock)
    expect(auth.revision()).toBe(0)
    writable = true
    await expect(refresh()).rejects.toThrow("LOGINOM_CLOUD_UNAVAILABLE")
    clock += 29_999
    await expect(refresh()).rejects.toThrow("LOGINOM_CLOUD_UNAVAILABLE")
    expect(f.calls).toHaveLength(1)
    clock += 1
    await refresh()
    expect(f.calls).toHaveLength(2)
    expect(auth.credentials()?.dock).toEqual(fresh)
    expect((await f.store.read())?.dock).toEqual(fresh)
  } finally { await auth.close(); await f.cleanup() }
})

test("unchanged refresh pair has a demand-only thirty second cooldown", async () => {
  let clock = Date.now()
  const f = await fixture(request => request.url.endsWith("/dock-credentials") ? Response.json({ dock: pair.dock }) : undefined)
  await f.store.write({ kind: "loginom-cloud-v1", installationKey: pair.installationKey, email: pair.user.email, dock: pair.dock })
  const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, now: () => clock, changed() {} })
  const refresh = () => auth.refresh({ deadline: clock + 3000, signal: new AbortController().signal })
  try {
    await refresh()
    await expect(refresh()).rejects.toThrow("LOGINOM_CLOUD_UNAVAILABLE")
    clock += 29_999
    await expect(refresh()).rejects.toThrow("LOGINOM_CLOUD_UNAVAILABLE")
    expect(f.calls).toHaveLength(1)
    clock += 1
    expect(f.calls).toHaveLength(1)
    await refresh()
    expect(f.calls).toHaveLength(2)
    expect(auth.revision()).toBe(0)
    expect(auth.credentials()?.dock).toEqual(pair.dock)
  } finally { await auth.close(); await f.cleanup() }
}, 30000)

for (const [name, response] of [["incomplete", () => Response.json({ dock: {} })], ["unavailable", () => new Response(null, { status: 503 })]] as const) {
  test(`refresh ${name} failure keeps credentials and suppresses GET until cooldown expires`, async () => {
    let clock = Date.now()
    let recovered = false
    const fresh = { primary: { apiKey: "new-primary" }, reserve: { apiKey: "new-reserve" } }
    const f = await fixture(request => request.url.endsWith("/dock-credentials") ? recovered ? Response.json({ dock: fresh }) : response() : undefined)
    await f.store.write({ kind: "loginom-cloud-v1", installationKey: pair.installationKey, email: pair.user.email, dock: pair.dock })
    const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, now: () => clock, changed() {} })
    const refresh = () => auth.refresh({ deadline: clock + 3000, signal: new AbortController().signal })
    try {
      await expect(refresh()).rejects.toThrow()
      recovered = true
      await expect(refresh()).rejects.toThrow("LOGINOM_CLOUD_UNAVAILABLE")
      expect(f.calls).toHaveLength(1)
      expect(auth.credentials()?.dock).toEqual(pair.dock)
      clock += 30_000
      await refresh()
      expect(auth.credentials()?.dock).toEqual(fresh)
      await refresh()
      expect(f.calls).toHaveLength(3)
    } finally { await auth.close(); await f.cleanup() }
  }, 30000)
}

test("refresh Retry-After extends cooldown without scheduling background GET", async () => {
  let clock = Date.now()
  const f = await fixture(request => request.url.endsWith("/dock-credentials") ? new Response(null, { status: 429, headers: { "retry-after": "60" } }) : undefined)
  await f.store.write({ kind: "loginom-cloud-v1", installationKey: pair.installationKey, email: pair.user.email, dock: pair.dock })
  const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, now: () => clock, changed() {} })
  const refresh = () => auth.refresh({ deadline: clock + 3000, signal: new AbortController().signal })
  try {
    await expect(refresh()).rejects.toThrow()
    clock += 30_000
    await expect(refresh()).rejects.toThrow()
    expect(f.calls).toHaveLength(1)
    clock += 29_999
    await expect(refresh()).rejects.toThrow()
    expect(f.calls).toHaveLength(1)
    clock += 1
    expect(f.calls).toHaveLength(1)
    await expect(refresh()).rejects.toThrow()
    expect(f.calls).toHaveLength(2)
  } finally { await auth.close(); await f.cleanup() }
}, 30000)

test("cancelling one refresh waiter preserves the shared GET for another", async () => {
  const entered = gate()
  const release = gate()
  const f = await fixture(async request => {
    if (!request.url.endsWith("/dock-credentials")) return undefined
    entered.resolve(); await release.promise
    return Response.json({ dock: { primary: { apiKey: "new-primary" }, reserve: { apiKey: "new-reserve" } } })
  })
  await f.store.write({ kind: "loginom-cloud-v1", installationKey: pair.installationKey, email: pair.user.email, dock: pair.dock })
  const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
  const controller = new AbortController()
  try {
    const first = auth.refresh({ deadline: Date.now() + 3000, signal: controller.signal })
    void first.catch(() => {})
    await entered.promise
    const other = auth.refresh({ deadline: Date.now() + 3000, signal: new AbortController().signal })
    void other.catch(() => {})
    controller.abort(Error("WAITER_CANCELLED"))
    await expect(first).rejects.toThrow("WAITER_CANCELLED")
    release.resolve()
    await other
    expect(f.calls).toHaveLength(1)
    expect(auth.credentials()?.dock.primary.apiKey).toBe("new-primary")
  } finally { release.resolve(); await auth.close(); await f.cleanup() }
}, 30000)

test("later refresh waiters cannot extend the first operation deadline", async () => {
  const entered = gate()
  const release = gate()
  const f = await fixture(async request => {
    if (!request.url.endsWith("/dock-credentials")) return undefined
    entered.resolve(); await release.promise; return Response.json({ dock: pair.dock })
  })
  await f.store.write({ kind: "loginom-cloud-v1", installationKey: pair.installationKey, email: pair.user.email, dock: pair.dock })
  const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
  try {
    const started = Date.now()
    const first = auth.refresh({ deadline: started + 600, signal: new AbortController().signal })
    void first.catch(() => {})
    await entered.promise
    const other = auth.refresh({ deadline: started + 3000, signal: new AbortController().signal })
    void other.catch(() => {})
    await expect(first).rejects.toThrow("LOGINOM_CLOUD_UNAVAILABLE")
    await expect(other).rejects.toThrow("LOGINOM_CLOUD_UNAVAILABLE")
    expect(Date.now() - started).toBeLessThan(1200)
    expect(f.calls).toHaveLength(1)
    expect(auth.credentials()?.dock).toEqual(pair.dock)
  } finally { release.resolve(); await auth.close(); await f.cleanup() }
}, 30000)

test("a shorter refresh waiter deadline does not stop another owner", async () => {
  const entered = gate()
  const release = gate()
  const f = await fixture(async request => {
    if (!request.url.endsWith("/dock-credentials")) return undefined
    entered.resolve(); await release.promise; return Response.json({ dock: { primary: { apiKey: "new-primary" }, reserve: { apiKey: "new-reserve" } } })
  })
  await f.store.write({ kind: "loginom-cloud-v1", installationKey: pair.installationKey, email: pair.user.email, dock: pair.dock })
  const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
  try {
    const other = auth.refresh({ deadline: Date.now() + 3000, signal: new AbortController().signal })
    void other.catch(() => {})
    await entered.promise
    const started = Date.now()
    await expect(auth.refresh({ deadline: started + 200, signal: new AbortController().signal })).rejects.toThrow("LOGINOM_CLOUD_UNAVAILABLE")
    expect(Date.now() - started).toBeLessThan(700)
    release.resolve(); await other
    expect(f.calls).toHaveLength(1)
    expect(auth.credentials()?.dock.primary.apiKey).toBe("new-primary")
  } finally { release.resolve(); await auth.close(); await f.cleanup() }
}, 30000)

test("logout disables in-memory cloud credentials before yielding to cleanup", async () => {
  const f = await fixture(request => request.method === "DELETE" ? new Response(null, { status: 204 }) : undefined)
  await f.store.write({ kind: "loginom-cloud-v1", installationKey: pair.installationKey, email: pair.user.email, dock: pair.dock })
  const auth = await createCloudAuth({ store: f.store, endpoints: f.endpoints, changed() {} })
  try {
    const logout = auth.disconnect()
    expect(auth.status().connected).toBe(false)
    expect(auth.credentials()).toBeUndefined()
    await logout
    expect(await f.store.read()).toBeUndefined()
  } finally { await auth.close(); await f.cleanup() }
}, 30000)

test("logout cancels every refresh waiter even while its durable write is pending", async () => {
  const f = await fixture(request => request.method === "DELETE" ? new Response(null, { status: 204 })
    : request.url.endsWith("/dock-credentials") ? Response.json({ dock: { primary: { apiKey: "fresh-primary" }, reserve: { apiKey: "fresh-reserve" } } }) : undefined)
  await f.store.write({ kind: "loginom-cloud-v1", installationKey: pair.installationKey, email: pair.user.email, dock: pair.dock })
  const writing = gate()
  const release = gate()
  const auth = await createCloudAuth({ store: { ...f.store, async write(value) { writing.resolve(); await release.promise; await f.store.write(value) } }, endpoints: f.endpoints, changed() {} })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const budget = { deadline: Date.now() + 3000, signal: new AbortController().signal }
    const first = auth.refresh(budget)
    void first.catch(() => {})
    await writing.promise
    const second = auth.refresh(budget)
    void second.catch(() => {})
    const logout = auth.disconnect()
    await expect(Promise.race([Promise.all([first, second]), new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error("LOGOUT_WAITERS_PENDING")), 600)
    })])).rejects.toThrow("LOGINOM_CLOUD_UNAVAILABLE")
    release.resolve(); await logout
    expect(await f.store.read()).toBeUndefined()
    expect(auth.credentials()).toBeUndefined()
  } finally { clearTimeout(timer); release.resolve(); await auth.close(); await f.cleanup() }
}, 30000)
