import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { Spinner } from "@opencode/ui/spinner"
import { Option } from "effect"
import { createMemo, createSignal, createUniqueId, For, onCleanup, Show } from "solid-js"
import { createKeyed, Slot, usePlugin, type Plugin } from "@opencode/plugin/gui"
import { builtinContext, BuiltinSlot, ToolRenderer, type ToolRendererProps } from "@opencode/plugin/gui/builtin"
import type definition from "./index"
import {
  decodeBusy,
  decodeFacts,
  decodeNativeFailure,
  decodeProgress,
  failureReason,
  failureTitle,
  hostFailureTitle,
  loginomStepPhrase,
  stepDetails,
} from "./step-phrase"

const modes = ["compact", "detailed"] as const

const setup: Plugin.Setup<typeof definition> = (ctx) => {
  const timeline = builtinContext(ctx).timeline

  const renderDetail = () => (
    <div
      role="group"
      aria-label={ctx.t("detail.label")}
      class="inline-flex shrink-0 rounded-md bg-v2-overlay-simple-overlay-hover p-0.5"
    >
      <For each={modes}>
        {(mode) => (
          <Button
            variant="ghost"
            size="small"
            class="whitespace-nowrap px-1.5 aria-pressed:bg-v2-overlay-simple-overlay-hover aria-pressed:text-v2-text-text-base"
            aria-pressed={timeline.detail() === mode}
            onClick={() => timeline.setDetail(mode)}
          >
            {ctx.t(`detail.${mode}`)}
          </Button>
        )}
      </For>
    </div>
  )

  ctx.add(Slot, { at: "session.header", order: 5, render: renderDetail })
  ctx.add(BuiltinSlot, { at: "session.header.mobile", render: renderDetail })

  ctx.add(ToolRenderer, {
    tool: "loginom_*",
    get title() {
      return ctx.t("step.label")
    },
    separate: true,
    handlesFailure: (metadata, error) =>
      Option.isSome(decodeNativeFailure(metadata.loginom)) ||
      Boolean(failureReason(ctx, Option.getOrUndefined(decodeFacts(metadata.loginom))) ?? hostFailureTitle(ctx, error)),
    render: (props) => <Step {...props} />,
  })
}

function Step(props: ToolRendererProps) {
  const ctx = usePlugin<typeof definition>()
  const timeline = builtinContext(ctx).timeline
  const outcome = createMemo(() => decodeFacts(props.metadata.loginom))
  const facts = () => Option.getOrUndefined(outcome())

  const failed = () =>
    props.status === "error" ||
    props.metadata.isError === true ||
    (facts()?.state === "settled" && facts()?.status !== undefined && facts()?.status !== "SUCCEEDED")

  const running = () => !failed() && (props.status === "streaming" || props.status === "running")

  const progress = createMemo(() =>
    running() ? Option.getOrUndefined(decodeProgress(props.metadata.loginomStep)) : undefined,
  )

  const busy = createMemo(
    () => running() && Option.getOrUndefined(decodeBusy(props.metadata.loginom))?.busy.active === true,
  )

  const [showSpinner, setShowSpinner] = createSignal(false)
  const [seconds, setSeconds] = createSignal(0)
  createKeyed(running, () => {
    const timer = setTimeout(() => setShowSpinner(true), 1000)
    onCleanup(() => clearTimeout(timer))
  })

  createKeyed(() => progress()?.startedAt, (since) => {
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - since) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    onCleanup(() => clearInterval(timer))
  })

  const title = () => {
    if (failed()) {
      const native = Option.getOrUndefined(decodeNativeFailure(props.metadata.loginom))
      if (native) return ctx.t(`failure.${native.kind}`, { message: native.message })
      return hostFailureTitle(ctx, props.error) ?? failureTitle(ctx, facts())
    }

    if (!running())
      return loginomStepPhrase(ctx, outcome(), {
        pending: props.metadata.loginomPending === true,
      })
    const step = progress()

    if (!step) return ctx.t("step.running")

    const elapsed = seconds()
    const duration = elapsed < 60
      ? ctx.t("duration.seconds", { seconds: elapsed })
      : ctx.t("duration.minutes", { minutes: Math.floor(elapsed / 60), seconds: elapsed % 60 })

    if (step.phase === "waiting") return ctx.t("phase.waiting", { duration })

    return ctx.t("phase.elapsed", { phase: ctx.t(`phase.${step.phase}`), duration })
  }

  const details = createMemo(() => {
    const values = stepDetails(ctx, facts())
    const substep = progress()?.substep

    return substep ? [...values, ctx.t("phase.fields", substep)] : values
  })

  const id = createUniqueId()
  const [localOpen, setLocalOpen] = createSignal(false)
  const detailed = () => timeline.detail() === "detailed"
  const open = () => detailed() || (props.open ?? localOpen())

  return (
    <div class="min-w-0 text-13-regular text-v2-text-text-muted">
      <div class="flex min-w-0 items-start gap-2">
        <span class="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
          <Show
            when={running()}
            fallback={<Icon name={failed() ? "outline-hexagonal-warning" : "check"} size="small" />}
          >
            <Show when={showSpinner() || progress()}>
              <Spinner width={14} height={14} />
            </Show>
          </Show>
        </span>
        <span
          class="min-w-0 break-words leading-5"
          classList={{ "text-v2-text-text-base": failed() }}
          role={running() ? "status" : undefined}
          aria-live={running() ? "off" : undefined}
        >
          {title()}
        </span>
        <Show when={!detailed() && details().length > 0}>
          <button
            type="button"
            class="shrink-0 rounded px-1 leading-5 hover:bg-v2-overlay-simple-overlay-hover"
            aria-label={ctx.t("detail.more")}
            aria-controls={id}
            aria-expanded={open()}
            onClick={() => {
              const next = !open()
              setLocalOpen(next)
              props.onOpenChange?.(next)
            }}
          >
            …
          </button>
        </Show>
      </div>
      <Show when={busy()}>
        <p
          role="status"
          class="mt-1 flex items-start gap-2 rounded-md bg-v2-state-bg-warning px-2 py-1 font-medium text-v2-text-text-base"
        >
          <Icon
            name="outline-hexagonal-warning"
            size="small"
            class="mt-0.5 shrink-0 text-v2-state-fg-warning"
            aria-hidden="true"
          />
          {ctx.t("phase.protected")}
        </p>
      </Show>
      <Show when={(progress()?.stalledSince ?? null) !== null}>
        <p role="status" class="ps-7 font-medium text-v2-text-text-base">
          {ctx.t("phase.stalled")}
        </p>
      </Show>
      <ul id={id} hidden={!open() || details().length === 0} class="min-w-0 break-words ps-7 text-v2-text-text-faint">
        <For each={details()}>{(detail) => <li>{detail}</li>}</For>
      </ul>
    </div>
  )
}

export default setup
