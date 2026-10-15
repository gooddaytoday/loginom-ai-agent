import test from "node:test"
import assert from "node:assert/strict"
import { runtimeCallTimeout } from "../src/call-timeout.mjs"

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
