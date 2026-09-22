import { expect, test } from "bun:test"
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

test.skipIf(process.platform !== "linux")(
  "CLI does not read unsupported system proxy settings and still releases its profile",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "loginom-cli-proxy-"))
    try {
      const bin = join(directory, "bin")
      const profile = join(directory, "profile")
      await mkdir(bin)
      await writeFile(
        join(bin, "gsettings"),
        `#!/bin/sh
printf "%s\\n" "called" > "$LOGINOM_PROXY_PROBE"
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
              LOGINOM_PROXY_PROBE: join(directory, "proxy-probe"),
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
        expect(await child.exited).toBe(1)
        expect(await errors).toBe("LOGINOM_BUNDLE_INCOMPLETE\n")
        expect(JSON.parse(await output)).toEqual({ ok: false, code: "LOGINOM_BUNDLE_INCOMPLETE" })
        expect(await readdir(profile)).not.toContain(".writer")
        expect(await readdir(directory)).not.toContain("proxy-probe")
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
  15000,
)
