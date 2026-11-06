import { Loginom } from "@opencode-ai/schema/loginom"
import { Option, Schema } from "effect"
import { hostError } from "./errors"
import { cloudStore, type CloudCredentials } from "./connection/cloud-store"

export type CloudEndpoints = { site: string; primary: string; reserve: string }
export type CallBudget = { deadline: number; signal: AbortSignal }
export type CloudAuth = {
  status(): Loginom.CloudStatus
  credentials(): CloudCredentials | undefined
  revision(): number
  start(): Promise<void>
  cancel(): Promise<void>
  refresh(input: CallBudget): Promise<void>
  disconnect(): Promise<void>
  close(): Promise<void>
}
export type CloudAuthOptions = {
  store: ReturnType<typeof cloudStore>
  endpoints: CloudEndpoints
  changed(): void
  fetch?: (input: string, init: RequestInit) => Promise<Response>
  now?: () => number
  wait?: (ms: number, signal: AbortSignal) => Promise<void>
}
const text = Schema.String.check(Schema.isNonEmpty())
const Device = Schema.Struct({
  device_code: text,
  user_code: text,
  verification_uri_complete: text,
  expires_in: Schema.Number.check(Schema.isGreaterThan(0)),
  interval: Schema.Number.check(Schema.isGreaterThan(0)),
})
const Token = Schema.Struct({ access_token: text, token_type: Schema.Literal("Bearer"), expires_in: Schema.Number })
const Connection = Schema.Struct({
  installationKey: text,
  user: Schema.Struct({ email: text }),
  dock: Schema.Struct({ primary: Schema.Struct({ apiKey: text }), reserve: Schema.Struct({ apiKey: text }) }),
})

