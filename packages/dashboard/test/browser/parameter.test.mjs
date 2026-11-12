import assert from "node:assert/strict"
import test from "node:test"
import { fixture } from "./fixture.mjs"

async function parameters(t, status = "active") {
  const app = await fixture(t, {
    published: true,
    variableStatus: status,
    variables: [
      { name: "Budget", type: 3, value: 12.5 },
      { name: "Count", type: 1, value: "3" },
      { name: "Unset", type: 3, value: null },
      { name: "Label", type: 2, value: "label" },
    ],
  })
  await app.page.getByRole("button", { name: "Dashboard", exact: true }).click()
  await app.settled()
  return app
}
const expected = [
  { name: "Budget", value: 12.5 },
  { name: "Count", value: 3 },
  { name: "Unset", value: null },
]

test("bundled adapter reads active numeric variables without opening an edit operation", async (t) => {
  const app = await parameters(t)
  assert.equal(await app.page.evaluate(() => typeof window.loginomDashboardParameters), "undefined")
  assert.deepEqual((await app.settled()).parameters, expected)
  assert.equal(await app.page.getByLabel("Unset", { exact: true }).inputValue(), "")
  assert.equal(await app.page.getByRole("spinbutton").count(), 3)
  assert.deepEqual(await app.page.evaluate(() => window.fixture.operations), [])
})

test("bundled adapter reads inactive variables in an operation cancelled after reading", async (t) => {
  const app = await parameters(t, "inactive")
  assert.deepEqual((await app.settled()).parameters, expected)
  assert.deepEqual(await app.page.evaluate(() => window.fixture.operations), [
    { method: "begin", cookie: "operation-cookie" },
    { method: "end", cookie: "operation-cookie", cancel: true },
  ])
  assert.deepEqual(await app.page.evaluate(() => window.fixture.variables.map(variable => variable.value)), [12.5, "3", null, "label"])
})

test("bundled adapter writes a finite numeric value and commits its operation", async (t) => {
  const app = await parameters(t)
  await app.page.getByLabel("Budget", { exact: true }).fill("17.25")
  await app.page.getByLabel("Budget", { exact: true }).press("Enter")
  const result = await app.settled(1)
  assert.deepEqual(result.parameters, [{ name: "Budget", value: 17.25 }, ...expected.slice(1)])
  assert.deepEqual(await app.page.evaluate(() => window.fixture.variables.map(variable => variable.value)), [17.25, "3", null, "label"])
  assert.deepEqual(await app.page.evaluate(() => window.fixture.operations), [
    { method: "begin", cookie: "operation-cookie" },
    { method: "end", cookie: "operation-cookie", cancel: false },
  ])
})

test("bundled adapter rejects a fractional integer and cancels its operation", async (t) => {
  const app = await parameters(t)
  const count = app.page.getByLabel("Count", { exact: true })
  await count.fill("1.5")
  await count.press("Enter")
  assert.equal(await count.evaluate(input => input.validationMessage), "Недопустимое значение параметра")
  assert.deepEqual(await app.page.evaluate(() => window.fixture.operations), [])
  await app.page.evaluate(() => { window.fixture.variables[0].type = 1 })
  await app.page.getByLabel("Budget", { exact: true }).fill("1.5")
  await app.page.getByLabel("Budget", { exact: true }).press("Enter")
  const result = await app.settled(1)
  assert.match(result.error, /Значение не соответствует числовому типу переменной Budget/)
  assert.equal(result.table, null)
  assert.deepEqual(await app.page.evaluate(() => window.fixture.variables.map(variable => variable.value)), [12.5, "3", null, "label"])
  assert.deepEqual(await app.page.evaluate(() => window.fixture.operations), [
    { method: "begin", cookie: "operation-cookie" },
    { method: "end", cookie: "operation-cookie", cancel: true },
  ])
})

test("bundled adapter rejects a disappeared variable and cancels its operation", async (t) => {
  const app = await parameters(t)
  await app.page.evaluate(() => {
    window.fixture.variables = window.fixture.variables.filter(variable => variable.name !== "Budget")
  })
  await app.page.getByLabel("Budget", { exact: true }).fill("5")
  await app.page.getByLabel("Budget", { exact: true }).press("Enter")
  const result = await app.settled(1)
  assert.match(result.error, /Числовая переменная не найдена: Budget/)
  assert.equal(result.table, null)
  assert.deepEqual(await app.page.evaluate(() => window.fixture.operations), [
    { method: "begin", cookie: "operation-cookie" },
    { method: "end", cookie: "operation-cookie", cancel: true },
  ])
})

test("bundled adapter closes the edit operation when an RPC fails after begin", async (t) => {
  const app = await parameters(t, "inactive")
  await app.page.evaluate(() => {
    window.fixture.operations = []
    window.fixture.rpcError = true
  })
  await app.page.getByLabel("Budget", { exact: true }).fill("5")
  await app.page.getByLabel("Budget", { exact: true }).press("Enter")
  const result = await app.settled(1)
  assert.match(result.error, /Fixture RPC failed after begin/)
  assert.equal(result.busy, false)
  assert.equal(result.table, null)
  assert.deepEqual(await app.page.evaluate(() => window.fixture.variables.map(variable => variable.value)), [12.5, "3", null, "label"])
  const operations = await app.page.evaluate(() => window.fixture.operations)
  assert.ok(operations.length > 0)
  assert.equal(operations.length % 2, 0)
  for (let index = 0; index < operations.length; index += 2) {
    assert.deepEqual(operations.slice(index, index + 2), [
      { method: "begin", cookie: "operation-cookie" },
      { method: "end", cookie: "operation-cookie", cancel: true },
    ])
  }
})

test("bundled shell rejects a non-finite float without changing its value or opening an edit operation", async (t) => {
  const app = await parameters(t)
  const input = app.page.getByLabel("Budget", { exact: true })
  await input.fill("1e999")
  await input.press("Enter")
  assert.equal(await input.evaluate(input => input.validity.valid), false)
  assert.deepEqual(await app.page.evaluate(() => window.fixture.variables.map(variable => variable.value)), [12.5, "3", null, "label"])
  assert.deepEqual(await app.page.evaluate(() => window.fixture.operations), [])
  assert.deepEqual(await app.page.evaluate(() => window.fixture.writes), [])
})
