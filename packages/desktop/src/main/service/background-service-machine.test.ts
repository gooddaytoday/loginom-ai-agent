import { describe, expect, test } from "bun:test"
import { Deferred, Effect, Fiber } from "effect"
import { Shutdown } from "../lifecycle/shutdown"
import { BackgroundServiceMachine } from "./background-service-machine"

const A = { url: "http://127.0.0.1:4100", password: "a" }

const B = { url: "http://127.0.0.1:4200", password: "b" }

const C = { url: "http://127.0.0.1:4300", password: "c" }

const reply = (): BackgroundServiceMachine.Reply => ({ resolve: () => undefined, reject: () => undefined })

// Folds events through the machine and keeps the commands of each step.
function replay(
  events: readonly BackgroundServiceMachine.Event[],
  from: BackgroundServiceMachine.State = BackgroundServiceMachine.initialTransition().state,
) {
  return events.reduce<{
    state: BackgroundServiceMachine.State
    commands: (readonly BackgroundServiceMachine.Command[])[]
  }>(
    (result, event) => {
      const next = BackgroundServiceMachine.transition(result.state, event)

      return { state: next.state, commands: [...result.commands, next.commands] }
    },
    { state: from, commands: [] },
  )
}

const readyA = replay([{ type: "connect.succeeded", attempt: 1, data: A }]).state

