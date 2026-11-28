import { expect, test } from "bun:test"
import { appVerifiedSummary } from "../src/app-verified"
import type { LoginomEvidence } from "../src/loginom-metadata"

type Evidence = typeof LoginomEvidence.Type

const user = (id: string) => ({ type: "user", id })
const step = (id: string, operationId: string, evidence: Evidence, receiptWindow?: unknown) => ({
  type: "assistant",
  id,
  content: [
    {
      type: "tool" as const,
      id: `${id}-tool`,
      name: evidence.kind === "saved" ? "loginom_dock_action_run" : "loginom_dock_node_wait",
      state: {
        status: "completed",
        metadata: {
          generation: 4,
          loginom: { v: 1, operationId, state: "settled", status: "SUCCEEDED", evidence: [evidence], receiptWindow },
        },
      },
    },
  ],
})
const executed = { kind: "executed", executionId: "execution", scope: "workspace" } satisfies Evidence
const saved = { kind: "saved", path: "/analyst/result.lgp" } satisfies Evidence

test("turn summary cites the read step and does not inherit launches or saves from other turns", () => {
  const read = {
    kind: "tableRead",
    port: 0,
    portGuid: "port",
    rowsRead: 2,
    rowCount: 12,
    executionId: "execution",
  } satisfies Evidence
  expect(
    appVerifiedSummary(
      [
        user("old"),
        step("launch", "old-execution", executed),
        user("prompt"),
        step("read", "read-op", read),
        step("poll", "read-op", read),
        user("next"),
        step("save", "save-op", saved),
      ],
      "prompt",
    ),
  ).toEqual({
    facts: [{ evidence: read, source: { operationId: "read-op", messageID: "read", toolCallID: "read-tool" } }],
    notVerified: [
      "unreadTableRows",
      "noExecutionReceipt",
      "noSaveReceipt",
      "noSavedGraphReadReceipt",
      "noSavedVersionExecutionReceipt",
    ],
  })
})

test("save and workspace execution are separate and do not prove the saved version ran", () => {
  const history = [user("prompt"), step("save", "save-op", saved)]
  expect(appVerifiedSummary(history, "prompt").notVerified).toEqual([
    "noTableReadReceipt",
    "noExecutionReceipt",
    "noSavedGraphReadReceipt",
    "noSavedVersionExecutionReceipt",
  ])
  const result = appVerifiedSummary([...history, step("launch", "launch-op", executed)], "prompt")
  expect(result.facts.map(({ evidence }) => evidence)).toEqual([saved, executed])
  expect(result.notVerified).toEqual([
    "noTableReadReceipt",
    "noSavedGraphReadReceipt",
    "noSavedVersionExecutionReceipt",
  ])
  expect(appVerifiedSummary(history, "missing")).toEqual({ facts: [], notVerified: ["promptUnavailable"] })
})

test("only distinct receipt windows on the same document prove order relative to Save", () => {
  const save = step("save", "save-op", saved, { documentId: "doc", startedAt: 20, confirmedAt: 30 })
  const history = [
    user("prompt"),
    save,
    step("old-poll", "old", executed, { documentId: "doc", startedAt: 10, confirmedAt: 19 }),
    step(
      "foreign",
      "foreign",
      { ...executed, executionId: "foreign" },
      { documentId: "other", startedAt: 31, confirmedAt: 35 },
    ),
    step("new", "new", { ...executed, executionId: "new" }, { documentId: "doc", startedAt: 31, confirmedAt: 35 }),
  ]
  const facts = appVerifiedSummary(history, "prompt").facts
  expect(facts.slice(1).map((fact) => fact.relativeToSave)).toEqual([
    { timing: "before", source: facts[0]?.source },
    undefined,
    { timing: "after", source: facts[0]?.source },
  ])
})
