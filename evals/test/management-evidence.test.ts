import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, readdir, rm, stat } from "node:fs/promises"
import { loadConfig } from "../src/config"
import { agentCommand } from "../src/cli"
import { management } from "../src/profile"
import { assertManagementBinding, managementIsReady, nodeManagementArguments, writeManagementEvidence } from "../src/management-evidence"
import type { superviseProcess } from "../src/process-supervisor"

type Result = Awaited<ReturnType<typeof superviseProcess>>
const fixture = (): Result => ({ stdout: '{"state":"ready","hasApiKey":true}', stderr: "", exitCode: 0, timedOut: false, interrupted: false, sandboxError: null,
  startedAt: 1, durationMs: 1, processCleanup: { status: "confirmed", error: null, capture_complete: true, processes: [], runtimeDirectories: [], writer: null } })
const binding = { owner: { issue: "LAB-57", task: "original-owner", role: "rich", phase: "eval", sha: "a".repeat(40) },
  acquiredAt: "2026-10-13T11:53:15.320Z", configSha256: "b".repeat(64), containerId: "c".repeat(64) }

test("management persists actual result privately before caller rejects non-ready view", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-management-durable-"))
  try {
    const profile = path.join(root, "profile")
    await Bun.write(path.join(profile, "state.json"), JSON.stringify({ state: "recoverable-error", failure: "private-secret", recoveries: ["private-secret"] }))
    const config = { ...loadConfig(["--dry-run"], {}), profileDir: profile }
    const cmd = agentCommand(config)
    const out = path.join(root, "evidence")
    const run = await management({ ...cmd, cleanupDir: out, cleanupSecrets: ["private-secret"],
      managementBinding: binding, env: { ...cmd.env, EVAL_FAKE_STATE_FILE: path.join(profile, "state.json") } }, nodeManagementArguments("status"))
    expect(run.exitCode).toBe(0)
    const attempt = path.join(out, (await readdir(out))[0]!)
    const safe = await Bun.file(path.join(attempt, "management-result.json")).json()
    expect(safe.view.state).toBe("recoverable-error")
    expect(safe.view.failure_present).toBe(true)
    expect(safe.view.recovery_count).toBe(1)
    expect(safe.stdout.sha256).toBe(new Bun.CryptoHasher("sha256").update(run.stdout).digest("hex"))
    expect(await Bun.file(path.join(attempt, "events.jsonl")).text()).toBe(run.stdout)
    expect((await stat(path.join(attempt, "events.jsonl"))).mode & 0o077).toBe(0)
    expect(JSON.stringify(safe)).not.toContain("private-secret")
    expect(safe.arguments).toEqual(["loginom", "status", "--format", "json", "--headless"])
    expect(safe.binding).toEqual(binding)
    expect(safe.process.capture_complete).toBe(true)
    expect((await stat(path.join(attempt, "stderr.txt"))).mode & 0o077).toBe(0)
    expect((await stat(path.join(attempt, "management-result.json"))).mode & 0o077).toBe(0)
    await expect(writeManagementEvidence(attempt, nodeManagementArguments("status"), run, binding)).rejects.toThrow("EEXIST")
    expect(await Bun.file(path.join(attempt, "management-result.json")).json()).toEqual(safe)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test.each(["status", "check"] as const)("native %s selects explicit headless once without model/run flags", operation => {
  expect(nodeManagementArguments(operation)).toEqual(["loginom", operation, "--format", "json", "--headless"])
})
test.each(["status", "check"] as const)("fake %s executes supported headless arguments", async operation => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-management-headless-"))
  try {
    await Bun.write(path.join(root, "profile", "state.json"), '{"state":"ready"}')
    const c = agentCommand({ ...loadConfig(["--dry-run"], {}), profileDir: path.join(root, "profile") })
    const r = await management({ ...c, cleanupDir: path.join(root, "proof"), env: { ...c.env, EVAL_FAKE_REQUIRE_HEADLESS: "1" } }, nodeManagementArguments(operation))
    expect(r.exitCode).toBe(0)
    expect(r.stderr).not.toContain("HEADLESS_REQUIRED")
    expect(r.processCleanup.status).toBe("confirmed")
  } finally { await rm(root, { recursive: true, force: true }) }
})
test("ready fixture is accepted without substituting starting", () => expect(managementIsReady(fixture())).toBe(true))
test.each(["", "not json", "null", "[]", '{"state":1}', '{"state":"starting"}', '{"state":"pending"}', '{"state":"unconfigured"}',
  '{"state":"recoverable-error"}', '{"state":"ready","failure":"secret"}', '{"state":"ready","recoveries":["pending"]}',
  '{"state":"ready","recoveries":"not-array"}', '{"state":"ready","recoveries":[null]}', '{"state":"ready","hasApiKey":false}',
  '{"state":"ready","failure":{}}', '{"state":"ready","hasApiKey":"yes"}'])("rejects non-ready/malformed output %s", stdout => {
  expect(managementIsReady({ ...fixture(), stdout })).toBe(false)
})
test.each(["exit", "timeout", "interruption", "sandbox", "cleanup", "capture", "unknown", "foreign", "cleanup-error"])("rejects offline result fixture %s gate", gate => {
  const r = fixture()
  if (gate === "exit") r.exitCode = 1
  if (gate === "timeout") r.timedOut = true
  if (gate === "interruption") r.interrupted = true
  if (gate === "sandbox") r.sandboxError = "private reason"
  if (gate === "cleanup") r.processCleanup.status = "failed"
  if (gate === "capture") r.processCleanup.capture_complete = false
  if (gate === "unknown") r.processCleanup.unknownProcesses = [{} as Result["processCleanup"]["processes"][number]]
  if (gate === "foreign") r.processCleanup.bindingRefusals = [{} as NonNullable<Result["processCleanup"]["bindingRefusals"]>[number]]
  if (gate === "cleanup-error") r.processCleanup.error = "unknown"
  expect(managementIsReady(r)).toBe(false)
})
test.each(["issue", "task", "role", "phase", "sha", "acquiredAt", "configSha256", "containerId"])("refuses altered binding %s", key => {
  const changed = structuredClone(binding)
  if (key in changed.owner) changed.owner[key as keyof typeof changed.owner] = "foreign"
  else changed[key as "acquiredAt" | "configSha256" | "containerId"] = "foreign"
  expect(() => assertManagementBinding(changed, binding)).toThrow("MANAGEMENT_BINDING_CHANGED")
})
test("safe diagnostic omits arbitrary secrets, unknown fields, stderr and argument values", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-management-secret-"))
  try {
    const r = { ...fixture(), stdout: '{"state":"secret-state","failure":"Bearer secret","recoveries":["password"],"token":"sk-private","nested":{"apiKey":"private-key"}}', stderr: "private stderr" }
    await Bun.write(path.join(out, "process-cleanup.json"), JSON.stringify(r.processCleanup))
    await Bun.write(path.join(out, "events.jsonl"), r.stdout)
    await Bun.write(path.join(out, "stderr.txt"), r.stderr)
    const safe = await writeManagementEvidence(out, ["loginom", "status", "--password", "private-argument"], r, binding)
    for (const secret of ["secret-state", "Bearer secret", "password", "sk-private", "private-key", "private stderr", "private-argument"]) expect(JSON.stringify(safe)).not.toContain(secret)
    expect(safe.view.state).toBe("unrecognized")
    expect(safe.view.failure_present).toBe(true)
    expect(safe.view.recovery_count).toBe(1)
    expect(safe.lower_exception).toContain("UNKNOWN")
  } finally { await rm(out, { recursive: true, force: true }) }
})
test("diagnostic hashes original capture bytes and detects capture/return mismatch", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-management-capture-"))
  try {
    const r = fixture()
    const raw = Buffer.from([0xff, 0x00, 0x41])
    await Bun.write(path.join(out, "process-cleanup.json"), JSON.stringify(r.processCleanup))
    await Bun.write(path.join(out, "events.jsonl"), raw)
    await Bun.write(path.join(out, "stderr.txt"), "")
    const safe = await writeManagementEvidence(out, nodeManagementArguments("status"), r, binding)
    expect(safe.stdout.bytes).toBe(3)
    expect(safe.stdout.sha256).toBe(new Bun.CryptoHasher("sha256").update(raw).digest("hex"))
    expect(safe.capture_matches_returned).toBe(false)
  } finally { await rm(out, { recursive: true, force: true }) }
})
