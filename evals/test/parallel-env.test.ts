import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { evalsRoot } from "../src/config"

test("parallel environment CLI refuses incomplete recovery arguments before creating output", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-env-"))
  try {
    const out = path.join(root, "output")
    const child = Bun.spawn([process.execPath, path.join(evalsRoot, "script/parallel-env.ts"), "recover", "--out", out],
      { cwd: evalsRoot, env: { PATH: process.env.PATH ?? "", HOME: root }, stdin: "ignore", stdout: "pipe", stderr: "pipe" })
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect({ code, stdout, stderr: stderr.trim() }).toEqual({ code: 2, stdout: "", stderr: "PARALLEL_ENV_ARGUMENTS" })
    expect(await Bun.file(path.join(out, "receipt.json")).exists()).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})
