import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile, readFile, readdir, chmod, stat } from "node:fs/promises"
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

for (const strict of [undefined, false])
  test(`ordinary crash drops explicit advisory intents without persisting strict policy (${strict})`, async () => {
    const root = await mkdtemp(join(tmpdir(), "advisory-policy-"))
    try {
      const original = await recoveryStore(root, { strict })
      await original.begin("a".repeat(64), 1)
      await original.begin("b".repeat(64), 2)
      // No settle: both dispatched operations lost their owner before a reply.
      const restarted = await recoveryStore(root, { strict })
      expect(restarted.mode).toBe("advisory")
      expect(restarted.pending()).toEqual([])
      expect(await readdir(root)).toEqual([])
      const next = await restarted.begin("a".repeat(64), 1)
      await restarted.settle(next, false)
      expect((await recoveryStore(root)).mode).toBe("advisory")
      expect(await readdir(root)).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

for (const policy of ["legacy", "opt-in", "marker"])
  test(`a ${policy} strict policy retains pending advisory entries too`, async () => {
    const root = await mkdtemp(join(tmpdir(), "mixed-policy-"))
    try {
      const original = await recoveryStore(root)
      const id = await original.begin("a".repeat(64), 1)
      if (policy === "legacy") {
        const path = join(root, `${id}.json`)
        const entry = JSON.parse(await readFile(path, "utf8"))
        delete entry.recoveryMode
        await writeFile(path, JSON.stringify(entry))
      }
      const other = await original.begin("b".repeat(64), 2)
      if (policy === "marker") await writeFile(join(root, ".strict-policy"), "strict-v1\n", { mode: 0o600 })
      const restarted = await recoveryStore(root, { strict: policy === "opt-in" })
      expect(restarted.mode).toBe("strict")
      expect(restarted.pending().sort()).toEqual([id, other].sort())
      expect((await stat(join(root, ".strict-policy"))).mode & 0o777).toBe(0o600)
      expect(JSON.parse(await readFile(join(root, `${other}.json`), "utf8")).recoveryMode).toBe("strict")
      await rm(join(root, ".strict-policy"))
      const missing = await recoveryStore(root, { strict: false })
      expect(missing.mode).toBe("strict")
      expect(missing.pending().sort()).toEqual([id, other].sort())
      await missing.acknowledge([id, other])
      expect((await recoveryStore(root, { strict: false })).mode).toBe("strict")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

for (const recoveryMode of [null, false, "unknown"])
  test(`invalid recovery provenance ${recoveryMode} fails closed without deleting the intent`, async () => {
    const root = await mkdtemp(join(tmpdir(), "invalid-policy-"))
    try {
      const original = await recoveryStore(root)
      const id = await original.begin("a".repeat(64), 1)
      const path = join(root, `${id}.json`)
      const entry = JSON.parse(await readFile(path, "utf8"))
      await writeFile(path, JSON.stringify({ ...entry, recoveryMode }))
      await expect(recoveryStore(root)).rejects.toThrow("LOGINOM_RECOVERY_STORE_INVALID")
      expect(await readdir(root)).toEqual([`${id}.json`])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

test("session completion cannot acquire or restore advisory provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "completion-policy-"))
  try {
    const original = await recoveryStore(root)
    await expect(original.begin("a".repeat(64), 1, "session-completion")).rejects.toThrow(
      "LOGINOM_RECOVERY_IDENTITY_INVALID",
    )
    const id = await original.begin("a".repeat(64), 1)
    const path = join(root, `${id}.json`)
    const entry = JSON.parse(await readFile(path, "utf8"))
    await writeFile(path, JSON.stringify({ ...entry, purpose: "session-completion" }))
    await expect(recoveryStore(root)).rejects.toThrow("LOGINOM_RECOVERY_STORE_INVALID")
    expect(await readdir(root)).toEqual([`${id}.json`])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
