import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { chromium } from "../../../loginom-runtime/client/node_modules/playwright-core/index.mjs"

async function fixture(t, status = "active") {
  const browser = await chromium.launch({ channel: "chromium", headless: true, chromiumSandbox: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  await page.evaluate(status => {
    window.fixture = {
      status, operations: [], values: [12.5, "3", null, "label"], rpcError: false,
    }
    window.Out = class {}
    const assist = {
      BeginOperationEx: async cookie => {
        cookie.id = "operation-cookie"
        window.fixture.operations.push({ method: "begin", cookie: cookie.id })
      },
    }
    window.bg = {
      TBGModelNodeStatus: { mnsActive: "active" },
      TBGDataType: { dtFloat: 3, dtInteger: 1 },
      IBGEditableVariablesOutputSocket: "editable-variables",
      EndOperationEx: async (actual, cookie, cancel) => {
        if (actual !== assist) throw Error("Wrong configure assist")
        window.fixture.operations.push({ method: "end", cookie: cookie.id, cancel })
      },
    }
    const elements = {
      get_Count: async () => 4,
      getItem: async index => ({
        get_DataType: async () => [3, 1, 3, 2][index],
        get_Name: async () => ["Budget", "Count", "Unset", "Label"][index],
        get_Value: async () => ({
          set_AsVariant: async value => { window.fixture.values[index] = value },
          get_AsVariant: async () => window.fixture.values[index],
        }),
      }),
    }
    const node = {
      get_Status: async () => window.fixture.status,
      GetConfigureAssist: async () => assist,
      get_Component: async () => {
        if (window.fixture.rpcError) throw Error("Fixture RPC failed after begin")
        return { get_OutputSockets: async () => ({
          ItemByName: async name => {
            if (name !== "UserVariables") throw Error("Wrong variables socket")
            return { get_Socket: async () => ({ QueryInterface: async type => {
              if (type !== window.bg.IBGEditableVariablesOutputSocket) throw Error("Wrong interface")
              return { get_Variables: async () => ({ get_Elements: async () => elements }) }
            } }) }
          },
        }) }
      },
    }
    window.form = { FDiagram: { VariablesNode: { GetData: () => node } } }
  }, status)
  await page.addScriptTag({ path: fileURLToPath(new URL("../../../../dashboard/parameter.js", import.meta.url)) })
  return page
}

test("parameter.js reads active numeric variables without opening an edit operation", async t => {
  const page = await fixture(t)
  assert.deepEqual(await page.evaluate(() => window.loginomDashboardParameters(window.form)), [
    { name: "Budget", value: 12.5 }, { name: "Count", value: 3 }, { name: "Unset", value: null },
  ])
  assert.deepEqual(await page.evaluate(() => window.fixture.operations), [])
})

test("parameter.js reads inactive variables in an operation cancelled after reading", async t => {
  const page = await fixture(t, "inactive")
  assert.deepEqual(await page.evaluate(() => window.loginomDashboardParameters(window.form)), [
    { name: "Budget", value: 12.5 }, { name: "Count", value: 3 }, { name: "Unset", value: null },
  ])
  assert.deepEqual(await page.evaluate(() => window.fixture.operations), [
    { method: "begin", cookie: "operation-cookie" }, { method: "end", cookie: "operation-cookie", cancel: true },
  ])
  assert.deepEqual(await page.evaluate(() => window.fixture.values), [12.5, "3", null, "label"])
})

test("parameter.js writes a finite numeric value and commits its operation", async t => {
  const page = await fixture(t)
  const result = await page.evaluate(() => window.loginomDashboardParameters(window.form, { name: "Budget", value: 17.25 }))
  assert.deepEqual(result, [
    { name: "Budget", value: 17.25 }, { name: "Count", value: 3 }, { name: "Unset", value: null },
  ])
  assert.deepEqual(await page.evaluate(() => window.fixture.values), [17.25, "3", null, "label"])
  assert.deepEqual(await page.evaluate(() => window.fixture.operations), [
    { method: "begin", cookie: "operation-cookie" }, { method: "end", cookie: "operation-cookie", cancel: false },
  ])
})

test("parameter.js rejects a fractional integer and cancels its operation", async t => {
  const page = await fixture(t)
  await assert.rejects(page.evaluate(() => window.loginomDashboardParameters(window.form, { name: "Count", value: 1.5 })),
    /Значение не соответствует числовому типу переменной Count/)
  assert.deepEqual(await page.evaluate(() => window.fixture.values), [12.5, "3", null, "label"])
  assert.deepEqual(await page.evaluate(() => window.fixture.operations), [
    { method: "begin", cookie: "operation-cookie" }, { method: "end", cookie: "operation-cookie", cancel: true },
  ])
})

test("parameter.js rejects an unknown variable and cancels its operation", async t => {
  const page = await fixture(t)
  await assert.rejects(page.evaluate(() => window.loginomDashboardParameters(window.form, { name: "Unknown", value: 5 })),
    /Числовая переменная не найдена: Unknown/)
  assert.deepEqual(await page.evaluate(() => window.fixture.values), [12.5, "3", null, "label"])
  assert.deepEqual(await page.evaluate(() => window.fixture.operations), [
    { method: "begin", cookie: "operation-cookie" }, { method: "end", cookie: "operation-cookie", cancel: true },
  ])
})

test("parameter.js closes the edit operation when an RPC fails after begin", async t => {
  const page = await fixture(t, "inactive")
  await page.evaluate(() => { window.fixture.rpcError = true })
  await assert.rejects(page.evaluate(() => window.loginomDashboardParameters(window.form)), /Fixture RPC failed after begin/)
  assert.deepEqual(await page.evaluate(() => window.fixture.values), [12.5, "3", null, "label"])
  assert.deepEqual(await page.evaluate(() => window.fixture.operations), [
    { method: "begin", cookie: "operation-cookie" }, { method: "end", cookie: "operation-cookie", cancel: true },
  ])
})

test("parameter.js rejects a non-finite float without changing its value", async t => {
  const page = await fixture(t)
  await assert.rejects(page.evaluate(() => window.loginomDashboardParameters(window.form, { name: "Budget", value: Infinity })),
    /Значение не соответствует числовому типу переменной Budget/)
  assert.deepEqual(await page.evaluate(() => window.fixture.values), [12.5, "3", null, "label"])
  assert.deepEqual(await page.evaluate(() => window.fixture.operations), [
    { method: "begin", cookie: "operation-cookie" }, { method: "end", cookie: "operation-cookie", cancel: true },
  ])
})
