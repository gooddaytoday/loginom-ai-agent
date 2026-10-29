import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { evalsRoot } from "../src/config"
import { writeLeaseReceipt } from "../src/lease"
import { campaignPreflight } from "../script/campaign-preflight"

test("campaign preflight refuses to check a new checkout using code imported from another harness", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-preflight-"))
  try {
    await writeLeaseReceipt(path.join(root, "server.json"), { harnessRoot: root, acceptedHarness: "a".repeat(40) })
    await writeLeaseReceipt(path.join(root, "manifest.json"), {})
    await expect(campaignPreflight(path.join(root, "manifest.json"), path.join(root, "server.json"), ["ordinary", "first", "1", "1"]))
      .rejects.toThrow("PREFLIGHT_HARNESS_ROOT")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("campaign preflight refuses selection outside the pinned campaign before external probes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-campaign-preflight-selection-"))
  try {
    await writeLeaseReceipt(path.join(root, "server.json"), { harnessRoot: evalsRoot, acceptedHarness: "a".repeat(40) })
    await writeLeaseReceipt(path.join(root, "manifest.json"), { parallel: 1, batchSize: 1,
      keys: [{ corpus: "ordinary", taskId: "first", round: 1 }] })
    for (const args of [["ordinary", "second", "1", "1"], ["ordinary", "first", "2", "1"],
      ["ordinary", "first", "1", "2"], ["ordinary", "first,first", "1", "1"]])
      await expect(campaignPreflight(path.join(root, "manifest.json"), path.join(root, "server.json"), args)).rejects.toThrow("SELECTION_INVALID")
  } finally { await rm(root, { recursive: true, force: true }) }
})
