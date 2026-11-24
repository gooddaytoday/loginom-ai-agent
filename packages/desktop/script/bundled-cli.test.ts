import { afterEach, expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Product } from "@loginom-ai-agent/product"
import { copyBuiltCliToResources, getCurrentCli } from "./utils"

// Loginom AI Agent: every channel bundles the CLI built from packages/cli. Without that build, dev and beta used to
// download OpenCode's CLI from npm (`@opencode/cli-*`, found in B4.7c); now each channel fails and names the build.
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const posix = test.skipIf(process.platform === "win32")

posix.each(["dev", "beta", "prod"])(
  "the %s channel without a built CLI fails and downloads nothing",
  async (channel) => {
    const root = await temporary()
    // A `bun` first on PATH records any package install the build would start.
    await Bun.write(
      path.join(root, "bin", "bun"),
      `#!/bin/sh\necho "$@" >> "${path.join(root, "bun-calls")}"\nexit 1\n`,
    )
    await chmod(path.join(root, "bin", "bun"), 0o755)
    const dest = path.join(root, "resources", Product.cliExecutable)

    const child = Bun.spawn(
      [
        process.execPath,
        "--eval",
        `const { copyBuiltCliToResources } = await import(${JSON.stringify(path.join(import.meta.dir, "utils.ts"))})
await copyBuiltCliToResources(${JSON.stringify(path.join(root, "dist"))}, ${JSON.stringify(dest)})`,
      ],
      {
        cwd: path.join(import.meta.dir, ".."),
        env: {
          ...process.env,
          LOGINOM_AI_AGENT_CHANNEL: channel,
          PATH: `${path.join(root, "bin")}:${process.env.PATH}`,
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    )

    const [stderr, code] = await Promise.all([new Response(child.stderr).text(), child.exited])
    const directory = getCurrentCli().package.replace("@opencode/", "")
    expect(await Bun.file(path.join(root, "bun-calls")).exists()).toBe(false)
    expect(code).not.toBe(0)
    expect(stderr).toContain(
      `Desktop bundles the CLI built from packages/cli, and ${path.join(root, "dist", directory)}`,
    )
    expect(stderr).toContain(
      `LOGINOM_AI_AGENT_TARGET=${directory.replace("cli-", "")} bun run --cwd packages/cli build`,
    )
    expect(await readdir(root)).not.toContain("resources")
  },
)

test.skipIf(process.platform !== "linux")("a built CLI is bundled with its version", async () => {
  const root = await temporary()
  const built = path.join(root, "dist", getCurrentCli().package.replace("@opencode/", ""))
  await Bun.write(path.join(built, "bin", "opencode"), "cli")
  await Bun.write(path.join(built, "package.json"), JSON.stringify({ version: "1.2.3-dev" }))
  await mkdir(path.join(root, "resources"))
  const dest = path.join(root, "resources", Product.cliExecutable)
  await copyBuiltCliToResources(path.join(root, "dist"), dest)
  expect(await Bun.file(dest).text()).toBe("cli")
  expect(await Bun.file(`${dest}.version`).text()).toBe("1.2.3-dev")
})

async function temporary() {
  const root = await mkdtemp(path.join(os.tmpdir(), "desktop-bundled-cli-"))
  roots.push(root)

  return root
}
