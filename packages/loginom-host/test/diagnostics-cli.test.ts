import { Database } from "bun:sqlite"
import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { profilePaths } from "@loginom-ai-agent/product/cli-profile"
import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader } from "@zip.js/zip.js"
import { cliCredentials } from "../src/connection/cli-credentials"
import { connectionStore } from "../src/connection/connection-store"
import { diagnosticsCommand } from "../src/diagnostics-cli"

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex")
function put(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, text, { mode: 0o600 })
}

const planted = [
  "fixture-cli-loginom-pass",
  "fixture-cli-loginom-key",
  "fixture-cli-oauth-refresh",
  "fixture-cli-dock-key",
  "fixture-cli-saved-value",
  "fixture-cli-mcp-refresh",
  "fixture-cli-mcp-client",
  "fixture-cli-account-access",
]

// A CLI profile after one `run`: stores with planted values, the chat database
// and runtime attempts of two sessions. The database has the OpenCode 2 tables the
// export reads, with the columns of core/src/{session,credential,account}/sql.ts;
// cli/test/cli-standalone.test.ts exports a database the server wrote itself.
async function cliProfile() {
  const base = mkdtempSync(join(tmpdir(), "loginom-diagnostics-cli-"))
  roots.push(base)
  const paths = profilePaths(join(base, "profile"))
  const store = connectionStore(join(paths.loginom, "connection"), cliCredentials("linux"))
  await store.stage({
    generation: 1,
    revision: 1,
    url: "https://app.loginom.ai",
    username: "fixture-cli-person",
    apiKey: "fixture-cli-loginom-key",
    password: "fixture-cli-loginom-pass",
  })
  await store.activate(1)
  // As in run-check: the profile links a shared OAuth store.
  put(join(base, "shared", "auth.json"), JSON.stringify({ openai: { type: "oauth", access: "a", refresh: "fixture-cli-oauth-refresh" } }))
  mkdirSync(paths.data, { recursive: true, mode: 0o700 })
  symlinkSync(join(base, "shared", "auth.json"), join(paths.data, "auth.json"))
  put(join(base, "dock", "config.json"), JSON.stringify({ api_key: "fixture-cli-dock-key" }))
  const echo = planted.map((value) => `echo ${value} ${Buffer.from(value).toString("base64")}`).join(" ")
  const db = new Database(join(paths.data, "loginom-ai-agent.db"), { create: true })
  db.run("CREATE TABLE session_v2 (id TEXT PRIMARY KEY, parent_id TEXT, slug TEXT NOT NULL, title TEXT, version TEXT NOT NULL, agent TEXT, model TEXT, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL)")
  db.run("CREATE TABLE session_message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, type TEXT NOT NULL, seq INTEGER NOT NULL, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL)")
  db.run("CREATE TABLE session_part (message_id TEXT NOT NULL, session_id TEXT NOT NULL, ordinal INTEGER NOT NULL, type TEXT NOT NULL, call_id TEXT, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (message_id, ordinal))")
  db.run("CREATE TABLE credential (id TEXT PRIMARY KEY, integration_id TEXT, label TEXT NOT NULL, value TEXT NOT NULL, connector_id TEXT, method_id TEXT, active INTEGER, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL)")
  db.run("CREATE TABLE account (id TEXT PRIMARY KEY, email TEXT NOT NULL, url TEXT NOT NULL, access_token TEXT NOT NULL, refresh_token TEXT NOT NULL, token_expiry INTEGER, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL)")
  db.run("CREATE TABLE control_account (email TEXT NOT NULL, url TEXT NOT NULL, access_token TEXT NOT NULL, refresh_token TEXT NOT NULL, token_expiry INTEGER, active INTEGER NOT NULL, time_created INTEGER NOT NULL, time_updated INTEGER NOT NULL, PRIMARY KEY (email, url))")
  // A provider key saved through `integration.connect.key`, the OAuth login of an MCP server with its client, and an account.
  db.run("INSERT INTO credential VALUES ('cred_1', 'stub', 'default', ?, NULL, NULL, 1, 1, 1)", [
    JSON.stringify({ type: "key", key: "fixture-cli-saved-value" }),
  ])
  db.run("INSERT INTO credential VALUES ('cred_2', 'mcp:docs', 'default', ?, NULL, 'oauth', 1, 1, 1)", [
    JSON.stringify({
      type: "oauth",
      methodID: "oauth",
      access: "a",
      refresh: "fixture-cli-mcp-refresh",
      expires: 1,
      metadata: { client: { client_id: "public-id", client_secret: "fixture-cli-mcp-client" } },
    }),
  ])
  db.run("INSERT INTO account VALUES ('acc_1', 'person@example.com', 'https://opencode.ai', 'fixture-cli-account-access', 'r', NULL, 1, 1)")
  for (const [id, updated] of [["ses_old", 1], ["ses_new", 2]] as const) {
    db.run("INSERT INTO session_v2 VALUES (?, NULL, ?, ?, '1', 'build', '{}', 1, ?)", [id, id, `title ${id}`, updated])
    db.run("INSERT INTO session_message VALUES (?, ?, 'user', 1, 1, 1, ?)", [
      `msg_${id}`,
      id,
      JSON.stringify({ text: `request of ${id}; proxy http://10.4.4.4:3128/ next; ${echo}`, files: [] }),
    ])
    db.run("INSERT INTO session_message VALUES (?, ?, 'assistant', 2, 2, 2, ?)", [
      `msg_${id}_answer`,
      id,
      JSON.stringify({ agent: "build", model: { id: "m", providerID: "stub" } }),
    ])
    db.run("INSERT INTO session_part VALUES (?, ?, 0, 'text', NULL, 2, 2, ?)", [
      `msg_${id}_answer`,
      id,
      JSON.stringify({ type: "text", text: `answer of ${id}; ${echo}` }),
    ])
    put(
      join(paths.loginom, "runtime", "generations", "1", "chats", sha(id), "attempts", "a1", "execution-events.jsonl"),
      JSON.stringify({ phase: "node_step_completed", text: `attempt of ${id}; ${echo}` }) + "\n",
    )
  }
  db.close()
  // Command lines as the OpenCode 2 CLI logs them (cli/src/index.ts): a value with spaces or quotes is JSON-quoted.
  const line = (args: string[]) =>
    `timestamp=2026-11-13T10:00:00.000Z level=INFO run=r1 message="cli starting" args=${JSON.stringify(JSON.stringify(args))} role=cli`
  put(
    join(paths.data, "log", "loginom-ai-agent.log"),
    [
      `server log ${echo}`,
      line(["auth", "login", "stub", "--answer", "key=fixture-cli-answer-value"]),
      line(["run", "fixture-cli-prompt-text of the user"]),
      "timestamp=2026-11-13T10:00:01.000Z level=INFO run=r2 message=\"cli starting\" args=[] role=cli",
    ].join("\n") + "\n",
  )
  return { base, paths, environment: { LOGINOM_DOCK_HOME: join(base, "dock") } }
}

