import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { createHash } from "node:crypto"
import { SharedAuth } from "../../src/auth/shared"

const processes: ReturnType<typeof Bun.spawn>[] = []
const directories: string[] = []
const servers: ReturnType<typeof Bun.serve>[] = []
const oldAuth = { type: "oauth" as const, access: "expired", refresh: "fake-refresh", expires: 0 }
const newAuth = { type: "oauth" as const, access: "fresh", refresh: "fake-rotated", expires: Date.now() + 3600_000 }

async function directory(auth: object = { openai: oldAuth, other: { type: "api", key: "preserved" } }) {
  const dir = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), "loginom-shared-auth-"))
  directories.push(dir)
  await fs.writeFile(path.join(dir, "auth.json"), JSON.stringify(auth), { mode: 0o600 })
  return dir
}

function worker(mode: string, dir: string, url = "", provider = "openai") {
  const proc = Bun.spawn([process.execPath, path.join(import.meta.dir, "shared-worker.ts"), mode, dir, url, provider], {
    stdout: "pipe",
    stderr: "pipe",
    env: { PATH: process.env.PATH, HOME: dir },
  })
  processes.push(proc)
  return proc
}

async function result(proc: ReturnType<typeof worker>) {
  const [code, output, error] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { code, output, error }
}

function signal() {
  const state = Promise.withResolvers<void>()
  return {
    ...state,
    wait: () =>
      Promise.race([
        state.promise,
        Bun.sleep(8000).then(() => {
          throw new Error("TEST_READINESS_TIMEOUT")
        }),
      ]),
  }
}

function serve(handler: (request: Request) => Response | Promise<Response>) {
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: handler })
  servers.push(server)
  return server.url.toString().replace(/\/$/, "")
}

afterEach(async () => {
  for (const proc of processes.splice(0)) if (proc.exitCode === null) proc.kill("SIGKILL")
  for (const server of servers.splice(0)) server.stop(true)
  for (const dir of directories.splice(0)) await fs.rm(dir, { recursive: true, force: true })
})

