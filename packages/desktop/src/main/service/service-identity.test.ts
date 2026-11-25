import { Service } from "@opencode/client/service"
import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

// Contract (U5, catalog CAT-13, decision В-97 п. 7): Desktop's service has the identity `desktop` and a constant port for
// each channel. Desktop finds it at `<state>/<productSlug(channel)>/service-desktop.json`, the file the CLI of the same
// channel writes under that identity, and hands the service the identity, the port and the application version. The
// module reads its build constant, so each case runs in a fresh process; without a build constant the channel is dev.
const version = "2.3.0-test"

const cli = path.resolve(import.meta.dir, "../../../../cli")

// The client tests' service: `soft` registers itself, records a stop request in `<file>.soft-stop` and a signal in
// `<file>.signal`, and exits on either.
const fixture = path.resolve(import.meta.dir, "../../../../client/test/fixture/service.ts")

const cleanup: Array<() => Promise<unknown>> = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((run) => run()))
})

describe("service-identity", () => {
  // The Desktop build sets its channel to prod, beta or dev and bundles the CLI built for the same release, whose stable
  // channel is `latest`. The development window (`script/dev.ts`, channel local) runs the CLI from source.
  test("each channel has its own port, and the CLI under Desktop's environment uses Desktop's file and port", async () => {
    const root = await temporary("desktop-service-channel-")

    const channels = [
      { desktop: "prod", cli: "latest", port: 28288, directory: "loginom-ai-agent" },
      { desktop: "beta", cli: "beta", port: 28289, directory: "loginom-ai-agent-beta" },
      { desktop: "dev", cli: "dev", port: 28290, directory: "loginom-ai-agent-dev" },
      { desktop: "local", cli: undefined, port: 28290, directory: "loginom-ai-agent-dev" },
    ]

    const found = await Promise.all(
      channels.map(async (channel) => {
        const own = await desktop({
          LOGINOM_AI_AGENT_CHANNEL: channel.desktop,
          XDG_STATE_HOME: path.join(root, "state"),
        })

        return { own, cli: await cliService(root, channel.cli, own.env) }
      }),
    )

    expect(found).toEqual(
      channels.map((channel) => {
        const file = path.join(root, "state", channel.directory, "service-desktop.json")

        return {
          own: expect.objectContaining({
            file,
            env: {
              LOGINOM_AI_AGENT_SERVICE_IDENTITY: "desktop",
              LOGINOM_AI_AGENT_SERVICE_PORT: String(channel.port),
              LOGINOM_AI_AGENT_RESOURCE_VERSION: version,
            },
          }),
          // The stated port is used as given on every platform, without the Windows fold into 0x7000-0x7fff.
          cli: expect.objectContaining({ file, port: channel.port, win32: channel.port }),
        }
      }),
    )
    // Below 0x7000 and outside the CLI profiles' 0x6000-0x6bff (B2.7c).
    expect(channels.every((channel) => channel.port < 0x7000 && channel.port > 0x6bff)).toBe(true)
  })

  test("finds only its own channel's service, never another live registration with the same version", async () => {
    const root = await temporary("desktop-service-foreign-")
    const directories = ["loginom-ai-agent", "loginom-ai-agent-beta", "loginom-ai-agent-dev"]

    const foreign = [
      // OpenCode on the same machine, a product service without an identity, a CLI profile's service.
      path.join("opencode", "service.json"),
      ...directories.flatMap((directory) => [
        path.join(directory, "service.json"),
        path.join(directory, "service-cli-0123abcd.json"),
      ]),
    ]

    const own = directories.map((directory) => path.join(directory, "service-desktop.json"))
    const services = new Map([...foreign, ...own].map((file, index) => [file, fakeService(1000 + index)]))
    await Promise.all(
      [...services].map(async ([file, service]) => {
        await fs.mkdir(path.join(root, path.dirname(file)), { recursive: true })
        await fs.writeFile(path.join(root, file), JSON.stringify(service))
      }),
    )

    const files = await Promise.all(
      ["prod", "beta", "dev"].map(
        async (channel) => (await desktop({ LOGINOM_AI_AGENT_CHANNEL: channel, XDG_STATE_HOME: root })).file,
      ),
    )

    const discover = () => Promise.all(files.map(async (file) => (await Service.discover({ version, file }))?.url))

    // Every planted registration answers with a matching version: whatever file a channel looked at, it would adopt.
    expect(await discover()).toEqual(own.map((file) => services.get(file)?.url))

    await Promise.all(own.map((file) => fs.rm(path.join(root, file))))
    expect(await discover()).toEqual([undefined, undefined, undefined])
  })

  // B4.10, decision В-87: the app stops its own service when it quits, with the stop request of B2.3b, which is the only
  // way the service closes its plugins and Loginom runtimes on Windows. Every other registration and process stays.
  test("a quit stops only its own channel's service, by request and not by signal", async () => {
    const root = await temporary("desktop-service-stop-")

    const files = [
      path.join("loginom-ai-agent-dev", "service-desktop.json"),
      path.join("opencode", "service.json"),
      // The client's `fallback()`, used when a caller names no file.
      path.join("loginom-ai-agent", "service.json"),
      path.join("loginom-ai-agent-dev", "service.json"),
      path.join("loginom-ai-agent-dev", "service-cli-0123abcd.json"),
      path.join("loginom-ai-agent", "service-desktop.json"),
      path.join("loginom-ai-agent-beta", "service-desktop.json"),
    ].map((file) => path.join(root, file))

    const services = await Promise.all(files.map((file) => liveService(file)))
    const registrations = await Promise.all(files.map((file) => fs.readFile(file, "utf8")))

    await desktop({ LOGINOM_AI_AGENT_CHANNEL: "dev", XDG_STATE_HOME: root }, true)

    // `stopService` returns once the pid is gone, but on Windows this process may record the exit a moment later.
    const exit = (service: (typeof services)[number], wait: number) =>
      Promise.race([
        service.exited.then((code) => ({ code, signal: service.signalCode })),
        Bun.sleep(wait).then(() => "running"),
      ])

    const [own, ...foreign] = await Promise.all(
      services.map(async (service, index) => ({
        exit: await exit(service, index === 0 ? 10_000 : 0),
        stopRequest: await Bun.file(files[index] + ".soft-stop").exists(),
        signal: await Bun.file(files[index] + ".signal").exists(),
        registration: await fs.readFile(files[index], "utf8").catch(() => undefined),
      })),
    )

    expect(own).toEqual({ exit: { code: 0, signal: null }, stopRequest: true, signal: false, registration: undefined })
    expect(foreign).toEqual(
      registrations
        .slice(1)
        .map((registration) => ({ exit: "running", stopRequest: false, signal: false, registration })),
    )
  })

  // A window started from a CLI profile's terminal or tool inherits what the profile's entry set for its processes
  // (`cli/src/profile.ts`, `cli/src/standalone.ts`). The client starts the service with `{ ...process.env, ...env }`.
  test("a window started from a CLI profile gives its service Desktop's own directories and database", async () => {
    const root = await temporary("desktop-service-profile-")
    const profile = path.join(root, "profile")
    const window = { LOGINOM_AI_AGENT_CHANNEL: "dev", XDG_STATE_HOME: path.join(root, "state") }

    const sides = await Promise.all([
      desktop(window),
      desktop({
        ...window,
        LOGINOM_AI_AGENT_CLI_ROOT: profile,
        LOGINOM_AI_AGENT_CONFIG_DIR: path.join(profile, "config"),
        LOGINOM_AI_AGENT_DB: path.join(profile, "data", "loginom-ai-agent.db"),
        LOGINOM_AI_AGENT_SERVICE_IDENTITY: "cli-0123abcd",
        LOGINOM_AI_AGENT_SERVICE_PORT: "24600",
        LOGINOM_AI_AGENT_HEADLESS: "1",
        LOGINOM_AI_AGENT_RUN_COMMAND: "loginom-automation",
      }),
    ])

    const services = sides.map((side) => ({ ...side.inherited, ...side.env }))
    const [own, inherited] = await Promise.all(services.map((env) => cliService(root, "dev", env)))

    expect(services[1]).toEqual(services[0])
    expect(inherited).toEqual(own)
    expect(own).toMatchObject({
      file: path.join(root, "state", "loginom-ai-agent-dev", "service-desktop.json"),
      data: path.join(root, "data", "loginom-ai-agent-dev"),
      config: path.join(root, "config", "loginom-ai-agent-dev"),
      database: path.join(root, "data", "loginom-ai-agent-dev", "loginom-ai-agent.db"),
    })
  })
})

