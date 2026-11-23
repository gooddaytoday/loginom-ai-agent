import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { cliCredentials } from "@loginom-ai-agent/loginom-host/connection/cli-credentials"
import { connectionStore } from "@loginom-ai-agent/loginom-host/connection/connection-store"
import { credentials, type CredentialCodec } from "@loginom-ai-agent/loginom-host/connection/credentials"
import release from "../../../../product/loginom-release.json"
import { writeHelp } from "../../../../loginom-runtime/client/test/support/help-fixture.mjs"
import { resourceInventory } from "../../../../loginom-runtime/src/resource-inventory.mjs"
import { CredentialMigration } from "./credential-migration"

// Contract (B4.13, decision В-97 п. 4, SEC-01): before the service starts, Desktop moves the connection Desktop 0.4 saved
// in `<userData>/loginom/connection` with its safeStorage codec into `<data>/loginom/connection` of its service, where
// the service's Host reads it with `cliCredentials`: once, as a new generation, with the 0.4.0 marker, leaving the 0.4
// store as it was. A connection that cannot move leaves the service without one and names a code, never the secret.
// The 0.4 profiles are written by 0.4's own store and codec (`loginom-host/src/connection`, unchanged since v0.4.0). The
// service's data directory comes from the environment, as the service's does, so each case sets XDG_DATA_HOME.
const cli = path.resolve(import.meta.dir, "../../../../cli")

// Fictional values: no stand has them.
const stand = { url: "https://loginom.example.test/app/", username: "fixture-user", password: "fixture-b413-password" }

const previous = "fixture-b413-previous"

// safeStorage of a Windows or macOS Desktop as the 0.4 codec uses it: its ciphertext does not contain the plaintext.
function safeStorage(available: boolean) {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value: string) => Buffer.from(value).reverse(),
    decryptString: (value: Buffer) => Buffer.from(value).reverse().toString(),
  }
}

const cleanup: Array<() => Promise<void>> = []

const environment = { XDG_DATA_HOME: process.env.XDG_DATA_HOME }

afterEach(async () => {
  if (environment.XDG_DATA_HOME === undefined) delete process.env.XDG_DATA_HOME

  if (environment.XDG_DATA_HOME !== undefined) process.env.XDG_DATA_HOME = environment.XDG_DATA_HOME
  // In order: a server stops before its directory goes.
  await cleanup.splice(0).reduce((done, run) => done.then(run), Promise.resolve())
})

type Fixture = { userData: string; source: string; target: string }

type Row = {
  name: string
  platform: NodeJS.Platform
  // What Desktop 0.4 left, and what the service's store already has.
  profile: (f: Fixture) => Promise<void>
  service?: (f: Fixture) => Promise<void>
  // safeStorage now; available when not given.
  protection?: ReturnType<typeof safeStorage>
  outcome: CredentialMigration.Outcome
  // A runner whose platform lacks what the row relies on.
  skip?: NodeJS.Platform
}

const linux = credentials("linux")

