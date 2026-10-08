import { expect, test } from "bun:test"
import { chmod, copyFile, cp, mkdir, mkdtemp, rename, rm, stat, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { acquireNodeStand, assertNodeStandOwner, nodeProcessOutput, nodeStandStatus, ownedRecoveryEntry, preflightNodeStand, recoverNodeStand, releaseNodeStand, reserveNodeRecovery, reserveOwnedRegistrationContinuation, runNodeEvalOps, runNodeUnitChecks, settleNodeWriterRelease, nodeRoleCli, verifyBaselineStand, type NodeOpsConfig } from "../src/node-eval-ops"
import { prepareBaseline, beginBaselineMeasurement, recordBaselineMeasurement } from "../src/baseline"
import { repoRoot } from "../src/config"
import { baselineFixturePins } from "../fixtures/baseline"
import { archiveProfileHistory } from "../src/profile"
import { superviseProcess } from "../src/process-supervisor"

async function runtime() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-node-ops-"))
  const role = (name: string) => ({ checkout: path.join(root, "checkouts", name), referenceProfile: path.join(root, "roles", name, "reference"),
    evalProfile: path.join(root, "roles", name, "eval"), workRoots: [path.join(root, "roles", name, "work")], resultsRoot: path.join(root, "roles", name, "results") })
  const config: NodeOpsConfig = { version: 1, runtimeRoot: root, endpoint: "http://localhost/app/", container: { name: "test", id: "b".repeat(64), storageDir: "/workdir/UserStorage/user" },
    cliBin: path.join(root, "cli", "bin", "loginom-ai-agent-cli"), roles: { rich: role("rich"), ben: role("ben") } }
  for (const item of Object.values(config.roles)) for (const directory of [item.checkout, item.referenceProfile, item.evalProfile, ...item.workRoots, item.resultsRoot].filter((value): value is string => value !== undefined))
    await mkdir(directory, { recursive: true, mode: 0o700 })
  await Bun.write(config.cliBin, "installed")
  return { config, dispose: () => rm(root, { recursive: true, force: true }) }
}

const owner = { issue: "LAB-16", task: "task-one", role: "rich" as const, phase: "eval" as const, sha: "a".repeat(40) }

test("v2 eval-only baseline role shares the stand while preserving independent worker CLI pins", async () => {
  const fixture = await runtime()
  try {
    const root = fixture.config.runtimeRoot
    const baseline = { checkout: path.join(root, "checkouts/baseline"), evalProfile: path.join(root, "roles/baseline/eval"),
      workRoots: [path.join(root, "roles/baseline/work")], resultsRoot: path.join(root, "roles/baseline/results"),
      cliBin: path.join(root, "cli-baseline/bin/loginom-ai-agent-cli") }
    for (const directory of [baseline.checkout, baseline.evalProfile, ...baseline.workRoots, baseline.resultsRoot]) await mkdir(directory, { recursive: true, mode: 0o700 })
    await Bun.write(baseline.cliBin, "new installation")
    const config: NodeOpsConfig = { ...fixture.config, version: 2, roles: { ...fixture.config.roles, evalbaseline: baseline } }
    expect(nodeRoleCli(config, "rich")).toBe(fixture.config.cliBin)
    expect(nodeRoleCli(config, "evalbaseline")).toBe(baseline.cliBin)
    const lease = await acquireNodeStand(config, { ...owner, role: "evalbaseline" })
    await expect(acquireNodeStand(config, owner)).rejects.toThrow("BUSY")
    await expect(acquireNodeStand(config, { ...owner, role: "ben" })).rejects.toThrow("BUSY")
    await expect(assertNodeStandOwner(config, { ...lease, role: "rich" })).rejects.toThrow("LEASE_OWNER_CHANGED")
    await expect(preflightNodeStand(config, lease, {})).rejects.toThrow()
    expect((await nodeStandStatus(config)).status).toBe("BUSY")
  } finally { await fixture.dispose() }
})
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

