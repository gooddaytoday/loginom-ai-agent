import fs from "fs"
import os from "os"
import path from "path"

// os.homedir() is read from the environment when the process starts, so code that calls it (not XDG paths) can only be
// redirected by launching `bun test` with a throwaway HOME. The XDG roots come from test/isolated-home.ts.
const home = fs.mkdtempSync(path.join(os.tmpdir(), "loginom-test-user-"))
const child = Bun.spawn({
  cmd: [process.execPath, "test", ...process.argv.slice(2)],
  env: { ...process.env, HOME: home, ...(process.platform === "win32" ? { USERPROFILE: home } : {}) },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})
process.once("SIGINT", () => child.kill("SIGINT"))
process.once("SIGTERM", () => child.kill("SIGTERM"))
const code = await child.exited
fs.rmSync(home, { recursive: true, force: true })
process.exitCode = code
