import { expect, test } from "bun:test"
import { runInNewContext } from "node:vm"
import { closeSlotUserSession } from "../script/loginom-admin-slots.mjs"

test("native slot closure rejects names outside the exact slot before native access", async () => {
  for (const input of [{ username: "eval-a", name: "eval-ab:1" }, { username: "", name: ":1" },
    { username: "admin:1", name: "admin:1:2" }, { username: "eval-a", name: "eval-a:" }])
    expect(await closeSlotUserSession(input)).toEqual({ outcome: "not_applied", data: { code: "ADMIN_REQUEST_INVALID" } })
})

test("native slot closure waits for acknowledged session removal without closing a peer", async () => {
  const rows = [{ Name: "eval-a:1", PendingDisconnect: true }, { Name: "eval-b:2", PendingDisconnect: true }]
  let reads = 0, closes = 0
  const manager = {
    get Count() { return rows.length },
    async SessionInfo(index: number) { return rows[index] },
    async UpdateSessionInfos() {
      if (++reads === 3) rows.shift()
    },
    async CloseSession(row: typeof rows[number]) {
      expect(row.Name).toBe("eval-a:1")
      closes++
      return true
    },
  }
  const session = { CurrentUser: { IsAdmin: true, Name: "admin" } }
  const close: typeof closeSlotUserSession = runInNewContext(`(${closeSlotUserSession.toString()})`, {
    setTimeout,
    bg: { app: { Application: { FInstance: { FServerConnection: { ServerContainer: { Session: session } } } } },
      ScopeGetObjectAsync: async () => ({ GetSessionsManager: async () => manager }) },
  })
  expect(await close({ username: "eval-a", name: "eval-a:1" })).toEqual({ outcome: "confirmed", data: { closed: true } })
  expect(closes).toBe(1)
  expect(rows.map(row => row.Name)).toEqual(["eval-b:2"])
})

test("native slot closure uses the exact current proxy and rereads sessions", async () => {
  const rows = [{ Name: "eval-a:1", PendingDisconnect: true }, { Name: "eval-b:2", PendingDisconnect: true }]
  const calls: string[] = []
  const manager = {
    get Count() { return rows.length },
    async SessionInfo(index: number) { return rows[index] },
    async UpdateSessionInfos() { calls.push("read") },
    async CloseSession(row: typeof rows[number], timeout: number) {
      expect(row).toBe(rows[0]!)
      expect(timeout).toBe(5000)
      calls.push(row.Name)
      rows.splice(rows.indexOf(row), 1)
      return true
    },
  }
  const session = { CurrentUser: { IsAdmin: true, Name: "admin" } }
  const close: typeof closeSlotUserSession = runInNewContext(`(${closeSlotUserSession.toString()})`, {
    setTimeout,
    bg: { app: { Application: { FInstance: { FServerConnection: { ServerContainer: { Session: session } } } } },
      ScopeGetObjectAsync: async () => ({ GetSessionsManager: async () => manager }) },
  })
  expect(await close({ username: "eval-a", name: "eval-a:1" })).toEqual({ outcome: "confirmed", data: { closed: true } })
  expect(rows.map(row => row.Name)).toEqual(["eval-b:2"])
  expect(calls).toEqual(["read", "eval-a:1", "read"])
  rows.push({ Name: "eval-a:3", PendingDisconnect: false })
  expect(await close({ username: "eval-a", name: "eval-a:3" })).toEqual({ outcome: "not_applied", data: { code: "SESSION_NOT_IDLE" } })
  expect(calls.filter(call => call.startsWith("eval-a:"))).toEqual(["eval-a:1"])
  rows[1]!.PendingDisconnect = true
  manager.CloseSession = async () => true
  expect(await close({ username: "eval-a", name: "eval-a:3" })).toEqual({ outcome: "unknown", data: { code: "SESSION_STILL_PRESENT" } })
  expect(rows.map(row => row.Name)).toEqual(["eval-b:2", "eval-a:3"])
})
