import { expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"

// Contract (catalog CAT-13, packages/product/AGENTS.md): prod, beta and dev keep their data, config, state, cache, logs
// and tmp apart. The CLI build bakes its release channel into OPENCODE_CHANNEL; the stable build (`latest`) is prod and
// keeps the unsuffixed directory, every other build and a run from source is dev. Each row is a fresh process, as each
// build is.
const channels = [
  { build: "latest", directory: "loginom-ai-agent" },
  { build: "prod", directory: "loginom-ai-agent" },
  { build: "beta", directory: "loginom-ai-agent-beta" },
  { build: "dev", directory: "loginom-ai-agent-dev" },
  { build: "next", directory: "loginom-ai-agent-dev" },
  { build: "some-branch", directory: "loginom-ai-agent-dev" },
  { build: undefined, directory: "loginom-ai-agent-dev" },
]

// Seven cold bun processes start together; on a loaded Windows runner they can outlast the 5s default.
test("each product channel keeps its storage in its own directory, prod without a suffix", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-global-channel-"))
  try {
    const actual = await Promise.all(channels.map((row) => paths(root, row.build)))
    expect(actual).toEqual(channels.map((row) => expected(root, row.directory)))
    expect(new Set(actual.map((paths) => paths.data)).size).toBe(3)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}, 30_000)

function expected(root: string, directory: string) {
  return {
    data: path.join(root, "data", directory),
    cache: path.join(root, "cache", directory),
    config: path.join(root, "config", directory),
    state: path.join(root, "state", directory),
    log: path.join(root, "data", directory, "log"),
    tmp: path.join(root, "tmp", directory),
  }
}

async function paths(root: string, build: string | undefined) {
  const child = Bun.spawn(
    [
      process.execPath,
      ...(build === undefined ? [] : ["--define", `OPENCODE_CHANNEL=${JSON.stringify(build)}`]),
      "-e",
      `const { Global } = await import("./src/global.ts")
       const { data, cache, config, state, log, tmp } = Global.Path
       console.log(JSON.stringify({ data, cache, config, state, log, tmp }))`,
    ],
    {
      cwd: path.join(import.meta.dir, ".."),
      env: {
        ...process.env,
        XDG_DATA_HOME: path.join(root, "data"),
        XDG_CACHE_HOME: path.join(root, "cache"),
        XDG_CONFIG_HOME: path.join(root, "config"),
        XDG_STATE_HOME: path.join(root, "state"),
        // os.tmpdir() reads TMPDIR on POSIX and TEMP on Windows.
        TMPDIR: path.join(root, "tmp"),
        TEMP: path.join(root, "tmp"),
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
  return JSON.parse(stdout)
}
