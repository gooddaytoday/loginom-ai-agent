import { test, expect, mock, afterEach } from "bun:test"
import { readFile } from "node:fs/promises"

// Real parser and AbortSignal; Server/HTTP/AppRuntime are explicitly labelled doubles.
let controller: AbortController
let events: string[]
let stop: () => Promise<void>
let startup: () => Promise<void>
let dispose: () => Promise<void>
let began: () => void
afterEach(() => { dispose = async () => {} })
mock.module("../../src/cli/standalone-cancellation", () => ({ standaloneCancellation: () => controller.signal }))
mock.module("../../src/cli/network", () => ({
  withNetworkOptions: (parser: any) => parser.options({ port: { type: "number", default: 0 }, hostname: { type: "string", default: "127.0.0.1" } }),
  resolveNetworkOptions: (options: any) => options,
}))
mock.module("../../src/effect/app-runtime", () => ({ AppRuntime: {
  runPromise: async (value: any) => value,
  dispose: async () => { events.push("runtime-dispose"); await dispose() },
} }))
mock.module("../../src/server/server", () => ({ Server: { listen: async () => {
  events.push("listen"); await startup(); began();
  return { hostname: "127.0.0.1", port: 12345, stop: async (force: boolean) => {
    expect(force).toBe(false); events.push("stop"); await stop()
  } }
} } }))
mock.module("../../src/server/routes/instance/httpapi/server", () => ({ HttpApiApp: {
  webHandler: Object.assign(() => ({ dispose: async () => { events.push("http-dispose") } }), { loaded: () => true }),
} }))
const { standaloneServe, standaloneServeClosed } = await import("../../src/cli/standalone-serve")
function setup() {
  controller = new AbortController(); events = []
  stop = startup = dispose = async () => {}
  let resolve!: () => void
  const started = new Promise<void>(r => resolve = r); began = resolve
  return started
}
test("serve dispatch precedes the NodeHost/TUI module import", async () => {
  const source = await readFile(new URL("../../src/standalone.ts", import.meta.url), "utf8")
  expect(source.indexOf('command === "serve"')).toBeLessThan(source.indexOf('import("./cli/standalone-run")'))
  const adapter = await readFile(new URL("../../src/cli/standalone-serve.ts", import.meta.url), "utf8")
  expect(adapter).not.toContain("launchNodeHost")
})
test("cancellation drains pending original work before scopes/exit confirmation", async () => {
  const started = setup(); let finish!: () => void
  stop = () => new Promise<void>(r => finish = r)
  const run = standaloneServe(["serve", "--port", "0"])
  await started; controller.abort(); await new Promise(r => setImmediate(r))
  expect(events).toEqual(["listen", "stop"]); expect(standaloneServeClosed()).toBe(false)
  finish(); await run
  expect(events).toEqual(["listen", "stop", "http-dispose", "runtime-dispose"])
  expect(standaloneServeClosed()).toBe(true)
})
for (const primary of [Error("original", { cause: 0 }), undefined, null, false, 0, ""]) {
  test("retains raw shutdown primary " + String(primary), async () => {
    const started = setup(); stop = async () => { throw primary }
    const run = standaloneServe(["serve"]); await started; controller.abort()
    let rejected = false, received: unknown
    try { await run } catch (value) { rejected = true; received = value }
    expect(rejected).toBe(true); expect(received).toBe(primary)
    expect(events).toEqual(["listen", "stop"]); expect(standaloneServeClosed()).toBe(false)
  })
}
test("original startup refusal survives a secondary runtime disposal error", async () => {
  setup(); const primary = Error("startup", { cause: false })
  startup = async () => { throw primary }; dispose = async () => { throw Error("secondary") }
  let received: unknown
  try { await standaloneServe(["serve"]) } catch (value) { received = value }
  expect(received).toBe(primary); expect(standaloneServeClosed()).toBe(false)
})
