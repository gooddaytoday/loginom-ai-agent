import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rename, rm, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { acquireNodeStand, assertNodeStandOwner, nodeProcessOutput, nodeStandStatus, preflightNodeStand, recoverNodeStand, releaseNodeStand, reserveNodeRecovery, runNodeEvalOps, runNodeUnitChecks, type NodeOpsConfig } from "../src/node-eval-ops"
import { archiveProfileHistory } from "../src/profile"
import { superviseProcess } from "../src/process-supervisor"

async function runtime() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-node-ops-"))
  const role = (name: string) => ({ checkout: path.join(root, "checkouts", name), referenceProfile: path.join(root, "roles", name, "reference"),
    evalProfile: path.join(root, "roles", name, "eval"), workRoots: [path.join(root, "roles", name, "work")], resultsRoot: path.join(root, "roles", name, "results") })
  const config: NodeOpsConfig = { version: 1, runtimeRoot: root, endpoint: "http://localhost/app/", container: { name: "test", id: "b".repeat(64), storageDir: "/workdir/UserStorage/user" },
    cliBin: path.join(root, "cli", "bin", "loginom-ai-agent-cli"), roles: { rich: role("rich"), ben: role("ben") } }
  for (const item of Object.values(config.roles)) for (const directory of [item.checkout, item.referenceProfile, item.evalProfile, ...item.workRoots, item.resultsRoot])
    await mkdir(directory, { recursive: true, mode: 0o700 })
  await Bun.write(config.cliBin, "installed")
  return { config, dispose: () => rm(root, { recursive: true, force: true }) }
}

const owner = { issue: "LAB-16", task: "task-one", role: "rich" as const, phase: "eval" as const, sha: "a".repeat(40) }
const image = process.env.EVAL_TEST_LOGINOM_IMAGE ?? "sha256:5e3c79877de937aae168ecdcaf70c837bbbcf04e8f4262c2a976ac283ea394c2"
const dockerAvailable = Boolean(Bun.which("docker")) && (await Bun.$`docker image inspect ${image}`.quiet().nothrow()).exitCode === 0
const browserBusy = (await Bun.$`ps -u ${process.getuid?.() ?? ""} -o comm=`.quiet().nothrow()).text().split("\n").some(name => /^(chrome|chromium)([-\s]|$)/.test(name.trim()))

async function stand() {
  const fixture = await runtime()
  const container = (await Bun.$`docker run --rm -d --network none --entrypoint /bin/sh ${image} -c ${"sleep 120"}`.quiet()).text().trim()
  fixture.config.container = { ...fixture.config.container, name: container, id: container }
  await Bun.$`docker exec ${container} mkdir -p /workdir/UserStorage/user /workdir/SessionBackup`.quiet()
  const marker = path.join(fixture.config.runtimeRoot, "marker.json")
  await Bun.write(marker, JSON.stringify({ kind: "loginom-evals-isolated", version: 1, container_id: container,
    storage_dir: fixture.config.container.storageDir, roots: ["/workdir/UserStorage", "/workdir/SessionBackup"] }))
  await Bun.$`docker cp ${marker} ${`${container}:/workdir/.loginom-evals-isolated.json`}`.quiet()
  return { config: fixture.config, dispose: async () => {
    await Bun.$`docker rm -f ${container}`.quiet().nothrow()
    await fixture.dispose()
  } }
}

test("one persistent stand lease excludes simultaneous workers with different profiles", async () => {
  const fixture = await runtime()
  try {
    const attempts = await Promise.allSettled([acquireNodeStand(fixture.config, owner), acquireNodeStand(fixture.config, { ...owner, role: "ben", task: "task-two" })])
    expect(attempts.filter(item => item.status === "fulfilled")).toHaveLength(1)
    const status = await nodeStandStatus(fixture.config)
    expect(status.status).toBe("BUSY")
    expect(JSON.stringify(status)).not.toContain('"token"')
  } finally { await fixture.dispose() }
})

