import { expect, test } from "bun:test"
import { Effect } from "effect"
import fs from "node:fs/promises"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { Updater } from "../src/services/updater"
import { isolatedEnv } from "./fixture/environment"

// Loginom AI Agent (B2.7d): the cases of 0.4 `test/installation/product-installation.test.ts` (`v0.4.0:packages/opencode`)
// for the updater of OpenCode 2. The CLI's `Updater.layer` is the product seam: it resolves no OpenCode release, installs
// none, and refuses with the product's own message.
const refusal = "Automatic CLI updates are not configured for Loginom AI Agent"
const updater = () => Effect.runSync(Updater.Service.pipe(Effect.provide(Updater.layer)))

for (const method of Updater.methods) {
  test(`does not resolve upstream updates for ${method}`, async () => {
    const error = await Effect.runPromise(updater().latest(method).pipe(Effect.flip))
    expect(error.message).toContain("does not download or install updates")
    expect(error).toMatchObject({ title: refusal })
  })
  test(`cannot replace Loginom with an upstream ${method} package`, async () => {
    const error = await Effect.runPromise(updater().upgrade(method, "999.0.0").pipe(Effect.flip))
    expect(error).toMatchObject({ title: refusal })
    expect(updater().removal(method)).toBeUndefined()
  })
}

test("detects no installation method and explains the refusal instead", async () => {
  expect(await Effect.runPromise(updater().method())).toBeUndefined()
  expect(await Effect.runPromise(updater().managed())).toMatchObject({
    title: refusal,
    retry: "Install a newer Loginom AI Agent package.",
  })
})

test("the TUI's update check offers no release and cannot install one", async () => {
  expect(await Effect.runPromise(updater().run())).toBeUndefined()
  expect(await Effect.runPromise(updater().check())).toEqual({
    type: "unavailable",
    message: `${refusal}. Install a newer Loginom AI Agent package.`,
  })
  expect((await Effect.runPromise(updater().apply("999.0.0").pipe(Effect.flip))).message).toContain(
    "does not download or install updates",
  )
})

test("the upstream updater's messages name the product command", async () => {
  const source = await Bun.file(path.join(import.meta.dir, "../src/services/updater.ts")).text()
  expect(source.match(/\bopencode upgrade\b|"opencode", "upgrade"/g)).toBeNull()
  expect(source).toContain("run loginom-ai-agent-cli upgrade again")
})

// The product CLI from source, as a user runs it. Every proxy variable points at a local socket that records whatever
// reaches it, so a request to opencode.ai, GitHub or npm shows up there instead of leaving the machine.
test("the product CLI's upgrade refuses without a request or an installer", async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "loginom-cli-upgrade-")))
  const seen: string[] = []
  const proxy = net.createServer((socket) => {
    socket.once("data", (data) => {
      seen.push(data.toString("utf8").split("\r\n")[0])
      socket.destroy()
    })
  })
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve))
  const address = `http://127.0.0.1:${(proxy.address() as net.AddressInfo).port}`
  try {
    const results = await Promise.all(
      [["upgrade"], ["upgrade", "9.9.9", "--method", "npm"], ["upgrade", "--method", "curl"]].map(async (args) => {
        const child = Bun.spawn(
          [
            process.execPath,
            "--define",
            'LOGINOM_AI_AGENT_VERSION="0.4.0"',
            "--define",
            'LOGINOM_AI_AGENT_CHANNEL="prod"',
            path.join(import.meta.dir, "../src/loginom-cli.ts"),
            ...args,
          ],
          {
            // The CLI entry needs the preload from this package's bunfig.toml.
            cwd: path.join(import.meta.dir, ".."),
            env: isolatedEnv(root, {
              LOGINOM_AI_AGENT_CLI_ROOT: undefined,
              LOGINOM_AI_AGENT_CLI_PROFILE: path.join(root, args.join("-")),
              HTTP_PROXY: address,
              http_proxy: address,
              HTTPS_PROXY: address,
              https_proxy: address,
              NO_PROXY: "",
              no_proxy: "",
              // An installer could only come from the package manager or curl on PATH.
              PATH: path.join(root, "no-tools"),
            }),
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
          },
        )
        const [stdout, stderr, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ])
        return { args, code, stdout, stderr }
      }),
    )
    expect(seen).toEqual([])
    results.forEach((result) => {
      expect({ args: result.args, code: result.code, stderr: result.stderr }).toEqual({
        args: result.args,
        code: 1,
        stderr: "",
      })
      expect(result.stdout).toContain(refusal)
      expect(result.stdout).toContain("Install a newer Loginom AI Agent package.")
    })
  } finally {
    proxy.close()
    await fs.rm(root, { recursive: true, force: true })
  }
}, 60_000)
