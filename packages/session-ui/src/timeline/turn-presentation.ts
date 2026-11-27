import { Predicate } from "effect"
import { createMemo } from "solid-js"
import { Timeline, type createReactiveTimelineProjection } from "./projection"
import { TimelineRow, type PartRef } from "./timeline-row"

type Projection = ReturnType<typeof createReactiveTimelineProjection>

export function createTurnPresentationProjection(input: {
  base: Projection
  presentation: (id: string) => "plan" | "summary" | undefined
  open: (id: string) => boolean
  setOpen: (id: string, open: boolean) => void
}) {
  const base = input.base

  const activityRefs = (row: TimelineRow.TimelineRow) => {
    if (!Predicate.isTagged(row, "AssistantPart") || row.group.type === "file") return

    const refs = row.group.type === "part" ? [row.group.ref] : row.group.refs

    if (
      refs.every((ref) => {
        const content = Timeline.resolveContent(base.messageByID().get(ref.messageID), ref.partID)

        return (
          content?.type === "reasoning" ||
          (content?.type === "tool" &&
            (content.state.status === "completed"
              ? content.state.content.every((item) => item.type === "text")
              : content.state.status !== "error"))
        )
      })
    )
      return refs
  }

  const hiddenRefs = (row: TimelineRow.TimelineRow) =>
    input.presentation(row.userMessageID) === "summary" && !input.open(row.userMessageID)
      ? activityRefs(row)
      : undefined

  const rows = createMemo(() => {
    const native = base.rows()

    const displayed = native.flatMap((row) => {
      if (Predicate.isTagged(row, "UserMessage") && input.presentation(row.userMessageID))
        return [row, new TimelineRow.TurnPresentation({ userMessageID: row.userMessageID })]

      return hiddenRefs(row) ? [] : [row]
    })

    return displayed.length === native.length && displayed.every((row, index) => row === native[index])
      ? native
      : displayed
  })

  const index = createMemo(() => {
    const native = rows() === base.rows()

    if (native) return { byKey: base.rowByKey(), first: base.messageRowIndex(), last: base.messageLastRowIndex() }

    const byKey = new Map<string, TimelineRow.TimelineRow>()
    const first = new Map<string, number>()
    const last = new Map<string, number>()

    rows().forEach((row, index) => {
      byKey.set(TimelineRow.key(row), row)

      if (!first.has(row.userMessageID)) first.set(row.userMessageID, index)
      last.set(row.userMessageID, index)
    })

    return { byKey, first, last }
  })

  return {
    ...base,
    rows,
    rowByKey: () => index().byKey,
    messageRowIndex: () => index().first,
    messageLastRowIndex: () => index().last,
    revealActivity(matches: (ref: PartRef) => boolean) {
      const row = base.rows().find((row) => hiddenRefs(row)?.some(matches))

      if (row) input.setOpen(row.userMessageID, true)
    },
  }
}
