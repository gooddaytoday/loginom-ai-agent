import { expect, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { evalsRoot, loadConfig } from "../src/config"
import { readEnvironmentStatus } from "../src/parallel-status"
import { acquireEnvironmentLeases, acquireSlotLease } from "../src/slots"
import { writeLeaseReceipt } from "../src/lease"
import { parallelFixture } from "./helpers/parallel-fixture"
import { prepareEnvironment, scopedSlotConfig, verifyEnvironment } from "../src/environment-preparation"
import { stageUserPreparation } from "../src/user-environment"
import { agentCommand } from "../src/cli"

test("prepared slot configuration reads private credentials and binds each distinct runtime without exposing passwords in env", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-prepared-config-")), fixture = await parallelFixture(root)
  const identity = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
    studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }
  const journal = path.join(fixture.slots.controller.stateDir, "command.json")
  await writeLeaseReceipt(journal, { commandId: "scoped-config" })
  const environment = await acquireEnvironmentLeases(fixture.slots, 2, identity, journal, fixture.lockRoot)
  const base = loadConfig([], { EVAL_SLOTS_FILE: path.join(root, "slots.json"), EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: "/pinned/cli",
    EVAL_AGENT_MODEL: "openai/gpt-6-luna", JUDGE_MODEL: "gpt-6-sol", LOGINOM_DOCK_API_KEY: "controller-dock-canary" })
  try {
    for (const lease of environment.slots) {
      const prepared = await stageUserPreparation(fixture.slots, lease, "d".repeat(64))
      const scoped = await scopedSlotConfig(base, fixture.slots, lease)
      expect(scoped.profileDir).toBe(lease.slot.profileDir)
      expect(scoped.agent.workspaceRoot).toBe(lease.slot.workspaceRoot)
      expect(scoped.loginom).toMatchObject({ username: lease.slot.username, url: fixture.slots.server.url,
        container: identity.containerId, storageDir: `/workdir/UserStorage/${lease.slot.username}` })
      const credentials = await Bun.file(prepared.secretFile).json()
      expect(scoped.loginom.password === credentials.password).toBe(true)
      const values = Object.values(agentCommand(scoped, { LOGINOM_PASSWORD: credentials.password, PRIVATE_TOKEN: "controller-dock-canary" }).env)
      expect(values.includes(credentials.password)).toBe(false)
      expect(values.includes("controller-dock-canary")).toBe(false)
    }
    expect(base.loginom.username).toBe("user")
  } finally { await Promise.all([environment.server.close(), ...environment.slots.map(lease => lease.close())]); await rm(root, { recursive: true }) }
})

