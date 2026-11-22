import { NodeFileSystem } from "@effect/platform-node"
import { Service, type Info } from "@opencode/client/effect/service"
import { expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { readdirSync, statSync } from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { ServiceConfig } from "../src/services/service-config"
import { transpilerCache } from "./fixture/environment"

// Fork seam U5 (catalog CAT-13): every product and profile runs its own background service, found only through its own
// registration file and bound to the port its launcher states. Two services side by side must never adopt or block
// each other, whether their profiles have separate directories or share them (spike S5).
const cli = path.join(import.meta.dir, "..")
const desktop = "loginom-ai-agent-desktop"
const profile = "loginom-ai-agent-cli-work"

test("a service identity names its own registration file and an explicit port on every platform", () => {
  const work = ServiceConfig.identity({
    LOGINOM_AI_AGENT_SERVICE_IDENTITY: "loginom-ai-agent/cli work",
    LOGINOM_AI_AGENT_SERVICE_PORT: "23456",
  })
  expect(work).toEqual({ name: "loginom-ai-agent-cli-work", port: 23456 })
  expect(ServiceConfig.filename("latest", work)).toBe("service-loginom-ai-agent-cli-work.json")
  expect(ServiceConfig.filename("local", work)).toBe("service-loginom-ai-agent-cli-work.json")
  expect(ServiceConfig.legacyFilename("preview-a", work)).toBeUndefined()
  // Windows folds ports from 0x8000 into one 4096-port block; a stated port is used as given on both systems.
  expect(ServiceConfig.defaultPort("latest", "win32", work)).toBe(23456)
  expect(ServiceConfig.defaultPort("latest", "linux", work)).toBe(23456)
  expect(ServiceConfig.defaultPort("latest", "win32", { name: "a", port: 0xc0de })).toBe(0xc0de)

  const unported = ServiceConfig.identity({
    LOGINOM_AI_AGENT_SERVICE_IDENTITY: "a",
    LOGINOM_AI_AGENT_SERVICE_PORT: "x",
  })
  expect(unported).toEqual({ name: "a", port: undefined })
  expect(ServiceConfig.defaultPort("latest", "linux", unported)).toBe(0xc0de)
  expect(ServiceConfig.identity({ LOGINOM_AI_AGENT_SERVICE_PORT: "23456" })).toBeUndefined()
  expect(ServiceConfig.identity({ LOGINOM_AI_AGENT_SERVICE_IDENTITY: "" })).toBeUndefined()
  expect(ServiceConfig.filename("latest", undefined)).toBe("service.json")
})

// An installed build migrates the stable `service.json` and a preview channel's hashed files into its own registration.
// Under an identity those files belong to another product or profile, so copying them would adopt its service.
test.each(["latest", "preview-a"])(
  "an identity on channel %s never takes over another service's files",
  async (channel) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "loginom-service-identity-migration-"))
    const state = path.join(root, "state", "loginom-ai-agent")
    const config = path.join(root, "config", "loginom-ai-agent")
    const hashed = ServiceConfig.legacyFilename(channel, undefined)
    const other = { id: "other", version: "local", url: "http://127.0.0.1:1", pid: 1, password: "other" }
    try {
      await fs.mkdir(state, { recursive: true })
      await fs.mkdir(config, { recursive: true })
      await fs.writeFile(path.join(state, "service.json"), JSON.stringify(other))
      if (hashed) await fs.writeFile(path.join(state, hashed), JSON.stringify(other))
      if (hashed) await fs.writeFile(path.join(config, hashed), JSON.stringify({ port: 4321, password: "other" }))

      const own = await options(root, channel, { LOGINOM_AI_AGENT_SERVICE_IDENTITY: desktop })
      expect(own).toBe(path.join(state, `service-${desktop}.json`))
      expect(await fs.readdir(state)).not.toContain(`service-${desktop}.json`)
      expect(await fs.readdir(config)).not.toContain(`service-${desktop}.json`)

      // Without an identity the same files are migrated, so the case above really exercises the migration.
      if (channel === "latest") return
      const shared = await options(root, channel, {})
      expect(await Bun.file(shared).json()).toEqual(other)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  },
)

// Each of the next two tests boots two real services from source, a cold CLI start each.
test("two products with separate directories run their own services side by side", async () => {
  const roots = await Promise.all([desktop, profile].map((name) => fs.mkdtemp(path.join(os.tmpdir(), `${name}-`))))
  const ports = await availablePorts()
  const services = [start(roots[0], desktop, ports[0]), start(roots[1], profile, ports[1])]
  try {
    const infos = await Promise.all(services.map((service) => waitForInfo(service.registration)))
    await expectOwnServices(services, infos)
    for (const root of roots) {
      expect(await fs.readdir(path.join(root, "state", "loginom-ai-agent"))).not.toContain("service.json")
      // Data, config, logs, state, cache and tmp all live in the product's directories, none in OpenCode's.
      expect(openCodeDirectories(root)).toEqual([])
      for (const base of ["data", "config", "state", "cache", "tmp"])
        expect(await fs.readdir(path.join(root, base))).toContain("loginom-ai-agent")
      expect(statSync(path.join(root, "data", "loginom-ai-agent", "log")).isDirectory()).toBe(true)
    }
  } finally {
    await stop(services)
    await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })))
  }
}, 60_000)

test("two profiles that share directories run their own services side by side", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "loginom-service-identity-shared-"))
  const ports = await availablePorts()
  const services = [start(root, desktop, ports[0]), start(root, profile, ports[1])]
  try {
    const infos = await Promise.all(services.map((service) => waitForInfo(service.registration)))
    await expectOwnServices(services, infos)
    const files = await fs.readdir(path.join(root, "state", "loginom-ai-agent"))
    expect(files.filter((name) => name.endsWith(".json")).toSorted()).toEqual(
      [`service-${desktop}.json`, `service-${profile}.json`].toSorted(),
    )
  } finally {
    await stop(services)
    await fs.rm(root, { recursive: true, force: true })
  }
}, 60_000)

