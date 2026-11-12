import assert from "node:assert/strict"
import test from "node:test"
import { fixture } from "./fixture.mjs"

test("dashboard tables retain at most ten thousand rows and report the full count", async t => {
  const app = await fixture(t, { published: true, table: {
    schema: [{ name: "count", type: 1 }], rows: Array.from({ length: 10_001 }, (_, index) => [index]),
  } })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  const { table } = await app.settled()
  assert.equal(table.rows.length, 10_000)
  assert.equal(table.totalRows, 10_001)
  assert.equal(table.truncated, true)
  assert.deepEqual(table.rows.at(-1), [9999])
})

test("dashboard tables crop long string cells and mark the result as truncated", async t => {
  const app = await fixture(t, { published: true, table: {
    schema: [{ name: "text", type: 2 }], rows: [["x".repeat(10_000) + "y"]],
  } })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  const { table } = await app.settled()
  assert.equal(table.rows[0][0].length, 10_000)
  assert.equal(table.rows[0][0].at(-1), "x")
  assert.equal(table.totalRows, 1)
  assert.equal(table.truncated, true)
  assert.equal(app.snapshots[0].sample.rows[0][0].length, 10_001)
  assert.equal(app.snapshots[0].sample.rows[0][0].at(-1), "y")
})

test("dashboard tables fit the serialized row budget without splitting a row", async t => {
  const app = await fixture(t, { published: true, table: {
    schema: [{ name: "text", type: 2 }], rows: Array.from({ length: 600 }, () => ["x".repeat(10_000)]),
  } })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  const { table } = await app.settled()
  assert.ok(table.rows.length > 0 && table.rows.length < 600)
  const size = table.rows.reduce((size, row) => size + JSON.stringify(row).length, 0)
  assert.ok(size <= 5_000_000)
  assert.ok(size + JSON.stringify(table.rows[0]).length > 5_000_000)
  assert.equal(table.totalRows, 600)
  assert.equal(table.truncated, true)
})

test("the shell opens an isolated app and delivers the first SDK state", async t => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  const frame = app.page.locator('iframe[title="Dashboard"]')
  await frame.waitFor()
  assert.equal(await frame.getAttribute("sandbox"), "allow-scripts")
  assert.equal(await frame.getAttribute("referrerpolicy"), "no-referrer")
  assert.equal(await frame.getAttribute("allow"),
    "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; " +
    "display-capture 'none'; fullscreen 'none'; payment 'none'; publickey-credentials-get 'none'; " +
    "identity-credentials-get 'none'; usb 'none'; serial 'none'; hid 'none'; bluetooth 'none'")
  assert.equal(await frame.getAttribute("src"), `${app.appOrigin}/apps/${"a".repeat(64)}/${"b".repeat(64)}/`)
  const state = await app.settled()
  assert.deepEqual(state, {
    parameters: [{ name: "MinBudget", value: 0 }],
    table: { schema: [{ name: "count", type: 1 }], rows: [[42]], truncated: false, totalRows: 1 },
    error: null, busy: false,
  })
  assert.deepEqual(await app.frame().evaluate(() => window.late()), state)
  assert.deepEqual(app.errors, [])
})

test("numeric fields in the trusted header send queued busy and completed states", async t => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  const initial = await app.settled()
  const input = app.page.getByLabel("MinBudget", { exact: true })
  await input.waitFor()
  assert.match(await app.page.locator("header").textContent(), /user\/fixture\/campaign\.lgp/)
  await app.page.evaluate(() => { window.fixture.wait = true })
  await input.fill("10")
  await input.press("Enter")
  await app.page.waitForFunction(() => window.fixture.calls === 1 && window.fixture.finish)
  assert.equal(await input.isEnabled(), true)
  await app.frame().waitForFunction(() => window.states?.at(-1).busy === true)
  const waiting = await app.states()
  assert.equal(waiting.at(-1).busy, true)
  assert.deepEqual(waiting.at(-1).table, initial.table)
  await app.page.evaluate(() => { window.fixture.wait = false; window.fixture.finish() })
  assert.equal((await app.settled(1)).parameters[0].value, 10)
  const count = (await app.states()).length
  await input.fill("-10")
  await input.blur()
  assert.equal((await app.settled(count)).parameters[0].value, -10)
  assert.deepEqual(await app.page.evaluate(() => window.fixture.writes), [10, -10])
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 2)
  assert.deepEqual(app.errors, [])
})

