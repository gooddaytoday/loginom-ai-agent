import { onCleanup, untrack } from "solid-js"
import { Predicate } from "effect"
import { INITIAL_FOCUS_LOCK_STATE, transitionFocusLock, type FocusLockEvent } from "./focus-lock-machine"

const FOCUS_LOCK = "opencode:notification-focus"

const DELIVERY_LOCK = "opencode:notification-delivery"

const MAX_DELIVERED = 500

export function createNotificationCoordinator() {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks

  const delivered = new Set<string>()
  const pending = new Map<string, Promise<void>>()

  if (typeof window !== "undefined" && locks) {
    let focusState = INITIAL_FOCUS_LOCK_STATE
    const releases = new Map<number, VoidFunction>()

    const dispatch = (event: FocusLockEvent) => {
      const next = transitionFocusLock(focusState, event)
      focusState = next.state
      next.effects.forEach((effect) => {
        const attempt = effect.attempt

        if (effect.type === "lock.release") {
          releases.get(attempt)?.()
          releases.delete(attempt)

          return
        }

        // A shared hold: every focused window keeps it, and an alert's exclusive request fails while any one does.
        locks
          .request(
            FOCUS_LOCK,
            { mode: "shared" },
            () =>
              new Promise<void>((resolve) => {
                releases.set(attempt, resolve)
                dispatch({ type: "lock.acquired", attempt })
              }),
          )
          .catch(() => {
            releases.delete(attempt)
            dispatch({ type: "lock.failed", attempt })
          })
      })
    }

    const syncFocus = () => dispatch({ type: "focus.changed", focused: document.hasFocus() })

    window.addEventListener("focus", syncFocus)
    window.addEventListener("blur", syncFocus)
    document.addEventListener("visibilitychange", syncFocus)
    syncFocus()
    onCleanup(() => {
      window.removeEventListener("focus", syncFocus)
      window.removeEventListener("blur", syncFocus)
      document.removeEventListener("visibilitychange", syncFocus)
      dispatch({ type: "disposed" })
    })
  }

  const once = <T>(kind: "sound" | "system", eventID: string, run: (markDelivered: VoidFunction) => Promise<T> | void) => {
    const key = `${kind}:${eventID}`
    const storageKey = `opencode:notification-${kind}`

    const execute = async () => {
      if (delivered.has(key)) return

      if (readDelivered(storageKey).includes(key)) {
        delivered.add(key)

        return
      }

      await run(() => {
        delivered.add(key)

        try {
          const events = [...readDelivered(storageKey), key].slice(-MAX_DELIVERED)
          localStorage.setItem(storageKey, JSON.stringify(events))
        } catch {
          // Keep the in-memory record if storage is unavailable.
        }
      })
    }

    if (locks) return locks.request(`opencode:notification:${key}`, execute)

    // Serialize attempts in this renderer even when Web Locks are unavailable.
    const next = (pending.get(key) ?? Promise.resolve()).then(execute, execute)
    pending.set(key, next)

    return next.finally(() => {
      if (pending.get(key) === next) pending.delete(key)
    })
  }

  return {
    tip(show: () => () => void) {
      const lifetime = new AbortController()

      const closed = new Promise<void>((resolve) =>
        lifetime.signal.addEventListener("abort", () => resolve(), { once: true }),
      )

      let hide: VoidFunction | undefined

      const open = () => {
        if (hide || lifetime.signal.aborted || !document.hasFocus() || document.hidden) return
        hide = untrack(show)

        return closed
      }

      const focus = () => {
        if (!locks) return void open()
        void locks
          .request("opencode:tip", { ifAvailable: true }, (lock) => (lock ? open() : undefined))
          .catch(() => undefined)
      }

      // Plain HTTP has no Web Locks. Only its focused window keeps a toast mounted.
      const blur = () => {
        if (locks) return
        hide?.()
        hide = undefined
      }

      window.addEventListener("focus", focus, { signal: lifetime.signal })
      window.addEventListener("blur", blur, { signal: lifetime.signal })
      onCleanup(() => {
        lifetime.abort()
        hide?.()
      })
      focus()
    },
    sound<T>(eventID: string, run: () => Promise<T> | void) {
      return once("sound", eventID, (markDelivered) => {
        markDelivered()

        return run()
      })
    },
    system(eventID: string, run: () => Promise<true | void> | void) {
      return once("system", eventID, async (markDelivered) => {
        if (typeof document !== "undefined" && document.hasFocus()) return

        const send = async () => {
          if ((await run()) === true) markDelivered()
        }

        if (!locks) return send()
        // Another alert holding the focus lock must not look like a focused app window.
        await locks.request(DELIVERY_LOCK, () =>
          locks.request(FOCUS_LOCK, { mode: "exclusive", ifAvailable: true }, (lock) => (lock ? send() : undefined)),
        )
      })
    },
  }
}

function readDelivered(storageKey: string) {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]")

    return Array.isArray(value) ? value.filter(Predicate.isString) : []
  } catch {
    return []
  }
}
