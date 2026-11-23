// The Loginom Host of the server process (stage B2.3, guarantees G3 and G4). One private Node host per process, as the
// standalone CLI of 0.4 ran it (`standalone-run.ts`): `node-entry.ts` composes the shared Host with the profile's
// connection through `cliCredentials` (decision В-97, п. 4) and stops itself when its owner disappears. The server starts
// it at boot (`cli/src/server-process.ts`), before any Location activates; each Location's product plugin leases it for
// the executions of its sessions. Without `start` there is no Host and every lease is `undefined`.
export * as ServiceHost from "./host"

import { randomUUID } from "node:crypto"
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { LoginomHost } from "@loginom-ai-agent/loginom-host/adapter"
import { launchNodeHost } from "@loginom-ai-agent/loginom-host/node-client"
import type { Port } from "@loginom-ai-agent/loginom-host/transport"
import { Option, Schema } from "effect"

export type Lease = NonNullable<Awaited<ReturnType<typeof LoginomHost.acquire>>>
export type Connection = {
  port: Port
  close(): Promise<void>
  request?: (method: string, input: unknown) => Promise<unknown>
}

type Started = {
  readonly directory: string
  ready: Promise<Connection | undefined>
  connected?: boolean
  held: Map<Lease, string>
  closing?: Promise<void>
}

const state: { current?: Started } = {}
const decodeRecord = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ session: Schema.String, pid: Schema.Number })),
)
const decodeStatus = Schema.decodeUnknownOption(
  Schema.Struct({ generation: Schema.Number, recoveries: Schema.optional(Schema.Array(Schema.String)) }),
)

/**
 * Starts the process's Host in `<data>/loginom`, the Loginom directory of the server's profile: connection, recovery
 * journal and lease records. First it recovers the leases an earlier process left: one that was killed or stopped
 * without disposing its plugins (B0.4, Windows `service stop`) still has their records. They are removed and returned;
 * the Host itself drops that process's uncertain journal entries when it opens them, without replaying anything (G4).
 * The Node host comes from `resources` and starts in the background, so the server does not wait for its handshake.
 * `connect` replaces it in tests. A file system failure here only leaves the server without leases, never stops it.
 */
export async function start(input: { data: string; resources?: string; connect?: () => Promise<Connection> }) {
  if (state.current && !state.current.closing) throw Error("LOGINOM_HOST_ALREADY_STARTED")
  await state.current?.closing
  const root = join(input.data, "loginom")
  const directory = join(root, "leases")
  await mkdir(directory, { recursive: true, mode: 0o700 }).catch(() => undefined)
  // This process has leased nothing yet. A record of a process that is still alive stays: one data directory normally
  // has one server (U5), but a parallel `serve` or a service contender that loses the port also starts here. Anything
  // else, including a record cut short by a kill, belongs to a stopped process.
  const recovered = await Promise.all(
    (await readdir(directory).catch(() => []))
      .filter((name) => name.endsWith(".json") || name.endsWith(".tmp"))
      .map(async (name) => {
        const file = join(directory, name)
        const record = Option.getOrUndefined(decodeRecord(await readFile(file, "utf8").catch(() => "")))
        if (record && record.pid !== process.pid && alive(record.pid)) return []
        await rm(file, { force: true }).catch(() => undefined)
        return record ? [record.session] : []
      }),
  ).then((sessions) => sessions.flat())
  const connect = input.connect ?? (input.resources ? nodeHost(root, input.resources) : undefined)
  const current: Started = { directory, ready: Promise.resolve(undefined), held: new Map() }
  current.ready = (connect?.() ?? Promise.resolve(undefined)).then(
    (connection) => {
      if (connection && current.closing) return connection.close().then(() => undefined)
      if (connection) LoginomHost.connect(connection.port)
      current.connected = !!connection
      return connection
    },
    () => undefined,
  )
  state.current = current
  return { recovered, close }
}

/** Whether the Host finished its handshake: before that, `acquire` waits for it (up to the handshake's 180 s). */
export function connected() {
  return !!state.current?.connected && !state.current.closing
}

