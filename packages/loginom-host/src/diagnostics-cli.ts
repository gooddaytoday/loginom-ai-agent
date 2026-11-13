import { lstatSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { cliCredentials } from "./connection/cli-credentials"
import { buildDiagnosticsArchive, profileSecrets } from "./diagnostics-export"

// `loginom-ai-agent-cli diagnostics export [--session <id>] [--output <path>] [--no-chat]`.
// Reads the profile without taking its guard, so it works while a `run` hangs.
// No host, no browser, no network. stdout carries only the archive path.

export type DiagnosticsProfile = { root: string; data: string; loginom: string }
export type DiagnosticsCliOptions = {
  cwd?: string
  now?: Date
  environment?: NodeJS.ProcessEnv
  stdout?: (text: string) => void
  stderr?: (text: string) => void
  /** Installed CLI root with `cli-manifest.json` and `resources/loginom`. */
  installed?: string
  version?: string
  channel?: string
}

type Row = Record<string, unknown>

const SESSION_ID = /^[A-Za-z0-9_-]{1,200}$/

export async function diagnosticsCommand(args: string[], paths: DiagnosticsProfile, options: DiagnosticsCliOptions = {}) {
  const stdout = options.stdout ?? ((text: string) => process.stdout.write(text))
  const stderr = options.stderr ?? ((text: string) => process.stderr.write(text))
  const environment = options.environment ?? process.env
  let parsed
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: { session: { type: "string" }, output: { type: "string" }, "no-chat": { type: "boolean" } },
    })
  } catch {
    stderr("CLI_ARGUMENT_INVALID\n")
    return 2
  }
  const { session, output } = parsed.values
  if (
    parsed.positionals.length !== 2 ||
    parsed.positionals[0] !== "diagnostics" ||
    parsed.positionals[1] !== "export" ||
    (session !== undefined && !SESSION_ID.test(session)) ||
    (output !== undefined && !output)
  ) {
    stderr("CLI_ARGUMENT_INVALID\n")
    return 2
  }
  const now = options.now ?? new Date()
  const target = resolve(options.cwd ?? process.cwd(), output ?? `loginom-diagnostics-${stamp(now)}.zip`)
  if (lstatSync(target, { throwIfNoEntry: false })) {
    stderr("DIAGNOSTICS_OUTPUT_EXISTS\n")
    return 1
  }
  try {
    let chatStatus = parsed.values["no-chat"] ? "not-requested" : "unavailable"
    let chatReason: string | undefined
    let chat: unknown
    let sessionID = session
    // --no-chat never opens the chat database. A damaged or incomplete database
    // leaves the chat unavailable; runtime and logs are exported anyway.
    if (!parsed.values["no-chat"]) {
      let store: Awaited<ReturnType<typeof openSessions>>
      try {
        store = await openSessions(join(paths.data, "loginom-ai-agent.db"))
        sessionID ??= store?.latest()
        if (store && sessionID) {
          chat = store.export(sessionID)
          chatStatus = chat ? "included" : "not-found"
        }
      } catch {
        chat = undefined
        chatStatus = "unavailable"
        chatReason = "database-unreadable"
      } finally {
        try {
          store?.close()
        } catch {}
      }
    }
    const installed = options.installed ?? resolve(dirname(process.execPath), "..")
    const resources = environment.LOGINOM_AI_AGENT_CLI_BUNDLE ?? join(installed, "resources", "loginom")
    const known = await profileSecrets({
      loginom: paths.loginom,
      data: paths.data,
      codec: credentialsFor(paths.loginom, resources),
      dockHome: environment.LOGINOM_DOCK_HOME || join(homedir(), ".loginom-dock"),
    })
    const { zip, manifest } = await buildDiagnosticsArchive({
      runtime: join(paths.loginom, "runtime"),
      sessionID,
      chat,
      logs: [{ dir: join(paths.data, "log"), prefix: "cli" }],
      knownSecrets: known.secrets,
      users: known.users,
      manifest: {
        generated: now.toISOString(),
        product: "cli",
        version: options.version,
        channel: options.channel,
        ...buildProvenance(installed),
        platform: process.platform,
        arch: process.arch,
        versions: process.versions,
        knownSecrets: known.status,
        chat: chatStatus,
        ...(chatReason ? { chatReason } : {}),
      },
    })
    try {
      writeFileSync(target, zip, { mode: 0o600, flag: "wx" })
    } catch (error) {
      // The file may appear after the check above; it is still never overwritten.
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw Error("DIAGNOSTICS_OUTPUT_EXISTS")
      throw error
    }
    const files = manifest.files as Array<{ status: string; reason?: string }>
    const reasons = new Map<string, number>()
    for (const file of files.filter((item) => item.status !== "included"))
      reasons.set(file.reason ?? "omitted", (reasons.get(file.reason ?? "omitted") ?? 0) + 1)
    stderr(
      `included ${files.length - [...reasons.values()].reduce((a, b) => a + b, 0)} files, omitted ${[...reasons.values()].reduce((a, b) => a + b, 0)}` +
        [...reasons].map(([reason, count]) => `, ${reason}: ${count}`).join("") +
        `; session: ${sessionID ? "selected" : "recent attempts"}; chat: ${chatStatus}\n`,
    )
    stdout(target + "\n")
    return 0
  } catch (error) {
    // Never print filesystem errors: they may embed paths or log content.
    stderr(error instanceof Error && error.message === "DIAGNOSTICS_OUTPUT_EXISTS" ? "DIAGNOSTICS_OUTPUT_EXISTS\n" : "DIAGNOSTICS_FAILED\n")
    return 1
  }
}

