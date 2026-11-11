import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { chromium } from "../../../loginom-runtime/client/node_modules/playwright-core/index.mjs"

async function fixture(t, { published = false, status = "active" } = {}) {
  const browser = await chromium.launch({ channel: "chromium", headless: true, chromiumSandbox: true })
  t.after(() => browser.close())
  const context = await browser.newContext()
  await context.addInitScript(() => {
    window.blockedDesktopLinks = 0
    window.desktopOpens = []
    const open = window.open.bind(window)
    window.open = (url, target, features) => {
      if (String(url).startsWith("loginom-ai-agent:")) {
        window.desktopOpens.push({ url, target, features })
        return open("/desktop-link", target, features)
      }
      return open(url, target, features)
    }
    document.addEventListener("click", event => {
      const link = event.target.closest?.("a")
      if (!link?.href.startsWith("loginom-ai-agent:")) return
      event.preventDefault()
      window.blockedDesktopLinks++
    }, true)
  })
  const origin = "http://127.0.0.1:39999"
  const bootstrap = await readFile(new URL("../../../../dashboard/bootstrap.js", import.meta.url), "utf8")
  const snapshots = []
  await context.route("**/*", async route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (url.pathname === "/dashboard/lookup")
      return route.fulfill({ json: { exists: published, key: "a".repeat(64) } })
    if (url.pathname === "/dashboard/targets") {
      snapshots.push(route.request().postDataJSON())
      return route.fulfill({ json: { id: "00000000-0000-4000-8000-000000000001", nodeName: "Fixture node" } })
    }
    if (url.pathname === "/dashboard-bootstrap.js")
      return route.fulfill({ contentType: "text/javascript", body: bootstrap })
    if (["/desktop-link", "/ordinary"].includes(url.pathname) || url.pathname.startsWith("/dashboard/apps/"))
      return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Safe destination</title>" })
    if (url.pathname !== "/app/") return route.abort()
    return route.fulfill({ contentType: "text/html", body: `<!doctype html><meta charset="utf-8">
      <title>Loginom fixture</title><main id="model" style="position:relative;height:200px"></main><a href="/ordinary">Ordinary link</a>
      <script>
        addEventListener('beforeunload', event => {event.preventDefault(); event.returnValue = ''});
        window.fixture = {status: ${JSON.stringify(status)}, calls: 0, rows: [[42]], wait: false};
        const node = {
          get_Guid: async () => 'node-guid',
          get_DisplayName: async () => 'Fixture node',
          get_Status: async () => window.fixture.status,
          ActivateCancellable: async () => {
            window.fixture.calls++;
            if (window.fixture.wait) await new Promise(resolve => {window.fixture.finish = resolve});
            if (window.fixture.executeError) throw Error(window.fixture.executeError);
            window.fixture.status = 'active';
          },
          get_OutputPorts: async () => ({getItem: async () => ({
            get_Socket: async () => ({QueryInterface: async () => ({
              get_Output: async () => ({QueryInterface: async () => ({
                get_Columns: async () => ({get_Count: async () => 1, getItem: async () => ({get_Name: async () => 'count', get_DataType: async () => 1})}),
                get_RowCount: async () => window.fixture.rows.length,
                AsVariant: async (row, column) => window.fixture.rows[row][column]
              })})
            })})
          })})
        };
        const visual = {GetData: () => node, GetOutputPorts: () => [{SubType: window.fixture.subtype ?? 1}]};
        const owner = {View: {el: {dom: document.getElementById('model')}}};
        const form = {
          GetOneSelectedNode: () => visual,
          FGenericNode: {get_Guid: async () => 'workflow-guid'},
          FDiagram: {GetMxGraph: () => ({getSelectionModel: () => ({addListener() {}, removeListener() {}})})},
          Items: {tlbModel: {
            getComponent() {},
            insert(index, options) {
              const button = document.createElement('button');
              button.textContent = options.text;
              button.onclick = options.handler;
              document.getElementById('model').append(button);
              return {setVisible: value => {button.hidden = !value}, setText: value => {button.textContent = value}};
            }
          }}
        };
        const view = {Controller: form, rendered: true, on() {}};
        window.Out = class {};
        window.ReleaseObject = () => {};
        window.bg = {
          AsyncInvoker: (node, method) => (...args) => method.apply(node, args),
          TBGDataType: {dtInteger: 1},
          TBGProcessingMode: {pmExecute: 'execute'},
          TBGNodeActivateMode: {namAsynchronous: 'asynchronous'},
          selectAsyncValue: async (node, selector, callback) => callback(node),
          ScopeFindObject: () => ({FileName: 'user/fixture/campaign.lgp'}),
          ScopeFindObjectSelector() {},
          TBGModelNodeStatus: {mnsActive: 'active'},
          app: {Application: {Instance: {FMainForm: {GetActiveTab: () => owner}}}}
        };
        window.mxEvent = {CHANGE: 'change'};
        window.fixture.value = 0;
        window.loginomDashboardParameters = async (form, update) => {
          if (update) {
            window.fixture.value = update.value;
            window.fixture.status = 'inactive';
          }
          return [{name: 'MinBudget', value: window.fixture.value}];
        };
        window.Ext = {
          onReady: callback => callback(),
          create: () => ({control() {}}),
          ComponentQuery: {query: () => [view]}
        };
      </script><script src="/dashboard-bootstrap.js"></script>` })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(5_000)
  const dialogs = []
  const errors = []
  page.on("pageerror", error => errors.push(error.message))
  page.on("dialog", dialog => {
    dialogs.push(dialog.type())
    void dialog.dismiss()
  })
  await page.goto(origin + "/app/")
  return { page, errors, dialogs, origin, snapshots, publish: () => {published = true} }
}

test("Desktop chat opens separately and preserves the ordinary unload guard", async t => {
  const { page, errors, dialogs, origin, publish } = await fixture(t)
  assert.deepEqual(errors, [])
  await page.getByRole("button", { name: "Создать dashboard" }).click()
  const link = page.getByRole("link", { name: "Открыть чат в Desktop" })
  await link.waitFor()
  const back = page.getByRole("button", { name: "Вернуться к сценарию", exact: true })
  assert.equal(await back.evaluate(element => getComputedStyle(element).cursor), "pointer")
  const desktop = new URL(await link.getAttribute("href"))
  assert.equal(desktop.protocol, "loginom-ai-agent:")
  assert.equal(desktop.hostname, "dashboard")
  assert.equal(desktop.searchParams.get("action"), "create")
  assert.equal(await page.evaluate(() => window.blockedDesktopLinks), 1)
  await link.evaluate((element, href) => { element.href = href }, origin + "/desktop-link")
  const [popup] = await Promise.all([
    page.waitForEvent("popup", { timeout: 2_000 }),
    link.click(),
  ])
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
  assert.equal(await edit.evaluate(element => element.tagName), "BUTTON")
  assert.equal(await edit.getAttribute("type"), "button")
  assert.equal(await edit.evaluate(element => getComputedStyle(element).cursor), "pointer")
  assert.ok((await edit.evaluate(element => getComputedStyle(element).textDecorationLine)).includes("underline"))
  const layout = await back.evaluate(button => {
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
      buttons: [...header.querySelectorAll("button")].map(element => {
        const rect = element.getBoundingClientRect()
        return { top: rect.top, bottom: rect.bottom, height: rect.height }
      }),
    }
  })
  // The previous header had an unstyled native button and 8px padding above and below.
  assert.ok(layout.height <= layout.originalButtonHeight + 16, JSON.stringify(layout))
  assert.equal(layout.buttons.length, 2)
  assert.ok(layout.buttons.every(button => button.height > layout.originalButtonHeight), JSON.stringify(layout))
  assert.ok(layout.buttons.every(button => button.top >= layout.top && button.bottom <= layout.bottom))
  dialogs.length = 0
  const [editPopup] = await Promise.all([
    page.waitForEvent("popup", { timeout: 2_000 }),
    edit.click(),
  ])
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


test("opening a published dashboard executes an inactive node before loading its iframe", async t => {
  const { page, errors } = await fixture(t, { published: true, status: "inactive" })
  await page.evaluate(() => { window.fixture.wait = true })
  await page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await page.getByRole("status").filter({ hasText: "Идёт расчёт" }).waitFor()
  assert.equal(await page.locator("iframe").count(), 0)
  assert.equal(await page.evaluate(() => window.fixture.calls), 1)
  await page.evaluate(() => window.fixture.finish())
  await page.locator("iframe").waitFor()
  const state = await page.locator("iframe").evaluate(frame => frame.dashboard.state())
  assert.deepEqual(state.table, { schema: [{ name: "count", type: 1 }], rows: [[42]] })
  assert.equal(state.error, null)
  assert.equal(await page.evaluate(() => window.fixture.calls), 1)
  assert.deepEqual(errors, [])
})

test("reopening retries a saved error even when the node remains active", async t => {
  const { page, errors } = await fixture(t, { published: true })
  await page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await page.locator("iframe").waitFor()
  assert.equal(await page.evaluate(() => window.fixture.calls), 0)
  await page.evaluate(() => { window.fixture.executeError = "Calculation failed" })
  const failed = await page.locator("iframe").evaluate(frame => frame.dashboard.run())
  assert.equal(failed.error, "Calculation failed")
  assert.equal(failed.table, null)
  assert.equal(await page.evaluate(() => window.fixture.status), "active")
  await page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  await page.evaluate(() => { window.fixture.executeError = "Still failing" })
  await page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await page.getByRole("status").filter({ hasText: "Still failing" }).waitFor()
  assert.equal(await page.locator("iframe").count(), 0)
  assert.equal(await page.evaluate(() => window.fixture.calls), 2)
  await page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  await page.evaluate(() => { window.fixture.executeError = null })
  await page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await page.locator("iframe").waitFor()
  const recovered = await page.locator("iframe").evaluate(frame => frame.dashboard.state())
  assert.equal(recovered.error, null)
  assert.deepEqual(recovered.table.rows, [[42]])
  assert.equal(await page.evaluate(() => window.fixture.calls), 3)
  assert.deepEqual(errors, [])
})

test("active and empty results reopen without another execution", async t => {
  const { page, errors } = await fixture(t, { published: true })
  await page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await page.locator("iframe").waitFor()
  assert.deepEqual(await page.locator("iframe").evaluate(async frame => (await frame.dashboard.state()).table.rows), [[42]])
  await page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  await page.evaluate(() => { window.fixture.rows = [] })
  await page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await page.locator("iframe").waitFor()
  assert.deepEqual(await page.locator("iframe").evaluate(async frame => (await frame.dashboard.state()).table.rows), [])
  assert.equal(await page.evaluate(() => window.fixture.calls), 0)
  assert.deepEqual(errors, [])
})

test("closing during a parameter calculation and reopening waits without a duplicate execution", async t => {
  const { page, errors } = await fixture(t, { published: true })
  await page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await page.locator("iframe").waitFor()
  await page.locator("iframe").evaluate(frame => {
    window.fixture.wait = true
    window.fixture.change = frame.dashboard.change(17)
  })
  await page.waitForFunction(() => window.fixture.finish)
  await page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  await page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await page.getByRole("status").filter({ hasText: "Идёт расчёт" }).waitFor()
  assert.equal(await page.locator("iframe").count(), 0)
  assert.equal(await page.evaluate(() => window.fixture.calls), 1)
  await page.evaluate(() => window.fixture.finish())
  await page.locator("iframe").waitFor()
  const state = await page.locator("iframe").evaluate(frame => frame.dashboard.state())
  assert.equal(state.value, 17)
  assert.deepEqual(state.table.rows, [[42]])
  assert.equal(await page.evaluate(() => window.fixture.calls), 1)
  assert.deepEqual(errors, [])
})

test("an initial calculation error stays visible until a successful reopening", async t => {
  const { page, errors } = await fixture(t, { published: true, status: "inactive" })
  await page.evaluate(() => { window.fixture.executeError = "Source unavailable" })
  await page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await page.getByRole("status").filter({ hasText: "Source unavailable" }).waitFor()
  assert.equal(await page.locator("iframe").count(), 0)
  assert.equal(await page.evaluate(() => window.fixture.calls), 1)
  await page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  await page.evaluate(() => { window.fixture.executeError = null })
  await page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await page.locator("iframe").waitFor()
  assert.equal(await page.locator("iframe").evaluate(async frame => (await frame.dashboard.state()).error), null)
  assert.equal(await page.evaluate(() => window.fixture.calls), 2)
  assert.deepEqual(errors, [])
})

test("creation still calculates its sample and unsupported outputs never execute", async t => {
  const { page, errors, snapshots } = await fixture(t, { status: "inactive" })
  await page.getByRole("button", { name: "Создать dashboard", exact: true }).click()
  await page.getByRole("link", { name: "Открыть чат в Desktop" }).waitFor()
  assert.deepEqual(snapshots[0].sample, { schema: [{ name: "count", type: 1 }], rows: [[42]] })
  assert.equal(await page.evaluate(() => window.fixture.calls), 1)
  await page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  await page.evaluate(() => { window.fixture.subtype = 2; window.fixture.status = "inactive" })
  await page.getByRole("button", { name: /^(Создать dashboard|Dashboard)$/ }).click()
  await page.getByRole("status").filter({ hasText: "Dashboard для этого узла недоступен" }).waitFor()
  assert.equal(await page.evaluate(() => window.fixture.calls), 1)
  assert.equal(snapshots.length, 1)
  assert.deepEqual(errors, [])
})

test("queued parameter submissions finish in order after the iframe closes", async t => {
  const { page, errors } = await fixture(t, { published: true })
  await page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await page.locator("iframe").waitFor()
  await page.locator("iframe").evaluate(frame => {
    window.fixture.wait = true
    window.fixture.writes = []
    const parameters = window.loginomDashboardParameters
    window.loginomDashboardParameters = (form, update) => {
      if (update) window.fixture.writes.push(update.value)
      return parameters(form, update)
    }
    window.fixture.first = frame.dashboard.change(17)
    window.fixture.second = frame.dashboard.change(29)
  })
  await page.waitForFunction(() => window.fixture.calls === 1 && window.fixture.finish)
  assert.deepEqual(await page.evaluate(() => window.fixture.writes), [17])
  await page.getByRole("button", { name: "Вернуться к сценарию" }).click()
  assert.equal(await page.locator("iframe").count(), 0)
  await page.evaluate(() => {
    const finish = window.fixture.finish
    delete window.fixture.finish
    finish()
  })
  await page.waitForFunction(() => window.fixture.calls === 2 && window.fixture.finish)
  assert.deepEqual(await page.evaluate(() => window.fixture.writes), [17, 29])
  await page.evaluate(() => window.fixture.finish())
  assert.deepEqual(await page.evaluate(async () => (await Promise.all([window.fixture.first, window.fixture.second])).map(state => state.value)), [17, 29])
  await page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await page.locator("iframe").waitFor()
  assert.equal(await page.locator("iframe").evaluate(async frame => (await frame.dashboard.state()).value), 29)
  assert.equal(await page.evaluate(() => window.fixture.calls), 2)
  assert.deepEqual(errors, [])
})
