import { expect, test } from "bun:test"
import { chmod, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

test.skipIf(process.platform !== "linux")(
  "owner-crash driver activates automation before preparing a workspace",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "loginom-owner-driver-test-"))
    const executable = join(root, "cli")
    await Bun.write(
      executable,
      `#!/bin/sh\nexec '${process.execPath}' '${join(import.meta.dir, "fixtures/oracle-cli-scope.ts")}' "$@"\n`,
    )
    await chmod(executable, 0o700)
    const config = join(root, "config.json")
    await Bun.write(
      config,
      JSON.stringify({
        api_key: "private-fixture",
        loginom_url: "http://127.0.0.1:1/app/",
        workflow_profile: { passwordless_login: true, loginom_user: "user" },
      }),
    )
    const child = Bun.spawn(
      [process.execPath, join(import.meta.dir, "../script/cli-owner-crash.ts"), "/user/owned-fixture.lgp"],
      {
        env: {
          ...process.env,
          LOGINOM_AI_AGENT_TEST_CONFIG: config,
          LOGINOM_AI_AGENT_TEST_CLI_EXECUTABLE: executable,
          LOGINOM_AI_AGENT_TEST_CREDENTIAL_PROFILE: "",
          LOGINOM_ORACLE_PROBE_REPORT: join(root, "calls.json"),
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const evidence: string[] = []
    try {
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])
      const directory = stdout.match(/^Private crash evidence: (\/tmp\/loginom-cli-owner-crash-[^\s]+)$/m)?.[1]
      if (directory) evidence.push(directory)
      expect(code).not.toBe(0)
      expect(stderr).toContain("CRASH_PREPARE_FAILED")
      expect(stderr).not.toContain("CLI_ORACLE_TOOL_NOT_ADVERTISED")
      const calls = await Bun.file(join(root, "calls.json")).json()
      expect(calls.map((call: { name: string }) => call.name)).toEqual(["skill", "loginom_dock_prepare"])
      expect(calls[0].arguments).toEqual({ name: "loginom-automation" })
    } finally {
      if (child.exitCode === null) child.kill("SIGINT")
      await Promise.all([root, ...evidence].map((directory) => rm(directory, { recursive: true, force: true })))
    }
  },
  15000,
)
