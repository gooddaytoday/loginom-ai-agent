import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { mkdtemp, rm } from "node:fs/promises"
import { evalsRoot } from "../src/config"

test("cold reader rejects a different CLI source pin before loading browser resources", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "import-cold-pin-"))
  try {
    await Bun.write(path.join(root, "cli-manifest.json"), JSON.stringify({ metadata: { sourceCommit: "other", sourceDirty: false } }))
    const file = path.join(root, "empty.json")
    await Bun.write(file, "{}")
    const run = Bun.spawn([process.execPath, path.join(evalsRoot, "script/text-import-cold/reader.mjs"),
      "--resources", path.join(root, "resources/loginom"), "--config", file, "--saved", file,
      "--expected", file, "--events", path.join(root, "events.jsonl"), "--output", path.join(root, "cold")],
      { stdout: "pipe", stderr: "pipe" })
    const [code, error] = await Promise.all([run.exited, new Response(run.stderr).text()])
    expect(code).not.toBe(0)
    expect(error).toContain("TEXT_IMPORT_CLI_PIN_DIFFERS")
    expect(await Bun.file(path.join(root, "cold/session.json")).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})
