import test from "node:test"
import assert from "node:assert/strict"
import { showBrowserWindow } from "../src/browser-window.mjs"

test("show restores and raises the owning target and reports only confirmed focus", async () => {
  for (const outcome of ["focused", "focus-unconfirmed", "no-window"]) {
    let closed = false
    const calls = []
    const cdp = {
      async send(method, params) {
        calls.push([method, params])
        if (method === "Browser.getWindowForTarget") return { windowId: 25 }
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
    assert.equal(await showBrowserWindow(page), outcome)
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