async function run(args: string[], profile: Awaited<ReturnType<typeof cliProfile>>, cwd = profile.base) {
  const out: string[] = []
  const err: string[] = []
  const code = await diagnosticsCommand(args, profile.paths, {
    cwd,
    now: new Date("2026-11-13T10:20:30Z"),
    environment: profile.environment,
    installed: join(profile.base, "installed"),
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
  })
  return { code, stdout: out.join(""), stderr: err.join("") }
}

async function unpack(path: string) {
  const raw = readFileSync(path)
  const reader = new ZipReader(new Uint8ArrayReader(new Uint8Array(raw)))
  const files = new Map<string, string>()
  for (const entry of await reader.getEntries())
    if (!entry.directory) files.set(entry.filename, new TextDecoder().decode(await entry.getData!(new Uint8ArrayWriter())))
  await reader.close()
  return { raw, files, manifest: JSON.parse(files.get("manifest.json")!) }
}

test("--session exports that session's attempts and chat to --output and prints only the path", async () => {
  const profile = await cliProfile()
  const output = join(profile.base, "out", "diag.zip")
  mkdirSync(dirname(output))
  const result = await run(["diagnostics", "export", "--session", "ses_old", "--output", output], profile)
  expect(result).toMatchObject({ code: 0, stdout: output + "\n" })
  expect(result.stderr).toContain("chat: included")
  const { files, manifest } = await unpack(output)
  expect(manifest).toMatchObject({ selection: "session", chat: "included", product: "cli", knownSecrets: "ok" })
  expect(JSON.parse(files.get("chat/session.json")!).info.id).toBe("ses_old")
  expect(files.get("chat/session.json")).toContain("request of ses_old")
  expect(files.get("chat/session.json")).toContain("answer of ses_old")
  expect([...files.keys()]).toContain(`runtime/generations/1/chats/${sha("ses_old")}/attempts/a1/execution-events.jsonl`)
  expect([...files.keys()].some((name) => name.includes(sha("ses_new")))).toBe(false)
  expect([...files.keys()]).toContain("cli/loginom-ai-agent.log")
  if (process.platform !== "win32") expect(statSync(output).mode & 0o777).toBe(0o600)
})

