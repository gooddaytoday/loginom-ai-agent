import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const script = resolve(import.meta.dir, "../script/skills-acceptance.ts")
const linuxTest = test.skipIf(process.platform !== "linux" || process.arch !== "x64")

linuxTest.each([
  ["desktop", "docs-after-build", "SKILLS_ACCEPTANCE_MULTITURN_SCENARIO_ADAPTER_REQUIRED"],
  ["desktop", "scenario-create", "SKILLS_ACCEPTANCE_MULTITURN_SCENARIO_ADAPTER_REQUIRED"],
  ["desktop", "docs-external-unicode-path", "SKILLS_ACCEPTANCE_PERMISSION_ADAPTER_REQUIRED"],
  ["desktop", "docs-no-input,docs-no-input", "SKILLS_ACCEPTANCE_DUPLICATE_CASE"],
  ["desktop", "not-in-corpus", "SKILLS_ACCEPTANCE_UNKNOWN_CASE"],
  ["run", "docs-external-unicode-path", "cli-manifest.json"],
])("live acceptance validates %s case %s before creating results", async (interfaceName, cases, error) => {
  const root = await mkdtemp(join(tmpdir(), "loginom-acceptance-preflight-"))
  try {
    const artifact = join(root, "artifact")
    await mkdir(artifact)
    await Bun.write(join(artifact, "owned.txt"), "unchanged")
    const output = join(root, "results")
    const child = Bun.spawn(
      [
        process.execPath,
        script,
        "--interface",
        interfaceName,
        ...(interfaceName === "run" ? ["--cli-image", "unused-preflight-image"] : []),
        "--artifact",
        artifact,
        "--output",
        output,
        "--model",
        "provider/model",
        "--cases",
        cases,
      ],
      { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
    )
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    expect(code).not.toBe(0)
    expect(stdout + stderr).toContain(error)
    expect(await Bun.file(join(artifact, "owned.txt")).text()).toBe("unchanged")
    expect(await Bun.file(join(output, "conditions.json")).exists()).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

linuxTest(
  "process evidence retains owned child identity after exit and excludes a sibling process",
  async () => {
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
    const sibling = Bun.spawn([node, "-e", "setTimeout(() => {}, 15000)"], { stdout: "ignore", stderr: "pipe" })
    try {
      const child = Bun.spawn(
        [
          node,
          "--input-type=module",
          "-e",
          `
      import { spawn } from 'node:child_process'
      import { setTimeout } from 'node:timers/promises'
      import { observeProcesses } from ${JSON.stringify(new URL("../script/skills-acceptance/processes.mjs", import.meta.url).href)}
      const observer = observeProcesses()
      const owned = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 15000)'], { stdio: 'ignore' })
      await setTimeout(250)
      owned.kill('SIGTERM')
      await new Promise(resolve => owned.once('exit', resolve))
      console.log(JSON.stringify({ owned: owned.pid, evidence: await observer.close() }))
    `,
        ],
        { stdout: "pipe", stderr: "pipe" },
      )
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
      const result = JSON.parse(stdout)
      expect(result.evidence.remaining).toEqual([])
      expect(
        result.evidence.processes.some(
          (row: { pid: number; start?: string; command: string }) =>
            row.pid === result.owned && row.start && row.command.includes(node),
        ),
      ).toBe(true)
      expect(result.evidence.processes.some((row: { pid: number }) => row.pid === sibling.pid)).toBe(false)
    } finally {
      sibling.kill()
      await sibling.exited
    }
  },
  10000,
)
