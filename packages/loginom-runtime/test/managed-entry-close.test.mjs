import test from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { fileURLToPath } from "node:url"
import { createInterface } from "node:readline"

test("checked managed close does not wait for a completed operation's race timeout", async (t) => {
  // Pinned Playwright waitForCompletion races completed requests against a
  // referenced 5s timeout without cancelling the losing timer.
  const entry = new URL("../src/managed-entry.mjs", import.meta.url).href
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    await import(${JSON.stringify(entry)});
    await Promise.race([Promise.resolve(), new Promise(resolve => setTimeout(resolve, 5000))]);
    process.send({ ready: true });
  `], { stdio: ["ignore", "ignore", "ignore", "ipc"] })
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, "exit")
    child.kill("SIGKILL")
    await exited
  })
  assert.deepEqual((await once(child, "message", { signal: AbortSignal.timeout(5000) }))[0], { ready: true })
  const reply = once(child, "message", { signal: AbortSignal.timeout(5000) })
  const exited = once(child, "exit", { signal: AbortSignal.timeout(1500) })
  child.send({ id: "close", operation: "close" })
  assert.deepEqual((await reply)[0], { id: "close", result: { closed: true } })
  t.diagnostic("Resource close ACK received with a completed operation's timeout still pending")
  assert.deepEqual(await exited, [0, null])
})

test("managed entry closes while a background V8 allocation waits for foreground GC", async (t) => {
  // Exercise the real entrypoint with Node's reproducer for nodejs/node#66171:
  // process.exit() joins platform workers before disposing their isolate.
  const entry = new URL("../src/managed-entry.mjs", import.meta.url).href
  const child = spawn(process.execPath, ["--stress-concurrent-allocation", "--input-type=module", "-e", `
    import { pbkdf2, pbkdf2Sync } from 'node:crypto';
    await import(${JSON.stringify(entry)});
    const keep = [];
    for (let i = 0; i < 1e5; i++) keep.push({ i });
    const started = process.hrtime.bigint();
    pbkdf2Sync('a', 'b', 2e5, 64, 'sha512');
    const iterations = Math.ceil(1e9 / (Number(process.hrtime.bigint() - started) / 2e5));
    setTimeout(() => {
      pbkdf2('a', 'b', iterations, 64, 'sha512', () => {});
      for (let i = 0; i < 40; i++) new Array(1e5).fill(i);
      process.send({ ready: true });
    }, 300);
  `], { stdio: ["ignore", "ignore", "ignore", "ipc"] })
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = once(child, "exit")
    child.kill("SIGKILL")
    await exited
  })
  assert.deepEqual((await once(child, "message", { signal: AbortSignal.timeout(15000) }))[0], { ready: true })
  const reply = once(child, "message", { signal: AbortSignal.timeout(5000) })
  const exited = once(child, "exit", { signal: AbortSignal.timeout(5000) })
  child.send({ id: "close", operation: "close" })
  assert.deepEqual((await reply)[0], { id: "close", result: { closed: true } })
  t.diagnostic("Resource close ACK received; waiting for actual exit without a signal")
  assert.deepEqual(await exited, [0, null])
})

for (const entry of ["managed-entry", "knowledge-entry"]) test(`${entry}: flushed close ACK exits even when a later IPC frame is incomplete`, async (t) => {
  // Real Node JSON IPC on a duplex pipe. Node's disconnect event waits for a
  // buffered partial frame, which is not an admitted runtime request.
  const child = spawn(process.execPath, [fileURLToPath(new URL(`../src/${entry}.mjs`, import.meta.url))], {
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
      const response = await failed
      assert.equal(response.id, "start")
      assert.equal(response.error, "LOGINOM_START_INVALID")
      assert.equal(JSON.stringify(response).includes("private-invalid-secret"), false)
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
