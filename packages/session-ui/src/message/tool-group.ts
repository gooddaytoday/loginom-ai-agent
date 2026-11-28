import type { SessionMessageAssistant } from "@opencode/client/promise"
import { Option, Schema } from "effect"
import type { ToolProps } from "../tools/tool-renderer"
import { currentToolMetadata } from "./current-tool-state"

const decodeGroup = Schema.decodeUnknownOption(
  Schema.Struct({
    id: Schema.NonEmptyString,
    attempt: Schema.Int,
    formID: Schema.optional(Schema.String),
    summary: Schema.optional(Schema.NonEmptyString),
  }),
)

function toolGroup(metadata: ToolProps["metadata"]) {
  return Option.getOrUndefined(decodeGroup(metadata.timelineGroup))
}

export function toolGroupSummary(metadata: ToolProps["metadata"]) {
  const group = toolGroup(metadata)

  return group?.formID && group.attempt >= 3 ? group.summary : undefined
}

type Content = SessionMessageAssistant["content"][number]

// Group membership comes from the server. Retain the original rows until the summary is in this segment.
export function collapseToolGroups<Entry extends { content: Content }>(entries: Entry[]) {
  const summaries = new Map<string, Entry>()
  const members = new Map<Entry, string>()

  for (const entry of entries) {
    if (entry.content.type !== "tool") continue

    const group = toolGroup(currentToolMetadata(entry.content))

    if (!group) continue

    const key = JSON.stringify([entry.content.name, group.id])
    members.set(entry, key)

    if (group.formID && group.attempt >= 3 && group.summary && !summaries.has(key)) summaries.set(key, entry)
  }

  if (!summaries.size) return entries

  return entries.filter((entry) => {
    const key = members.get(entry)
    const summary = key === undefined ? undefined : summaries.get(key)

    return summary === undefined || summary === entry
  })
}
