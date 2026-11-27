import assert from "node:assert/strict"
import { EventEmitter, once } from "node:events"
import test from "node:test"
import { observeLoginomWindow } from "../src/window-observer.mjs"

test("a headed window reports package, minimize, busy and native close on the same opening", async (t) => {
  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(Error("Window observation timed out")), 5000)
  t.after(() => {
    clearTimeout(deadline)
    controller.abort()
  })
  const events = new EventEmitter()
  const openedAt = 123
  const packageInfo = { name: "Sales", path: "/user/Sales.lgp" }
  const detach = t.mock.fn(async () => {})
  let windowState = "normal"
  let busy = false
  const blockedRead = Promise.withResolvers()
  const readStarted = Promise.withResolvers()
  const page = new EventEmitter()
  page.isClosed = () => false
  page.context = () => ({
    async newCDPSession() {
      return {
        async send(method) {
          assert.equal(method, "Browser.getWindowForTarget")
          return { bounds: { windowState } }
        },
        detach,
      }
    },
  })
  const snapshots = []
  const update = observeLoginomWindow({
    page,
    openedAt,
    busy: () => busy,
    async readPackage() {
      if (windowState === "normal") return packageInfo
      readStarted.resolve()
      return blockedRead.promise
    },
    publish(snapshot) {
      snapshots.push(snapshot)
      events.emit("snapshot", snapshot)
    },
    signal: controller.signal,
  }, 1)
  const next = () => once(events, "snapshot", { signal: controller.signal })
  const open = { openedAt, state: "open", package: packageInfo }
  assert.deepEqual(snapshots, [{ ...open, package: null }])
  assert.deepEqual(await next(), [open])

  windowState = "minimized"
  const minimized = { ...open, state: "minimized" }
  assert.deepEqual(await next(), [minimized])
  await readStarted.promise
  busy = true
  update()
  assert.deepEqual(snapshots.at(-1), { ...open, state: "busy" })
  busy = false
  update()
  assert.deepEqual(snapshots.at(-1), minimized)
  page.emit("close")
  assert.equal(snapshots.at(-1), null)
  const count = snapshots.length
  blockedRead.resolve(null)
  await blockedRead.promise
  await Promise.resolve()
  assert.equal(snapshots.length, count)
  assert.equal(detach.mock.callCount(), 1)
})
