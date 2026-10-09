import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { SharedAuth } from "../../src/auth/shared"
import { fakeAuth } from "./shared-fixture"

const processes: ReturnType<typeof Bun.spawn>[] = []
const directories: string[] = []
const servers: ReturnType<typeof Bun.serve>[] = []
const oldAuth = fakeAuth()
const newAuth = fakeAuth("fake-rotated", Date.now() + 3600_000)

async function directory() {
  const dir = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), "loginom-shared-auth-"))
  directories.push(dir)
  await fs.writeFile(path.join(dir, "auth.json"), JSON.stringify({ other: { type: "api", key: "preserved" } }), {
    mode: 0o600,
  })
  await SharedAuth.login(dir, "openai", oldAuth)
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
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", idleTimeout: 120, fetch: handler })
  servers.push(server)
  return server.url.toString().replace(/\/$/, "")
}

afterEach(async () => {
  const owned = processes.splice(0)
  for (const proc of owned) if (proc.exitCode === null) proc.kill("SIGKILL")
  await Promise.all(owned.map((proc) => proc.exited))
  for (const server of servers.splice(0)) server.stop(true)
  for (const dir of directories.splice(0)) await fs.rm(dir, { recursive: true, force: true })
})

describe("shared OAuth store (real processes, fake provider only)", () => {
  test("special auth and pending files fail promptly and release flock", async () => {
    for (const name of ["auth.json", "refresh-pending.json"]) {
      const dir = await directory()
      const original = await fs.readFile(path.join(dir, "auth.json"))
      const file = path.join(dir, name)
      if (name === "auth.json") await fs.unlink(file)
      expect(await Bun.spawn(["mkfifo", "-m", "600", file]).exited).toBe(0)
      const proc = worker(name === "auth.json" ? "read" : "refresh", dir)
      const outcome = await Promise.race([
        result(proc),
        Bun.sleep(2000).then(() => {
          throw new Error("SPECIAL_FILE_READ_BLOCKED")
        }),
      ])
      expect(outcome.code).toBe(1)
      expect(outcome.error).toContain("SHARED_AUTH_READ_FAILED")
      await fs.unlink(file)
      if (name === "auth.json") await fs.writeFile(file, original, { mode: 0o600 })
      expect((await SharedAuth.snapshot(dir, "openai")).auth).toEqual(oldAuth)
    }
  }, 10000)

  test("eight model calls overlap after one refresh", async () => {
    const dir = await directory()
    const started = signal()
    const release = signal()
    const allModels = signal()
    let tokens = 0
    let models = 0
    const url = serve(async (request) => {
      if (new URL(request.url).pathname === "/token") {
        tokens++
        started.resolve()
        await release.wait()
        return Response.json(newAuth)
      }
      expect(request.headers.get("authorization")).toBe(`Bearer ${newAuth.access}`)
      if (++models === 8) allModels.resolve()
      await allModels.wait()
      return new Response("ok")
    })
    const first = worker("refresh", dir, url)
    await started.wait()
    const rest = Array.from({ length: 7 }, () => worker("refresh", dir, url))
    release.resolve()
    await allModels.wait()
    expect(await Promise.all([first, ...rest].map(result))).toEqual(
      Array.from({ length: 8 }, () => ({ code: 0, output: "OK\n", error: "" })),
    )
    expect(tokens).toBe(1)
    expect(models).toBe(8)
    expect(await SharedAuth.read(dir)).toEqual({ openai: newAuth, other: { type: "api", key: "preserved" } })
    expect((await fs.stat(path.join(dir, "auth.json"))).mode & 0o777).toBe(0o600)
    expect(await fs.readdir(dir)).not.toContain("refresh-pending.json")
  })

  test("serializes logout with refresh without resurrecting credentials", async () => {
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
    const active = worker("refresh", dir, url)
    await started.wait()
    const logout = worker("remove", dir)
    release.resolve()
    expect((await result(active)).code).toBe(0)
    expect((await result(logout)).code).toBe(0)
    expect((await SharedAuth.read(dir)).openai).toBeUndefined()
    expect((await result(worker("refresh", dir, url))).error).toContain("SHARED_AUTH_OAUTH_REQUIRED")
    expect(tokens).toBe(1)
  })

  test("SIGKILL releases flock without replaying an uncertain refresh", async () => {
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
    const active = worker("refresh", dir, url)
    await started.wait()
    active.kill("SIGKILL")
    await active.exited
    expect((await result(worker("read", dir))).code).toBe(0)
    expect((await result(worker("refresh", dir, url))).error).toContain(
      "SHARED_AUTH_REFRESH_UNCERTAIN_RELOGIN_REQUIRED",
    )
    expect(tokens).toBe(1)
    expect((await SharedAuth.read(dir)).openai).toEqual(oldAuth)
    await SharedAuth.logout(dir, "openai")
    expect(await fs.readdir(dir)).not.toContain("refresh-pending.json")
    release.resolve()
  })

  test("failed exchange remains uncertain", async () => {
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
  })

  test("reconciles only the exact transaction saved with tokens", async () => {
    const dir = await directory()
    const raw = JSON.parse(await fs.readFile(path.join(dir, "auth.json"), "utf8"))
    const session = raw.$sharedOAuth.sessions.openai
    await fs.writeFile(
      path.join(dir, "refresh-pending.json"),
      JSON.stringify({ provider: "openai", transaction: "test-transaction", generation: session.generation }),
      { mode: 0o600 },
    )
    await fs.writeFile(
      path.join(dir, "auth.json"),
      JSON.stringify({
        ...raw,
        openai: newAuth,
        $sharedOAuth: { version: 1, sessions: { openai: { ...session, transaction: "test-transaction" } } },
      }),
    )
    expect(
      await SharedAuth.refresh(dir, "openai", async () => {
        throw new Error("MUST_NOT_REFRESH")
      }),
    ).toEqual(newAuth)
    expect(await fs.readdir(dir)).not.toContain("refresh-pending.json")
  })

  test("generic set and arbitrary token edits cannot acknowledge uncertainty", async () => {
    const dir = await directory()
    let exchanges = 0
    await expect(
      SharedAuth.refresh(dir, "openai", async () => {
        exchanges++
        throw new Error("AMBIGUOUS")
      }),
    ).rejects.toThrow("AMBIGUOUS")
    await expect(SharedAuth.mutate(dir, "openai", (data) => ({ ...data, openai: oldAuth }))).rejects.toThrow(
      "SHARED_AUTH_REFRESH_UNCERTAIN_RELOGIN_REQUIRED",
    )
    const raw = JSON.parse(await fs.readFile(path.join(dir, "auth.json"), "utf8"))
    await fs.writeFile(path.join(dir, "auth.json"), JSON.stringify({ ...raw, openai: newAuth }))
    await expect(
      SharedAuth.refresh(dir, "openai", async () => {
        exchanges++
        return newAuth
      }),
    ).rejects.toThrow("SHARED_AUTH_REFRESH_UNCERTAIN_RELOGIN_REQUIRED")
    expect(exchanges).toBe(1)
    await SharedAuth.login(dir, "openai", newAuth)
    expect(
      await SharedAuth.refresh(dir, "openai", async () => {
        throw new Error("MUST_NOT_REFRESH")
      }),
    ).toEqual(newAuth)
  })

  test("pins generation and preserves rotated tokens from an unexpected subject", async () => {
    const dir = await directory()
    const initial = await SharedAuth.snapshot(dir, "openai")
    const changed = fakeAuth("wrong-subject", Date.now() + 3600_000, "other-user")
    await expect(SharedAuth.refresh(dir, "openai", async () => changed, undefined, initial.session)).rejects.toThrow(
      "SHARED_AUTH_IDENTITY_CHANGED",
    )
    expect((await SharedAuth.read(dir)).openai).toEqual(changed)
    await expect(SharedAuth.snapshot(dir, "openai")).rejects.toThrow("SHARED_AUTH_REFRESH_UNCERTAIN_RELOGIN_REQUIRED")
    await SharedAuth.login(dir, "openai", newAuth)
    await expect(SharedAuth.refresh(dir, "openai", async () => newAuth, undefined, initial.session)).rejects.toThrow(
      "SHARED_AUTH_IDENTITY_CHANGED",
    )
  })

  test("cancels a waiter without releasing the active writer lock", async () => {
    const dir = await directory()
    const started = signal()
    const finish = signal()
    const active = SharedAuth.refresh(dir, "openai", async () => {
      started.resolve()
      await finish.wait()
      return newAuth
    })
    await started.wait()
    const controller = new AbortController()
    const waiting = SharedAuth.snapshot(dir, "openai", controller.signal)
    controller.abort()
    await expect(waiting).rejects.toThrow()
    expect(await fs.readdir(dir)).toContain("refresh-pending.json")
    const probeController = new AbortController()
    const probe = SharedAuth.read(dir, probeController.signal)
    await Bun.sleep(50)
    probeController.abort()
    await expect(probe).rejects.toThrow()
    finish.resolve()
    expect(await active).toEqual(newAuth)
  })

  test("concurrent other-provider writes are preserved", async () => {
    const dir = await directory()
    const outcomes = await Promise.all([result(worker("set", dir, "", "a")), result(worker("set", dir, "", "b"))])
    expect(outcomes.map((x) => x.code)).toEqual([0, 0])
    expect(Object.keys(await SharedAuth.read(dir)).sort()).toEqual(["a", "b", "openai", "other"])
  })

  test("malformed JSON is preserved without exposing credential text", async () => {
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

  test("death after exchange response never replays the remotely rotated token", async () => {
    const dir = await directory()
    let tokens = 0
    const url = serve(() => {
      tokens++
      return Response.json(newAuth)
    })
    expect((await result(worker("kill-response", dir, url))).code).not.toBe(0)
    expect((await result(worker("refresh", dir, url))).error).toContain(
      "SHARED_AUTH_REFRESH_UNCERTAIN_RELOGIN_REQUIRED",
    )
    expect(tokens).toBe(1)
  })

  test("lock wait has the real sixty-second deadline", async () => {
    const dir = await directory()
    const started = Promise.withResolvers<void>()
    const finish = Promise.withResolvers<void>()
    const url = serve(async () => {
      started.resolve()
      await finish.promise
      return Response.json(newAuth)
    })
    const owner = worker("refresh", dir, url)
    await started.promise
    const start = performance.now()
    const blocked = await result(worker("read", dir))
    finish.resolve()
    expect((await result(owner)).code).toBe(0)
    expect(blocked.error).toContain("SHARED_AUTH_LOCK_TIMEOUT")
    expect(performance.now() - start).toBeGreaterThan(59000)
    expect(performance.now() - start).toBeLessThan(65000)
  }, 70000)
})