test("the trusted header renders node, package and parameter names as text", async t => {
  const payload = "<img src=x onerror=alert(1)>"
  const app = await fixture(t, { published: true, variables: [{ name: payload, type: 3, value: 1 }] })
  await app.page.evaluate(payload => {
    const form = window.Ext.ComponentQuery.query("panel#pnlModelForm")[0].Controller
    form.GetOneSelectedNode(false).GetData().get_DisplayName = async () => payload
    window.bg.ScopeFindObject = () => ({ FileName: payload })
  }, payload)
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  assert.equal(await app.page.locator("header strong").textContent(), payload)
  assert.equal(await app.page.locator("header span").textContent(), "/" + payload)
  assert.equal(await app.page.getByLabel(payload, { exact: true }).count(), 1)
  assert.equal(await app.page.locator("header img").count(), 0)
  assert.deepEqual(app.dialogs, [])
  assert.deepEqual(app.errors, [])
})

test("a dashboard without ready is replaced by the timeout message", async t => {
  const app = await fixture(t, { published: true, app: "silent" })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.page.locator('iframe[title="Dashboard"]').waitFor()
  await app.page.getByRole("status").filter({ hasText: "Dashboard не ответил" }).waitFor({ timeout: 12_000 })
  assert.equal(await app.page.locator("iframe").count(), 0)
  assert.equal(await app.page.evaluate(() => window.channels), 0)
  assert.deepEqual(app.errors, [])
})

test("window and port floods share one limit and cannot submit parameters", async t => {
  const app = await fixture(t, { published: true })
  await app.page.context().addInitScript(() => {
    addEventListener("message", event => {
      if (event.source === parent && event.data?.type === "loginom-dashboard/init") window.testPort = event.ports[0]
    })
  })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.frame().evaluate(() => {
    for (let index = 0; index < 25; index++) parent.postMessage({ type: "ignored" }, "*")
    for (let index = 0; index < 30; index++) window.testPort.postMessage({ type: "state", parameters: [{ name: "MinBudget", value: 999 }] })
  })
  await app.page.locator("#dashboard-tab-overlay").waitFor({ state: "detached" })
  assert.deepEqual(await app.page.evaluate(() => window.fixture.writes), [])
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 0)
  assert.deepEqual(app.errors, [])
})

test("editing in Desktop captures a fresh snapshot after accepted parameter changes", async t => {
  const app = await fixture(t, { published: true })
  const opening = app.page.waitForResponse(response => response.url().endsWith("/dashboard/targets"))
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  const initialID = (await (await opening).json()).id
  await app.settled()
  await app.page.evaluate(() => { window.fixture.rows = [[99]] })
  await app.page.getByLabel("MinBudget", { exact: true }).fill("17")
  await app.page.getByLabel("MinBudget", { exact: true }).press("Enter")
  await app.settled(1)
  const [popup] = await Promise.all([
    app.page.waitForEvent("popup", { timeout: 2_000 }),
    app.page.getByRole("button", { name: "Изменить в чате", exact: true }).click(),
  ])
  await popup.waitForLoadState("domcontentloaded")
  const calls = await app.page.evaluate(() => window.desktopOpens)
  assert.notEqual(new URL(calls.at(-1).url).searchParams.get("id"), initialID)
  assert.equal(app.snapshots.length, 2)
  assert.deepEqual(app.snapshots.at(-1).parameters, [{ name: "MinBudget", value: 17 }])
  assert.deepEqual(app.snapshots.at(-1).sample, { schema: [{ name: "count", type: 1 }], rows: [[99]] })
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 1)
  assert.equal(await popup.evaluate(() => window.opener), null)
  assert.deepEqual(app.errors, [])
})

