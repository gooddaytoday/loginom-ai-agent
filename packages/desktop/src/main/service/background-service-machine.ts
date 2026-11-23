export * as BackgroundServiceMachine from "./background-service-machine"

import { Cause, Effect, Exit, FiberSet } from "effect"
import { Shutdown } from "../lifecycle/shutdown"
import type { SidecarCredentials } from "./sidecar-credentials"

type Data = SidecarCredentials.Data

/** `initial` may adopt a service the entry module found; `reconnect` always runs `Service.ensure`. */
export type ConnectMode = "initial" | "reconnect"

/** Settles one caller of `connection` or `reconnect`. */
export type Reply = {
  readonly resolve: (data: Data) => void
  readonly reject: (error: Error) => void
}

/**
 * The connection to the background service every window shares. Each attempt to reach it has an id, and a result
 * of any other attempt is stale. Callers that arrive while an attempt runs wait for that attempt.
 */
export type State =
  /** No service has been reached yet. */
  | { readonly status: "connecting"; readonly attempt: number; readonly waiters: readonly Reply[] }
  /** `data` is the active service. A probed service is still verified by `attempt`'s `Service.ensure`. */
  | { readonly status: "ready"; readonly attempt: number; readonly data: Data }
  /**
   * Requests keep using `data` until the reconnect replaces it. `waiters` asked to reconnect and share its outcome.
   * `joiners` opened or reloaded a window meanwhile: a failed reconnect answers them with `data`, the service they
   * would have received before it started.
   */
  | {
      readonly status: "reconnecting"
      readonly attempt: number
      readonly data: Data
      readonly waiters: readonly Reply[]
      readonly joiners: readonly Reply[]
    }
  /**
   * The last attempt failed; the next caller starts a new one instead of receiving `error` again. `last` is the
   * service reached before it, if any.
   */
  | { readonly status: "failed"; readonly attempt: number; readonly error: Error; readonly last: Data | undefined }
  /**
   * Loginom AI Agent (B4.10): the app stops its service before it quits or hands off to an update. Every caller is
   * turned away, so no window starts the service again, and a result of an attempt in flight is dropped. `last` is the
   * service reached before, which `resume.requested` replaces.
   */
  | { readonly status: "stopped"; readonly attempt: number; readonly last: Data | undefined }
  | { readonly status: "disposed" }

export type Event =
  | { readonly type: "connection.requested"; readonly reply: Reply }
  | { readonly type: "reconnect.requested"; readonly reply: Reply }
  | { readonly type: "waiter.cancelled"; readonly reply: Reply }
  | { readonly type: "probe.succeeded"; readonly attempt: number; readonly data: Data }
  | { readonly type: "connect.succeeded"; readonly attempt: number; readonly data: Data }
  | { readonly type: "connect.failed"; readonly attempt: number; readonly error: Error }
  | { readonly type: "verify.succeeded"; readonly attempt: number; readonly data: Data }
  | { readonly type: "verify.failed"; readonly attempt: number; readonly error: Error }
  | { readonly type: "stop.requested" }
  | { readonly type: "resume.requested" }
  | { readonly type: "disposed" }

export type Command =
  | { readonly type: "connect"; readonly attempt: number; readonly mode: ConnectMode }
  | { readonly type: "verify"; readonly attempt: number }
  | { readonly type: "publish"; readonly data: Data }
  | { readonly type: "resolve"; readonly replies: readonly Reply[]; readonly data: Data }
  | { readonly type: "reject"; readonly replies: readonly Reply[]; readonly error: Error }

export type Transition = {
  readonly state: State
  readonly commands: readonly Command[]
}

const DISPOSED_ERROR = new Error("Background service is disposed")

const STOPPED_ERROR = new Error("Background service is stopped")

export function initialTransition(): Transition {
  return {
    state: { status: "connecting", attempt: 1, waiters: [] },
    commands: [{ type: "connect", attempt: 1, mode: "initial" }],
  }
}

