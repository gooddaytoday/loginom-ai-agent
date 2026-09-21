import { expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildCommand } from "./build-command"

test("build command preserves successful and failed exits", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE ?? Bun.which("node")!
  const input = { executable: node, cwd: tmpdir(), env: process.env, timeout: 5_000 }
  await buildCommand({ ...input, args: ["-e", "process.exit(0)"] })
  await expect(buildCommand({ ...input, args: ["-e", "process.exit(7)"] })).rejects.toThrow("BUILD_COMMAND_FAILED: 7")
})

test.skipIf(process.platform === "win32")(
  "build timeout kills its descendant group and leaves unrelated processes alive",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "loginom-build-watchdog-"))
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE ?? Bun.which("node")!
    const unrelated = spawn(node, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })
    try {
      await expect(
        buildCommand({
          executable: node,
          args: [
            "-e",
            `
        const child = require("node:child_process").spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
        require("node:fs").writeFileSync(${JSON.stringify(join(directory, "child.pid"))}, String(child.pid));
        setInterval(() => {}, 1000);
      `,
          ],
          cwd: directory,
          env: process.env,
          timeout: 1_000,
        }),
      ).rejects.toThrow("BUILD_COMMAND_TIMEOUT")
      const pid = Number(await readFile(join(directory, "child.pid"), "utf8"))
      // Allow the OS to reap the descendant after the process group is killed.
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(() => process.kill(pid, 0)).toThrow()
      expect(() => process.kill(unrelated.pid!, 0)).not.toThrow()
    } finally {
      unrelated.kill()
      await rm(directory, { recursive: true, force: true })
    }
  },
  20_000,
)
