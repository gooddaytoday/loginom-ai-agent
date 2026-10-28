import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

// Profile isolation (guarantee 2): the product reads LOGINOM_AI_AGENT_* only. A variable that another OpenCode
// installation left in the inherited environment must not change configuration, database or data locations.
// Flag and Global read process.env when they are imported, so every case runs in a fresh process.
const core = resolve(import.meta.dir, "..")

const inherited = {
  OPENCODE_CONFIG: "/inherited/opencode.json",
  OPENCODE_CONFIG_CONTENT: '{"inherited":true}',
  OPENCODE_CONFIG_DIR: "/inherited/config-dir",
  OPENCODE_DB: "/inherited/opencode.db",
  OPENCODE_SERVER_PASSWORD: "inherited-password",
  OPENCODE_SERVER_USERNAME: "inherited-user",
  OPENCODE_PURE: "1",
  OPENCODE_DISABLE_PROJECT_CONFIG: "1",
  OPENCODE_PERMISSION: '{"inherited":"allow"}',
  OPENCODE_TUI_CONFIG: "/inherited/tui.json",
}

function probe(env: Record<string, string>) {
  const home = mkdtempSync(join(tmpdir(), "flag-identity-"))
  try {
    const script = `
      const { Flag } = await import("./src/flag/flag")
      const { Global } = await import("./src/global")
      console.log(JSON.stringify({
        config: Flag.LOGINOM_AI_AGENT_CONFIG ?? null,
        configContent: Flag.LOGINOM_AI_AGENT_CONFIG_CONTENT ?? null,
        configDir: Flag.LOGINOM_AI_AGENT_CONFIG_DIR ?? null,
        db: Flag.LOGINOM_AI_AGENT_DB ?? null,
        password: Flag.LOGINOM_AI_AGENT_SERVER_PASSWORD ?? null,
        username: Flag.LOGINOM_AI_AGENT_SERVER_USERNAME ?? null,
        pure: Flag.LOGINOM_AI_AGENT_PURE,
        disableProjectConfig: Flag.LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG,
        permission: Flag.LOGINOM_AI_AGENT_PERMISSION ?? null,
        tuiConfig: Flag.LOGINOM_AI_AGENT_TUI_CONFIG ?? null,
        data: Global.Path.data,
        config_path: Global.Path.config,
      }))
    `
    const result = spawnSync(process.execPath, ["-e", script], {
      cwd: core,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        HOME: home,
        XDG_DATA_HOME: join(home, "data"),
        XDG_CONFIG_HOME: join(home, "config"),
        XDG_CACHE_HOME: join(home, "cache"),
        XDG_STATE_HOME: join(home, "state"),
        ...env,
      },
    })
    if (result.status !== 0) throw new Error(`probe failed: ${result.stderr}`)
    return { home, output: JSON.parse(result.stdout.trim().split("\n").at(-1)!) as Record<string, unknown> }
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

describe("inherited OpenCode environment", () => {
  test("is ignored: no flag or storage location follows OPENCODE_*", () => {
    const { home, output } = probe(inherited)
    expect(output).toMatchObject({
      config: null,
      configContent: null,
      configDir: null,
      db: null,
      password: null,
      username: null,
      pure: false,
      disableProjectConfig: false,
      permission: null,
      tuiConfig: null,
    })
    expect(String(output.data).startsWith(home)).toBe(true)
    expect(String(output.data).endsWith("loginom-ai-agent")).toBe(true)
    expect(JSON.stringify(output)).not.toContain("inherited")
  })

  test("does not override the product variables when both are set", () => {
    const { output } = probe({
      ...inherited,
      LOGINOM_AI_AGENT_CONFIG: "/product/loginom-ai-agent.json",
      LOGINOM_AI_AGENT_DB: "/product/loginom-ai-agent.db",
      LOGINOM_AI_AGENT_PURE: "1",
    })
    expect(output).toMatchObject({
      config: "/product/loginom-ai-agent.json",
      db: "/product/loginom-ai-agent.db",
      pure: true,
      configContent: null,
    })
  })
})