test("without --session the latest session is used", async () => {
  const profile = await cliProfile()
  const output = join(profile.base, "latest.zip")
  const result = await run(["diagnostics", "export", "--output", output], profile)
  expect(result.code).toBe(0)
  const { files, manifest } = await unpack(output)
  expect(manifest).toMatchObject({ selection: "session", chat: "included" })
  expect(JSON.parse(files.get("chat/session.json")!).info.id).toBe("ses_new")
  expect([...files.keys()]).toContain(`runtime/generations/1/chats/${sha("ses_new")}/attempts/a1/execution-events.jsonl`)
  expect([...files.keys()].some((name) => name.includes(sha("ses_old")))).toBe(false)
})

test("--no-chat leaves the chat out, even when the database cannot be read", async () => {
  const profile = await cliProfile()
  // A database that cannot be read must not stop the export when the chat is not requested.
  writeFileSync(join(profile.paths.data, "loginom-ai-agent.db"), "not a database")
  const output = join(profile.base, "nochat.zip")
  const result = await run(["diagnostics", "export", "--no-chat", "--output", output], profile)
  expect(result.code).toBe(0)
  const { files, manifest } = await unpack(output)
  expect(manifest).toMatchObject({ selection: "recent", chat: "not-requested" })
  expect(manifest.chatReason).toBeUndefined()
  expect([...files.keys()].some((name) => name.startsWith("chat/"))).toBe(false)
  expect([...files.keys()]).toContain(`runtime/generations/1/chats/${sha("ses_new")}/attempts/a1/execution-events.jsonl`)
  expect([...files.keys()]).toContain("cli/loginom-ai-agent.log")
  // With --session the attempts still follow that session.
  const selected = join(profile.base, "nochat-session.zip")
  expect((await run(["diagnostics", "export", "--no-chat", "--session", "ses_old", "--output", selected], profile)).code).toBe(0)
  const old = await unpack(selected)
  expect(old.manifest).toMatchObject({ selection: "session", chat: "not-requested" })
  expect([...old.files.keys()]).toContain(`runtime/generations/1/chats/${sha("ses_old")}/attempts/a1/execution-events.jsonl`)
})

test("an unreadable chat database leaves the chat unavailable and exports everything else", async () => {
  for (const damage of ["garbage", "no-tables"] as const) {
    const profile = await cliProfile()
    const file = join(profile.paths.data, "loginom-ai-agent.db")
    rmSync(file)
    if (damage === "garbage") writeFileSync(file, "SQLite format 3\0" + "x".repeat(4096))
    else new Database(file, { create: true }).close()
    for (const args of [[], ["--session", "ses_new"]]) {
      const output = join(profile.base, `${damage}-${args.length}.zip`)
      const result = await run(["diagnostics", "export", ...args, "--output", output], profile)
      expect({ damage, args, code: result.code }).toEqual({ damage, args, code: 0 })
      expect(result.stderr).toContain("chat: unavailable")
      expect(result.stderr).not.toContain("SQLITE")
      const { files, manifest } = await unpack(output)
      // Nor can its saved keys be learned, so the archive does not claim it knows every secret.
      expect(manifest).toMatchObject({ chat: "unavailable", chatReason: "database-unreadable", knownSecrets: "unavailable" })
      expect([...files.keys()].some((name) => name.startsWith("chat/"))).toBe(false)
      expect([...files.keys()]).toContain(`runtime/generations/1/chats/${sha("ses_new")}/attempts/a1/execution-events.jsonl`)
      expect([...files.keys()]).toContain("cli/loginom-ai-agent.log")
    }
  }
})