/**
 * The checks 0.4's product CLI made before the model (`v0.4.0:packages/opencode/src/cli/standalone-run.ts`), for the
 * product CLI's `run` (B2.7a4b): an operation the strict recovery journal keeps refuses any request
 * (`LOGINOM_RECOVERY_REQUIRED`); an automation request needs a saved connection (`LOGINOM_CONFIG_REQUIRED`) and ready
 * Help (`LOGINOM_CONNECTION_NOT_READY`), not the browser. Waits for the Host's handshake. Without a Host, as in a run
 * from source without resources, there is no journal to keep anything, and Loginom is not ready.
 */
export async function preflight(automation: boolean) {
  const connection = await state.current?.ready
  if (!connection?.request) return automation ? "LOGINOM_CONNECTION_NOT_READY" : undefined
  const status = Option.getOrUndefined(decodeStatus(await connection.request("connection.status", {})))
  if (!status) return "LOGINOM_REPLY_INVALID"
  if (status.recoveries?.length) return "LOGINOM_RECOVERY_REQUIRED"
  if (!automation) return undefined
  if (!status.generation) return "LOGINOM_CONFIG_REQUIRED"
  return connection.request("connection.ready", {}).then(
    () => undefined,
    () => "LOGINOM_CONNECTION_NOT_READY",
  )
}

/** Releases every lease still held, disconnects and closes the Host. Idempotent: soft stop (B2.3b) may call it first. */
export function close() {
  const current = state.current
  if (!current) return Promise.resolve()
  current.closing ??= (async () => {
    await Promise.all([...current.held.keys()].map(release))
    const connection = await current.ready
    LoginomHost.disconnect()
    await connection?.close()
  })()
  return current.closing
}

/**
 * A Host run for one execution of `session`, recorded until `release`; `undefined` without a ready Host. A Host that
 * refuses the run rejects with its reason (for example `LOGINOM_RECOVERY_REQUIRED`), which the model is told (B2.5d).
 */
export async function acquire(session: string) {
  const current = state.current
  if (!current || current.closing) return undefined
  if (!(await current.ready) || current.closing) return undefined
  // Recorded before the Host run exists, so a process killed at any point after this leaves the record behind.
  const file = join(current.directory, randomUUID() + ".json")
  await writeFile(file + ".tmp", JSON.stringify({ session, pid: process.pid }), { mode: 0o600 })
  await rename(file + ".tmp", file)
  const lease = await LoginomHost.acquire(session).catch(async (error) => {
    await rm(file, { force: true })
    throw error
  })
  if (!lease) {
    await rm(file, { force: true })
    return undefined
  }
  current.held.set(lease, file)
  return lease
}

export async function release(lease: Lease) {
  const current = state.current
  const file = current?.held.get(lease)
  current?.held.delete(lease)
  await lease.release()
  if (file) await rm(file, { force: true })
}

function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as { code?: string }).code === "EPERM"
  }
}

// The bundled Node and the Host entry that `build-cli.ts` stages into the resources (`host/node-host.mjs`).
function nodeHost(root: string, resources: string) {
  return () =>
    launchNodeHost({
      node: join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"),
      entry: join(resources, "host", "node-host.mjs"),
      root,
      resources,
      // As the Desktop Host of 0.4, the user sees the browser at work. The product CLI's `run --headless` reaches only the
      // private server of that run (B2.7a4b): the profile's service started its Host before, for every client. Strict
      // recovery holds for a server of a CLI profile started with it, as for each process of 0.4's CLI; never for
      // Desktop's (`loginom-host/AGENTS.md`).
      headless: process.env.LOGINOM_AI_AGENT_HEADLESS === "1",
      // Desktop's service gets the application version (B4.9), as 0.4's Desktop Host did; a built CLI's Host reads its
      // version from `cli-manifest.json`, so a profile's service ignores the value a Desktop terminal passed down.
      resourceVersion:
        process.env.LOGINOM_AI_AGENT_CLI_ROOT === undefined
          ? process.env.LOGINOM_AI_AGENT_RESOURCE_VERSION || undefined
          : undefined,
      strictRecovery:
        process.env.LOGINOM_AI_AGENT_CLI_ROOT !== undefined && process.env.LOGINOM_AI_AGENT_STRICT_RECOVERY === "1",
      environment: process.env,
    })
}
