import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { evalsRoot } from "../src/config"

test("cold refuses a foreign package and mismatched authoring identity before accessing storage", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-cold-"))
  try {
    const input = { connection: { url: "https://fixture.invalid", username: "fixture", password: "synthetic" },
      packagePath: "/other/reference.lgp", resources: root, output: path.join(root, "output"),
      attemptDir: path.join(root, "attempt"), caseDir: root, skillEnv: path.join(root, "settings") }
    await Bun.write(input.skillEnv, "LOGINOM_USERNAME=other\nLOGINOM_URL=https://fixture.invalid\n")
    await Bun.write(path.join(input.attemptDir, "storage.json"), JSON.stringify({ package: "/fixture/reference.lgp" }))
    for (const [packagePath, error] of [["/other/reference.lgp", "COLD_PACKAGE_OWNER"], ["/fixture/reference.lgp", "COLD_ATTEMPT_IDENTITY"]]) {
      const file = path.join(root, "input.json")
      await Bun.write(file, JSON.stringify({ ...input, packagePath }))
      const proc = Bun.spawn(["node", path.join(evalsRoot, "script/analytics-cold-rerun.mjs"), file], { stdout: "pipe", stderr: "pipe" })
      const stderr = await new Response(proc.stderr).text()
      expect(await proc.exited).not.toBe(0)
      expect(stderr).toContain(error!)
      expect(await Bun.file(path.join(input.output, "result.json")).exists()).toBe(false)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("cold refuses an escaping or unpinned bundled Node before parking results", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-cold-node-"))
  try {
    const input = { connection: { url: "https://fixture.invalid", username: "fixture", password: "synthetic" },
      packagePath: "/fixture/reference.lgp", resources: root, output: path.join(root, "output"),
      attemptDir: path.join(root, "attempt"), caseDir: root, skillEnv: path.join(root, "settings") }
    await Bun.write(input.skillEnv, "LOGINOM_USERNAME=fixture\nLOGINOM_URL=https://fixture.invalid\n")
    await Bun.write(path.join(input.attemptDir, "storage.json"), JSON.stringify({ package: input.packagePath }))
    await Bun.write(path.join(root, "bin/node"), "synthetic untrusted executable")
    const file = path.join(root, "input.json")
    await Bun.write(file, JSON.stringify(input))
    for (const node of ["../outside", "bin/node"]) {
      await Bun.write(path.join(root, "resource-manifest.json"), JSON.stringify({ node, nodeSha256: "0".repeat(64), files: [] }))
      const proc = Bun.spawn(["node", path.join(evalsRoot, "script/analytics-cold-rerun.mjs"), file], { stdout: "pipe", stderr: "pipe" })
      const stderr = await new Response(proc.stderr).text()
      expect(await proc.exited).not.toBe(0)
      expect(stderr).toContain("COLD_NODE_RUNTIME_INVALID")
      expect(await Bun.file(path.join(input.output, "result.json")).exists()).toBe(false)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})