export function transition(state: State, event: Event): Transition {
  if (state.status === "disposed") {
    if (event.type === "connection.requested" || event.type === "reconnect.requested")
      return { state, commands: [{ type: "reject", replies: [event.reply], error: DISPOSED_ERROR }] }

    return unchanged(state)
  }

  if (event.type === "disposed")
    return {
      state: { status: "disposed" },
      commands: reject(pending(state), DISPOSED_ERROR),
    }

  if (state.status === "stopped") return stopped(state, event)

  if (event.type === "stop.requested")
    return {
      state: { status: "stopped", attempt: state.attempt, last: active(state) },
      commands: reject(pending(state), STOPPED_ERROR),
    }

  if (state.status === "connecting") return connecting(state, event)

  if (state.status === "reconnecting") return reconnecting(state, event)

  if (state.status === "ready") return ready(state, event)

  if (event.type !== "connection.requested" && event.type !== "reconnect.requested") return unchanged(state)

  const attempt = state.attempt + 1

  // A service that was reached before is replaced the way a reconnect replaces it; otherwise this is a new first
  // connect, so a failure that has since been fixed (a config error, a port race) is not replayed.
  if (state.last)
    return {
      state: {
        status: "reconnecting",
        attempt,
        data: state.last,
        waiters: event.type === "reconnect.requested" ? [event.reply] : [],
        joiners: event.type === "connection.requested" ? [event.reply] : [],
      },
      commands: [{ type: "connect", attempt, mode: "reconnect" }],
    }

  return {
    state: { status: "connecting", attempt, waiters: [event.reply] },
    commands: [{ type: "connect", attempt, mode: "initial" }],
  }
}

// No service was reached yet, so every caller shares the attempt's outcome, failure included.
function connecting(state: Extract<State, { status: "connecting" }>, event: Event): Transition {
  // Every caller joins the attempt in flight, so windows that start together run one `Service.ensure`.
  if (event.type === "connection.requested" || event.type === "reconnect.requested")
    return { state: { ...state, waiters: [...state.waiters, event.reply] }, commands: [] }

  if (event.type === "waiter.cancelled") {
    if (!state.waiters.includes(event.reply)) return unchanged(state)

    return { state: { ...state, waiters: without(state.waiters, event.reply) }, commands: [] }
  }

  if (!("attempt" in event) || event.attempt !== state.attempt) return unchanged(state)

  if (event.type === "probe.succeeded")
    return {
      state: { status: "ready", attempt: state.attempt, data: event.data },
      commands: [
        { type: "publish", data: event.data },
        ...resolve(state.waiters, event.data),
        { type: "verify", attempt: state.attempt },
      ],
    }

  if (event.type === "connect.succeeded")
    return {
      state: { status: "ready", attempt: state.attempt, data: event.data },
      commands: [{ type: "publish", data: event.data }, ...resolve(state.waiters, event.data)],
    }

  if (event.type === "connect.failed")
    return {
      state: { status: "failed", attempt: state.attempt, error: event.error, last: undefined },
      commands: reject(state.waiters, event.error),
    }

  return unchanged(state)
}

function reconnecting(state: Extract<State, { status: "reconnecting" }>, event: Event): Transition {
  // Windows that reconnect together run one `Service.ensure`; a window that opens meanwhile waits for it too.
  if (event.type === "reconnect.requested")
    return { state: { ...state, waiters: [...state.waiters, event.reply] }, commands: [] }

  if (event.type === "connection.requested")
    return { state: { ...state, joiners: [...state.joiners, event.reply] }, commands: [] }

  if (event.type === "waiter.cancelled") {
    if (!state.waiters.includes(event.reply) && !state.joiners.includes(event.reply)) return unchanged(state)

    return {
      state: { ...state, waiters: without(state.waiters, event.reply), joiners: without(state.joiners, event.reply) },
      commands: [],
    }
  }

  if (event.type !== "connect.succeeded" && event.type !== "connect.failed") return unchanged(state)

  if (event.attempt !== state.attempt) return unchanged(state)

  if (event.type === "connect.succeeded")
    return {
      state: { status: "ready", attempt: state.attempt, data: event.data },
      commands: [
        ...(same(state.data, event.data) ? [] : [{ type: "publish" as const, data: event.data }]),
        ...resolve([...state.waiters, ...state.joiners], event.data),
      ],
    }

  // A window that only asked for the connection still gets the last service, as it would have before the reconnect
  // started; only the windows that asked to reconnect see the failure.
  return {
    state: { status: "failed", attempt: state.attempt, error: event.error, last: state.data },
    commands: [...resolve(state.joiners, state.data), ...reject(state.waiters, event.error)],
  }
}

