import { expect, test } from "bun:test"
import { requireFilesystemBudget } from "../src/parallel-resource-budget"

test("campaign refuses a known low filesystem reserve before admitting a batch", () => {
  const scope = "filesystem:/artificial/state"
  const observations = [{ scope, available_bytes: 99, available_inodes: 10 }]
  const bounds = [{ scope, metric: "available_bytes", minimum: 100, maximum: null },
    { scope, metric: "available_inodes", minimum: 10, maximum: null }]
  expect(() => requireFilesystemBudget(bounds, observations)).toThrow("RESOURCE_RESERVE_LOW")
  expect(() => requireFilesystemBudget(bounds, [{ ...observations[0]!, available_bytes: 100 }])).not.toThrow()
  expect(() => requireFilesystemBudget(bounds, [{ ...observations[0]!, available_bytes: 100, available_inodes: 9 }]))
    .toThrow("RESOURCE_RESERVE_LOW")
  expect(() => requireFilesystemBudget(bounds, [])).toThrow("RESOURCE_RESERVE_UNCONFIRMED")
})
