import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { repoRoot } from "../src/config"
import { replayEvaluatorEvidence } from "../src/evaluator-replay"
import { replayFixture } from "./helpers/evaluator-replay"


test("offline replay uses saved verdict and full node evidence, makes no model calls and detects corruption", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "eval-replay-"))
  try {
    const sources = await replayFixture(directory)
    expect(await replayEvaluatorEvidence(repoRoot, sources, 70)).toMatchObject({ status: "VERIFIED", modelCalls: 0, regular: { score: 100 }, node: { code: 0 } })
    await Bun.write(path.join(sources.nodeRun, "crosstable-fixed-sum/1/events.jsonl"), "")
    await expect(replayEvaluatorEvidence(repoRoot, sources, 70)).rejects.toThrow("NODE_REPLAY_FAILED")
  } finally { await rm(directory, { recursive: true, force: true }) }
})
