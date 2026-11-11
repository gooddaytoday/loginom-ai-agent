import assert from "node:assert/strict"
import test from "node:test"
import { fixture } from "./fixture.mjs"

async function parameters(t, status = "active") {
  const { page } = await fixture(t, {
    published: true,
    variableStatus: status,
    variables: [
      { name: "Budget", type: 3, value: 12.5 },
      { name: "Count", type: 1, value: "3" },
      { name: "Unset", type: 3, value: null },
      { name: "Label", type: 2, value: "label" },
    ],
  })
  await page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await page.locator("iframe").waitFor()
  await page.evaluate(() => {
    window.fixture.operations = []
  })
  return page
}
const expected = [
  { name: "Budget", value: 12.5 },
  { name: "Count", value: 3 },
  { name: "Unset", value: null },
]

test("bundled adapter reads active numeric variables without opening an edit operation", async (t) => {
  const page = await parameters(t)
  assert.equal(await page.evaluate(() => typeof window.loginomDashboardParameters), "undefined")
  assert.deepEqual(
    await page.locator("iframe").evaluate(async (frame) => (await frame.dashboard.state()).parameters),
    expected,
  )
  assert.deepEqual(await page.evaluate(() => window.fixture.operations), [])
})

test("bundled adapter reads inactive variables in an operation cancelled after reading", async (t) => {
  const page = await parameters(t, "inactive")
  assert.deepEqual(
    await page.locator("iframe").evaluate(async (frame) => (await frame.dashboard.state()).parameters),
    expected,
  )
  assert.deepEqual(await page.evaluate(() => window.fixture.operations), [
    { method: "begin", cookie: "operation-cookie" },
    { method: "end", cookie: "operation-cookie", cancel: true },
  ])
  assert.deepEqual(await page.evaluate(() => window.fixture.variables.map((variable) => variable.value)), [
    12.5,
    "3",
    null,
    "label",
  ])
})

test("bundled adapter writes a finite numeric value and commits its operation", async (t) => {
  const page = await parameters(t)
  const result = await page.locator("iframe").evaluate((frame) => frame.dashboard.change(17.25, "Budget"))
  assert.deepEqual(result.parameters, [{ name: "Budget", value: 17.25 }, ...expected.slice(1)])
  assert.deepEqual(await page.evaluate(() => window.fixture.variables.map((variable) => variable.value)), [
    17.25,
    "3",
    null,
    "label",
  ])
  assert.deepEqual(await page.evaluate(() => window.fixture.operations), [
    { method: "begin", cookie: "operation-cookie" },
    { method: "end", cookie: "operation-cookie", cancel: false },
  ])
})

test("bundled adapter rejects a fractional integer and cancels its operation", async (t) => {
  const page = await parameters(t)
  const result = await page.locator("iframe").evaluate((frame) => frame.dashboard.change(1.5, "Count"))
  assert.match(result.error, /Значение не соответствует числовому типу переменной Count/)
  assert.equal(result.table, null)
  assert.deepEqual(await page.evaluate(() => window.fixture.variables.map((variable) => variable.value)), [
    12.5,
    "3",
    null,
    "label",
  ])
  assert.deepEqual(await page.evaluate(() => window.fixture.operations), [
    { method: "begin", cookie: "operation-cookie" },
    { method: "end", cookie: "operation-cookie", cancel: true },
  ])
})

test("bundled adapter rejects a disappeared variable and cancels its operation", async (t) => {
  const page = await parameters(t)
  await page.evaluate(() => {
    window.fixture.variables = window.fixture.variables.filter((variable) => variable.name !== "Budget")
  })
  const result = await page.locator("iframe").evaluate((frame) => frame.dashboard.change(5, "Budget"))
  assert.match(result.error, /Числовая переменная не найдена: Budget/)
  assert.deepEqual(await page.evaluate(() => window.fixture.operations), [
    { method: "begin", cookie: "operation-cookie" },
    { method: "end", cookie: "operation-cookie", cancel: true },
  ])
})

test("bundled adapter closes the edit operation when an RPC fails after begin", async (t) => {
  const page = await parameters(t, "inactive")
  await page.evaluate(() => {
    window.fixture.rpcError = true
  })
  await assert.rejects(
    page.locator("iframe").evaluate((frame) => frame.dashboard.state()),
    /Fixture RPC failed after begin/,
  )
  assert.deepEqual(await page.evaluate(() => window.fixture.variables.map((variable) => variable.value)), [
    12.5,
    "3",
    null,
    "label",
  ])
  assert.deepEqual(await page.evaluate(() => window.fixture.operations), [
    { method: "begin", cookie: "operation-cookie" },
    { method: "end", cookie: "operation-cookie", cancel: true },
  ])
})

test("bundled shell rejects a non-finite float without changing its value or opening an edit operation", async (t) => {
  const page = await parameters(t)
  await assert.rejects(
    page.locator("iframe").evaluate((frame) => frame.dashboard.change(Infinity, "Budget")),
    /Недопустимое значение параметра/,
  )
  assert.deepEqual(await page.evaluate(() => window.fixture.variables.map((variable) => variable.value)), [
    12.5,
    "3",
    null,
    "label",
  ])
  assert.deepEqual(await page.evaluate(() => window.fixture.operations), [])
})
