import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
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