test("a chat database locked for a moment by the running CLI is waited for, not reported unavailable", async () => {
  const profile = await cliProfile()
  const file = join(profile.paths.data, "loginom-ai-agent.db")
  // A separate process holds an exclusive lock, as a writer of the running CLI
  // may do briefly; bun:sqlite is synchronous, so the lock cannot live in this process.
  const holder = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `const { Database } = require("bun:sqlite");
      const db = new Database(${JSON.stringify(file)});
      db.run("BEGIN EXCLUSIVE");
      console.log("locked");
      setTimeout(() => { db.run("COMMIT"); db.close() }, 700);`,
    ],
    { stdout: "pipe", stderr: "inherit" },
  )
  const reader = holder.stdout.getReader()
  expect(new TextDecoder().decode((await reader.read()).value)).toContain("locked")
  reader.releaseLock()
  const output = join(profile.base, "locked.zip")
  const result = await run(["diagnostics", "export", "--output", output], profile)
  expect(await holder.exited).toBe(0)
  expect(result.code).toBe(0)
  expect(result.stderr).toContain("chat: included")
  expect(JSON.parse((await unpack(output)).files.get("chat/session.json")!).info.id).toBe("ses_new")
})

test("the chat is read as one snapshot: a message written meanwhile is not exported without its parts", async () => {
  const profile = await cliProfile()
  const file = join(profile.paths.data, "loginom-ai-agent.db")
  const wal = new Database(file)
  wal.run("PRAGMA journal_mode = WAL")
  const writer = new Database(file)
  // The running CLI appends a message with its part right after the parts were read.
  const query = Database.prototype.query
  Database.prototype.query = function (this: Database, sql: string) {
    const statement = query.call(this, sql)
    if (this === writer || !sql.startsWith("SELECT message_id, ordinal, data FROM session_part")) return statement
    const all = statement.all.bind(statement)
    return Object.assign(Object.create(statement), {
      all: (...args: unknown[]) => {
        const rows = all(...(args as []))
        writer.run("INSERT INTO session_message VALUES ('msg_late', 'ses_new', 'assistant', 3, 3, 3, ?)", [JSON.stringify({ agent: "build" })])
        writer.run("INSERT INTO session_part VALUES ('msg_late', 'ses_new', 0, 'text', NULL, 3, 3, ?)", [JSON.stringify({ type: "text", text: "late" })])
        return rows
      },
    })
  } as typeof query
  try {
    const output = join(profile.base, "snapshot.zip")
    expect((await run(["diagnostics", "export", "--output", output], profile)).code).toBe(0)
    const chat = JSON.parse((await unpack(output)).files.get("chat/session.json")!)
    expect(writer.query("SELECT count(*) AS n FROM session_message WHERE id = 'msg_late'").get()).toEqual({ n: 1 })
    expect(chat.messages.map((message: any) => [message.info.id, message.parts.length])).toEqual([
      ["msg_ses_new", 0],
      ["msg_ses_new_answer", 1],
    ])
  } finally {
    Database.prototype.query = query
    writer.close()
    wal.close()
  }
})

