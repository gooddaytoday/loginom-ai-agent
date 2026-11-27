import type { EnsureReason } from "@opencode/client/service"
import type { ChildProcess } from "node:child_process"
import { lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import { basename, join, relative } from "node:path"

type CrashDetails =
  | { pid: number; exitCode: number | null; signal: NodeJS.Signals | null }
  | { error: unknown; origin?: NodeJS.UncaughtExceptionOrigin; mode?: string }
  | { run: string; dumps: string[] }

export type CrashReport = (message: string, details: CrashDetails) => void

export function monitorMainCrashes(report: CrashReport) {
  const onException = (error: Error, origin: NodeJS.UncaughtExceptionOrigin) =>
    report("unhandled main process error", { origin, error })

  process.on("uncaughtExceptionMonitor", onException)

  return () => process.off("uncaughtExceptionMonitor", onException)
}

export function markCrashSession(root: string, run: string, crashDumps: string, report: CrashReport) {
  const marker = join(root, "session")
  const current = basename(run)
  const temporary = join(root, `${current}.session`)

  try {
    const previous = lstatSync(marker, { throwIfNoEntry: false })

    if (previous?.isFile()) {
      const lastRun = readFileSync(marker, "utf8")

      if (lastRun) report("previous session ended unexpectedly", { run: basename(lastRun), dumps: newDumps(crashDumps, previous.mtimeMs) })
    }
  } catch {
    // A missing or unreadable marker cannot prevent startup.
  }

  try {
    mkdirSync(root, { recursive: true, mode: 0o700 })
    writeFileSync(temporary, current, { flag: "wx", mode: 0o600 })
    renameSync(temporary, marker)
  } catch {
    // A read-only profile may not support tracking crashes.
  }

  return () => {
    try {
      if (lstatSync(marker).isFile() && readFileSync(marker, "utf8") === current) unlinkSync(marker)
    } catch {
      // The marker may already be gone.
    }
  }
}

function newDumps(root: string, since: number): string[] {
  try {
    if (!lstatSync(root).isDirectory()) return []

    return readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.dmp$/i.test(entry.name))
      .flatMap((entry) => {
        const path = join(entry.parentPath, entry.name)
        const info = lstatSync(path, { throwIfNoEntry: false })

        return info?.isFile() && info.mtimeMs > since ? [relative(root, path)] : []
      })
      .sort()
  } catch {
    return []
  }
}

// Services adopted from another Desktop instance can only be checked for liveness.
export function monitorServiceCrashes(report: CrashReport) {
  const spawned = new Map<number, ChildProcess>()
  const earlyExits: { pid: number; code: number | null; signal: NodeJS.Signals | null }[] = []
  let watched: { pid: number; timer?: NodeJS.Timeout } | undefined

  const stop = () => {
    if (watched?.timer) clearInterval(watched.timer)
    watched = undefined
  }

  const exited = (pid: number, exitCode: number | null, signal: NodeJS.Signals | null) => {
    if (watched?.pid !== pid) return
    stop()
    report("background service exited unexpectedly", { pid, exitCode, signal })
  }

  return {
    onSpawn(child: ChildProcess) {
      const pid = child.pid

      if (pid === undefined) return
      spawned.set(pid, child)
      child.once("exit", (code, signal) => {
        spawned.delete(pid)

        if (watched?.pid === pid) exited(pid, code, signal)
        else {
          // A child can exit between the successful probe and reading its registration.
          earlyExits.push({ pid, code, signal })

          if (earlyExits.length > 4) earlyExits.shift()
        }
      })
    },
    onStart(reason: EnsureReason) {
      if (reason === "version-mismatch") stop()
    },
    watch(url: string, registration?: { url?: string; pid?: number }) {
      const pid = registration?.pid

      if (registration?.url !== url || pid === undefined || pid <= 0 || watched?.pid === pid) return
      stop()
      watched = { pid }
      const child = spawned.get(pid)

      if (child) {
        if (child.exitCode !== null || child.signalCode !== null) exited(pid, child.exitCode, child.signalCode)

        return
      }

      const earlyExit = earlyExits.findLast((item) => item.pid === pid)

      if (earlyExit) {
        exited(pid, earlyExit.code, earlyExit.signal)

        return
      }

      const check = () => {
        try {
          process.kill(pid, 0)
        } catch (error) {
          if (!(error instanceof Error) || !("code" in error) || error.code !== "ESRCH") return
          exited(pid, null, null)
        }
      }

      watched.timer = setInterval(check, 1000).unref()
      check()
    },
    stop,
  }
}
