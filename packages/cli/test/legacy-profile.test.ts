import { afterAll, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { legacyDirectories, restoreLegacy } from "../../server/test/fixture/legacy/restore"
import { CliProfile } from "../src/profile"
import { isolatedEnv } from "./fixture/environment"

// A whole 0.4 profile of the channel in the directories a release build uses (B3.2): the database and auth.json in the
// data directory, the configuration and own skills in the config directory, and the Loginom connections of Desktop and
// of the standalone CLI in their product directories (`<appData>/com.loginom.aiagent*`). The configuration, the skills
// and the connections stay where they are, because OpenCode 2 reads the same channel directories and the connection
// stores belong to Desktop (B4) and the CLI profile (B2.7c). The provider key moves into the database. Fixtures
// 0.4-config.jsonc and 0.4-auth.json were written by 0.4 itself; the key and the connection secrets are made up.
const cli = path.join(import.meta.dir, "..")
const fixtures = path.join(cli, "..", "server", "test", "fixture", "legacy")
const password = "legacy-profile-test"
const key = "fixture-provider-key"
const roots: string[] = []

afterAll(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })))
})

test("the server moves a 0.4 profile: the provider works with its key, skills and connections stay, a rerun changes nothing", async () => {
  const authorizations: (string | null)[] = []
  const provider = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (request) => complete(request, authorizations) })
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "loginom-legacy-profile-")))
  roots.push(root)
  // A source run is the dev channel.
  const data = path.join(root, "data", "loginom-ai-agent-dev")
  const config = path.join(root, "config", "loginom-ai-agent-dev")
  const skill = path.join(config, "skills", "sales-summary", "SKILL.md")
  const connections = [
    path.join(root, "config", "com.loginom.aiagent.dev", "loginom", "connection"),
    path.join(root, "config", "com.loginom.aiagent.dev", "cli", "profiles", "default", "loginom", "connection"),
  ]
  await fs.mkdir(data, { recursive: true })
  await restoreLegacy("0.4", path.join(data, "loginom-ai-agent.db"), root)
  const { project } = legacyDirectories(root)
  await fs.copyFile(path.join(fixtures, "0.4-auth.json"), path.join(data, "auth.json"))
  await fs.chmod(path.join(data, "auth.json"), 0o600)
  await fs.mkdir(config, { recursive: true })
  await Bun.write(
    path.join(config, "loginom-ai-agent.jsonc"),
    (await Bun.file(path.join(fixtures, "0.4-config.jsonc")).text()).replace(
      "http://127.0.0.1:4010/v1",
      `http://127.0.0.1:${provider.port}/v1`,
    ),
  )
  await Bun.write(
    skill,
    "---\nname: sales-summary\ndescription: Summarize the monthly sales report.\n---\n\nGroup the rows by region.\n",
  )
  await Promise.all(connections.map(connectionStore))
  const env = isolatedEnv(root, {
    LOGINOM_AI_AGENT_CONFIG_CONTENT: undefined,
    LOGINOM_AI_AGENT_CONFIG_DIR: undefined,
    LOGINOM_AI_AGENT_DB: undefined,
    LOGINOM_AI_AGENT_DISABLE_CHANNEL_DB: "1",
    LOGINOM_AI_AGENT_PASSWORD: password,
    XDG_CONFIG_HOME: path.join(root, "config"),
  })
  const kept = async () =>
    snapshot([
      path.join(config, "loginom-ai-agent.jsonc"),
      skill,
      path.join(data, "auth.json"),
      ...(await Promise.all(connections.map((directory) => files(directory)))).flat(),
    ])
  const before = await kept()

  // The server migrates the profile before it opens the database (B3.1b).
  const child = Bun.spawn([process.execPath, path.join(cli, "src/index.ts"), "serve", "--port", "0"], {
    // The CLI entry needs the preload from this package's bunfig.toml.
    cwd: cli,
    env,
    stdout: "pipe",
    stderr: "pipe",
  })
  try {
    const call = api(await listening(child), project)
    const skills = await until(async () => {
      const listed = (await call("GET", `/api/skill?location[directory]=${encodeURIComponent(project)}`)).data as {
        id: string
        path: string
        content: string
      }[]
      return listed.some((item) => item.id === "sales-summary") ? listed : undefined
    })
    expect(skills.find((item) => item.id === "sales-summary")).toMatchObject({
      path: skill,
      content: expect.stringContaining("Group the rows by region."),
    })

    // No key is entered: the one 0.4 kept reaches the provider 0.4 configured.
    const session = (await call("POST", "/api/session", { location: { directory: project } })).data.id as string
    await call("POST", `/api/session/${session}/prompt`, { text: "Say hello" })
    await call("POST", `/api/experimental/session/${session}/wait`, {})
    expect(authorizations.length).toBeGreaterThan(0)
    expect(authorizations.every((authorization) => authorization === `Bearer ${key}`)).toBe(true)
  } finally {
    child.kill("SIGTERM")
    await child.exited
    await provider.stop(true)
  }
  expect(await kept()).toEqual(before)

  // `migrate` after the server: the same report, and nothing changes.
  const databases = await snapshot(await files(data, (name) => name.includes(".db")))
  const rerun = Bun.spawn([process.execPath, path.join(cli, "src/index.ts"), "migrate"], {
    cwd: cli,
    env,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(rerun.stdout).text(),
    new Response(rerun.stderr).text(),
    rerun.exited,
  ])
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
  expect(stdout).toContain(`Already migrated ${path.join(data, "loginom-ai-agent.db")}`)
  expect(stdout).toContain("  Provider credentials: stub")
  expect(await snapshot(await files(data, (name) => name.includes(".db")))).toEqual(databases)
  expect(await kept()).toEqual(before)
}, 60_000)

