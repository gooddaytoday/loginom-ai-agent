import { expect } from "bun:test"
import { constants } from "node:fs"
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { copyProductSkillsFixture } from "../../../loginom-host/test/fixtures/product-skills"
import { resourceInventory } from "../../../loginom-runtime/src/resource-inventory.mjs"
import { acquireProfile } from "../../src/cli/profile"

export async function standaloneFixture(binary?: string) {
  if (binary && !isAbsolute(binary)) throw Error("Native test binary must have an absolute path")
  const directory = await realpath(await mkdtemp(join(tmpdir(), "standalone-lazy-preflight-")))
  const bundle = join(directory, "bundle")
  const profile = join(directory, "profile")
  try {
    if (binary) {
      await cp(resolve(dirname(binary), "../resources/loginom"), bundle, {
        recursive: true,
        mode: constants.COPYFILE_FICLONE,
      })
    }
    if (!binary) {
      const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
      if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
      await mkdir(join(bundle, "bin"), { recursive: true })
      await cp(node, join(bundle, "bin/node"))
      const builder = Bun.spawn(
        [
          process.execPath,
          "run",
          resolve(import.meta.dir, "../../../loginom-host/script/build-node-host.ts"),
          join(bundle, "host"),
        ],
        { stdout: "pipe", stderr: "pipe" },
      )
      const [buildOutput, buildError, buildExit] = await Promise.all([
        new Response(builder.stdout).text(),
        new Response(builder.stderr).text(),
        builder.exited,
      ])
      expect({ buildExit, buildError, buildOutput }).toEqual({ buildExit: 0, buildError: "", buildOutput: "" })
      await copyProductSkillsFixture(bundle)
      await writeFile(
        join(bundle, "resource-manifest.json"),
        JSON.stringify({
          protocol: 1,
          node: "bin/node",
          endpoint: "http://127.0.0.1:1/mcp",
          files: await resourceInventory(bundle),
        }),
      )
    }
    const channel = binary
      ? JSON.parse(await readFile(resolve(dirname(binary), "../cli-manifest.json"), "utf8")).metadata.channel
      : "dev"
    await mkdir(join(directory, "home"))
    const initialized = await acquireProfile(profile, channel)
    await initialized.release()
    return {
      directory,
      bundle,
      profile,
      binary,
      channel,
      async [Symbol.asyncDispose]() {
        await rm(directory, { recursive: true, force: true })
      },
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

export async function invoke(
  fixture: Awaited<ReturnType<typeof standaloneFixture>>,
  args: string[],
  onStart?: (interrupt: () => void) => void,
  environment?: NodeJS.ProcessEnv,
) {
  const child = Bun.spawn(
    [
      ...(fixture.binary ? [fixture.binary] : [process.execPath, "run", "./src/standalone.ts"]),
      "run",
      "--format=json",
      "--dir",
      fixture.directory,
      "--model",
      "test/test-model",
      ...args,
    ],
    {
      cwd: fixture.binary ? fixture.directory : resolve(import.meta.dir, "../.."),
      env: {
        ...process.env,
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
        LOGINOM_AI_AGENT_PURE: "1",
        LOGINOM_AI_AGENT_CHANNEL: fixture.channel,
        LOGINOM_AI_AGENT_CLI_PROFILE: fixture.profile,
        LOGINOM_AI_AGENT_CLI_BUNDLE: fixture.bundle,
        LOGINOM_AI_AGENT_SYSTEM_PROXY: "off",
        LOGINOM_AI_AGENT_STRICT_RECOVERY: "0",
        DISPLAY: "",
        WAYLAND_DISPLAY: "",
        HOME: join(fixture.directory, "home"),
        XDG_CONFIG_HOME: join(fixture.directory, "desktop-config"),
        XDG_DATA_HOME: join(fixture.directory, "desktop-data"),
        XDG_STATE_HOME: join(fixture.directory, "desktop-state"),
        XDG_CACHE_HOME: join(fixture.directory, "desktop-cache"),
        ...environment,
      },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const output = new Response(child.stdout).text()
  const errors = new Response(child.stderr).text()
  const timer = setTimeout(() => child.kill("SIGKILL"), 20_000)
  try {
    onStart?.(() => {
      child.kill("SIGINT")
    })
    return {
      exit: await child.exited,
      errors: await errors,
      events: (await output)
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    }
  } finally {
    clearTimeout(timer)
    child.kill()
    await child.exited
  }
}
