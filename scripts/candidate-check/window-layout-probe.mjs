import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright-core")

function xprop(...args) {
  return execFileSync("xprop", args, { encoding: "utf8" })
}

function x11Bounds(title) {
  const info = execFileSync("xwininfo", ["-name", `${title} - Google Chrome`], { encoding: "utf8" })
  const read = (field) => {
    const match = info.match(new RegExp(`^\\s*${field}:\\s*(-?\\d+)$`, "m"))
    assert.ok(match, `Missing ${field} in xwininfo`)
    return Number(match[1])
  }
  return {
    left: read("Absolute upper-left X"),
    top: read("Absolute upper-left Y"),
    width: read("Width"),
    height: read("Height"),
  }
}

function activeWindow() {
  const id = xprop("-root", "_NET_ACTIVE_WINDOW").match(/0x[0-9a-f]+/i)?.[0]
  if (!id || id === "0x0") return ""
  return xprop("-id", id, "_NET_WM_NAME")
}

async function expectEventually(check) {
  const deadline = Date.now() + 5000
  while (true) {
    try {
      await check()
      return
    } catch (error) {
      if (Date.now() >= deadline) throw error
      await delay(50)
    }
  }
}

function launch(bounds) {
  const { left, top, width, height } = bounds
  return chromium.launchPersistentContext("", {
    executablePath: process.env.CHROME_BIN ?? "/usr/bin/google-chrome",
    headless: false,
    viewport: null,
    args: [
      "--ozone-platform=x11",
      "--host-resolver-rules=MAP * ~NOTFOUND",
      `--window-position=${left},${top}`,
      `--window-size=${width},${height}`,
    ],
  })
}

async function openPage(context, title) {
  const [page] = context.pages()
  await page.goto(`data:text/html,<title>${title}</title><h1>${title}</h1>`)
  const cdp = await context.newCDPSession(page)
  const { windowId } = await cdp.send("Browser.getWindowForTarget")
  return { cdp, windowId }
}

function expectBounds(window, expected) {
  return expectEventually(async () => {
    const { bounds } = await window.cdp.send("Browser.getWindowBounds", { windowId: window.windowId })
    assert.deepEqual(bounds, expected)
  })
}

function setBounds(window, bounds) {
  return window.cdp.send("Browser.setWindowBounds", { windowId: window.windowId, bounds })
}

const initial = { left: 660, top: 80, width: 680, height: 620 }
const placed = { left: 700, top: 100, width: 700, height: 640 }
const appTitle = "Application window probe"
const loginomTitle = "Loginom window probe"
const app = await launch({ left: 40, top: 80, width: 600, height: 720 })
try {
  const appWindow = await openPage(app, appTitle)
  const loginom = await launch(initial)
  try {
    const loginomWindow = await openPage(loginom, loginomTitle)
    await expectBounds(loginomWindow, { ...initial, windowState: "normal" })
    await expectEventually(() => assert.deepEqual(x11Bounds(loginomTitle), initial))
    console.log("Launch flags:", initial)

    await setBounds(loginomWindow, placed)
    await expectBounds(loginomWindow, { ...placed, windowState: "normal" })
    await expectEventually(() => assert.deepEqual(x11Bounds(loginomTitle), placed))
    const appBounds = x11Bounds(appTitle)
    assert.ok(appBounds.left + appBounds.width < placed.left, "Loginom must be to the right of the app")
    console.log("CDP and X11 bounds:", placed)

    await appWindow.cdp.send("Page.bringToFront")
    await expectEventually(() => assert.match(activeWindow(), new RegExp(appTitle)))
    console.log("X11 foreground before:", appTitle)

    await loginomWindow.cdp.send("Page.bringToFront")
    await expectEventually(() => assert.match(activeWindow(), new RegExp(loginomTitle)))
    console.log("X11 foreground after:", loginomTitle)

    await setBounds(loginomWindow, { windowState: "minimized" })
    await expectBounds(loginomWindow, { ...placed, windowState: "minimized" })
    await expectEventually(() => assert.match(activeWindow(), new RegExp(appTitle)))
    await setBounds(loginomWindow, { windowState: "normal" })
    await expectBounds(loginomWindow, { ...placed, windowState: "normal" })
    console.log("X11 foreground after restoring:", activeWindow().trim())
    await loginomWindow.cdp.send("Page.bringToFront")
    await expectEventually(() => assert.match(activeWindow(), new RegExp(loginomTitle)))
    console.log("X11 foreground after restore + raise:", loginomTitle)
  } finally {
    await loginom.close()
  }
} finally {
  await app.close()
}