describe("shared OAuth store (real processes, fake provider only)", () => {
  test("refreshes once across processes and releases the lock before overlapping model calls", async () => {
    const dir = await directory()
    const tokenStarted = signal()
    const releaseToken = signal()
    const bothModels = signal()
    let tokens = 0
    let models = 0
    const url = serve(async (request) => {
      if (new URL(request.url).pathname === "/token") {
        tokens++
        tokenStarted.resolve()
        await releaseToken.wait()
        return Response.json(newAuth)
      }
      expect(request.headers.get("authorization")).toBe("Bearer fresh")
      models++
      if (models === 2) bothModels.resolve()
      await bothModels.wait()
      return new Response("ok")
    })
    const first = worker("refresh", dir, url)
    await tokenStarted.wait()
    const second = worker("refresh", dir, url)
    releaseToken.resolve()
    await bothModels.wait()
    expect(await result(first)).toEqual({ code: 0, output: "OK\n", error: "" })
    expect(await result(second)).toEqual({ code: 0, output: "OK\n", error: "" })
    expect(tokens).toBe(1)
    const saved = await SharedAuth.read(dir)
    expect(saved.openai).toEqual(newAuth)
    expect(saved.other).toEqual({ type: "api", key: "preserved" })
    expect((await fs.stat(path.join(dir, "auth.json"))).mode & 0o777).toBe(0o600)
    expect(await fs.readdir(dir)).toEqual(expect.arrayContaining(["auth.json", "auth.json.lock"]))
    expect(await fs.readdir(dir)).not.toContain("refresh-pending.json")
  })

  test("serializes logout with refresh without resurrecting removed credentials", async () => {
    const dir = await directory()
    const started = signal()
    const release = signal()
    let tokens = 0
    const url = serve(async (request) => {
      if (new URL(request.url).pathname === "/token") {
        tokens++
        started.resolve()
        await release.wait()
        return Response.json(newAuth)
      }
      return new Response("ok")
    })
    const refreshing = worker("refresh", dir, url)
    await started.wait()
    const logout = worker("remove", dir)
    release.resolve()
    expect((await result(refreshing)).code).toBe(0)
    expect((await result(logout)).code).toBe(0)
    expect((await SharedAuth.read(dir)).openai).toBeUndefined()
    expect((await result(worker("refresh", dir, url))).error).toContain("SHARED_AUTH_OAUTH_REQUIRED")
    expect(tokens).toBe(1)
  })

  test("SIGKILL releases the OS lock but prevents replay of an uncertain refresh", async () => {
    const dir = await directory()
    const started = signal()
    const release = signal()
    let tokens = 0
    const url = serve(async () => {
      tokens++
      started.resolve()
      await release.wait()
      return Response.json(newAuth)
    })
    const refreshing = worker("refresh", dir, url)
    await started.wait()
    refreshing.kill("SIGKILL")
    await refreshing.exited
    expect((await result(worker("read", dir))).code).toBe(0)
    expect((await result(worker("refresh", dir, url))).error).toContain(
      "SHARED_AUTH_REFRESH_UNCERTAIN_RELOGIN_REQUIRED",
    )
    expect(tokens).toBe(1)
    expect((await SharedAuth.read(dir)).openai).toEqual(oldAuth)
    expect((await result(worker("remove", dir))).code).toBe(0)
    expect(await fs.readdir(dir)).not.toContain("refresh-pending.json")
    release.resolve()
  })

  test("failed refresh remains uncertain and is not retried by another process", async () => {
    const dir = await directory()
    let tokens = 0
    const url = serve(() => {
      tokens++
      return new Response("unavailable", { status: 503 })
    })
    expect((await result(worker("refresh", dir, url))).error).toContain("FAKE_REFRESH_FAILED")
    expect((await result(worker("refresh", dir, url))).error).toContain(
      "SHARED_AUTH_REFRESH_UNCERTAIN_RELOGIN_REQUIRED",
    )
    expect(tokens).toBe(1)
    expect((await SharedAuth.read(dir)).openai).toEqual(oldAuth)
  })

  test("recognizes saved tokens after a crash even when the refresh token did not rotate", async () => {
    const saved = { ...newAuth, refresh: oldAuth.refresh }
    const dir = await directory({ openai: saved })
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          refresh: oldAuth.refresh,
          access: oldAuth.access,
          expires: oldAuth.expires,
          accountId: null,
        }),
      )
      .digest("hex")
    await fs.writeFile(path.join(dir, "refresh-pending.json"), JSON.stringify({ provider: "openai", fingerprint }), {
      mode: 0o600,
    })
    expect(
      await SharedAuth.refresh(dir, "openai", async () => {
        throw new Error("MUST_NOT_REFRESH")
      }),
    ).toEqual(saved)
    expect(await fs.readdir(dir)).not.toContain("refresh-pending.json")
  })

  test("concurrent writers preserve other providers", async () => {
    const dir = await directory()
    const outcomes = await Promise.all([result(worker("set", dir, "", "a")), result(worker("set", dir, "", "b"))])
    expect(outcomes.map((outcome) => outcome.code)).toEqual([0, 0])
    expect(Object.keys(await SharedAuth.read(dir)).sort()).toEqual(["a", "b", "openai", "other"])
  })

  test("rejects malformed JSON without overwriting it or exposing credential text", async () => {
    const dir = await directory()
    await fs.writeFile(path.join(dir, "auth.json"), '{"private-credential":')
    const outcome = await result(worker("set", dir))
    expect(outcome.code).toBe(1)
    expect(outcome.error).toContain("SHARED_AUTH_READ_FAILED")
    expect(outcome.error).not.toContain("private-credential")
    expect(await fs.readFile(path.join(dir, "auth.json"), "utf8")).toBe('{"private-credential":')
  })

  test("rejects public permissions and symlinks", async () => {
    const dir = await directory()
    await fs.chmod(path.join(dir, "auth.json"), 0o644)
    expect((await result(worker("read", dir))).code).toBe(1)
    await fs.chmod(path.join(dir, "auth.json"), 0o600)
    await fs.rename(path.join(dir, "auth.json"), path.join(dir, "outside"))
    await fs.symlink(path.join(dir, "outside"), path.join(dir, "auth.json"))
    expect((await result(worker("set", dir))).code).toBe(1)
    expect(JSON.parse(await fs.readFile(path.join(dir, "outside"), "utf8")).openai).toEqual(oldAuth)
  })
})
