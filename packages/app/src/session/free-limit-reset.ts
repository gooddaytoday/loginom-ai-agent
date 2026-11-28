import type { ModelRef, SessionMessageInfo } from "@opencode/client/promise"
import { createEffect, createSignal, onCleanup, untrack, type Accessor } from "solid-js"

const MAX_RETRY_AFTER_MS = 45 * 86_400_000

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

/** Free allowance is shared across conversations on a server. */
export function createFreeModelLimits() {
  const [deadlines, setDeadlines] = createSignal(new Map<string, number>())
  const clock = createLimitClock(() => [...deadlines().values()])
  const modelKey = (model: ModelRef) => JSON.stringify([model.providerID, model.id])

  function remember(model: ModelRef, created: number, retryAfterMs: number | undefined) {
    const reset = limitResetAt(created, retryAfterMs)

    if (reset === undefined || reset <= Date.now()) return
    const key = modelKey(model)
    const current = untrack(deadlines)

    if ((current.get(key) ?? 0) >= reset) return
    setDeadlines(new Map(current).set(key, reset))
  }

  return {
    remember,
    observeHistory(messages: readonly SessionMessageInfo[]) {
      for (const message of messages) {
        if (message.type === "assistant" && message.error?.type === "provider.free-limit")
          remember(message.model, message.time.completed ?? message.time.created, message.error.retryAfterMs)
      }
    },
    resetAt(model: ModelRef) {
      const now = Math.max(clock(), Date.now())
      const reset = deadlines().get(modelKey(model))

      if (reset !== undefined && reset > now) return reset
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
