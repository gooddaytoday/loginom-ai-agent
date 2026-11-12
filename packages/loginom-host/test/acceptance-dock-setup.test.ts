import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

// The fake clients stop at an unprepared workspace, before browser or signal operations.
test.skipIf(process.platform !== "linux")("independence driver passes explicit custom Dock settings to both clients", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-independence-input-"))
  const resources = join(root, "resources")
  const cli = join(root, "cli")
  const node = join(resources, "bin/node")
  await mkdir(join(resources, "bin"), { recursive: true })
  await Bun.write(cli, `#!/bin/sh\nexec '${process.execPath}' '${join(import.meta.dir, "fixtures/oracle-cli-scope.ts")}' "$@"\n`)
  await Bun.write(node, `#!/bin/sh\nexec '${process.execPath}' '${join(import.meta.dir, "fixtures/desktop-oracle-input.ts")}' "$@"\n`)
  await chmod(cli, 0o700)
  await chmod(node, 0o700)
  const config = {
    endpoint: "https://dock.example.test/team/mcp",
    api_key: "private-fixture",
    loginom_url: "http://127.0.0.1:1/app/",
    workflow_profile: { passwordless_login: true, loginom_user: "user" },
  }
  await Bun.write(join(root, "config.json"), JSON.stringify(config))
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "../script/desktop-cli-independence.ts")], {
    env: {
      ...process.env,
      LOGINOM_AI_AGENT_TEST_CONFIG: join(root, "config.json"),
      LOGINOM_AI_AGENT_TEST_CLI_EXECUTABLE: cli,
      LOGINOM_AI_AGENT_TEST_DESKTOP_EXECUTABLE: "unused-desktop",
      LOGINOM_AI_AGENT_TEST_RESOURCES: resources,
      LOGINOM_AI_AGENT_TEST_CREDENTIAL_PROFILE: "",
      LOGINOM_ORACLE_PROBE_REPORT: join(root, "calls.json"),
      LOGINOM_ORACLE_SETUP_REPORT: join(root, "setup.json"),
      LOGINOM_DESKTOP_INPUT_REPORT: join(root, "desktop.json"),
    },
    stdout: "pipe", stderr: "pipe",
  })
  const evidence: string[] = []
  try {
    const [code, stdout, stderr] = await Promise.all([
      child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
    ])
    const directory = stdout.match(/^Private acceptance evidence: (.+)$/m)?.[1]
    if (directory) evidence.push(directory)
    expect(code).not.toBe(0)
    expect(stderr).not.toContain("CLI_ORACLE_SETUP_FAILED")
    expect(stderr).not.toContain(config.api_key)
    const input = await Bun.file(join(root, "desktop.json")).json()
    expect(input.connection).toEqual({ endpoint: config.endpoint, apiKey: config.api_key,
      url: config.loginom_url, username: "user", password: "" })
    expect(await Bun.file(join(root, "setup.json")).json()).toEqual({
      ...input.connection, mode: "custom",
    })
  } finally {
    if (child.exitCode === null) child.kill("SIGINT")
    await Promise.all([root, ...evidence].map(directory => rm(directory, { recursive: true, force: true })))
  }
}, 15000)
