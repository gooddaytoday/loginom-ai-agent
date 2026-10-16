import { expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { watchAttemptIncidents } from "../src/run-incidents"

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

test("final observation retains a judge rate error even after a successful retry", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-judge-retry-incident-")), codes: string[] = []
  const watcher = watchAttemptIncidents(root, code => { codes.push(code) })
  try {
    await Bun.write(path.join(root, "judge-events-1.jsonl"), '{"type":"error","error":{"code":"rate_limit_exceeded"}}\n')
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