// B4.16, decision В-97 п. 3: the service follows its window. The service side (`cli/test/service-owner.test.ts`) stops once
// the pid in the owner file is gone for a minute; the window side writes that file, hands its path to the service and
// does not hand the window's descriptors on.
describe("service owner", () => {
  test("the owner file sits beside the registration, holds the window's pid and passes to the next window", async () => {
    const root = await temporary("desktop-service-owner-")
    const window = { LOGINOM_AI_AGENT_CHANNEL: "dev", XDG_STATE_HOME: root }
    const file = path.join(root, "loginom-ai-agent-dev", "service-desktop.owner")

    const first = await claim(window)
    expect(first.environment).toEqual({ LOGINOM_AI_AGENT_SERVICE_OWNER: file })
    expect(first.file).toBe(file)
    expect(await fs.readFile(file, "utf8")).toBe(String(first.pid))

    // A window that returns after a crash takes the service over, and leaves no temporary file behind.
    const next = await claim(window)
    expect(next.pid).not.toBe(first.pid)
    expect(await fs.readFile(file, "utf8")).toBe(String(next.pid))
    expect(await fs.readdir(path.dirname(file))).toEqual(["service-desktop.owner"])
  })

  test("a quit takes its claim back, and leaves the owner of every other service", async () => {
    const root = await temporary("desktop-service-owner-quit-")
    const own = path.join(root, "loginom-ai-agent-dev", "service-desktop.owner")

    const foreign = [
      path.join(root, "loginom-ai-agent", "service-desktop.owner"),
      path.join(root, "loginom-ai-agent-dev", "service-cli-0123abcd.owner"),
    ]

    await Promise.all(
      [own, ...foreign].map((file) => fs.mkdir(path.dirname(file), { recursive: true }).then(() => fs.writeFile(file, "1"))),
    )
    await desktop({ LOGINOM_AI_AGENT_CHANNEL: "dev", XDG_STATE_HOME: root }, true)

    expect(await Bun.file(own).exists()).toBe(false)
    expect(await Promise.all(foreign.map((file) => Bun.file(file).exists()))).toEqual([true, true])
  })

  // The next start of the app finds a service its window left and that does not answer, and removes it by the pid in
  // its registration. A service of the same channel's CLI profile or of another channel stays.
  test("the next start replaces an orphan that does not answer, and leaves foreign services alone", async () => {
    const root = await temporary("desktop-service-orphan-")
    const own = path.join(root, "loginom-ai-agent-dev", "service-desktop.json")

    const foreign = [
      path.join(root, "loginom-ai-agent-dev", "service-cli-0123abcd.json"),
      path.join(root, "loginom-ai-agent-beta", "service-desktop.json"),
    ]

    const orphan = await liveService(own, "hanging")
    const others = await Promise.all(foreign.map((file) => liveService(file)))

    // The contender fails at once; only what ensure did to the orphan matters here.
    await Service.ensure({ file: own, command: [process.execPath, fixture, own + ".contender", "failed"] }).catch(
      () => undefined,
    )

    expect(await Promise.race([orphan.exited.then(() => "gone"), Bun.sleep(5_000).then(() => "running")])).toBe("gone")
    expect(others.map((service) => service.exitCode)).toEqual([null, null])
  }, 60_000)

  test.skipIf(process.platform !== "linux")("the service gets no descriptor of the window but its stderr", async () => {
    const { withoutWindowDescriptors } = await import("./service-identity")

    // Bash stands for Electron: what it opens without close-on-exec passes to every child, as Chromium's sockets do.
    const descriptors = async (wrap: boolean) => {
      const command = ["sleep", "30"]

      const child = Bun.spawn(
        [
          "/bin/bash",
          "-c",
          'exec 7>/dev/null 8</dev/null 9>/dev/null; exec "$@"',
          "bash",
          ...(wrap ? withoutWindowDescriptors(command) : command),
        ],
        { stdin: "ignore", stdout: "ignore", stderr: "pipe" },
      )

      cleanup.push(async () => {
        child.kill("SIGKILL")
        await child.exited
      })

      // `exec` replaces the process, so the pid is the service's; wait until it is `sleep`.
      const deadline = Date.now() + 5_000

      while (!(await fs.readFile(`/proc/${child.pid}/cmdline`, "utf8").catch(() => "")).startsWith("sleep")) {
        if (Date.now() > deadline) throw new Error("the wrapped command did not start")
        await Bun.sleep(10)
      }

      return (await fs.readdir(`/proc/${child.pid}/fd`)).map(Number).sort((a, b) => a - b)
    }

    // Without the wrapper the three descriptors pass on; with it only stdin, stdout and stderr remain.
    expect(await descriptors(false)).toEqual([0, 1, 2, 7, 8, 9])
    expect(await descriptors(true)).toEqual([0, 1, 2])
  })

  test("other systems start the command as it is", async () => {
    const { withoutWindowDescriptors } = await import("./service-identity")

    expect(withoutWindowDescriptors(["cli", "serve"], "win32")).toEqual(["cli", "serve"])
    expect(withoutWindowDescriptors(["cli", "serve"], "darwin")).toEqual(["cli", "serve"])
  })
})

