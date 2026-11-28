import { expect, test } from "bun:test"
import { appVerifiedHandler, appVerifiedSummary } from "../src/app-verified"
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
const executed = { kind: "executed", executionId: "execution", scope: "activeWorkflow" } satisfies Evidence
const saved = { kind: "saved", path: "/analyst/result.lgp" } satisfies Evidence
type Gap = ReturnType<typeof appVerifiedSummary>["notVerified"][number]
const notRequested = (reason: Gap["reason"]): Gap => ({ reason, status: "notRequested" })
const unconfirmed = (reason: Gap["reason"], call?: Gap["call"]): Gap => ({ reason, status: "unconfirmed", call })
const ref = (messageID: string, toolCallID: string) => ({ messageID, toolCallID })

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
      unconfirmed("unreadTableRows", ref("read", "read-tool")),
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
  const order = { runtimeId: "32ef40ff-08d2-476a-ad73-1ef3feb17ce8", documentId: "doc" }
  const launch = (id: string, startSequence: number, confirmedSequence: number, identity = order) =>
    step(id, id, { ...executed, executionId: id }, { ...identity, startSequence, confirmedSequence })
  const save = step("save", "save-op", saved, { ...order, startSequence: 20, confirmedSequence: 30 })
  const history = [
    user("prompt"),
    save,
    launch("old-poll", 10, 19),
    launch("foreign-doc", 31, 35, { ...order, documentId: "other" }),
    launch("new-runtime", 31, 35, { ...order, runtimeId: "c58fbbe2-0983-44dc-ba70-abfcd876c880" }),
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
    unconfirmed("noExecutionReceipt", ref("failed", "apply")),
    unconfirmed("noSaveReceipt", ref("failed", "save")),
    unconfirmed("noReopenedGraphReadReceipt", ref("failed", "save")),
    notRequested("noTableReadReceipt"),
    notRequested("noSavedVersionExecutionReceipt"),
  ])
})

test("a successful wait settles only its operation; another failed node keeps both gaps including its default read", () => {
  const launch = (id: string, operationId: string, state: "running" | "settled") => ({
    type: "assistant",
    id,
    content: [
      {
        type: "tool" as const,
        id: id + "-tool",
        name: "loginom_dock_node_apply",
        state: {
          status: state === "running" ? "completed" : "error",
          input: { finish: "execute", target: { type: "transform.calculator" } },
          metadata: { generation: 4, loginom: { v: 1, operationId, attempt: 1, state } },
        },
      },
    ],
  })
  const read = { kind: "tableRead", port: 0, portGuid: "port", rowsRead: 2, rowCount: 2 } satisfies Evidence
  const wait = {
    type: "assistant",
    id: "wait",
    content: [
      {
        type: "tool" as const,
        id: "wait-tool",
        name: "loginom_dock_node_wait",
        state: {
          status: "completed",
          metadata: {
            generation: 4,
            loginom: {
              v: 1,
              operationId: "ok",
              attempt: 1,
              state: "settled",
              status: "SUCCEEDED",
              evidence: [executed, read],
            },
          },
        },
      },
    ],
  }
  const result = appVerifiedSummary(
    [user("prompt"), launch("started", "ok", "running"), wait, launch("bad", "failed", "settled")],
    "prompt",
  )
  expect(result.facts.map(({ evidence }) => evidence)).toEqual([executed, read])
  expect(result.notVerified.filter(({ status }) => status === "unconfirmed")).toEqual([
    unconfirmed("noExecutionReceipt", ref("bad", "bad-tool")),
    unconfirmed("noTableReadReceipt", ref("bad", "bad-tool")),
  ])
})

test("summary RPC reads only the exact session in its Location", async () => {
  const location = { directory: "/project", workspaceID: "one" }
  const input = { sessionID: "ses_session", promptID: "msg_old_prompt" }
  const run = (session: { id: string; location: typeof location }) =>
    appVerifiedHandler(
      {
        get: async () => session,
        turnMessages: async ({ sessionID, promptID }) => {
          expect(String(sessionID)).toBe(input.sessionID)
          expect(String(promptID)).toBe(input.promptID)
          return [user(input.promptID), step("save", "save-op", saved)]
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

test("a late Save receipt resolves only the admitted Save in this turn", () => {
  const admission = {
    runtimeId: "32ef40ff-08d2-476a-ad73-1ef3feb17ce8",
    documentId: "doc",
    startSequence: 5,
  }
  const ambiguous = {
    type: "assistant",
    id: "save",
    content: [
      {
        type: "tool" as const,
        id: "save-tool",
        name: "loginom_dock_action_run",
        state: {
          status: "error",
          input: { action_key: "package.save_checkpoint" },
          metadata: {
            generation: 4,
            loginom: {
              v: 1,
              operationId: "save-1",
              state: "settled",
              status: "AMBIGUOUS",
              kind: "save",
              verificationRequest: { kind: "save", ...admission },
            },
          },
        },
      },
    ],
  }
  const inspect = (id: string, operationId: string, window: typeof admission) => {
    const message = step(id, operationId, saved, { ...window, confirmedSequence: 12 })
    return { ...message, content: message.content.map((part) => ({ ...part, name: "loginom_dock_operation_inspect" })) }
  }
  const history = [
    user("prompt"),
    ambiguous,
    inspect("other-operation", "foreign-save", admission),
    inspect("other-runtime", "save-1", { ...admission, runtimeId: "c58fbbe2-0983-44dc-ba70-abfcd876c880" }),
    inspect("other-document", "save-1", { ...admission, documentId: "foreign" }),
    inspect("other-admission", "save-1", { ...admission, startSequence: 6 }),
  ]
  const unverified = appVerifiedSummary(history, "prompt")
  expect(unverified.facts).toEqual([])
  expect(unverified.notVerified.filter(({ status }) => status === "unconfirmed")).toEqual([
    unconfirmed("noSaveReceipt", ref("save", "save-tool")),
  ])

  const verified = appVerifiedSummary([...history, inspect("inspection", "save-1", admission)], "prompt")
  expect(verified.facts.map(({ evidence, source }) => [evidence, source.toolCallID])).toEqual([
    [saved, "inspection-tool"],
  ])
  expect(verified.notVerified.some(({ reason }) => reason === "noSaveReceipt")).toBe(false)
  expect(appVerifiedSummary([...history, user("next"), inspect("inspection", "save-1", admission)], "next").facts).toEqual([])
})

test("a variables-only reread does not ask for table evidence; a table reread still does", () => {
  const read = (id: string, tableRead: boolean, status: string) => ({
    type: "assistant",
    id,
    content: [
      {
        type: "tool" as const,
        id: `${id}-tool`,
        name: "loginom_dock_node_read",
        state: {
          status,
          input: { source_operation_id: "previous-node" },
          metadata: {
            generation: 4,
            loginom: {
              v: 1,
              operationId: id,
              state: "settled",
              verificationRequest: { kind: "node", execute: false, tableRead },
            },
          },
        },
      },
    ],
  })
  const variables = read("variable-snapshot", false, "completed")
  expect(appVerifiedSummary([user("prompt"), variables], "prompt").notVerified).toContainEqual(
    notRequested("noTableReadReceipt"),
  )
  const result = appVerifiedSummary([user("prompt"), variables, read("table", true, "error")], "prompt")
  expect(result.notVerified.filter(({ status }) => status === "unconfirmed")).toEqual([
    unconfirmed("noTableReadReceipt", ref("table", "table-tool")),
  ])
})
