import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"

test.each(["legacy off", "unreachable", "socks-only", "timeout", "failed", "failed update handoff"])(
  "Desktop system proxy: %s",
  async (scenario) => {
    const fixture = fileURLToPath(new URL("../../../test/system-proxy.fixture.ts", import.meta.url))
    const child = Bun.spawn([process.execPath, fixture, scenario], { stdout: "pipe", stderr: "pipe" })

    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])

    expect({ code, output: code ? stdout + stderr : "" }).toEqual({ code: 0, output: "" })
  },
)