// Claims the service in a fresh process, as a window does, and reports what it wrote.
async function claim(env: Record<string, string>) {
  const script = `
    const { claimService, ownerEnvironment, ownerFile } = await import("./service-identity")
    await claimService()
    console.log(JSON.stringify({ pid: process.pid, file: ownerFile(), environment: ownerEnvironment() }))
  `

  const home = await temporary("desktop-service-owner-home-")

  const stdout = await output([process.execPath, "-e", script], import.meta.dir, {
    PATH: process.env.PATH,
    HOME: home,
    USERPROFILE: home,
    ...env,
  })

  // SAFETY: the script above prints exactly this shape.
  return JSON.parse(stdout) as { pid: number; file: string; environment: Record<string, string> }
}

async function temporary(prefix: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  cleanup.push(() => fs.rm(root, { recursive: true, force: true }))

  return root
}

async function desktop(env: Record<string, string>, quit = false) {
  const home = await temporary("desktop-service-identity-home-")

  // `inherited`: this product's variables the window keeps once the module is loaded, which the service inherits.
  // `quit`: the window first stops its service, as the app does when it quits.
  const script = `
    const { serviceEnvironment, serviceFile, stopService } = await import("./service-identity")
    if (${quit}) await stopService()
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.startsWith("LOGINOM_AI_AGENT_")))
    console.log(JSON.stringify({ file: serviceFile(), env: serviceEnvironment(${JSON.stringify(version)}), inherited }))
  `

  const stdout = await output([process.execPath, "-e", script], import.meta.dir, {
    PATH: process.env.PATH,
    HOME: home,
    USERPROFILE: home,
    ...env,
  })

  // SAFETY: the script above prints exactly this shape.
  return JSON.parse(stdout) as { file: string; env: Record<string, string>; inherited: Record<string, string> }
}

