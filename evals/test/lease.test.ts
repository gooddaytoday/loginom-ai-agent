import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { acquireHarnessLease, retireRecordedHarnessLease } from "../src/lease"
import { superviseProcess } from "../src/process-supervisor"

test("lease: второй harness не допускается, release проверяет свой owner", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-lease-"))
  const lease = await acquireHarnessLease(profile)
  try {
    await expect(acquireHarnessLease(profile)).rejects.toThrow("harness lease")
    expect(await Bun.file(path.join(profile, ".writer", "owner")).exists()).toBe(false)
    await lease.release()
    const next = await acquireHarnessLease(profile)
    await Bun.write(path.join(`${profile}.harness-lease`, "owner.json"), JSON.stringify({ nonce: "foreign" }))
    await expect(next.release()).rejects.toThrow("identity changed")
  } finally {
    await rm(`${profile}.harness-lease`, { recursive: true, force: true })
    await rm(profile, { recursive: true, force: true })
  }
})

test("recorded harness lease needs its exact admission and continuous cleanup proof after owner exit", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "evals-lease-retire-"))
  const profile = path.join(directory, "profile")
  const receipt = path.join(directory, "admission.json")
  try {
    const module = path.resolve(import.meta.dir, "../src/lease.ts")
    const process = await superviseProcess({ cmd: [Bun.which("bun")!, "-e", `const {acquireHarnessLease}=await import(${JSON.stringify(module)});await acquireHarnessLease(${JSON.stringify(profile)},${JSON.stringify(receipt)});`],
      cwd: directory, env: { PATH: Bun.env.PATH! }, timeoutMs: 5_000 })
    expect(process.exitCode).toBe(0)
    await expect(retireRecordedHarnessLease(profile, receipt, { ...process.processCleanup, status: "failed" })).rejects.toThrow("cleanup")
    expect(await Bun.file(path.join(`${profile}.harness-lease`, "owner.json")).exists()).toBe(true)
    await retireRecordedHarnessLease(profile, receipt, process.processCleanup)
    const next = await acquireHarnessLease(profile)
    await next.release()
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("lease: путь профиля и его symlink не допускают два harness", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "evals-lease-alias-"))
  const profile = path.join(directory, "profile")
  const alias = path.join(directory, "alias")
  await mkdir(profile)
  await symlink(profile, alias)
  const lease = await acquireHarnessLease(profile)
  try {
    await expect(acquireHarnessLease(alias)).rejects.toThrow("harness lease")
    await lease.release()
    const next = await acquireHarnessLease(alias)
    try {
      expect(next.directory).toBe(`${profile}.harness-lease`)
      await expect(acquireHarnessLease(profile)).rejects.toThrow("harness lease")
    } finally { await next.release() }
  } finally { await rm(directory, { recursive: true, force: true }) }
})
