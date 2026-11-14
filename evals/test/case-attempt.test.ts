import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { evalsRoot } from "../src/config"

test("known premodel refusal leaves the authoring attempt available and preserves existing evidence", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-case-attempt-"))
  try {
    const caseDir = path.join(root, "drafts", "fixture")
    const profile = path.join(root, "profile")
    const work = path.join(root, "work", "drafts", "fixture", "attempt-1")
    await mkdir(caseDir, { recursive: true })
    await Bun.write(path.join(profile, ".writer"), "fixture owner")
    const settings = path.join(root, "settings")
    await Bun.write(settings, `MODEL=fixture/model\nWORK_ROOT='${root}/work'\nPROFILE='${profile}'\n`)
    const command = () => Bun.spawn(["bash", path.join(evalsRoot, "skills/loginom-eval-case/scripts/run_attempt.sh"), caseDir, "1"], {
      env: { ...process.env, LOGINOM_EVAL_CASE_ENV: settings }, stdout: "pipe", stderr: "pipe",
    })
    const processes = [command(), command()]
    const codes = await Promise.all(processes.map(async process => {
      await new Response(process.stderr).text()
      await new Response(process.stdout).text()
      return process.exited
    }))
    expect(codes).toEqual([3, 3])
    expect(await Bun.file(path.join(work, "events.jsonl")).exists()).toBe(false)
    await Bun.write(path.join(work, "name"), "existing attempt evidence")
    const retry = command()
    await new Response(retry.stderr).text()
    expect(await retry.exited).toBe(2)
    expect(await Bun.file(path.join(work, "name")).text()).toBe("existing attempt evidence")
  } finally { await rm(root, { recursive: true, force: true }) }
})
