import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { acquireHarnessLease } from "../src/lease"

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
