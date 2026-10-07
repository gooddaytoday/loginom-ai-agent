import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

test("cold reexecution rejects a foreign package before opening resources or creating browser evidence", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
  const root = await mkdtemp(join(tmpdir(), "loginom-cold-ownership-"))
  try {
    const output = join(root, "evidence")
    const child = Bun.spawn([node, resolve(import.meta.dir, "../script/skills-acceptance/cold.mjs")], {
      stdin: new Blob([
        JSON.stringify({
          resources: join(root, "absent-resources"),
          output,
          connection: { url: "http://localhost/app/", username: "user", password: "" },
          outputDigest: "a".repeat(64),
          case: "scenario-create",
          attempt: 1,
          package: { path: "/user/foreign.lgp", node: "group-guid", label: "SUM" },
        }),
      ]),
      stdout: "pipe",
      stderr: "pipe",
    })
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    expect(code).toBe(1)
    expect(stdout + stderr).toContain("COLD_PACKAGE_OWNERSHIP_INVALID")
    expect(await Bun.file(join(output, "processes.json")).exists()).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
