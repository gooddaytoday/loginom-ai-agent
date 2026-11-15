import { expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

test("bakes the source commit and ignores only the config loader's temporary file when measuring dirtiness", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-build-source-"))
  const desktop = join(root, "packages/desktop")
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim()
  try {
    await mkdir(desktop, { recursive: true })
    await mkdir(join(root, "packages/loginom-host/script"), { recursive: true })
    await copyFile(join(import.meta.dir, "electron.vite.config.ts"), join(desktop, "electron.vite.config.ts"))
    await copyFile(join(import.meta.dir, "../loginom-host/script/cloud-build.ts"), join(root, "packages/loginom-host/script/cloud-build.ts"))
    await symlink(join(import.meta.dir, "node_modules"), join(desktop, "node_modules"), "dir")
    await writeFile(join(root, ".gitignore"), "node_modules\n")
    await writeFile(join(root, "package.json"), '{"type":"module"}\n')
    git("init", "-q")
    git("add", ".")
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-qm", "fixture")
    const load = () => {
      const result = Bun.spawnSync(
        [
          process.execPath,
          "--eval",
          `
        import { loadConfigFromFile } from 'electron-vite';
        const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, undefined, process.cwd(), 'silent');
        console.log(JSON.stringify(loaded.config.main.define));
      `,
        ],
        { cwd: desktop, stdout: "pipe", stderr: "pipe" },
      )
      if (result.exitCode) throw Error(result.stderr.toString())
      return JSON.parse(result.stdout.toString())
    }
    const clean = load()
    expect(clean["import.meta.env.LOGINOM_AI_AGENT_SOURCE_SHA"]).toBe(JSON.stringify(git("rev-parse", "HEAD")))
    expect(clean["import.meta.env.LOGINOM_AI_AGENT_SOURCE_DIRTY"]).toBe("false")
    await writeFile(join(root, "uncommitted.ts"), "// real build input\n")
    expect(load()["import.meta.env.LOGINOM_AI_AGENT_SOURCE_DIRTY"]).toBe("true")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
