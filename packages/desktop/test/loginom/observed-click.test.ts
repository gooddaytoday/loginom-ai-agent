import { expect, test } from "bun:test"
import { clickObserved } from "./observed-click"

function observation(ref: string, document = "document") {
  return {
    status: "SUCCEEDED",
    output: {
      observation_id: ref,
      origin: "https://loginom.test",
      authenticated: true,
      loginom_build: "7.4.2",
      dom_epoch: { document },
      workflow_ref: { tab_tid: "tab", prefix: "workflow" },
      package_identity: { path: "/user/test.lgp" },
      ui: { elements: [{ tid: "close", ref, allowed_actions: ["click"] }] },
    },
  }
}
function refusal(id: string) {
  return {
    ...observation("old"),
    action_key: "ui.act",
    operation_id: id,
    status: "NOT_APPLIED",
    phase: "preconditions",
    effect_possible: false,
    cleanup_complete: true,
    error: { code: "UI_EPOCH_CHANGED" },
  }
}

test("pre-dispatch stale epoch obtains a fresh ref and a new operation id", async () => {
  const calls: Record<string, unknown>[] = []
  let observed = 0
  await clickObserved(
    async (name, args) => {
      if (name === "dock_workspace_observe") return observation(`ref-${++observed}`)
      calls.push(args)
      return calls.length === 1 ? refusal("close-op") : observation("done")
    },
    "close",
    "close-op",
  )
  expect(observed).toBe(2)
  expect(calls).toEqual([
    { observation_id: "ref-1", operation_id: "close-op", action: { verb: "click", ref: "ref-1" } },
    { observation_id: "ref-2", operation_id: "close-op-refresh-1", action: { verb: "click", ref: "ref-2" } },
  ])
})

test("uncertainty, missing cleanup and mismatched receipts never retry", async () => {
  for (const change of [
    { action_key: "other" },
    { effect_possible: true },
    { cleanup_complete: false },
    { status: "AMBIGUOUS" },
    { phase: "executing" },
    { operation_id: "other" },
    { error: { code: "OTHER" } },
  ]) {
    let clicks = 0
    await expect(
      clickObserved(
        async (name) => {
          if (name === "dock_workspace_observe") return observation("ref")
          clicks++
          return { ...refusal("close-op"), ...change }
        },
        "close",
        "close-op",
      ),
    ).rejects.toThrow("PACKAGE_CLOSE_GESTURE_FAILED")
    expect(clicks).toBe(1)
  }
})

test("document change stops before a second gesture", async () => {
  let observations = 0
  let clicks = 0
  await expect(
    clickObserved(
      async (name) => {
        if (name === "dock_workspace_observe") return observation("ref", ++observations === 1 ? "before" : "after")
        clicks++
        return refusal("close-op")
      },
      "close",
      "close-op",
    ),
  ).rejects.toThrow("PACKAGE_CLOSE_CONTEXT_CHANGED")
  expect(clicks).toBe(1)
})

test("repeated refusal has a strict three-gesture bound", async () => {
  let clicks = 0
  await expect(
    clickObserved(
      async (name, args) => {
        if (name === "dock_workspace_observe") return observation("ref")
        clicks++
        return refusal(String(args.operation_id))
      },
      "close",
      "close-op",
    ),
  ).rejects.toThrow("PACKAGE_CLOSE_GESTURE_FAILED")
  expect(clicks).toBe(3)
})
