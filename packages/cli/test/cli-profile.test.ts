import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { CliProfile } from "../src/profile"

// Profiles of the product CLI (B2.7c, G2), in process: what the product CLI entry applies before the CLI loads, and the
// writer latch its server holds. The cases of 0.4 (`a080f7725c:packages/opencode/test/cli/profile.test.ts`) carry over;
// the services themselves are in cli-profile-service.test.ts.
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

async function temporary() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "loginom-cli-profile-")))
  roots.push(root)
  return root
}

describe("applying a profile", () => {
  test("a new root becomes a private profile with its own storage, service and settings, whatever it inherited", async () => {
    const root = path.join(await temporary(), "work")
    // What a CLI started from a Desktop terminal inherits from Desktop's service (B1.3a).
    const env: NodeJS.ProcessEnv = {
      LOGINOM_AI_AGENT_CLI_PROFILE: root,
      LOGINOM_AI_AGENT_CLI_ROOT: "/desktop/cli",
      LOGINOM_AI_AGENT_SERVICE_IDENTITY: "desktop",
      LOGINOM_AI_AGENT_SERVICE_PORT: "24000",
      LOGINOM_AI_AGENT_CONFIG_DIR: "/desktop/config",
      LOGINOM_AI_AGENT_DB: "/desktop/data/loginom-ai-agent.db",
      LOGINOM_AI_AGENT_CONFIG: "/desktop/config/loginom-ai-agent.json",
      LOGINOM_AI_AGENT_CONFIG_CONTENT: "{}",
      LOGINOM_AI_AGENT_AUTH_CONTENT: "{}",
      PATH: "/usr/bin",
    }
    const paths = CliProfile.apply(env)

    expect(paths.root).toBe(root)
    expect(env).toEqual({
      LOGINOM_AI_AGENT_CLI_PROFILE: root,
      LOGINOM_AI_AGENT_CLI_ROOT: root,
      LOGINOM_AI_AGENT_SERVICE_IDENTITY: expect.stringMatching(/^cli-[0-9a-f]{8}$/),
      LOGINOM_AI_AGENT_SERVICE_PORT: expect.any(String),
      LOGINOM_AI_AGENT_CONFIG_DIR: path.join(root, "config"),
      LOGINOM_AI_AGENT_DB: path.join(root, "data", "loginom-ai-agent.db"),
      PATH: "/usr/bin",
    })
    // A source run is the dev channel: its quarter of the CLI profile ports.
    expect(Number(env.LOGINOM_AI_AGENT_SERVICE_PORT)).toBeGreaterThanOrEqual(0x6800)
    expect(Number(env.LOGINOM_AI_AGENT_SERVICE_PORT)).toBeLessThan(0x6c00)
    expect(await fs.readFile(path.join(root, "cli-profile.json"), "utf8")).toBe(
      JSON.stringify({ format: "loginom-cli", version: 1, channel: "dev" }),
    )
    expect((await fs.readdir(root)).toSorted()).toEqual([
      "cache",
      "cli-profile.json",
      "config",
      "data",
      "loginom",
      "state",
    ])
    if (process.platform !== "win32")
      for (const directory of [root, paths.config, paths.data, paths.state, paths.cache, paths.tmp, paths.loginom])
        expect((await fs.stat(directory)).mode & 0o777).toBe(0o700)
  })

  test("a symlink alias opens the same profile with the same service; another root gets another service", async () => {
    const base = await temporary()
    const first: NodeJS.ProcessEnv = { LOGINOM_AI_AGENT_CLI_PROFILE: path.join(base, "first") }
    CliProfile.apply(first)
    await fs.symlink(path.join(base, "first"), path.join(base, "alias"))
    const alias: NodeJS.ProcessEnv = { LOGINOM_AI_AGENT_CLI_PROFILE: path.join(base, "alias") }
    const second: NodeJS.ProcessEnv = { LOGINOM_AI_AGENT_CLI_PROFILE: path.join(base, "second") }
    CliProfile.apply(alias)
    CliProfile.apply(second)

    expect(alias).toMatchObject(service(first))
    expect(second.LOGINOM_AI_AGENT_CLI_ROOT).toBe(path.join(base, "second"))
    expect(service(second).LOGINOM_AI_AGENT_SERVICE_IDENTITY).not.toBe(service(first).LOGINOM_AI_AGENT_SERVICE_IDENTITY)
  })

  test("a Desktop directory, unknown data, another channel's profile and escaped storage are refused", async () => {
    const base = await temporary()
    const apply = (root: string) => () => CliProfile.apply({ LOGINOM_AI_AGENT_CLI_PROFILE: root })
    expect(apply("relative")).toThrow("PROFILE_ROOT_INVALID")
    expect(apply(path.join(base, "com.loginom.aiagent.dev"))).toThrow("PROFILE_DESKTOP_ROOT")
    expect(apply(path.join(base, "loginom-ai-agent"))).toThrow("PROFILE_DESKTOP_ROOT")

    const foreign = path.join(base, "foreign")
    await fs.mkdir(foreign, { mode: 0o700 })
    await fs.writeFile(path.join(foreign, "desktop.db"), "untouched")
    expect(apply(foreign)).toThrow("PROFILE_FORMAT_INVALID")
    expect(await fs.readdir(foreign)).toEqual(["desktop.db"])

    const prod = path.join(base, "prod")
    await fs.mkdir(prod, { mode: 0o700 })
    await fs.writeFile(
      path.join(prod, "cli-profile.json"),
      JSON.stringify({ format: "loginom-cli", version: 1, channel: "prod" }),
    )
    expect(apply(prod)).toThrow("PROFILE_FORMAT_INVALID")

    const escaped = path.join(base, "escaped")
    CliProfile.apply({ LOGINOM_AI_AGENT_CLI_PROFILE: escaped })
    await fs.rmdir(path.join(escaped, "data"))
    await fs.symlink(await temporary(), path.join(escaped, "data"))
    expect(apply(escaped)).toThrow("PROFILE_PATH_INVALID")
  })

  test.skipIf(process.platform === "win32")("a profile others can read is refused and left as it is", async () => {
    const root = await temporary()
    await fs.chmod(root, 0o755)
    expect(() => CliProfile.apply({ LOGINOM_AI_AGENT_CLI_PROFILE: root })).toThrow("PROFILE_PERMISSIONS_INVALID")
    expect(await fs.readdir(root)).toEqual([])
    expect((await fs.stat(root)).mode & 0o777).toBe(0o755)
  })
})

