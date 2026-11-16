import { expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { copyFile, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { generateKeyPairSync, sign } from "node:crypto"

test("only an explicitly built updater fixture trusts its baked key; runtime overrides cannot change release trust", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-update-trust-"))
  const key = generateKeyPairSync("ed25519")
  const pem = key.publicKey.export({ type: "spki", format: "pem" }).toString()
  const raw = Buffer.from(
    `version: 0.4.1\nminSupportedVersion: 0.4.0\nstagingPercentage: 100\npath: releases/0.4.1/loginom-ai-agent-win-x64.exe\nsha512: ${Buffer.alloc(64).toString("base64")}\nfiles:\n  - url: releases/0.4.1/loginom-ai-agent-win-x64.exe\n    sha512: ${Buffer.alloc(64).toString("base64")}\n`,
  )
  try {
    await symlink(join(import.meta.dir, "node_modules"), join(root, "node_modules"), "dir")
    for (const [requested, release] of [
      [false, false],
      [true, false],
      [true, true],
    ]) {
      const fixture = requested && !release
      const config = Bun.spawnSync(
        [
          process.execPath,
          "--eval",
          `
          import { loadConfigFromFile } from 'electron-vite';
          const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, undefined, process.cwd(), 'silent');
          console.log(JSON.stringify(loaded.config.main.define));
        `,
        ],
        {
          cwd: import.meta.dir,
          env: {
            ...process.env,
            GITHUB_WORKFLOW: release ? "release" : "Loginom Windows candidate",
            LOGINOM_AI_AGENT_UPDATE_TEST_BUILD: requested ? "1" : "0",
            LOGINOM_AI_AGENT_UPDATE_TEST_PUBLIC_KEY: pem,
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      )
      if (config.exitCode) throw Error(config.stderr.toString())
      const define = JSON.parse(config.stdout.toString()) as Record<string, string>
      const module = join(root, `${fixture ? "fixture" : "release"}.mjs`)
      // Keep compiler state independent of other Desktop tests and their module mocks.
      const compiler = Bun.spawnSync(
        [
          process.execPath,
          "--eval",
          `
          const built = await Bun.build({
            entrypoints: [${JSON.stringify(join(import.meta.dir, "src/main/update-policy.ts"))}],
            target: 'bun', format: 'esm', define: ${JSON.stringify(define)},
            external: ['electron-updater', 'electron'],
          });
          if (!built.success) throw Error(built.logs.join('\\n'));
          await Bun.write(${JSON.stringify(module)}, built.outputs[0]);
        `,
        ],
        { cwd: import.meta.dir, stdout: "pipe", stderr: "pipe" },
      )
      if (compiler.exitCode) throw Error(compiler.stderr.toString())
      const source = await readFile(module, "utf8")
      const bytes = JSON.stringify(raw.toString("base64"))
      const signature = JSON.stringify(sign(null, raw, key.privateKey).toString("base64"))
      const probe = Bun.spawnSync(
        [
          process.execPath,
          "--eval",
          `
          process.argv.push('--public-key', process.env.LOGINOM_AI_AGENT_UPDATE_TEST_PUBLIC_KEY);
          const { verifyUpdateManifest } = await import(${JSON.stringify(module)});
          const raw = Buffer.from(${bytes}, 'base64');
          const signature = ${signature};
          const results = [raw, Buffer.concat([raw, Buffer.from('\\n')])].map(bytes => {
            try { return verifyUpdateManifest(bytes, signature, 'https://updates.example.test/unstable/').version; }
            catch (error) { return error.message; }
          });
          console.log(JSON.stringify(results));
        `,
        ],
        {
          env: {
            ...process.env,
            LOGINOM_AI_AGENT_UPDATE_TEST_BUILD: "1",
            LOGINOM_AI_AGENT_UPDATE_TEST_PUBLIC_KEY: pem,
          },
          stdout: "pipe",
          stderr: "pipe",
        },
      )
      if (probe.exitCode) throw Error(probe.stderr.toString())
      expect(JSON.parse(probe.stdout.toString())).toEqual([
        fixture ? "0.4.1" : "LOGINOM_UPDATE_SIGNATURE_INVALID",
        "LOGINOM_UPDATE_SIGNATURE_INVALID",
      ])
      expect(source.includes(pem.split("\n")[1])).toBe(fixture)
      expect(define.LOGINOM_AI_AGENT_UPDATE_TEST_PUBLIC_KEY ?? "null").toBe(JSON.stringify(fixture ? pem : null))
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("bakes the source commit and ignores only the config loader's temporary file when measuring dirtiness", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-build-source-"))
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim()
  try {
    await copyFile(join(import.meta.dir, "electron.vite.config.ts"), join(root, "electron.vite.config.ts"))
    await symlink(join(import.meta.dir, "node_modules"), join(root, "node_modules"), "dir")
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
        { cwd: root, stdout: "pipe", stderr: "pipe" },
      )
      if (result.exitCode) throw Error(result.stderr.toString())
      return JSON.parse(result.stdout.toString())
    }
    const clean = load()
    expect(clean["import.meta.env.LOGINOM_AI_AGENT_SOURCE_SHA"]).toBe(JSON.stringify(git("rev-parse", "HEAD")))
    expect(clean["import.meta.env.LOGINOM_AI_AGENT_SOURCE_DIRTY"]).toBe("false")
    expect(clean["LOGINOM_AI_AGENT_UPDATE_FEED"]).toBe(
      JSON.stringify(process.env.LOGINOM_AI_AGENT_UPDATE_FEED?.trim() || null),
    )
    await writeFile(join(root, "uncommitted.ts"), "// real build input\n")
    expect(load()["import.meta.env.LOGINOM_AI_AGENT_SOURCE_DIRTY"]).toBe("true")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
