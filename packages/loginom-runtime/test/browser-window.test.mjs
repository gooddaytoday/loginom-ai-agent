import test from "node:test"
import assert from "node:assert/strict"
import { placeBrowserWindow, readWindowBounds, showBrowserWindow } from "../src/browser-window.mjs"

test("show restores and raises the owning target and reports only confirmed focus", async () => {
  for (const outcome of ["focused", "manual", "no-window"]) {
    let closed = false
    const calls = []
    const cdp = {
      async send(method, params) {
        calls.push([method, params])
        if (method === "Browser.getWindowForTarget") return { windowId: 25, bounds: { windowState: "minimized" } }
        if (method === "Page.bringToFront" && outcome === "no-window") {
          closed = true
          throw Error("target closed")
        }
      },
      async detach() { calls.push(["detach"]) },
    }
    const page = {
      isClosed: () => closed,
      context: () => ({ async newCDPSession(target) { assert.equal(target, page); return cdp } }),
      async waitForFunction() {
        if (outcome !== "focused") throw Error("focus not observed")
        return { async dispose() {} }
      },
    }
    assert.equal(await showBrowserWindow(page, "linux"), outcome)
    assert.deepEqual(calls, [
      ["Browser.getWindowForTarget", undefined],
      ["Browser.setWindowBounds", { windowId: 25, bounds: { windowState: "normal" } }],
      ["Page.bringToFront", undefined],
      ["detach"],
    ])
  }
  assert.equal(await showBrowserWindow(undefined), "no-window")
  assert.equal(await showBrowserWindow({ isClosed: () => true }), "no-window")
})

test("explicit placement checks real CDP readback and Show does not reset a maximized window", async () => {
  const original = { windowState: "maximized", left: 0, top: 0, width: 1600, height: 900 }
  let bounds = original
  let allowPlacement = true
  const cdp = {
    async send(method, payload) {
      if (method === "Browser.getWindowForTarget") return { windowId: 25, bounds }
      if (method === "Browser.getWindowBounds") return { bounds }
      if (method === "Browser.setWindowBounds" && allowPlacement) bounds = { ...bounds, ...payload.bounds }
    },
    async detach() {},
  }
  const page = {
    isClosed: () => false,
    context: () => ({ async newCDPSession() { return cdp } }),
    async waitForFunction() { return { async dispose() {} } },
  }
  const requested = { x: 800, y: -40, width: 800, height: 860 }
  assert.equal(await showBrowserWindow(page, "linux"), "focused")
  assert.deepEqual(bounds, original)
  assert.equal(await placeBrowserWindow(page, requested), "placed")
  assert.deepEqual(bounds, { windowState: "normal", left: 800, top: -40, width: 800, height: 860 })
  allowPlacement = false
  const baseline = await readWindowBounds(page)
  const next = { ...requested, x: -500 }
  assert.equal(await placeBrowserWindow(page, next, baseline), "layout-unavailable")
  assert.equal(bounds.left, 800)
  allowPlacement = true
  assert.equal(await placeBrowserWindow(page, next, baseline), "placed")
  assert.equal(bounds.left, -500)
  bounds = { ...bounds, left: -400 }
  assert.equal(await placeBrowserWindow(page, next, baseline), "unchanged")
  assert.equal(bounds.left, -400)
})
