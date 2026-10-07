import { readFile, readdir } from "node:fs/promises"
import { setTimeout } from "node:timers/promises"

// Follow only this adapter's descendants, retaining PID/start-time identity.
export function observeProcesses({ onObserved } = {}) {
  const observations = new Map()
  let stopped = false
  const monitor = (async () => {
    while (!stopped) {
      const rows = await Promise.all(
        (await readdir("/proc"))
          .filter((pid) => /^\d+$/.test(pid))
          .map(async (pid) => {
            const stat = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "")
            const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ")
            return {
              pid: Number(pid),
              parent: Number(fields[1]),
              start: fields[19],
              state: fields[0],
              command: (await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => "")).replaceAll("\0", " ").trim(),
              at: Date.now(),
            }
          }),
      )
      const owned = new Set([
        process.pid,
        ...rows.filter((row) => observations.has(`${row.pid}:${row.start}`)).map((row) => row.pid),
      ])
      let count = 0
      do {
        count = owned.size
        rows.filter((row) => owned.has(row.parent)).forEach((row) => owned.add(row.pid))
      } while (owned.size !== count)
      rows
        .filter((row) => owned.has(row.pid) && row.pid !== process.pid && row.start)
        .forEach((row) => {
          const key = `${row.pid}:${row.start}`,
            prior = observations.get(key)
          observations.set(key, prior ? { ...prior, command: row.command || prior.command, lastAt: row.at } : row)
          onObserved?.(observations.get(key))
        })
      await setTimeout(25)
    }
  })()
  return {
    async close() {
      await setTimeout(300)
      stopped = true
      await monitor
      const processes = [...observations.values()]
      const remaining = (
        await Promise.all(
          processes.map(async (row) => {
            const stat = await readFile(`/proc/${row.pid}/stat`, "utf8").catch(() => "")
            const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ")
            return fields[19] === row.start && !["Z", "X"].includes(fields[0]) ? row : undefined
          }),
        )
      ).filter(Boolean)
      return { samplingMs: 25, processes, remaining }
    },
  }
}
