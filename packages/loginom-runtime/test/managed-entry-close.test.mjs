import test from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createInterface } from "node:readline"
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"

for (const heldSocket of [true, false]) test(`checked managed close ${heldSocket ? "falls back for a foreign socket" : "exits naturally without fallback"}`, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "managed-exit-fallback-"))
  // Entry, input validation and resource closure remain byte-identical. Only
  // external browser/MCP boundaries are fixtures, as in managed-work-entry.
  for (const name of ["managed-entry", "managed-resources-close", "start-input", "call-timeout"]) {
    await mkdir(join(directory, "src"), { recursive: true })
    await copyFile(new URL(`../src/${name}.mjs`, import.meta.url), join(directory, "src", `${name}.mjs`))
  }
  const files = {
    "src/resources.mjs": "export async function verifyResources() { return {manifestHash:'fixture',manifest:{}} }",
    "src/connection-check.mjs": "export const loginomAddress=value=>value; export async function loginBrowser(){return {context:{close:async()=>{}}}}",
    "client/package.json": '{"type":"module"}',
    "client/lib/session.mjs": `export async function createSession(config,{managed}) { return {
      directory:managed.directory,browserConfig:${JSON.stringify(join(directory, "browser.json"))},
      metadata:{client:'fixture',clientRevision:'fixture',workspaceReady:false}} }`,
    "client/lib/execution-journal.mjs": "export const createExecutionJournal=()=>async()=>{}",
    "client/lib/catalog.mjs": "export const startupDiagnostic=()=>undefined",
    "client/lib/artifacts.mjs": "export const admitStartupArtifacts=async()=>[]; export const artifactFailure=()=>undefined",
    "client/lib/bridge.mjs": `export async function createBridge(){return {
      server:{connect:async()=>{}},close:async()=>({browser_transport_closed:true,
      browser_process_terminated:true,clipboard_leases_retained:0})}}`,
    "client/node_modules/@modelcontextprotocol/sdk/package.json": '{"type":"commonjs"}',
    "client/node_modules/@modelcontextprotocol/sdk/client/index.js": "exports.Client=class {async connect(){} async close(){}}",
    "client/node_modules/@modelcontextprotocol/sdk/inMemory.js": "exports.InMemoryTransport={createLinkedPair:()=>[{},{}]}",
    "client/node_modules/@playwright/mcp/package.json": '{"type":"commonjs","main":"index.js"}',
    "client/node_modules/@playwright/mcp/index.js": "exports.createConnection=async()=>({connect:async()=>{},close:async()=>{}})",
    "browser.json": "{}",
  }
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(dirname(join(directory, name)), { recursive: true })
    await writeFile(join(directory, name), contents)
  }
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import { createServer } from 'node:net';
    ${heldSocket ? "const socket=createServer(); await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));" : ""}
    await import(${JSON.stringify(pathToFileURL(join(directory, "src/managed-entry.mjs")).href)});
  `], { stdio: ["ignore", "ignore", "ignore", "ipc"] })
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit")
      child.kill("SIGKILL")
      await exited
    }
    await rm(directory, { recursive: true, force: true })
  })
  const ready = once(child, "message", { signal: AbortSignal.timeout(5000) })
  child.send({ id: "start", operation: "start", input: { protocol: 1, generation: 1, chat: "fixture",
    stateDir: join(directory, "state"), resources: directory, endpoint: "http://example.test",
    connection: { url: "http://example.test", username: "fixture", password: "", apiKey: "fixture" } } })
  assert.equal((await ready)[0].result?.ready, true)
  const reply = once(child, "message", { signal: AbortSignal.timeout(5000) })
  const exited = once(child, "exit", { signal: AbortSignal.timeout(4500) })
  const started = performance.now()
  child.send({ id: "close", operation: "close" })
  assert.deepEqual((await reply)[0], { id: "close", result: { closed: true } })
  t.diagnostic(`Close ACK received; foreign TCP listener=${heldSocket}`)
  assert.deepEqual(await exited, [0, null])
  assert.ok(performance.now() - started < 5000)
  const attempts = join(directory, "state/generations/1/chats/fixture/attempts")
  const [attempt] = await readdir(attempts)
  const stages = (await readFile(join(attempts, attempt, "terminal-close.jsonl"), "utf8"))
    .trim().split("\n").map(line => JSON.parse(line).stage)
  assert.equal(stages.includes("exit_fallback"), heldSocket)
  assert.equal(stages.at(-1), "exit_event")
  t.diagnostic(`terminal-close stages: ${stages.join(", ")}`)
})

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
