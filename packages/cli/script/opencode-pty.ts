import { $ } from "bun"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { NativeArch } from "../../../script/native-arch"

export type OpencodePtyAsset = {
  readonly source: string
  readonly version: string
  readonly sha256: string
}

type Target = {
  readonly platform: string
  readonly arch: string
  readonly libc?: "glibc" | "musl"
}

const core = createRequire(path.resolve(import.meta.dirname, "../../core/package.json"))
const pty = createRequire(core.resolve("@opencode/pty/package.json"))

export async function resolveOpencodePty(target: Target): Promise<OpencodePtyAsset | undefined> {
  if (target.platform !== "darwin" && target.platform !== "linux" && target.platform !== "win32") return undefined
  if (target.arch !== "arm64" && target.arch !== "x64") return undefined

  const suffix = [target.platform, target.arch, target.platform === "linux" ? (target.libc ?? "glibc") : undefined]
    .filter(Boolean)
    .map((value) => (value === "glibc" ? "gnu" : value))
    .join("-")
  const name = `@opencode/pty-${suffix}`
  const local = process.env.LOGINOM_AI_AGENT_PTY_BIN
  if (local && (target.platform !== process.platform || target.arch !== process.arch))
    throw new Error("LOGINOM_AI_AGENT_PTY_BIN can only be embedded in a build for the current platform and architecture")
  const source = local
    ? path.resolve(local)
    : pty.resolve(`${name}/bin/${target.platform === "win32" ? "opencode-pty.exe" : "opencode-pty"}`)
  const manifest: unknown = local
    ? { version: "local" }
    : JSON.parse(await readFile(pty.resolve(`${name}/package.json`), "utf8"))
  if (!manifest || typeof manifest !== "object" || !("version" in manifest) || typeof manifest.version !== "string")
    throw new Error(`Invalid package metadata for ${name}`)

  return {
    source,
    version: manifest.version,
    sha256: createHash("sha256")
      .update(await readFile(source))
      .digest("hex"),
  }
}

// Loginom AI Agent (B2.7a9, B4.7c): the product CLI (`build.ts --standalone`) and the CLI Desktop bundles (the default
// build) embed their own `loginom-ai-agent-pty`, built from this fork's packages/process-daemon, which keeps its state
// and sockets under the product's name (B1.3b: `<state>/loginom-ai-agent/pty`, `/tmp/loginom-ai-agent-pty-<uid>`). They
// never fall back to the upstream npm binary, whose sockets live in `/tmp/opencode-pty-<uid>`; a binary given in
// LOGINOM_AI_AGENT_PTY_BIN must be ours too. Only that variable embeds one for another platform: cargo builds for this
// machine.
export async function resolveProductPty(target: Target, env = process.env): Promise<OpencodePtyAsset> {
  const name = [target.platform, target.arch, target.libc].filter(Boolean).join("-")
  const native = target.platform === process.platform && target.arch === process.arch && target.libc !== "musl"
  if (!native && !env.LOGINOM_AI_AGENT_PTY_BIN)
    throw new Error(
      `The product CLI builds loginom-ai-agent-pty from packages/process-daemon for this machine only (${process.platform}-${process.arch}), not ${name}; set LOGINOM_AI_AGENT_PTY_BIN to a loginom-ai-agent-pty built for ${name}`,
    )
  const source = env.LOGINOM_AI_AGENT_PTY_BIN ? path.resolve(env.LOGINOM_AI_AGENT_PTY_BIN) : await buildProductPty(env)
  const version = native ? await runVersion(source, env) : await foreignVersion(source, target, name)
  return {
    source,
    version,
    sha256: createHash("sha256")
      .update(await readFile(source))
      .digest("hex"),
  }
}

async function runVersion(source: string, env: NodeJS.ProcessEnv) {
  const output = await $`${source} --version`.env(env).nothrow().quiet()
  const text = output.stdout.toString().trim() || output.stderr.toString().trim()
  const version = /^loginom-ai-agent-pty (\S+) \(protocol \d+\)$/.exec(text)?.[1]
  if (output.exitCode !== 0 || !version)
    throw new Error(`${source} is not loginom-ai-agent-pty from packages/process-daemon: ${text}`)
  return version
}

// A binary for another platform cannot answer --version here. Its own name stands in: the upstream npm binary only ever
// calls itself opencode-pty. The version, which names the cache directory beside the hash, is then the source's.
async function foreignVersion(source: string, target: Target, name: string) {
  const bytes = await readFile(source)
  const image = NativeArch.images(bytes)[0]
  const format = target.platform === "win32" ? "PE" : target.platform === "darwin" ? "Mach-O" : "ELF"
  if (image?.offset !== 0 || image.format !== format || !image.arches.includes(target.arch))
    throw new Error(`${source} is not a ${format} executable for ${name}`)
  if (!bytes.includes("loginom-ai-agent-pty"))
    throw new Error(`${source} is not loginom-ai-agent-pty from packages/process-daemon`)
  const manifest = await readFile(path.resolve(import.meta.dirname, "../../process-daemon/Cargo.toml"), "utf8")
  const version = /^version = "([^"]+)"$/m.exec(manifest)?.[1]
  if (!version) throw new Error("packages/process-daemon/Cargo.toml has no version")
  return version
}

async function buildProductPty(env: NodeJS.ProcessEnv) {
  const root = path.resolve(import.meta.dirname, "../../process-daemon")
  // rustup takes the pinned toolchain from the working directory. As in release-process-daemon.yml, Ghostty is built for
  // a portable CPU (the product CLI also runs on x64 machines without AVX2), and Windows links its C runtime statically.
  const result = await $`cargo build --locked --release`
    .cwd(root)
    .env({
      ...env,
      OPENCODE_ZIG_CPU: env.OPENCODE_ZIG_CPU ?? "baseline",
      ...(process.platform === "win32" ? { RUSTFLAGS: env.RUSTFLAGS ?? "-C target-feature=+crt-static" } : {}),
    })
    .nothrow()
  if (result.exitCode !== 0)
    throw new Error(
      "Could not build loginom-ai-agent-pty for the product CLI: `cargo build --locked --release` failed in packages/process-daemon. It needs Rust 1.90.0 (rustup), Zig 0.16.0 on PATH and network access to fetch Ghostty; or set LOGINOM_AI_AGENT_PTY_BIN to a loginom-ai-agent-pty built for this machine.",
    )
  return path.resolve(
    root,
    env.CARGO_TARGET_DIR ?? "target",
    "release",
    process.platform === "win32" ? "loginom-ai-agent-pty.exe" : "loginom-ai-agent-pty",
  )
}
