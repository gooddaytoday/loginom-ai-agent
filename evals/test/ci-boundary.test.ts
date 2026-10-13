import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

test("unit command excludes Docker/browser integration suites before loading them", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-unit-boundary-"))
  try {
    const packageJson = await Bun.file(path.resolve(import.meta.dir, "../package.json")).json() as { scripts: { "test:unit": string } }
    await Bun.write(path.join(root, "package.json"), JSON.stringify({ name: "unit-boundary-fixture", scripts: { "test:unit": packageJson.scripts["test:unit"] } }))
    await Bun.write(path.join(root, "unit.test.ts"), 'import {test,expect} from "bun:test";test("unit fixture",()=>expect(true).toBe(true))')
    await Promise.all(["parallel-pair", "loginom-admin", "user-environment", "parallel-lifecycle", "shared-oauth", "process-supervisor", "parallel-acceptance"].map(name =>
      Bun.write(path.join(root, `${name}-integration.test.ts`), 'throw Error("INTEGRATION_LOADED")')))
    const child = Bun.spawn([process.execPath, "run", "test:unit"], { cwd: root, env: { PATH: process.env.PATH }, stdout: "pipe", stderr: "pipe" })
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(code).toBe(0)
    expect(stdout + stderr).not.toContain("INTEGRATION_LOADED")
    expect(stdout + stderr).toContain("1 pass")
  } finally { await rm(root, { recursive: true, force: true }) }
})
