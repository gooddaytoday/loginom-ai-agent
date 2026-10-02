import { afterEach, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const directories: string[] = []
const processes: ReturnType<typeof Bun.spawn>[] = []
const servers: ReturnType<typeof Bun.serve>[] = []

async function directory() {
  const dir = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), "loginom-shared-plugin-"))
  directories.push(dir)
  await fs.writeFile(
    path.join(dir, "auth.json"),
    JSON.stringify({
      openai: {
        type: "oauth",
        refresh: "fake-refresh",
        access: "expired",
        expires: 0,
      },
      other: { type: "api", key: "preserved" },
    }),
    { mode: 0o600 },
  )
  return dir
}

function worker(dir: string, url: URL, mode = "run") {
  const proc = Bun.spawn(
    [process.execPath, path.join(import.meta.dir, "shared-plugin-worker.ts"), dir, url.origin, mode],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: { PATH: process.env.PATH, HOME: dir },
    },
  )
  processes.push(proc)
  return Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()])
}

afterEach(async () => {
  for (const proc of processes.splice(0)) if (proc.exitCode === null) proc.kill("SIGKILL")
  for (const server of servers.splice(0)) server.stop(true)
  for (const dir of directories.splice(0)) await fs.rm(dir, { recursive: true, force: true })
})

test("real Codex loaders in two processes share one refresh and overlap fake model requests", async () => {
  const dir = await directory()
  const both = Promise.withResolvers<void>()
  let tokens = 0
  let models = 0
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      if (new URL(request.url).pathname === "/oauth/token") {
        tokens++
        expect(await request.text()).toContain("refresh_token=fake-refresh")
        return Response.json({ access_token: "fresh", refresh_token: "fake-rotated", expires_in: 3600 })
      }
      expect(request.headers.get("authorization")).toBe("Bearer fresh")
      models++
      if (models === 2) both.resolve()
      await Promise.race([
        both.promise,
        Bun.sleep(8000).then(() => {
          throw new Error("MODEL_OVERLAP_TIMEOUT")
        }),
      ])
      return new Response("{}")
    },
  })
  servers.push(server)
  const outcomes = await Promise.all([worker(dir, server.url), worker(dir, server.url)])
  expect(outcomes.map(([code]) => code)).toEqual([0, 0])
  expect(outcomes.map(([, output]) => output)).toEqual(["OK\n", "OK\n"])
  expect(tokens).toBe(1)
  expect(models).toBe(2)
  const saved = JSON.parse(await fs.readFile(path.join(dir, "auth.json"), "utf8"))
  expect(saved.openai.refresh).toBe("fake-rotated")
  expect(saved.other.key).toBe("preserved")
}, 20000)

test("shared loader fails closed after logout without contacting token or model endpoints", async () => {
  const dir = await directory()
  let requests = 0
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch() {
      requests++
      return new Response("unexpected", { status: 500 })
    },
  })
  servers.push(server)
  const [code, , error] = await worker(dir, server.url, "logout")
  expect(code).toBe(1)
  expect(error).toContain("SHARED_AUTH_OAUTH_REQUIRED")
  expect(error).not.toContain("TypeError")
  expect(requests).toBe(0)
})

test("failed shared token exchange hides provider response and prevents stale token retries", async () => {
  const dir = await directory()
  let requests = 0
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch() {
      requests++
      return new Response("private-provider-body", { status: 503 })
    },
  })
  servers.push(server)
  const first = await worker(dir, server.url)
  const second = await worker(dir, server.url)
  expect(first[0]).toBe(1)
  expect(first[2]).toContain("SHARED_AUTH_REFRESH_FAILED_HTTP_503")
  expect(first[2]).not.toContain("private-provider-body")
  expect(second[2]).toContain("SHARED_AUTH_REFRESH_UNCERTAIN_RELOGIN_REQUIRED")
  expect(requests).toBe(1)
})
