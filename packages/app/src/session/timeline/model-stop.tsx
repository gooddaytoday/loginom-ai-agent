import { Option, Schema } from "effect"
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js"
import type { ModelRef, SessionMessageAssistant, SessionMessageUser } from "@opencode/client/promise"
import { useLanguage } from "@/runtime/i18n/language"
import { writeClipboard } from "@opencode/session-ui/copy"
import { Button } from "@opencode/ui/button"
import { TextShimmer } from "@opencode/ui/text-shimmer"
import { Tooltip } from "@opencode/ui/tooltip"
import { usePlatform } from "@/runtime/platform/platform"
import { createLimitClock } from "../free-limit-reset"
import {
  initialModelStopAction,
  MODEL_STOP_ACTION_TIMEOUT_MS,
  modelStopActionView,
  transitionModelStopAction,
  type ModelStopActionState,
} from "./model-stop-machine"

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
} as const

type StopReason = (typeof stopReasons)[keyof typeof stopReasons] | "session.modelStop.overflow"

// Keep the text matcher in sync with isContextOverflow in packages/ai/src/provider-error.ts.
const contextOverflowPatterns = [
  /prompt is too long/i,
  /input is too long for (?:the )?(?:requested|selected) model/i,
  /too large for the model'?s configured input limit/i,
  /exceeded this model context window limit/i,
  /exceeds the context window/i,
  /exceeds (?:the )?(?:model'?s )?maximum context length(?: of [\d,]+ tokens?|\s*\([\d,]+\))/i,
  /input token count.*exceeds the maximum/i,
  /number of input tokens exceeds maximum length/i,
  /tokens in request more than max tokens allowed/i,
  /maximum prompt length is \d+/i,
  /reduce the length of the messages/i,
  /requested input length \d+ exceeds maximum input length/i,
  /maximum context length is \d+ tokens/i,
  /exceeds (?:the )?maximum allowed input length of [\d,]+ tokens?/i,
  /input(?: \(\d+ tokens\))? is longer than the model'?s context length/i,
  /exceeds the limit of \d+/i,
  /exceeds the available context size/i,
  /greater than the context length/i,
  /`inputs` tokens \+ `max_new_tokens` must be <= \d+/i,
  /context window exceeds limit/i,
  /context window exceeded/i,
  /exceeded model token limit/i,
  /context[_ ]length[_ ]exceeded/i,
  /context length is only \d+ tokens/i,
  /input length.*exceeds.*context length/i,
  /prompt (?:too long|exceeds max length|超长)/i,
  /too large for model with \d+ maximum context length/i,
  /prompt has [\d,]+ tokens?, but the configured context size is [\d,]+ tokens?/i,
  /model_context_window_exceeded/i,
  /range of input length should be/i,
  /too many tokens/i,
  /token limit exceeded/i,
  /request_too_large/i,
]

const contextOverflowExclusions = [
  /^(throttling error|service unavailable):/i,
  /rate limit/i,
  /too many requests/i,
  /max[_ ]tokens must be less than/i,
  /too many tokens(?: per day)?, please wait/i,
]

export function stopReason(error: SessionMessageAssistant["error"]): StopReason | undefined {
  if (
    error?.type === "provider.invalid-request" &&
    (error.status === undefined || (error.status >= 400 && error.status < 500))
  ) {
    const text = [error.message, error.response?.body].filter(Boolean).join("\n")

    if (
      /\b(?:context_length_exceeded|model_context_window_exceeded|request_too_large)\b/i.test(text) ||
      (error.status !== 429 &&
        !/\bthrottlingexception\b/i.test(text) &&
        !contextOverflowExclusions.some((pattern) => pattern.test(text)) &&
        (contextOverflowPatterns.some((pattern) => pattern.test(text)) ||
          /^4(?:00|13)\s*(status code)?\s*\(no body\)/i.test(text)))
    )
      return "session.modelStop.overflow"
  }

  return Object.entries(stopReasons).find(([code]) => code === error?.type)?.[1]
}

export function ModelRetry(props: { attempt: number; seconds: number; message: string }) {
  const language = useLanguage()
  const text = () =>
    props.seconds > 0
      ? language.t("session.modelRetry.waiting", { attempt: props.attempt, seconds: props.seconds })
      : language.t("session.modelRetry.now", { attempt: props.attempt })

  return (
    <Tooltip appearance="large" contentClass="max-w-80 break-words" value={props.message} placement="top">
      <div data-slot="session-turn-retry-info" class="text-sm">
        <TextShimmer text={text()} active />
      </div>
    </Tooltip>
  )
}

export function ModelStop(props: {
  reason: StopReason
  error: string
  model: ModelRef | undefined
  modelName: string
  resetAt?: number
  alternatives: { model: ModelRef; name: string }[]
  canContinue: boolean
  canResumeSame: boolean
  modelsManaged: boolean
  connect: () => void
  resume: (model: ModelRef) => Promise<void>
}) {
  const language = useLanguage()
  const platform = usePlatform()
  const [action, setAction] = createSignal<ModelStopActionState>(initialModelStopAction)
  const view = createMemo(() => modelStopActionView(action()))
  const clock = createLimitClock(() => [props.resetAt])
  const reset = () => (props.resetAt !== undefined && props.resetAt > clock() ? props.resetAt : undefined)
  const reason = () => language.t(props.reason)

  const same = () =>
    props.canResumeSame && (props.reason === "session.modelStop.noRoute" || props.reason === "session.modelStop.invalid")
      ? props.model
      : undefined

  let timer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => {
    clearTimeout(timer)
    setAction((state) => transitionModelStopAction(state, { type: "disposed" }))
  })

  async function copyError() {
    if (platform.writeClipboardText) return platform.writeClipboardText(props.error)

    if (!(await writeClipboard(props.error))) throw new Error(language.t("common.requestFailed"))
  }

  async function run(work: () => Promise<void>) {
    const current = action()
    const next = transitionModelStopAction(current, { type: "started" })
    if (next === current || next.status !== "running") return
    setAction(next)

    const settle = (type: "succeeded" | "failed") => {
      const current = action()
      const settled = transitionModelStopAction(current, { type, attempt: next.attempt })
      if (current === settled) return
      clearTimeout(timer)
      setAction(settled)
    }
    timer = setTimeout(() => settle("failed"), MODEL_STOP_ACTION_TIMEOUT_MS)
    try {
      await work()
      settle("succeeded")
    } catch {
      settle("failed")
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
        <Show when={reset()}>
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
                <Show
                  when={!props.modelsManaged}
                  fallback={<span>{language.t("session.modelStop.contactAdmin")}</span>}
                >
                  <Button size="small" variant="neutral" type="button" disabled={view().busy} onClick={props.connect}>
                    {language.t("session.modelStop.connect")}
                  </Button>
                </Show>
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
                        disabled={view().busy}
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
                  disabled={view().busy}
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
            disabled={view().busy}
            onClick={() => void run(copyError)}
          >
            {language.t("session.modelStop.copy")}
          </Button>
        </div>
        <Show when={view().failed}>
          <span role="alert">{language.t("session.modelStop.actionError")}</span>
        </Show>
      </div>
    </div>
  )
}
