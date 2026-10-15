import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { admitEvalrunner, readEvalrunnerConfig } from "../src/evalrunner"

test("standalone admission needs no historical baseline and rejects a second owner", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-"))
  try {
    const config = { kind: "evalrunner-runtime", version: 1, root, checkout: path.join(root, "checkout"),
      harnessSha: "a".repeat(40), cliBin: path.join(root, "cli/bin/cli"), cliManifestSha256: "b".repeat(64),
      binarySha256: "c".repeat(64), profile: path.join(root, "profile"), workspace: path.join(root, "workspace"),
      results: path.join(root, "results"), envFile: path.join(root, "eval.env"), judgeHome: path.join(root, "judge"),
      containerId: "d".repeat(64), imageDigest: "sha256:" + "e".repeat(64), endpoint: "http://localhost/app/", readinessIssue: "ready" }
    await Promise.all(["checkout", "cli/bin", "profile", "workspace", "results", "judge", "operations"].map(name => mkdir(path.join(root, name), { recursive: true, mode: 0o700 })))
    await Bun.write(path.join(root, "config.json"), JSON.stringify(config))
    await chmod(path.join(root, "config.json"), 0o600)
    const read = await readEvalrunnerConfig(path.join(root, "config.json"))
    const first = await admitEvalrunner(read, { series: path.join(root, "results/first"), case: "calc-data-double", issue: "ready", task: "task-1" })
    expect(first.manifest.case).toBe("calc-data-double")
    expect(first.manifest.infraRetries).toBe(0)
    await expect(admitEvalrunner(read, { series: path.join(root, "results/second"), case: "crosstable-fixed-sum", issue: "ready", task: "task-2" })).rejects.toThrow("BUSY")
    await first.release()
    await expect(admitEvalrunner(read, { series: path.join(root, "results/again"), case: "calc-data-double", issue: "ready", task: "task-3" })).rejects.toThrow("already admitted")
  } finally { await rm(root, { recursive: true, force: true }) }
})
