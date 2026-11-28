import { Button } from "@opencode/ui/button"
import { Icon } from "@opencode/ui/icon"
import { Spinner } from "@opencode/ui/spinner"
import { Option } from "effect"
import { createMemo, createSignal, createUniqueId, For, onCleanup, Show } from "solid-js"
import { createKeyed, Slot, usePlugin, type Plugin } from "@opencode/plugin/gui"
import { builtinContext, BuiltinSlot, ToolRenderer, type ToolRendererProps } from "@opencode/plugin/gui/builtin"
import type definition from "./index"
import { decodeFacts, decodeProgress, failureReason, failureTitle, loginomStepPhrase, stepDetails } from "./step-phrase"

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
      return ctx.t("step.done")
    },
    separate: true,
    handlesFailure: (metadata) => Boolean(failureReason(ctx, Option.getOrUndefined(decodeFacts(metadata.loginom)))),
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

  const [showSpinner, setShowSpinner] = createSignal(false)
  const [seconds, setSeconds] = createSignal(0)
  createKeyed(running, () => {
    const timer = setTimeout(() => setShowSpinner(true), 1000)
    onCleanup(() => clearTimeout(timer))
  })

  const waitingSince = () => {
    const step = progress()

    if (!step || (step.phase !== "waiting" && step.stalledSince === null)) return

    return step.stalledSince ?? Math.max(step.startedAt, step.lastReplyAt ?? 0)
  }

  createKeyed(waitingSince, (since) => {
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - since) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    onCleanup(() => clearInterval(timer))
  })

  const title = () => {
    if (failed()) return failureTitle(ctx, facts())

    if (!running())
      return loginomStepPhrase(ctx, outcome(), {
        pending: props.metadata.loginomPending === true,
      })
    const step = progress()

    if (!step) return ctx.t("step.running")

    if (step.phase === "waiting" || step.stalledSince !== null) return ctx.t("phase.waiting", { seconds: seconds() })

    return ctx.t(`phase.${step.phase}`)
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
      <ul id={id} hidden={!open() || details().length === 0} class="min-w-0 break-words ps-7 text-v2-text-text-faint">
        <For each={details()}>{(detail) => <li>{detail}</li>}</For>
      </ul>
    </div>
  )
}

export default setup
