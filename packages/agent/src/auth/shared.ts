import fs from "node:fs/promises"
import { constants, type Stats } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { setTimeout } from "node:timers/promises"
import type { Oauth } from "."
import { cliCapabilities } from "@loginom-ai-agent/product/cli-capabilities"

declare const LOGINOM_AI_AGENT_LIBC: string | undefined

export function capabilities() {
  return cliCapabilities(
    process.platform,
    process.arch,
    typeof LOGINOM_AI_AGENT_LIBC === "string" ? LOGINOM_AI_AGENT_LIBC : undefined,
  )
}

// This store is opt-in for standalone CLI only. A dedicated directory must be
// mounted, not auth.json: rename must be visible to every running CLI profile.
export function directory() {
  const dir = process.env.LOGINOM_AI_AGENT_SHARED_AUTH_DIR
  if (!dir) return
  if (!capabilities().includes("shared-oauth-v1")) throw new Error("SHARED_AUTH_PLATFORM_UNSUPPORTED")
  if (!process.env.LOGINOM_AI_AGENT_CLI_ROOT) throw new Error("SHARED_AUTH_REQUIRES_STANDALONE")
  if (process.env.LOGINOM_AI_AGENT_AUTH_CONTENT) throw new Error("SHARED_AUTH_CONTENT_CONFLICT")
  if (!path.isAbsolute(dir) || path.normalize(dir) !== dir) throw new Error("SHARED_AUTH_DIRECTORY_INVALID")
  return dir
}

type Store = Record<string, unknown>
export type Session = { generation: string; userId: string; accountId: string; transaction?: string }
type Pending = { provider: string; transaction: string; generation: string }
const metadataKey = "$sharedOAuth"
let library: ReturnType<typeof loadLibrary> | undefined

async function loadLibrary() {
  const ffi = await import("bun:ffi")
  const symbols = { flock: { args: [ffi.FFIType.i32, ffi.FFIType.i32], returns: ffi.FFIType.i32 } } as const
  if (process.platform === "linux") {
    const lib = ffi.dlopen("libc.so.6", {
      ...symbols,
      __errno_location: { args: [], returns: ffi.FFIType.ptr },
    })
    return {
      flock: lib.symbols.flock,
      errno: () => new Int32Array(ffi.toArrayBuffer(lib.symbols.__errno_location()!, 0, 4))[0],
      busy: 11,
    }
  }
  if (process.platform === "darwin") {
    const lib = ffi.dlopen("/usr/lib/libSystem.B.dylib", {
      ...symbols,
      __error: { args: [], returns: ffi.FFIType.ptr },
    })
    return {
      flock: lib.symbols.flock,
      errno: () => new Int32Array(ffi.toArrayBuffer(lib.symbols.__error()!, 0, 4))[0],
      busy: 35,
    }
  }
  throw new Error("SHARED_AUTH_PLATFORM_UNSUPPORTED")
}

function privateEntry(info: Stats, kind: "file" | "directory") {
  if (
    !process.getuid ||
    info.uid !== process.getuid() ||
    (info.mode & 0o077) !== 0 ||
    (kind === "file" ? !info.isFile() || info.nlink !== 1 : !info.isDirectory())
  )
    throw new Error("SHARED_AUTH_PERMISSIONS_INVALID")
}

async function validateDirectory(dir: string) {
  privateEntry(await fs.lstat(dir), "directory")
  if ((await fs.realpath(dir)) !== dir) throw new Error("SHARED_AUTH_DIRECTORY_INVALID")
}

async function readFile(dir: string, name: string): Promise<Store | undefined> {
  const handle = await fs
    .open(path.join(dir, name), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return
      throw new Error("SHARED_AUTH_READ_FAILED")
    })
  if (!handle) return
  try {
    privateEntry(await handle.stat(), "file")
    const value: unknown = JSON.parse(await handle.readFile("utf8"))
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SHARED_AUTH_FORMAT_INVALID")
    return value as Store
  } catch {
    // Parsing errors may include credential text. Never propagate their body.
    throw new Error("SHARED_AUTH_READ_FAILED")
  } finally {
    await handle.close()
  }
}

async function syncDirectory(dir: string) {
  const handle = await fs.open(dir, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW)
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function writeFile(dir: string, name: string, data: Store | Pending) {
  const temporary = path.join(dir, `${name}.tmp-${randomUUID()}`)
  const handle = await fs.open(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  )
  try {
    try {
      await handle.writeFile(JSON.stringify(data, null, 2))
      await handle.sync()
    } finally {
      await handle.close()
    }
    await fs.rename(temporary, path.join(dir, name))
    await syncDirectory(dir)
  } finally {
    await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw new Error("SHARED_AUTH_TEMP_CLEANUP_FAILED")
    })
  }
}

