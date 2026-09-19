import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { observeBrowserWindows } from "./window-observer"

if (process.platform !== "win32") throw Error("WINDOWS_ONLY_TEST")
const browser = process.env.LOGINOM_AI_AGENT_TEST_BROWSER
if (!browser) throw Error("BROWSER_REQUIRED")
const directory = await mkdtemp(join(tmpdir(), "loginom-window-observer-"))
const child = Bun.spawn(
  [resolve(browser), `--user-data-dir=${directory}`, "--no-first-run", "--no-default-browser-check", "about:blank"],
  { stdin: "ignore", stdout: "ignore", stderr: "ignore" },
)
const stop = observeBrowserWindows(directory)
try {
  await Bun.sleep(3000)
  const killed = Bun.spawnSync(["taskkill.exe", "/T", "/F", "/PID", String(child.pid)])
  if (killed.exitCode !== 0) throw Error("BROWSER_TREE_KILL_FAILED")
  await child.exited
  const result = await stop()
  if (result.browserProcesses < 1 || result.visible.length < 1 || result.remaining.length !== 0)
    throw Error("WINDOW_OBSERVER_ACCEPTANCE_FAILED")
  console.log(JSON.stringify({ status: "PASS", ...result }))
} finally {
  if (child.exitCode === null) Bun.spawnSync(["taskkill.exe", "/T", "/F", "/PID", String(child.pid)])
  await stop().catch(() => undefined)
  await rm(directory, { recursive: true, force: true })
}
