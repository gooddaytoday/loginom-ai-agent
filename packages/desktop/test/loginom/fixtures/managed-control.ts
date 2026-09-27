// Real Node/Unix-socket IPC; Electron path/credential services are supplied by
// the package-local test bundler. No Electron, browser, account or model runs.
import { managedDesktopControl, openDesktopManagedControl } from "../../../src/main/loginom/managed-control"
import { desktopLoginom } from "../../../src/main/loginom/desktop-service"
import { credentials } from "@loginom-ai-agent/loginom-host/connection/credentials"
import { connectionStore } from "@loginom-ai-agent/loginom-host/connection/connection-store"
import { strict as assert } from "node:assert"
import { spawn, spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { once } from "node:events"
import { existsSync, fstatSync } from "node:fs"
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { createConnection, createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { mock } from "node:test"

const mode = process.argv[2]
const child = process.argv[3] === "child"
const account = "desktop-managed-fixture"
const protection = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(value),
  decryptString: (value: Buffer) => value.toString(),
}
const output = (value: object) => process.stdout.write(JSON.stringify(value) + "\n")
const binding = (attemptId: string) => ({ attemptId, loginId: randomUUID(), generation: 1,
  purpose: "chat" as const, chat: "a".repeat(64), account })

async function childMain() {
  assert.equal(process.env.LOGINOM_AI_AGENT_DESKTOP_CONTROL_FD, undefined)
  const root = process.env.TEST_ROOT!
  const hostRoot = join(root, "loginom")
  if (mode === "ordinary") {
    assert.equal(managedDesktopControl, undefined)
    Object.defineProperty(process, "resourcesPath", { value: join(root, "bundle") })
    const host = await desktopLoginom()
    assert.equal((await host.api.status()).state, "unconfigured")
    await host.close()
    return output({ pass: true, ordinary: true })
  }
  assert.ok(managedDesktopControl)
  const control = managedDesktopControl
  const failures = { count: 0 }
  const bindingPending = control.bind(hostRoot, () => { failures.count++ })
  // bind has begun, but its awaited registration read has not completed. A
  // shutdown fence must prevent that continuation from creating a usable callback.
  if (mode === "stop-bind") control.stop()
  const begin = await bindingPending.catch((error: Error) => error)
  if (["stop-bind", "no-registration", "legacy-registration", "corrupt-registration"].includes(mode)) {
    assert.ok(begin instanceof Error)
    assert.equal(begin.message, "LOGINOM_LOGIN_BARRIER_REQUIRED")
    assert.equal(failures.count, 1)
    control.close()
    return output({ pass: true })
  }
  assert.equal(typeof begin, "function")
  if (typeof begin !== "function") throw Error("FIXTURE_BIND")
  if (mode === "duplicate-adoption")
    assert.throws(() => openDesktopManagedControl("5"), { message: "DESKTOP_CONTROL_INVALID" })
  if (mode === "descendant") {
    const identity = fstatSync(5)
    const probe = spawnSync(process.execPath, ["-e", `
      const fs=require('node:fs'),assert=require('node:assert/strict');
      assert.equal(process.env.LOGINOM_AI_AGENT_DESKTOP_CONTROL_FD,undefined);
      let same=false; try{const s=fs.fstatSync(5);same=s.dev===${identity.dev}&&s.ino===${identity.ino}}catch{}
      assert.equal(same,false);`], { encoding: "utf8" })
    assert.equal(probe.status, 0, probe.stderr)
  }
  const value = binding(process.env.TEST_ATTEMPT!)
  if (mode === "host" || mode === "host-lost-ack") {
    Object.defineProperty(process, "resourcesPath", { value: join(root, "bundle") })
    const entry = join(root, "bundle/loginom/runtime/src/managed-entry.mjs")
    const identity = fstatSync(5)
    await writeFile(entry, (await readFile(entry, "utf8"))
      .replaceAll("__CONTROL_DEV__", String(identity.dev)).replaceAll("__CONTROL_INO__", String(identity.ino)))
    const host = await desktopLoginom(begin)
    await host.settled()
    const status = await host.api.status()
    if (mode === "host") {
      assert.equal(status.state, "ready")
      assert.equal(status.recoveryMode, "strict")
      await assert.rejects(access(join(hostRoot, "login-barrier-pending.json")))
      const observed = JSON.parse(await readFile(join(root, "runtime-observed.json"), "utf8"))
      assert.equal(observed.pendingBeforeStart, true)
      assert.equal(observed.controlEnvironmentPresent, false)
      assert.equal(observed.sameControlSocket, false)
      assert.equal(observed.input.loginBinding.attemptId, value.attemptId)
      assert.equal(observed.input.loginBarrier, 2)
    } else {
      assert.equal(status.state, "recoverable-error")
      await access(join(hostRoot, "login-barrier-pending.json"))
      assert.equal(failures.count, 1)
    }
    control.stop()
    await host.close()
    control.close()
    return output({ pass: true, host: true, state: status.state })
  }
  if (mode === "timeout") mock.timers.enable({ apis: ["setTimeout"] })
  const waiting = () => new Promise<void>((resolve) => process.stdin.once("data", () => resolve()))
  const reject = async (call: Promise<void>) => {
    await assert.rejects(call, { message: "LOGINOM_LOGIN_BARRIER_UNKNOWN" })
    await assert.rejects(begin({ phase: "begin", binding: binding(value.attemptId) }), {
      message: "LOGINOM_LOGIN_BARRIER_UNKNOWN",
    })
    assert.equal(failures.count, 1)
  }
  try {
    if (mode === "unsolicited") {
      const ready = waiting()
      output({ ready: true })
      await ready
      await reject(begin({ phase: "begin", binding: value }))
    } else if (mode === "authenticated-first") {
      await reject(begin({ phase: "authenticated", binding: value }))
    } else if (mode === "foreign-attempt") {
      await reject(begin({ phase: "begin", binding: { ...value, attemptId: "different" } }))
    } else if (mode === "concurrent") {
      const first = begin({ phase: "begin", binding: value })
      const firstRejected = assert.rejects(first, { message: "LOGINOM_LOGIN_BARRIER_UNKNOWN" })
      await reject(begin({ phase: "begin", binding: binding(value.attemptId) }))
      await firstRejected
    } else if (["stop-pending", "close-pending", "abort-pending", "timeout"].includes(mode)) {
      const ready = waiting()
      const first = begin({ phase: "begin", binding: value })
      const rejected = assert.rejects(first, { message: "LOGINOM_LOGIN_BARRIER_UNKNOWN" })
      await ready
      if (mode === "timeout") mock.timers.tick(60_000)
      else if (mode === "abort-pending") control.abort()
      else if (mode === "close-pending") control.close()
      else control.stop()
      await rejected
      await assert.rejects(begin({ phase: "authenticated", binding: value }), { message: "LOGINOM_LOGIN_BARRIER_UNKNOWN" })
      assert.equal(failures.count, mode === "close-pending" ? 0 : 1)
    } else if (["wrong-ack", "extra-ack", "duplicate-ack", "oversized-ack", "lost-ack", "split-invalid-utf8"].includes(mode)) {
      await reject(begin({ phase: "begin", binding: value }))
    } else {
      const event = { phase: "begin" as "begin" | "authenticated", binding: { ...value } }
      const pending = begin(event)
      if (mode === "detached-event") { event.phase = "authenticated"; event.binding.account = "changed-after-call" }
      await pending
      if (mode === "duplicate-begin") await reject(begin({ phase: "begin", binding: value }))
      else if (mode === "changed-binding")
        await reject(begin({ phase: "authenticated", binding: { ...value, account: "foreign-account" } }))
      else {
        await begin({ phase: "authenticated", binding: value })
        if (mode === "done-phase") await reject(begin({ phase: "done", binding: value } as never))
        else if (mode === "max-logins") {
          for (let n = 1; n < 32; n++) {
            const next = binding(value.attemptId)
            await begin({ phase: "begin", binding: next })
            await begin({ phase: "authenticated", binding: next })
          }
          await reject(begin({ phase: "begin", binding: binding(value.attemptId) }))
        } else assert.equal(failures.count, 0)
      }
    }
  } finally {
    if (mode === "timeout") mock.timers.reset()
    control.stop()
    control.close()
    process.stdin.pause()
  }
  output({ pass: true, failures: failures.count })
}

async function parentMain() {
  const root = await mkdtemp(join(tmpdir(), "desktop-managed-"))
  const attemptId = randomUUID()
  const hostRoot = join(root, "loginom")
  await mkdir(hostRoot, { mode: 0o700 })
  if (!["ordinary", "no-registration"].includes(mode))
    await writeFile(join(hostRoot, "session-registration.json"), JSON.stringify(mode === "legacy-registration"
      ? { version: 1, attemptId } : { version: 2, attemptId, loginBarrier: 2 }), { mode: 0o600 })
  if (mode === "corrupt-registration")
    await writeFile(join(hostRoot, "session-registration.json"), "synthetic-error-not-for-log")
  if (mode.startsWith("host")) {
    const resources = join(root, "bundle/loginom")
    await mkdir(join(resources, "runtime/src"), { recursive: true })
    await mkdir(join(resources, "bin"))
    await symlink(process.execPath, join(resources, "bin/node"))
    await writeFile(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "https://fixture.invalid/mcp" }))
    await writeFile(join(resources, "runtime/src/managed-entry.mjs"), `
      import {randomUUID} from 'node:crypto'; import {fstatSync,existsSync,writeFileSync} from 'node:fs';
      const waiting=new Map();
      const barrier=phase=>new Promise(resolve=>{const id=randomUUID();waiting.set(id,resolve);process.send({id,operation:'login-barrier',input:{phase}})});
      process.on('message',message=>{
        if(waiting.has(message.id)){waiting.get(message.id)(message);waiting.delete(message.id);return}
        if(message.operation==='close'){process.send({id:message.id,result:{closed:true}},()=>process.disconnect());return}
        if(message.operation!=='start')return;
        let same=false;try{const s=fstatSync(5);same=s.dev===__CONTROL_DEV__&&s.ino===__CONTROL_INO__}catch{}
        writeFileSync(${JSON.stringify(join(root, "runtime-observed.json"))},JSON.stringify({input:message.input,
          pendingBeforeStart:existsSync(${JSON.stringify(join(hostRoot, "login-barrier-pending.json"))}),
          controlEnvironmentPresent:process.env.LOGINOM_AI_AGENT_DESKTOP_CONTROL_FD!==undefined,sameControlSocket:same}));
        void(async()=>{for(const phase of ['begin','authenticated']){const reply=await barrier(phase);if(reply.error){process.send({id:message.id,error:reply.error});return}}
          process.send({id:message.id,result:{protocol:1,generation:message.input.generation,chat:message.input.chat,ready:true}})})();
      });`)
    const store = connectionStore(join(hostRoot, "connection"), credentials(process.platform, protection))
    await store.stage({ generation: 1, revision: 1, url: "https://fixture.invalid/app/", username: account,
      apiKey: "synthetic-secret", password: "synthetic-password" })
    await store.activate(1)
  }
  const server = createServer()
  server.listen(join(root, "control.sock"))
  await once(server, "listening")
  const accepted = once(server, "connection")
  const endpoint = createConnection(join(root, "control.sock"))
  await once(endpoint, "connect")
  const peer = (await accepted)[0] as import("node:net").Socket
  peer.on("error", () => undefined)
  endpoint.on("error", () => undefined)
  const env = { ...process.env, TEST_ROOT: root, TEST_ATTEMPT: attemptId }
  if (mode !== "ordinary") Object.assign(env, { LOGINOM_AI_AGENT_DESKTOP_CONTROL_FD: mode === "invalid-low" ? "4"
    : mode === "invalid-newline" ? "5\n" : mode === "invalid-high" ? "64" : mode === "not-socket" ? "6" : "5" })
  const processChild = spawn(process.execPath, [import.meta.filename, mode, "child"], {
    env, stdio: ["pipe", "pipe", "pipe", "ignore", "ignore", endpoint, "ignore"],
  })
  endpoint.destroy()
  let stdout = "", stderr = "", received = ""
  const frames: { phase: string; binding: ReturnType<typeof binding> }[] = []
  let protocolError: unknown
  processChild.stdout.on("data", (raw: Buffer) => {
    stdout += raw.toString()
    if (mode === "unsolicited" && stdout.includes('"ready":true')) {
      peer.write('{"version":2,"method":"login-ack","loginId":"foreign","phase":"begin"}\n', () => {
        peer.once("close", () => processChild.stdin.write("continue\n"))
      })
    }
  })
  processChild.stderr.on("data", (raw: Buffer) => { stderr += raw.toString() })
  peer.on("data", (raw: Buffer) => {
    received += raw.toString()
    try {
      while (received.includes("\n")) {
        const index = received.indexOf("\n")
        const frame = JSON.parse(received.slice(0, index))
        received = received.slice(index + 1)
        assert.deepEqual(Object.keys(frame), ["version", "type", "phase", "binding"])
        assert.equal(frame.version, 2); assert.equal(frame.type, "login")
        assert.equal(frame.binding.attemptId, attemptId)
        assert.equal(frame.binding.account, account)
        frames.push(frame)
        const ack = { version: 2, method: "login-ack", loginId: frame.binding.loginId, phase: frame.phase }
        if (mode.startsWith("host")) assert.ok(existsSync(join(hostRoot, "login-barrier-pending.json")))
        if (mode === "host-lost-ack" || mode === "lost-ack") { peer.end(); continue }
        if (mode === "concurrent") continue
        if (["stop-pending", "close-pending", "abort-pending", "timeout"].includes(mode)) { processChild.stdin.write("continue\n"); continue }
        if (mode === "wrong-ack") { peer.write(JSON.stringify({ ...ack, loginId: randomUUID() }) + "\n"); continue }
        if (mode === "extra-ack") { peer.write(JSON.stringify({ ...ack, private: "synthetic-error-not-for-log" }) + "\n"); continue }
        if (mode === "duplicate-ack") { peer.write(JSON.stringify(ack) + "\n" + JSON.stringify(ack) + "\n"); continue }
        if (mode === "oversized-ack") { peer.write("x".repeat(257)); continue }
        if (mode === "split-invalid-utf8") { peer.write(Buffer.from([0xff])); peer.write(JSON.stringify(ack) + "\n"); continue }
        // A split legitimate ACK also exercises bounded frame accumulation.
        const serialized = JSON.stringify(ack) + "\n"
        peer.write(serialized.slice(0, 11)); peer.write(serialized.slice(11))
      }
    } catch (error) { protocolError = error; processChild.kill() }
  })
  const deadline = setTimeout(() => processChild.kill("SIGKILL"), 12_000)
  try {
    const [code, signal] = await once(processChild, "exit")
    assert.equal(protocolError, undefined)
    assert.equal(signal, null, stderr)
    if (["invalid-low", "invalid-high", "invalid-newline", "not-socket"].includes(mode)) {
      assert.notEqual(code, 0)
      assert.ok(stderr.includes("DESKTOP_CONTROL_INVALID"))
      assert.equal(frames.length, 0)
    } else {
      assert.equal(code, 0, stderr)
      assert.ok(stdout.includes('"pass":true'), stdout)
      if (["authenticated-first", "foreign-attempt", "no-registration", "legacy-registration", "corrupt-registration", "ordinary", "unsolicited", "stop-bind"].includes(mode))
        assert.equal(frames.length, 0)
      if (["normal", "host", "duplicate-adoption", "descendant", "done-phase", "detached-event"].includes(mode))
        assert.deepEqual(frames.map((frame) => frame.phase), ["begin", "authenticated"])
      if (mode === "max-logins") assert.equal(frames.length, 64)
    }
    assert.ok(!stdout.includes("synthetic-password") && !stderr.includes("synthetic-password"))
    assert.ok(!stdout.includes("synthetic-error-not-for-log") && !stderr.includes("synthetic-error-not-for-log"))
    output({ pass: true, mode, frames: frames.length })
  } finally {
    clearTimeout(deadline)
    processChild.kill()
    peer.destroy(); endpoint.destroy(); server.close()
    await rm(root, { recursive: true, force: true })
  }
}

await (child ? childMain() : parentMain())