// The standalone CLI of 0.4 kept a whole profile in one root (`a080f7725c:packages/product/src/cli-profile.ts`): its
// marker, the database and auth.json in `data`, the configuration and own skills in `config`, the Loginom connection in
// `loginom`. The product CLI opens it in place (B2.7c): the profile's own service migrates the sessions and the key on
// its first start (B3.1b, B3.2), reads the configuration and the skills, and keeps its Host next to the connection.
test("a 0.4 CLI profile works in place: its service brings the sessions and the key, reads its skills, keeps the connection", async () => {
  const authorizations: (string | null)[] = []
  const provider = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (request) => complete(request, authorizations) })
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "loginom-legacy-cli-profile-")))
  roots.push(root)
  // The default profile of the dev channel on Linux, as 0.4 laid it out: directories 0700, files 0600.
  const profile = path.join(root, "config", "com.loginom.aiagent.dev", "cli", "profiles", "default")
  const config = path.join(profile, "config")
  const data = path.join(profile, "data")
  const loginom = path.join(profile, "loginom")
  const skill = path.join(config, "skills", "sales-summary", "SKILL.md")
  await Promise.all(
    ["config", "data", "state", "cache/tmp", "loginom"].map((name) =>
      fs.mkdir(path.join(profile, name), { recursive: true, mode: 0o700 }),
    ),
  )
  await fs.writeFile(
    path.join(profile, "cli-profile.json"),
    JSON.stringify({ format: "loginom-cli", version: 1, channel: "dev" }),
    { mode: 0o600 },
  )
  await restoreLegacy("0.4", path.join(data, "loginom-ai-agent.db"), root)
  const { project } = legacyDirectories(root)
  const recorded = new Database(path.join(data, "loginom-ai-agent.db"), { readonly: true })
  const sessions = recorded
    .query<{ id: string }, []>("SELECT id FROM session ORDER BY id")
    .all()
    .map((row) => row.id)
  recorded.close()
  await fs.copyFile(path.join(fixtures, "0.4-auth.json"), path.join(data, "auth.json"))
  await fs.chmod(path.join(data, "auth.json"), 0o600)
  await Bun.write(
    path.join(config, "loginom-ai-agent.jsonc"),
    (await Bun.file(path.join(fixtures, "0.4-config.jsonc")).text()).replace(
      "http://127.0.0.1:4010/v1",
      `http://127.0.0.1:${provider.port}/v1`,
    ),
  )
  await Bun.write(
    skill,
    "---\nname: sales-summary\ndescription: Summarize the monthly sales report.\n---\n\nGroup the rows by region.\n",
  )
  await connectionStore(path.join(loginom, "connection"))
  // The inherited config directory and database of isolatedEnv do not apply: the profile replaces them.
  const env = isolatedEnv(root, { LOGINOM_AI_AGENT_CLI_PROFILE: profile })
  // The profile's service port is pinned in its service config; the derived one is fixed per root.
  const applied = { ...env }
  CliProfile.apply(applied)
  const service = `service-${applied.LOGINOM_AI_AGENT_SERVICE_IDENTITY}.json`
  const free = Bun.serve({ port: 0, fetch: () => new Response() })
  const port = free.port
  await free.stop(true)
  await fs.writeFile(path.join(config, service), JSON.stringify({ port }), { mode: 0o600 })
  const kept = async () =>
    snapshot([
      path.join(config, "loginom-ai-agent.jsonc"),
      skill,
      path.join(data, "auth.json"),
      ...(await files(path.join(loginom, "connection"))),
    ])
  const before = await kept()
  const original = (await snapshot([path.join(data, "loginom-ai-agent.db")]))[path.join(data, "loginom-ai-agent.db")]

  expect(await productCli(["service", "start"], env)).toEqual({
    code: 0,
    stdout: `http://127.0.0.1:${port}\n`,
    stderr: "",
  })
  try {
    const info = await Bun.file(path.join(profile, "state", service)).json()
    const call = api(info.url, project, info.password)
    const listed = (await call("GET", "/api/session")).data as { id: string }[]
    expect(listed.map((item) => item.id).toSorted()).toEqual(sessions)
    expect(sessions).toHaveLength(4)
    const skills = await until(async () => {
      const found = (await call("GET", `/api/skill?location[directory]=${encodeURIComponent(project)}`)).data as {
        id: string
        path: string
      }[]
      return found.some((item) => item.id === "sales-summary") ? found : undefined
    })
    expect(skills.find((item) => item.id === "sales-summary")?.path).toBe(skill)
    const session = (await call("POST", "/api/session", { location: { directory: project } })).data.id as string
    await call("POST", `/api/session/${session}/prompt`, { text: "Say hello" })
    await call("POST", `/api/experimental/session/${session}/wait`, {})
    expect(authorizations.length).toBeGreaterThan(0)
    expect(authorizations.every((authorization) => authorization === `Bearer ${key}`)).toBe(true)
    // The Host works in the directory with the connection, not in a new one under `data`.
    expect((await fs.readdir(loginom)).toSorted()).toEqual(["connection", "leases"])
    expect(await fs.readdir(data)).not.toContain("loginom")
    expect(
      (await snapshot([path.join(data, "loginom-ai-agent.v1-backup.db")]))[
        path.join(data, "loginom-ai-agent.v1-backup.db")
      ],
    ).toBe(original)
    expect(JSON.parse(await fs.readFile(path.join(profile, ".writer", "owner"), "utf8"))).toMatchObject({
      pid: info.pid,
    })
  } finally {
    expect(await productCli(["service", "stop"], env)).toMatchObject({ code: 0 })
    await provider.stop(true)
  }
  expect(await kept()).toEqual(before)
  expect(await fs.readdir(profile)).not.toContain(".writer")
}, 60_000)