describe("Desktop 0.4 connection for the service", () => {
  test.each<Row>(
    [
      {
        name: "linux: a connection to the user's own stand moves as the generation after 0.4's",
        platform: "linux",
        profile: (f) => desktop04(f, linux),
        outcome: { state: "moved", generation: 3 },
      },
      {
        name: "linux: a profile 0.4.0 never opened moves a connection to app.loginom.ai",
        platform: "linux",
        profile: (f) => desktop04(f, linux, { url: "https://app.loginom.ai/app/", marker: false }),
        outcome: { state: "moved", generation: 3 },
      },
      {
        name: "linux: a profile 0.4.0 never opened does not move a connection 0.4.0 would have removed",
        platform: "linux",
        profile: (f) => desktop04(f, linux, { marker: false }),
        outcome: { state: "reset" },
      },
      {
        name: "linux: without a 0.4 connection neither store is touched",
        platform: "linux",
        profile: async () => undefined,
        outcome: { state: "none" },
      },
      {
        name: "linux: a service that already has a connection keeps it",
        platform: "linux",
        profile: (f) => desktop04(f, linux),
        service: (f) => save(connectionStore(f.target, cliCredentials("linux")), 1, true),
        outcome: { state: "current" },
      },
      {
        name: "linux: a move cut short before activation is finished with the next generation",
        platform: "linux",
        profile: (f) => desktop04(f, linux),
        service: (f) => save(connectionStore(f.target, cliCredentials("linux")), 3, false),
        outcome: { state: "moved", generation: 4 },
      },
      {
        name: "linux: a record that is not one is not moved",
        platform: "linux",
        profile: async (f) => {
          await desktop04(f, linux)
          await fs.writeFile(path.join(f.source, "connection.json"), `{"generation":2,"password":"${stand.password}"`)
        },
        outcome: { state: "failed", step: "read", reason: "LOGINOM_STORE_INVALID" },
      },
      {
        name: "linux: a store others can read is not moved",
        platform: "linux",
        // The store checks POSIX modes; Windows has none.
        skip: "win32",
        profile: async (f) => {
          await desktop04(f, linux)
          await fs.chmod(f.source, 0o755)
        },
        outcome: { state: "failed", step: "read", reason: "LOGINOM_STORE_PERMISSIONS_INVALID" },
      },
      ...(["win32", "darwin"] as const).flatMap((platform): Row[] => [
        {
          name: `${platform}: safeStorage is unavailable, as it would be for 0.4`,
          platform,
          profile: (f) => desktop04(f, credentials(platform, safeStorage(true))),
          protection: safeStorage(false),
          outcome: { state: "failed", step: "read", reason: "LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE" },
        },
        {
          name: `${platform}: safeStorage decrypts something other than the secrets`,
          platform,
          profile: async (f) => {
            await desktop04(f, credentials(platform, safeStorage(true)))
            const encrypted = safeStorage(true).encryptString(`${stand.password} is not JSON`).toString("base64")

            const record = {
              generation: 2,
              revision: 2,
              url: stand.url,
              username: stand.username,
              secrets: { encrypted },
            }

            await fs.writeFile(path.join(f.source, "connection.json"), JSON.stringify(record))
          },
          outcome: { state: "failed", step: "read", reason: "LOGINOM_STORE_READ_FAILED" },
        },
        {
          // The fixture resources carry no Keychain helper, and DPAPI exists only on a Windows runner.
          name: `${platform}: no protection for the service's record`,
          platform,
          skip: platform === "win32" ? "win32" : undefined,
          profile: (f) => desktop04(f, credentials(platform, safeStorage(true))),
          outcome: { state: "failed", step: "write", reason: "LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE" },
        },
      ]),
    ].filter((row) => row.skip !== process.platform),
  )("$name; a second start changes nothing", async (row) => {
    const f = await fixture()
    await row.profile(f)
    await row.service?.(f)
    const before = { source: await tree(f.userData), target: await tree(f.target) }

    const migrate = () =>
      CredentialMigration.migrate({
        platform: row.platform,
        protection: row.protection ?? safeStorage(true),
        userData: f.userData,
        resources: path.join(f.userData, "resources"),
      })

    const outcome = await migrate()
    const after = await tree(f.target)
    const again = await migrate()

    expect(outcome).toEqual(row.outcome)
    expect(again).toEqual(outcome.state === "moved" ? { state: "current" } : outcome)

    for (const secret of [stand.password, previous]) expect(JSON.stringify([outcome, again])).not.toContain(secret)
    expect(await tree(f.userData)).toEqual(before.source)
    expect(await tree(f.target)).toEqual(after)

    if (row.outcome.state === "none") expect(await tree(path.dirname(f.userData))).toEqual([])

    // Otherwise the service gets no record: at most the marker its store writes before it encodes one.
    if (outcome.state !== "moved") return expect(records(after)).toEqual(records(before.target))

    // The service's store: the 0.4.0 marker, the active record and its history, through `cliCredentials` of this
    // platform's Host.
    const saved = JSON.parse(await fs.readFile(path.join(f.target, "connection.json"), "utf8"))
    expect(JSON.parse(await fs.readFile(path.join(f.target, "v040-migration.json"), "utf8"))).toEqual({
      state: "complete",
    })
    expect(saved).toMatchObject({
      generation: outcome.generation,
      revision: 2,
      url: JSON.parse(await fs.readFile(path.join(f.source, "connection.json"), "utf8")).url,
      urlSource: "explicit",
      username: stand.username,
      secrets: { format: "loginom-cli-secrets-v1", protection: "plaintext" },
    })
    expect(await cliCredentials("linux").decode(saved.secrets)).toEqual({ apiKey: "", password: stand.password })
    expect(await fs.readdir(path.join(f.target, "generations"))).toContain(`${outcome.generation}.json`)
  })
})

