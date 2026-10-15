import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { runInNewContext } from "node:vm"

const source = await readFile(new URL("../src/managed-entry.mjs", import.meta.url), "utf8")
// Exercise the entrypoint's actual shutdown and IPC handler without starting Loginom.
const shutdown = source.slice(source.indexOf("const send ="), source.indexOf("const stop ="))
const handler = source.slice(source.indexOf("async function handle(message)"))

for (const [name, result] of [
  ["BLOCKED cleanup", { browser_transport_closed: false, browser_process_terminated: false,
    clipboard_leases_retained: 1, package_cleanup: { status: "BLOCKED", reason: "UNSAVED_CHANGES" } }],
  ["unconfirmed browser termination", { browser_transport_closed: true,
    browser_process_terminated: false, clipboard_leases_retained: 0 }],
  ["retained clipboard lease", { browser_transport_closed: true,
    browser_process_terminated: true, clipboard_leases_retained: 1 }],
  ["missing close result", undefined],
  ["confirmed cleanup", { browser_transport_closed: true,
    browser_process_terminated: true, clipboard_leases_retained: 0 }],
  ["rejected cleanup", new Error("private cleanup failure")],
]) {
  test(`managed close propagates ${name} before acknowledging`, async () => {
    const calls = [], messages = []
    const state = {
      controller: { abort() { calls.push("abort") } },
      client: { async close() { calls.push("client") } },
      bridge: { async close() {
        calls.push("bridge")
        if (result instanceof Error) throw result
        return result
      } },
      browserServer: { async close() { calls.push("browserServer") } },
      browser: { async close() { calls.push("browser") } },
      browserProfile: "owned-profile",
    }
    const pending = Promise.withResolvers()
    const runtime = runInNewContext(`${shutdown}\n${handler}\n({close, handle})`, {
      state, requests: new Set([pending.promise]),
      rm: async (path, options) => {
        assert.equal(path, "owned-profile")
        assert.equal(options.recursive, true)
        calls.push("profile")
      },
      process: {
        connected: true,
        send(message, callback) { messages.push(structuredClone(message)); callback() },
        disconnect() { calls.push("disconnect") },
      },
    })
    const closing = runtime.handle({ id: "close-1", operation: "close" })
    assert.deepEqual(calls, ["abort"], "accepted requests drain before closing resources")
    pending.resolve()
    await closing
    const success = name === "confirmed cleanup"
    assert.deepEqual(messages, [success
      ? { id: "close-1", result: { closed: true } }
      : { id: "close-1", error: "LOGINOM_RUNTIME_CLEANUP_FAILED" }])
    assert.deepEqual(calls, success || result instanceof Error
      ? ["abort", "client", "bridge", "browserServer", "browser", "profile", "disconnect"]
      : ["abort", "client", "bridge", "disconnect"])
    const first = runtime.close()
    assert.equal(runtime.close(), first, "shutdown must not retry cleanup")
    if (success) await first
    else await assert.rejects(first, error => error.message === "LOGINOM_RUNTIME_CLEANUP_FAILED")
    assert.equal(calls.filter(call => call === "bridge").length, 1)
  })
}
