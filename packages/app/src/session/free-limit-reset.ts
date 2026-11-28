import type { ModelRef, SessionMessageInfo } from "@opencode/client/promise"
import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js"
import { limitResetAt } from "./usage-exceeded-dialogs"

export function sameModel(a: ModelRef, b: ModelRef | undefined) {
  return a.providerID === b?.providerID && a.id === b.id
}

export function freeLimitResetAt(messages: readonly SessionMessageInfo[], model: ModelRef) {
  const failed = messages.findLast(
    (message) =>
      message.type === "assistant" && message.error?.type === "provider.free-limit" && sameModel(message.model, model),
  )
  if (failed?.type === "assistant")
    return limitResetAt(failed.time.completed ?? failed.time.created, failed.error?.retryAfterMs)
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
