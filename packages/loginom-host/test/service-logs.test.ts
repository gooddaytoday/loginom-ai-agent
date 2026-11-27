import { expect, test } from "bun:test"
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const MiB = 1024 * 1024

test("two processes share the same service log quota while both keep writing", async () => {
  const root = mkdtempSync(join(tmpdir(), "service-log-quota-"))
  const fixture = `import { retainedServiceLogs } from ${JSON.stringify(join(import.meta.dir, "../src/service-logs.ts"))}
    const root = ${JSON.stringify(root)}
    const logs = retainedServiceLogs(root, ${2 * MiB})
    const target = root + '/service-' + process.pid + '.log'
    for (let batch = 0; batch < 24; batch++) {
      for (let i = 0; i < 8; i++) logs.append(target, String(batch).repeat(10) + 'x'.repeat(30 * 1024))
      await logs.flush()
    }`
  try {
    const children = Array.from({ length: 2 }, () => Bun.spawn([process.execPath, "-e", fixture], {
      stdout: "ignore", stderr: "inherit",
    }))
    const finished = Promise.all(children.map((child) => child.exited))
    let done = false
    void finished.then(() => { done = true })
    let maxBytes = 0
    do {
      const bytes = readdirSync(root).filter((file) => file.endsWith(".log")).reduce((total, file) => {
        return total + (statSync(join(root, file), { throwIfNoEntry: false })?.size ?? 0)
      }, 0)
      maxBytes = Math.max(maxBytes, bytes)
      if (!done) await Bun.sleep(3)
    } while (!done)
    expect(await finished).toEqual([0, 0])
    expect(maxBytes).toBeGreaterThan(MiB)
    // A scan can observe files on both sides of a deletion, so verify the settled on-disk budget separately.
    const files = readdirSync(root).filter((file) => file.endsWith(".log"))
    expect(files.reduce((total, file) => total + statSync(join(root, file)).size, 0)).toBeLessThanOrEqual(2 * MiB)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
