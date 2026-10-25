import test from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { runtimeCallTimeout } from "../src/call-timeout.mjs"

const require = createRequire(new URL("../client/package.json", import.meta.url))
const { Client } = require("@modelcontextprotocol/sdk/client/index.js")
const { Server } = require("@modelcontextprotocol/sdk/server/index.js")
const { InMemoryTransport } = require("@modelcontextprotocol/sdk/inMemory.js")
const { CallToolRequestSchema } = require("@modelcontextprotocol/sdk/types.js")

test("synchronous source/context transport covers owned default reads and cleanup", () => {
  assert.equal(runtimeCallTimeout("dock_node_read", { kind: "source" }), 315_000)
  assert.equal(runtimeCallTimeout("dock_node_read", { kind: "context" }), 615_000)
  for (const budget_ms of [1, 110_000, 600_000, 1_800_000]) {
    assert.equal(runtimeCallTimeout("dock_node_read", { kind: "source", budget_ms }), budget_ms + 15_000)
  }
})

test("cursor continuations have a finite allowance while the reader owns the original deadline", () => {
  for (const kind of ["source", "context"]) {
    assert.equal(runtimeCallTimeout("dock_node_read", { kind, cursor: "owned-cursor" }), 1_815_000)
  }
})

test("invalid budgets cannot turn private timeouts into an unbounded wait", () => {
  for (const budget_ms of [0, -1, 1_800_001, 1.5, Infinity, NaN, "1800000", null]) {
    assert.equal(runtimeCallTimeout("dock_node_read", { kind: "source", budget_ms }), 315_000)
  }
  for (const args of [undefined, null, {}, { kind: "outputs" }, { kind: "status", budget_ms: 1_800_000 }]) {
    assert.equal(runtimeCallTimeout("dock_node_read", args), 105_000)
  }
  assert.equal(runtimeCallTimeout("dock_node_wait", { kind: "source", budget_ms: 1_800_000 }), 105_000)
})

test("browser recovery control covers handoff and composed verification; its browser actions keep the default", () => {
  assert.equal(runtimeCallTimeout("dock_browser_recovery", { action: "finish" }), 300_000)
  assert.equal(runtimeCallTimeout("browser_click", { target: "e1" }), 105_000)
})

for (const [elapsed, workspace] of [
  [115_000, { status: "READY", created_draft: true }],
  [120_000, { status: "NOT_READY", reason: "DEADLINE", verification_required: true }],
  [139_000, { status: "READY", created_draft: true, browser_geometry: { verified: true } }],
  [115_000, { status: "NOT_READY", reason: "PREPARATION_INTERRUPTED", effect_possible: true,
    verification_required: true }],
]) {
  test(`prepare transport delivers its bounded workspace/geometry reply at ${elapsed} ms without replay`, async (t) => {
    const client = new Client({ name: "prepare-owner", version: "1" })
    const server = new Server({ name: "prepare-runtime", version: "1" }, { capabilities: { tools: {} } })
    const pending = Promise.withResolvers()
    let calls = 0
    server.setRequestHandler(CallToolRequestSchema, async () => {
      calls++
      return pending.promise
    })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    t.after(async () => { await client.close(); await server.close() })
    t.mock.timers.enable({ apis: ["setTimeout", "Date"] })
    const response = client.callTool({ name: "dock_prepare", arguments: { intent: "new_draft" } }, undefined,
      { timeout: runtimeCallTimeout("dock_prepare", { intent: "new_draft" }) })
      .then(value => ({ value }), error => ({ error: error.message }))
    // Drain in-memory admission before advancing only this test's transport clock.
    for (let n = 0; n < 10; n++) await Promise.resolve()
    assert.equal(calls, 1)
    t.mock.timers.tick(elapsed)
    pending.resolve({ content: [{ type: "text", text: JSON.stringify(workspace) }] })
    const outcome = await response
    assert.equal(outcome.error, undefined, "the transport must not preempt the original bounded prepare")
    assert.deepEqual(JSON.parse(outcome.value.content[0].text), workspace)
    assert.equal(calls, 1, "an expired/unknown request must never be retried")
  })
}

test("prepare IPC expiry remains uncertain and never repeats the call", async (t) => {
  const client = new Client({ name: "prepare-owner", version: "1" })
  const server = new Server({ name: "prepare-runtime", version: "1" }, { capabilities: { tools: {} } })
  const pending = Promise.withResolvers()
  let calls = 0
  server.setRequestHandler(CallToolRequestSchema, () => { calls++; return pending.promise })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  t.after(async () => { pending.resolve({ content: [] }); await client.close(); await server.close() })
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] })
  const response = client.callTool({ name: "dock_prepare", arguments: { intent: "new_draft" } }, undefined,
    { timeout: runtimeCallTimeout("dock_prepare", {}) }).then(value => ({ value }), error => ({ error: error.message }))
  for (let n = 0; n < 10; n++) await Promise.resolve()
  t.mock.timers.tick(155_000)
  assert.match((await response).error, /Request timed out/)
  assert.equal(calls, 1)
})
