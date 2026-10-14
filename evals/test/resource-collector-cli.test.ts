import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { evalsRoot } from "../src/config"
import { writeLeaseReceipt } from "../src/lease"
import { superviseProcess } from "../src/process-supervisor"
import { parallelFixture } from "./helpers/parallel-fixture"

test("resource collector CLI observes private slots and drains on SIGINT under its trusted supervisor", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-cli-"))
  const abort = new AbortController()
  let cleanupConfirmed = true
  const fixture = await parallelFixture(root)
  const file = path.join(root, "slots.json")
  const out = path.join(root, "evidence", "samples.jsonl")
  await writeLeaseReceipt(file, fixture.slots)
  await Promise.all([path.dirname(out), path.join(root, "supervision")].map(dir => mkdir(dir, { mode: 0o700 })))
  cleanupConfirmed = false
  const pending = superviseProcess({ cmd: [process.execPath, path.join(evalsRoot, "script/sample-parallel-resources.ts"),
    "--config", file, "--out", out, "--interval-ms", "10", "--run-id", "run-1", "--phase", "before"],
    cwd: root, env: { PATH: process.env.PATH!, HOME: root }, timeoutMs: 10_000, signal: abort.signal,
    outDir: path.join(root, "supervision"), owner: { kind: "command", id: "resources" } })
  try {
    const deadline = Date.now() + 3000
    while (Date.now() < deadline) {
      if (await Bun.file(out).exists() && (await Bun.file(out).text()).split("\n").filter(Boolean).length >= 3) break
      await Bun.sleep(10)
    }
    abort.abort()
    const run = await pending
    cleanupConfirmed = run.processCleanup.status === "confirmed" && run.processCleanup.capture_complete
    expect(run.processCleanup.status).toBe("confirmed")
    expect(run.exitCode, run.stderr).toBe(0)
    const rows = (await Bun.file(out).text()).trim().split("\n").map(line => JSON.parse(line))
    expect(rows.length).toBeGreaterThanOrEqual(3)
    expect(JSON.parse(run.stdout).samples).toBe(rows.length)
    expect(rows.every(row => row.run_id === "run-1" && row.phase === "before")).toBe(true)
    expect(rows.every(row => row.containers === null)).toBe(true)
    const group = (await Bun.file("/proc/self/cgroup").text()).split("\n").find(line => line.startsWith("0::"))!.slice(3)
    expect(rows[0].host.collector_cgroup?.path).toBe(group)
    expect(rows[0].host.collector_cgroup.cpu_usage.usage_usec).toBeGreaterThan(0)
    expect(rows[0].host.collector_cgroup.memory_events.oom_kill).toBeGreaterThanOrEqual(0)
    expect(rows[0].host.filesystems.map((entry: { path: string }) => entry.path)).toEqual([
      fixture.slots.controller.stateDir, ...fixture.slots.slots.flatMap(slot => [slot.profileDir, slot.workspaceRoot, slot.historyDir]),
    ])
    expect((await stat(out)).mode & 0o777).toBe(0o600)
    expect(await Bun.file(fixture.slots.controller.adminCredentialsFile).exists()).toBe(false)
    expect(run.processCleanup.verification?.map(pass => pass.owned_remaining)).toEqual([0, 0])
  } finally {
    abort.abort()
    await pending.catch(() => {})
    if (cleanupConfirmed) await rm(root, { recursive: true, force: true })
  }
}, 30_000)

test("resource collector CLI refuses an unverified pair journal before writing samples", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-foreign-pair-"))
  let cleanupConfirmed = true
  try {
    const fixture = await parallelFixture(root)
    const file = path.join(root, "slots.json")
    const out = path.join(root, "samples.jsonl")
    await writeLeaseReceipt(file, fixture.slots)
    await writeLeaseReceipt(path.join(fixture.slots.controller.stateDir, "pair.json"), { version: 2, phase: "ready", resources: { server: "a".repeat(64) } })
    cleanupConfirmed = false
    const run = await superviseProcess({ cmd: [process.execPath, path.join(evalsRoot, "script/sample-parallel-resources.ts"),
      "--config", file, "--out", out], cwd: root, env: { PATH: process.env.PATH!, HOME: root }, timeoutMs: 500 })
    cleanupConfirmed = run.processCleanup.status === "confirmed" && run.processCleanup.capture_complete
    expect(run.processCleanup.status).toBe("confirmed")
    expect(run.exitCode, run.stderr).toBe(2)
    expect(run.stderr).toContain("RESOURCE_PAIR_UNVERIFIED")
    expect(await Bun.file(out).exists()).toBe(false)
  } finally { if (cleanupConfirmed) await rm(root, { recursive: true, force: true }) }
}, 15_000)

