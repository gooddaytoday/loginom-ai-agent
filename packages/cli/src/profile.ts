export * as CliProfile from "./profile"

import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { Product, productChannel } from "@loginom-ai-agent/product"
import { cliProfile, cliProfileService, profilePaths } from "@loginom-ai-agent/product/cli-profile"
import { Effect, Option, Schema } from "effect"
import { LOGINOM_AI_AGENT_CHANNEL } from "./version"
import { protectWindowsProfile } from "./profile-windows"

// Loginom AI Agent (B2.7c, G2): profiles of the product CLI, as in 0.4 (`a080f7725c:packages/opencode/src/cli/profile.ts`).
// The product CLI entry (`loginom-cli.ts`) applies a profile before the CLI loads: its data, config, state and cache live
// in the profile root, and it has its own service. The server of the profile holds its writer latch. Nothing here may
// import `@opencode/util/global`: it fixes its paths on import, after `apply`.

// The product channel of this build, read as `util/src/global.ts` reads it.
const channel = productChannel(LOGINOM_AI_AGENT_CHANNEL === "latest" ? "prod" : LOGINOM_AI_AGENT_CHANNEL)

const decodeMarker = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      format: Schema.Literal("loginom-cli"),
      version: Schema.Literal(1),
      channel: Schema.Literal(channel),
    }),
  ),
)
const decodeOwner = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ pid: Schema.Number, nonce: Schema.String, service: Schema.Boolean })),
)

/**
 * Applies the CLI profile to this process and to every process it starts: the absolute `LOGINOM_AI_AGENT_CLI_PROFILE`,
 * or the default profile of the channel. Fails with a `PROFILE_*` code when the root cannot be a profile.
 */
export function apply(env: NodeJS.ProcessEnv = process.env) {
  const paths = open(cliProfile({ channel, root: env.LOGINOM_AI_AGENT_CLI_PROFILE, env }).root)
  const service = cliProfileService(paths.root, channel)
  // A CLI started from a Desktop terminal or a service's tool inherits their settings (B1.3a). Each one is replaced, not
  // kept when present, so it can neither redirect the profile's writes, nor supply its configuration, nor pick its service.
  delete env.LOGINOM_AI_AGENT_AUTH_CONTENT
  delete env.LOGINOM_AI_AGENT_CONFIG
  delete env.LOGINOM_AI_AGENT_CONFIG_CONTENT
  Object.assign(env, {
    LOGINOM_AI_AGENT_CLI_ROOT: paths.root,
    LOGINOM_AI_AGENT_CONFIG_DIR: paths.config,
    LOGINOM_AI_AGENT_DB: path.join(paths.data, Product.database),
    LOGINOM_AI_AGENT_SERVICE_IDENTITY: service.identity,
    LOGINOM_AI_AGENT_SERVICE_PORT: String(service.port),
  })
  return paths
}

/** The profile of this process: applied here or by the process that started it. */
export function current() {
  const root = process.env.LOGINOM_AI_AGENT_CLI_ROOT
  return root ? profilePaths(root) : undefined
}

/**
 * Holds the writer latch of the profile for the server's scope. A service that finds the profile's service starting in
 * another process leaves, as it does when it finds it listening (`"incumbent"`), and its client waits for that service.
 * Any other second writer fails with `PROFILE_BUSY` and exit code 3, as a second CLI process did in 0.4 (design §10).
 */
export const hold = Effect.fnUntraced(function* (root: string, service: boolean) {
  return yield* Effect.acquireRelease(
    Effect.tryPromise({ try: () => take(root, service), catch: (error) => error }),
    (latch) =>
      Effect.tryPromise(() => latch.release()).pipe(
        Effect.catch((cause) => Effect.logWarning("failed to release the CLI profile writer latch", { cause })),
      ),
  ).pipe(
    Effect.as("held" as const),
    Effect.catchIf(
      (error) => error instanceof Busy && service && error.owner?.service === true,
      () => Effect.succeed("incumbent" as const),
    ),
    // The CLI keeps this code when the server fails (`index.ts`), and a client keeps its private server's.
    Effect.tapError((error) =>
      Effect.sync(() => {
        if (error instanceof Busy) process.exitCode = 3
      }),
    ),
  )
})

export class Busy extends Error {
  constructor(
    readonly root: string,
    readonly owner?: { readonly pid: number; readonly service: boolean },
  ) {
    super(`PROFILE_BUSY: the CLI profile ${root} is open in another process${owner ? ` (pid ${owner.pid})` : ""}`)
  }
}

/**
 * Takes `.writer`, the latch of 0.4: a directory created exclusively, with an `owner` file. One server writes a profile at
 * a time: its database, its Loginom Host and its session executions. A latch whose owner process is gone is taken over,
 * unlike in 0.4: v2 stops its service with SIGKILL after the stop budget and exits on its shutdown deadline without
 * finalizers, so a latch that outlived its owner would keep the profile closed until someone removes it. A latch of a 0.4
 * CLI (its owner has no pid) and one whose owner never appeared stay, as in 0.4. A pid reused by another process only
 * keeps the profile busy, never opens it twice.
 */