// Runs the product CLI entry, which applies the profile.
async function productCli(args: string[], env: Record<string, string | undefined>) {
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

// A Loginom connection store as 0.4 wrote it on Linux: plaintext records, directories 0700, files 0600
// (`a080f7725c:packages/loginom-host/src/connection/connection-store.ts`).
async function connectionStore(directory: string) {
  const record = {
    generation: 1,
    revision: 1,
    url: "https://loginom.example.invalid",
    urlSource: "explicit",
    username: "fixture",
    secrets: directory.includes(`${path.sep}cli${path.sep}`)
      ? { format: "loginom-cli-secrets-v1", protection: "plaintext", payload: '{"apiKey":"","password":"fixture"}' }
      : { apiKey: "", password: "fixture" },
  }
  await fs.mkdir(path.join(directory, "generations"), { recursive: true, mode: 0o700 })
  await Promise.all(
    [
      ["connection.json", record],
      ["generations/1.json", record],
      ["v040-migration.json", { state: "complete" }],
    ].map(([name, value]) => fs.writeFile(path.join(directory, String(name)), JSON.stringify(value), { mode: 0o600 })),
  )
}

async function files(directory: string, filter: (name: string) => boolean = () => true): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true, recursive: true })
  return entries
    .filter((entry) => entry.isFile() && filter(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort()
}

// Content and mode of each file.
async function snapshot(list: string[]) {
  return Object.fromEntries(
    await Promise.all(
      list.map(async (file) => [
        file,
        `${((await fs.stat(file)).mode & 0o777).toString(8)} ${new Bun.CryptoHasher("sha256")
          .update(await Bun.file(file).arrayBuffer())
          .digest("hex")}`,
      ]),
    ),
  )
}

async function until<A>(read: () => Promise<A | undefined>, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (true) {
    const value = await read()
    if (value !== undefined) return value
    if (Date.now() >= deadline) throw new Error("Timed out waiting for condition")
    await Bun.sleep(50)
  }
}

async function listening(child: Bun.Subprocess<"ignore", "pipe", "pipe">) {
  const decoder = new TextDecoder()
  const output = { text: "" }
  for await (const chunk of child.stdout) {
    output.text += decoder.decode(chunk)
    const url = /server listening on (http:\/\/\S+)/.exec(output.text)?.[1]
    if (url) return url
  }
  throw new Error(`server did not start: ${output.text}${await new Response(child.stderr).text()}`)
}

function api(base: string, directory: string, secret = password) {
  return async (method: string, route: string, body?: unknown) => {
    const response = await fetch(new URL(route, base), {
      method,
      headers: {
        authorization: `Basic ${btoa(`opencode:${secret}`)}`,
        "content-type": "application/json",
        "x-opencode-directory": encodeURIComponent(directory),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${text}`)
    return text ? JSON.parse(text) : undefined
  }
}

// An OpenAI-compatible chat endpoint that records the credential each request carries and streams a short answer.
function complete(request: Request, authorizations: (string | null)[]) {
  if (!new URL(request.url).pathname.endsWith("/chat/completions")) return new Response("not found", { status: 404 })
  authorizations.push(request.headers.get("authorization"))
  const chunk = (body: unknown) => `data: ${JSON.stringify(body)}\n\n`
  const base = { id: "stub", object: "chat.completion.chunk", created: 0, model: "stub-model" }
  return new Response(
    [
      chunk({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "Hello" }, finish_reason: null }] }),
      chunk({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }),
      chunk({ ...base, choices: [], usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 } }),
      "data: [DONE]\n\n",
    ].join(""),
    { headers: { "content-type": "text/event-stream" } },
  )
}
