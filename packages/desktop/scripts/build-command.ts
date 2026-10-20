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
      // A refused signal fails the build now instead of waiting for an exit that may never come.
      try {
        signal(child.pid, "SIGTERM")
      } catch (error) {
        return reject(error)
      }
      kill = setTimeout(() => {
        try {
          signal(child.pid!, "SIGKILL")
        } catch (error) {
          reject(error)
        }
      }, 5_000)
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
      // macOS refuses with EPERM when only zombies remain in the group. Report
      // it rather than throwing out of this handler, which would hang the build.
      if (expired && child.pid) {
        try {
          signal(child.pid, "SIGKILL")
        } catch (error) {
          console.error(`BUILD_COMMAND_GROUP_SIGNAL_FAILED: pgid=${child.pid} ${(error as NodeJS.ErrnoException).code}`)
        }
      }
      if (expired) return reject(Error("BUILD_COMMAND_TIMEOUT"))
      if (code !== 0) return reject(Error(`BUILD_COMMAND_FAILED: ${termination ?? code}`))
      resolve()
    })
  })
}

function signal(group: number, value: NodeJS.Signals) {
  try {
    process.kill(-group, value)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
  }
}
