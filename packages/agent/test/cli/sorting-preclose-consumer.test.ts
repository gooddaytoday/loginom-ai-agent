import { test, expect } from "bun:test"
import { EventEmitter } from "node:events"
import { readFile } from "node:fs/promises"
import vm from "node:vm"
import { LoginomHost } from "../../../loginom-host/src/adapter"
import { loginomHostPort } from "../../../loginom-host/src/host-port"
import { transport } from "../../../loginom-host/src/transport"

// Consumer preparation, not upstream authority implementation. Real local
// adapter/HostPort/transport/finally; service, runtime and Page are doubles.
function fixture(listGate?: Promise<void>) {
  const requests = new EventEmitter(), replies = new EventEmitter()
  const events: string[] = [], pending: string[] = [], page = { fixture: "original Page" }
  const retained = { deferRelease: true, leases: new Set<{ release(): Promise<void> }>() }
  const service = {
    acquire() { return { generation: 7, release() { events.push("release") }, holdRecovery() {}, reconciled() {} } },
    async retireRuntime() {}, resetRestarts() {}, markRuntimeStale() {}, recoveries: new Map(),
    journal: { pending: () => pending, async begin() { pending.push("operation"); return "operation" }, async settle(_id: string, confirmed: boolean) { if (confirmed) pending.length = 0 } },
    async runtime(generation: number, chat: string) {
      events.push(`runtime:${generation}:${chat}`)
      return { async request(method: string) { events.push(method); if (method === "list") await listGate; return method === "list" ? page : { result: page, recoveryPending: true, activeWork: true } } }
    },
  }
  const endpoint = { postMessage: (data: unknown) => requests.emit("message", { data }), on: replies.on.bind(replies), start() {} }
  const host = loginomHostPort({ postMessage: (data: unknown) => replies.emit("message", { data }), on: requests.on.bind(requests), start() {} }, service as any)
  const client = transport(endpoint)
  LoginomHost.connect(endpoint, retained)
  return { events, pending, page, retained, host, client, async dispose() { LoginomHost.disconnect(); client.close() } }
}

for (const run of ["wrong", "foreign", undefined]) test(`existing consumer refuses unowned run ${String(run)} before runtime`, async () => {
  const f = fixture()
  try {
    await f.client.request("acquire", { run: "own", session: "chat" })
    await expect(f.client.request("tools", run === undefined ? {} : { run })).rejects.toThrow()
    expect(f.events).toEqual([])
    expect(await f.client.request("tools", { run: "own" })).toBe(f.page)
  } finally { await f.dispose() }
})

test("actual routing distinguishes readiness tools from retained run.chat calls", async () => {
  const f = fixture()
  try {
    const lease = await LoginomHost.acquire("original session")
    await lease!.tools()
    expect(f.events[0]).toBe("runtime:7:readiness")
    await lease!.call("existing fixture tool", {}, "original")
    expect(f.events[2]).toMatch(/^runtime:7:[a-f0-9]{64}$/)
    expect(f.pending).toEqual(["operation"])
    await lease!.release()
    expect(f.retained.leases.has(lease!)).toBe(true)
    expect(f.events.includes("release")).toBe(false)
    await expect(lease!.tools()).rejects.toThrow("LOGINOM_RECOVERY_REQUIRED")
    await expect(f.host.close()).rejects.toThrow("LOGINOM_RECOVERY_REQUIRED")
    expect(f.pending).toEqual(["operation"])
  } finally { await f.dispose() }
})

const source = await readFile(new URL("../../src/cli/standalone-run.ts", import.meta.url), "utf8")
const start = source.indexOf("  } finally {", source.indexOf("    const final ="))
const finallyBody = source.slice(start + "  } finally {".length, source.lastIndexOf("\n  }\n}"))
for (const rejection of [Error("cleanup refusal"), null, undefined, false, 0, ""]) test(`existing finally retains client and exact refusal ${String(rejection)}`, async () => {
  const f = fixture()
  try {
    const lease = await LoginomHost.acquire("original session")
    await lease!.release()
    const finish = vm.runInNewContext("async function finish(){try{}finally{" + finallyBody + "}};finish", {
      owner: f.retained, host: { async close() { throw rejection } },
      cleanup: { async dispose() { f.events.push("dispose") }, detach() { f.events.push("detach") } },
      LoginomHost, signal: undefined, process: { exitCode: undefined }, failure() { f.events.push("failure") },
    })
    let failed = false, received: any
    try { await finish() } catch (error) { failed = true; received = error }
    expect(failed).toBe(true)
    expect(Object.is(received.rejectedValue, rejection)).toBe(true)
    expect(received.owner).toBe(f.retained)
    expect(f.retained.leases.has(lease!)).toBe(true)
    expect(f.events).toEqual([])
    expect(await lease!.tools()).toBe(f.page)
  } finally { await f.dispose() }
})

