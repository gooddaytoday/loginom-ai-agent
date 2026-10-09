import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { runProbe } from "./macos-smoke-probe.mjs"

test.skipIf(process.platform === "win32")(
  "probe cleanup ignores an invalid launch-result PID",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "loginom-probe-identity-"))
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE ?? Bun.which("node")
    if (!node) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
    const companion = Bun.spawn([node, "-e", "process.stdout.write('ready'); setInterval(() => {}, 1000)"], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
    })
    try {
      const reader = companion.stdout.getReader()
      expect(new TextDecoder().decode((await reader.read()).value)).toBe("ready")
      reader.releaseLock()
      expect(
        runProbe(
          node,
          "console.log('probe complete')",
          { env: {}, cwd: root, timeout: 1000 },
          (executable, args, options) => ({ ...spawnSync(executable, args, options), pid: -companion.pid }),
        ),
      ).toBe("probe complete")
      expect(() => process.kill(companion.pid, 0)).not.toThrow()
    } finally {
      companion.kill()
      await companion.exited
      await rm(root, { recursive: true, force: true })
    }
  },
  10_000,
)

for (const blocked of [false, true]) {
  test.skipIf(process.platform === "win32")(
    `probe timeout cleans detached child when event loop is ${blocked ? "blocked" : "responsive"}`,
    async () => {
      const root = await mkdtemp(join(tmpdir(), "loginom-probe-test-"))
      const node = process.env.LOGINOM_AI_AGENT_TEST_NODE ?? Bun.which("node")
      if (!node) throw Error("LOGINOM_AI_AGENT_TEST_NODE_REQUIRED")
      try {
        expect(() =>
          runProbe(
            node,
            `
        const require = createRequire(import.meta.url);
        const { spawn } = require("node:child_process");
        const { writeFileSync } = require("node:fs");
        const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
          detached: true, stdio: "ignore",
        });
        writeFileSync(${JSON.stringify(join(root, "child.pid"))}, String(child.pid));
        ownClose(() => new Promise(resolve => {
          child.once("exit", () => resolve());
          child.kill("SIGTERM");
        }));
        ${blocked ? "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000);" : "await new Promise(() => {});"}
      `,
            { env: { PATH: "/usr/bin:/bin" }, cwd: root, timeout: 100 },
          ),
        ).toThrow("SMOKE_PROBE_FAILED")
        const pid = Number(await readFile(join(root, "child.pid"), "utf8"))
        expect(() => process.kill(pid, 0)).toThrow()
        expect(() => process.kill(-pid, 0)).toThrow()
      } finally {
        await rm(root, { recursive: true, force: true })
      }
    },
    20_000,
  )
}
