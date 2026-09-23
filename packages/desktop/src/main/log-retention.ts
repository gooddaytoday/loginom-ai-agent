import { mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { join, relative, sep } from "node:path"

type Retention = {
  root: string
  run: string
  crashDumps: string
  legacy: string[]
  maxBytes: number
  maxAge: number
  reserve: { log: number; netlog: number }
}

export function logRetention(input: Retention) {
  const marker = join(input.root, "session")
  const prune = () => {
    const cutoff = Date.now() - input.maxAge
    for (const file of files(input.root)) {
      if (kept(input.root, input.run, file)) continue
      const info = safeStat(file)
      if (!info || info.mtimeMs >= cutoff) continue
      remove(unlinkSync, file)
    }
    const blocked = new Set<string>()
    while (usage(input) > input.maxBytes) {
      const oldest = files(input.root)
        .filter((file) => !kept(input.root, input.run, file) && !blocked.has(file))
        .sort((left, right) => (safeStat(left)?.mtimeMs ?? 0) - (safeStat(right)?.mtimeMs ?? 0))[0]
      if (!oldest) break
      if (!remove(unlinkSync, oldest)) blocked.add(oldest)
    }
    for (const directory of directories(input.root)) {
      if (directory === input.run) continue
      remove(rmdirSync, directory)
    }
  }
  return {
    start() {
      const previous = previousRun(marker)
      const dumps = previous ? crashDumps(input.crashDumps, statSync(marker).mtimeMs) : []
      mkdirSync(input.root, { recursive: true })
      writeFileSync(marker, input.run)
      const cutoff = Date.now() - input.maxAge
      for (const file of input.legacy) {
        try {
          if (statSync(file).mtimeMs >= cutoff) continue
        } catch {
          continue
        }
        remove(unlinkSync, file)
      }
      prune()
      if (!previous) return
      return { run: previous, dumps }
    },
    prune,
    end() {
      remove(unlinkSync, marker)
    },
  }
}

function previousRun(marker: string) {
  try {
    const run = readFileSync(marker, "utf8")
    if (run === "") return
    return run
  } catch {
    return
  }
}

function crashDumps(dir: string, since: number) {
  return files(dir).filter((file) => file.endsWith(".dmp") && (safeStat(file)?.mtimeMs ?? 0) > since)
}

function files(root: string) {
  return paths(root).filter((path) => safeStat(path)?.isFile())
}

function directories(root: string) {
  return paths(root)
    .filter((path) => safeStat(path)?.isDirectory())
    .sort((left, right) => depth(root, right) - depth(root, left))
}

function safeStat(path: string) {
  try {
    return statSync(path)
  } catch {
    return
  }
}

function paths(root: string) {
  try {
    return readdirSync(root, { recursive: true }).map((name) => join(root, String(name)))
  } catch {
    return []
  }
}

function usage(input: Retention) {
  const present = files(input.root)
  const bytes = present.reduce((sum, file) => sum + weight(input, file), 0)
  if (present.some((file) => inRun(input.run, file) && file.endsWith(".netlog"))) return bytes
  return bytes + input.reserve.netlog
}

function weight(input: Retention, file: string) {
  const size = safeStat(file)?.size ?? 0
  if (!inRun(input.run, file) || file.endsWith(".old.log")) return size
  if (file.endsWith(".netlog")) return Math.max(size, input.reserve.netlog)
  if (file.endsWith(".log")) return Math.max(size, input.reserve.log)
  return size
}

function kept(root: string, run: string, file: string) {
  if (!relative(root, file).includes(sep)) return true
  if (file.endsWith(".old.log")) return false
  return inRun(run, file)
}

function inRun(run: string, file: string) {
  const fromRun = relative(run, file)
  return fromRun !== ".." && !fromRun.startsWith(`..${sep}`)
}

function depth(root: string, path: string) {
  return relative(root, path).split(sep).length
}

function remove(rm: (path: string) => void, path: string) {
  try {
    rm(path)
    return true
  } catch (error) {
    if (skippable(error)) return false
    throw error
  }
}

function skippable(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return false
  return error.code === "ENOTEMPTY" || error.code === "ENOENT" || error.code === "EBUSY" || error.code === "EPERM" || error.code === "EACCES"
}