test("credentials of an earlier connection are masked in an older chat after switching accounts", async () => {
  const profile = await cliProfile()
  const store = connectionStore(join(profile.paths.loginom, "connection"), cliCredentials("linux"))
  await store.stage({
    generation: 2,
    revision: 1,
    url: "https://app.loginom.ai",
    username: "fixture-cli-other",
    apiKey: "fixture-cli-other-key",
    password: "fixture-cli-other-pass",
  })
  await store.activate(2)
  // Plain text, no credential assignment: only known values can mask it.
  const db = new Database(join(profile.paths.data, "loginom-ai-agent.db"))
  db.run("INSERT INTO session_part VALUES ('msg_ses_old_answer', 'ses_old', 1, 'text', NULL, 2, 2, ?)", [
    JSON.stringify({ type: "text", text: "signed in as fixture-cli-person with fixture-cli-loginom-pass" }),
  ])
  db.close()
  const output = join(profile.base, "switched.zip")
  expect((await run(["diagnostics", "export", "--session", "ses_old", "--output", output], profile)).code).toBe(0)
  const { raw, files, manifest } = await unpack(output)
  expect(manifest).toMatchObject({ chat: "included", knownSecrets: "ok" })
  expect(files.get("chat/session.json")).toContain("signed in as")
  const bytes = Buffer.concat([raw, ...[...files].flatMap(([name, text]) => [Buffer.from(name), Buffer.from(text)])])
  for (const value of ["fixture-cli-loginom-pass", "fixture-cli-loginom-key", "fixture-cli-person"])
    for (const variant of [value, Buffer.from(value).toString("base64")])
      expect({ variant, found: bytes.includes(Buffer.from(variant)) }).toEqual({ variant, found: false })
})

test("the default output is loginom-diagnostics-<stamp>.zip in the working directory and is never overwritten", async () => {
  const profile = await cliProfile()
  const cwd = join(profile.base, "cwd")
  mkdirSync(cwd)
  const first = await run(["diagnostics", "export"], profile, cwd)
  expect(first).toMatchObject({ code: 0, stdout: join(cwd, "loginom-diagnostics-20261113T102030.zip") + "\n" })
  expect(readdirSync(cwd)).toEqual(["loginom-diagnostics-20261113T102030.zip"])
  const again = await run(["diagnostics", "export"], profile, cwd)
  expect(again).toEqual({ code: 1, stdout: "", stderr: "DIAGNOSTICS_OUTPUT_EXISTS\n" })
})

test("an output file created after the existence check is kept and reported as existing", async () => {
  const profile = await cliProfile()
  const output = join(profile.base, "raced.zip")
  // The command checks the output synchronously before its first await; the
  // file appears while the archive is being built and before it is written.
  const pending = run(["diagnostics", "export", "--output", output], profile)
  writeFileSync(output, "someone else's file")
  expect(await pending).toEqual({ code: 1, stdout: "", stderr: "DIAGNOSTICS_OUTPUT_EXISTS\n" })
  expect(readFileSync(output, "utf8")).toBe("someone else's file")
})

test("no planted value or internal address reaches the raw zip or any entry", async () => {
  const profile = await cliProfile()
  const output = join(profile.base, "secrets.zip")
  expect((await run(["diagnostics", "export", "--session", "ses_new", "--output", output], profile)).code).toBe(0)
  const { raw, files } = await unpack(output)
  const bytes = Buffer.concat([raw, ...[...files].flatMap(([name, text]) => [Buffer.from(name), Buffer.from(text)])])
  for (const value of [...planted, "fixture-cli-person", "10.4.4.4"])
    for (const variant of [value, Buffer.from(value).toString("base64")])
      expect({ variant, found: bytes.includes(Buffer.from(variant)) }).toEqual({ variant, found: false })
  expect(bytes.toString("utf8")).toContain("http://host-")
})

test("the CLI log keeps no command line: neither flag values nor the prompt", async () => {
  const profile = await cliProfile()
  const output = join(profile.base, "commands.zip")
  expect((await run(["diagnostics", "export", "--output", output], profile)).code).toBe(0)
  const log = (await unpack(output)).files.get("cli/loginom-ai-agent.log")!
  expect(log).toContain("server log")
  expect(log.match(/args=\[redacted\] role=cli/g)?.length).toBe(3)
  for (const value of ["fixture-cli-answer-value", "fixture-cli-prompt-text", "--answer"]) expect(log).not.toContain(value)
})

test("invalid arguments exit 2 and write nothing", async () => {
  const profile = await cliProfile()
  for (const args of [
    ["diagnostics"],
    ["diagnostics", "export", "--session", "../../x"],
    ["diagnostics", "export", "--unknown"],
    ["diagnostics", "import"],
  ])
    expect(await run(args, profile)).toEqual({ code: 2, stdout: "", stderr: "CLI_ARGUMENT_INVALID\n" })
  expect(existsSync(join(profile.base, "loginom-diagnostics-20261113T102030.zip"))).toBe(false)
})
