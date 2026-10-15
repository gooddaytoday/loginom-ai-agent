import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { admitEvalrunner, readEvalrunnerConfig, verifyEvalrunnerCli, checkEvalrunnerOutcome, sealEvalrunnerEvidence, checkEvalrunnerEvidence, dispatchEvalrunner, type EvalrunnerConfig, qualifyEvalrunner } from "../src/evalrunner"
import type { RunSummary } from "../src/report"

test("shared executor refuses dispatch without a durable admission", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-no-admission-"))
  try {
    await expect(dispatchEvalrunner({} as EvalrunnerConfig, { series: root, case: "calc-data-double", issue: "LAB-77", task: "task" },
      {} as Awaited<ReturnType<typeof qualifyEvalrunner>>, async () => {})).rejects.toThrow("Durable admission required")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("standalone release verifies raw artifact bytes, not only summary", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-evidence-"))
  try {
    await Bun.write(path.join(root, "runs/one/summary.json"), "summary")
    await Bun.write(path.join(root, "runs/one/case/1/artifact/result.lgp"), "original")
    const evidence = await sealEvalrunnerEvidence(root)
    await Bun.write(path.join(root, "release.json"), JSON.stringify({ status: "RELEASED", evidence }))
    await expect(checkEvalrunnerEvidence(root)).resolves.toHaveProperty("status", "RELEASED")
    await Bun.write(path.join(root, "runs/one/case/1/artifact/result.lgp"), "changed")
    await expect(checkEvalrunnerEvidence(root)).rejects.toThrow("Evidence changed")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("standalone outcome blocks infrastructure and missing cleanup, preserves measured product FAIL", () => {
  const summary = { interrupted: false, stopped_reason: null, storage_leftovers: [],
    config: { repeat: 1, infra_retries: 0 }, tasks: [{ id: "calc-data-double", attempts: [{ attempt: 1, status: "no_artifact", judge_status: "skipped",
      environment_cleanup: { status: "confirmed" } }] }] } as unknown as RunSummary
  expect(checkEvalrunnerOutcome(summary)).toBe("FAIL")
  expect(() => checkEvalrunnerOutcome({ ...summary, storage_leftovers: null })).toThrow("cleanup")
  expect(() => checkEvalrunnerOutcome({ ...summary, tasks: [{ ...summary.tasks[0]!, attempts: [{ ...summary.tasks[0]!.attempts[0]!, status: "infra_error" }] }] })).toThrow("infrastructure")
})

test("standalone CLI integrity rejects changed bytes and extra payload files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-cli-"))
  try {
    await mkdir(path.join(root, "bin"))
    await Bun.write(path.join(root, "bin/cli"), "product")
    await chmod(path.join(root, "bin/cli"), 0o755)
    const manifest = { format: "loginom-cli-artifact-v1", metadata: { version: "0.2.0", sourceCommit: "0c975a73676d9aba556085dbda97e1a9ceb23cc6", sourceDirty: false },
      files: [{ path: "bin/cli", sha256: new Bun.CryptoHasher("sha256").update("product").digest("hex"), mode: 0o755 }] }
    await Bun.write(path.join(root, "cli-manifest.json"), JSON.stringify(manifest))
    await expect(verifyEvalrunnerCli(path.join(root, "bin/cli"))).resolves.toHaveProperty("version", "0.2.0")
    await symlink("cli", path.join(root, "bin/alias"))
    manifest.files.push({ path: "bin/alias", sha256: manifest.files[0]!.sha256, mode: 0o777, link: "cli" } as typeof manifest.files[number])
    await Bun.write(path.join(root, "cli-manifest.json"), JSON.stringify(manifest))
    await expect(verifyEvalrunnerCli(path.join(root, "bin/cli"))).resolves.toHaveProperty("version", "0.2.0")
    await Bun.write(path.join(root, "extra"), "hidden")
    await expect(verifyEvalrunnerCli(path.join(root, "bin/cli"))).rejects.toThrow("payload")
    await rm(path.join(root, "extra"))
    await Bun.write(path.join(root, "bin/cli"), "changed")
    await expect(verifyEvalrunnerCli(path.join(root, "bin/cli"))).rejects.toThrow("payload")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("versioned CLI pins admit only the explicitly selected clean source while preserving legacy defaults", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-versioned-cli-"))
  try {
    await mkdir(path.join(root, "bin"))
    await Bun.write(path.join(root, "bin/cli"), "candidate")
    await chmod(path.join(root, "bin/cli"), 0o755)
    const manifest = { format: "loginom-cli-artifact-v1", metadata: { version: "0.2.0", sourceCommit: "a".repeat(40), sourceDirty: false },
      files: [{ path: "bin/cli", sha256: new Bun.CryptoHasher("sha256").update("candidate").digest("hex"), mode: 0o755 }] }
    await Bun.write(path.join(root, "cli-manifest.json"), JSON.stringify(manifest))
    await expect(verifyEvalrunnerCli(path.join(root, "bin/cli"))).rejects.toThrow("Unexpected CLI build")
    await expect(verifyEvalrunnerCli(path.join(root, "bin/cli"), { version: "0.2.0", sourceCommit: "a".repeat(40) })).resolves.toHaveProperty("sourceCommit", "a".repeat(40))
    await expect(verifyEvalrunnerCli(path.join(root, "bin/cli"), { version: "0.2.0", sourceCommit: "b".repeat(40) })).rejects.toThrow("Unexpected CLI build")
    manifest.metadata.sourceDirty = true
    await Bun.write(path.join(root, "cli-manifest.json"), JSON.stringify(manifest))
    await expect(verifyEvalrunnerCli(path.join(root, "bin/cli"), { version: "0.2.0", sourceCommit: "a".repeat(40) })).rejects.toThrow("Unexpected CLI build")
  } finally { await rm(root, { recursive: true, force: true }) }
})

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
