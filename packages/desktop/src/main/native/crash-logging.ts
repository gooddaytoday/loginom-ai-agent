type CrashDetails = { pid: number } | { error: unknown; origin?: NodeJS.UncaughtExceptionOrigin; mode?: string }

export type CrashReport = (message: string, details: CrashDetails) => void

export function monitorMainCrashes(report: CrashReport) {
  const onException = (error: Error, origin: NodeJS.UncaughtExceptionOrigin) =>
    report("unhandled main process error", { origin, error })

  process.on("uncaughtExceptionMonitor", onException)

  return () => process.off("uncaughtExceptionMonitor", onException)
}

// The service is detached and can be adopted from another Desktop process.
export function monitorServiceCrashes(report: CrashReport) {
  let watched: { pid: number; timer: NodeJS.Timeout; check: () => void } | undefined

  const stop = () => {
    if (watched) clearInterval(watched.timer)
    watched = undefined
  }

  return {
    watch(pid: number) {
      if (watched?.pid === pid) return
      watched?.check()
      stop()

      const check = () => {
        try {
          process.kill(pid, 0)
        } catch (error) {
          if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") return
          stop()
          report("background service exited unexpectedly", { pid })
        }
      }

      watched = { pid, timer: setInterval(check, 1000).unref(), check }
      check()
    },
    stop,
  }
}
