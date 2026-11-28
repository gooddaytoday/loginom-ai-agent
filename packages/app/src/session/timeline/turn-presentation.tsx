import { createMemo, For, type Accessor } from "solid-js"
import { timelinePreset, type TimelineDetail } from "@opencode/session-ui/timeline/detail"
import { TimelineRow } from "@opencode/session-ui/timeline/projection"
import { createTurnPresentationProjection } from "@opencode/session-ui/timeline/turn-presentation"
import { TurnPresentation, type TurnPresentationInput, type TurnPresentationValue } from "@opencode/plugin/gui/builtin"
import { Icon } from "@opencode/ui/icon"
import { SessionTurn } from "@opencode/util/session-turn"
import { usePluginHost } from "@/runtime/plugin/host"
import { sessionTodos } from "../composer/todos"
import type { createTimelineProjection } from "./projection"

export type TurnDisclosure = {
  open: (id: string) => boolean
  setOpen: (id: string, open: boolean) => void
}

export function createTurnPresentation(
  base: ReturnType<typeof createTimelineProjection>,
  disclosure: TurnDisclosure,
  detail: Accessor<TimelineDetail>,
) {
  const host = usePluginHost()
  const forcedOpen = createMemo(() => {
    const preset = timelinePreset(detail())?.id

    return preset === "detailed" || preset === "everything"
  })
  const open = (id: string) => forcedOpen() || disclosure.open(id)

  const descriptions = createMemo(() => {
    const entries = host.items(TurnPresentation)
    const views = new Map<string, TurnPresentationValue>()

    if (!entries.length) return views

    const transcript = [...base.messageByID().values()]
    const indexes = new Map(transcript.map((message, index) => [message.id, index] as const))
    const legacy = SessionTurn.legacy(transcript)
    const phases = base.turnPhaseByID()

    for (const [id, messages] of base.assistantMessagesByParent()) {
      if (base.messageByID().get(id)?.type !== "user") continue

      const phase = phases.get(id)?.status
      const last = messages.at(-1)

      let input: TurnPresentationInput

      if (phase === "working" || phase === "thinking" || phase === "retrying") {
        input = { phase: "working", messages, todos: sessionTodos(messages) }
      } else if (phase === "idle" && last?.time.completed !== undefined) {
        input = {
          phase: "completed",
          messages,
          durationMs: SessionTurn.duration(transcript, last, { legacy, index: indexes.get(last.id) }),
        }
      } else {
        continue
      }

      for (const entry of entries) {
        try {
          const value = entry.value.describe(input)

          if (!value) continue
          views.set(id, value)
          break
        } catch (error) {
          queueMicrotask(() => host.fail(entry.plugin, error))
        }
      }
    }

    return views
  })

  return {
    description: (id: string) => descriptions().get(id),
    open,
    forcedOpen,
    projection: createTurnPresentationProjection({
      base,
      presentation: (id) => descriptions().get(id)?.kind,
      open,
      setOpen: disclosure.setOpen,
    }),
  }
}

const marker = { completed: "✓", in_progress: "●", pending: "○" }

export function TurnPresentationRow(props: {
  row: TimelineRow.TurnPresentation
  value: TurnPresentationValue
  open: boolean
  forcedOpen: boolean
  toggle: () => void
  padding: Accessor<string>
  centered: boolean
}) {
  return (
    <div
      data-message-id={props.row.userMessageID}
      data-timeline-row={props.row._tag}
      class={`w-full min-w-0 pt-2 text-13-regular leading-text-compact text-v2-text-text-muted ${props.padding()}`}
      classList={{ "md:max-w-session md:mx-auto": props.centered }}
    >
      {(() => {
        const value = props.value

        if (value.kind === "plan")
          return (
            <ol aria-label={value.label} class="grid gap-1 pb-2">
              <For each={value.items}>
                {(item) => (
                  <li class="flex items-baseline gap-2">
                    <span aria-hidden="true" class="w-4 shrink-0 text-center">
                      {marker[item.status]}
                    </span>
                    <span class="sr-only">{item.statusLabel} </span>
                    <span
                      aria-current={item.status === "in_progress" ? "step" : undefined}
                      class="min-w-0 wrap-break-word"
                    >
                      {item.text}
                    </span>
                  </li>
                )}
              </For>
            </ol>
          )

        return (
          <button
            type="button"
            aria-expanded={props.open}
            disabled={props.forcedOpen}
            class="flex min-w-0 max-w-full items-baseline gap-1.5 rounded py-1 text-start enabled:cursor-pointer enabled:hover:text-text-strong"
            onClick={props.toggle}
          >
            <Icon
              name={props.open ? "outline-chevron-down" : "outline-chevron-right"}
              size="small"
              class="relative top-0.5 shrink-0 self-start"
            />
            <span class="min-w-0 wrap-break-word">{value.label}</span>
          </button>
        )
      })()}
    </div>
  )
}
