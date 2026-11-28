import type { ModelRef, SessionMessageInfo } from "@opencode/client/promise"
import { Option, Schema } from "effect"
import { createEffect, createMemo, createSignal, onCleanup, untrack, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import { makeEventListener } from "@solid-primitives/event-listener"
import { Persistence } from "@/runtime/persistence/schema"
import { Persist, persisted } from "@/runtime/persistence/storage"
import type { ServerScope } from "@/runtime/server/scope"

const MAX_RETRY_AFTER_MS = 45 * 86_400_000

const Refusal = Persistence.struct({
  messageID: Schema.String,
  failedAt: Schema.Finite,
  resetAt: Schema.NullOr(Schema.Finite),
  retryAllowed: Schema.Boolean,
})

const FreeModelLimitStore = Persistence.struct({ refusals: Persistence.record(Refusal) })

const Unresolved = Schema.Struct({
  sessionID: Schema.String,
  messageID: Schema.String,
  failedAt: Schema.Finite,
  retryAfterMs: Schema.optional(Schema.Finite),
})

const Entry = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("model"), refusal: Refusal }),
  Schema.Struct({ kind: Schema.Literal("unresolved"), failure: Unresolved }),
])

type LimitEntry = typeof Entry.Type

const EntryJson = Schema.fromJsonString(Entry)
const decodeEntry = Schema.decodeUnknownOption(EntryJson)
const encodeEntry = Schema.encodeSync(EntryJson)

// When a usage limit resets, or undefined when the refusal's delay is missing or out of range.
export function limitResetAt(created: number, retryAfterMs: number | undefined) {
  if (
    retryAfterMs === undefined ||
    !Number.isFinite(retryAfterMs) ||
    retryAfterMs < 0 ||
    retryAfterMs > MAX_RETRY_AFTER_MS ||
    !Number.isFinite(created)
  )
    return undefined

  const at = created + retryAfterMs

  if (Number.isNaN(new Date(at).getTime())) return undefined

  return at
}

export function sameModel(a: ModelRef, b: ModelRef | undefined) {
  return a.providerID === b?.providerID && a.id === b.id
}

