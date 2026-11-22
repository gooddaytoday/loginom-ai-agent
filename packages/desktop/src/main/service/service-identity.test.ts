import { Service } from "@opencode/client/service"
import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

// Contract (U5, catalog CAT-13): Desktop finds the background service through the registration file the CLI of the same
// product channel writes, `<state>/<productSlug(channel)>/service[-<identity>].json`, so the prod, beta and dev windows
// never meet each other's services and, under an identity, never adopt another product's or profile's `service.json`
// of the same version. serviceFile() reads its build constant and the environment, so each case runs in a fresh
// process; without a build constant (never in a build) the channel is dev.
const version = "2.3.0-test"
const cli = path.resolve(import.meta.dir, "../../../../cli")
const cleanup: Array<() => Promise<unknown>> = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((run) => run()))
})

describe("service-identity", () => {
  test.each([
    {
      env: { LOGINOM_AI_AGENT_SERVICE_IDENTITY: "loginom-ai-agent/desktop", XDG_STATE_HOME: "/state" },
      expected: path.join("/state", "loginom-ai-agent-dev", "service-loginom-ai-agent-desktop.json"),
    },
    {
      // An empty XDG_STATE_HOME falls back to the home directory, as the CLI's global roots do.
      env: { LOGINOM_AI_AGENT_SERVICE_IDENTITY: "loginom-ai-agent-desktop", XDG_STATE_HOME: "" },
      expected: path.join("<home>", ".local", "state", "loginom-ai-agent-dev", "service-loginom-ai-agent-desktop.json"),
    },
    { env: { XDG_STATE_HOME: "/state" }, expected: path.join("/state", "loginom-ai-agent-dev", "service.json") },
    {
      env: { LOGINOM_AI_AGENT_SERVICE_IDENTITY: "", XDG_STATE_HOME: "/state" },
      expected: path.join("/state", "loginom-ai-agent-dev", "service.json"),
    },
  ])("serviceFile() with $env", async (input) => {
    expect(await serviceFile(input.env)).toBe(input.expected)
  })

  // The Desktop build sets its channel to prod, beta or dev and bundles the CLI built for the same release, whose
  // stable channel is `latest`. The development window (dev) runs the CLI from source, whose channel is local.
  test("the service and the window use one registration file for each channel", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "desktop-service-channel-"))
    cleanup.push(() => fs.rm(root, { recursive: true, force: true }))
    const identity = { LOGINOM_AI_AGENT_SERVICE_IDENTITY: "loginom-ai-agent-desktop" }

    const channels = [
      { desktop: { OPENCODE_CHANNEL: "prod" }, cli: "latest", file: path.join("loginom-ai-agent", "service.json") },
      { desktop: { OPENCODE_CHANNEL: "beta" }, cli: "beta", file: path.join("loginom-ai-agent-beta", "service.json") },
      { desktop: { OPENCODE_CHANNEL: "dev" }, cli: "dev", file: path.join("loginom-ai-agent-dev", "service.json") },
      {
        desktop: { OPENCODE_CHANNEL: "dev", OPENCODE_DESKTOP_SERVER_CHANNEL: "local" },
        cli: undefined,
        file: path.join("loginom-ai-agent-dev", "service-local.json"),
      },
      {
        desktop: { OPENCODE_CHANNEL: "prod", ...identity },
        cli: "latest",
        env: identity,
        file: path.join("loginom-ai-agent", "service-loginom-ai-agent-desktop.json"),
      },
    ]

    const found = await Promise.all(
      channels.map((channel) =>
        Promise.all([
          serviceFile({ ...channel.desktop, XDG_STATE_HOME: path.join(root, "state") }),
          cliServiceFile(root, channel.cli, channel.env ?? {}),
        ]),
      ),
    )

    expect(found).toEqual(channels.map((channel) => Array(2).fill(path.join(root, "state", channel.file))))
  })

  test("finds its own service and never the service.json of another service with the same version", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "desktop-service-identity-"))
    cleanup.push(() => fs.rm(root, { recursive: true, force: true }))
    const own = await serviceFile({
      LOGINOM_AI_AGENT_SERVICE_IDENTITY: "loginom-ai-agent-desktop",
      XDG_STATE_HOME: root,
    })
    const other = fakeService(101)
    const mine = fakeService(202)
    const shared = path.join(root, "loginom-ai-agent-dev", "service.json")
    await fs.mkdir(path.dirname(shared), { recursive: true })
    await fs.writeFile(shared, JSON.stringify(other))

    // The default registration answers with a matching version: a probe without the identity file would adopt it.
    expect((await Service.discover({ version, file: shared }))?.url).toBe(other.url)
    expect(own).toBe(path.join(root, "loginom-ai-agent-dev", "service-loginom-ai-agent-desktop.json"))
    expect(await Service.discover({ version, file: own })).toBeUndefined()

    await fs.writeFile(own, JSON.stringify(mine))
    expect((await Service.discover({ version, file: own }))?.url).toBe(mine.url)
  })
})

async function serviceFile(env: Record<string, string>) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "desktop-service-identity-home-"))
  cleanup.push(() => fs.rm(home, { recursive: true, force: true }))

  return output(
    [process.execPath, "-e", 'const { serviceFile } = await import("./service-identity"); console.log(serviceFile())'],
    import.meta.dir,
    {
      PATH: process.env.PATH,
      HOME: home,
      USERPROFILE: home,
      LOGINOM_AI_AGENT_SERVICE_IDENTITY: undefined,
      XDG_STATE_HOME: undefined,
      ...env,
    },
  ).then((stdout) => stdout.replace(home, "<home>"))
}

// The registration file `ServiceConfig.options()` hands the client in a CLI built for `channel`: the channel is a
// build-time constant there, undefined when the CLI runs from source.
async function cliServiceFile(root: string, channel: string | undefined, env: Record<string, string>) {
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
  return output(
    [
      process.execPath,
      ...(channel === undefined ? [] : ["--define", `OPENCODE_CHANNEL=${JSON.stringify(channel)}`]),
      "-e",
      script,
      path.join(cli, "src/index.ts"),
    ],
    cli,
    {
      ...process.env,
      // The isolated XDG_CACHE_HOME would hold Bun's transpiler cache; share the CLI tests' cache instead.
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: path.join(os.tmpdir(), "opencode-test-transpiler-cache"),
      HOME: root,
      USERPROFILE: root,
      TMPDIR: path.join(root, "tmp"),
      TEMP: path.join(root, "tmp"),
      XDG_CACHE_HOME: path.join(root, "cache"),
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_DATA_HOME: path.join(root, "data"),
      XDG_STATE_HOME: path.join(root, "state"),
      OPENCODE_CONFIG_DIR: undefined,
      LOGINOM_AI_AGENT_SERVICE_IDENTITY: undefined,
      LOGINOM_AI_AGENT_SERVICE_PORT: undefined,
      ...env,
    },
  )
}

async function output(cmd: string[], cwd: string, env: Record<string, string | undefined>) {
  const child = Bun.spawn(cmd, { cwd, env, stdout: "pipe", stderr: "pipe" })

  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  expect({ code, stderr }).toEqual({ code: 0, stderr: "" })

  return stdout.trim()
}

function fakeService(pid: number) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) =>
      new URL(request.url).pathname === "/api/info"
        ? Response.json({ version, pid })
        : new Response("not found", { status: 404 }),
  })
  cleanup.push(() => server.stop(true))
  return { id: `service-${pid}`, version, url: server.url.origin, pid, password: `secret-${pid}` }
}
