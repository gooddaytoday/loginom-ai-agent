import { Flock } from "@opencode/util/flock"
import { join } from "node:path"
import { retainedLogs, SIDECAR_LOG_BYTES } from "./local-logs"

const QUEUE_BYTES = 1024 * 1024

export function retainedServiceLogs(root: string, maxBytes = SIDECAR_LOG_BYTES) {
  const logs = retainedLogs(root, maxBytes, [], "service")
  let pending: { target: string; line: string }[] = []
  let queuedBytes = 0
  let active: Promise<void> | undefined

  const flush = () => {
    return (active ??= drain().finally(() => {
      active = undefined
    }))
  }

  async function drain() {
    try {
      await Flock.withLock(
        "service-logs",
        async () => {
          logs.prune()
          const batch = pending
          pending = []
          queuedBytes = 0
          for (const { target, line } of batch) logs.append(target, line)
        },
        { dir: join(root, ".service-log-retention"), baseDelayMs: 5, maxDelayMs: 100, timeoutMs: 2000 },
      )
    } catch {
      // Drop this batch when the directory or lock is unavailable.
      pending = []
      queuedBytes = 0
    }
    if (pending.length > 0) await drain()
  }

  return {
    append(target: string, line: string) {
      const size = Buffer.byteLength(line) + 1
      if (queuedBytes + size > QUEUE_BYTES) return
      pending.push({ target, line })
      queuedBytes += size
      void flush()
    },
    prune: flush,
    flush: () => active ?? Promise.resolve(),
  }
}
