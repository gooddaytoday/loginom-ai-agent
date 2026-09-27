import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { access, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { supervise } from "../src/supervisor"
import { createLoginomHost } from "../src/host"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { cliCredentials } from "../src/connection/cli-credentials"
import { buildNodeHost } from "../script/build-node-host"
import { launchNodeHost } from "../src/node-client"

// A real Node child exchanges private IPC with the product supervisor. No browser,
// network, Loginom account, or model is involved in these protocol fixtures.
async function fixture(mode = "normal") {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const root = await mkdtemp(join(tmpdir(), "loginom-login-barrier-"))
  const resources = join(root, "resources")
  const entry = join(resources, "runtime/src/managed-entry.mjs")
  const started = join(root, "started.json")
  const replies = join(root, "replies.json")
  const pending = join(root, "login-barrier-pending.json")
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await mkdir(join(resources, "bin"))
  await symlink(node, join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"))
  await writeFile(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "https://fixture.invalid/mcp" }))
  await writeFile(entry, `
import {randomUUID} from 'node:crypto';
import {existsSync,writeFileSync} from 'node:fs';
const mode=${JSON.stringify(mode)}, waiting=new Map(), replies=[];
function barrier(phase, extra={}) {
 const id=randomUUID();
 return new Promise(resolve=>{
  waiting.set(id,resolve);
  process.send({id,operation:'login-barrier',input:{phase,...extra}});
 });
}
process.on('message', message=>{
 const done=waiting.get(message.id);
 if(done){waiting.delete(message.id);replies.push(message);writeFileSync(${JSON.stringify(replies)},JSON.stringify(replies));done(message);return;}
 if(message.operation==='close') {process.send({id:message.id,result:{closed:true}},()=>process.disconnect());return;}
 if(message.operation!=='start')return;
 writeFileSync(${JSON.stringify(started)},JSON.stringify({input:message.input,pendingBeforeStart:existsSync(${JSON.stringify(pending)})}));
 void (async()=>{
  const phases=mode==='early-ready'?[]:mode==='authenticated-first'?['authenticated']:mode==='duplicate-begin'?['begin','begin']:mode==='duplicate-authenticated'?['begin','authenticated','authenticated']:mode==='done-phase'?['begin','authenticated','done']:['begin','authenticated'];
  for(const phase of phases){
   const extra=mode==='changed-binding'?{binding:{...message.input.loginBinding,loginId:randomUUID()}}:{};
   const reply=await barrier(phase,extra);
   if(reply.error){process.send({id:message.id,error:reply.error});return;}
  }
  process.send({id:message.id,result:{protocol:1,generation:mode==='wrong-ready'?message.input.generation+1:message.input.generation,chat:message.input.chat,...(message.input.validation?{checked:true}:{ready:true})}});
 })();
});
`)
  const binding = {
    attemptId: randomUUID(),
    loginId: randomUUID(),
    generation: 7,
    purpose: "chat" as const,
    chat: "a".repeat(64),
    account: "barrier-fixture-account",
  }
  const input = {
    node,
    entry,
    resources,
    stateDir: join(root, "runtime"),
    generation: binding.generation,
    chat: binding.chat,
    endpoint: "https://fixture.invalid/mcp",
    connection: { apiKey: "synthetic-private-key", password: "", url: "https://fixture.invalid/app", username: binding.account },
    environment: {},
    loginBinding: binding,
    trustedAttempt: { attemptId: binding.attemptId },
  }
  return {
    root, resources, started, replies, pending, binding, input,
    async hostSetup(cli = false) {
      await writeFile(join(root, "session-registration.json"), JSON.stringify({ version: 2, attemptId: binding.attemptId, loginBarrier: 2 }), { mode: 0o600 })
      const store = connectionStore(join(root, "connection"), cli ? cliCredentials("linux") : credentials("linux"))
      await store.stage({ generation: binding.generation, revision: 1, ...input.connection })
      await store.activate(binding.generation)
    },
    async dispose() { await rm(root, { recursive: true, force: true }) },
  }
}

