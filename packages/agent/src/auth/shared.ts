import fs from "node:fs/promises"
import { constants, type Stats } from "node:fs"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { setTimeout } from "node:timers/promises"
import type { Oauth } from "."

// This store is opt-in for standalone CLI only. A dedicated directory must be
// mounted, not auth.json: rename must be visible to every running CLI profile.
export function directory() {
  const dir = process.env.LOGINOM_AI_AGENT_SHARED_AUTH_DIR
  if (!dir) return
  if (!process.env.LOGINOM_AI_AGENT_CLI_ROOT) throw new Error("SHARED_AUTH_REQUIRES_STANDALONE")
  if (process.env.LOGINOM_AI_AGENT_AUTH_CONTENT) throw new Error("SHARED_AUTH_CONTENT_CONFLICT")
  if (!path.isAbsolute(dir) || path.normalize(dir) !== dir) throw new Error("SHARED_AUTH_DIRECTORY_INVALID")
  return dir
}

type Store = Record<string, unknown>
type Pending = { provider: string; fingerprint: string }
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
    .open(path.join(dir, name), constants.O_RDONLY | constants.O_NOFOLLOW)
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
  return locked(dir, () => readUnlocked(dir), signal)
}

export async function mutate(dir: string, provider: string, update: (data: Store) => Store, signal?: AbortSignal) {
  await locked(
    dir,
    async () => {
      const data = await readUnlocked(dir)
      const pending = await readFile(dir, "refresh-pending.json")
      await writeFile(dir, "auth.json", update(data))
      if (pending?.provider === provider) await clearPending(dir)
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

const fingerprint = (auth: Oauth) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        refresh: auth.refresh,
        access: auth.access,
        expires: auth.expires,
        accountId: auth.accountId ?? null,
      }),
    )
    .digest("hex")

export async function refresh(
  dir: string,
  provider: string,
  exchange: (auth: Oauth) => Promise<Oauth>,
  signal?: AbortSignal,
) {
  return locked(
    dir,
    async () => {
      const data = await readUnlocked(dir)
      const auth = oauth(data[provider])
      const pending = await readFile(dir, "refresh-pending.json")
      if (pending) {
        if (pending.provider !== provider || typeof pending.fingerprint !== "string")
          throw new Error("SHARED_AUTH_REFRESH_UNCERTAIN_RELOGIN_REQUIRED")
        if (pending.fingerprint === fingerprint(auth)) throw new Error("SHARED_AUTH_REFRESH_UNCERTAIN_RELOGIN_REQUIRED")
        await clearPending(dir)
      }
      if (auth.access && auth.expires > Date.now() + 30_000) return auth
      // A crash or ambiguous network response must not replay a rotating token.
      await writeFile(dir, "refresh-pending.json", { provider, fingerprint: fingerprint(auth) })
      const next = oauth(await exchange(auth))
      await writeFile(dir, "auth.json", { ...data, [provider]: next })
      await clearPending(dir)
      return next
    },
    signal,
  )
}

export * as SharedAuth from "./shared"
