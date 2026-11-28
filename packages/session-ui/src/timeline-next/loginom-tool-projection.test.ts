import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { Predicate } from "effect"
import { createRoot } from "solid-js"
import { timelinePresets } from "../timeline/detail"
import { createReactiveTimelineProjection } from "../timeline/projection"
import { createNextTimelineProjection } from "./projection"

describe("tool renderer placement", () => {
  test.each(timelinePresets.filter((preset) => preset.id === "compact" || preset.id === "detailed"))(
    "$id keeps a failed native read grouped and gives the registered tool its own row",
    ({ value }) => {
      const messages: SessionMessageInfo[] = [
        { id: "user", type: "user", text: "Run the check", time: { created: 1 } },
        {
          id: "assistant",
          type: "assistant",
          agent: "build",
          model: { id: "test-model", providerID: "test" },
          time: { created: 2, completed: 3 },
          content: [
            {
              id: "read",
              type: "tool",
              name: "read",
              time: { created: 2, completed: 3 },
              state: { status: "error", input: { path: "missing.csv" }, error: { type: "error", message: "Missing" } },
            },
            {
              id: "demo",
              type: "tool",
              name: "loginom_demo",
              time: { created: 2, completed: 3 },
              state: { status: "completed", input: {}, content: [{ type: "text", text: "Ready" }] },
            },
          ],
        },
      ]

      createRoot((dispose) => {
        try {
          const groups = (separate?: ReadonlySet<string>) => {
            const input = {
              sessionMessages: () => messages,
              status: () => ({ type: "idle" as const }),
              timelineDetail: () => value,
              toolSeparate: () => separate,
            }

            const classic = createReactiveTimelineProjection({ ...input, reasoningMode: () => "compact" })
            const next = createNextTimelineProjection(input)

            return [classic, next].map((projection) =>
              projection.rows().flatMap((row) => {
                if (!Predicate.isTagged(row, "AssistantPart")) return []

                const group = row.group
                const refs = group.type === "part" ? [group.ref] : group.refs

                return [{ type: group.type, ids: refs.map((ref) => ref.partID) }]
              }),
            )
          }

          for (const rows of groups(new Set(["loginom_demo"])))
            expect(rows).toEqual([
              { type: "context", ids: ["read"] },
              { type: "part", ids: ["demo"] },
            ])

          for (const rows of groups()) expect(rows).toEqual([{ type: "context", ids: ["read", "demo"] }])
        } finally {
          dispose()
        }
      })
    },
  )
})
