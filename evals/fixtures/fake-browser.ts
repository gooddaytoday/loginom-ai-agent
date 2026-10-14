import { writeFile } from "node:fs/promises"

process.on("SIGINT", () => {})
process.on("SIGTERM", () => {})
const heartbeat = process.env.EVAL_FAKE_BROWSER_HEARTBEAT
if (process.argv.includes("--type=helper") && heartbeat)
  setInterval(() => { void writeFile(heartbeat, String(Date.now())) }, 50)
if (process.env.EVAL_FAKE_BROWSER_CLEAR_TITLE) setTimeout(() => { process.title = "" }, 400)
setInterval(() => {}, 1000)
import { spawn } from "node:child_process"
if (process.env.EVAL_FAKE_BROWSER_HELPER_PID_FILE && !process.argv.includes("--type=helper")) {
  if (process.argv.includes("--type=parent")) {
    const helper = spawn(process.execPath, [...(process.env.EVAL_FAKE_BROWSER_SCRIPT ? [process.env.EVAL_FAKE_BROWSER_SCRIPT] : []), "--type=helper"], { stdio: "ignore", env: process.env,
      detached: process.env.EVAL_FAKE_BROWSER_HELPER_DETACHED === "1" })
    await writeFile(process.env.EVAL_FAKE_BROWSER_HELPER_PID_FILE, String(helper.pid))
    process.exit(0)
  }
  spawn(process.execPath, [...(process.env.EVAL_FAKE_BROWSER_SCRIPT ? [process.env.EVAL_FAKE_BROWSER_SCRIPT] : []), "--type=parent"], { stdio: "ignore", env: process.env })
}
