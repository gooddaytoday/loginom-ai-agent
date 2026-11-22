import { afterAll, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { legacyDirectories, restoreLegacy } from "../../server/test/fixture/legacy/restore"
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

function api(base: string, directory: string) {
  return async (method: string, route: string, body?: unknown) => {
    const response = await fetch(new URL(route, base), {
      method,
      headers: {
        authorization: `Basic ${btoa(`opencode:${password}`)}`,
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
