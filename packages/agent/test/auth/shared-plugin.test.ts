import { afterEach, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { SharedAuth } from "../../src/auth/shared"
import { fakeAuth } from "./shared-fixture"

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
  await SharedAuth.login(dir, "openai", fakeAuth())
  return dir
}

function worker(dir: string, url: URL, mode = "run") {
  const proc = Bun.spawn(
    [
      process.execPath,
      "--define",
      'LOGINOM_AI_AGENT_LIBC="glibc"',
      path.join(import.meta.dir, "shared-plugin-worker.ts"),
      dir,
      url.origin,
      mode,
    ],
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

test.skipIf(process.platform !== "linux" || process.arch !== "x64")(
  "real Codex loaders in eight processes share one refresh and overlap fake model requests",
  async () => {
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
          return Response.json({
            access_token: fakeAuth("fake-rotated").access,
            refresh_token: "fake-rotated",
            expires_in: 3600,
          })
        }
        expect(request.headers.get("authorization")).toBe(`Bearer ${fakeAuth("fake-rotated").access}`)
        models++
        if (models === 8) both.resolve()
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
    const outcomes = await Promise.all(Array.from({ length: 8 }, () => worker(dir, server.url)))
    expect(outcomes.map(([code]) => code)).toEqual(Array(8).fill(0))
    expect(outcomes.map(([, output]) => output)).toEqual(Array(8).fill("OK\n"))
    expect(tokens).toBe(1)
    expect(models).toBe(8)
    const saved = JSON.parse(await fs.readFile(path.join(dir, "auth.json"), "utf8"))
    expect(saved.openai.refresh).toBe("fake-rotated")
    expect(saved.other.key).toBe("preserved")
  },
  20000,
)

test.skipIf(process.platform !== "linux" || process.arch !== "x64")(
  "shared loader fails closed after logout without contacting token or model endpoints",
  async () => {
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
  },
)

test.skipIf(process.platform !== "linux" || process.arch !== "x64")(
  "failed shared token exchange hides provider response and prevents stale token retries",
  async () => {
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
  },
)

test.skipIf(process.platform !== "linux" || process.arch !== "x64")(
  "Request.signal abort prevents dispatch",
  async () => {
    const dir = await directory()
    let requests = 0
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        requests++
        return new Response("unexpected")
      },
    })
    servers.push(server)
    const [code] = await worker(dir, server.url, "abort-request")
    expect(code).toBe(1)
    expect(requests).toBe(0)
  },
)

test.skipIf(process.platform !== "linux" || process.arch !== "x64")(
  "cancelled refresh commits rotation but never dispatches its model",
  async () => {
    const dir = await directory()
    let tokens = 0
    let models = 0
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(request) {
        if (new URL(request.url).pathname === "/oauth/token") {
          tokens++
          await Bun.sleep(250)
          return Response.json({
            access_token: fakeAuth("fake-rotated").access,
            refresh_token: "fake-rotated",
            expires_in: 3600,
          })
        }
        models++
        return new Response("{}")
      },
    })
    servers.push(server)
    expect((await worker(dir, server.url, "abort-refresh"))[0]).toBe(1)
    expect(tokens).toBe(1)
    expect(models).toBe(0)
    expect((await SharedAuth.snapshot(dir, "openai")).auth.refresh).toBe("fake-rotated")
    expect((await worker(dir, server.url))[0]).toBe(0)
    expect(tokens).toBe(1)
    expect(models).toBe(1)
  },
)

test.skipIf(process.platform !== "linux" || process.arch !== "x64")(
  "HTTP refresh deadline leaves uncertainty without secret diagnostics",
  async () => {
    const dir = await directory()
    let requests = 0
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      idleTimeout: 60,
      async fetch() {
        requests++
        await Bun.sleep(40000)
        return new Response("private-secret-response")
      },
    })
    servers.push(server)
    const start = performance.now()
    const [code, , error] = await worker(dir, server.url)
    expect(code).toBe(1)
    expect(performance.now() - start).toBeGreaterThan(29000)
    expect(performance.now() - start).toBeLessThan(35000)
    expect(error).not.toContain("private-secret-response")
    expect((await worker(dir, server.url))[2]).toContain("SHARED_AUTH_REFRESH_UNCERTAIN_RELOGIN_REQUIRED")
    expect(requests).toBe(1)
  },
  45000,
)
