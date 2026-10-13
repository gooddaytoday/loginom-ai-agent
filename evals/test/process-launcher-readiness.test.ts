import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { evalsRoot } from "../src/config"

test("launcher does not publish ready when the selected CLI failed to spawn", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "evals-launcher-readiness-"))
  try {
    await writeFile(path.join(directory, "command.json"), JSON.stringify({
      cmd: [path.join(directory, "missing-cli")], cwd: evalsRoot, nonce: crypto.randomUUID(),
    }), { mode: 0o600 })
    const child = Bun.spawn([process.execPath, path.join(evalsRoot, "src/process-launcher.ts"), directory], {
      cwd: evalsRoot, env: { PATH: process.env.PATH ?? "" }, stdout: "pipe", stderr: "pipe",
    })
    const [code] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(code).toBe(2)
    const state = await Bun.file(path.join(directory, "state.json")).json()
    expect(state.error).toBe("CLI_LAUNCH_FAILED")
    expect(state.cli_pid).toBeNull()
    expect(state.ready).toBe(false)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
