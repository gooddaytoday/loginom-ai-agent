import { createEffect, createMemo, createSignal, on, onCleanup, Show } from "solid-js"
import type { SessionStatus } from "@opencode/client/promise"
import { useI18n } from "@opencode/ui/context/i18n"
import { TextShimmer } from "@opencode/ui/text-shimmer"
import { Tooltip } from "@opencode/ui/tooltip"

export function SessionRetry(props: { status: SessionStatus; show?: boolean }) {
  const i18n = useI18n()

  const retry = createMemo(() => {
    if (props.status.type !== "retry") return

    return props.status
  })

  const [seconds, setSeconds] = createSignal(0)
  createEffect(
    on(retry, (current) => {
      if (!current) return

      const update = () => {
        const next = retry()?.next

        if (!next) return
        setSeconds(Math.round((next - Date.now()) / 1000))
      }

      update()
      const timer = setInterval(update, 1000)
      onCleanup(() => clearInterval(timer))
    }),
  )

  const info = createMemo(() => {
    const current = retry()

    if (!current) return ""
    const count = Math.max(0, seconds())

    if (count > 0) return i18n.plural("ui.sessionTurn.retry.attemptWaiting", count, { attempt: current.attempt })

    return i18n.t("ui.sessionTurn.retry.attemptRetryingNow", { attempt: current.attempt })
  })

  return (
    <Show when={retry() && (props.show ?? true)}>
      <div data-slot="session-turn-retry" class="w-full min-w-0">
        <Tooltip appearance="large" contentClass="max-w-80 break-words" value={retry()?.message ?? ""} placement="top">
          <div data-slot="session-turn-retry-info" class="text-sm">
            <TextShimmer text={info()} active />
          </div>
        </Tooltip>
      </div>
    </Show>
  )
}