describe("the writer latch", () => {
  test("one writer per profile; another profile is independent; a released latch opens again", async () => {
    const [first, second] = [await temporary(), await temporary()]
    const held = await CliProfile.take(first, false)
    await expect(CliProfile.take(first, true)).rejects.toThrow("PROFILE_BUSY")
    const other = await CliProfile.take(second, false)
    expect(await owner(first)).toMatchObject({ pid: process.pid, service: false })
    await other.release()
    await held.release()
    expect(await fs.readdir(first)).toEqual([])
    await (await CliProfile.take(first, true)).release()
  })

  test("a latch whose owner process is gone is taken over", async () => {
    const root = await temporary()
    const gone = Bun.spawn([process.execPath, "-e", ""])
    await gone.exited
    await fs.mkdir(path.join(root, ".writer"))
    await fs.writeFile(
      path.join(root, ".writer", "owner"),
      JSON.stringify({ pid: gone.pid, nonce: "gone", service: true }),
    )

    const held = await CliProfile.take(root, true)
    expect(await owner(root)).toMatchObject({ pid: process.pid, service: true })
    expect(await fs.readdir(path.join(root, ".writer"))).toEqual(["owner"])
    await held.release()
  })

  test("a live owner, a 0.4 latch and a latch without an owner are never taken; a foreign owner is never removed", async () => {
    const root = await temporary()
    const lock = path.join(root, ".writer")
    await fs.mkdir(lock)
    await expect(CliProfile.take(root, true)).rejects.toThrow("PROFILE_BUSY")
    // 0.4 kept only its nonce in the owner file.
    await fs.writeFile(path.join(lock, "owner"), "foreign")
    await expect(CliProfile.take(root, true)).rejects.toThrow("PROFILE_BUSY")
    expect(await fs.readFile(path.join(lock, "owner"), "utf8")).toBe("foreign")
    // The parent of this test process is alive.
    await fs.writeFile(path.join(lock, "owner"), JSON.stringify({ pid: process.ppid, nonce: "live", service: true }))
    const busy = await CliProfile.take(root, true).catch((error) => error)
    expect(busy).toBeInstanceOf(CliProfile.Busy)
    expect(busy.owner).toEqual({ pid: process.ppid, nonce: "live", service: true })

    await fs.rm(lock, { recursive: true })
    const held = await CliProfile.take(root, false)
    await fs.writeFile(path.join(lock, "owner"), "foreign")
    await expect(held.release()).rejects.toThrow("PROFILE_OWNER_CHANGED")
    expect(await fs.readFile(path.join(lock, "owner"), "utf8")).toBe("foreign")
  })
})

function service(env: NodeJS.ProcessEnv) {
  return {
    LOGINOM_AI_AGENT_CLI_ROOT: env.LOGINOM_AI_AGENT_CLI_ROOT,
    LOGINOM_AI_AGENT_SERVICE_IDENTITY: env.LOGINOM_AI_AGENT_SERVICE_IDENTITY,
    LOGINOM_AI_AGENT_SERVICE_PORT: env.LOGINOM_AI_AGENT_SERVICE_PORT,
  }
}

async function owner(root: string) {
  return JSON.parse(await fs.readFile(path.join(root, ".writer", "owner"), "utf8"))
}