function stamp(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "")
}

function credentialsFor(root: string, resources: string) {
  try {
    return cliCredentials(process.platform, isAbsolute(resources) ? { root, resources } : undefined)
  } catch {
    return undefined
  }
}

// Provenance of the installed payload, read without verification: diagnostics
// must work for a damaged installation too.
function buildProvenance(installed: string) {
  try {
    const metadata = JSON.parse(readFileSync(join(installed, "cli-manifest.json"), "utf8"))?.metadata
    if (!metadata || typeof metadata !== "object") return { cliManifest: "invalid" }
    const { version, channel, browserRecovery, sourceCommit, sourceTreeSha256, sourceDirty } = metadata as Row
    return { cliManifest: { version, channel, browserRecovery, sourceCommit, sourceTreeSha256, sourceDirty } }
  } catch {
    return { cliManifest: "unavailable" }
  }
}

// The chat in the `opencode export` shape `{ info, messages: [{ info, parts }] }`,
// read through a separate read-only connection: the running CLI keeps writing.
async function openSessions(file: string) {
  if (!lstatSync(file, { throwIfNoEntry: false })?.isFile()) return
  const { Database } = await import("bun:sqlite")
  const db = new Database(file, { readonly: true })
  const json = (value: unknown) => {
    if (typeof value !== "string") return {}
    try {
      const parsed: unknown = JSON.parse(value)
      return parsed && typeof parsed === "object" ? (parsed as Row) : {}
    } catch {
      return {}
    }
  }
  return {
    latest() {
      const row = db
        .query("SELECT id FROM session WHERE parent_id IS NULL ORDER BY time_updated DESC, id DESC LIMIT 1")
        .get() as Row | null
      return typeof row?.id === "string" ? row.id : undefined
    },
    export(sessionID: string) {
      const session = db.query("SELECT * FROM session WHERE id = ?").get(sessionID) as Row | null
      if (!session) return
      const parts = new Map<string, Row[]>()
      for (const part of db
        .query("SELECT id, message_id, data FROM part WHERE session_id = ? ORDER BY message_id, id")
        .all(sessionID) as Row[]) {
        const list = parts.get(String(part.message_id)) ?? []
        list.push({ ...json(part.data), id: part.id, sessionID, messageID: part.message_id })
        parts.set(String(part.message_id), list)
      }
      const messages = (
        db.query("SELECT id, data FROM message WHERE session_id = ? ORDER BY time_created, id").all(sessionID) as Row[]
      ).map((message) => ({
        info: { ...json(message.data), id: message.id, sessionID },
        parts: parts.get(String(message.id)) ?? [],
      }))
      return {
        info: {
          id: session.id,
          slug: session.slug,
          title: session.title,
          version: session.version,
          parentID: session.parent_id ?? undefined,
          agent: session.agent ?? undefined,
          model: json(session.model),
          time: { created: session.time_created, updated: session.time_updated },
        },
        messages,
      }
    },
    close() {
      db.close()
    },
  }
}