test("worker completion cannot impersonate baseline completion", async () => {
  const fixture = await runtime()
  try {
    const lease = await acquireNodeStand(fixture.config, owner)
    await expect(verifyBaselineStand(fixture.config, lease, fixture.config.roles.rich.resultsRoot)).rejects.toThrow("BASELINE_ROLE_REQUIRED")
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

test("a repair preflight cannot overwrite the original admission or write outside its lease", async () => {
  const fixture = await runtime()
  try {
    const lease = await acquireNodeStand(fixture.config, owner)
    const original = path.join(fixture.config.runtimeRoot, "operations/stand.lease/admission-complete.json")
    await Bun.write(original, "preserved original admission")
    for (const directory of [path.dirname(original), fixture.config.roles.rich.workRoots[0]!, path.join(path.dirname(original), "nested/repair")]) {
      await expect(preflightNodeStand(fixture.config, lease, {}, directory)).rejects.toThrow("EVIDENCE_PATH_REFUSED")
    }
    expect(await Bun.file(original).text()).toBe("preserved original admission")
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

test("baseline recovery reserves once per immutable execution while renamed incidents retain the spent budget", async () => {
  const fixture = await runtime()
  try {
    const baseline = { checkout: path.join(fixture.config.runtimeRoot, "checkouts/baseline"),
      evalProfile: path.join(fixture.config.runtimeRoot, "roles/baseline/eval"), cliBin: fixture.config.cliBin,
      workRoots: [path.join(fixture.config.runtimeRoot, "roles/baseline/work")], resultsRoot: path.join(fixture.config.runtimeRoot, "roles/baseline/results") }
    for (const directory of [baseline.checkout, baseline.evalProfile, ...baseline.workRoots, baseline.resultsRoot]) await mkdir(directory, { recursive: true, mode: 0o700 })
    await cp(path.join(repoRoot, "evals/tasks"), path.join(baseline.checkout, "evals/tasks"), { recursive: true })
    const config: NodeOpsConfig = { ...fixture.config, version: 2, roles: { ...fixture.config.roles, evalbaseline: baseline } }
    const lease = await acquireNodeStand(config, { ...owner, role: "evalbaseline" })
    const pins = { ...baselineFixturePins, containerId: lease.containerId, endpoint: lease.endpoint }
    const series = path.join(baseline.resultsRoot, "series")
    const manifest = await prepareBaseline(series, { checkout: baseline.checkout, pins })
    const executions = []
    for (const job of manifest.jobs.slice(0, 2)) {
      const admitted = await beginBaselineMeasurement(series, job.key, { checkout: baseline.checkout, pins })
      const run = path.join(admitted.resultsDir, job.key)
      const output = path.join(run, admitted.case.id, "1")
      await mkdir(output, { recursive: true, mode: 0o700 })
      const started = new Date().toISOString()
      const supervised = await superviseProcess({ cmd: [process.execPath, "-e", "process.stdout.write('fixture'); await Bun.sleep(50)"],
        cwd: baseline.checkout, env: { PATH: process.env.PATH ?? "" }, outDir: output, timeoutMs: 5000 })
      await Bun.write(path.join(output, "cleanup.json"), JSON.stringify({ result: { status: "confirmed" }, processes: supervised.processCleanup,
        stages: ["processes", "diagnostics", "writer", "ready", "profile_history", "storage"].map(stage => ({ stage, status: "confirmed" })) }))
      await Bun.write(path.join(run, "summary.json"), JSON.stringify({ run_id: job.key, started_at: started, harness: { git_sha: lease.sha.slice(0, 9), dirty: false },
        config: { repeat: 1 }, task_ids: [admitted.case.id], storage_leftovers: [], tasks: [{ id: admitted.case.id, attempts: [{ task_id: admitted.case.id,
          attempt: 1, status: "no_artifact", judge_status: "no_artifact", pass: false, score: 0, environment_cleanup: { status: "confirmed" },
          tokens: { input: 0, output: 0, reasoning: 0 }, counters: { toolCalls: 0, toolErrors: 0, memoryToolCalls: 0 }, duration_ms: 50, cost: 0 }] }] }))
      await recordBaselineMeasurement(series, job.key, run)
      executions.push({ seriesDir: series, runDir: run, cleanupPath: `${admitted.case.id}/1/cleanup.json` })
    }
    const reservations = await Promise.allSettled([reserveNodeRecovery(config, lease, "first-incident", executions[0]),
      reserveNodeRecovery(config, lease, "concurrent-incident", executions[0])])
    expect(reservations.filter(result => result.status === "fulfilled")).toHaveLength(1)
    const admitted = reservations.find(result => result.status === "fulfilled")!
    if (admitted.status !== "fulfilled") throw Error("Reservation missing")
    const first = admitted.value
    await expect(reserveNodeRecovery(config, lease, "renamed-incident", executions[0])).rejects.toThrow("RECOVERY_ALREADY_ATTEMPTED")
    const second = await reserveNodeRecovery(config, lease, "second-incident", executions[1])
    expect(second).not.toBe(first)
    expect(await Bun.file(first).json()).toMatchObject({ status: "ATTEMPTED", execution: executions[0] })
    await Bun.write(first, "")
    await expect(reserveNodeRecovery(config, lease, "partial-reservation", executions[0])).rejects.toThrow("RECOVERY_ALREADY_ATTEMPTED")
    await expect(reserveNodeRecovery(config, lease, "wrong-cleanup", { ...executions[1]!, cleanupPath: "summary.json" })).rejects.toThrow("BASELINE_EXECUTION_UNKNOWN")
    await expect(reserveNodeRecovery(config, lease, "missing-execution")).rejects.toThrow("BASELINE_EXECUTION_REQUIRED")
    const completion = path.join(baseline.workRoots[0]!, "recovery-completion.json")
    await Bun.write(completion, JSON.stringify({ version: 1, owner: { ...owner, role: "evalbaseline" }, acquiredAt: lease.acquiredAt, kind: "recovery",
      receipt: second, profile: "eval", historyArchive: `${baseline.evalProfile}.history/fixture`, processEvidence: path.join(executions[1]!.runDir, executions[1]!.cleanupPath),
      execution: executions[1] }))
    await chmod(completion, 0o600)
    await expect(releaseNodeStand(config, lease, completion)).rejects.toThrow("BASELINE_COMPLETION_REQUIRED")
    expect((await nodeStandStatus(config)).status).toBe("BUSY")
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

test("an unknown baseline dispatch retains the common stand even when no product PID exists", async () => {
  const fixture = await runtime()
  try {
    const root = fixture.config.runtimeRoot
    const baseline = { checkout: path.join(root, "checkouts/baseline"), evalProfile: path.join(root, "roles/baseline/eval"),
      workRoots: [path.join(root, "roles/baseline/work")], resultsRoot: path.join(root, "roles/baseline/results"),
      cliBin: path.join(root, "cli-baseline/bin/loginom-ai-agent-cli") }
    for (const directory of [baseline.checkout, baseline.evalProfile, ...baseline.workRoots, baseline.resultsRoot]) await mkdir(directory, { recursive: true, mode: 0o700 })
    await Bun.write(baseline.cliBin, "new installation")
    const config: NodeOpsConfig = { ...fixture.config, version: 2, roles: { ...fixture.config.roles, evalbaseline: baseline } }
    const lease = await acquireNodeStand(config, { ...owner, role: "evalbaseline" })
    const series = path.join(baseline.resultsRoot, "unknown")
    const manifest = await prepareBaseline(series, { checkout: repoRoot, pins: baselineFixturePins, smoke: true, smokeCase: "calc-data-double" })
    await beginBaselineMeasurement(series, manifest.jobs[0]!.key, { checkout: repoRoot, pins: baselineFixturePins })
    await expect(verifyBaselineStand(config, lease, series)).rejects.toThrow("BASELINE_CLEANUP_UNKNOWN")
    expect((await nodeStandStatus(config)).status).toBe("BUSY")
  } finally { await fixture.dispose() }
})
