import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { evalsRoot } from "../src/config"
import { sealEvalrunnerEvidence } from "../src/evalrunner"

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

test("versioned readiness archive includes its manifest and model receipt while excluding history and raw logs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-series-export-"))
  try {
    const id = "readiness-calc-r1", selected = path.join(root, "slots", id), run = path.join(selected, "runs/one")
    const summary = JSON.stringify({ task_ids: ["calc-data-double"] })
    await Bun.write(path.join(run, "summary.json"), summary)
    await Bun.write(path.join(selected, "stdout.log"), "PRIVATE")
    await Bun.write(path.join(root, "auth.json"), "PRIVATE")
    await Bun.write(path.join(root, "manifest.json"), JSON.stringify({ scope: "readiness-calc", slots: [{ id, case: "calc-data-double" }] }))
    await Bun.write(path.join(root, "completions", id + ".json"), JSON.stringify({ model: { status: "VERIFIED" } }))
    await Bun.write(path.join(selected, "release.json"), JSON.stringify({ status: "RELEASED", runDir: run, summarySha256: new Bun.CryptoHasher("sha256").update(summary).digest("hex") }))
    await Bun.write(path.join(root, "release.json"), JSON.stringify({ status: "RELEASED", kind: "evalrunner-full-series-release", scope: "readiness-calc", expected: 1, completed: 1, evidence: await sealEvalrunnerEvidence(root) }))
    const create = await Bun.$`python3 ${path.join(evalsRoot, "script/evalrunner-archive.py")} create ${root} ${path.join(root, "delivery.tar.gz")}`.quiet().nothrow()
    expect(create.exitCode).toBe(0)
    const receipt = create.json()
    const verify = await Bun.$`python3 ${path.join(evalsRoot, "script/evalrunner-archive.py")} verify ${path.join(root, "delivery.tar.gz")} ${receipt.sha256}`.quiet().nothrow()
    expect(verify.exitCode).toBe(0)
    expect(verify.json().files).toContain("manifest.json")
    expect(verify.json().files).toContain("completions/" + id + ".json")
    expect(verify.json().files.some((file: string) => /stdout|auth|history/.test(file))).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})