function ready(state: Extract<State, { status: "ready" }>, event: Event): Transition {
  if (event.type === "connection.requested")
    return { state, commands: [{ type: "resolve", replies: [event.reply], data: state.data }] }

  if (event.type === "reconnect.requested") {
    const attempt = state.attempt + 1

    // The new attempt also supersedes a verification still running for the current one.
    return {
      state: { status: "reconnecting", attempt, data: state.data, waiters: [event.reply], joiners: [] },
      commands: [{ type: "connect", attempt, mode: "reconnect" }],
    }
  }

  // `Service.ensure` replaced the probed service (it had exited or was incompatible): move every window to it.
  if (event.type === "verify.succeeded" && event.attempt === state.attempt && !same(state.data, event.data))
    return {
      state: { status: "ready", attempt: state.attempt, data: event.data },
      commands: [{ type: "publish", data: event.data }],
    }

  // A failed verification keeps the probed service, which answered the probe; a window that loses it reconnects.
  return unchanged(state)
}

function stopped(state: Extract<State, { status: "stopped" }>, event: Event): Transition {
  if (event.type === "connection.requested" || event.type === "reconnect.requested")
    return { state, commands: [{ type: "reject", replies: [event.reply], error: STOPPED_ERROR }] }

  if (event.type !== "resume.requested") return unchanged(state)

  const attempt = state.attempt + 1

  // A failed handoff keeps the windows open: they move to the service this attempt starts.
  if (state.last)
    return {
      state: { status: "reconnecting", attempt, data: state.last, waiters: [], joiners: [] },
      commands: [{ type: "connect", attempt, mode: "reconnect" }],
    }

  return {
    state: { status: "connecting", attempt, waiters: [] },
    commands: [{ type: "connect", attempt, mode: "initial" }],
  }
}

function resolve(replies: readonly Reply[], data: Data): Command[] {
  return replies.length > 0 ? [{ type: "resolve", replies, data }] : []
}

function reject(replies: readonly Reply[], error: Error): Command[] {
  return replies.length > 0 ? [{ type: "reject", replies, error }] : []
}

/** The service callers are using, if any. */
function active(state: State) {
  if (state.status === "ready" || state.status === "reconnecting") return state.data

  if (state.status === "failed") return state.last

  return undefined
}

/** Every caller still waiting on an attempt. */
function pending(state: State) {
  if (state.status === "connecting") return state.waiters

  if (state.status === "reconnecting") return [...state.waiters, ...state.joiners]

  return []
}

function without(replies: readonly Reply[], reply: Reply) {
  return replies.filter((item) => item !== reply)
}

function same(a: Data, b: Data) {
  return a.url === b.url && a.password === b.password
}

function unchanged(state: State): Transition {
  return { state, commands: [] }
}

/**
 * Runs the machine for the scope's lifetime. The initial connect starts at once, in the background: windows are
 * created as soon as the main process is up, and their renderers load while the CLI service is resolved. The service
 * stops with the app, as a `Shutdown` participant.
 */
