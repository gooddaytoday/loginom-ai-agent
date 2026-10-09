import childProcess from "node:child_process"
import { appendFileSync, readFileSync, rmSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { join } from "node:path"

// Installed Playwright creates detached children. Record them before launch can
// time out, so even an unresponsive probe cannot orphan its browser/app group.
export async function withProbe(registry, timeout, execute) {
  const spawn = childProcess.spawn
  childProcess.spawn = function (...args) {
    const child = spawn.apply(this, args)
    if (child.pid) {
      appendFileSync(registry, JSON.stringify({ pid: child.pid, detached: args[2]?.detached === true }) + "\n")
      child.once("exit", () => appendFileSync(registry, JSON.stringify({ exit: child.pid }) + "\n"))
    }
    return child
  }
  let close = async () => {}
  let timer
  try {
    await Promise.race([
      execute((cleanup) => {
        close = cleanup
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error("SMOKE_PROBE_TIMEOUT")), timeout)
      }),
    ])
  } finally {
    clearTimeout(timer)
    let deadline
    try {
      await Promise.race([
        close(),
        new Promise((_, reject) => {
          deadline = setTimeout(() => reject(Error("SMOKE_PROBE_CLOSE_TIMEOUT")), 5_000)
        }),
      ])
    } finally {
      clearTimeout(deadline)
      childProcess.spawn = spawn
    }
  }
}

export function runProbe(executable, code, options, launch = childProcess.spawnSync, kill = process.kill) {
  const registry = join(options.cwd, `probe-${randomUUID()}.jsonl`)
  const result = launch(
    executable,
    [
      "--input-type=module",
      "--eval",
      `
    import { createRequire } from "node:module";
    import { appendFileSync } from "node:fs";
    import { withProbe } from ${JSON.stringify(import.meta.url)};
    appendFileSync(${JSON.stringify(registry)}, JSON.stringify({ owner: process.pid }) + "\\n");
    await withProbe(${JSON.stringify(registry)}, ${options.timeout}, async (ownClose) => {
      ${code}
    });
  `,
    ],
    {
      env: options.env,
      cwd: options.cwd,
      encoding: "utf8",
      timeout: options.timeout + 10_000,
      killSignal: "SIGKILL",
      detached: true,
      maxBuffer: 8 * 1024 * 1024,
    },
  )
  const active = new Map()
  const groups = new Set()
  try {
    for (const line of readFileSync(registry, "utf8").trim().split("\n").filter(Boolean)) {
      const entry = JSON.parse(line)
      if (entry.owner !== undefined) {
        if (!Number.isSafeInteger(entry.owner) || entry.owner <= 1) throw Error("SMOKE_PROBE_REGISTRY_INVALID")
        groups.add(-entry.owner)
      }
      if (entry.exit && !active.get(entry.exit)) active.delete(entry.exit)
      if (entry.pid) active.set(entry.pid, entry.detached)
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
  // The probe's group covers non-detached descendants; Playwright groups are
  // addressed only by PIDs recorded by this probe's spawn wrapper.
  // A launch-result PID is not an ownership record after a timeout. Use the
  // process identity registered by the probe itself before starting any work.
  for (const [pid, detached] of active) {
    if (!Number.isSafeInteger(pid) || pid <= 1) throw Error("SMOKE_PROBE_REGISTRY_INVALID")
    groups.add(detached ? -pid : pid)
  }
  const remaining = () => [...groups].filter((pid) => signal(pid, 0, kill))
  const leaked = remaining().length
  remaining().forEach((pid) => signal(pid, "SIGTERM", kill))
  const until = Date.now() + 1_000
  while (remaining().length && Date.now() < until) childProcess.spawnSync("/bin/sleep", ["0.05"])
  remaining().forEach((pid) => signal(pid, "SIGKILL", kill))
  const killed = Date.now() + 2_000
  while (remaining().length && Date.now() < killed) childProcess.spawnSync("/bin/sleep", ["0.05"])
  if (remaining().length) throw Error("SMOKE_PROBE_CLEANUP_FAILED")
  rmSync(registry, { force: true })
  if (result.error || result.status !== 0) {
    // This harness supplies no credentials. Keep bounded subprocess diagnostics
    // in the invoking terminal/CI log, never in the durable smoke report.
    if (result.stderr) process.stderr.write(result.stderr.slice(-16_384))
    throw Error(`SMOKE_PROBE_FAILED: ${result.error?.code ?? result.signal ?? result.status}`)
  }
  if (leaked) throw Error("SMOKE_PROBE_LEFT_RUNNING_CHILDREN")
  return result.stdout.trim()
}

function signal(pid, value, kill) {
  try {
    kill(pid, value)
    return true
  } catch (error) {
    if (error.code === "ESRCH") return false
    if (error.code === "EPERM" && pid < -1 && value === 0) {
      // A group probe can report EPERM after its last process exits. Confirm that
      // the native process table contains no members before declaring it gone.
      const table = childProcess.spawnSync("/bin/ps", ["-axo", "pid=,pgid=,uid=,stat="], {
        encoding: "utf8",
        timeout: 1000,
        killSignal: "SIGKILL",
      })
      const rows =
        table.stdout
          ?.trim()
          .split("\n")
          .map((line) => line.trim().split(/\s+/)) ?? []
      if (
        !table.error &&
        table.status === 0 &&
        rows.length &&
        rows.every((row) => row.length === 4 && row.slice(0, 3).every((value) => /^\d+$/.test(value)))
      ) {
        const members = rows.filter((row) => Number(row[1]) === -pid)
        if (!members.length) return false
        throw Error(
          `SMOKE_PROBE_SIGNAL_FAILED: pid=${pid} signal=${value} code=${error.code} members=${JSON.stringify(members.slice(0, 16))}`,
          { cause: error },
        )
      }
    }
    throw Error(`SMOKE_PROBE_SIGNAL_FAILED: pid=${pid} signal=${value} code=${error.code}`, { cause: error })
  }
}