test("editing after a long calculation keeps a clickable Desktop link", async t => {
  const app = await fixture(t, { published: true, popupBlocking: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.page.evaluate(() => { window.fixture.wait = true })
  await app.page.getByLabel("MinBudget", { exact: true }).fill("17")
  await app.page.getByLabel("MinBudget", { exact: true }).press("Enter")
  await app.page.waitForFunction(() => window.fixture.finish)
  await app.page.getByRole("button", { name: "Изменить в чате", exact: true }).click()
  await app.page.waitForFunction(() => !navigator.userActivation.isActive, undefined, { timeout: 7_000 })
  assert.equal(app.snapshots.length, 1)
  const refreshed = app.page.waitForResponse(response => response.url().endsWith("/dashboard/targets"))
  // Playwright evaluate grants a new user gesture; finish the RPC without changing activation.
  const cdp = await app.page.context().newCDPSession(app.page)
  const resumed = await cdp.send("Runtime.evaluate", {
    expression: `window.fixture.wait = false; window.fixture.finish(); new Promise(resolve => {
      const deadline = setTimeout(() => { clearInterval(poll); resolve(false) }, 5000)
      const poll = setInterval(() => {
        const link = document.querySelector("#dashboard-tab-overlay a")
        if (!link && !window.desktopOpens.length) return
        clearTimeout(deadline); clearInterval(poll); resolve(Boolean(link))
      }, 10)
    })`,
    userGesture: false, awaitPromise: true, returnByValue: true,
  })
  await cdp.detach()
  assert.equal(resumed.result.value, true)
  const freshID = (await (await refreshed).json()).id
  const link = app.page.getByRole("link", { name: "Открыть чат в Desktop", exact: true })
  await link.waitFor()
  assert.equal(new URL(await link.getAttribute("href")).searchParams.get("id"), freshID)
  assert.deepEqual(app.snapshots.at(-1).parameters, [{ name: "MinBudget", value: 17 }])
  await link.evaluate((element, href) => { element.href = href }, app.origin + "/desktop-link")
  const [popup] = await Promise.all([app.page.waitForEvent("popup"), link.click()])
  await popup.waitForLoadState("domcontentloaded")
  assert.equal(await popup.evaluate(() => window.opener), null)
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 1)
  assert.deepEqual(app.errors, [])
})

test("Desktop chat opens separately and preserves the ordinary unload guard", async (t) => {
  const { page, errors, dialogs, origin, publish } = await fixture(t)
  assert.deepEqual(errors, [])
  await page.getByRole("button", { name: "Создать dashboard" }).click()
  const link = page.getByRole("link", { name: "Открыть чат в Desktop" })
  await link.waitFor()
  const back = page.getByRole("button", { name: "Вернуться к сценарию", exact: true })
  assert.equal(await back.evaluate((element) => getComputedStyle(element).cursor), "pointer")
  const desktop = new URL(await link.getAttribute("href"))
  assert.equal(desktop.protocol, "loginom-ai-agent:")
  assert.equal(desktop.hostname, "dashboard")
  assert.equal(desktop.searchParams.get("action"), "create")
  assert.equal(await page.evaluate(() => window.blockedDesktopLinks), 1)
  await link.evaluate((element, href) => {
    element.href = href
  }, origin + "/desktop-link")
  const [popup] = await Promise.all([page.waitForEvent("popup", { timeout: 2_000 }), link.click()])
  await popup.waitForLoadState("domcontentloaded")
  assert.equal(popup.url(), origin + "/desktop-link")
  assert.equal(await popup.evaluate(() => window.opener), null)
  assert.equal(page.url(), origin + "/app/")
  assert.deepEqual(dialogs, [])
  await popup.close()
  const [dialog] = await Promise.all([
    page.waitForEvent("dialog"),
    page.getByRole("link", { name: "Ordinary link" }).click(),
  ])
  assert.equal(dialog.type(), "beforeunload")
  assert.equal(page.url(), origin + "/app/")
  await back.click()
  publish()
  await page.getByRole("button", { name: /^(Создать dashboard|Dashboard)$/ }).click()
  const edit = page.getByText("Изменить в чате", { exact: true })
  await edit.waitFor()
  assert.equal(await edit.evaluate((element) => element.tagName), "BUTTON")
  assert.equal(await edit.getAttribute("type"), "button")
  assert.equal(await edit.evaluate((element) => getComputedStyle(element).cursor), "pointer")
  assert.ok((await edit.evaluate((element) => getComputedStyle(element).textDecorationLine)).includes("underline"))
  const layout = await back.evaluate((button) => {
    const header = button.parentElement
    const reference = button.cloneNode(true)
    reference.removeAttribute("style")
    header.append(reference)
    const originalButtonHeight = reference.getBoundingClientRect().height
    reference.remove()
    const bounds = header.getBoundingClientRect()
    return {
      originalButtonHeight,
      top: bounds.top,
      bottom: bounds.bottom,
      height: bounds.height,
      buttons: [...header.querySelectorAll("button")].map((element) => {
        const rect = element.getBoundingClientRect()
        return { top: rect.top, bottom: rect.bottom, height: rect.height }
      }),
    }
  })
  // The previous header had an unstyled native button and 8px padding above and below.
  assert.ok(layout.height <= layout.originalButtonHeight + 16, JSON.stringify(layout))
  assert.equal(layout.buttons.length, 2)
  assert.ok(
    layout.buttons.every((button) => button.height > layout.originalButtonHeight),
    JSON.stringify(layout),
  )
  assert.ok(layout.buttons.every((button) => button.top >= layout.top && button.bottom <= layout.bottom))
  dialogs.length = 0
  const [editPopup] = await Promise.all([page.waitForEvent("popup", { timeout: 2_000 }), edit.click()])
  await editPopup.waitForLoadState("domcontentloaded")
  assert.equal(editPopup.url(), origin + "/desktop-link")
  assert.equal(await editPopup.evaluate(() => window.opener), null)
  const calls = await page.evaluate(() => window.desktopOpens)
  assert.equal(calls.length, 1)
  assert.equal(new URL(calls[0].url).searchParams.get("action"), "edit")
  assert.equal(calls[0].target, "_blank")
  assert.equal(calls[0].features, "noopener")
  assert.equal(page.url(), origin + "/app/")
  assert.deepEqual(dialogs, [])
})

test("opening a published dashboard executes an inactive node before loading its iframe", async (t) => {
  const app = await fixture(t, { published: true, status: "inactive" })
  await app.page.evaluate(() => { window.fixture.wait = true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.page.getByRole("status").filter({ hasText: "Идёт расчёт" }).waitFor()
  assert.equal(await app.page.locator("iframe").count(), 0)
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 1)
  await app.page.evaluate(() => window.fixture.finish())
  const state = await app.settled()
  assert.deepEqual(state.table, { schema: [{ name: "count", type: 1 }], rows: [[42]], truncated: false, totalRows: 1 })
  assert.equal(state.error, null)
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 1)
  assert.deepEqual(app.errors, [])
})

test("reopening retries a saved error even when the node remains active", async (t) => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 0)
  await app.page.evaluate(() => { window.fixture.executeError = { message: "Ошибка расчёта в Studio" } })
  await app.page.getByLabel("MinBudget", { exact: true }).fill("5")
  await app.page.getByLabel("MinBudget", { exact: true }).press("Enter")
  const failed = await app.settled(1)
  assert.equal(failed.error, "Ошибка расчёта в Studio")
  assert.equal(failed.table, null)
  await app.page.evaluate(() => { window.fixture.status = "active" })
  assert.equal(await app.page.evaluate(() => window.fixture.status), "active")
  await app.page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  await app.page.evaluate(() => { window.fixture.executeError = Error("Still failing") })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.page.getByRole("status").filter({ hasText: "Still failing" }).waitFor()
  assert.equal(await app.page.locator("iframe").count(), 0)
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 2)
  await app.page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  await app.page.evaluate(() => { window.fixture.executeError = null })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  const recovered = await app.settled()
  assert.equal(recovered.error, null)
  assert.deepEqual(recovered.table.rows, [[42]])
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 3)
  assert.deepEqual(app.errors, [])
})