export const make = Effect.fn("BackgroundServiceMachine.make")(function* (input: {
  /** The compatible service the entry module found, if any. */
  readonly probe: Effect.Effect<Data | undefined, unknown>
  readonly ensure: (mode: ConnectMode) => Effect.Effect<Data, unknown>
  /** Called when the active service changes. */
  readonly publish: (data: Data) => void
  /** Loginom AI Agent (B4.10): stops the service `ensure` starts. */
  readonly stop: Effect.Effect<void>
}) {
  const shutdown = yield* Shutdown.Service
  const fibers = yield* FiberSet.make()
  const run = yield* FiberSet.runtime(fibers)()
  const initial = initialTransition()
  const current = { state: initial.state }

  const dispatch = (event: Event) => {
    const next = transition(current.state, event)
    current.state = next.state
    next.commands.forEach(perform)
  }

  // A failure of `ensure` can be a defect (`DesktopCli.resolve` dies), so every exit reports back as an event. An
  // interrupt only happens on disposal, which the machine already left.
  const report = (effect: Effect.Effect<Event, unknown>, failed: (error: Error) => Event) =>
    run(
      effect.pipe(
        Effect.exit,
        Effect.flatMap((exit) => {
          if (Exit.isSuccess(exit)) return Effect.sync(() => dispatch(exit.value))

          if (Cause.hasInterruptsOnly(exit.cause)) return Effect.void

          const error = Cause.squash(exit.cause)
          const event = failed(error instanceof Error ? error : new Error(String(error)))

          return Effect.logError("v2 CLI background service failed", { event }).pipe(
            Effect.andThen(Effect.sync(() => dispatch(event))),
          )
        }),
      ),
    )

  const perform = (command: Command) => {
    if (command.type === "connect") {
      const attempt = command.attempt

      const connect = (mode: ConnectMode) =>
        input.ensure(mode).pipe(Effect.map((data): Event => ({ type: "connect.succeeded", attempt, data })))

      return void report(
        command.mode === "reconnect"
          ? connect("reconnect")
          : input.probe.pipe(
              Effect.orElseSucceed(() => undefined),
              Effect.flatMap((data) =>
                data ? Effect.succeed<Event>({ type: "probe.succeeded", attempt, data }) : connect("initial"),
              ),
            ),
        (error) => ({ type: "connect.failed", attempt, error }),
      )
    }

    if (command.type === "verify") {
      const attempt = command.attempt

      return void report(
        input.ensure("initial").pipe(Effect.map((data): Event => ({ type: "verify.succeeded", attempt, data }))),
        (error) => ({ type: "verify.failed", attempt, error }),
      )
    }

    if (command.type === "publish") return input.publish(command.data)

    if (command.type === "resolve") return command.replies.forEach((reply) => reply.resolve(command.data))

    command.replies.forEach((reply) => reply.reject(command.error))
  }

  const request = (type: "connection.requested" | "reconnect.requested") =>
    Effect.callback<Data>((resume) => {
      const reply: Reply = {
        resolve: (data) => resume(Effect.succeed(data)),
        reject: (error) => resume(Effect.die(error)),
      }

      dispatch({ type, reply })

      // A window that closes or aborts its reconnect leaves the attempt, which keeps running for the others.
      return Effect.sync(() => dispatch({ type: "waiter.cancelled", reply }))
    })

  // Loginom AI Agent (B4.10, decision В-87): the service stops with the app, as 0.4's sidecar did. Callers are turned
  // away first, so a window whose event stream the stop breaks does not start the service again. An attempt in flight
  // settles before the stop: `Service.ensure` cannot be cancelled, and it starts a new service once the old one is gone.
  const remove = yield* shutdown.add({
    stop: Effect.sync(() => dispatch({ type: "stop.requested" })).pipe(
      Effect.andThen(FiberSet.awaitEmpty(fibers)),
      Effect.andThen(input.stop),
    ),
    resume: Effect.sync(() => dispatch({ type: "resume.requested" })),
  })

  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      remove()
      dispatch({ type: "disposed" })
    }),
  )
  initial.commands.forEach(perform)

  return {
    connection: request("connection.requested"),
    reconnect: request("reconnect.requested"),
  }
})
