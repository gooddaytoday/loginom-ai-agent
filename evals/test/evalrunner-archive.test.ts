import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { evalsRoot } from "../src/config"

test("standalone delivery archive excludes private logs and verifies round trip bytes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evalrunner-export-"))
  try {
    const summary = JSON.stringify({ tasks: [], storage_leftovers: [] })
    await Bun.write(path.join(root, "run/summary.json"), summary)
    await Bun.write(path.join(root, "run/report.md"), "report")
    await Bun.write(path.join(root, "run/events.jsonl"), "PRIVATE")
    await Bun.write(path.join(root, "release.json"), JSON.stringify({ status: "RELEASED", runDir: path.join(root, "run"), summarySha256: new Bun.CryptoHasher("sha256").update(summary).digest("hex") }))
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