test("active and empty results reopen without another execution", async (t) => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  assert.deepEqual((await app.settled()).table.rows, [[42]])
  await app.page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  await app.page.evaluate(() => { window.fixture.rows = [] })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  assert.deepEqual((await app.settled()).table.rows, [])
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 0)
  assert.deepEqual(app.errors, [])
})

test("closing during a parameter calculation and reopening waits without a duplicate execution", async (t) => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.page.evaluate(() => { window.fixture.wait = true })
  await app.page.getByLabel("MinBudget", { exact: true }).fill("17")
  await app.page.getByLabel("MinBudget", { exact: true }).press("Enter")
  await app.page.waitForFunction(() => window.fixture.finish)
  await app.page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.page.getByRole("status").filter({ hasText: "Идёт расчёт" }).waitFor()
  assert.equal(await app.page.locator("iframe").count(), 0)
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 1)
  await app.page.evaluate(() => window.fixture.finish())
  const state = await app.settled()
  assert.equal(state.parameters[0].value, 17)
  assert.deepEqual(state.table.rows, [[42]])
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 1)
  assert.deepEqual(app.errors, [])
})

test("an initial calculation error stays visible until a successful reopening", async (t) => {
  const app = await fixture(t, { published: true, status: "inactive" })
  await app.page.evaluate(() => {
    window.fixture.executeError = Error("Source unavailable")
  })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.page.getByRole("status").filter({ hasText: "Source unavailable" }).waitFor()
  assert.equal(await app.page.locator("iframe").count(), 0)
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 1)
  await app.page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  await app.page.evaluate(() => {
    window.fixture.executeError = null
  })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  assert.equal((await app.settled()).error, null)
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 2)
  assert.deepEqual(app.errors, [])
})