test("lease survives completed acquisition process and requires its exact owner token and inode", async () => {
  const fixture = await runtime()
  try {
    const lease = await acquireNodeStand(fixture.config, { ...owner, phase: "unit" })
    await assertNodeStandOwner(fixture.config, JSON.parse(JSON.stringify(lease)))
    await expect(assertNodeStandOwner(fixture.config, { ...lease, task: "foreign" })).rejects.toThrow("LEASE_OWNER_CHANGED")
    await expect(assertNodeStandOwner(fixture.config, { ...lease, token: crypto.randomUUID() })).rejects.toThrow("LEASE_OWNER_CHANGED")
    await expect(assertNodeStandOwner(fixture.config, { ...lease, inode: lease.inode + 1 })).rejects.toThrow("LEASE_OWNER_CHANGED")
    await expect(acquireNodeStand(fixture.config, { ...owner, task: "after-crash" })).rejects.toThrow("BUSY")
  } finally { await fixture.dispose() }
})

test("replaced lease directory or owner symlink never authorizes completion", async () => {
  const fixture = await runtime()
  try {
    const lease = await acquireNodeStand(fixture.config, owner)
    const locked = path.join(fixture.config.runtimeRoot, "operations/stand.lease")
    await rename(locked, `${locked}.saved`)
    await mkdir(locked, { mode: 0o700 })
    await Bun.write(path.join(locked, "owner.json"), JSON.stringify(lease))
    await expect(assertNodeStandOwner(fixture.config, lease)).rejects.toThrow("LEASE_IDENTITY_CHANGED")
    await rm(locked, { recursive: true })
    await rename(`${locked}.saved`, locked)
    await rename(path.join(locked, "owner.json"), path.join(locked, "outside.json"))
    await symlink(path.join(locked, "outside.json"), path.join(locked, "owner.json"))
    await expect(assertNodeStandOwner(fixture.config, lease)).rejects.toThrow()
  } finally { await fixture.dispose() }
})

test("completion without valid proof cannot release an owned stand", async () => {
  const fixture = await runtime()
  try {
    const lease = await acquireNodeStand(fixture.config, owner)
    const file = path.join(fixture.config.roles.rich.workRoots[0]!, "completion.json")
    await Bun.write(file, JSON.stringify({ status: "confirmed", cleanup: true }))
    await expect(releaseNodeStand(fixture.config, lease, file)).rejects.toThrow("INVALID_COMPLETION")
    expect((await nodeStandStatus(fixture.config)).status).toBe("BUSY")
  } finally { await fixture.dispose() }
})

test("admission refuses pending state in another role's profile without executing CLI", async () => {
  const fixture = await runtime()
  try {
    const lease = await acquireNodeStand(fixture.config, owner)
    await Bun.write(path.join(fixture.config.roles.ben.referenceProfile, "loginom/recovery/unresolved.json"), "{}")
    await expect(preflightNodeStand(fixture.config, lease, {})).rejects.toThrow("PROFILE_NOT_CLEAN")
    expect((await nodeStandStatus(fixture.config)).status).toBe("BUSY")
  } finally { await fixture.dispose() }
})

test("recovery cannot claim a profile without successful clean admission and same-lease evidence", async () => {
  const fixture = await runtime()
  try {
    const lease = await acquireNodeStand(fixture.config, owner)
    const writer = path.join(fixture.config.roles.rich.referenceProfile, ".writer/owner")
    await Bun.write(writer, "unexplained")
    await expect(recoverNodeStand(fixture.config, lease, "incident-one", path.join(fixture.config.roles.rich.workRoots[0]!, "missing.json"), {})).rejects.toThrow("ADMISSION_PROOF_REQUIRED")
    expect(await Bun.file(writer).text()).toBe("unexplained")
    expect((await nodeStandStatus(fixture.config)).status).toBe("BUSY")
  } finally { await fixture.dispose() }
})