describe("background service connection", () => {
  test("starts the initial connect at once", () => {
    expect(BackgroundServiceMachine.initialTransition()).toEqual({
      state: { status: "connecting", attempt: 1, waiters: [] },
      commands: [{ type: "connect", attempt: 1, mode: "initial" }],
    })
  })

  test("windows that reconnect together share one attempt and all move to its service", () => {
    const [r1, r2, r3] = [reply(), reply(), reply()]

    const result = replay(
      [
        { type: "reconnect.requested", reply: r1 },
        { type: "reconnect.requested", reply: r2 },
        { type: "connection.requested", reply: r3 },
        { type: "connect.succeeded", attempt: 2, data: B },
      ],
      readyA,
    )

    expect(result.commands).toEqual([
      [{ type: "connect", attempt: 2, mode: "reconnect" }],
      [],
      [],
      [
        { type: "publish", data: B },
        { type: "resolve", replies: [r1, r2, r3], data: B },
      ],
    ])
    expect(result.state).toEqual({ status: "ready", attempt: 2, data: B })
  })

  test("a reconnect that finds the same service publishes nothing", () => {
    const r1 = reply()

    const result = replay(
      [
        { type: "reconnect.requested", reply: r1 },
        { type: "connect.succeeded", attempt: 2, data: { ...A } },
      ],
      readyA,
    )

    expect(result.commands.at(-1)).toEqual([{ type: "resolve", replies: [r1], data: A }])
  })

  test("a probed service is adopted at once and replaced by the one its verification settles on", () => {
    const r1 = reply()

    const probed = replay([
      { type: "connection.requested", reply: r1 },
      { type: "probe.succeeded", attempt: 1, data: A },
    ])

    expect(probed.commands.at(-1)).toEqual([
      { type: "publish", data: A },
      { type: "resolve", replies: [r1], data: A },
      { type: "verify", attempt: 1 },
    ])

    const replaced = replay([{ type: "verify.succeeded", attempt: 1, data: B }], probed.state)

    expect(replaced.state).toEqual({ status: "ready", attempt: 1, data: B })
    expect(replaced.commands).toEqual([[{ type: "publish", data: B }]])

    const confirmed = replay([{ type: "verify.succeeded", attempt: 1, data: { ...A } }], probed.state)

    expect(confirmed.state).toBe(probed.state)
    expect(confirmed.commands).toEqual([[]])
  })

  test("a failed verification keeps the probed service", () => {
    const probed = replay([{ type: "probe.succeeded", attempt: 1, data: A }]).state
    const result = replay([{ type: "verify.failed", attempt: 1, error: new Error("handoff failed") }], probed)

    expect(result.state).toBe(probed)
    expect(result.commands).toEqual([[]])
  })

  test("a failed initial connect is retried by the next window instead of replayed", () => {
    const [r1, r2] = [reply(), reply()]
    const error = new Error("config invalid")

    const result = replay([
      { type: "connection.requested", reply: r1 },
      { type: "connect.failed", attempt: 1, error },
      { type: "connection.requested", reply: r2 },
      { type: "connect.succeeded", attempt: 2, data: A },
    ])

    expect(result.commands).toEqual([
      [],
      [{ type: "reject", replies: [r1], error }],
      [{ type: "connect", attempt: 2, mode: "initial" }],
      [
        { type: "publish", data: A },
        { type: "resolve", replies: [r2], data: A },
      ],
    ])
  })

  test("a failed reconnect keeps the last service and retries as a reconnect", () => {
    const [r1, r2] = [reply(), reply()]
    const error = new Error("port in use")

    const failed = replay(
      [
        { type: "reconnect.requested", reply: r1 },
        { type: "connect.failed", attempt: 2, error },
      ],
      readyA,
    )

    expect(failed.state).toEqual({ status: "failed", attempt: 2, error, last: A })
    expect(failed.commands.at(-1)).toEqual([{ type: "reject", replies: [r1], error }])

    const retried = replay([{ type: "connection.requested", reply: r2 }], failed.state)

    expect(retried.state).toEqual({ status: "reconnecting", attempt: 3, data: A, waiters: [], joiners: [r2] })
    expect(retried.commands).toEqual([[{ type: "connect", attempt: 3, mode: "reconnect" }]])
  })

  test("a window that opens during a reconnect that fails still gets the last service", () => {
    const [reconnect, opened, retry] = [reply(), reply(), reply()]
    const error = new Error("port in use")

    const result = replay(
      [
        { type: "reconnect.requested", reply: reconnect },
        { type: "connection.requested", reply: opened },
        { type: "connect.failed", attempt: 2, error },
        // The next window to open retries, and keeps the last service if that fails too.
        { type: "connection.requested", reply: retry },
        { type: "connect.failed", attempt: 3, error },
      ],
      readyA,
    )

    expect(result.commands).toEqual([
      [{ type: "connect", attempt: 2, mode: "reconnect" }],
      [],
      [
        { type: "resolve", replies: [opened], data: A },
        { type: "reject", replies: [reconnect], error },
      ],
      [{ type: "connect", attempt: 3, mode: "reconnect" }],
      [{ type: "resolve", replies: [retry], data: A }],
    ])
    expect(result.state).toEqual({ status: "failed", attempt: 3, error, last: A })
  })

  test("without a previous service, every caller of a failed attempt gets the error", () => {
    const [opened, reconnect] = [reply(), reply()]
    const error = new Error("config invalid")

    const result = replay([
      { type: "connection.requested", reply: opened },
      { type: "reconnect.requested", reply: reconnect },
      { type: "connect.failed", attempt: 1, error },
    ])

    expect(result.commands.at(-1)).toEqual([{ type: "reject", replies: [opened, reconnect], error }])
  })

  test("ignores results of an attempt a reconnect superseded", () => {
    const r1 = reply()
    const probed = replay([{ type: "probe.succeeded", attempt: 1, data: A }]).state
    const reconnecting = replay([{ type: "reconnect.requested", reply: r1 }], probed).state

    const result = replay(
      [
        { type: "verify.succeeded", attempt: 1, data: C },
        { type: "verify.failed", attempt: 1, error: new Error("late") },
        { type: "connect.succeeded", attempt: 1, data: C },
        { type: "connect.failed", attempt: 1, error: new Error("late") },
        { type: "probe.succeeded", attempt: 2, data: C },
      ],
      reconnecting,
    )

    expect(result.state).toBe(reconnecting)
    expect(result.commands.flat()).toEqual([])
  })

  test("a window that closes while it waits for a reconnect is not answered", () => {
    const [reconnect, opened] = [reply(), reply()]
    const error = new Error("port in use")

    const result = replay(
      [
        { type: "reconnect.requested", reply: reconnect },
        { type: "connection.requested", reply: opened },
        { type: "waiter.cancelled", reply: opened },
        { type: "connect.failed", attempt: 2, error },
      ],
      readyA,
    )

    expect(result.commands.at(-1)).toEqual([{ type: "reject", replies: [reconnect], error }])
  })

  test("a window that stops waiting leaves the attempt to the others", () => {
    const [r1, r2] = [reply(), reply()]

    const waiting = replay([
      { type: "connection.requested", reply: r1 },
      { type: "connection.requested", reply: r2 },
    ]).state

    const cancelled = replay([{ type: "waiter.cancelled", reply: r1 }], waiting)
    const unknown = replay([{ type: "waiter.cancelled", reply: reply() }], cancelled.state)
    const done = replay([{ type: "connect.succeeded", attempt: 1, data: A }], cancelled.state)

    expect(cancelled.state).toEqual({ status: "connecting", attempt: 1, waiters: [r2] })
    expect(unknown.state).toBe(cancelled.state)
    expect(done.commands.at(-1)).toContainEqual({ type: "resolve", replies: [r2], data: A })
  })

  test("disposal rejects every waiter and every later caller", () => {
    const [r1, r2, r3] = [reply(), reply(), reply()]
    const reconnecting = replay([{ type: "reconnect.requested", reply: r1 }], readyA).state

    const result = replay(
      [
        { type: "disposed" },
        { type: "connect.succeeded", attempt: 2, data: B },
        { type: "connection.requested", reply: r2 },
        { type: "reconnect.requested", reply: r3 },
      ],
      reconnecting,
    )

    expect(result.state).toEqual({ status: "disposed" })
    expect(result.commands.map((commands) => commands.map((command) => command.type))).toEqual([
      ["reject"],
      [],
      ["reject"],
      ["reject"],
    ])
    expect(result.commands.flat().flatMap((command) => (command.type === "reject" ? command.replies : []))).toEqual([
      r1,
      r2,
      r3,
    ])
  })

  // Loginom AI Agent (B4.10): the service stops before the app quits or hands off to an update.
  test("a stop turns every caller away and drops the attempt in flight; a resume connects again", () => {
    const [reconnect, opened, again, reloaded] = [reply(), reply(), reply(), reply()]
    const reconnecting = replay([{ type: "reconnect.requested", reply: reconnect }], readyA).state

    const stopped = replay(
      [
        { type: "connection.requested", reply: opened },
        { type: "stop.requested" },
        // A window whose event stream the stop broke, and a window that reloads, start no service.
        { type: "reconnect.requested", reply: again },
        { type: "connection.requested", reply: reloaded },
        { type: "connect.succeeded", attempt: 2, data: B },
        { type: "stop.requested" },
      ],
      reconnecting,
    )

    expect(stopped.commands).toEqual([
      [],
      [{ type: "reject", replies: [reconnect, opened], error: expect.any(Error) }],
      [{ type: "reject", replies: [again], error: expect.any(Error) }],
      [{ type: "reject", replies: [reloaded], error: expect.any(Error) }],
      [],
      [],
    ])
    expect(stopped.state).toEqual({ status: "stopped", attempt: 2, last: A })

    const resumed = replay(
      [
        { type: "resume.requested" },
        { type: "connect.succeeded", attempt: 2, data: C },
        { type: "connect.succeeded", attempt: 3, data: B },
      ],
      stopped.state,
    )

    expect(resumed.commands).toEqual([
      [{ type: "connect", attempt: 3, mode: "reconnect" }],
      [],
      [{ type: "publish", data: B }],
    ])

    // Before any service was reached, the resume is a first connect.
    const early = replay([{ type: "stop.requested" }, { type: "resume.requested" }])

    expect(early.commands.at(-1)).toEqual([{ type: "connect", attempt: 2, mode: "initial" }])
  })
})

