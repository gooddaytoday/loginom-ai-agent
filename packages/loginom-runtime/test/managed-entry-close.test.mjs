import test from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { fileURLToPath } from "node:url"

for (const scenario of ["unstarted", "invalid-start"]) {
  test(`actual managed entry acknowledges confirmed resource close after ${scenario}`, async (t) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../src/managed-entry.mjs", import.meta.url))],
      { stdio: ["ignore", "pipe", "pipe", "ipc"] })
    t.after(async () => {
      if (child.exitCode !== null || child.signalCode !== null) return
      const exited = once(child, "exit")
      child.kill("SIGKILL")
      await exited
    })
    const message = () => once(child, "message", { signal: AbortSignal.timeout(5000) }).then(([value]) => value)
    if (scenario === "invalid-start") {
      const failed = message()
      child.send({ id: "start", operation: "start", input: { acceptanceCleanupPackage: "private-invalid-secret" } })
      assert.deepEqual(await failed, { id: "start", error: "LOGINOM_START_INVALID" })
    }
    const reply = message()
    const exited = once(child, "exit", { signal: AbortSignal.timeout(5000) })
    child.send({ id: "close", operation: "close" })
    assert.deepEqual(await reply, { id: "close", result: { closed: true } })
    assert.deepEqual(await exited, [0, null])
  })
}