async function expectOwnServices(services: Awaited<ReturnType<typeof start>>[], infos: Info[]) {
  expect(infos.map((info) => new URL(info.url).port)).toEqual(services.map((service) => String(service.port)))
  expect(new Set(infos.map((info) => info.pid)).size).toBe(2)
  expect(services.map((service) => service.child.exitCode)).toEqual([null, null])
  for (const [index, service] of services.entries()) {
    const info = infos[index]
    expect(info.pid).toBe(service.child.pid)
    const answer = await fetch(new URL("/api/info", info.url), {
      headers: { authorization: "Basic " + btoa(`opencode:${info.password}`) },
    }).then((response) => response.json())
    expect(answer).toMatchObject({ pid: service.child.pid })
    // The service password sits in the service's config file and its registration; only the user may read either.
    // Windows has no POSIX modes there: the profile directory's ACL applies.
    expect((await Bun.file(service.config).json()).password).toBe(info.password)
    if (process.platform !== "win32")
      for (const file of [service.config, service.registration]) expect(statSync(file).mode & 0o777).toBe(0o600)
  }
}

function start(root: string, identity: string, port: number) {
  const child = Bun.spawn([process.execPath, path.join(cli, "src/index.ts"), "serve", "--service"], {
    env: {
      ...process.env,
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: transpilerCache,
      HOME: root,
      // os.homedir() on Windows follows USERPROFILE, not HOME.
      USERPROFILE: root,
      TMPDIR: path.join(root, "tmp"),
      TEMP: path.join(root, "tmp"),
      XDG_CACHE_HOME: path.join(root, "cache"),
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_DATA_HOME: path.join(root, "data"),
      XDG_STATE_HOME: path.join(root, "state"),
      LOGINOM_AI_AGENT_CONFIG_DIR: undefined,
      LOGINOM_AI_AGENT_DB: undefined,
      LOGINOM_AI_AGENT_TEST_HOME: undefined,
      LOGINOM_AI_AGENT_DISABLE_MODELS_FETCH: "true",
      LOGINOM_AI_AGENT_SERVICE_IDENTITY: identity,
      LOGINOM_AI_AGENT_SERVICE_PORT: String(port),
    },
    stderr: "pipe",
    stdout: "ignore",
  })
  return {
    child,
    port,
    registration: path.join(root, "state", "loginom-ai-agent", `service-${identity}.json`),
    config: path.join(root, "config", "loginom-ai-agent", `service-${identity}.json`),
  }
}

async function stop(services: Awaited<ReturnType<typeof start>>[]) {
  await Promise.all(
    services.map((service) =>
      Effect.runPromise(Service.stop({ file: service.registration }).pipe(Effect.provide(NodeFileSystem.layer))).catch(
        () => undefined,
      ),
    ),
  )
  services.forEach((service) => service.child.kill("SIGTERM"))
  await Promise.all(services.map((service) => service.child.exited))
}

// Runs ServiceConfig.options() the way a build of `channel` would: the channel is a build-time constant.
async function options(root: string, channel: string, env: Record<string, string>) {
  const script = `
    import { NodeFileSystem } from "@effect/platform-node"
    import { Effect } from "effect"
    import { Global } from "@opencode/util/global"
    import { ServiceConfig } from "./src/services/service-config"
    const options = await Effect.runPromise(
      ServiceConfig.options().pipe(Effect.provide(Global.layerWith({})), Effect.provide(NodeFileSystem.layer)),
    )
    console.log(options.file)
  `
  // The trailing argument stands in for the CLI entrypoint that options() puts into the service command.
  const define = `LOGINOM_AI_AGENT_CHANNEL=${JSON.stringify(channel)}`
  const child = Bun.spawn([process.execPath, "--define", define, "-e", script, path.join(cli, "src/index.ts")], {
    cwd: cli,
    env: {
      ...process.env,
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: transpilerCache,
      HOME: root,
      USERPROFILE: root,
      TMPDIR: path.join(root, "tmp"),
      TEMP: path.join(root, "tmp"),
      XDG_CACHE_HOME: path.join(root, "cache"),
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_DATA_HOME: path.join(root, "data"),
      XDG_STATE_HOME: path.join(root, "state"),
      LOGINOM_AI_AGENT_CONFIG_DIR: undefined,
      LOGINOM_AI_AGENT_SERVICE_IDENTITY: undefined,
      LOGINOM_AI_AGENT_SERVICE_PORT: undefined,
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
  return stdout.trim()
}

function openCodeDirectories(root: string) {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isDirectory() && (entry.name === "opencode" || entry.name === ".loginom-ai-agent"))
    .map((entry) => path.join(entry.parentPath, entry.name))
}

async function waitForInfo(file: string) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const value = await Bun.file(file)
      .json()
      .catch(() => undefined)
    if (value !== undefined) return Schema.decodeUnknownPromise(Service.Info)(value)
    await Bun.sleep(50)
  }
  throw new Error(`Timed out waiting for service registration ${file}`)
}

// Both ports are held at once, so the second cannot be the first one just released.
async function availablePorts() {
  const servers = [0, 1].map(() => Bun.serve({ port: 0, fetch: () => new Response() }))
  const ports = servers.map((server) => server.port)
  await Promise.all(servers.map((server) => server.stop(true)))
  return ports.map((port) => {
    if (port === undefined) throw new Error("Server did not bind a port")
    return port
  })
}
