import { expect, test } from "bun:test"
import path from "path"
import { Global } from "@opencode/util/global"

test("server tests keep global paths under a throwaway home", () => {
  const home = process.env.LOGINOM_AI_AGENT_TEST_HOME
  expect(home).toBeDefined()
  if (!home) return
  expect(Global.Path.data.startsWith(path.join(home, ".local", "share") + path.sep)).toBe(true)
  expect(Global.Path.config.startsWith(path.join(home, ".config") + path.sep)).toBe(true)
  expect(Global.Path.cache.startsWith(path.join(home, ".cache") + path.sep)).toBe(true)
  expect(Global.Path.state.startsWith(path.join(home, ".local", "state") + path.sep)).toBe(true)
  expect(Global.Path.tmp.startsWith(home + path.sep)).toBe(true)
})
