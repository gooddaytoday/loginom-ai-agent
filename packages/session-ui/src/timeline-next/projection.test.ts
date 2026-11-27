import { describe, expect, test } from "bun:test"
import type { SessionMessageAssistant, SessionMessageInfo, SessionMessageUser } from "@opencode/client/promise"
import { Predicate } from "effect"
import { createRoot } from "solid-js"
import { createReactiveTimelineProjection } from "../timeline/projection"
import { timelinePresets } from "../timeline/detail"
import { createNextTimelineProjection, workedDuration } from "./projection"
import { replayScript, scenarios } from "./stories/session-replay"

const messagesOnly = timelinePresets.find((preset) => preset.id === "text-only")!.value

const detailed = timelinePresets.find((preset) => preset.id === "detailed")!.value

const step = (id: string, created: number, rest: Partial<SessionMessageAssistant> = {}): SessionMessageAssistant => ({
  id,
  type: "assistant",
  agent: "build",
  model: { id: "model", providerID: "provider" },
  content: [],
  time: { created },
  ...rest,
})

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

describe("New timeline projection", () => {
  test("a stopped turn says how long it worked where the work stopped, above Interrupted and what followed", () => {
    const document = replayScript(scenarios["Feature work"], Number.MAX_SAFE_INTEGER, 0).document

    const tags = createRoot((dispose) => {
      const projection = createNextTimelineProjection({
        sessionMessages: () => document.messages,
        status: () => document.status,
        timelineDetail: () => messagesOnly,
      })

      const rows = projection.rows().map((row) => row._tag)
      dispose()

      return rows
    })

    const worked = tags.indexOf("Worked")

    expect(worked).toBeGreaterThan(-1)
    expect(tags.slice(worked, worked + 3)).toEqual(["Worked", "TurnDivider", "Notice"])
  })

  test("a grouped notice never joins a run of thoughts, which stay thought rows", () => {
    const thought = (id: string, created: number) =>
      step(id, created, {
        finish: "tool-calls",
        content: [{ type: "reasoning", text: "Checking the folder.", time: { created, completed: created + 1 } }],
        time: { created, completed: created + 1 },
      })

    const messages: SessionMessageInfo[] = [
      { id: "user", type: "user", text: "Go", time: { created: 0 } },
      thought("first", 1),
      {
        id: "notice",
        type: "system",
        text: "",
        description: "Instructions updated: core/codemode",
        metadata: { notice: "instructions", instructionSources: ["core/codemode"] },
        time: { created: 3 },
      },
      thought("second", 4),
    ]

    const groups = createRoot((dispose) => {
      const projection = createNextTimelineProjection({
        sessionMessages: () => messages,
        status: () => ({ type: "idle" }),
        timelineDetail: () => detailed,
      })

      const result = projection
        .rows()
        .flatMap((row) =>
          Predicate.isTagged(row, "AssistantPart") && row.group.type !== "part"
            ? [row.group.refs.map((ref) => ref.messageID).join("+")]
            : [],
        )

      dispose()

      return result
    })

    expect(groups).toEqual(["first", "notice", "second"])
  })
})

describe("workedDuration", () => {
  test("a turn the user did not start runs from the agent's first step to the end of the stopped one", () => {
    const stopped = step("stopped", 3_000, {
      error: { type: "aborted", message: "The user interrupted the turn" },
      content: [
        {
          id: "shell",
          type: "tool",
          name: "shell",
          state: { status: "running", input: {}, metadata: {} },
          time: { created: 3_500, completed: 9_000 },
        },
      ],
    })

    expect(
      workedDuration(undefined, [step("first", 1_000, { time: { created: 1_000, completed: 2_000 } }), stopped]),
    ).toBe(8_000)
  })

  test("a turn the user started runs from their message", () => {
    const user = { id: "user", type: "user", text: "Go", time: { created: 500 } } satisfies SessionMessageUser

    const stopped = step("stopped", 1_000, {
      error: { type: "aborted", message: "The user interrupted the turn" },
      time: { created: 1_000, completed: 4_500 },
    })

    expect(workedDuration(user, [stopped])).toBe(4_000)
  })

  test("a turn nobody stopped has no worked time", () => {
    expect(workedDuration(undefined, [step("done", 1_000, { time: { created: 1_000, completed: 2_000 } })])).toBe(
      undefined,
    )
  })
})
