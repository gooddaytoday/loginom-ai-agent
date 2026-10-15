import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { evalsRoot } from "../src/config"
import { sealEvalrunnerEvidence } from "../src/evalrunner"
import { buildEvalrunnerSlots, loadEvalrunnerCorpus, evalrunnerHash } from "../src/evalrunner-series"

test("standalone delivery archive excludes private logs and verifies round trip bytes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-export-"))
  try {
    const summary = JSON.stringify({ tasks: [], storage_leftovers: [] })
    await Bun.write(path.join(root, "run/summary.json"), summary)
    await Bun.write(path.join(root, "run/report.md"), "report")
    await Bun.write(path.join(root, "run/events.jsonl"), "PRIVATE")
    await Bun.write(path.join(root, "release.json"), JSON.stringify({ status: "RELEASED", runDir: path.join(root, "run"), summarySha256: new Bun.CryptoHasher("sha256").update(summary).digest("hex"), evidence: await sealEvalrunnerEvidence(root) }))
    const script = path.join(evalsRoot, "script/evalrunner-archive.py")
    const create = Bun.spawn(["python3", script, "create", root, path.join(root, "delivery.tar.gz")], { stdout: "pipe", stderr: "pipe" })
    expect(await create.exited).toBe(0)
    const receipt = JSON.parse(await new Response(create.stdout).text())
    const verify = Bun.spawn(["python3", script, "verify", path.join(root, "delivery.tar.gz"), receipt.sha256], { stdout: "pipe", stderr: "pipe" })
    expect(await verify.exited).toBe(0)
    const result = JSON.parse(await new Response(verify.stdout).text())
    expect(result.files).toContain("run/summary.json")
    expect(result.files.some((name: string) => name.includes("events"))).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("full 144-slot archive round trip binds comparison and all completions and excludes private material", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-full-export-"))
  const target = path.join(path.dirname(root), path.basename(root) + ".tar.gz")
  try {
    const slots = buildEvalrunnerSlots(await loadEvalrunnerCorpus(evalsRoot))
    await Bun.write(path.join(root, "manifest.json"), JSON.stringify({ scope: "full", slots }))
    for (const slot of slots) {
      const selected = path.join(root, "slots", slot.id), run = path.join(selected, "runs/one")
      const summary = JSON.stringify({ task_ids: [slot.case] })
      await Bun.write(path.join(run, "summary.json"), summary)
      await Bun.write(path.join(run, slot.case, "1/artifact/result.csv"), "x\n1\n")
      await Bun.write(path.join(run, slot.case, "1/events.jsonl"), "PRIVATE")
      await Bun.write(path.join(selected, "release.json"), JSON.stringify({ status: "RELEASED", runDir: run, summarySha256: evalrunnerHash(summary) }))
      await Bun.write(path.join(root, "completions", slot.id + ".json"), JSON.stringify({ model: { status: "VERIFIED" } }))
    }
    await Bun.write(path.join(root, "eval.env.json"), "PRIVATE")
    await Bun.write(path.join(root, "history/loginom-ai-agent.db"), "PRIVATE")
    await Bun.write(path.join(root, "release.json"), JSON.stringify({ status: "RELEASED", kind: "evalrunner-full-series-release", scope: "full", expected: 144, completed: 144, evidence: await sealEvalrunnerEvidence(root) }))
    await Bun.write(path.join(root, "comparison.json"), JSON.stringify({ comparison: "DESCRIPTIVE_ONLY/INCOMPARABLE" }))
    await Bun.write(path.join(root, "comparison.md"), "Descriptive comparison fixture")
    await Bun.write(path.join(root, "comparison-receipt.json"), JSON.stringify({
      releaseSha256: evalrunnerHash(await Bun.file(path.join(root, "release.json")).bytes()),
      jsonSha256: evalrunnerHash(await Bun.file(path.join(root, "comparison.json")).bytes()),
      markdownSha256: evalrunnerHash(await Bun.file(path.join(root, "comparison.md")).bytes()),
      baselineArchiveSha256: "f3914febcb32f7c1cb087700215a7aa6be2ae42f38c0dd099e41cdfe46b8e932",
    }))
    const script = path.join(evalsRoot, "script/evalrunner-archive.py")
    const create = await Bun.$`python3 ${script} create ${root} ${target}`.quiet().nothrow()
    expect(create.exitCode).toBe(0)
    const verified = await Bun.$`python3 ${script} verify ${target} ${create.json().sha256}`.quiet().nothrow()
    expect(verified.exitCode).toBe(0)
    const files: string[] = verified.json().files
    expect(files.filter(file => file.startsWith("completions/"))).toHaveLength(144)
    expect(files.filter(file => file.endsWith("result.csv"))).toHaveLength(144)
    expect(files).toContain("comparison-receipt.json")
    expect(files.some(file => /env|history|events|\.db$/.test(file))).toBe(false)
    await Bun.write(path.join(root, "comparison.md"), "changed")
    expect((await Bun.$`python3 ${script} create ${root} ${target}`.quiet().nothrow()).exitCode).not.toBe(0)
  } finally { await rm(root, { recursive: true, force: true }); await rm(target, { force: true }) }
}, 30_000)

test("versioned readiness archive includes its manifest and model receipt while excluding history and raw logs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-series-export-"))
  try {
    const id = "readiness-calc-r1", selected = path.join(root, "slots", id), run = path.join(selected, "runs/one")
    const summary = JSON.stringify({ task_ids: ["calc-data-double"] })
    await Bun.write(path.join(run, "summary.json"), summary)
    await Bun.write(path.join(selected, "stdout.log"), "PRIVATE")
    await Bun.write(path.join(root, "auth.json"), "PRIVATE")
    const recovery = JSON.stringify({ kind: "evalrunner-readiness-recovery", status: "RECOVERED_PRE_INFERENCE", originalReleased: false })
    await Bun.write(path.join(root, "recovery.json"), recovery)
    await Bun.write(path.join(root, "manifest.json"), JSON.stringify({ scope: "readiness-calc", generation: 1,
      recovery: { sha256: evalrunnerHash(recovery) }, slots: [{ id, case: "calc-data-double" }] }))
    await Bun.write(path.join(root, "completions", id + ".json"), JSON.stringify({ model: { status: "VERIFIED" } }))
    await Bun.write(path.join(selected, "release.json"), JSON.stringify({ status: "RELEASED", runDir: run, summarySha256: new Bun.CryptoHasher("sha256").update(summary).digest("hex") }))
    await Bun.write(path.join(root, "release.json"), JSON.stringify({ status: "RELEASED", kind: "evalrunner-full-series-release", scope: "readiness-calc", expected: 1, completed: 1, evidence: await sealEvalrunnerEvidence(root) }))
    const create = await Bun.$`python3 ${path.join(evalsRoot, "script/evalrunner-archive.py")} create ${root} ${path.join(root, "delivery.tar.gz")}`.quiet().nothrow()
    expect(create.exitCode).toBe(0)
    const receipt = create.json()
    const verify = await Bun.$`python3 ${path.join(evalsRoot, "script/evalrunner-archive.py")} verify ${path.join(root, "delivery.tar.gz")} ${receipt.sha256}`.quiet().nothrow()
    expect(verify.exitCode).toBe(0)
    expect(verify.json().files).toContain("manifest.json")
    expect(verify.json().files).toContain("recovery.json")
    expect(verify.json().files).toContain("completions/" + id + ".json")
    expect(verify.json().files.some((file: string) => /stdout|auth|history/.test(file))).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})