test.skipIf(!dockerAvailable || browserBusy)("fixed unit commands produce process proof and release only after actual profile and storage checks", async () => {
  const fixture = await stand()
  try {
    const checkout = fixture.config.roles.rich.checkout
    await Bun.write(path.join(checkout, "evals/package.json"), JSON.stringify({ scripts: { typecheck: "bun -e 'process.exit(0)'" } }))
    await Bun.write(path.join(checkout, "evals/small.test.ts"), 'import {test,expect} from "bun:test"; test("unit",()=>expect(1).toBe(1));')
    const lease = await acquireNodeStand(fixture.config, { ...owner, phase: "unit" })
    const result = await runNodeUnitChecks(fixture.config, lease)
    expect(result.code).toBe(0)
    expect(result.evidence).toContain("stand.lease")
    const completion = await Bun.file(result.evidence).json()
    expect(completion.checks.map((check: { processes: { observation_mode: string } }) => check.processes.observation_mode)).toEqual(["unit_after_exit", "unit_after_exit"])
    await Bun.write(path.join(fixture.config.roles.ben.evalProfile, "loginom/connection/pending.json"), "{}")
    await expect(releaseNodeStand(fixture.config, lease, result.evidence)).rejects.toThrow("PROFILE_NOT_CLEAN")
    expect((await nodeStandStatus(fixture.config)).status).toBe("BUSY")
    await rm(path.join(fixture.config.roles.ben.evalProfile, "loginom/connection/pending.json"))
    const released = await releaseNodeStand(fixture.config, lease, result.evidence)
    expect(released.status).toBe("RELEASED")
    expect((await nodeStandStatus(fixture.config)).status).toBe("FREE")
  } finally { await fixture.dispose() }
}, 30_000)

test("CLI acquisition stores a private handle and busy/status JSON never exposes nonce", async () => {
  const fixture = await runtime()
  try {
    const config = path.join(fixture.config.runtimeRoot, "runtime.json")
    await Bun.write(config, JSON.stringify(fixture.config))
    await chmod(config, 0o600)
    const receipt = path.join(fixture.config.roles.rich.workRoots[0]!, "lease.json")
    const acquired = await runNodeEvalOps(["acquire", "--config", config, "--issue", owner.issue, "--task", owner.task, "--role", "rich", "--phase", "unit", "--sha", owner.sha, "--receipt", receipt], {})
    expect(acquired.code).toBe(0)
    const token = (await Bun.file(receipt).json()).token
    expect(JSON.stringify(acquired)).not.toContain(token)
    const status = await runNodeEvalOps(["status", "--config", config], {})
    expect(status.code).toBe(2)
    expect(status.status).toBe("BUSY")
    expect(JSON.stringify(status)).not.toContain(token)
  } finally { await fixture.dispose() }
})

test("offline code check preserves both summary and original code verdict and starts no lease/session", async () => {
  const fixture = await runtime()
  try {
    const role = fixture.config.roles.rich
    const run = path.join(role.resultsRoot, "recorded-run")
    const tasks = path.join(role.checkout, "evals/tasks/node-evals")
    const id = "crosstable-fixed-sum"
    await Bun.write(path.join(tasks, id, "task.json"), JSON.stringify({ id, checklist: [{ id: "crosstable", required: true }] }))
    await Bun.write(path.join(run, "summary.json"), JSON.stringify({ started_at: new Date().toISOString(), harness: { git_sha: "a".repeat(9), dirty: false },
      interrupted: false, stopped_reason: null, config: { repeat: 1 }, storage_leftovers: [], tasks: [{ id, attempts: [{ attempt: 1, status: "failed", cleanup_error: null,
        environment_cleanup: { status: "confirmed" }, session_id: "measured-product-fail", infra_retry: { initial: { status: "infra_error",
          stderr_head: "sensitive-sentinel", errors: ["sensitive-sentinel"], harness_error: "sensitive-sentinel" } } }] }] }))
    await Bun.write(path.join(run, id, "1/cleanup.json"), JSON.stringify({ processes: { status: "confirmed" },
      result: { status: "confirmed", error: null }, stages: ["processes", "diagnostics", "writer", "ready", "profile_history", "storage"].map(stage => ({ stage, status: "confirmed" })) }))
    await Bun.write(path.join(run, "code-verdict.json"), '{"historical":"immutable"}\n')
    const before = await Promise.all(["summary.json", "code-verdict.json"].map(name => Bun.file(path.join(run, name)).text()))
    const config = path.join(fixture.config.runtimeRoot, "runtime.json")
    await Bun.write(config, JSON.stringify(fixture.config))
    await chmod(config, 0o600)
    const result = await runNodeEvalOps(["check-run", "--config", config, "--run", run, "--ids", id, "--tasks", tasks], {})
    expect(result).toMatchObject({ code: 1, status: "FAIL", errorCount: 0 })
    expect(JSON.stringify(result)).not.toContain("sensitive-sentinel")
    expect(await Promise.all(["summary.json", "code-verdict.json"].map(name => Bun.file(path.join(run, name)).text()))).toEqual(before)
    expect((await nodeStandStatus(fixture.config)).status).toBe("FREE")
    expect(await Bun.file(path.join(role.evalProfile, "data/loginom-ai-agent.db")).exists()).toBe(false)
  } finally { await fixture.dispose() }
})

