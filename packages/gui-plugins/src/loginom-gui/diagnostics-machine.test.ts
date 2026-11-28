import { expect, test } from "bun:test"
import type { DiagnosticsStatus } from "@loginom-ai-agent/loginom-host/diagnostics-rpc"
import { initial, transition, view } from "./diagnostics-machine"
import { diagnosticsRows } from "./diagnostics-rows"

const operational: DiagnosticsStatus = {
  loginom: "ready",
  address: "http://127.0.0.1:8080/",
  model: { id: "test/model", available: true },
  help: true,
  catalog: "unchecked",
  policy: "absent",
  policyFile: "policy.json",
  network: "device",
}

test("diagnostics reports all eight rows and points to settings or administrator action", () => {
  expect(diagnosticsRows(operational)).toEqual([
    { id: "loginom", ok: true, tab: "loginom" },
    { id: "model", ok: true, tab: "models" },
    { id: "help", ok: true, tab: "about" },
    { id: "catalog", ok: null, tab: "extensions" },
    { id: "policy", ok: true, tab: undefined },
    { id: "network", ok: true, tab: "general" },
    { id: "service", ok: true, tab: "servers" },
    { id: "journal", ok: null, tab: undefined },
  ])

  const issues = diagnosticsRows({
    ...operational,
    loginom: "failed",
    model: { id: "test/disabled", available: false },
    help: false,
    policy: "invalid",
  })

  expect(issues.filter((row) => row.ok === false).map((row) => row.id)).toEqual([
    "loginom",
    "model",
    "help",
    "policy",
    "network",
  ])
})

test("an unavailable agent service never reports stale healthy rows", () => {
  const available = open()
  const checking = transition(available, { type: "check" }).state
  const failed = transition(checking, { type: "status", attempt: checking.attempt, status: undefined }).state
  const result = view(failed, true)
  expect(result.rows).toHaveLength(8)
  expect(result.problems).toHaveLength(7)
  expect(result.problems).toContainEqual({ id: "service", ok: false, tab: "servers" })
  expect(result.canSave).toBe(false)
  expect(result.canCheck).toBe(true)
})

function open() {
  const loading = transition(initial, { type: "target", available: true }).state

  return transition(loading, { type: "status", attempt: loading.attempt, status: operational }).state
}

test("a successful check finds no issues in the rows it checked", () => {
  const checking = transition(open(), { type: "check" }).state
  expect(view(checking, true)).toMatchObject({ problems: undefined, canCheck: false, canSave: false })

  const checked = transition(checking, { type: "status", attempt: checking.attempt, status: operational }).state
  expect(view(checked, true)).toMatchObject({ problems: [], canCheck: true, canSave: true })
})

test("a save blocks duplicate work and settles whether it writes, is cancelled or fails", () => {
  const ready = open()
  expect(view(ready, false).canSave).toBe(false)
  expect(transition(ready, { type: "save", available: false }).state).toBe(ready)

  const saving = transition(ready, { type: "save", available: true }).state
  expect(transition(saving, { type: "save", available: true }).state).toBe(saving)
  expect(transition(saving, { type: "check" }).state).toBe(saving)

  for (const report of [{ type: "saved", path: "report.json" }, undefined, { type: "failed" }] as const) {
    const completed = transition(saving, { type: "report", attempt: saving.attempt, report }).state
    expect(view(completed, true)).toMatchObject({ canSave: true, saving: false, report })
  }
})

test("target changes and disposal ignore reports and status from older attempts", () => {
  const saving = transition(open(), { type: "save", available: true }).state
  const reloading = transition(saving, { type: "target", available: true }).state
  const lateSave = { type: "report", attempt: saving.attempt, report: { type: "saved", path: "old.json" } } as const
  expect(transition(reloading, lateSave).state).toBe(reloading)

  const oldStatus = { type: "status", attempt: reloading.attempt, status: operational } as const
  const nextTarget = transition(reloading, { type: "target", available: true }).state
  expect(transition(nextTarget, oldStatus).state).toBe(nextTarget)

  const disposed = transition(nextTarget, { type: "disposed" }).state
  expect(transition(disposed, { ...oldStatus, attempt: nextTarget.attempt }).state).toBe(disposed)
})