export async function createCloudAuth(options: CloudAuthOptions): Promise<CloudAuth> {
  const now = options.now ?? Date.now
  const request = options.fetch ?? fetch
  const wait =
    options.wait ??
    ((ms: number, signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer)
          reject(Error("LOGINOM_CLOUD_UNAVAILABLE"))
        }
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", abort)
          resolve()
        }, ms)
        signal.addEventListener("abort", abort, { once: true })
      }))
  let refreshing: { promise: Promise<void>; controller: AbortController; deadline: number } | undefined
  let cooldown = 0
  let writes = Promise.resolve()
  function enqueueWrite(operation: () => Promise<void>) {
    const result = writes.then(operation)
    writes = result.catch(() => {})
    return result
  }
  let cancelling: Promise<void> | undefined
  let closing: Promise<void> | undefined
  let epoch = 0
  let saved = await options.store.read()
  let revision = 0
  let pending: Loginom.CloudStatus["pending"]
  let failure: string | undefined
  let loginWrite: number | undefined
  let login: AbortController | undefined
  let polling: Promise<void> | undefined
  function status(): Loginom.CloudStatus {
    return {
      connected: !!saved,
      ...(saved ? { email: saved.email } : {}),
      ...(pending ? { pending: { ...pending } } : {}),
      ...(failure ? { failure } : {}),
    }
  }
  async function json<A>(
    path: string,
    body: unknown,
    schema: Schema.Decoder<A, never>,
    signal: AbortSignal,
    headers?: Record<string, string>,
    deadline = now() + 15_000,
    method = "POST",
  ) {
    if (signal.aborted || deadline <= now()) throw Error("LOGINOM_CLOUD_UNAVAILABLE")
    const response = await request(new URL(path, options.endpoints.site).href, {
      method,
      redirect: "error",
      headers: { "content-type": "application/json", ...headers },
      body: method === "GET" ? undefined : JSON.stringify(body),
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(Math.max(1, Math.ceil(Math.min(15_000, deadline - now())))),
      ]),
    }).catch(() => {
      throw Error("LOGINOM_CLOUD_UNAVAILABLE")
    })
    if (response.status >= 500) throw Error("LOGINOM_CLOUD_UNAVAILABLE")
    if (response.status === 429) {
      const header = response.headers.get("retry-after") ?? ""
      const delay = /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Math.max(0, Date.parse(header) - now())
      throw Object.assign(Error("rate_limited"), { retryAfter: Number.isFinite(delay) ? delay : 0 })
    }
    const parsed: unknown = await response.json().catch(() => undefined)
    if (
      parsed &&
      typeof parsed === "object" &&
      "error" in parsed &&
      ["authorization_pending", "slow_down"].includes(String(parsed.error))
    )
      throw Error(String(parsed.error))
    if (parsed && typeof parsed === "object" && "error" in parsed && parsed.error === "access_denied")
      throw Error("LOGINOM_CLOUD_ACCESS_DENIED")
    if (parsed && typeof parsed === "object" && "error" in parsed && parsed.error === "expired_token")
      throw Error("LOGINOM_CLOUD_EXPIRED")
    if (
      path === "/api/agent/dock-credentials" &&
      headers?.["X-API-Key"] &&
      Option.isSome(
        Schema.decodeUnknownOption(
          Schema.Struct({ error: Schema.Struct({ code: Schema.Literal("access_revoked"), message: Schema.String }) }),
        )(parsed),
      )
    )
      throw Error("access_revoked")
    if (!response.ok) throw Error("LOGINOM_CLOUD_UNAVAILABLE")
    const result = Schema.decodeUnknownOption(schema)(parsed)
    if (Option.isNone(result)) throw Error("LOGINOM_CLOUD_PROTOCOL_INVALID")
    return result.value
  }
  async function persist(record: CloudCredentials, attempt: number) {
    if (attempt !== epoch) return
    await enqueueWrite(async () => {
      if (attempt !== epoch) return
      try {
        await options.store.write(record)
      } catch {
        const actual = await options.store.read().catch(() => undefined)
        if (attempt !== epoch) throw Error("LOGINOM_STORE_WRITE_FAILED")
        // Failed logout can leave an old record that is intentionally disabled.
        if (
          (saved !== undefined || JSON.stringify(actual) === JSON.stringify(record)) &&
          JSON.stringify(actual) !== JSON.stringify(saved)
        ) {
          saved = actual
          cooldown = 0
          revision++
        }
        options.changed()
        throw Error("LOGINOM_STORE_WRITE_FAILED")
      }
      if (attempt !== epoch) return
      saved = record
      cooldown = 0
      revision++
    })
  }
  async function clear() {
    await enqueueWrite(() => options.store.clear()).catch(() => {
      failure = "LOGINOM_STORE_WRITE_FAILED"
      options.changed()
      throw Error("LOGINOM_STORE_WRITE_FAILED")
    })
  }
  function cancel() {
    // A second cancel joins the pending deletion instead of invalidating its owner.
    cancelling ??= (async () => {
      const discard = !saved && loginWrite === epoch
      const cancellation = ++epoch
      login?.abort()
      refreshing?.controller.abort(Error("LOGINOM_CLOUD_UNAVAILABLE"))
      refreshing = undefined
      await polling
      if (cancellation !== epoch) return
      pending = undefined
      if (discard) await clear()
      if (failure !== "LOGINOM_CLOUD_REVOKE_UNCONFIRMED" && failure !== "LOGINOM_STORE_WRITE_FAILED")
        failure = undefined
      options.changed()
    })().finally(() => {
      cancelling = undefined
    })
    return cancelling
  }
  async function waitRefresh(flight: NonNullable<typeof refreshing>, input: CallBudget) {
    const signal = AbortSignal.any([input.signal, flight.controller.signal])
    signal.throwIfAborted()
    let timer: ReturnType<typeof setTimeout> | undefined
    let abort: (() => void) | undefined
    try {
      await Promise.race([flight.promise, new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason)
        signal.addEventListener("abort", abort, { once: true })
        timer = setTimeout(() => reject(Error("LOGINOM_CLOUD_UNAVAILABLE")), Math.max(0, Math.min(input.deadline, flight.deadline) - now()))
      })])
    } finally {
      clearTimeout(timer)
      if (abort) signal.removeEventListener("abort", abort)
    }
  }

  return {
    status,
    cancel,
    credentials: () => saved,
    revision: () => revision,
    async start() {
      if (closing) throw Error("LOGINOM_HOST_CLOSED")
      if (saved) throw Error("LOGINOM_CLOUD_ALREADY_CONNECTED")
      if (login) await cancel()
      const attempt = ++epoch
      const controller = new AbortController()
      login = controller
      const device = await json(
        "/api/auth/device/code",
        { client_id: "loginom-ai-agent" },
        Device,
        controller.signal,
      ).catch((error: unknown) => {
        throw safeError(error)
      })
      if (attempt !== epoch) return
      if (!URL.canParse(device.verification_uri_complete)) throw Error("LOGINOM_CLOUD_PROTOCOL_INVALID")
      const verification = new URL(device.verification_uri_complete)
      if (
        !["http:", "https:"].includes(verification.protocol) ||
        verification.origin !== new URL(options.endpoints.site).origin ||
        verification.username ||
        verification.password
      )
        throw Error("LOGINOM_CLOUD_PROTOCOL_INVALID")
      const expiresAt = now() + device.expires_in * 1000
      pending = { userCode: device.user_code, verificationUrl: device.verification_uri_complete, expiresAt }
      options.changed()
      polling = (async () => {
        let interval = device.interval * 1000
        async function pollToken(delay = interval): Promise<typeof Token.Type> {
          if (controller.signal.aborted) throw Error("LOGINOM_CLOUD_UNAVAILABLE")
          if (now() >= expiresAt) throw Error("LOGINOM_CLOUD_EXPIRED")
          await wait(Math.min(delay, expiresAt - now()), controller.signal)
          if (now() >= expiresAt) throw Error("LOGINOM_CLOUD_EXPIRED")
          return json(
            "/api/auth/device/token",
            {
              grant_type: "urn:ietf:params:oauth:grant-type:device_code",
              device_code: device.device_code,
              client_id: "loginom-ai-agent",
            },
            Token,
            controller.signal,
            undefined,
            expiresAt,
          ).catch((error: unknown) => {
            if (error instanceof Error && "retryAfter" in error && typeof error.retryAfter === "number")
              return pollToken(Math.max(interval, error.retryAfter))
            if (error instanceof Error && error.message === "slow_down") {
              interval += 5000
              return pollToken()
            }
            if (
              error instanceof Error &&
              ["authorization_pending", "LOGINOM_CLOUD_UNAVAILABLE"].includes(error.message)
            )
              return pollToken()
            throw error
          })
        }
        const token = await pollToken()
        let exchanged = false
        try {
          const value = await json(
            "/api/agent/connections",
            {},
            Connection,
            controller.signal,
            { Authorization: `Bearer ${token.access_token}` },
            expiresAt,
          )
          if (controller.signal.aborted || attempt !== epoch) return
          const record: CloudCredentials = {
            kind: "loginom-cloud-v1",
            installationKey: value.installationKey,
            email: value.user.email,
            dock: value.dock,
          }
          loginWrite = attempt
          await persist(record, attempt)
          if (attempt !== epoch) return
          pending = undefined
          failure = undefined
          exchanged = true
          options.changed()
        } finally {
          if (!exchanged)
            await json(
              "/api/auth/revoke-session",
              { token: token.access_token },
              Schema.Struct({ status: Schema.Literal(true) }),
              new AbortController().signal,
              { Authorization: `Bearer ${token.access_token}` },
              now() + 5000,
            ).catch(() => {
              if (login === controller) failure = "LOGINOM_CLOUD_REVOKE_UNCONFIRMED"
              throw Error("LOGINOM_CLOUD_REVOKE_UNCONFIRMED")
            })
        }
      })().catch((error: unknown) => {
        if (attempt !== epoch) return
        pending = undefined
        failure = hostError(error) === "LOGINOM_HOST_REQUEST_FAILED" ? "LOGINOM_CLOUD_UNAVAILABLE" : hostError(error)
        options.changed()
      })
    },
    async refresh(input: CallBudget) {
      input.signal.throwIfAborted()
      if (closing) throw Error("LOGINOM_HOST_CLOSED")
      if (!saved) throw Error("LOGINOM_CLOUD_CONNECTION_REQUIRED")
      if (input.deadline <= now() || now() < cooldown) throw Error("LOGINOM_CLOUD_UNAVAILABLE")
      if (refreshing) return waitRefresh(refreshing, input)
      const attempt = epoch
      const previous = saved
      const controller = new AbortController()
      const operation = (async () => {
        const value = await json(
          "/api/agent/dock-credentials",
          undefined,
          Schema.Struct({ dock: Connection.fields.dock }),
          controller.signal,
          { "X-API-Key": previous.installationKey },
          input.deadline,
          "GET",
        ).catch(async (error: unknown) => {
          if (error instanceof Error && error.message === "access_revoked" && attempt === epoch && saved?.installationKey === previous.installationKey) {
            epoch++
            saved = undefined
            revision++
            await clear()
            options.changed()
            throw Error("LOGINOM_CLOUD_CONNECTION_REQUIRED")
          }
          if (attempt === epoch) cooldown = now() + Math.max(30_000,
            error instanceof Error && "retryAfter" in error && typeof error.retryAfter === "number" ? error.retryAfter : 0)
          throw safeError(error)
        })
        if (attempt !== epoch || saved?.installationKey !== previous.installationKey) return
        if (value.dock.primary.apiKey === previous.dock.primary.apiKey && value.dock.reserve.apiKey === previous.dock.reserve.apiKey) {
          cooldown = now() + 30_000
          return
        }
        await persist({ ...previous, dock: value.dock }, attempt)
        if (attempt === epoch) options.changed()
      })()
      const flight = { promise: operation, controller, deadline: input.deadline }
      refreshing = flight
      void operation.finally(() => { if (refreshing === flight) refreshing = undefined }).catch(() => {})
      return waitRefresh(flight, input)
    },
    async disconnect() {
      const previous = saved
      const cancelled = cancel()
      const attempt = epoch
      saved = undefined
      revision++
      pending = undefined
      options.changed()
      await cancelled
      await clear()
      if (previous)
        await request(new URL("/api/agent/connections/current", options.endpoints.site).href, {
          method: "DELETE",
          redirect: "error",
          headers: { "X-API-Key": previous.installationKey },
          signal: AbortSignal.timeout(5000),
        })
          .then((response) => {
            if (response.status !== 204) throw Error("LOGINOM_CLOUD_REVOKE_UNCONFIRMED")
          })
          .catch(() => {
            if (attempt === epoch) {
              failure = "LOGINOM_CLOUD_REVOKE_UNCONFIRMED"
              options.changed()
            }
          })
    },
    close() {
      closing ??= (async () => {
        await cancel()
        await writes
      })()
      return closing
    },
  }
}

function safeError(value: unknown) {
  const code = hostError(value)
  return Error(code === "LOGINOM_HOST_REQUEST_FAILED" ? "LOGINOM_CLOUD_UNAVAILABLE" : code)
}