test("creation still calculates its sample and unsupported outputs never execute", async (t) => {
  const { page, errors, snapshots } = await fixture(t, { status: "inactive" })
  await page.getByRole("button", { name: "Создать dashboard", exact: true }).click()
  await page.getByRole("link", { name: "Открыть чат в Desktop" }).waitFor()
  assert.deepEqual(snapshots[0].sample, { schema: [{ name: "count", type: 1 }], rows: [[42]] })
  assert.deepEqual(snapshots[0].parameters, [{ name: "MinBudget", value: 0 }])
  assert.equal(await page.evaluate(() => window.fixture.calls), 1)
  await page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  await page.evaluate(() => {
    window.fixture.subtype = 2
    window.fixture.status = "inactive"
  })
  await page.getByRole("button", { name: /^(Создать dashboard|Dashboard)$/ }).click()
  await page.getByRole("status").filter({ hasText: "Dashboard для этого узла недоступен" }).waitFor()
  assert.equal(await page.evaluate(() => window.fixture.calls), 1)
  assert.equal(snapshots.length, 1)
  assert.deepEqual(errors, [])
})

test("queued parameter submissions finish in order after the iframe closes", async (t) => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.page.evaluate(() => { window.fixture.wait = true; window.fixture.writes = [] })
  const input = app.page.getByLabel("MinBudget", { exact: true })
  await input.fill("17")
  await input.press("Enter")
  await app.page.waitForFunction(() => window.fixture.calls === 1 && window.fixture.finish)
  await input.fill("29")
  await input.press("Enter")
  assert.deepEqual(await app.page.evaluate(() => window.fixture.writes), [17])
  await app.page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  assert.equal(await app.page.locator("iframe").count(), 0)
  await app.page.evaluate(() => {
    const finish = window.fixture.finish
    delete window.fixture.finish
    finish()
  })
  await app.page.waitForFunction(() => window.fixture.calls === 2 && window.fixture.finish)
  assert.deepEqual(await app.page.evaluate(() => window.fixture.writes), [17, 29])
  await app.page.evaluate(() => window.fixture.finish())
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  assert.equal((await app.settled()).parameters[0].value, 29)
  assert.equal(await app.page.evaluate(() => window.fixture.calls), 2)
  assert.deepEqual(app.errors, [])
})

for (const missingAPI of ["EndOperationEx", "GetOutputPorts", "GetData"]) {
  test(`missing ${missingAPI} preserves native actions without a dashboard button`, async (t) => {
    const { page, errors } = await fixture(t, { missingAPI, lateForm: true })
    await page.evaluate(() => window.fixture.showScenario())
    await page.getByRole("button", { name: "Native action" }).click()
    assert.equal(await page.evaluate(() => window.fixture.native), true)
    assert.deepEqual(errors, [])
    assert.equal(await page.getByRole("button", { name: /^(Dashboard|Создать dashboard)$/ }).count(), 0)
    assert.equal(await page.locator("#dashboard-tab-overlay").count(), 0)
  })
}

