import { expect, test } from "bun:test"
import type { DiagnosticsStatus } from "@loginom-ai-agent/loginom-host/diagnostics-rpc"
import { diagnosticsRows } from "./diagnostics-rows"

const operational: DiagnosticsStatus = {
  loginom: "ready",
  address: "http://127.0.0.1:8080/",
  model: "test/model",
  help: true,
  catalog: true,
  policy: "absent",
  policyFile: "policy.json",
  network: "device",
}

test("diagnostics reports all eight rows and points to settings or administrator action", () => {
  expect(diagnosticsRows(operational)).toEqual([
    { id: "loginom", ok: true, tab: "loginom" },
    { id: "model", ok: true, tab: "models" },
    { id: "help", ok: true, tab: "about" },
    { id: "catalog", ok: true, tab: "extensions" },
    { id: "policy", ok: true, tab: undefined },
    { id: "network", ok: true, tab: "general" },
    { id: "service", ok: true, tab: "servers" },
    { id: "journal", ok: false, tab: undefined },
  ])

  const issues = diagnosticsRows({
    ...operational,
    loginom: "failed",
    model: null,
    help: false,
    catalog: false,
    policy: "invalid",
  })

  expect(issues.filter((row) => !row.ok).map((row) => row.id)).toEqual([
    "loginom",
    "model",
    "help",
    "catalog",
    "policy",
    "network",
    "journal",
  ])
})

test("an unavailable agent service never reports stale healthy rows", () => {
  const rows = diagnosticsRows(undefined)
  expect(rows).toHaveLength(8)
  expect(rows.every((row) => !row.ok)).toBe(true)
  expect(rows.find((row) => row.id === "service")).toEqual({ id: "service", ok: false, tab: "servers" })
})
