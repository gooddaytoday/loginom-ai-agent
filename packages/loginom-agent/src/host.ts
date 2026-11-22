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

export type Lease = NonNullable<Awaited<ReturnType<typeof LoginomHost.acquire>>>
export type Connection = { port: Port; close(): Promise<void> }

type Started = {
  readonly directory: string
  ready: Promise<Connection | undefined>
  held: Map<Lease, string>
  closing?: Promise<void>
}

const state: { current?: Started } = {}

/**
 * Starts the process's Host in `<data>/loginom`, the Loginom directory of the server's profile: connection, recovery
 * journal and lease records. First it recovers the leases an earlier process left: one that was killed or stopped
 * without disposing its plugins (B0.4, Windows `service stop`) still has their records. They are removed and returned;
 * the Host itself drops that process's uncertain journal entries when it opens them, without replaying anything (G4).
 * The Node host comes from `resources` and starts in the background, so the server does not wait for its handshake.
 * `connect` replaces it in tests.
 */
export async function start(input: { data: string; resources?: string; connect?: () => Promise<Connection> }) {
  if (state.current && !state.current.closing) throw Error("LOGINOM_HOST_ALREADY_STARTED")
  await state.current?.closing
  const root = join(input.data, "loginom")
  const directory = join(root, "leases")
  await mkdir(directory, { recursive: true, mode: 0o700 })
  // This process has leased nothing yet, so every record here belongs to an earlier one.
  const recovered = await Promise.all(
    (await readdir(directory))
      .filter((name) => name.endsWith(".json") || name.endsWith(".tmp"))
      .map(async (name) => {
        const file = join(directory, name)
        const session = await readFile(file, "utf8").then(
          (text) => (JSON.parse(text) as { session?: unknown }).session,
          () => undefined,
        )
        await rm(file, { force: true })
        return typeof session === "string" ? [session] : []
      }),
  ).then((sessions) => sessions.flat())
  const connect = input.connect ?? (input.resources ? nodeHost(root, input.resources) : undefined)
  const current: Started = { directory, ready: Promise.resolve(undefined), held: new Map() }
  current.ready = (connect?.() ?? Promise.resolve(undefined)).then(
    (connection) => {
      if (connection && current.closing) return connection.close().then(() => undefined)
      if (connection) LoginomHost.connect(connection.port)
      return connection
    },
    () => undefined,
  )
  state.current = current
  return { recovered, close }
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

/** A Host run for one execution of `session`, recorded until `release`; `undefined` without a ready Host. */
export async function acquire(session: string) {
  const current = state.current
  if (!current || current.closing) return undefined
  if (!(await current.ready) || current.closing) return undefined
  // Recorded before the Host run exists, so a process killed at any point after this leaves the record behind.
  const file = join(current.directory, randomUUID() + ".json")
  await writeFile(file + ".tmp", JSON.stringify({ session, pid: process.pid }), { mode: 0o600 })
  await rename(file + ".tmp", file)
  const lease = await LoginomHost.acquire(session).catch(() => undefined)
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

// The bundled Node and the Host entry that `build-cli.ts` stages into the resources (`host/node-host.mjs`).
function nodeHost(root: string, resources: string) {
  return () =>
    launchNodeHost({
      node: join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"),
      entry: join(resources, "host", "node-host.mjs"),
      root,
      resources,
      // As the Desktop Host of 0.4: the user sees the browser at work. The CLI's `--headless` is stage B2.7.
      headless: false,
      environment: process.env,
    })
}