function gate() {
  return { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() }
}

test("login barrier waits for both trusted acknowledgements and strips callback from the IPC start", async () => {
  const f = await fixture()
  const begin = gate(), authenticated = gate()
  const seen: unknown[] = []
  const state = { ready: false }
  const starting = supervise({ ...f.input, loginBarrier: async (value) => {
    seen.push(value)
    const current = value.phase === "begin" ? begin : authenticated
    current.entered.resolve()
    await current.release.promise
  } }).then(child => { state.ready = true; return child })
  try {
    await begin.entered.promise
    expect(state.ready).toBe(false)
    const start = JSON.parse(await readFile(f.started, "utf8"))
    expect(start.input.loginBinding).toEqual(f.binding)
    expect(start.input.loginBarrier).toBe(2)
    expect(start.input.environment).toBeUndefined()
    begin.release.resolve()
    await authenticated.entered.promise
    expect(state.ready).toBe(false)
    authenticated.release.resolve()
    const child = await starting
    try {
      expect(seen).toEqual([{ phase: "begin", binding: f.binding }, { phase: "authenticated", binding: f.binding }])
      expect(JSON.parse(await readFile(f.replies, "utf8")).map((value: { result: unknown }) => value.result)).toEqual([{ accepted: true }, { accepted: true }])
      expect(child.ready).toMatchObject({ generation: f.binding.generation, chat: f.binding.chat, ready: true })
    } finally { await child.close() }
  } finally {
    begin.release.resolve()
    authenticated.release.resolve()
    await starting.then(child => child.close(), () => undefined)
    await f.dispose()
  }
}, 20_000)

for (const mode of ["authenticated-first", "duplicate-begin", "duplicate-authenticated", "changed-binding", "early-ready", "done-phase"])
  test(`supervisor refuses ${mode} without a second trusted login grant`, async () => {
    const f = await fixture(mode)
    const phases: string[] = []
    try {
      await expect(supervise({ ...f.input, loginBarrier: async ({ phase }) => { phases.push(phase) } })).rejects.toThrow("LOGINOM_")
      expect(phases.filter(phase => phase === "begin").length).toBeLessThanOrEqual(1)
      expect(phases.filter(phase => phase === "authenticated").length).toBeLessThanOrEqual(1)
      if (["authenticated-first", "changed-binding", "early-ready"].includes(mode)) expect(phases).toEqual([])
      if (mode === "done-phase") expect(phases).toEqual(["begin", "authenticated"])
    } finally { await f.dispose() }
  }, 20_000)

test("registered login requires a constructor callback before child creation", async () => {
  const f = await fixture()
  try {
    await expect(supervise(f.input)).rejects.toThrow("LOGINOM_")
    await expect(access(f.started)).rejects.toThrow()
  } finally { await f.dispose() }
}, 20_000)

for (const outcome of ["throws", "unexpected-value"])
  test(`trusted callback ${outcome} is denied with a closed error`, async () => {
    const f = await fixture()
    const secret = "synthetic-provider-secret-never-on-wire"
    const calls: string[] = []
    try {
      const input = { ...f.input }
      // An untyped constructor caller cannot turn a truthy return into an ACK.
      Object.defineProperty(input, "loginBarrier", { value: async ({ phase }: { phase: "begin" | "authenticated" }) => {
        calls.push(phase)
        if (outcome === "throws") throw Error(secret)
        return { accepted: true }
      } })
      const result = await supervise(input).then(child => child.close().then(() => ({ error: "UNEXPECTED_SUCCESS" })), (error: Error) => ({ error: error.message }))
      expect(result.error).toMatch(/^LOGINOM_[A-Z_]+$/)
      expect(calls).toEqual(["begin"])
      const wire = await readFile(f.replies, "utf8")
      expect(wire).not.toContain(secret)
      const replies = JSON.parse(wire)
      expect(replies[0].error).toMatch(/^LOGINOM_[A-Z_]+$/)
    } finally { await f.dispose() }
  }, 20_000)

