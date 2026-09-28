import { spawn, spawnSync } from "node:child_process"

// A build child owns this process group. Sample only those PIDs on timeout;
// never inspect environments or command arguments, or target other applications.
export function buildCommand(input: {
  executable: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  timeout: number
}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(input.executable, input.args, {
      cwd: input.cwd,
      env: input.env,
      stdio: "inherit",
      detached: true,
    })
    let expired = false
    let kill: ReturnType<typeof setTimeout> | undefined
    let members: number[] = []
    const timer = setTimeout(() => {
      expired = true
      console.error(`BUILD_COMMAND_TIMEOUT: pid=${child.pid} timeout=${input.timeout}ms`)
      if (!child.pid) return
      const processes =
        spawnSync("/bin/ps", ["-axo", "pid=,ppid=,pgid=,etime=,pcpu=,rss=,comm="], {
          encoding: "utf8",
          timeout: 5_000,
          maxBuffer: 1024 * 1024,
        })
          .stdout?.split("\n")
          .filter((line) => Number(line.trim().split(/\s+/)[2]) === child.pid) ?? []
      members = processes.map((line) => Number(line.trim().split(/\s+/)[0])).filter((pid) => pid > 0)
      console.error(processes.join("\n"))
      if (process.platform === "darwin") {
        for (const line of processes.slice(0, 4)) {
          const pid = Number(line.trim().split(/\s+/)[0])
          const sample = spawnSync("/usr/bin/sample", [String(pid), "1", "1"], {
            encoding: "utf8",
            timeout: 5_000,
            maxBuffer: 2 * 1024 * 1024,
          })
          console.error(
            `BUILD_TIMEOUT_SAMPLE: pid=${pid}\n${sample.stdout?.slice(0, 24_576) ?? sample.error?.message ?? "unavailable"}`,
          )
        }
      }
      signal(child.pid, "SIGTERM", members)
      kill = setTimeout(() => signal(child.pid!, "SIGKILL", members), 5_000)
    }, input.timeout)
    child.once("error", (error) => {
      clearTimeout(timer)
      clearTimeout(kill)
      reject(error)
    })
    child.once("exit", (code, termination) => {
      clearTimeout(timer)
      clearTimeout(kill)
      // The leader can exit before its hung child; finish the owned group.
      if (expired && child.pid) signal(child.pid, "SIGKILL", members)
      if (expired) return reject(Error("BUILD_COMMAND_TIMEOUT"))
      if (code !== 0) return reject(Error(`BUILD_COMMAND_FAILED: ${termination ?? code}`))
      resolve()
    })
  })
}

function signal(group: number, value: NodeJS.Signals, members: number[]) {
  try {
    process.kill(-group, value)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return
    if ((error as NodeJS.ErrnoException).code !== "EPERM" || process.platform !== "darwin") throw error
    // macOS can deny signalling a detached group after its leader exits.
    // Fall back only to PIDs observed in that group at the timeout.
    for (const pid of members) {
      const current = spawnSync("/bin/ps", ["-p", String(pid), "-o", "pgid="], { encoding: "utf8", timeout: 5_000 })
      if (Number(current.stdout?.trim()) !== group) continue
      try {
        process.kill(pid, value)
      } catch (memberError) {
        if ((memberError as NodeJS.ErrnoException).code !== "ESRCH") throw memberError
      }
    }
  }
}