test("existing transport deadline is a timeout, not cancellation or run deadline proof", async () => {
  const gate = Promise.withResolvers<void>(), f = fixture(gate.promise)
  try {
    await f.client.request("acquire", { run: "own", session: "chat" })
    await expect(f.client.request("tools", { run: "own" }, 1)).rejects.toThrow("LOGINOM_HOST_TIMEOUT")
    expect(f.events).toEqual(["runtime:7:readiness", "list"])
    gate.resolve()
    expect(await f.client.request("tools", { run: "own" })).toBe(f.page)
    expect(f.events.includes("release")).toBe(false)
  } finally { gate.resolve(); await f.dispose() }
})

// Executable consumer requirement specimens only. No host grant is minted here,
// no capture tool dispatched, and this function is never imported by production.
const grant = Object.freeze({ fixture: "opaque host grant" })
const expected = { run: "own", generation: 7, chat: "original", page: "original", selector: "fixed Sorting" }
const valid = () => ({ ...expected, grant, inventory: true, deadline: 100, now: 50, status: "SUCCEEDED", complete: true, pending: false, running: false, unsettled: false, durable: true })
function acceptable(s: any) {
  return s.grant === grant && Object.entries(expected).every(([k, v]) => s[k] === v)
    && s.inventory === true && Number.isFinite(s.deadline) && Number.isFinite(s.now) && s.deadline > s.now
    && s.status === "SUCCEEDED" && s.complete === true && s.pending === false && s.running === false
    && s.unsettled === false && s.durable === true
}
for (const [label, changes] of Object.entries({
  wrong: { selector: "other" }, foreign: { run: "foreign" }, generation: { generation: 8 }, chat: { chat: "other" },
  page: { page: "new" }, missing: { grant: undefined }, copied: { grant: { ...grant } }, inventory: { inventory: undefined },
  unknown: { status: "AMBIGUOUS" }, incomplete: { complete: false }, pending: { pending: true }, running: { running: true },
  unsettled: { unsettled: true }, deadline: { deadline: 50 }, missingDeadline: { deadline: undefined },
  nonfiniteDeadline: { deadline: Infinity }, refusal: { status: "BLOCKED" }, durableFailure: { durable: false },
})) test(`future consumer contract specimen refuses ${label} (not upstream PASS)`, () => {
  expect(acceptable({ ...valid(), ...changes })).toBe(false)
})
test("future consumer contract positive specimen requires every receipt prerequisite", () => {
  expect(acceptable(valid())).toBe(true)
})

function cleanupAcceptable(s: any) {
  return acceptable(s.capture) && s.grant === grant && s.status === "SUCCEEDED"
    && s.package_closed === true && s.logged_out === true && s.discard === false && s.durable === true
}
const clean = () => ({ capture: valid(), grant, status: "SUCCEEDED", package_closed: true, logged_out: true, discard: false, durable: true })
for (const [label, changes] of Object.entries({
  missingReceipt: { status: undefined }, foreignGrant: { grant: {} }, unknown: { status: "AMBIGUOUS" },
  refusal: { status: "BLOCKED" }, missingNativeClose: { package_closed: undefined },
  missingLogout: { logged_out: false }, discard: { discard: true }, durableFailure: { durable: false },
})) test(`future cleanup consumption refuses ${label}; transport receipt is not native cleanup`, () => {
  expect(cleanupAcceptable({ ...clean(), ...changes })).toBe(false)
})
test("future cleanup consumption requires both durable capture and same-owner native receipt", () => {
  expect(cleanupAcceptable(clean())).toBe(true)
  expect(cleanupAcceptable({ ...clean(), capture: { ...valid(), durable: false } })).toBe(false)
})
