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
]

// A CLI profile after one `run`: stores with planted values, the chat database
// and runtime attempts of two sessions.
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
  db.run("CREATE TABLE session (id TEXT PRIMARY KEY, parent_id TEXT, slug TEXT, title TEXT, version TEXT, agent TEXT, model TEXT, time_created INTEGER, time_updated INTEGER)")
  db.run("CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, data TEXT)")
  db.run("CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, data TEXT)")
  for (const [id, updated] of [["ses_old", 1], ["ses_new", 2]] as const) {
    db.run("INSERT INTO session VALUES (?, NULL, ?, ?, '1', 'build', '{}', 1, ?)", [id, id, `title ${id}`, updated])
    db.run("INSERT INTO message VALUES (?, ?, 1, ?)", [`msg_${id}`, id, JSON.stringify({ role: "user" })])
    db.run("INSERT INTO part VALUES (?, ?, ?, ?)", [
      `prt_${id}`,
      `msg_${id}`,
      id,
      JSON.stringify({ type: "text", text: `request of ${id}; proxy http://10.4.4.4:3128/ next; ${echo}` }),
    ])
    put(
      join(paths.loginom, "runtime", "generations", "1", "chats", sha(id), "attempts", "a1", "execution-events.jsonl"),
      JSON.stringify({ phase: "node_step_completed", text: `attempt of ${id}; ${echo}` }) + "\n",
    )
  }
  db.close()
  put(join(paths.data, "log", "loginom-ai-agent.log"), `server log ${echo}\n`)
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

test("--no-chat never opens the chat database and leaves the chat out", async () => {
  const profile = await cliProfile()
  // A database that cannot be read must not matter when the chat is not requested.
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
      expect(manifest).toMatchObject({ chat: "unavailable", chatReason: "database-unreadable" })
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
    if (this === writer || !sql.startsWith("SELECT id, message_id, data FROM part")) return statement
    const all = statement.all.bind(statement)
    return Object.assign(Object.create(statement), {
      all: (...args: unknown[]) => {
        const rows = all(...(args as []))
        writer.run("INSERT INTO message VALUES ('msg_late', 'ses_new', 2, ?)", [JSON.stringify({ role: "assistant" })])
        writer.run("INSERT INTO part VALUES ('prt_late', 'msg_late', 'ses_new', ?)", [JSON.stringify({ type: "text", text: "late" })])
        return rows
      },
    })
  } as typeof query
  try {
    const output = join(profile.base, "snapshot.zip")
    expect((await run(["diagnostics", "export", "--output", output], profile)).code).toBe(0)
    const chat = JSON.parse((await unpack(output)).files.get("chat/session.json")!)
    expect(writer.query("SELECT count(*) AS n FROM message WHERE id = 'msg_late'").get()).toEqual({ n: 1 })
    expect(chat.messages.map((message: any) => [message.info.id, message.parts.length])).toEqual([["msg_ses_new", 1]])
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
  db.run("INSERT INTO part VALUES ('prt_plain', 'msg_ses_old', 'ses_old', ?)", [
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
