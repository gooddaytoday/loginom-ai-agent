import { expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { readFile, readlink, stat } from "node:fs/promises"
import { signalProcess, type ProcessIdentity } from "../src/process-supervisor"

test("signalProcess: PID с другим starttime не получает сигнал", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" })
  const exited = new Promise((resolve) => child.once("exit", resolve))
  try {
    const pid = child.pid!
    const fields = (await readFile(`/proc/${pid}/stat`, "utf8")).split(") ")[1]!.split(" ")
    const info = await stat(`/proc/${pid}/exe`)
    const identity: ProcessIdentity = { pid, starttime: "different-birth", uid: process.getuid!(), parent: Number(fields[1]),
      group: Number(fields[2]), session: Number(fields[3]), device: info.dev, inode: info.ino, executable: await readlink(`/proc/${pid}/exe`) }
    await expect(signalProcess(identity, "SIGKILL")).rejects.toThrow("identity changed")
    expect(child.exitCode).toBeNull()
    process.kill(pid, 0)
  } finally { child.kill("SIGKILL"); await exited }
})
