import { afterAll, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { isolatedEnv } from "./fixture/environment"

// Loginom AI Agent (B2.7a11): `serve` and the CLI client of one build agree on the Basic user `loginom-ai-agent`, as in
// 0.4, and refuse OpenCode's `opencode`. The client is `session list --server`: it resolves the explicit server
// (`ServerConnection`), checks its health and lists sessions; no prompt, so no model is called.
const cli = path.join(import.meta.dir, "..")
const password = "basic-user-test"
const roots: string[] = []

afterAll(() => Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true }))))

test("serve and the CLI client use loginom-ai-agent; opencode is refused", async () => {
  await using server = await serve(undefined)

  expect(await info(server.url, "opencode")).toBe(401)
  expect(await info(server.url, "loginom-ai-agent")).toBe(200)
  const client = await list(server.url, undefined)
  expect({ exitCode: client.exitCode, stderr: client.stderr }).toEqual({ exitCode: 0, stderr: "" })
  expect(JSON.parse(client.stdout)).toEqual([])
}, 60_000)

test("LOGINOM_AI_AGENT_SERVER_USERNAME moves the server and the client that shares it", async () => {
  await using server = await serve("alice")

  expect(await info(server.url, "alice")).toBe(200)
  expect(await info(server.url, "loginom-ai-agent")).toBe(401)
  const client = await list(server.url, "alice")
  expect({ exitCode: client.exitCode, stderr: client.stderr }).toEqual({ exitCode: 0, stderr: "" })
  expect(JSON.parse(client.stdout)).toEqual([])
}, 60_000)

async function serve(username: string | undefined) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-basic-user-"))
  roots.push(root)
  const child = Bun.spawn([process.execPath, path.join(cli, "src/index.ts"), "serve", "--port", "0"], {
    // The CLI entry needs the preload from this package's bunfig.toml.
    cwd: cli,
    env: environment(root, username),
    stdout: "pipe",
    stderr: "pipe",
  })
  const stop = async () => {
    child.kill("SIGTERM")
    await child.exited
  }
  const url = await listening(child).catch(async (error: unknown) => {
    await stop()
    throw error
  })
  return { url, [Symbol.asyncDispose]: stop }
}

function environment(root: string, username: string | undefined) {
  return isolatedEnv(root, { LOGINOM_AI_AGENT_PASSWORD: password, LOGINOM_AI_AGENT_SERVER_USERNAME: username })
}

function info(url: string, user: string) {
  return fetch(new URL("/api/info", url), {
    headers: { authorization: `Basic ${btoa(`${user}:${password}`)}` },
  }).then((response) => response.arrayBuffer().then(() => response.status))
}

async function list(url: string, username: string | undefined) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-basic-user-client-"))
  roots.push(root)
  const child = Bun.spawn(
    [process.execPath, path.join(cli, "src/index.ts"), "session", "list", "--format", "json", "--server", url],
    { cwd: cli, env: environment(root, username), stdout: "pipe", stderr: "pipe" },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { stdout, stderr, exitCode }
}

async function listening(child: Bun.Subprocess<"ignore", "pipe", "pipe">) {
  const decoder = new TextDecoder()
  const output = { text: "" }
  for await (const chunk of child.stdout) {
    output.text += decoder.decode(chunk)
    const url = /server listening on (http:\/\/\S+)/.exec(output.text)?.[1]
    if (url) return url
  }
  throw new Error(`server did not start: ${output.text}${await new Response(child.stderr).text()}`)
}
