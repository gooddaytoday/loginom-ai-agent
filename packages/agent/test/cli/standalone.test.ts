import { afterEach, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const roots: string[] = []
async function temporary() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cli-entry-test-"))
  roots.push(root)
  return root
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

async function run(root: string, code: string, extra: NodeJS.ProcessEnv = {}) {
  const child = Bun.spawn([process.execPath, "--eval", code], {
    cwd: path.resolve(import.meta.dir, "../.."),
    env: {
      ...process.env,
      // Bun's configured preload writes its own transpiler cache before our entry.
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
      LOGINOM_AI_AGENT_CLI_ROOT: undefined,
      LOGINOM_AI_AGENT_CLI_PROFILE: path.join(root, "profile"),
      LOGINOM_AI_AGENT_CHANNEL: "dev",
      XDG_CONFIG_HOME: path.join(root, "desktop-config"),
      XDG_DATA_HOME: path.join(root, "desktop-data"),
      XDG_CACHE_HOME: path.join(root, "desktop-cache"),
      XDG_STATE_HOME: path.join(root, "desktop-state"),
      ...extra,
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  return {
    code: await child.exited,
    out: await new Response(child.stdout).text(),
    error: await new Response(child.stderr).text(),
  }
}

test("help and version never invoke backend or create profile/Desktop storage", async () => {
  const root = await temporary()
  for (const argument of ["--help", "--version", "-h", "-v"]) {
    const result = await run(
      root,
      `import { standalone } from './src/cli/standalone.ts';
      await standalone([${JSON.stringify(argument)}], async () => { throw new Error('backend imported') });`,
    )
    expect(result.code).toBe(0)
    expect(result.out.length).toBeGreaterThan(0)
    expect(await fs.readdir(root)).toEqual([])
  }
})

test("backend imports use isolated global paths and cannot inherit Desktop DB/config/auth", async () => {
  const root = await temporary()
  const result = await run(
    root,
    `import { standalone } from './src/cli/standalone.ts';
    await standalone(['models'], async () => {
      const { Global } = await import('@loginom-ai-agent/core/global');
      const fs = await import('node:fs/promises');
      console.log(JSON.stringify({ paths: Global.Path, temporary: process.env.TMPDIR, realTemporary: await fs.realpath(process.env.TMPDIR), db: process.env.LOGINOM_AI_AGENT_DB,
        config: process.env.LOGINOM_AI_AGENT_CONFIG_DIR, auth: process.env.LOGINOM_AI_AGENT_AUTH_CONTENT }));
    });`,
    {
      LOGINOM_AI_AGENT_DB: path.join(root, "desktop.db"),
      LOGINOM_AI_AGENT_CONFIG_DIR: path.join(root, "desktop-config"),
      LOGINOM_AI_AGENT_AUTH_CONTENT: "should-not-be-inherited",
    },
  )
  expect(result.error).toBe("")
  expect(result.code).toBe(0)
  const value = JSON.parse(result.out)
  expect(value.paths.data).toBe(path.join(root, "profile", "data"))
  expect(value.paths.tmp).toBe(path.join(root, "profile", "cache", "tmp"))
  expect(value.realTemporary).toBe(value.paths.tmp)
  if (process.platform === "linux") {
    expect(value.temporary.length).toBeLessThan(64)
    await expect(fs.lstat(value.temporary)).rejects.toMatchObject({ code: "ENOENT" })
  }
  expect(value.db).toBe(path.join(root, "profile", "data", "loginom-ai-agent.db"))
  expect(value.config).toBe(path.join(root, "profile", "config"))
  expect(value.auth).toBeUndefined()
  expect(await fs.readdir(root)).toEqual(["profile"])
  expect(await fs.readdir(path.join(root, "profile"))).not.toContain(".writer")
})

test("failed cleanup leaves the guard for offline recovery", async () => {
  const root = await temporary()
  const result = await run(
    root,
    `import { standalone } from './src/cli/standalone.ts';
    await standalone([], async () => { console.log(process.env.TMPDIR); throw new Error('cleanup failed') }).catch(() => { process.exitCode = 1 });`,
  )
  expect(result.code).toBe(1)
  expect(await fs.readdir(path.join(root, "profile"))).toContain(".writer")
  if (process.platform === "linux") {
    const alias = result.out.trim()
    expect(await fs.realpath(alias)).toBe(path.join(root, "profile", "cache", "tmp"))
    await fs.unlink(alias)
    await fs.rmdir(path.dirname(alias))
  }
})

test("public CLI profile selector does not redirect ordinary Desktop Global imports", async () => {
  const root = await temporary()
  const result = await run(
    root,
    `const { Global } = await import('@loginom-ai-agent/core/global'); console.log(Global.Path.data)`,
  )
  expect(result.code).toBe(0)
  expect(result.out.trim()).toBe(path.join(root, "desktop-data", "loginom-ai-agent-dev"))
  expect(await fs.readdir(root)).not.toContain("profile")
})

test("provider management uses the CLI profile without Loginom configuration or bundle", async () => {
  const root = await temporary()
  const result = await run(
    root,
    `process.argv = ['bun', 'standalone', 'providers', 'list']; await import('./src/standalone.ts');`,
    {
      LOGINOM_AI_AGENT_CLI_BUNDLE: undefined,
      LOGINOM_AI_AGENT_PURE: "1",
      LOGINOM_AI_AGENT_AUTH_CONTENT: '{"private-inherited-provider":{"type":"api","key":"private-inherited-key"}}',
    },
  )
  expect(result.code).toBe(0)
  expect(result.out + result.error).not.toContain("private-inherited")
  expect(await fs.readdir(root)).toEqual(["profile"])
  expect(await fs.readdir(path.join(root, "profile"))).not.toContain(".writer")
  expect(await fs.readdir(path.join(root, "profile", "loginom"))).toEqual([])
  const { testProviderConfig } = await import("../lib/test-provider")
  await fs.writeFile(
    path.join(root, "profile", "config", "loginom-ai-agent.json"),
    JSON.stringify(testProviderConfig("http://127.0.0.1:1/v1")),
  )
  const models = await run(
    root,
    `process.argv = ['bun', 'standalone', 'models', 'test']; await import('./src/standalone.ts');`,
    {
      LOGINOM_AI_AGENT_CLI_BUNDLE: undefined,
      LOGINOM_AI_AGENT_PURE: "1",
    },
  )
  expect(models.code).toBe(0)
  expect(models.out).toBe("test/test-model\n")
  expect(await fs.readdir(path.join(root, "profile"))).not.toContain(".writer")
  expect(await fs.readdir(path.join(root, "profile", "loginom"))).toEqual([])
}, 30_000)

test("bootstrap carries an early signal into stdin admission and releases its handler", async () => {
  const root = await temporary()
  const result = await run(
    root,
    `
    import { standalone } from './src/cli/standalone.ts';
    import { standaloneCancellation } from './src/cli/standalone-cancellation.ts';
    import { readPromptStdin } from './src/cli/cmd/run/runtime.stdin.ts';
    const listeners = process.listenerCount('SIGINT');
    await standalone(['run'], async () => {
      const signal = standaloneCancellation();
      const cancelled = new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
      process.kill(process.pid, 'SIGINT');
      await cancelled;
      console.log(JSON.stringify(await readPromptStdin(true)));
    });
    console.log(!standaloneCancellation() && process.listenerCount('SIGINT') === listeners);
  `,
  )
  expect(result.code).toBe(0)
  expect(result.out).toBe('{"cancelled":true}\ntrue\n')
  expect(await fs.readdir(path.join(root, "profile"))).not.toContain(".writer")
})