// The fixture resources carry Linux's Node.
describe.skipIf(process.platform !== "linux")("the service after the move", () => {
  const built = { root: "", host: "" }

  beforeAll(async () => {
    node()
    built.root = await fs.mkdtemp(path.join(os.tmpdir(), "desktop-credentials-host-"))
    built.host = path.join(built.root, "host")

    // Built in its own process, so Bun's build cache stays out of this runner.
    const builder = Bun.spawn(
      [process.execPath, path.join(cli, "../loginom-host/script/build-node-host.ts"), built.host],
      { stdout: "pipe", stderr: "pipe" },
    )

    expect({ code: await builder.exited, error: await new Response(builder.stderr).text() }).toEqual({
      code: 0,
      error: "",
    })
  }, 60_000)

  afterAll(() => fs.rm(built.root, { recursive: true, force: true }))

  // As B2.7b's «the profile's server reads it»: the service's Host prepares Help only for a connection it has read and
  // decrypted. The server runs from source in Desktop's environment, with no CLI profile, and finds its data directory
  // itself.
  test("the service's Host starts Help for the moved generation; the password stays out of its processes and files", async () => {
    const f = await fixture()
    const root = path.dirname(f.userData)
    const resources = await fixtureResources(await temporary("desktop-credentials-resources-"), root, built.host)
    await desktop04(f, linux)
    expect(
      await CredentialMigration.migrate({ platform: "linux", protection: undefined, userData: f.userData, resources }),
    ).toEqual({ state: "moved", generation: 3 })

    const output = { stdout: path.join(root, "server.out"), stderr: path.join(root, "server.err") }

    const server = Bun.spawn([process.execPath, "src/index.ts", "serve", "--port", "0"], {
      cwd: cli,
      env: {
        ...process.env,
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: path.join(os.tmpdir(), "opencode-test-transpiler-cache"),
        HOME: root,
        USERPROFILE: root,
        XDG_CACHE_HOME: path.join(root, "cache"),
        XDG_CONFIG_HOME: path.join(root, "config"),
        XDG_DATA_HOME: path.join(root, "data"),
        XDG_STATE_HOME: path.join(root, "state"),
        LOGINOM_AI_AGENT_RESOURCES: resources,
        LOGINOM_AI_AGENT_PASSWORD: "fixture-b413-server",
        LOGINOM_AI_AGENT_DISABLE_MODELS_FETCH: "true",
        LOGINOM_AI_AGENT_DISABLE_FILEWATCHER: "true",
        LOGINOM_AI_AGENT_CLI_ROOT: undefined,
        LOGINOM_AI_AGENT_CONFIG_DIR: undefined,
        LOGINOM_AI_AGENT_DB: undefined,
      },
      stdout: Bun.file(output.stdout),
      stderr: Bun.file(output.stderr),
    })

    cleanup.unshift(async () => {
      server.kill("SIGKILL")
      await server.exited
    })

    const start = await until(async () => {
      if (server.exitCode !== null)
        throw new Error(`the server exited: ${await fs.readFile(output.stderr, "utf8").catch(() => "")}`)

      return (await starts(path.join(root, "help-starts.jsonl"))).find(Boolean)
    }, 60_000)

    const host = parent(start.pid)

    expect(start.generation).toBe(3)
    expect(parent(host)).toBe(server.pid)

    // Neither the environment nor the arguments of the service, its Node host and Help carry the password.
    const exposed = [server.pid, host, start.pid].flatMap((pid) =>
      ["environ", "cmdline"].filter((file) => readFileSync(`/proc/${pid}/${file}`).includes(secret())),
    )

    expect(exposed).toEqual([])

    server.kill("SIGTERM")
    await server.exited

    // Only the two connection stores hold it: not the output, logs, database or Host files of the service.
    const files = (await tree(root)).filter(
      (entry) =>
        entry.content !== undefined &&
        !entry.path.startsWith("desktop/loginom/connection/") &&
        !entry.path.startsWith("data/loginom-ai-agent-dev/loginom/connection/"),
    )

    expect(files.map((entry) => entry.path)).toContain("server.out")
    expect(files.filter((entry) => Buffer.from(entry.content ?? "", "base64").includes(secret()))).toEqual([])
  }, 90_000)
})

async function fixture() {
  const root = await fs.realpath(await temporary("desktop-credentials-"))
  process.env.XDG_DATA_HOME = path.join(root, "data")
  const userData = path.join(root, "desktop")

  return {
    userData,
    source: path.join(userData, "loginom", "connection"),
    target: path.join(root, "data", "loginom-ai-agent-dev", "loginom", "connection"),
  }
}

