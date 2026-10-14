import { expect, test } from "bun:test"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { evalsRoot } from "../src/config"
import { readEnvironmentStatus } from "../src/parallel-status"
import { acquireSlotLease } from "../src/slots"
import { writeLeaseReceipt } from "../src/lease"
import { parallelFixture } from "./helpers/parallel-fixture"

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
