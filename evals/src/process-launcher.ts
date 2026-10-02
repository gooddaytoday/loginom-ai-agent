import path from "node:path"
import { spawn } from "node:child_process"
import { readFile, rename, rm, writeFile } from "node:fs/promises"
import { constants } from "node:os"

// The one-use command capsule is private transport, never diagnostic evidence.
// Unlink it before dispatch; setup credentials remain exclusively on stdin.
const directory = process.argv[2]!
const admitted = JSON.parse(await readFile(path.join(directory, "command.json"), "utf8")) as { cmd: string[]; cwd: string; nonce: string }
await rm(path.join(directory, "command.json"))
let state = { nonce: admitted.nonce, pid: process.pid, ready: false, cli_pid: null as number | null,
  exit_code: null as number | null, error: null as string | null }
let writing = Promise.resolve()
const record = (update: Partial<typeof state>) => {
  state = { ...state, ...update }
  const text = JSON.stringify(state)
  writing = writing.then(async () => {
    await writeFile(path.join(directory, "state.tmp"), text, { mode: 0o600 })
    await rename(path.join(directory, "state.tmp"), path.join(directory, "state.json"))
  })
  return writing
}
const { dlopen } = await import("bun:ffi")
const library = dlopen("libc.so.6", { prctl: { args: ["i32", "u64", "u64", "u64", "u64"], returns: "i32" } })
if (library.symbols.prctl(36, 1, 0, 0, 0) !== 0) {
  await record({ error: "SUBREAPER_UNAVAILABLE", exit_code: 2 })
  process.exit(2)
}
library.close()
await record({ ready: true })
process.on("SIGINT", () => {})
// Keep the kernel ancestry boundary until the supervisor finishes scans.
setInterval(() => {}, 1000)
const child = spawn(admitted.cmd[0]!, admitted.cmd.slice(1), { cwd: admitted.cwd, env: process.env, stdio: "inherit" })
child.once("spawn", () => { void record({ cli_pid: child.pid! }) })
child.once("error", () => { void record({ error: "CLI_LAUNCH_FAILED", exit_code: 2 }).then(() => process.exit(2)) })
child.once("exit", (code, signal) => { void record({ cli_pid: child.pid!, exit_code: code ?? (signal ? 128 + constants.signals[signal] : -1) }) })
