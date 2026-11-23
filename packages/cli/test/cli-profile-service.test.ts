import { NodeFileSystem } from "@effect/platform-node"
import { Service, type Info } from "@opencode/client/effect/service"
import { afterAll, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { CliProfile } from "../src/profile"
import { isolatedEnv } from "./fixture/environment"

// Each profile of the product CLI runs its own service next to Desktop's (B2.7c, G2): its own port, registration file
// and data, even when the CLI inherits everything from a Desktop terminal. One server writes a profile at a time. The
// services are real processes from source; the profile ports are pinned in each profile's service config, because the
// derived ones are fixed per root (their numbers are covered in packages/product/test/cli-profile.test.ts).
const cli = path.join(import.meta.dir, "..")
const roots: string[] = []

afterAll(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })))
})

// Boots Desktop's service, two CLI clients and their services, each a cold start.
test("Desktop and two CLI profiles run their own services at once and see only their own sessions", async () => {
  const root = await temporary()
  const ports = await availablePorts(3)
  const project = path.join(root, "project")
  await fs.mkdir(project)
  // Desktop's service: the channel directories, identity `desktop` and its port (B4.9 sets them in Desktop).
  const terminal = isolatedEnv(root, {
    LOGINOM_AI_AGENT_SERVICE_IDENTITY: "desktop",
    LOGINOM_AI_AGENT_SERVICE_PORT: String(ports[0]),
  })
  const desktop = {
    registration: path.join(root, "state", "loginom-ai-agent-dev", "service-desktop.json"),
    child: Bun.spawn([process.execPath, path.join(cli, "src/index.ts"), "serve", "--service"], {
      cwd: cli,
      env: terminal,
      stdout: "ignore",
      stderr: "pipe",
    }),
  }
  // The CLI runs in a terminal of Desktop and inherits its service's identity, port, config directory and database.
  const profiles = await Promise.all(
    ["a", "b"].map((name, index) =>
      profile({ ...terminal, LOGINOM_AI_AGENT_CLI_PROFILE: path.join(root, name) }, ports[index + 1]),
    ),
  )
  try {
    const started = await Promise.all(profiles.map((item) => run(["service", "start"], item.env)))
    expect(started).toEqual(
      ports.slice(1).map((port) => ({ code: 0, stdout: `http://127.0.0.1:${port}\n`, stderr: "" })),
    )
    const services = [desktop, ...profiles]
    const infos = await Promise.all(services.map((service) => registered(service.registration)))
    expect(infos.map((info) => new URL(info.url).port)).toEqual(ports.map(String))
    expect(new Set(infos.map((info) => info.pid)).size).toBe(3)
    expect(desktop.child.exitCode).toBeNull()
    // Desktop's directory holds only its own registration; each profile registers in its own state directory.
    expect(await fs.readdir(path.join(root, "state", "loginom-ai-agent-dev"))).toEqual(["service-desktop.json"])
    expect(profiles.map((item) => path.dirname(item.registration))).toEqual(
      profiles.map((item) => path.join(item.root, "state")),
    )

    const created = await Promise.all(
      infos.map(
        async (info) =>
          (await call(info, project, "POST", "/api/session", { location: { directory: project } })).data.id as string,
      ),
    )
    const listed = await Promise.all(
      infos.map(async (info) =>
        ((await call(info, project, "GET", "/api/session")).data as { id: string }[]).map((session) => session.id),
      ),
    )
    expect(listed).toEqual(created.map((id) => [id]))
    for (const item of profiles) expect(await fs.readdir(path.join(item.root, "data"))).toContain("loginom-ai-agent.db")
  } finally {
    await Promise.all([desktop, ...profiles].map((service) => stop(service.registration)))
    desktop.child.kill("SIGTERM")
    await desktop.child.exited
  }
}, 90_000)

