import { spawn } from "node:child_process"
import { resolve } from "node:path"

const directory = resolve(import.meta.dirname, "../..")
const electron =
  process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE ??
  resolve(
    directory,
    process.platform === "darwin"
      ? "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
      : "node_modules/electron/dist/electron",
  )
const child = spawn(electron, process.env.LOGINOM_AI_AGENT_TEST_EXECUTABLE ? [] : [directory], {
  cwd: directory,
  env: {
    ...process.env,
    LOGINOM_AI_AGENT_TEST_ONBOARDING: "1",
    LOGINOM_AI_AGENT_TEST_ROOT: "relative-profile",
  },
  stdio: ["ignore", "pipe", "pipe"],
})
let output = ""
child.stdout.on("data", (chunk) => {
  output += chunk.toString()
})
child.stderr.on("data", (chunk) => {
  output += chunk.toString()
})
const timer = setTimeout(() => {
  child.kill("SIGKILL")
  console.error("STARTUP_HUNG")
  process.exitCode = 1
}, 15_000)
child.once("exit", (code, signal) => {
  clearTimeout(timer)
  if (signal === "SIGKILL") return
  if (!code) {
    console.error(`STARTUP_EXIT_${code ?? "null"}`)
    process.exitCode = 1
    return
  }
  console.log(JSON.stringify({ status: "PASS", code, logged: output.includes("main process failed") }))
})