// Desktop 0.4: its Host opened the store, which writes the 0.4.0 marker, and the user saved twice. A profile 0.4.0 never
// opened has the same records without the marker.
async function desktop04(f: Fixture, codec: CredentialCodec, input: { url?: string; marker?: boolean } = {}) {
  const store = connectionStore(f.source, codec)
  await store.initialize()
  await save(store, 1, true, { url: input.url, password: previous })
  await save(store, 2, true, { url: input.url })

  if (input.marker === false) await fs.rm(path.join(f.source, "v040-migration.json"))
}

async function save(
  store: ReturnType<typeof connectionStore>,
  generation: number,
  activate: boolean,
  input: { url?: string; password?: string } = {},
) {
  await store.stage({
    generation,
    revision: generation,
    url: input.url ?? stand.url,
    urlSource: "explicit",
    username: stand.username,
    apiKey: "",
    password: input.password ?? stand.password,
  })

  if (activate) await store.activate(generation)
}

// The connection records of a store: its files but the 0.4.0 marker.
function records(entries: Awaited<ReturnType<typeof tree>>) {
  return entries.filter((entry) => entry.content !== undefined && entry.path !== "v040-migration.json")
}

// Every file and directory under `root` with its mode, and the content of files.
async function tree(root: string) {
  const entries = await fs.readdir(root, { recursive: true }).catch(() => [])

  return Promise.all(
    entries.sort().map(async (entry) => {
      const file = path.join(root, entry)
      const info = await fs.lstat(file)

      return {
        path: entry,
        mode: info.mode,
        content: info.isFile() ? (await fs.readFile(file)).toString("base64") : undefined,
      }
    }),
  )
}

// Resources with the pinned Node, the built Host entry and a small shipped Help, as bundle-loginom lays them out, in
// `directory`. Help is a stub that records each start in `<root>/help-starts.jsonl` and answers its catalog.
async function fixtureResources(directory: string, root: string, host: string) {
  const resources = path.join(directory, "resources")
  const file = path.join(root, "help-starts.jsonl")
  await fs.mkdir(path.join(resources, "bin"), { recursive: true })
  await fs.mkdir(path.join(resources, "runtime", "src"), { recursive: true })
  await fs.copyFile(node(), path.join(resources, "bin", "node"))
  await fs.cp(host, path.join(resources, "host"), { recursive: true })
  await writeHelp(path.join(resources, "help"))
  await fs.writeFile(path.join(resources, "browser"), "controlled browser payload")
  await fs.writeFile(
    path.join(resources, "runtime", "src", "knowledge-entry.mjs"),
    `import { appendFileSync } from "node:fs";
    process.on("disconnect", () => process.exit(0));
    process.on("message", m => {
      if (m.operation === "start") {
        appendFileSync(${JSON.stringify(file)}, JSON.stringify({ generation: m.input.generation, pid: process.pid }) + "\\n");
        process.send({ id: m.id, result: { protocol: 1, generation: m.input.generation, started: true } });
      }
      if (m.operation === "list") process.send({ id: m.id, result: { tools: [] } });
      if (m.operation === "close") process.send({ id: m.id, result: { closed: true } }, () => process.disconnect());
    });`,
  )
  await fs.writeFile(
    path.join(resources, "resource-manifest.json"),
    JSON.stringify({
      protocol: 1,
      nodeVersion: release.nodeVersion,
      node: "bin/node",
      browser: "browser",
      files: await resourceInventory(resources),
    }),
  )

  return resources
}

function node() {
  const value = process.env.LOGINOM_AI_AGENT_TEST_NODE

  if (!value) throw new Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")

  return value
}

function secret() {
  return Buffer.from(stand.password)
}

async function temporary(prefix: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  cleanup.push(() => fs.rm(root, { recursive: true, force: true }))

  return root
}

async function starts(file: string): Promise<{ generation: number; pid: number }[]> {
  const text = await fs.readFile(file, "utf8").catch(() => "")

  // SAFETY: the Help stub writes exactly this shape.
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

async function until<T>(check: () => Promise<T | undefined>, timeout: number): Promise<T> {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const value = await check()

    if (value !== undefined) return value
    await Bun.sleep(100)
  }

  throw new Error("Timed out waiting for condition")
}

// The parent of a Linux process.
function parent(pid: number) {
  const stat = readFileSync(`/proc/${pid}/stat`, "utf8")

  return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1])
}
