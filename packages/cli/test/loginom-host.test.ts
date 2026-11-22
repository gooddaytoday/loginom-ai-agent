import { afterAll, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { isolatedEnv } from "./fixture/environment"

// The product's Loginom Host starts with the server (B2.3): `serve` recovers the Host leases a killed server left before
// it listens, so no Location has to activate first (spike S2). The lease itself and its recovery are covered in
// packages/server/test/loginom-host-lease.test.ts; without LOGINOM_AI_AGENT_RESOURCES there is no Node host to start.
const cli = path.join(import.meta.dir, "..")
const roots: string[] = []

afterAll(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })))
})

test("serve recovers the Loginom Host leases of a killed server before it listens", async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "loginom-host-serve-")))
  roots.push(root)
  // `<data>/loginom/leases` of the dev channel, as `isolatedEnv` places the data directory.
  const leases = path.join(root, "data", "loginom-ai-agent-dev", "loginom", "leases")
  await fs.mkdir(leases, { recursive: true })
  await fs.writeFile(path.join(leases, "killed.json"), JSON.stringify({ session: "ses_killed", pid: 1 }))
  const child = Bun.spawn([process.execPath, path.join(cli, "src/index.ts"), "serve", "--port", "0"], {
    cwd: cli,
    env: isolatedEnv(root, { LOGINOM_AI_AGENT_PASSWORD: "loginom-host-test", LOGINOM_AI_AGENT_RESOURCES: undefined }),
    stdout: "pipe",
    stderr: "pipe",
  })
  try {
    const url = await listening(child)
    if (!url) throw new Error(`server did not start: ${await new Response(child.stderr).text()}`)
    expect(await fs.readdir(leases)).toEqual([])
  } finally {
    child.kill("SIGTERM")
    await child.exited
  }
}, 60_000)

// The URL once the server listens, or undefined when it exits first.
async function listening(child: Bun.Subprocess<"ignore", "pipe", "pipe">) {
  const decoder = new TextDecoder()
  const output = { text: "" }
  for await (const chunk of child.stdout) {
    output.text += decoder.decode(chunk)
    const url = /server listening on (http:\/\/\S+)/.exec(output.text)?.[1]
    if (url) return url
  }
  return undefined
}
