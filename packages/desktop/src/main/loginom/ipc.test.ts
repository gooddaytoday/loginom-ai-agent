import { expect, test } from "bun:test"
import { join } from "node:path"

test("private Loginom IPC contract in an isolated Electron fixture", async () => {
  // Bun module mocks are process-global; this fixture must not replace Electron
  // for the other Desktop tests that import its default export.
  const child = Bun.spawn(
    [process.execPath, "test", join(import.meta.dir, "../../../test/loginom/fixtures/ipc-contract.ts")],
    { stdout: "pipe", stderr: "pipe" },
  )
  const output = new Response(child.stdout).text()
  const errors = new Response(child.stderr).text()
  const deadline = setTimeout(() => child.kill(), 10_000)
  try {
    const code = await child.exited
    expect(code, (await output) + (await errors)).toBe(0)
  } finally {
    clearTimeout(deadline)
    child.kill()
    await child.exited
  }
}, 15_000)