// The registration file `ServiceConfig.options()` hands the client, the port `serve --service` listens on, and the
// directories and database of the service, in a CLI built for `channel`: the channel is a build-time constant there,
// undefined when the CLI runs from source. `config` is the service's configuration directory as `server-process.ts`
// takes it.
async function cliService(root: string, channel: string | undefined, env: Record<string, string>) {
  const script = `
    import { NodeFileSystem } from "@effect/platform-node"
    import { Effect } from "effect"
    import { Global } from "@opencode/util/global"
    import { databasePath } from "./src/database-path"
    import { ServiceConfig } from "./src/services/service-config"
    const options = await Effect.runPromise(
      ServiceConfig.options().pipe(Effect.provide(Global.layerWith({})), Effect.provide(NodeFileSystem.layer)),
    )
    console.log(JSON.stringify({
      file: options.file,
      port: ServiceConfig.defaultPort(undefined, "linux"),
      win32: ServiceConfig.defaultPort(undefined, "win32"),
      data: Global.Path.data,
      config: process.env.LOGINOM_AI_AGENT_CONFIG_DIR ?? Global.Path.config,
      database: databasePath(Global.Path.data),
    }))
  `

  // The trailing argument stands in for the CLI entrypoint that options() puts into the service command.
  const stdout = await output(
    [
      process.execPath,
      ...(channel === undefined ? [] : ["--define", `LOGINOM_AI_AGENT_CHANNEL=${JSON.stringify(channel)}`]),
      "-e",
      script,
      path.join(cli, "src/index.ts"),
    ],
    cli,
    {
      ...process.env,
      ...isolated(root),
      LOGINOM_AI_AGENT_CLI_ROOT: undefined,
      LOGINOM_AI_AGENT_CONFIG_DIR: undefined,
      LOGINOM_AI_AGENT_DB: undefined,
      ...env,
    },
  )

  return JSON.parse(stdout)
}

// A CLI process whose directories all live under `root`.
function isolated(root: string) {
  return {
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
  }
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

async function liveService(file: string, mode = "soft") {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const service = Bun.spawn([process.execPath, fixture, file, mode], { stdout: "ignore", stderr: "ignore" })

  cleanup.push(async () => {
    service.kill("SIGKILL")
    await service.exited
  })

  const deadline = Date.now() + 10_000

  while (!(await Bun.file(file).exists())) {
    if (service.exitCode !== null || Date.now() > deadline) throw new Error(`The service for ${file} did not register`)
    await Bun.sleep(10)
  }

  return service
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