test("Host writes private pending binding before fork and removes it only after both acknowledgements and READY", async () => {
  const f = await fixture()
  await f.hostSetup()
  const begin = gate(), authenticated = gate()
  const seen: unknown[] = []
  const host = await createLoginomHost({ root: f.root, resources: f.resources, codec: credentials("linux"), environment: {},
    loginBarrier: async value => {
      seen.push(value)
      const current = value.phase === "begin" ? begin : authenticated
      current.entered.resolve()
      await current.release.promise
    },
  })
  try {
    await begin.entered.promise
    expect((await stat(f.pending)).mode & 0o777).toBe(0o600)
    const first = await readFile(f.pending, "utf8")
    expect(first).toContain(f.binding.attemptId)
    expect(JSON.parse(await readFile(f.started, "utf8")).pendingBeforeStart).toBe(true)
    begin.release.resolve()
    await authenticated.entered.promise
    expect(await readFile(f.pending, "utf8")).toBe(first)
    authenticated.release.resolve()
    await host.settled()
    expect(await host.api.status()).toMatchObject({ state: "ready", recoveryMode: "strict" })
    await expect(access(f.pending)).rejects.toThrow()
    expect(seen).toMatchObject([
      { phase: "begin", binding: { attemptId: f.binding.attemptId, generation: 7, account: f.binding.account, purpose: "readiness", chat: "readiness" } },
      { phase: "authenticated", binding: { attemptId: f.binding.attemptId, generation: 7, account: f.binding.account, purpose: "readiness", chat: "readiness" } },
    ])
  } finally {
    begin.release.resolve()
    authenticated.release.resolve()
    await host.close()
    await f.dispose()
  }
}, 20_000)

test("Host retains a pending login after invalid READY and refuses restart before any new fork", async () => {
  const f = await fixture("wrong-ready")
  await f.hostSetup()
  const phases: string[] = []
  const options = { root: f.root, resources: f.resources, codec: credentials("linux"), environment: {}, loginBarrier: async ({ phase }: { phase: "begin" | "authenticated" }) => { phases.push(phase) } }
  const host = await createLoginomHost(options)
  try {
    await host.settled()
    expect(await host.api.status()).toMatchObject({ state: "recoverable-error" })
    expect(phases).toEqual(["begin", "authenticated"])
    const pending = await readFile(f.pending, "utf8")
    const started = await readFile(f.started, "utf8")
    await host.close()
    await expect(createLoginomHost(options)).rejects.toThrow("LOGINOM_")
    expect(await readFile(f.pending, "utf8")).toBe(pending)
    expect(await readFile(f.started, "utf8")).toBe(started)
    expect(phases).toEqual(["begin", "authenticated"])
  } finally {
    await host.close()
    await f.dispose()
  }
}, 20_000)

for (const purpose of ["validation", "readiness"] as const)
  test(`supervisor preserves the trusted ${purpose} login binding`, async () => {
    const f = await fixture()
    const binding = { ...f.binding, purpose, chat: purpose === "validation" ? randomUUID() : "readiness" }
    const seen: unknown[] = []
    try {
      const child = await supervise({ ...f.input, chat: binding.chat, validation: purpose === "validation", loginBinding: binding,
        loginBarrier: async event => { seen.push(event) },
      })
      try {
        expect(seen).toEqual([{ phase: "begin", binding }, { phase: "authenticated", binding }])
        expect(child.ready).toMatchObject(purpose === "validation" ? { checked: true } : { ready: true, chat: "readiness" })
      } finally { await child.close() }
    } finally { await f.dispose() }
  }, 20_000)

