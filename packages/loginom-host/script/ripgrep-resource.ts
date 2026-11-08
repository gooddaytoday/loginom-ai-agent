import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { chmod, cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { ripgrepDirectory } from "../src/bundled-ripgrep"

// The same ripgrep release that packages/core/src/ripgrep/binary.ts would
// otherwise download at runtime. Digests are the official release assets'
// SHA256 (GitHub release asset digests and published .sha256 files).
export const ripgrepPins = {
  version: "15.1.0",
  archives: {
    "linux-x64": {
      platform: "x86_64-unknown-linux-musl",
      extension: "tar.gz",
      sha256: "1c9297be4a084eea7ecaedf93eb03d058d6faae29bbc57ecdaf5063921491599",
    },
    "darwin-arm64": {
      platform: "aarch64-apple-darwin",
      extension: "tar.gz",
      sha256: "378e973289176ca0c6054054ee7f631a065874a352bf43f0fa60ef079b6ba715",
    },
    "win32-x64": {
      platform: "x86_64-pc-windows-msvc",
      extension: "zip",
      sha256: "124510b94b6baa3380d051fdf4650eaa80a302c876d611e9dba0b2e18d87493a",
    },
  },
} as const

export interface RipgrepPin {
  version: string
  platform: string
  extension: "tar.gz" | "zip"
  sha256: string
}

export function ripgrepPinForTarget(target: string): RipgrepPin {
  const archive = ripgrepPins.archives[target as keyof typeof ripgrepPins.archives]
  if (!archive) throw new Error("LOGINOM_NATIVE_RESOURCES_UNAVAILABLE")
  return { version: ripgrepPins.version, ...archive }
}

export function ripgrepArchiveName(pin: RipgrepPin) {
  return `ripgrep-${pin.version}-${pin.platform}.${pin.extension}`
}

/**
 * Stages the pinned ripgrep executable and its license texts under
 * `<resources>/ripgrep`. The archive comes from `cache` (downloaded there from
 * the official release when absent) and must match the pinned SHA256; any
 * mismatch fails the build before anything is staged.
 */
export async function stageRipgrep(input: {
  resources: string
  pin: RipgrepPin
  cache?: string
  download?: (url: string) => Promise<Uint8Array>
}) {
  const archive = await ripgrepArchive(input.pin, input.cache ?? defaultRipgrepCache(), input.download ?? download)
  const work = await mkdtemp(join(dirname(archive), ".ripgrep-"))
  try {
    await extract(archive, input.pin.extension, work)
    const root = join(work, `ripgrep-${input.pin.version}-${input.pin.platform}`)
    const executable = input.pin.platform.includes("windows") ? "rg.exe" : "rg"
    const destination = join(input.resources, ripgrepDirectory)
    await mkdir(destination, { recursive: true })
    await cp(join(root, executable), join(destination, executable))
    if (!executable.endsWith(".exe")) await chmod(join(destination, executable), 0o755)
    await mkdir(join(input.resources, "licenses/ripgrep"), { recursive: true })
    for (const file of ["LICENSE-MIT", "UNLICENSE", "COPYING"])
      await cp(join(root, file), join(input.resources, "licenses/ripgrep", file))
    return join(destination, executable)
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

export function defaultRipgrepCache() {
  return process.env.LOGINOM_AI_AGENT_RIPGREP_CACHE ?? join(homedir(), ".cache/loginom-bootstrap/ripgrep")
}

async function ripgrepArchive(pin: RipgrepPin, cache: string, fetchArchive: (url: string) => Promise<Uint8Array>) {
  const name = ripgrepArchiveName(pin)
  const archive = join(cache, name)
  const cached = await stat(archive).then(
    () => true,
    () => false,
  )
  if (!cached) {
    const bytes = await fetchArchive(
      `https://github.com/BurntSushi/ripgrep/releases/download/${pin.version}/${name}`,
    )
    if (sha256(bytes) !== pin.sha256) throw new Error("LOGINOM_RIPGREP_HASH_MISMATCH")
    await mkdir(cache, { recursive: true })
    const partial = `${archive}.${process.pid}.partial`
    await writeFile(partial, bytes)
    await rename(partial, archive)
  }
  if (sha256(await readFile(archive)) !== pin.sha256) throw new Error("LOGINOM_RIPGREP_HASH_MISMATCH")
  return archive
}

async function download(url: string) {
  let failure: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await Bun.sleep(attempt * 5_000)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(120_000) })
      if (response.ok) return new Uint8Array(await response.arrayBuffer())
      failure = new Error(`HTTP ${response.status}`)
    } catch (error) {
      failure = error
    }
  }
  throw new Error("LOGINOM_RIPGREP_DOWNLOAD_FAILED", { cause: failure })
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}

// Windows' bundled bsdtar reads zip archives; POSIX targets ship tar.gz.
async function extract(archive: string, extension: RipgrepPin["extension"], directory: string) {
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT
  const tar = process.platform === "win32" ? join(systemRoot ?? "C:\\Windows", "System32/tar.exe") : "tar"
  const args = extension === "zip" ? ["-xf", archive, "-C", directory] : ["-xzf", archive, "-C", directory]
  await new Promise<void>((resolve, reject) => {
    execFile(tar, args, { timeout: 120_000 }, (error) => (error ? reject(error) : resolve()))
  })
}