/** Free allowance is shared across conversations on a server, including after reload. */
export function createFreeModelLimits(scope: ServerScope) {
  const [legacy, , , legacyReady] = persisted(Persist.serverGlobal(scope, "free-model-limits"), FreeModelLimitStore, {
    refusals: {},
  })

  // Web and Desktop windows share the renderer's origin. Each write touches only one record.
  const prefix = `opencode.free-model-limits:${JSON.stringify(scope)}:`
  const modelKey = (model: ModelRef) => `model:${JSON.stringify([model.providerID, model.id])}`
  const unresolvedKey = (messageID: string) => `unresolved:${messageID}`
  const [ready, setReady] = createSignal(false)

  function read(key: string) {
    try {
      return Option.getOrUndefined(decodeEntry(localStorage.getItem(prefix + key)))
    } catch {
      return undefined
    }
  }

  const initial: Record<string, LimitEntry | undefined> = {}

  try {
    for (const name of Object.keys(localStorage)) {
      if (!name.startsWith(prefix)) continue

      const key = name.slice(prefix.length)
      initial[key] = read(key)
    }
  } catch {}

  const [entries, setEntry] = createStore(initial)
  const unresolved = createMemo(() =>
    Object.values(entries).flatMap((entry) => (entry?.kind === "unresolved" ? [entry.failure] : [])),
  )
  const clock = createLimitClock(() =>
    Object.values(entries).map((entry) => (entry?.kind === "model" ? (entry.refusal.resetAt ?? undefined) : undefined)),
  )

  makeEventListener(window, "storage", (event) => {
    if (!event.key?.startsWith(prefix)) return

    const key = event.key.slice(prefix.length)
    const entry = read(key)

    if (entry?.kind === "unresolved" && untrack(() => entries[key])?.kind === "unresolved") return
    setEntry(key, entry)
  })

  function write(key: string, entry: LimitEntry | undefined) {
    try {
      if (entry) localStorage.setItem(prefix + key, encodeEntry(entry))
      else localStorage.removeItem(prefix + key)
    } catch {
      if (entry) setEntry(key, entry)

      return false
    }

    setEntry(key, entry)

    return true
  }

  function record(key: string, refusal: typeof Refusal.Type) {
    const stored = read(key)
    const entry = stored ?? untrack(() => entries[key])
    const current = entry?.kind === "model" ? entry.refusal : undefined

    // The same failure can arrive through the event stream and again through a history load.
    if (
      current &&
      (current.messageID === refusal.messageID ||
        current.failedAt > refusal.failedAt ||
        (current.failedAt === refusal.failedAt && current.messageID > refusal.messageID))
    )
      return stored !== undefined || write(key, entry)

    return write(key, { kind: "model", refusal })
  }

  createEffect(() => {
    if (!legacyReady()) return

    untrack(() => {
      for (const [model, refusal] of Object.entries(legacy.refusals)) {
        const key = `model:${model}`

        if (!read(key) && !entries[key]) record(key, refusal)
      }
      setReady(true)
    })
  })

  function remember(
    message: Extract<SessionMessageInfo, { type: "assistant" }>,
    failedAt: number,
    retryAfterMs?: number,
  ) {
    const key = modelKey(message.model)

    const refusal = {
      messageID: message.id,
      failedAt,
      resetAt: limitResetAt(failedAt, retryAfterMs) ?? null,
      retryAllowed: false,
    }

    const saved = record(key, refusal)
    const pendingKey = unresolvedKey(message.id)
    const persistedPending = read(pendingKey)

    // Keep the connection-wide block recoverable when the model entry could not be saved.
    if (persistedPending && !saved) return false
    if (persistedPending || untrack(() => entries[pendingKey])) return write(pendingKey, undefined)

    return true
  }

  function limit(model: ModelRef) {
    const entry = entries[modelKey(model)]
    const refusal = entry?.kind === "model" ? entry.refusal : undefined

    if (!refusal || refusal.retryAllowed) return

    if (refusal.resetAt === null || refusal.resetAt > Math.max(clock(), Date.now())) return refusal
  }

  return {
    remember,
    limit,
    unresolved,
    canSend: (model: ModelRef | undefined) => ready() && !unresolved().length && (!model || !limit(model)),
    rememberUnresolved(failure: typeof Unresolved.Type) {
      const key = unresolvedKey(failure.messageID)

      if (read(key) || untrack(() => entries[key])) return

      const known = untrack(() =>
        Object.values(entries).some(
          (entry) => entry?.kind === "model" && entry.refusal.messageID === failure.messageID,
        ),
      )

      if (!known) write(key, { kind: "unresolved", failure })
    },
    observeHistory(messages: readonly SessionMessageInfo[]) {
      for (const message of messages) {
        if (message.type === "assistant" && message.error?.type === "provider.free-limit")
          remember(message, message.time.completed ?? message.time.created, message.error.retryAfterMs)
      }
    },
    allowRetry(model: ModelRef) {
      const key = modelKey(model)
      const entry = read(key) ?? entries[key]
      const refusal = entry?.kind === "model" ? entry.refusal : undefined

      if (!ready() || unresolved().length || refusal?.resetAt !== null || refusal.retryAllowed) return false

      write(key, { kind: "model", refusal: { ...refusal, retryAllowed: true } })

      return true
    },
  }
}

export function createLimitClock(deadlines: Accessor<readonly (number | undefined)[]>) {
  const [now, setNow] = createSignal(Date.now())
  createEffect(() => {
    const times = deadlines()
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      const current = Date.now()
      setNow(current)
      const next = times.reduce<number | undefined>(
        (nearest, time) =>
          time !== undefined && time > current && (nearest === undefined || time < nearest) ? time : nearest,
        undefined,
      )
      if (next !== undefined) timer = setTimeout(tick, Math.min(next - current, 2_147_483_647))
    }
    tick()
    onCleanup(() => clearTimeout(timer))
  })
  return now
}