test("Escape closes the bundled dashboard and leaves Studio usable", async (t) => {
  const app = await fixture(t, { published: true })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.frame().press("body", "Escape")
  await app.page.locator("#dashboard-tab-overlay").waitFor({ state: "detached" })
  await app.page.getByRole("button", { name: "Native action" }).click()
  assert.equal(await app.page.evaluate(() => window.fixture.native), true)
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  await app.page.getByLabel("MinBudget", { exact: true }).press("Escape")
  assert.equal(await app.page.locator("#dashboard-tab-overlay").count(), 0)
  assert.deepEqual(app.errors, [])
})

test("invalid lookup fields leave an error instead of loading a published iframe", async (t) => {
  const { page, errors } = await fixture(t, { published: true, malformed: "lookup" })
  await page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await page.getByRole("status").filter({ hasText: "Некорректный ответ службы dashboard (lookup)" }).waitFor()
  assert.equal(await page.locator("iframe").count(), 0)
  assert.deepEqual(errors, [])
})

test("invalid snapshot fields leave an error instead of opening Desktop or an iframe", async (t) => {
  const { page, errors } = await fixture(t, { malformed: "snapshot" })
  await page.getByRole("button", { name: "Создать dashboard", exact: true }).click()
  await page.getByRole("status").filter({ hasText: "Некорректный ответ службы dashboard (snapshot)" }).waitFor()
  assert.equal(await page.locator("iframe").count(), 0)
  assert.equal(await page.getByRole("link", { name: "Открыть чат в Desktop" }).count(), 0)
  assert.deepEqual(errors, [])
})

test("missing required Studio enum member preserves native actions without dashboard UI", async (t) => {
  const { page, errors } = await fixture(t, { published: true, missingAPI: "dtInteger" })
  await page.getByRole("button", { name: "Native action" }).click()
  assert.equal(await page.evaluate(() => window.fixture.native), true)
  assert.equal(await page.getByRole("button", { name: /^(Dashboard|Создать dashboard)$/ }).count(), 0)
  assert.equal(await page.locator("#dashboard-tab-overlay, iframe").count(), 0)
  assert.deepEqual(errors, [])
})

test("missing required Studio interface identifier preserves native actions without dashboard UI", async (t) => {
  const { page, errors } = await fixture(t, { published: true, missingAPI: "IBGModelOutputSocket" })
  await page.getByRole("button", { name: "Native action" }).click()
  assert.equal(await page.evaluate(() => window.fixture.native), true)
  assert.equal(await page.getByRole("button", { name: /^(Dashboard|Создать dashboard)$/ }).count(), 0)
  assert.equal(await page.locator("#dashboard-tab-overlay, iframe").count(), 0)
  assert.deepEqual(errors, [])
})

test("Studio loads the shell before login and renders the workflow after login", async (t) => {
  const { page } = await fixture(t, { lateForm: true })
  await page.evaluate(() => window.fixture.showScenario())
  await page.getByRole("button", { name: "Создать dashboard" }).waitFor()
})

test("a workflow tree without a generic form node preserves the ROI binding", async (t) => {
  const { page, origin, snapshots } = await fixture(t, { published: true })
  await page.evaluate(() => {
    const form = window.Ext.ComponentQuery.query("panel#pnlModelForm")[0].Controller
    delete form.FGenericNode
    const tab = window.bg.app.Application.Instance.FMainForm.GetActiveTab()
    const modelUnit = { get_Guid: async () => "{27CB94A9-F6E9-35FF-80B7-BC7D01BA6AA7}" }
    tab.FNode = { data: {}, parentNode: { data: { node: { ModelUnitItem: modelUnit } } } }
    form.GetOneSelectedNode(false).GetData().get_Guid = async () => "{77C145B1-6CE3-458F-AA36-E6AFDAB2A930}"
    window.bg.ScopeFindObject = () => ({ FileName: "user/dashboard-roi/campaign.lgp" })
  })
  await page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await page.locator("iframe").waitFor()
  assert.deepEqual(snapshots[0].binding, {
    server: origin,
    packagePath: "/user/dashboard-roi/campaign.lgp",
    workflowGuid: "27cb94a9-f6e9-35ff-80b7-bc7d01ba6aa7",
    nodeGuid: "77c145b1-6ce3-458f-aa36-e6afdab2a930",
    port: 0,
  })
})