describe("background service driver", () => {
  test("callers wait for the initial connect", async () => {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const gate = yield* Deferred.make<void>()

          const machine = yield* BackgroundServiceMachine.make({
            probe: Effect.succeed(undefined),
            ensure: () => Deferred.await(gate).pipe(Effect.as(A)),
            publish: () => undefined,
          })

          const consumer = yield* Effect.forkChild(machine.connection, { startImmediately: true })
          yield* Effect.yieldNow
          expect(consumer.pollUnsafe()).toBeUndefined()
          yield* Deferred.succeed(gate, undefined)

          return yield* Fiber.join(consumer)
        }),
      ).pipe(Effect.provide(Shutdown.layer)),
    )

    expect(result).toEqual(A)
  })

  test("a connect that dies fails its callers, and the next caller connects again", async () => {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const gate = yield* Deferred.make<void>()
          const attempts: string[] = []

          const machine = yield* BackgroundServiceMachine.make({
            probe: Effect.succeed(undefined),
            ensure: (mode) =>
              Effect.suspend(() => {
                attempts.push(mode)

                return attempts.length === 1
                  ? Deferred.await(gate).pipe(Effect.andThen(Effect.die(new Error("CLI missing"))))
                  : Effect.succeed(A)
              }),
            publish: () => undefined,
          })

          const waiting = yield* Effect.forkChild(machine.connection.pipe(Effect.exit), { startImmediately: true })
          yield* Deferred.succeed(gate, undefined)
          const first = yield* Fiber.join(waiting)

          return { first: first._tag, second: yield* machine.connection, attempts }
        }),
      ).pipe(Effect.provide(Shutdown.layer)),
    )

    expect(result).toEqual({ first: "Failure", second: A, attempts: ["initial", "initial"] })
  })

  test("concurrent reconnects run one ensure and publish each new service once", async () => {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const gate = yield* Deferred.make<void>()
          const attempts: string[] = []
          const published: string[] = []

          const machine = yield* BackgroundServiceMachine.make({
            probe: Effect.succeed(undefined),
            ensure: (mode) =>
              Effect.suspend(() => {
                attempts.push(mode)

                return mode === "initial" ? Effect.succeed(A) : Deferred.await(gate).pipe(Effect.as(B))
              }),
            publish: (data) => published.push(data.url),
          })

          yield* machine.connection

          const fibers = yield* Effect.forEach([1, 2, 3], () =>
            Effect.forkChild(machine.reconnect, { startImmediately: true }),
          )

          yield* Effect.yieldNow
          yield* Deferred.succeed(gate, undefined)

          return { replies: yield* Fiber.joinAll(fibers), attempts, published }
        }),
      ).pipe(Effect.provide(Shutdown.layer)),
    )

    expect(result).toEqual({
      replies: [B, B, B],
      attempts: ["initial", "reconnect"],
      published: [A.url, B.url],
    })
  })

  test("adopts a probed service and moves to the one its verification starts", async () => {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const gate = yield* Deferred.make<void>()
          const verified = yield* Deferred.make<void>()
          const published: string[] = []

          const machine = yield* BackgroundServiceMachine.make({
            probe: Effect.succeed(A),
            ensure: () => Deferred.await(gate).pipe(Effect.as(B)),
            publish: (data) => {
              published.push(data.url)

              if (data.url === B.url) Deferred.doneUnsafe(verified, Effect.void)
            },
          })

          const first = yield* machine.connection
          yield* Deferred.succeed(gate, undefined)
          yield* Deferred.await(verified)

          return { first, next: yield* machine.connection, published }
        }),
      ).pipe(Effect.provide(Shutdown.layer)),
    )

    expect(result).toEqual({ first: A, next: B, published: [A.url, B.url] })
  })

  // Loginom AI Agent (B4.10): the machine is the app's `Shutdown` participant for its service.
  test("a quit stops the service once the attempt in flight settles, and no window starts it again", async () => {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const shutdown = yield* Shutdown.Service
          const gate = yield* Deferred.make<void>()
          const steps: string[] = []
          const published: string[] = []

          const machine = yield* BackgroundServiceMachine.make({
            probe: Effect.succeed(undefined),
            ensure: (mode) =>
              Effect.sync(() => steps.push(`ensure ${mode}`)).pipe(
                Effect.andThen(Deferred.await(gate)),
                Effect.andThen(Effect.sync(() => steps.push(`settled ${mode}`))),
                Effect.as(A),
              ),
            publish: (data) => published.push(data.url),
            stop: Effect.sync(() => steps.push("stop")),
          })

          // The first window waits for a service that is still starting when the app quits. The quit breaks the
          // window's event stream, and the window asks to reconnect.
          const opened = yield* Effect.forkChild(machine.connection.pipe(Effect.exit), { startImmediately: true })
          const quit = yield* Effect.forkChild(shutdown.stop, { startImmediately: true })
          const reconnect = yield* Effect.forkChild(machine.reconnect.pipe(Effect.exit), { startImmediately: true })
          yield* Effect.yieldNow
          const beforeStart = [...steps]
          yield* Deferred.succeed(gate, undefined)
          yield* Fiber.join(quit)

          return {
            opened: (yield* Fiber.join(opened))._tag,
            reconnect: (yield* Fiber.join(reconnect))._tag,
            beforeStart,
            steps,
            published,
          }
        }),
      ).pipe(Effect.provide(Shutdown.layer)),
    )

    expect(result).toEqual({
      opened: "Failure",
      reconnect: "Failure",
      beforeStart: ["ensure initial"],
      steps: ["ensure initial", "settled initial", "stop"],
      published: [],
    })
  })

  test("a failed update handoff starts the service again and moves every window to it", async () => {
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const shutdown = yield* Shutdown.Service
          const moved = yield* Deferred.make<void>()
          const steps: string[] = []
          const published: string[] = []

          const machine = yield* BackgroundServiceMachine.make({
            probe: Effect.succeed(undefined),
            ensure: (mode) =>
              Effect.sync(() => steps.push(`ensure ${mode}`)).pipe(Effect.as(mode === "initial" ? A : B)),
            publish: (data) => {
              published.push(data.url)

              if (data.url === B.url) Deferred.doneUnsafe(moved, Effect.void)
            },
            stop: Effect.sync(() => steps.push("stop")),
          })

          yield* machine.connection
          yield* shutdown.stop
          yield* shutdown.resume
          yield* Deferred.await(moved)

          return { next: yield* machine.connection, steps, published }
        }),
      ).pipe(Effect.provide(Shutdown.layer)),
    )

    expect(result).toEqual({
      next: B,
      steps: ["ensure initial", "stop", "ensure reconnect"],
      published: [A.url, B.url],
    })
  })
})