test("one durable operator recovery budget survives renamed incident and task continuation", async () => {
  const fixture = await runtime()
  try {
    const lease = await acquireNodeStand(fixture.config, owner)
    await reserveNodeRecovery(fixture.config, lease, "original-incident")
    await expect(reserveNodeRecovery(fixture.config, lease, "renamed-incident")).rejects.toThrow("RECOVERY_ALREADY_ATTEMPTED")
    await expect(reserveNodeRecovery(fixture.config, { ...lease, task: "new-task" }, "renamed-again")).rejects.toThrow("LEASE_OWNER_CHANGED")
    expect((await nodeStandStatus(fixture.config)).status).toBe("BUSY")
  } finally { await fixture.dispose() }
})

test("runtime roots refuse result/profile overlaps before acquisition", async () => {
  const fixture = await runtime()
  try {
    fixture.config.roles.ben.resultsRoot = fixture.config.roles.ben.evalProfile
    await expect(acquireNodeStand(fixture.config, owner)).rejects.toThrow("INVALID_CONFIG_PATH")
  } finally { await fixture.dispose() }
})

test("admitted lease refuses a changed configured target profile", async () => {
  const fixture = await runtime()
  try {
    const lease = await acquireNodeStand(fixture.config, owner)
    const alternate = path.join(fixture.config.runtimeRoot, "roles/rich/alternate-eval")
    await mkdir(alternate, { mode: 0o700 })
    fixture.config.roles.rich.evalProfile = alternate
    await expect(assertNodeStandOwner(fixture.config, lease)).rejects.toThrow("LEASE_IDENTITY_CHANGED")
  } finally { await fixture.dispose() }
})

test("owned process capture directory exists before supervisor opens output files", async () => {
  const fixture = await runtime()
  try {
    const lease = await acquireNodeStand(fixture.config, owner)
    const outDir = await nodeProcessOutput(fixture.config, lease, "native-check")
    const execution = await superviseProcess({ cmd: [process.execPath, "-e", "console.log('captured')"], cwd: fixture.config.roles.rich.workRoots[0]!,
      env: { PATH: process.env.PATH ?? "" }, outDir, timeoutMs: 5_000 })
    expect(execution.exitCode).toBe(0)
    expect(execution.processCleanup.status).toBe("confirmed")
    expect(await Bun.file(path.join(outDir, "events.jsonl")).text()).toContain("captured")
    expect(await Bun.file(path.join(outDir, "process-cleanup.json")).exists()).toBe(true)
  } finally { await fixture.dispose() }
}, 10_000)

test("stand acquired by a terminated CLI remains blocked for a new process", async () => {
  const fixture = await runtime()
  try {
    const config = path.join(fixture.config.runtimeRoot, "runtime.json")
    await Bun.write(config, JSON.stringify(fixture.config))
    await chmod(config, 0o600)
    const receipt = path.join(fixture.config.roles.rich.workRoots[0]!, "lease.json")
    const child = Bun.spawn([process.execPath, path.resolve(import.meta.dir, "../script/node-eval-ops.ts"), "acquire", "--config", config,
      "--issue", owner.issue, "--task", owner.task, "--role", "rich", "--phase", "eval", "--sha", owner.sha, "--receipt", receipt],
      { env: { PATH: process.env.PATH ?? "" }, stdout: "pipe", stderr: "pipe" })
    expect(await child.exited).toBe(0)
    await expect(acquireNodeStand(fixture.config, { ...owner, role: "ben", task: "after-crash" })).rejects.toThrow("BUSY")
    expect((await nodeStandStatus(fixture.config)).status).toBe("BUSY")
  } finally { await fixture.dispose() }
})

