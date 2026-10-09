import { expect, test } from "bun:test"
import { chmod, copyFile, mkdir, mkdtemp, rename, rm, stat, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { acquireNodeHarnessLease, acquireNodeStand, assertNodeStandOwner, nodeProcessOutput, nodeStandStatus, ownedRecoveryEntry, preflightNodeStand, recoverNodeStand, releaseNodeStand, reserveNodeRecovery, reserveOwnedRegistrationContinuation, runNodeEvalOps, runNodeUnitChecks, settleNodeWriterRelease, type NodeOpsConfig } from "../src/node-eval-ops"
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

test("admission refuses another profile's harness lease even after its recorded PID disappears", async () => {
  const fixture = await runtime()
  try {
    const lease = await acquireNodeStand(fixture.config, owner)
    await Bun.write(path.join(`${fixture.config.roles.ben.evalProfile}.harness-lease`, "owner.json"), JSON.stringify({ pid: 99999999 }))
    await expect(preflightNodeStand(fixture.config, lease, {})).rejects.toThrow("HARNESS_PROFILE_BUSY")
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

test("writer-release settlement requires the original clean admission before observing or writing proof", async () => {
  const fixture = await runtime()
  try {
    const lease = await acquireNodeStand(fixture.config, owner)
    const cfg = path.join(fixture.config.roles.rich.workRoots[0]!, "config.json")
    const receipt = path.join(fixture.config.roles.rich.workRoots[0]!, "lease.json")
    const output = path.join(fixture.config.roles.rich.workRoots[0]!, "settlement.json")
    await Bun.write(cfg, JSON.stringify(fixture.config)); await chmod(cfg, 0o600)
    await Bun.write(receipt, JSON.stringify(lease)); await chmod(receipt, 0o600)
    const result = await runNodeEvalOps(["settle-writer-release", "--config", cfg, "--lease", receipt,
      "--incident", "writer-release-incident", "--evidence", path.join(fixture.config.roles.rich.resultsRoot, "original.json"),
      "--receipt", output, "--profile", "eval", "--followup-task", "followup-task"])
    expect(result.reason).toBe("ADMISSION_PROOF_REQUIRED")
    expect(await Bun.file(output).exists()).toBe(false)
  } finally { await fixture.dispose() }
})

test("LAB-31 owned-registration continuation requires original admission before any mutation", async () => {
  const f=await runtime()
  try {
    const lease=await acquireNodeStand(f.config,owner)
    const cfg=path.join(f.config.roles.rich.workRoots[0]!,"config.json"),handle=path.join(f.config.roles.rich.workRoots[0]!,"lease.json")
    await Bun.write(cfg,JSON.stringify(f.config));await chmod(cfg,0o600)
    await Bun.write(handle,JSON.stringify(lease));await chmod(handle,0o600)
    const result=await runNodeEvalOps(["lab31-owned-registration","--config",cfg,"--lease",handle,
      "--evidence",path.join(f.config.roles.rich.workRoots[0]!,"recovery.json"),"--admission",path.join(f.config.roles.rich.workRoots[0]!,"admission.json"),"--followup-task","followup"])
    expect(result.reason).toBe("ADMISSION_PROOF_REQUIRED")
    expect(await Bun.file(path.join(f.config.runtimeRoot,"operations/stand.lease/owned-registration-once.json")).exists()).toBe(false)
  } finally {await f.dispose()}
})

test("owned registration once receipt is durable, hash-bound and cannot reset an ATTEMPTED reservation", async () => {
  const f=await runtime()
  try {
    const lease=await acquireNodeStand(f.config,owner)
    const incident="LAB-31-product-namefix-v1-multi-facts-writer-owner-unavailable"
    const attempted=await reserveNodeRecovery(f.config,lease,incident),bytes=await Bun.file(attempted).text()
    const hash=new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
    await expect(reserveOwnedRegistrationContinuation(f.config,lease,"0".repeat(64),"b".repeat(40),"followup")).rejects.toThrow("CONTINUATION_RESERVATION_UNKNOWN")
    const once=await reserveOwnedRegistrationContinuation(f.config,lease,hash,"b".repeat(40),"followup")
    const receipt=await Bun.file(once).json()
    expect(receipt.status).toBe("CONSUMED_BEFORE_MUTATION");expect(receipt.originalSha256).toBe(hash)
    expect(receipt.newSha).toBe("b".repeat(40));expect((await stat(once)).mode & 0o077).toBe(0)
    await expect(reserveOwnedRegistrationContinuation(f.config,lease,hash,"c".repeat(40),"renamed-followup")).rejects.toThrow("CONTINUATION_ALREADY_ATTEMPTED")
    await expect(reserveNodeRecovery(f.config,lease,incident)).rejects.toThrow("RECOVERY_ALREADY_ATTEMPTED")
    expect(await Bun.file(attempted).text()).toBe(bytes)
    expect((await nodeStandStatus(f.config)).status).toBe("BUSY")
  } finally {await f.dispose()}
})

test("owned registration once refuses altered owner/acquiredAt/incident instead of granting mutation", async () => {
  for(const change of ["owner","acquiredAt","incident"]) {
    const f=await runtime()
    try {
      const lease=await acquireNodeStand(f.config,owner)
      const attempted=await reserveNodeRecovery(f.config,lease,"LAB-31-product-namefix-v1-multi-facts-writer-owner-unavailable")
      const value=await Bun.file(attempted).json()
      if(change==="owner")value.owner.task="foreign";else value[change]="foreign"
      await Bun.write(attempted,JSON.stringify(value))
      const hash=new Bun.CryptoHasher("sha256").update(await Bun.file(attempted).text()).digest("hex")
      await expect(reserveOwnedRegistrationContinuation(f.config,lease,hash,"b".repeat(40),"followup")).rejects.toThrow("CONTINUATION_RESERVATION_UNKNOWN")
      expect(await Bun.file(path.join(f.config.runtimeRoot,"operations/stand.lease/owned-registration-once.json")).exists()).toBe(false)
    } finally {await f.dispose()}
  }
})

test.skipIf(!dockerAvailable || browserBusy)("owned registration release admits only its exact lease-local attested settlement", async () => {
  const f=await stand()
  try {
    const lease=await acquireNodeStand(f.config,owner),incident="LAB-31-product-namefix-v1-multi-facts-writer-owner-unavailable"
    const attempted=await reserveNodeRecovery(f.config,lease,incident)
    await reserveOwnedRegistrationContinuation(f.config,lease,new Bun.CryptoHasher("sha256").update(await Bun.file(attempted).text()).digest("hex"),"b".repeat(40),"followup")
    const run=await superviseProcess({cmd:[process.execPath,"-e","await Bun.sleep(100)"],cwd:f.config.roles.rich.checkout,env:{PATH:process.env.PATH??""},timeoutMs:5000})
    expect(run.processCleanup.status).toBe("confirmed")
    const source=path.join(f.config.roles.rich.resultsRoot,"original/cleanup.json")
    await Bun.write(source,"original fixture");await Bun.write(path.join(path.dirname(source),"result.json"),"original result fixture")
    const hash=async(p:string)=>new Bun.CryptoHasher("sha256").update(await Bun.file(p).arrayBuffer()).digest("hex")
    const base=path.join(f.config.runtimeRoot,"operations/stand.lease")
    const evidence=path.join(base,"owned-registration-processes.json")
    const proof={version:1,owner,acquiredAt:lease.acquiredAt,incident,profile:"eval",operation:"LAB-31-owned-registration-v1",
      original:{path:source,sha256:await hash(source),resultSha256:await hash(path.join(path.dirname(source),"result.json"))},
      processes:{...run.processCleanup,observation_mode:"writer_release_settlement"}}
    await Bun.write(evidence,JSON.stringify(proof));await chmod(evidence,0o600)
    const attestation={owner,acquiredAt:lease.acquiredAt,incident,profile:"eval",evidence,evidenceSha256:await hash(evidence),original:proof.original}
    await Bun.write(path.join(base,"owned-registration-settlement-attestation.json"),JSON.stringify(attestation));await chmod(path.join(base,"owned-registration-settlement-attestation.json"),0o600)
    const historyArchive=await archiveProfileHistory(f.config.roles.rich.evalProfile,"fixture")
    const receipt=path.join(base,"owned-registration-settled.json")
    await Bun.write(receipt,JSON.stringify({status:"SETTLED",owner,acquiredAt:lease.acquiredAt,profile:"eval",historyArchive,processEvidence:evidence}));await chmod(receipt,0o600)
    const completion=path.join(base,"completion.json")
    await Bun.write(completion,JSON.stringify({version:1,owner,acquiredAt:lease.acquiredAt,kind:"recovery",receipt,profile:"eval",historyArchive,processEvidence:evidence}));await chmod(completion,0o600)
    // Altered or ordinary process proof cannot substitute for the continuation's attested proof.
    await Bun.write(evidence,JSON.stringify({...proof,operation:undefined,processes:run.processCleanup}))
    await expect(releaseNodeStand(f.config,lease,completion)).rejects.toThrow()
    expect((await nodeStandStatus(f.config)).status).toBe("BUSY")
    await Bun.write(evidence,JSON.stringify(proof));await chmod(evidence,0o600)
    expect((await releaseNodeStand(f.config,lease,completion)).status).toBe("RELEASED")
    expect((await nodeStandStatus(f.config)).status).toBe("FREE")
  } finally {await f.dispose()}
},30_000)

test("recovery admits only the exact empty package lock bound by a settlement", () => {
  const lock = { name: ".fixture.lgp.lck", kind: "package_lock", package_path: "/user/fixture.lgp",
    sha256: new Bun.CryptoHasher("sha256").update("").digest("hex") }
  expect(ownedRecoveryEntry(lock, "/user/fixture.lgp")).toBe(true)
  expect(ownedRecoveryEntry(lock)).toBe(false)
  for (const changed of [{ name: ".foreign.lgp.lck" }, { kind: "ordinary" }, { package_path: "/user/foreign.lgp" },
    { sha256: "a".repeat(64) }, { name: "../.fixture.lgp.lck" }, { name: "/.fixture.lgp.lck" }])
    expect(ownedRecoveryEntry({ ...lock, ...changed }, "/user/fixture.lgp")).toBe(false)
  expect(ownedRecoveryEntry(lock, "/foreign/fixture.lgp")).toBe(false)
  expect(ownedRecoveryEntry({ name: "owned.csv" })).toBe(true)
})

test.skipIf(!dockerAvailable || browserBusy)("writer-release settlement binds immutable source/admission and refuses altered proof before recovery reservation", async () => {
  const f = await stand()
  try {
    await copyFile(process.execPath, f.config.cliBin); await chmod(f.config.cliBin, 0o755)
    const lease = await acquireNodeStand(f.config, owner)
    const admission = path.join(f.config.runtimeRoot, "operations/stand.lease/admission.json")
    await Bun.write(admission, JSON.stringify({ owner, acquiredAt: lease.acquiredAt, containerId: lease.containerId,
      configSha256: lease.configSha256, profiles: Object.values(f.config.roles).flatMap(role => [role.referenceProfile, role.evalProfile]) }))
    await chmod(admission, 0o600)
    const profile = f.config.roles.rich.evalProfile
    const directory = path.join(profile, "loginom/runtime/generations/1/chats/fixture/attempts/one")
    await mkdir(directory, { recursive: true })
    await Bun.write(path.join(profile, ".writer/owner"), "original-owner")
    const writer = await stat(path.join(profile, ".writer"))
    const run = await superviseProcess({ cmd: [f.config.cliBin, "-e", "await Bun.sleep(100);process.exit(0)"],
      cwd: f.config.roles.rich.checkout, env: { PATH: process.env.PATH ?? "" }, timeoutMs: 5000 })
    expect(run.processCleanup.status).toBe("confirmed")
    // Historical-error fixture; the process identities and filesystem identity are genuine observations.
    const processes = { ...run.processCleanup, status: "failed", error: "Writer owner unavailable", runtimeDirectories: [directory],
      writer: { device: writer.dev, inode: writer.ino, owner: "original-owner" } }
    await rm(path.join(profile, ".writer"), { recursive: true })
    const source = path.join(f.config.roles.rich.resultsRoot, "attempt/cleanup.json")
    await Bun.write(source, JSON.stringify({ processes, result: { status: "failed", error: processes.error } }))
    await Bun.write(path.join(path.dirname(source), "result.json"), JSON.stringify({ status: "completed", session_id: "fixture-session",
      package_path: "/user/fixture.lgp", environment_cleanup: { status: "failed", error: processes.error } }))
    const before = await Bun.file(source).text()
    const proof = path.join(f.config.roles.rich.workRoots[0]!, "settlement.json")
    const result = await settleNodeWriterRelease(f.config, lease, "writer-incident", "eval", "followup", source, proof)
    expect(result.status).toBe("PROCESS_SETTLED")
    expect(await Bun.file(source).text()).toBe(before)
    expect((await Bun.file(proof).json()).processes.observation_mode).toBe("writer_release_settlement")
    await expect(settleNodeWriterRelease(f.config, lease, "renamed-incident", "eval", "followup", source, proof+".second")).rejects.toThrow("SETTLEMENT_ALREADY_RECORDED")
    const recovery = path.join(f.config.roles.rich.workRoots[0]!, "recovery.json")
    await Bun.write(recovery, JSON.stringify({ version: 1, owner, acquiredAt: lease.acquiredAt, profile: "eval", processEvidence: proof }))
    await Bun.write(proof, (await Bun.file(proof).text()) + " ")
    await expect(recoverNodeStand(f.config, lease, "writer-incident", recovery, {})).rejects.toThrow("SETTLEMENT_PROOF_UNKNOWN")
    expect(await Bun.file(path.join(f.config.runtimeRoot, "operations/recovery-incidents")).exists()).toBe(false)
    expect((await nodeStandStatus(f.config)).status).toBe("BUSY")
  } finally { await f.dispose() }
}, 30_000)

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


test("recovery refusal before admission leaves a safe diagnostic receipt with no dispatch", async()=>{
 const f=await runtime();
 try {
  const lease=await acquireNodeStand(f.config,owner),cfg=path.join(f.config.runtimeRoot,'config.json'),handle=path.join(f.config.roles.rich.workRoots[0]!,'lease.json'),diagnostic=path.join(f.config.roles.rich.workRoots[0]!,'diagnostic.json');
  for(const [file,value] of [[cfg,f.config],[handle,lease]] as const){await Bun.write(file,JSON.stringify(value));await chmod(file,0o600)}
  const result=await runNodeEvalOps(['recover','--config',cfg,'--lease',handle,'--incident','one','--evidence',diagnostic+'.missing','--diagnostic',diagnostic],{SECRET:'never-include-me'});
  expect(result.reason).toBe('ADMISSION_PROOF_REQUIRED');
  const proof=await Bun.file(diagnostic).json();
  expect(proof).toMatchObject({operation:'recover',stage:'admission',dispatch:'not_started',reason:'ADMISSION_PROOF_REQUIRED'});
  expect(JSON.stringify(proof)).not.toContain('never-include-me');
  expect((await stat(diagnostic)).mode&0o777).toBe(0o600);
 } finally {await f.dispose()}
});


test("node harness admission is bound to its stand owner and the exact configured profile", async()=>{
 const f=await runtime();
 try {
  const lease=await acquireNodeStand(f.config,owner),admission=path.join(f.config.runtimeRoot,'operations/stand.lease/admission.json');
  await Bun.write(admission,JSON.stringify({owner,acquiredAt:lease.acquiredAt,containerId:lease.containerId,configSha256:lease.configSha256,profiles:Object.values(f.config.roles).flatMap(r=>[r.referenceProfile,r.evalProfile])}));await chmod(admission,0o600);
  const lock=await acquireNodeHarnessLease(f.config,lease,f.config.roles.rich.evalProfile);
  const binding=await Bun.file(lock.receipt+'.stand').json();
  expect(binding).toMatchObject({owner,acquiredAt:lease.acquiredAt,profile:f.config.roles.rich.evalProfile});
  expect(binding.receiptSha256).toHaveLength(64);
  await lock.release();
  await expect(acquireNodeHarnessLease(f.config,lease,f.config.roles.ben.evalProfile)).rejects.toThrow('HARNESS_OWNER_UNKNOWN');
 }finally{await f.dispose()}
});

test.skipIf(!dockerAvailable || browserBusy)("normal recovery removes its owned registration and harness guard then releases and admits the next run", async () => {
  const f = await stand()
  try {
    const compiled=await Bun.$`${process.execPath} build ${path.resolve(import.meta.dir,'../fixtures/fake-cli.ts')} --compile --outfile ${f.config.cliBin}`.quiet();expect(compiled.exitCode).toBe(0)
    // Installed management fixture has a pinned dormant browser identity; no browser or model starts.
    const resources=path.join(path.dirname(path.dirname(f.config.cliBin)),'resources/loginom');
    await mkdir(resources,{recursive:true});await copyFile('/bin/sleep',path.join(resources,'chrome'));
    await Bun.write(path.join(resources,'resource-manifest.json'),JSON.stringify({browser:'chrome'}));
    const lease = await acquireNodeStand(f.config, owner)
    const admission = path.join(f.config.runtimeRoot, "operations/stand.lease/admission.json")
    await Bun.write(admission, JSON.stringify({ owner, acquiredAt: lease.acquiredAt, containerId: lease.containerId,
      configSha256: lease.configSha256, profiles: Object.values(f.config.roles).flatMap(role => [role.referenceProfile, role.evalProfile]) }))
    await chmod(admission, 0o600)
    const profile = f.config.roles.rich.evalProfile
    const cfg=path.join(f.config.runtimeRoot,'config.json'),leaseFile=path.join(f.config.roles.rich.workRoots[0]!,'lease.json');
    for(const [file,value] of [[cfg,f.config],[leaseFile,lease]] as const){await Bun.write(file,JSON.stringify(value));await chmod(file,0o600)}
    const module=path.resolve(import.meta.dir,'../src/node-eval-ops.ts');
    const harness=await superviseProcess({cmd:[process.execPath,'-e',`const {acquireRunHarnessLease}=await import(${JSON.stringify(module)});await acquireRunHarnessLease(${JSON.stringify(profile)},process.env);`],cwd:f.config.roles.rich.checkout,
      env:{PATH:process.env.PATH??'',EVAL_NODE_OPS_CONFIG:cfg,EVAL_NODE_STAND_LEASE:leaseFile},timeoutMs:5000});expect(harness.exitCode).toBe(0);
    const directory = path.join(profile, "loginom/runtime/generations/1/chats/fixture/attempts/one")
    await mkdir(directory, { recursive: true })
    await Bun.write(path.join(profile, ".writer/owner"), "original-owner")
    const writer = await stat(path.join(profile, ".writer"))
    const run = await superviseProcess({ cmd: [f.config.cliBin, "loginom", "status"],
      cwd: f.config.roles.rich.checkout, env: { PATH: process.env.PATH ?? "" }, timeoutMs: 5000 })
    expect(run.processCleanup.status).toBe("confirmed")
    // Historical-error fixture; the process identities and filesystem identity are genuine observations.
    const processes = { ...run.processCleanup, status: "failed", error: "Writer owner unavailable", runtimeDirectories: [directory],
      writer: { device: writer.dev, inode: writer.ino, owner: "original-owner" } }
    await rm(path.join(profile, ".writer"), { recursive: true })
    await Bun.write(`${profile}.process-group`,String(run.processCleanup.launcher!.pid));await chmod(`${profile}.process-group`,0o600);
    const source = path.join(f.config.roles.rich.resultsRoot, "attempt/cleanup.json")
    await Bun.write(source, JSON.stringify({ processes, result: { status: "failed", error: processes.error } }))
    await Bun.write(path.join(path.dirname(source), "result.json"), JSON.stringify({ status: "completed", session_id: "fixture-session",
      package_path: "/user/fixture.lgp", environment_cleanup: { status: "failed", error: processes.error } }))
    const before = await Bun.file(source).text()
    const proof = path.join(f.config.roles.rich.workRoots[0]!, "settlement.json")
    const result = await settleNodeWriterRelease(f.config, lease, "writer-incident", "eval", "followup", source, proof)
    expect(result.status).toBe("PROCESS_SETTLED")
    expect(await Bun.file(source).text()).toBe(before)
    expect((await Bun.file(proof).json()).processes.observation_mode).toBe("writer_release_settlement")
    await expect(settleNodeWriterRelease(f.config, lease, "renamed-incident", "eval", "followup", source, proof+".second")).rejects.toThrow("SETTLEMENT_ALREADY_RECORDED")
    const recovery = path.join(f.config.roles.rich.workRoots[0]!, "recovery.json")
    await Bun.write(recovery, JSON.stringify({ version: 1, owner, acquiredAt: lease.acquiredAt, profile: "eval", processEvidence: proof }))
    await Bun.write(`${profile}.process-group`,'123456789');
    await expect(recoverNodeStand(f.config,lease,'writer-incident',recovery,{})).rejects.toThrow('Registration owner unknown');
    expect(await Bun.file(path.join(f.config.runtimeRoot,'operations/recovery-incidents')).exists()).toBe(false);
    await Bun.write(`${profile}.process-group`,String(run.processCleanup.launcher!.pid));
    const bindings=await Array.fromAsync(new Bun.Glob('harness-*.json.stand').scan({cwd:path.join(f.config.runtimeRoot,'operations/stand.lease'),absolute:true}));
    expect(bindings).toHaveLength(1);
    const attestation=await Bun.file(bindings[0]!).text();
    await Bun.write(bindings[0]!,JSON.stringify({...JSON.parse(attestation),owner:{...owner,task:'foreign'}}));
    await expect(recoverNodeStand(f.config,lease,'writer-incident',recovery,{})).rejects.toThrow('HARNESS_OWNER_UNKNOWN');
    expect(await Bun.file(path.join(f.config.runtimeRoot,'operations/recovery-incidents')).exists()).toBe(false);
    await Bun.write(bindings[0]!,attestation);
    const done=await recoverNodeStand(f.config,lease,'writer-incident',recovery,{LOGINOM_PASSWORD:'fixture',LOGINOM_DOCK_API_KEY:'fixture',EVAL_AGENT_MODEL:'openai/fixture',EVAL_AGENT_VARIANT:'medium'});
    expect(done.status).toBe('SETTLED');
    expect(await Bun.file(`${profile}.process-group`).exists()).toBe(false);
    expect(await Bun.file(path.join(`${profile}.harness-lease`,'owner.json')).exists()).toBe(false);
    expect(await Bun.file(source).text()).toBe(before);
    await expect(recoverNodeStand(f.config,lease,'another-name',recovery,{})).rejects.toThrow();
    const released=await runNodeEvalOps(['release','--config',cfg,'--lease',leaseFile,'--evidence',done.evidence],{});
    expect(released.status).toBe('RELEASED');expect(released.code).toBe(0);
    expect((await Bun.file(released.diagnosticReceipt as string).json()).stage).toBe('released');
    const next=await acquireNodeStand(f.config,{...owner,task:'next'});
    expect(next.task).toBe('next');
  } finally { await f.dispose() }
}, 30_000)