export async function take(root: string, service: boolean, retry = true): Promise<{ release(): Promise<void> }> {
  const lock = path.join(root, ".writer")
  const nonce = randomUUID()
  if (await fsp.mkdir(lock, { mode: 0o700 }).then(() => true, existing)) {
    await fsp.writeFile(path.join(lock, "owner"), JSON.stringify({ pid: process.pid, nonce, service }), {
      flag: "wx",
      mode: 0o600,
    })
    return { release: () => release(lock, nonce) }
  }
  const text = await fsp.readFile(path.join(lock, "owner"), "utf8").catch(() => undefined)
  const owner = text === undefined ? undefined : Option.getOrUndefined(decodeOwner(text))
  if (!retry || text === undefined || owner === undefined || alive(owner.pid)) throw new Busy(root, owner)
  await clear(lock, text, root)
  return take(root, service, false)
}

// Moves the dead owner's file aside and removes the latch. Only the process that created `.writer` writes its owner, so
// a moved file that is not the dead one belongs to a process that took the latch meanwhile and is put back.
async function clear(lock: string, text: string, root: string) {
  const owner = path.join(lock, "owner")
  const moved = path.join(lock, `owner.${randomUUID()}`)
  if (!(await fsp.rename(owner, moved).then(() => true, missing))) return
  if ((await fsp.readFile(moved, "utf8")) !== text) {
    await fsp.rename(moved, owner)
    throw new Busy(root)
  }
  await fsp.rm(moved)
  await fsp.rmdir(lock).catch(() => undefined)
}

async function release(lock: string, nonce: string) {
  const owner = path.join(lock, "owner")
  if (Option.getOrUndefined(decodeOwner(await fsp.readFile(owner, "utf8")))?.nonce !== nonce)
    throw new Error("PROFILE_OWNER_CHANGED")
  await fsp.unlink(owner)
  await fsp.rmdir(lock)
}

function alive(pid: number) {
  if (pid === process.pid) return true
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return code(error) === "EPERM"
  }
}

function existing(error: unknown) {
  if (code(error) === "EEXIST") return false
  throw error
}

function missing(error: unknown) {
  if (code(error) === "ENOENT") return false
  throw error
}

function code(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? error.code : undefined
}

// Opens the profile root without its writer latch, because the clients of the profile's service open it too. A Desktop
// directory is never a CLI profile, and unknown data is never adopted.
function open(root: string) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 })
  const canonical = fs.realpathSync.native(root)
  const name = path.basename(canonical)
  if (
    Object.values(Product.channels).some((value) => value === name) ||
    [Product.slug, `${Product.slug}-dev`, `${Product.slug}-beta`].includes(name)
  )
    throw new Error("PROFILE_DESKTOP_ROOT")
  if (process.platform === "win32") protectWindowsProfile(canonical)
  owned(fs.statSync(canonical))
  admit(canonical)
  const paths = profilePaths(canonical)
  ;[paths.config, paths.data, paths.state, paths.cache, paths.tmp, paths.loginom].forEach((directory) => {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const info = fs.lstatSync(directory)
    if (!info.isDirectory() || fs.realpathSync.native(directory) !== directory) throw new Error("PROFILE_PATH_INVALID")
    owned(info)
  })
  return paths
}

// A profile is private to its user, as in 0.4. On Windows the ACL check is `protectWindowsProfile`, run in `open`.
function owned(info: fs.Stats) {
  if (process.platform === "win32") return
  if ((process.getuid && info.uid !== process.getuid()) || (info.mode & 0o077) !== 0)
    throw new Error("PROFILE_PERMISSIONS_INVALID")
}

// A profile is an empty directory or one this CLI marked (`cli-profile.json` of 0.4). Clients of one service may open a
// new profile together: the marker is created exclusively, and whoever loses reads the winner's.
function admit(root: string) {
  const marker = path.join(root, "cli-profile.json")
  const entries = fs.readdirSync(root)
  if (!entries.includes("cli-profile.json")) {
    if (entries.some((name) => name !== ".writer")) throw new Error("PROFILE_FORMAT_INVALID")
    create(marker, JSON.stringify({ format: "loginom-cli", version: 1, channel }))
  }
  if (fs.lstatSync(marker).isSymbolicLink() || Option.isNone(decodeMarker(fs.readFileSync(marker, "utf8"))))
    throw new Error("PROFILE_FORMAT_INVALID")
}

function create(file: string, content: string) {
  try {
    fs.writeFileSync(file, content, { flag: "wx", mode: 0o600 })
  } catch (error) {
    existing(error)
  }
}
