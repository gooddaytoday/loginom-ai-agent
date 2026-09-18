import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

test.skipIf(process.platform !== "linux")(
  "unsupported proxy fails before host startup and releases the CLI profile",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "loginom-cli-proxy-"))
    try {
      const bin = join(directory, "bin")
      const profile = join(directory, "profile")
      await mkdir(bin)
      await writeFile(
        join(bin, "gsettings"),
        `#!/bin/sh
printf "%s\\n" "org.gnome.system.proxy mode 'manual'" "org.gnome.system.proxy.http use-authentication true"
`,
        { mode: 0o700 },
      )
      for (const _ of [1, 2]) {
        const child = Bun.spawn(
          [process.execPath, "run", "src/standalone.ts", "loginom", "status", "--format", "json"],
          {
            cwd: resolve(import.meta.dir, "../.."),
            env: {
              ...process.env,
              PATH: bin,
              LOGINOM_AI_AGENT_CLI_PROFILE: profile,
              LOGINOM_AI_AGENT_CLI_BUNDLE: join(directory, "missing-bundle"),
            },
            stdout: "pipe",
            stderr: "pipe",
            stdin: "ignore",
          },
        )
        const output = new Response(child.stdout).text()
        const errors = new Response(child.stderr).text()
        expect(await child.exited).toBe(2)
        expect(await errors).toBe("SYSTEM_PROXY_AUTHENTICATION_UNSUPPORTED\n")
        expect(await output).toBe("")
        expect(await readdir(profile)).not.toContain(".writer")
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  15000,
)