async function clearPending(dir: string) {
  await fs.unlink(path.join(dir, "refresh-pending.json")).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw new Error("SHARED_AUTH_PENDING_REMOVE_FAILED")
  })
  await syncDirectory(dir)
}

// The permanent lock inode is never removed or replaced. Non-blocking flock
// keeps the event loop responsive while another process refreshes credentials.
async function locked<T>(dir: string, fn: () => Promise<T>, signal?: AbortSignal) {
  signal?.throwIfAborted()
  await validateDirectory(dir)
  library ??= loadLibrary()
  const lib = await library
  const filename = path.join(dir, "auth.json.lock")
  const handle = await fs.open(filename, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o600)
  try {
    const opened = await handle.stat()
    privateEntry(opened, "file")
    const until = performance.now() + 60_000
    while (lib.flock(handle.fd, 2 | 4) !== 0) {
      signal?.throwIfAborted()
      const errno = lib.errno()
      if (errno !== lib.busy && errno !== 4) throw new Error("SHARED_AUTH_LOCK_FAILED")
      if (performance.now() >= until) throw new Error("SHARED_AUTH_LOCK_TIMEOUT")
      await setTimeout(25, undefined, { signal })
    }
    signal?.throwIfAborted()
    await validateDirectory(dir)
    const current = await fs.lstat(filename)
    privateEntry(current, "file")
    if (current.dev !== opened.dev || current.ino !== opened.ino) throw new Error("SHARED_AUTH_LOCK_REPLACED")
    return await fn()
  } finally {
    // close releases flock even on cancellation; SIGKILL releases it in the OS.
    await handle.close()
  }
}

async function readUnlocked(dir: string) {
  await validateDirectory(dir)
  return (await readFile(dir, "auth.json")) ?? {}
}

export async function read(dir: string, signal?: AbortSignal) {
  return locked(
    dir,
    async () => {
      const data = await readUnlocked(dir)
      delete data[metadataKey]
      return data
    },
    signal,
  )
}

export async function mutate(dir: string, provider: string, update: (data: Store) => Store, signal?: AbortSignal) {
  await locked(
    dir,
    async () => {
      const data = await readUnlocked(dir)
      const pending = await readFile(dir, "refresh-pending.json")
      if (pending?.provider === provider) throw new Error("SHARED_AUTH_REFRESH_UNCERTAIN_RELOGIN_REQUIRED")
      const next = update({ ...data })
      if (
        provider === metadataKey ||
        JSON.stringify(next[metadataKey]) !== JSON.stringify(data[metadataKey]) ||
        JSON.stringify(next.openai) !== JSON.stringify(data.openai)
      )
        throw new Error("SHARED_AUTH_VERIFIED_LOGIN_REQUIRED")
      await writeFile(dir, "auth.json", next)
    },
    signal,
  )
}

function oauth(value: unknown): Oauth {
  if (
    !value ||
    typeof value !== "object" ||
    !("type" in value) ||
    value.type !== "oauth" ||
    !("refresh" in value) ||
    typeof value.refresh !== "string" ||
    !value.refresh ||
    !("access" in value) ||
    typeof value.access !== "string" ||
    !("expires" in value) ||
    typeof value.expires !== "number" ||
    !Number.isFinite(value.expires) ||
    value.expires < 0 ||
    ("accountId" in value && typeof value.accountId !== "string")
  )
    throw new Error("SHARED_AUTH_OAUTH_REQUIRED")
  return value as Oauth
}

function sessions(data: Store): Record<string, Session> {
  const value = data[metadataKey]
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("sessions" in value) ||
    !value.sessions ||
    typeof value.sessions !== "object" ||
    Array.isArray(value.sessions)
  )
    throw new Error("SHARED_AUTH_VERIFIED_LOGIN_REQUIRED")
  for (const session of Object.values(value.sessions)) {
    if (
      !session ||
      typeof session !== "object" ||
      typeof session.generation !== "string" ||
      !session.generation ||
      typeof session.userId !== "string" ||
      !session.userId ||
      typeof session.accountId !== "string" ||
      !session.accountId ||
      (session.transaction !== undefined && typeof session.transaction !== "string")
    )
      throw new Error("SHARED_AUTH_METADATA_INVALID")
  }
  return value.sessions as Record<string, Session>
}

function identity(auth: Oauth) {
  try {
    const claims = JSON.parse(Buffer.from(auth.access.split(".")[1], "base64url").toString())
    const userId = claims["https://api.openai.com/auth"]?.chatgpt_user_id ?? claims.chatgpt_user_id ?? claims.sub
    const accountId = claims["https://api.openai.com/auth"]?.chatgpt_account_id ?? claims.chatgpt_account_id
    if (
      typeof userId !== "string" ||
      !userId ||
      typeof accountId !== "string" ||
      !accountId ||
      (auth.accountId !== undefined && auth.accountId !== accountId)
    )
      throw new Error()
    return { userId, accountId }
  } catch {
    throw new Error("SHARED_AUTH_IDENTITY_INVALID")
  }
}

