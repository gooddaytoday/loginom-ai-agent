import { expect, test } from "bun:test"
import { evalsRoot } from "../src/config"

test("standalone help exposes versioned series commands without loading config or dispatching", async () => {
  const result = await Bun.$`${process.execPath} script/run-evalrunner.ts --help`.cwd(evalsRoot).quiet().nothrow()
  expect(result.exitCode).toBe(0)
  for (const command of ["prepare-series", "start-series", "resume-series", "check-series", "compare-series"])
    expect(result.text()).toContain(command)
})
