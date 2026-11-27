import { Option, Schema } from "effect"
import { For, Show, createSignal } from "solid-js"
import type { ModelRef, SessionInfo, SessionMessageInfo, SessionMessageUser } from "@opencode/client/promise"
import { useLanguage } from "@/runtime/i18n/language"
import { Button } from "@opencode/ui/button"
import { usePlatform } from "@/runtime/platform/platform"
import { limitResetAt } from "../usage-exceeded-dialogs"

const decodeModelContinuation = Schema.decodeUnknownOption(
  Schema.Struct({ modelContinuation: Schema.String, previousModel: Schema.optional(Schema.String) }),
)

export function readModelContinuation(metadata: SessionMessageUser["metadata"]) {
  return Option.getOrUndefined(decodeModelContinuation(metadata))
}

const stopReasons = {
  "provider.free-limit": "session.modelStop.limit",
  "provider.quota": "session.modelStop.quota",
  "provider.auth": "session.modelStop.auth",
  "provider.no-route": "session.modelStop.noRoute",
  "provider.invalid-request": "session.modelStop.invalid",
  "provider.content-filter": "session.modelStop.invalid",
  "provider.context-overflow": "session.modelStop.overflow",
} as const

export function stopReason(type: string | undefined) {
  return Object.entries(stopReasons).find(([code]) => code === type)?.[1]
}

export function modelStopped(session: SessionInfo | undefined, messages: readonly SessionMessageInfo[] | undefined) {
  if (session?.outcome !== "failed") return false
  const idle = messages?.findLast((message) => message.type === "idle")

  return !!stopReason(idle?.error?.type)
}

export function freeLimitReset(messages: readonly SessionMessageInfo[], model: ModelRef | undefined) {
  const failed = messages.findLast(
    (message) =>
      message.type === "assistant" && message.error?.type === "provider.free-limit" && sameModel(message.model, model),
  )

  if (failed?.type !== "assistant") return
  const at = limitResetAt(failed.time.completed ?? failed.time.created, failed.error?.retryAfterMs)

  if (at !== undefined && at > Date.now()) return at
}

export function sameModel(a: ModelRef, b: ModelRef | undefined) {
  return a.providerID === b?.providerID && a.id === b.id
}

export function ModelStop(props: {
  reason: NonNullable<ReturnType<typeof stopReason>>
  error: string
  model: ModelRef | undefined
  modelName: string
  resetAt?: number
  alternatives: { model: ModelRef; name: string }[]
  canContinue: boolean
  connect: () => void
  resume: (model: ModelRef) => Promise<void>
}) {
  const language = useLanguage()
  const platform = usePlatform()
  const [busy, setBusy] = createSignal(false)
  const [actionError, setActionError] = createSignal(false)
  const reason = () => language.t(props.reason)

  const same = () =>
    props.model &&
    (props.reason === "session.modelStop.noRoute" ||
      props.reason === "session.modelStop.invalid" ||
      props.reason === "session.modelStop.overflow")
      ? props.model
      : undefined

  async function run(action: () => Promise<void>) {
    if (busy()) return
    setBusy(true)
    setActionError(false)

    try {
      await action()
    } catch {
      setActionError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="flex flex-col gap-2 text-sm" data-component="model-stop">
      <div class="text-v2-text-text-muted">
        {language.t("session.modelStop.step", { model: props.modelName, reason: reason() })}
      </div>
      <div
        class="flex flex-col gap-2 rounded-lg border border-solid border-v2-state-border-warning bg-v2-state-bg-warning p-3"
        role="status"
      >
        <strong class="text-v2-state-fg-warning">{language.t("session.modelStop.title", { reason: reason() })}</strong>
        <Show when={props.resetAt}>
          {(at) => (
            <span>
              {language.t("session.modelStop.reset", {
                time: new Intl.DateTimeFormat(language.locale(), { timeStyle: "short" }).format(at()),
              })}
            </span>
          )}
        </Show>
        <span>{language.t("session.modelStop.saved")}</span>
        <div class="flex flex-wrap items-start gap-2">
          <Show when={props.canContinue}>
            <Show
              when={props.alternatives.length}
              fallback={
                <Button size="small" variant="neutral" type="button" disabled={busy()} onClick={props.connect}>
                  {language.t("session.modelStop.connect")}
                </Button>
              }
            >
              <details>
                <summary class="cursor-pointer rounded-md border border-solid border-v2-state-border-warning bg-v2-background-bg-base px-2 py-1 font-medium">
                  {language.t("session.modelStop.switch")}
                </summary>
                <div class="flex max-h-48 flex-col items-start gap-1 overflow-auto">
                  <For each={props.alternatives}>
                    {(item) => (
                      <Button
                        size="small"
                        variant="neutral"
                        type="button"
                        disabled={busy()}
                        onClick={() => void run(() => props.resume(item.model))}
                      >
                        {item.name}
                      </Button>
                    )}
                  </For>
                </div>
              </details>
            </Show>
            <Show when={same()}>
              {(model) => (
                <Button
                  size="small"
                  variant="neutral"
                  type="button"
                  disabled={busy()}
                  onClick={() => void run(() => props.resume(model()))}
                >
                  {language.t("session.modelStop.same")}
                </Button>
              )}
            </Show>
          </Show>
          <Button
            size="small"
            variant="neutral"
            type="button"
            disabled={busy()}
            onClick={() =>
              void run(() => platform.writeClipboardText?.(props.error) ?? navigator.clipboard.writeText(props.error))
            }
          >
            {language.t("session.modelStop.copy")}
          </Button>
        </div>
        <Show when={actionError()}>
          <span role="alert">{language.t("session.modelStop.actionError")}</span>
        </Show>
      </div>
    </div>
  )
}