test("resource collector CLI supports the base interface and stops on SIGTERM without inventing run metadata", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-term-"))
  let cleanupConfirmed = true
  try {
    const fixture = await parallelFixture(root)
    const file = path.join(root, "slots.json")
    const out = path.join(root, "samples.jsonl")
    const script = path.join(root, "terminate.ts")
    await writeLeaseReceipt(file, fixture.slots)
    await Bun.write(script, `const child = Bun.spawn(${JSON.stringify([process.execPath, path.join(evalsRoot, "script/sample-parallel-resources.ts"), "--config", file, "--out", out])},
{env:{PATH:process.env.PATH,HOME:${JSON.stringify(root)}},stdout:"pipe",stderr:"pipe"})
const deadline = Date.now() + 5000
while (Date.now() < deadline) {
  if (await Bun.file(${JSON.stringify(out)}).exists() && (await Bun.file(${JSON.stringify(out)}).text()).split("\\n").filter(Boolean).length >= 2) break
  await Bun.sleep(10)
}
child.kill("SIGTERM")
const [code,stdout,stderr] = await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()])
console.log(JSON.stringify({code,stdout,stderr}))
`)
    cleanupConfirmed = false
    const run = await superviseProcess({ cmd: [process.execPath, script], cwd: root, env: { PATH: process.env.PATH!, HOME: root }, timeoutMs: 10_000 })
    cleanupConfirmed = run.processCleanup.status === "confirmed" && run.processCleanup.capture_complete
    expect(run.processCleanup.status).toBe("confirmed")
    expect(run.exitCode).toBe(0)
    const result = JSON.parse(run.stdout)
    expect(result.code).toBe(0)
    expect(result.stderr).toBe("")
    const rows = (await Bun.file(out).text()).trim().split("\n").map(line => JSON.parse(line))
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(rows.every(row => row.interval_ms === 1000 && row.run_id === null && row.phase === null)).toBe(true)
    expect(JSON.parse(result.stdout).samples).toBe(rows.length)
  } finally { if (cleanupConfirmed) await rm(root, { recursive: true, force: true }) }
}, 20_000)

test("resource collector CLI refuses evidence inside an agent profile before writing samples", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-exposed-"))
  let cleanupConfirmed = true
  try {
    const fixture = await parallelFixture(root)
    const file = path.join(root, "slots.json")
    const out = path.join(fixture.slots.slots[0]!.profileDir, "samples.jsonl")
    await writeLeaseReceipt(file, fixture.slots)
    cleanupConfirmed = false
    const run = await superviseProcess({ cmd: [process.execPath, path.join(evalsRoot, "script/sample-parallel-resources.ts"),
      "--config", file, "--out", out, "--interval-ms", "10"], cwd: root, env: { PATH: process.env.PATH!, HOME: root }, timeoutMs: 500 })
    cleanupConfirmed = run.processCleanup.status === "confirmed" && run.processCleanup.capture_complete
    expect(run.processCleanup.status).toBe("confirmed")
    expect(run.exitCode).toBe(2)
    expect(run.stderr).toContain("RESOURCE_OUTPUT_EXPOSED")
    expect(await Bun.file(out).exists()).toBe(false)
  } finally { if (cleanupConfirmed) await rm(root, { recursive: true, force: true }) }
}, 15_000)

for (const key of ["OPENAI_API_KEY", "LOGINOM_ADMIN_PASSWORD", "EVAL_AGENT_PROVIDER_API_KEY", "JUDGE_API_KEY"]) test(`resource collector CLI refuses ${key} before reading configuration or writing evidence`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-resource-env-"))
  let cleanupConfirmed = true
  try {
    const file = path.join(root, "missing-slots.json")
    const out = path.join(root, "samples.jsonl")
    cleanupConfirmed = false
    const run = await superviseProcess({ cmd: [process.execPath, path.join(evalsRoot, "script/sample-parallel-resources.ts"),
      "--config", file, "--out", out, "--interval-ms", "10"], cwd: root,
      env: { PATH: process.env.PATH!, HOME: root, [key]: "collector-env-canary" }, timeoutMs: 500 })
    cleanupConfirmed = run.processCleanup.status === "confirmed" && run.processCleanup.capture_complete
    expect(run.processCleanup.status).toBe("confirmed")
    expect(run.exitCode).toBe(2)
    expect(run.stderr).toContain("RESOURCE_ENVIRONMENT_PRIVATE")
    expect(run.stdout + run.stderr).not.toContain("collector-env-canary")
    expect(await Bun.file(out).exists()).toBe(false)
  } finally { if (cleanupConfirmed) await rm(root, { recursive: true, force: true }) }
}, 15_000)
