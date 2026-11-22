import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { transpilerCache } from "./fixture/environment"

// Profile isolation (guarantee 2): the product reads LOGINOM_AI_AGENT_* only. A variable that another OpenCode
// installation left in the inherited environment must not move storage, configuration, the database or the server
// password. OpenCode 1 kept these readers in packages/core (`Flag`, `Global`); OpenCode 2 reads them in the CLI process
// (`Global` from packages/util, `databasePath`, `Env`), so the guard runs the CLI itself.
// Not covered here: OPENCODE_CONFIG, OPENCODE_CONFIG_CONTENT and OPENCODE_DISABLE_PROJECT_CONFIG are read only inside
// `serve` (src/server-process.ts). OpenCode 2 no longer reads OPENCODE_SERVER_USERNAME, OPENCODE_PURE,
// OPENCODE_PERMISSION or OPENCODE_TUI_CONFIG.
const cli = path.join(import.meta.dir, "..")

const inherited = {
  OPENCODE_CONFIG_DIR: "/inherited/config-dir",
  OPENCODE_DB: "/inherited/opencode.db",
  OPENCODE_DISABLE_CHANNEL_DB: "1",
  OPENCODE_TEST_HOME: "/inherited/home",
  OPENCODE_PASSWORD: "inherited-password",
  OPENCODE_SERVER_PASSWORD: "inherited-password",
}

const product = {
  LOGINOM_AI_AGENT_CONFIG_DIR: "/product/config-dir",
  LOGINOM_AI_AGENT_DB: "/product/loginom-ai-agent.db",
  LOGINOM_AI_AGENT_PASSWORD: "product-password",
}

const roots: string[] = []
const probes = {} as Record<"inherited" | "both", Awaited<ReturnType<typeof probe>>>

// Two cold CLI starts and two bun processes, run together.
beforeAll(async () => {
  const [first, second] = await Promise.all([probe(inherited), probe({ ...inherited, ...product })])
  probes.inherited = first
  probes.both = second
}, 60_000)

afterAll(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe("inherited OpenCode environment", () => {
  test("leaves data, cache, state and logs in the product's directories", () => {
    const { root, paths } = probes.inherited
    expect(paths).toMatchObject({
      data: path.join(root, "data", "loginom-ai-agent-dev"),
      cache: path.join(root, "cache", "loginom-ai-agent-dev"),
      state: path.join(root, "state", "loginom-ai-agent-dev"),
      bin: path.join(root, "cache", "loginom-ai-agent-dev", "bin"),
      log: path.join(root, "data", "loginom-ai-agent-dev", "log"),
      repos: path.join(root, "data", "loginom-ai-agent-dev", "repos"),
    })
  })

  test("moves no location or credential", () => {
    const { root, paths, password } = probes.inherited
    expect({ home: paths.home, config: paths.config, db: paths.db, password }).toEqual({
      home: root,
      config: path.join(root, "config", "loginom-ai-agent-dev"),
      db: path.join(root, "data", "loginom-ai-agent-dev", "loginom-ai-agent-local.db"),
      password: null,
    })
  })

  test("does not override the product variables when both are set", () => {
    const { paths, password } = probes.both
    expect({ config: paths.config, db: paths.db, password }).toEqual({
      config: product.LOGINOM_AI_AGENT_CONFIG_DIR,
      db: product.LOGINOM_AI_AGENT_DB,
      password: product.LOGINOM_AI_AGENT_PASSWORD,
    })
  })
})

// `debug paths` prints the global paths and the database of the running CLI without starting a server; the password
// is the one a manually run server would adopt.
async function probe(env: Record<string, string>) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "loginom-flag-identity-"))
  roots.push(root)
  const isolated = {
    PATH: process.env.PATH,
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: transpilerCache,
    HOME: root,
    USERPROFILE: root,
    TMPDIR: path.join(root, "tmp"),
    TEMP: path.join(root, "tmp"),
    XDG_DATA_HOME: path.join(root, "data"),
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_CACHE_HOME: path.join(root, "cache"),
    XDG_STATE_HOME: path.join(root, "state"),
    ...env,
  }
  const [paths, password] = await Promise.all([
    run(["run", path.join(cli, "src/index.ts"), "debug", "paths"], isolated),
    run(
      [
        "-e",
        'import { Effect, Redacted } from "effect"; import { Env } from "./src/env"; ' +
          "const value = await Effect.runPromise(Effect.gen(function* () { return yield* Env.password })); " +
          "console.log(JSON.stringify(value === undefined ? null : Redacted.value(value)))",
      ],
      isolated,
    ),
  ])
  return {
    root,
    paths: Object.fromEntries(
      paths
        .trim()
        .split("\n")
        .map((line) => line.trim().split(/\s+/, 2)),
    ),
    password: JSON.parse(password) as string | null,
  }
}

async function run(args: string[], env: Record<string, string | undefined>) {
  const child = Bun.spawn([process.execPath, ...args], { cwd: cli, env, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) throw new Error(`${args.join(" ")} failed (${code}): ${stderr}`)
  return stdout
}