function sameSession(left: Session, right: Session) {
  return left.generation === right.generation && left.userId === right.userId && left.accountId === right.accountId
}

async function reconcile(dir: string, data: Store, provider: string) {
  const pending = await readFile(dir, "refresh-pending.json")
  if (!pending) return
  const session = sessions(data)[provider]
  if (
    pending.provider !== provider ||
    typeof pending.transaction !== "string" ||
    !pending.transaction ||
    !session ||
    session.transaction !== pending.transaction ||
    session.generation !== pending.generation
  )
    throw new Error("SHARED_AUTH_REFRESH_UNCERTAIN_RELOGIN_REQUIRED")
  const subject = identity(oauth(data[provider]))
  if (subject.userId !== session.userId || subject.accountId !== session.accountId)
    throw new Error("SHARED_AUTH_IDENTITY_CHANGED")
  await clearPending(dir)
}

// Only a successful OAuth callback may establish a new login generation.
// The metadata and tokens are in one atomic file, so a leftover pending marker
// can be reconciled only with the exact committed refresh transaction.
export async function login(dir: string, provider: string, auth: Oauth, signal?: AbortSignal) {
  if (provider !== "openai") throw new Error("SHARED_AUTH_PROVIDER_UNSUPPORTED")
  await locked(
    dir,
    async () => {
      const data = await readUnlocked(dir)
      const subject = identity(oauth(auth))
      const previous = data[metadataKey] === undefined ? {} : sessions(data)
      await writeFile(dir, "auth.json", {
        ...data,
        [provider]: auth,
        [metadataKey]: { version: 1, sessions: { ...previous, [provider]: { ...subject, generation: randomUUID() } } },
      })
      const pending = await readFile(dir, "refresh-pending.json")
      if (pending?.provider === provider) await clearPending(dir)
    },
    signal,
  )
}

export async function logout(dir: string, provider: string, signal?: AbortSignal) {
  await locked(
    dir,
    async () => {
      const data = await readUnlocked(dir)
      delete data[provider]
      if (data[metadataKey] !== undefined) {
        const previous = sessions(data)
        delete previous[provider]
        data[metadataKey] = { version: 1, sessions: previous }
      }
      await writeFile(dir, "auth.json", data)
      const pending = await readFile(dir, "refresh-pending.json")
      if (pending?.provider === provider) await clearPending(dir)
    },
    signal,
  )
}

export async function snapshot(dir: string, provider: string, signal?: AbortSignal) {
  return locked(
    dir,
    async () => {
      const data = await readUnlocked(dir)
      await reconcile(dir, data, provider)
      const auth = oauth(data[provider])
      const session = sessions(data)[provider]
      const subject = identity(auth)
      if (!session || session.userId !== subject.userId || session.accountId !== subject.accountId)
        throw new Error("SHARED_AUTH_IDENTITY_CHANGED")
      return { auth, session }
    },
    signal,
  )
}

export async function refresh(
  dir: string,
  provider: string,
  exchange: (auth: Oauth) => Promise<Oauth>,
  signal?: AbortSignal,
  expected?: Session,
) {
  return locked(
    dir,
    async () => {
      const data = await readUnlocked(dir)
      await reconcile(dir, data, provider)
      const auth = oauth(data[provider])
      const previous = sessions(data)
      const session = previous[provider]
      const subject = identity(auth)
      if (
        !session ||
        (expected && !sameSession(session, expected)) ||
        session.userId !== subject.userId ||
        session.accountId !== subject.accountId
      )
        throw new Error("SHARED_AUTH_IDENTITY_CHANGED")
      if (auth.access && auth.expires > Date.now() + 30_000) return auth
      // A crash or ambiguous network response must not replay a rotating token.
      const transaction = randomUUID()
      await writeFile(dir, "refresh-pending.json", { provider, transaction, generation: session.generation })
      if (signal?.aborted) {
        // No exchange has been sent, so this marker cannot represent a rotation.
        await clearPending(dir)
        signal.throwIfAborted()
      }
      const next = oauth(await exchange(auth))
      const nextSubject = (() => {
        try {
          return identity(next)
        } catch {
          return undefined
        }
      })()
      if (!nextSubject || nextSubject.userId !== session.userId || nextSubject.accountId !== session.accountId) {
        // Preserve rotated credentials, but never bless them for another subject.
        await writeFile(dir, "auth.json", { ...data, [provider]: next })
        throw new Error("SHARED_AUTH_IDENTITY_CHANGED")
      }
      await writeFile(dir, "auth.json", {
        ...data,
        [provider]: next,
        [metadataKey]: { version: 1, sessions: { ...previous, [provider]: { ...session, transaction } } },
      })
      await clearPending(dir)
      return next
    },
    signal,
  )
}

export * as SharedAuth from "./shared"
