import { expect, test } from "bun:test"
import { Effect, Exit, Scope } from "effect"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { ServiceOwner } from "../src/service-owner"

// B4.16, decision В-97 п. 3: a service that Desktop started stops once its window is gone. The windows here are real
// processes and `kill -9` is a real signal; `stop` stands for the latch of the service's soft stop.

const grace = 400
const poll = 25

test("the window is killed: the service opens its stop latch after the grace period", async () => {
  await using fixture = await owned()

  fixture.window.kill("SIGKILL")
  await fixture.window.exited
  const killed = Date.now()

  await expect(fixture.stopped(5_000)).resolves.toBe(true)
  expect(Date.now() - killed).toBeGreaterThanOrEqual(grace - poll)
})

test("a window that is alive keeps the service", async () => {
  await using fixture = await owned()

  await expect(fixture.stopped(grace * 3)).resolves.toBe(false)
})

test("a window that returns within the grace period takes the service over", async () => {
  await using fixture = await owned()
  await using next = await window()

  fixture.window.kill("SIGKILL")
  await fixture.window.exited
  await Bun.sleep(grace / 2)
  await fs.writeFile(fixture.file, String(next.pid))

  await expect(fixture.stopped(grace * 3)).resolves.toBe(false)

  // The new window goes too, and the service follows it.
  next.kill("SIGKILL")
  await next.exited
  const killed = Date.now()
  await expect(fixture.stopped(5_000)).resolves.toBe(true)
  // The grace period of the second window starts with its own death, not with the first one's.
  expect(Date.now() - killed).toBeGreaterThanOrEqual(grace - poll)
})

test("a removed owner file counts as a gone window, an unreadable one does not", async () => {
  await using removed = await owned()
  await fs.rm(removed.file)
  await expect(removed.stopped(5_000)).resolves.toBe(true)

  await using garbled = await owned()
  await fs.writeFile(garbled.file, "")
  garbled.window.kill("SIGKILL")
  await expect(garbled.stopped(grace * 3)).resolves.toBe(false)
})

test("without an owner file nothing is watched, and tools do not inherit the variable", async () => {
  let stopped = false
  process.env.LOGINOM_AI_AGENT_SERVICE_OWNER = path.join(os.tmpdir(), "service-owner-unset")

  await Effect.runPromise(
    Effect.scoped(
      ServiceOwner.watch(
        Effect.sync(() => void (stopped = true)),
        { file: "", grace, poll },
      ).pipe(Effect.andThen(Effect.sleep(grace * 2))),
    ),
  )

  expect(process.env.LOGINOM_AI_AGENT_SERVICE_OWNER).toBeUndefined()
  expect(stopped).toBe(false)
})

async function window() {
  const child = Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)"], {
    stdout: "ignore",
    stderr: "ignore",
  })

  return {
    pid: child.pid,
    exited: child.exited,
    kill: (signal: NodeJS.Signals) => child.kill(signal),
    async [Symbol.asyncDispose]() {
      child.kill("SIGKILL")
      await child.exited
    },
  }
}

// A service watching a window, and the window's owner file.
async function owned() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "service-owner-"))
  const file = path.join(directory, "service-desktop.owner")
  const child = await window()
  const scope = await Effect.runPromise(Scope.make())
  let stopped = false
  await fs.writeFile(file, String(child.pid))

  await Effect.runPromise(
    ServiceOwner.watch(
      Effect.sync(() => void (stopped = true)),
      { file, grace, poll },
    ).pipe(Effect.provideService(Scope.Scope, scope)),
  )

  return {
    file,
    window: child,
    // Whether the stop latch opened within `timeout`.
    async stopped(timeout: number) {
      const deadline = Date.now() + timeout
      while (!stopped && Date.now() < deadline) await Bun.sleep(poll)

      return stopped
    },
    async [Symbol.asyncDispose]() {
      await Effect.runPromise(Scope.close(scope, Exit.void))
      await child[Symbol.asyncDispose]()
      await fs.rm(directory, { recursive: true, force: true })
    },
  }
}