// Boots four CLI clients, one refused server and two services.
test("one server writes a profile: concurrent starts share it, a second server is refused, a killed one is replaced", async () => {
  const root = await temporary()
  const [port] = await availablePorts(1)
  const item = await profile(isolatedEnv(root, { LOGINOM_AI_AGENT_CLI_PROFILE: path.join(root, "profile") }), port)
  try {
    const started = await Promise.all([run(["service", "start"], item.env), run(["service", "start"], item.env)])
    expect(started).toEqual([0, 1].map(() => ({ code: 0, stdout: `http://127.0.0.1:${port}\n`, stderr: "" })))
    const first = await registered(item.registration)
    expect(await owner(item.root)).toMatchObject({ pid: first.pid, service: true })

    // A private server, as `--standalone` starts one, would open the same database and Host.
    const second = await run(["serve", "--port", "0"], item.env)
    expect(second.code).toBe(1)
    expect(second.stderr).toContain(`PROFILE_BUSY: the CLI profile ${item.root} is open in another process`)
    expect(await owner(item.root)).toMatchObject({ pid: first.pid })

    // SIGKILL runs no finalizer: the latch stays with a dead owner, and the next start takes it over.
    process.kill(first.pid, "SIGKILL")
    await until(async () => !alive(first.pid))
    expect(await owner(item.root)).toMatchObject({ pid: first.pid })
    expect(await run(["service", "start"], item.env)).toEqual(started[0])
    const next = await registered(item.registration)
    expect(next.pid).not.toBe(first.pid)
    expect(await owner(item.root)).toMatchObject({ pid: next.pid, service: true })

    await stop(item.registration)
    await until(async () => !(await fs.readdir(item.root)).includes(".writer"))
  } finally {
    await stop(item.registration)
  }
}, 90_000)

async function temporary() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "loginom-cli-profile-service-")))
  roots.push(root)
  return root
}

// Opens the profile as the product CLI entry does and pins its service port in the profile's service config.
async function profile(env: NodeJS.ProcessEnv, port: number) {
  const applied = { ...env }
  const paths = CliProfile.apply(applied)
  const name = `service-${applied.LOGINOM_AI_AGENT_SERVICE_IDENTITY}.json`
  await fs.writeFile(path.join(paths.config, name), JSON.stringify({ port }), { mode: 0o600 })
  return { env, root: paths.root, registration: path.join(paths.state, name) }
}

async function run(args: string[], env: NodeJS.ProcessEnv) {
  // The CLI entry needs the preload from this package's bunfig.toml.
  const child = Bun.spawn([process.execPath, path.join(cli, "src/loginom-cli.ts"), ...args], {
    cwd: cli,
    env,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { code, stdout, stderr }
}

async function call(info: Info, directory: string, method: string, route: string, body?: unknown) {
  const response = await fetch(new URL(route, info.url), {
    method,
    headers: {
      authorization: `Basic ${btoa(`opencode:${info.password}`)}`,
      "content-type": "application/json",
      "x-opencode-directory": encodeURIComponent(directory),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${await response.text()}`)
  return response.json()
}

async function stop(registration: string) {
  await Effect.runPromise(Service.stop({ file: registration }).pipe(Effect.provide(NodeFileSystem.layer))).catch(
    () => undefined,
  )
}

async function registered(file: string) {
  return until(async () => {
    const value = await Bun.file(file)
      .json()
      .catch(() => undefined)
    return value === undefined ? undefined : Schema.decodeUnknownPromise(Service.Info)(value)
  })
}

async function owner(root: string) {
  return JSON.parse(await fs.readFile(path.join(root, ".writer", "owner"), "utf8"))
}

function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function until<A>(read: () => Promise<A | undefined | false>, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (true) {
    const value = await read()
    if (value !== undefined && value !== false) return value
    if (Date.now() >= deadline) throw new Error("Timed out waiting for condition")
    await Bun.sleep(50)
  }
}

// All ports are held at once, so none is one just released.
async function availablePorts(count: number) {
  const servers = Array.from({ length: count }, () => Bun.serve({ port: 0, fetch: () => new Response() }))
  const ports = servers.map((server) => server.port)
  await Promise.all(servers.map((server) => server.stop(true)))
  return ports.map((port) => {
    if (port === undefined) throw new Error("Server did not bind a port")
    return port
  })
}