test.skipIf(!dockerAvailable || browserBusy)("real harness summary format releases a measured product FAIL and rejects missing process proof", async () => {
  const fixture = await stand()
  try {
    const role = fixture.config.roles.rich
    const id = "crosstable-fixed-sum"
    await Bun.write(path.join(role.checkout, "evals/tasks/node-evals", id, "task.json"), JSON.stringify({ id, checklist: [{ id: "crosstable", required: true }] }))
    await Bun.$`git init ${role.checkout}`.quiet()
    await Bun.$`git -C ${role.checkout} add .`.quiet()
    await Bun.$`git -C ${role.checkout} -c user.name=Fixture -c user.email=fixture@local commit -m fixture`.quiet()
    const sha = (await Bun.$`git -C ${role.checkout} rev-parse HEAD`.quiet()).text().trim()
    const lease = await acquireNodeStand(fixture.config, { ...owner, sha })
    const execution = await superviseProcess({ cmd: [Bun.which("bun")!, "-e", "process.exit(0)"], cwd: role.workRoots[0]!, env: { PATH: process.env.PATH ?? "" }, timeoutMs: 5_000 })
    await Bun.write(path.join(role.evalProfile, "data/session.txt"), "fixture evidence, no model executed")
    const historyArchive = await archiveProfileHistory(role.evalProfile, "fixture-attempt")
    const run = path.join(role.resultsRoot, "fresh-fail")
    await Bun.write(path.join(run, "summary.json"), JSON.stringify({ started_at: new Date().toISOString(), harness: { git_sha: sha.slice(0, 9), dirty: false },
      interrupted: false, stopped_reason: null, config: { repeat: 1 }, storage_leftovers: [], tasks: [{ id, attempts: [{ attempt: 1, status: "failed", cleanup_error: null,
        environment_cleanup: { status: "confirmed" }, session_id: "fixture" }] }] }))
    const cleanupFile = path.join(run, id, "1/cleanup.json")
    const cleanup = { result: { status: "confirmed", error: null }, processes: { ...execution.processCleanup, status: "failed" },
      stages: ["processes", "diagnostics", "writer", "ready", "profile_history", "storage"].map(stage => ({ stage, status: "confirmed", ...(stage === "profile_history" ? { path: historyArchive } : {}) })) }
    await Bun.write(cleanupFile, JSON.stringify(cleanup))
    await Bun.write(path.join(run, "code-verdict.json"), '{"verdict":"FAIL","code":1}\n')
    const evidence = path.join(role.workRoots[0]!, "completion.json")
    await Bun.write(evidence, JSON.stringify({ version: 1, owner: { issue: lease.issue, task: lease.task, role: lease.role, phase: lease.phase, sha: lease.sha },
      acquiredAt: lease.acquiredAt, kind: "eval", runDir: run, runSha: sha, caseIds: [id] }))
    await expect(releaseNodeStand(fixture.config, lease, evidence)).rejects.toThrow("EVAL_EVIDENCE_ERROR")
    await Bun.write(cleanupFile, JSON.stringify({ ...cleanup, processes: execution.processCleanup }))
    const before = await Bun.file(path.join(run, "summary.json")).text()
    const released = await releaseNodeStand(fixture.config, lease, evidence)
    expect(released.status).toBe("RELEASED")
    expect(await Bun.file(path.join(run, "summary.json")).text()).toBe(before)
    expect(await Bun.file(path.join(run, "code-verdict.json")).text()).toBe('{"verdict":"FAIL","code":1}\n')
    expect(await Bun.file(path.join(released.archive, "release.json")).exists()).toBe(true)
    const next = await acquireNodeStand(fixture.config, { ...owner, role: "ben", task: "next", sha })
    await assertNodeStandOwner(fixture.config, next)
  } finally { await fixture.dispose() }
}, 30_000)
