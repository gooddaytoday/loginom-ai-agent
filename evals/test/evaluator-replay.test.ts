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

test("scorer fingerprint includes the Python XML inspector at the exact recorded revision", async () => {
  const { cp } = await import("node:fs/promises")
  const { evaluatorFingerprint } = await import("../src/evaluator-replay")
  const directory = await mkdtemp(path.join(os.tmpdir(), "scorer-revision-"))
  try {
    await cp(path.join(repoRoot, "evals/src"), path.join(directory, "evals/src"), { recursive: true })
    await cp(path.join(repoRoot, "evals/script"), path.join(directory, "evals/script"), { recursive: true })
    await Bun.$`git -C ${directory} init -q`.quiet()
    await Bun.$`git -C ${directory} add evals`.quiet()
    await Bun.$`git -C ${directory} -c user.name=Fixture -c user.email=fixture@example.test commit -qm original`.quiet()
    const first = (await Bun.$`git -C ${directory} rev-parse HEAD`.quiet()).text().trim()
    const file = path.join(directory, "evals/script/inspect-node-package.py")
    await Bun.write(file, await Bun.file(file).text() + "\n# changed scorer fixture\n")
    await Bun.$`git -C ${directory} add evals/script/inspect-node-package.py`.quiet()
    await Bun.$`git -C ${directory} -c user.name=Fixture -c user.email=fixture@example.test commit -qm changed`.quiet()
    const second = (await Bun.$`git -C ${directory} rev-parse HEAD`.quiet()).text().trim()
    expect(await evaluatorFingerprint(directory, second)).not.toBe(await evaluatorFingerprint(directory, first))
    expect(await evaluatorFingerprint(directory)).toBe(await evaluatorFingerprint(directory, second))
  } finally { await rm(directory, { recursive: true, force: true }) }
})
