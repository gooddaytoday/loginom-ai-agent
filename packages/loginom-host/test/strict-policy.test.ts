import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile, chmod, stat } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { recoveryStore } from "../src/connection/recovery-store"

for (const strict of [undefined, false])
  test(`strict profile survives removed opt-in (${strict}) and missing marker with an active barrier`, async () => {
    const root = await mkdtemp(join(tmpdir(), "strict-policy-"))
    try {
      const original = await recoveryStore(root, { strict: true })
      const id = await original.begin("a".repeat(64), 1)
      await original.settle(id, false)
      expect((await stat(join(root, ".strict-policy"))).mode & 0o777).toBe(0o600)
      const restarted = await recoveryStore(root, { strict })
      expect(restarted.mode).toBe("strict")
      expect(restarted.pending()).toEqual([id])
      await rm(join(root, ".strict-policy"))
      const missing = await recoveryStore(root, { strict })
      expect(missing.mode).toBe("strict")
      expect(missing.pending()).toEqual([id])
      await missing.acknowledge([id])
      expect((await recoveryStore(root, { strict })).mode).toBe("strict")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

test("corrupt or public strict policy fails closed, while a fresh ordinary profile stays advisory", async () => {
  const root = await mkdtemp(join(tmpdir(), "strict-policy-"))
  try {
    expect((await recoveryStore(root)).mode).toBe("advisory")
    await recoveryStore(root, { strict: true })
    await writeFile(join(root, ".strict-policy"), "advisory!\n")
    await expect(recoveryStore(root, { strict: false })).rejects.toThrow("LOGINOM_RECOVERY_STORE_INVALID")
    await writeFile(join(root, ".strict-policy"), "strict-v1\n")
    await chmod(join(root, ".strict-policy"), 0o644)
    if (process.platform !== "win32")
      await expect(recoveryStore(root)).rejects.toThrow("LOGINOM_RECOVERY_STORE_INVALID")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
