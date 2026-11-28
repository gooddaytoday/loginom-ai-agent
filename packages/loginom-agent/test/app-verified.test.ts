import { expect, test } from "bun:test"
import { appVerifiedHandler, appVerifiedSummary } from "../src/app-verified"
import type { LoginomEvidence } from "../src/loginom-metadata"

type Evidence = typeof LoginomEvidence.Type

const user = (id: string) => ({ type: "user", id })
const step = (id: string, operationId: string, evidence: Evidence, receiptOrder?: unknown) => ({
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
          loginom: { v: 1, operationId, state: "settled", status: "SUCCEEDED", evidence: [evidence], receiptOrder },
        },
      },
    },
  ],
})
const executed = { kind: "executed", executionId: "execution", scope: "workspace" } satisfies Evidence
const saved = { kind: "saved", path: "/analyst/result.lgp" } satisfies Evidence
type Gap = ReturnType<typeof appVerifiedSummary>["notVerified"][number]
const notRequested = (reason: Gap["reason"]): Gap => ({ reason, status: "notRequested" })
const unconfirmed = (reason: Gap["reason"]): Gap => ({ reason, status: "unconfirmed" })

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
      unconfirmed("unreadTableRows"),
      notRequested("noExecutionReceipt"),
      notRequested("noSaveReceipt"),
      notRequested("noReopenedGraphReadReceipt"),
      notRequested("noSavedVersionExecutionReceipt"),
    ],
  })
})

test("save and workspace execution are separate and do not prove the saved version ran", () => {
  const history = [user("prompt"), step("save", "save-op", saved)]
  expect(appVerifiedSummary(history, "prompt").notVerified).toEqual([
    notRequested("noTableReadReceipt"),
    notRequested("noExecutionReceipt"),
    notRequested("noReopenedGraphReadReceipt"),
    notRequested("noSavedVersionExecutionReceipt"),
  ])
  const result = appVerifiedSummary([...history, step("launch", "launch-op", executed)], "prompt")
  expect(result.facts.map(({ evidence }) => evidence)).toEqual([saved, executed])
  expect(result.notVerified).toEqual([
    notRequested("noTableReadReceipt"),
    notRequested("noReopenedGraphReadReceipt"),
    notRequested("noSavedVersionExecutionReceipt"),
  ])
  expect(appVerifiedSummary(history, "missing")).toEqual({ facts: [], notVerified: [unconfirmed("promptUnavailable")] })
})

test("only disjoint receipt ranges in the same runtime and document prove order relative to Save", () => {
  const order = { runtimeId: "runtime-one", documentId: "doc" }
  const launch = (id: string, started: number, confirmed: number, identity = order) =>
    step(id, id, { ...executed, executionId: id }, { ...identity, started, confirmed })
  const save = step("save", "save-op", saved, { ...order, started: 20, confirmed: 30 })
  const history = [
    user("prompt"),
    save,
    launch("old-poll", 10, 19),
    launch("foreign-doc", 31, 35, { ...order, documentId: "other" }),
    launch("new-runtime", 31, 35, { ...order, runtimeId: "runtime-two" }),
    launch("overlap", 19, 25),
    launch("new", 31, 35),
  ]
  const facts = appVerifiedSummary(history, "prompt").facts
  expect(facts.slice(1).map((fact) => fact.relativeToSave)).toEqual([
    { timing: "before", source: facts[0]?.source },
    undefined,
    undefined,
    undefined,
    { timing: "after", source: facts[0]?.source },
  ])
})

test("an attempted check without a receipt is unconfirmed, not unrequested", () => {
  const history = [
    user("prompt"),
    {
      type: "assistant",
      id: "failed",
      content: [
        {
          type: "tool" as const,
          id: "apply",
          name: "loginom_dock_node_apply",
          state: { status: "error", input: { finish: "execute", read: { ports: [] } } },
        },
        {
          type: "tool" as const,
          id: "save",
          name: "loginom_dock_action_run",
          state: { status: "error", input: { action_key: "package.save_as" } },
        },
      ],
    },
  ]
  expect(appVerifiedSummary(history, "prompt").notVerified).toEqual([
    notRequested("noTableReadReceipt"),
    unconfirmed("noExecutionReceipt"),
    unconfirmed("noSaveReceipt"),
    unconfirmed("noReopenedGraphReadReceipt"),
    notRequested("noSavedVersionExecutionReceipt"),
  ])
})

test("summary RPC reads only the exact session in its Location", async () => {
  const location = { directory: "/project", workspaceID: "one" }
  const input = { sessionID: "session", promptID: "prompt" }
  const run = (session: { id: string; location: typeof location }) =>
    appVerifiedHandler(
      {
        get: async () => session,
        context: async ({ sessionID }) => {
          expect(sessionID).toBe(input.sessionID)
          return [user("prompt"), step("save", "save-op", saved)]
        },
      },
      location,
    )(input)
  expect((await run({ id: input.sessionID, location })).facts.map(({ evidence }) => evidence)).toEqual([saved])
  for (const foreign of [
    { id: "another", location },
    { id: input.sessionID, location: { ...location, workspaceID: "two" } },
    { id: input.sessionID, location: { ...location, directory: "/another" } },
  ])
    expect(await run(foreign)).toEqual({ facts: [], notVerified: [unconfirmed("promptUnavailable")] })
})
