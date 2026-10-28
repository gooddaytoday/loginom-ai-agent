import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { watchAttemptIncidents } from "../src/run-incidents"

test("a judge lockdown mismatch interrupts admission before another task starts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-judge-config-incident-")), codes: string[] = []
  const controller = new AbortController()
  const watcher = watchAttemptIncidents(root, code => { codes.push(code); controller.abort() })
  try {
    await Bun.write(path.join(root, "judge-stderr-1.txt"), "CODEX_HOME must contain the same lockdown config.\n")
    await watcher.stop()
    expect(controller.signal.aborted).toBe(true)
    expect(codes).toEqual(["JUDGE_CONFIGURATION_MISMATCH"])
  } finally { await watcher.stop(); await rm(root, { recursive: true }) }
})

test("a live licence denial interrupts the run before the attempt completes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-live-incident-"))
  const controller = new AbortController(), codes: string[] = []
  const watcher = watchAttemptIncidents(root, code => { codes.push(code); controller.abort() })
  try {
    await Bun.write(path.join(root, "events.jsonl"), '{"type":"tool_use","part":{"state":{"error":"LICENSE_LIMIT_EXCEEDED"}}}\n')
    const deadline = Date.now() + 2000
    while (!controller.signal.aborted && Date.now() < deadline) await Bun.sleep(10)
    expect(controller.signal.aborted).toBe(true)
    expect(codes).toContain("LICENCE_DENIED")
  } finally { await watcher.stop(); await rm(root, { recursive: true }) }
})

test("ordinary judge stderr and agent text do not report a judge configuration mismatch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-judge-config-source-")), codes: string[] = []
  const watcher = watchAttemptIncidents(root, code => { codes.push(code) })
  try {
    await Bun.write(path.join(root, "stderr.txt"), "CODEX_HOME must contain the same lockdown config.\n")
    await Bun.write(path.join(root, "judge-stderr-1.txt"), "Judge did not produce a verdict.\n")
    await watcher.stop()
    expect(codes).toEqual([])
  } finally { await watcher.stop(); await rm(root, { recursive: true }) }
})

test("final observation retains a judge rate error even after a successful retry", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-judge-retry-incident-")), codes: string[] = []
  const watcher = watchAttemptIncidents(root, code => { codes.push(code) })
  try {
    await Bun.write(path.join(root, "judge-events-1.jsonl"), '{"type":"error","message":"exceeded retry limit, last status: 429 Too Many Requests"}\n')
    await Bun.write(path.join(root, "judge-events-2.jsonl"), '{"type":"turn.completed"}\n')
    await watcher.stop()
    expect(codes).toEqual(["PROVIDER_ERROR_OBSERVED"])
  } finally { await watcher.stop(); await rm(root, { recursive: true }) }
})

test("an ordinary request retry is not a shared incident", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-session-retry-")), codes: string[] = []
  const watcher = watchAttemptIncidents(root, code => { codes.push(code) })
  try {
    await Bun.write(path.join(root, "events.jsonl"), JSON.stringify({ type: "session.status", status: { type: "retry", message: "temporary issue" } }) + "\n")
    await watcher.stop()
    expect(codes).toEqual([])
  } finally { await watcher.stop(); await rm(root, { recursive: true }) }
})

test("a generic failed judge turn remains an infrastructure incident after a successful retry", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-judge-failed-turn-")), codes: string[] = []
  const watcher = watchAttemptIncidents(root, code => { codes.push(code) })
  try {
    await Bun.write(path.join(root, "judge-events-1.jsonl"), JSON.stringify({ type: "turn.failed", error: { message: "temporary issue" } }) + "\n")
    await Bun.write(path.join(root, "judge-events-2.jsonl"), '{"type":"turn.completed"}\n')
    await watcher.stop()
    expect(codes).toEqual(["PROVIDER_ERROR_OBSERVED"])
  } finally { await watcher.stop(); await rm(root, { recursive: true }) }
})

test("ordinary licence and remaining quota metadata do not stop a healthy attempt", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-healthy-incident-")), codes: string[] = []
  const watcher = watchAttemptIncidents(root, code => { codes.push(code) })
  try {
    await Bun.write(path.join(root, "events.jsonl"), '{"licensed":true,"license":"commercial","rate_limits":{"remaining":100}}\n')
    await watcher.stop()
    expect(codes).toEqual([])
  } finally { await watcher.stop(); await rm(root, { recursive: true }) }
})
