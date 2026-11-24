import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { resolveProductPty } from "../script/opencode-pty"

// The product CLI embeds its own loginom-ai-agent-pty, built from packages/process-daemon (B2.7a9). Fake `cargo` and pty
// executables stand in for the Rust build, so the cases need no toolchain; the real build is in the migration log.
const daemon = path.resolve(import.meta.dir, "../../process-daemon")
const host = {
  platform: process.platform,
  arch: process.arch,
  ...(process.platform === "linux" ? { libc: "glibc" as const } : {}),
}
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe.skipIf(process.platform === "win32")("the product CLI's terminal service", () => {
  test("is built from packages/process-daemon for a portable CPU", async () => {
    const root = await temporary()
    await executable(
      path.join(root, "bin/cargo"),
      [
        `printf '%s|%s|%s' "$PWD" "$OPENCODE_ZIG_CPU" "$*" > "${root}/cargo.log"`,
        `mkdir -p "$CARGO_TARGET_DIR/release"`,
        `printf '#!/bin/sh\\necho "loginom-ai-agent-pty 9.9.9 (protocol 8)"\\n' > "$CARGO_TARGET_DIR/release/loginom-ai-agent-pty"`,
        `chmod +x "$CARGO_TARGET_DIR/release/loginom-ai-agent-pty"`,
      ].join("\n"),
    )
    const source = path.join(root, "target/release/loginom-ai-agent-pty")
    const asset = await resolveProductPty(host, {
      PATH: `${path.join(root, "bin")}:/usr/bin:/bin`,
      HOME: root,
      CARGO_TARGET_DIR: path.join(root, "target"),
    })
    expect(asset).toEqual({
      source,
      version: "9.9.9",
      sha256: createHash("sha256")
        .update(await fs.readFile(source))
        .digest("hex"),
    })
    expect(await fs.readFile(path.join(root, "cargo.log"), "utf8")).toBe(`${daemon}|baseline|build --locked --release`)
  })

  test("takes a prebuilt LOGINOM_AI_AGENT_PTY_BIN only when it is loginom-ai-agent-pty", async () => {
    const root = await temporary()
    // Building is not needed, and would fail.
    await executable(path.join(root, "bin/cargo"), "exit 101")
    const env = (binary: string) => ({ PATH: path.join(root, "bin"), HOME: root, LOGINOM_AI_AGENT_PTY_BIN: binary })
    const own = path.join(root, "own")
    await executable(own, 'echo "loginom-ai-agent-pty 0.5.2 (protocol 8)"')
    expect(await resolveProductPty(host, env(own))).toMatchObject({ source: own, version: "0.5.2" })
    // The upstream npm binary keeps its sockets in /tmp/opencode-pty-<uid>.
    const upstream = path.join(root, "upstream")
    await executable(upstream, 'echo "opencode-pty 0.5.2 (protocol 8)"')
    await expect(resolveProductPty(host, env(upstream))).rejects.toThrow(`${upstream} is not loginom-ai-agent-pty`)
  })

  test("fails the build instead of falling back to the upstream npm binary", async () => {
    const root = await temporary()
    await executable(path.join(root, "bin/cargo"), "exit 101")
    for (const PATH of [path.join(root, "bin"), path.join(root, "none")])
      await expect(resolveProductPty(host, { PATH, HOME: root })).rejects.toThrow(
        "Could not build loginom-ai-agent-pty for the product CLI",
      )
  })

  test("is built only for the machine that builds the CLI", async () => {
    const root = await temporary()
    const env = { PATH: path.join(root, "none"), HOME: root }
    await expect(resolveProductPty({ ...host, arch: host.arch === "x64" ? "arm64" : "x64" }, env)).rejects.toThrow(
      "for this machine only",
    )
    if (host.platform === "linux")
      await expect(resolveProductPty({ ...host, libc: "musl" as const }, env)).rejects.toThrow("for this machine only")
    await expect(resolveProductPty(windows, env)).rejects.toThrow(
      "set LOGINOM_AI_AGENT_PTY_BIN to a loginom-ai-agent-pty built for win32-x64",
    )
  })

  // B4.7c: a Windows CLI built on Linux embeds a prebuilt loginom-ai-agent-pty.exe. It cannot run here, so the build
  // reads it: an executable for the target that calls itself loginom-ai-agent-pty, which upstream's never does.
  test("takes a prebuilt LOGINOM_AI_AGENT_PTY_BIN for another platform only when it is ours and for that target", async () => {
    const root = await temporary()
    // Neither building nor running is possible for another platform.
    await executable(path.join(root, "bin/cargo"), "exit 101")
    const env = (binary: string) => ({ PATH: path.join(root, "bin"), HOME: root, LOGINOM_AI_AGENT_PTY_BIN: binary })
    const file = async (name: string, bytes: Buffer) => {
      await fs.writeFile(path.join(root, name), bytes)
      return path.join(root, name)
    }
    const own = await file("own.exe", Buffer.concat([pe(0x8664), Buffer.from("usage: loginom-ai-agent-pty --version")]))
    const version = /^version = "(.+)"$/m.exec(await fs.readFile(path.join(daemon, "Cargo.toml"), "utf8"))?.[1] ?? ""
    expect(await resolveProductPty(windows, env(own))).toEqual({
      source: own,
      version,
      sha256: createHash("sha256")
        .update(await fs.readFile(own))
        .digest("hex"),
    })
    const upstream = await file(
      "upstream.exe",
      Buffer.concat([pe(0x8664), Buffer.from("usage: opencode-pty --version")]),
    )
    await expect(resolveProductPty(windows, env(upstream))).rejects.toThrow(`${upstream} is not loginom-ai-agent-pty`)
    const arm = await file("arm.exe", Buffer.concat([pe(0xaa64), Buffer.from("loginom-ai-agent-pty")]))
    await expect(resolveProductPty(windows, env(arm))).rejects.toThrow(`${arm} is not a PE executable for win32-x64`)
    const linux = await file("linux", Buffer.concat([elf(62), Buffer.from("loginom-ai-agent-pty")]))
    await expect(resolveProductPty(windows, env(linux))).rejects.toThrow(
      `${linux} is not a PE executable for win32-x64`,
    )
  })

  // B4.7c: the default build is the CLI Desktop bundles; it refuses upstream's npm binary like the product CLI.
  test("the default build, which Desktop bundles, embeds no other terminal service", async () => {
    const root = await temporary()
    const upstream = path.join(root, "opencode-pty")
    await executable(upstream, 'echo "opencode-pty 0.5.2 (protocol 8)"')
    // The build writes its web interface archive into the package before it reaches the targets.
    const cache = path.resolve(import.meta.dir, "../.cache")
    if (!(await fs.exists(cache))) roots.push(cache)
    const build = Bun.spawn(
      [
        process.execPath,
        path.resolve(import.meta.dir, "../script/build.ts"),
        "--single",
        "--skip-install",
        "--skip-web-ui",
        `--outdir=${path.join(root, "dist")}`,
      ],
      {
        env: {
          PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
          HOME: root,
          TMPDIR: root,
          LOGINOM_AI_AGENT_CHANNEL: "dev",
          LOGINOM_AI_AGENT_PTY_BIN: upstream,
        },
        stdout: "ignore",
        stderr: "pipe",
        // A build that took the npm binary would go on compiling the whole CLI.
        timeout: 20_000,
      },
    )
    const stderr = await new Response(build.stderr).text()
    expect(await build.exited).toBe(1)
    expect(stderr).toContain(`${upstream} is not loginom-ai-agent-pty from packages/process-daemon`)
    expect(await fs.readdir(path.join(root, "dist")).catch(() => [])).toEqual([])
  }, 30_000)
})

const windows = { platform: "win32", arch: "x64" }

// The headers NativeArch reads: a PE with its machine type, an ELF with its machine number.
function pe(machine: number) {
  const bytes = Buffer.alloc(0x48)
  bytes.write("MZ", 0, "latin1")
  bytes.writeUInt32LE(0x40, 0x3c)
  bytes.writeUInt32LE(0x4550, 0x40)
  bytes.writeUInt16LE(machine, 0x44)
  return bytes
}

function elf(machine: number) {
  const bytes = Buffer.alloc(24)
  bytes.write("\x7fELF", 0, "latin1")
  bytes.set([2, 1, 1], 4)
  bytes.writeUInt16LE(machine, 18)
  bytes.writeUInt32LE(1, 20)
  return bytes
}

async function temporary() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "loginom-product-pty-")))
  roots.push(root)
  return root
}

async function executable(file: string, body: string) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 })
}
