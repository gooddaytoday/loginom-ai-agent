process.on("SIGINT", () => {})
process.on("SIGTERM", () => {})
if (process.env.EVAL_FAKE_BROWSER_CLEAR_TITLE) setTimeout(() => { process.title = "" }, 400)
setInterval(() => {}, 1000)
import { spawn } from "node:child_process"
if (process.env.EVAL_FAKE_BROWSER_HELPER_PID_FILE && !Bun.argv.includes("--type=helper")) {
  if (Bun.argv.includes("--type=parent")) {
    const helper = spawn(process.execPath, ["--type=helper"], { stdio: "ignore", env: process.env,
      detached: process.env.EVAL_FAKE_BROWSER_HELPER_DETACHED === "1" })
    await Bun.write(process.env.EVAL_FAKE_BROWSER_HELPER_PID_FILE, String(helper.pid))
    process.exit(0)
  }
  spawn(process.execPath, ["--type=parent"], { stdio: "ignore", env: process.env })
}
