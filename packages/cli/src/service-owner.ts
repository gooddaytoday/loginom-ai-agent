export * as ServiceOwner from "./service-owner"

import { readFile } from "node:fs/promises"
import { Duration, Effect } from "effect"

/** Loginom AI Agent (B4.16, В-97 п. 3): how long a service whose window is gone waits for a window to return. */
export const GRACE = Duration.seconds(60)
const POLL = Duration.seconds(2)

/**
 * A service that Desktop started follows its window. `LOGINOM_AI_AGENT_SERVICE_OWNER` names a file with the pid of the
 * window that owns the service; each window that adopts the service rewrites it. A window that is gone for `GRACE` (the
 * crash of the window, `kill -9`) opens `stop`, the latch of the soft stop, so plugins and Loginom runtimes close as
 * after a stop request. Without the variable (a CLI service, a service of another product) nothing is watched.
 */
export const watch = Effect.fnUntraced(function* (
  stop: Effect.Effect<void>,
  options: { readonly file?: string; readonly grace?: Duration.Input; readonly poll?: Duration.Input } = {},
) {
  const file = options.file ?? process.env.LOGINOM_AI_AGENT_SERVICE_OWNER
  // Tools the service starts must not inherit the owner of this service.
  delete process.env.LOGINOM_AI_AGENT_SERVICE_OWNER
  if (!file) return
  const grace = Duration.toMillis(Duration.fromInputUnsafe(options.grace ?? GRACE))
  const poll = options.poll ?? POLL

  // `onListen` runs uninterruptible and a fork inherits that: the watch must still end with the scope.
  yield* Effect.forkScoped(
    Effect.gen(function* () {
      let absent: number | undefined
      while (true) {
        yield* Effect.sleep(poll)
        const pid = yield* Effect.promise(() => owner(file))
        // A file that cannot be read right now says nothing about the window.
        if (pid === undefined) continue
        if (alive(pid)) {
          absent = undefined
          continue
        }
        absent ??= Date.now()
        if (Date.now() - absent < grace) continue
        yield* Effect.logWarning("window of the service is gone, stopping", { pid })
        return yield* stop
      }
    }).pipe(Effect.interruptible),
  )
})

// 0 for a file that is missing: no window claims the service.
async function owner(file: string) {
  const text = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) =>
    error.code === "ENOENT" ? "0" : undefined,
  )
  const pid = Number(text?.trim() || Number.NaN)

  return Number.isInteger(pid) ? pid : undefined
}

function alive(pid: number) {
  if (pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // The process exists, but belongs to another user.
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}
