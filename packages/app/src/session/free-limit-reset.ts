import type { ModelRef, SessionMessageInfo } from "@opencode/client/promise"
import { Schema } from "effect"
import { createEffect, createSignal, onCleanup, untrack, type Accessor } from "solid-js"
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
  const [store, setStore, , ready] = persisted(Persist.serverGlobal(scope, "free-model-limits"), FreeModelLimitStore, {
    refusals: {},
  })

  const clock = createLimitClock(() => Object.values(store.refusals).map((refusal) => refusal.resetAt ?? undefined))
  const modelKey = (model: ModelRef) => JSON.stringify([model.providerID, model.id])
  const pending: { key: string; refusal: typeof Refusal.Type }[] = []

  function record(key: string, refusal: typeof Refusal.Type) {
    const current: typeof Refusal.Type | undefined = untrack(() => store.refusals[key])

    // The same failure can arrive through the event stream and again through a history load.
    if (
      current &&
      (current.messageID === refusal.messageID ||
        current.failedAt > refusal.failedAt ||
        (current.failedAt === refusal.failedAt && current.messageID > refusal.messageID))
    )
      return
    setStore("refusals", key, refusal)
  }

  createEffect(() => {
    if (!ready()) return

    for (const { key, refusal } of pending.splice(0)) record(key, refusal)
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

    if (!untrack(ready)) {
      pending.push({ key, refusal })

      return
    }

    record(key, refusal)
  }

  function limit(model: ModelRef) {
    const refusal: typeof Refusal.Type | undefined = store.refusals[modelKey(model)]

    if (!refusal || refusal.retryAllowed) return

    if (refusal.resetAt === null || refusal.resetAt > Math.max(clock(), Date.now())) return refusal
  }

  return {
    remember,
    limit,
    canSend: (model: ModelRef) => ready() && !limit(model),
    observeHistory(messages: readonly SessionMessageInfo[]) {
      for (const message of messages) {
        if (message.type === "assistant" && message.error?.type === "provider.free-limit")
          remember(message, message.time.completed ?? message.time.created, message.error.retryAfterMs)
      }
    },
    allowRetry(model: ModelRef) {
      if (!ready() || limit(model)?.resetAt !== null) return false
      setStore("refusals", modelKey(model), "retryAllowed", true)

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
