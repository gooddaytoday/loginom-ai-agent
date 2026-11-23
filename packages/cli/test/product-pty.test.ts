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
  })
})

async function temporary() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "loginom-product-pty-")))
  roots.push(root)
  return root
}

async function executable(file: string, body: string) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 })
}
