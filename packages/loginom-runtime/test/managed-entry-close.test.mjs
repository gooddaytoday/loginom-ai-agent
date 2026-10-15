import test from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { fileURLToPath } from "node:url"
import { createInterface } from "node:readline"

test("flushed close ACK exits even when a later IPC frame is incomplete", async (t) => {
  // Real Node JSON IPC on a duplex pipe. Node's disconnect event waits for a
  // buffered partial frame, which is not an admitted runtime request.
  const child = spawn(process.execPath, [fileURLToPath(new URL("../src/managed-entry.mjs", import.meta.url))], {
    stdio: ["ignore", "pipe", "pipe", "pipe"],
    env: { ...process.env, NODE_CHANNEL_FD: "3", NODE_CHANNEL_SERIALIZATION_MODE: "json" },
  })
  const lines = createInterface({ input: child.stdio[3] })
  t.after(async () => {
    lines.close()
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, "exit")
    child.kill("SIGKILL")
    await exited
  })
  const reply = once(lines, "line", { signal: AbortSignal.timeout(5000) })
  const exited = once(child, "exit", { signal: AbortSignal.timeout(1500) })
  child.stdio[3].write(JSON.stringify({ id: "close", operation: "close" }) + '\n{"id":')
  assert.deepEqual(JSON.parse((await reply)[0]), { id: "close", result: { closed: true } })
  assert.deepEqual(await exited, [0, null])
})

for (const scenario of ["unstarted", "invalid-start", "signal"]) {
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
    if (scenario === "signal") {
      const ready = message()
      child.send({ id: "probe", operation: "list" })
      assert.deepEqual(await ready, { id: "probe", error: "LOGINOM_NOT_READY" })
      const exited = once(child, "exit", { signal: AbortSignal.timeout(5000) })
      child.kill("SIGTERM")
      assert.deepEqual(await exited, [0, null])
      return
    }
    const reply = message()
    const exited = once(child, "exit", { signal: AbortSignal.timeout(5000) })
    child.send({ id: "close", operation: "close" })
    assert.deepEqual(await reply, { id: "close", result: { closed: true } })
    assert.deepEqual(await exited, [0, null])
  })
}