test("supervisor rejects binding changes against actual launch identity before any child is forked", async () => {
  const f = await fixture()
  try {
    for (const changed of [
      { ...f.binding, attemptId: randomUUID() },
      { ...f.binding, generation: f.binding.generation + 1 },
      { ...f.binding, chat: "b".repeat(64) },
      { ...f.binding, account: "another-fixture-account" },
      { ...f.binding, loginId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" },
      { ...f.binding, generation: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      await expect(supervise({ ...f.input, loginBinding: changed, loginBarrier: async () => undefined })).rejects.toThrow("LOGINOM_LOGIN_BARRIER_INVALID")
      await expect(access(f.started)).rejects.toThrow()
    }
  } finally { await f.dispose() }
}, 20_000)

test("Host requires the private v2 registration and callback together before startup effects", async () => {
  const f = await fixture()
  try {
    await f.hostSetup()
    await expect(createLoginomHost({ root: f.root, resources: f.resources, codec: credentials("linux"), environment: {} })).rejects.toThrow("LOGINOM_LOGIN_BARRIER_REQUIRED")
    await expect(access(f.started)).rejects.toThrow()
    await expect(access(f.pending)).rejects.toThrow()
    await writeFile(join(f.root, "session-registration.json"), JSON.stringify({ version: 1, attemptId: f.binding.attemptId }), { mode: 0o600 })
    await expect(createLoginomHost({ root: f.root, resources: f.resources, codec: credentials("linux"), environment: {}, loginBarrier: async () => undefined })).rejects.toThrow("LOGINOM_LOGIN_BARRIER_REQUIRED")
    await expect(access(f.started)).rejects.toThrow()
  } finally { await f.dispose() }
}, 20_000)


test("trusted login ACKs traverse the actual Node Host relay before runtime readiness", async () => {
  const f = await fixture()
  await f.hostSetup(true)
  const bundle = await buildNodeHost(join(f.root, "node-host-bundle"))
  const entry = join(f.root, "fixture-node-entry.mjs")
  // Only the synthetic credential store uses the Linux plaintext codec on macOS;
  // the Node binary, bundled node-entry, Host, supervisor and both IPC hops are real.
  // This is not evidence of OS credential protection or Linux qualification.
  await writeFile(entry, `Object.defineProperty(process,'platform',{value:'linux'});await import(${JSON.stringify(pathToFileURL(bundle).href)});`)
  const begin = gate(), authenticated = gate()
  const seen: unknown[] = []
  const state = { ready: false }
  const starting = launchNodeHost({ node: f.input.node, entry, root: f.root, resources: f.resources, headless: true, environment: {},
    loginBarrier: async value => {
      seen.push(value)
      const current = value.phase === "begin" ? begin : authenticated
      current.entered.resolve()
      await current.release.promise
    },
  }).then(host => { state.ready = true; return host })
  try {
    await Promise.race([begin.entered.promise, starting.then(() => { throw Error("EARLY_HOST_READY") })])
    expect(state.ready).toBe(false)
    const pending = JSON.parse(await readFile(f.pending, "utf8"))
    expect(pending).toMatchObject({ attemptId: f.binding.attemptId, generation: 7, purpose: "readiness", chat: "readiness", account: f.binding.account })
    begin.release.resolve()
    await Promise.race([authenticated.entered.promise, starting.then(() => { throw Error("EARLY_HOST_READY") })])
    expect(state.ready).toBe(false)
    expect(JSON.parse(await readFile(f.pending, "utf8"))).toEqual(pending)
    authenticated.release.resolve()
    const host = await starting
    try {
      expect(await host.request("connection.status", {})).toMatchObject({ state: "ready", recoveryMode: "strict" })
      expect(seen).toEqual([{ phase: "begin", binding: pending }, { phase: "authenticated", binding: pending }])
      const start = JSON.parse(await readFile(f.started, "utf8"))
      expect(start.pendingBeforeStart).toBe(true)
      expect(start.input.loginBinding).toEqual(pending)
      expect(start.input.loginBarrier).toBe(2)
      expect(JSON.parse(await readFile(f.replies, "utf8")).map((value: { result: unknown }) => value.result)).toEqual([{ accepted: true }, { accepted: true }])
      await expect(access(f.pending)).rejects.toThrow()
    } finally { await host.close() }
    expect(await host.exited).toEqual({ code: 0, signal: null })
  } finally {
    begin.release.resolve()
    authenticated.release.resolve()
    await starting.then(host => host.close(), () => undefined)
    await f.dispose()
  }
}, 20_000)
