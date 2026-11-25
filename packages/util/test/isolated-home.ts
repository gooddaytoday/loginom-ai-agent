import { afterAll } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"

// Global.Path is computed when @opencode/util/global is first imported, so the home and XDG roots must already point at a
// throwaway directory by the time the first test file loads. A runner that isolated them itself (LOGINOM_AI_AGENT_TEST_HOME)
// is left alone.
if (!process.env.LOGINOM_AI_AGENT_TEST_HOME) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "loginom-test-home-"))
  const temporary = path.join(home, "tmp")
  fs.mkdirSync(temporary)
  Object.assign(process.env, {
    HOME: home,
    LOGINOM_AI_AGENT_TEST_HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    XDG_STATE_HOME: path.join(home, ".local", "state"),
    TMPDIR: temporary,
    ...(process.platform === "win32" ? { USERPROFILE: home, TMP: temporary, TEMP: temporary } : {}),
  })
  afterAll(() => fs.rmSync(home, { recursive: true, force: true }))
}