test("preparation rejects an invalid slot count before controller or runtime side effects", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-prepare-count-")), fixture = await parallelFixture(root)
  const slotsFile = path.join(root, "slots.json")
  await writeLeaseReceipt(slotsFile, fixture.slots)
  try {
    const before = await readdir(fixture.slots.controller.stateDir)
    for (const parallel of [0, 3, 1.5]) {
      await expect(prepareEnvironment({ slotsFile, parallel }, fixture.lockRoot)).rejects.toThrow("SLOT_COUNT")
      expect(await readdir(fixture.slots.controller.stateDir)).toEqual(before)
      expect(await readdir(fixture.lockRoot)).toEqual([])
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("verification rejects an invalid slot count without preparing users or starting runtime", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-verify-count-")), fixture = await parallelFixture(root)
  const slotsFile = path.join(root, "slots.json")
  await writeLeaseReceipt(slotsFile, fixture.slots)
  try {
    for (const parallel of [0, 3, 1.5]) {
      await expect(verifyEnvironment({ slotsFile, parallel }, fixture.lockRoot)).rejects.toThrow("SLOT_COUNT")
      expect(await readdir(fixture.slots.controller.stateDir)).toEqual([])
      expect(await readdir(fixture.lockRoot)).toEqual([])
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("status reads retained ownership without guards, credentials or file changes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-status-"))
  const fixture = await parallelFixture(root)
  const identity = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", serverEpoch: "b".repeat(64),
    studioContainerId: "c".repeat(64), studioStartedAt: "2026-10-13T10:00:00Z", configurationHash: "d".repeat(64) }
  await writeLeaseReceipt(path.join(fixture.slots.controller.stateDir, "run-journal.json"), { commandId: "status-source" })
  await writeLeaseReceipt(path.join(fixture.slots.controller.stateDir, "pair.json"), { version: 2, kind: "pair-provision", nonce: crypto.randomUUID(),
    purpose: "research", daemonId: "daemon", server: fixture.slots.server, images: {}, resources: { server: identity.containerId,
      studio: identity.studioContainerId, network: "e".repeat(64) }, phase: "ready" })
  const lease = await acquireSlotLease(fixture.slots, fixture.slots.slots[0]!, identity, fixture.lockRoot)
  try {
    const names = await readdir(fixture.lockRoot)
    const before = await Promise.all(names.map(name => Bun.file(path.join(fixture.lockRoot, name)).text()))
    const status = await readEnvironmentStatus(fixture.slots, fixture.lockRoot)
    expect(status).toMatchObject({ version: 2, kind: "parallel-environment-status", snapshotChanged: false, admission: "not_verified" })
    expect(status.slots).toHaveLength(2)
    expect(status.slots[0]).toMatchObject({ id: "a", username: "eval-a", user: { state: "retained" }, profile: { state: "retained" } })
    expect(status.slots[1]).toMatchObject({ id: "b", user: null, profile: null })
    expect(await readdir(fixture.lockRoot)).toEqual(names)
    expect(await Promise.all(names.map(name => Bun.file(path.join(fixture.lockRoot, name)).text()))).toEqual(before)
    await lease.assertHeld()
  } finally { await lease.close(); await rm(root, { recursive: true, force: true }) }
})

test("status rejects a malformed pair nonce instead of echoing uncontrolled metadata", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-status-invalid-"))
  const fixture = await parallelFixture(root)
  try {
    const pair = path.join(fixture.slots.controller.stateDir, "pair.json")
    await writeLeaseReceipt(pair, { version: 2, kind: "pair-provision", nonce: "uncontrolled", purpose: "research",
      server: fixture.slots.server, resources: {}, phase: "provisioning" })
    const before = await Bun.file(pair).text()
    await expect(readEnvironmentStatus(fixture.slots, fixture.lockRoot)).rejects.toThrow("STATUS_PAIR_INVALID")
    expect(await Bun.file(pair).text()).toBe(before)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("parallel environment CLI refuses incomplete recovery arguments before creating output", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-env-"))
  try {
    const out = path.join(root, "output")
    const child = Bun.spawn([process.execPath, path.join(evalsRoot, "script/parallel-env.ts"), "recover", "--out", out],
      { cwd: evalsRoot, env: { PATH: process.env.PATH ?? "", HOME: root }, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect({ code, stdout, stderr: stderr.trim() }).toEqual({ code: 2, stdout: "", stderr: "PARALLEL_ENV_ARGUMENTS" })
    expect(await Bun.file(path.join(out, "receipt.json")).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("prepare CLI rejects output inside a slot before any preparation or runtime", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-prepare-output-")), fixture = await parallelFixture(root)
  const config = path.join(root, "slots.json")
  await writeLeaseReceipt(config, fixture.slots)
  try {
    const before = await readdir(fixture.slots.controller.stateDir)
    const child = Bun.spawn([process.execPath, path.join(evalsRoot, "script/parallel-env.ts"), "prepare", "--config", config,
      "--parallel", "1", "--out", path.join(fixture.slots.slots[0]!.profileDir, "output")],
      { cwd: evalsRoot, env: { PATH: process.env.PATH ?? "", HOME: root }, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect({ code, stdout, stderr: stderr.trim() }).toEqual({ code: 2, stdout: "", stderr: "PARALLEL_ENV_OUTPUT_EXPOSED" })
    expect(await readdir(fixture.slots.controller.stateDir)).toEqual(before)
    expect(await readdir(fixture.lockRoot)).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("prepare CLI records a private admission failure without a measured summary", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-prepare-failure-")), fixture = await parallelFixture(root)
  const config = path.join(root, "slots.json"), out = path.join(root, "output")
  await writeLeaseReceipt(config, fixture.slots)
  try {
    const child = Bun.spawn([process.execPath, path.join(evalsRoot, "script/parallel-env.ts"), "prepare", "--config", config, "--out", out],
      { cwd: evalsRoot, env: { PATH: process.env.PATH ?? "", HOME: root }, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect({ code, stdout, stderr: stderr.trim() }).toEqual({ code: 2, stdout: "", stderr: "SLOT_PATH_PRIVATE" })
    expect(await Bun.file(path.join(out, "receipt.json")).json()).toMatchObject({ version: 2, kind: "environment-preparation", ready: false,
      status: "failed", reason: "SLOT_PATH_PRIVATE" })
    expect(await readdir(out)).toEqual(["receipt.json"])
    expect(await readdir(fixture.slots.controller.stateDir)).toEqual([])
    expect(await readdir(fixture.lockRoot)).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("verify CLI records an admission failure without preparing or modifying user state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-verify-failure-")), fixture = await parallelFixture(root)
  const config = path.join(root, "slots.json"), out = path.join(root, "output")
  await writeLeaseReceipt(config, fixture.slots)
  try {
    const child = Bun.spawn([process.execPath, path.join(evalsRoot, "script/parallel-env.ts"), "verify", "--config", config, "--out", out],
      { cwd: evalsRoot, env: { PATH: process.env.PATH ?? "", HOME: root }, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect({ code, stdout, stderr: stderr.trim() }).toEqual({ code: 2, stdout: "", stderr: "SLOT_PATH_PRIVATE" })
    expect(await Bun.file(path.join(out, "receipt.json")).json()).toMatchObject({ version: 2, kind: "environment-verification", ready: false,
      status: "failed", reason: "SLOT_PATH_PRIVATE", finalization: { status: "unconfirmed" } })
    expect(await readdir(out)).toEqual(["receipt.json"])
    expect(await readdir(fixture.slots.controller.stateDir)).toEqual([])
    expect(await readdir(fixture.lockRoot)).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("recover CLI routes a pre-CLI preparation incident and records an unconfirmed admission failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-recover-preparation-cli-")), fixture = await parallelFixture(root)
  const config = path.join(root, "slots.json"), out = path.join(root, "output"), incident = path.join(fixture.slots.controller.stateDir, "prepare-command.json")
  await writeLeaseReceipt(config, fixture.slots)
  await writeLeaseReceipt(incident, { version: 2, kind: "unactivated-preparation" })
  try {
    const child = Bun.spawn([process.execPath, path.join(evalsRoot, "script/parallel-env.ts"), "recover", "--config", config, "--incident", incident, "--out", out],
      { cwd: evalsRoot, env: { PATH: process.env.PATH ?? "", HOME: root }, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect({ code, stdout, stderr: stderr.trim() }).toEqual({ code: 2, stdout: "", stderr: "SLOT_PATH_PRIVATE" })
    expect(await Bun.file(path.join(out, "receipt.json")).json()).toMatchObject({ version: 2, kind: "preparation-recovery", ready: false,
      status: "failed", finalization: { status: "unconfirmed" } })
    expect(await readdir(out)).toEqual(["receipt.json"])
    expect(await readdir(fixture.lockRoot)).toEqual([])
  } finally { await rm(root, { recursive: true, force: true }) }
})
