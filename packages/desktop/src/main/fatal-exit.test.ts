import { spawnSync } from "node:child_process"
import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

test("writes an uncaught exception to stderr and exits", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-fatal-exit-"))
  roots.push(root)
  const script = join(root, "crash.ts")
  await writeFile(
    script,
    `import { exitOnFatalErrors } from ${JSON.stringify(join(import.meta.dir, "fatal-exit.ts"))}
exitOnFatalErrors("sidecar")
setTimeout(() => {
  throw new Error("boom")
}, 10)
`,
  )

  const result = spawnSync(process.execPath, [script], { encoding: "utf8" })

  expect(result.status).toBe(1)
  expect(result.stderr).toContain("sidecar uncaughtException: Error: boom")
})

test("writes an unhandled rejection to stderr and exits", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-fatal-exit-"))
  roots.push(root)
  const script = join(root, "reject.ts")
  await writeFile(
    script,
    `import { exitOnFatalErrors } from ${JSON.stringify(join(import.meta.dir, "fatal-exit.ts"))}
exitOnFatalErrors("sidecar")
Promise.reject(new Error("boom"))
setTimeout(() => {}, 1000)
`,
  )

  const result = spawnSync(process.execPath, [script], { encoding: "utf8" })

  expect(result.status).toBe(1)
  expect(result.stderr).toContain("sidecar unhandledRejection: Error: boom")
})
