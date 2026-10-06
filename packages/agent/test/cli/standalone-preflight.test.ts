import { expect, test } from "bun:test"
import { ManagedRuntime } from "effect"
import { access, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { TestLLMServer } from "../lib/llm-server"
import { testProviderConfig } from "../lib/test-provider"
import { copyProductSkillsFixture } from "../../../loginom-host/test/fixtures/product-skills"
import { resourceInventory } from "../../../loginom-runtime/src/resource-inventory.mjs"
import { knowledgeServer } from "../../../loginom-runtime/client/test/support/knowledge-server.mjs"
import { connectionStore } from "@loginom-ai-agent/loginom-host/connection/connection-store"
import { cliCredentials } from "@loginom-ai-agent/loginom-host/connection/cli-credentials"
import { recoveryStore } from "@loginom-ai-agent/loginom-host/connection/recovery-store"
import { acquireProfile } from "../../src/cli/profile"

test("ordinary standalone chat reaches the provider without configured Loginom and releases its profile", async () => {
  await using fixture = await standaloneFixture()
  const provider = ManagedRuntime.make(TestLLMServer.layer)
  try {
    const llm = await provider.runPromise(TestLLMServer)
    await provider.runPromise(llm.text("Ответ: 4."))
    await writeFile(join(fixture.profile, "config/loginom-ai-agent.json"), JSON.stringify(testProviderConfig(llm.url)))
    const result = await invoke(fixture, ["--", "Сколько будет 2 + 2?"])
    expect(result).toMatchObject({ exit: 0 })
    expect(result.events.find((event) => event.type === "text")?.part.text).toBe("Ответ: 4.")
    expect(await provider.runPromise(llm.calls)).toBeGreaterThan(0)
    expect(result.errors).not.toContain("LOGINOM_CONFIG_REQUIRED")
    expect(await readdir(fixture.profile)).not.toContain(".writer")
    expect(await readdir(join(fixture.profile, "loginom"))).not.toContain("runtime")
    expect(await readdir(join(fixture.profile, "loginom"))).not.toContain("knowledge")
  } finally {
    await provider.dispose()
  }
}, 30_000)

test.each(["ready", "cancel", "unavailable", "ordinary-unavailable"])(
  "standalone Help preflight stays independent of the browser: %s",
  async (mode) => {
    await using fixture = await standaloneFixture()
    const provider = ManagedRuntime.make(TestLLMServer.layer)
    const cleanup: (() => void | Promise<void>)[] = []
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const state: { result?: ReturnType<typeof invoke> } = {}
    const server = await knowledgeServer(
      { after: (callback) => cleanup.push(callback) },
      {
        list: async () => {
          entered.resolve()
          await release.promise
          return { tools: server.tools }
        },
      },
    )
    try {
      // Source-process acceptance of the actual entry/client over HTTP MCP;
      // installed completeness and natural skill selection have separate gates.
      await mkdir(join(fixture.bundle, "runtime/src"), { recursive: true })
      await symlink(
        resolve(import.meta.dir, "../../../loginom-runtime/src/knowledge-entry.mjs"),
        join(fixture.bundle, "runtime/src/knowledge-entry.mjs"),
      )
      const marker = join(fixture.directory, "forbidden-browser")
      await writeFile(
        join(fixture.bundle, "runtime/src/managed-entry.mjs"),
        `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'started'); throw Error('Browser forbidden');`,
      )
      const manifest = JSON.parse(await readFile(join(fixture.bundle, "resource-manifest.json"), "utf8"))
      await writeFile(
        join(fixture.bundle, "resource-manifest.json"),
        JSON.stringify({ ...manifest, endpoint: server.endpoint }),
      )
      const store = connectionStore(join(fixture.profile, "loginom/connection"), cliCredentials("linux"))
      await store.stage({
        generation: 1,
        revision: 1,
        apiKey: mode.includes("unavailable") ? "REJECTED-NONSECRET" : "UNIT-NONSECRET",
        password: "PRIVATE-NONSECRET",
        username: "user",
        url: "http://127.0.0.1:1/app/",
      })
      await store.activate(1)
      const llm = await provider.runPromise(TestLLMServer)
      await provider.runPromise(llm.text("Справка готова."))
      await writeFile(
        join(fixture.profile, "config/loginom-ai-agent.json"),
        JSON.stringify(testProviderConfig(llm.url)),
      )
      state.result = invoke(
        fixture,
        mode === "ordinary-unavailable"
          ? ["--", "Сколько будет 2 + 2?"]
          : ["--command=loginom-automation", "--", "Построй сценарий."],
        mode === "cancel"
          ? (interrupt) => {
              void entered.promise.then(interrupt)
            }
          : undefined,
      )
      void state.result.catch(() => {})
      if (mode === "ordinary-unavailable") {
        expect(await state.result).toMatchObject({ exit: 0 })
        expect(await provider.runPromise(llm.calls)).toBeGreaterThan(0)
      } else if (mode === "unavailable") {
        expect(await state.result).toMatchObject({ exit: 1, errors: "LOGINOM_CONNECTION_NOT_READY\n" })
        expect(await provider.runPromise(llm.calls)).toBe(0)
      } else {
        await Promise.race([
          entered.promise,
          state.result.then((result) => {
            throw Error("CLI exited before Help catalog: " + JSON.stringify(result))
          }),
        ])
        expect(await provider.runPromise(llm.calls)).toBe(0)
        if (mode === "ready") {
          release.resolve()
          expect(await state.result).toMatchObject({ exit: 0 })
          expect(await provider.runPromise(llm.calls)).toBeGreaterThan(0)
        }
        if (mode === "cancel") {
          expect(await state.result).toMatchObject({ exit: 130, errors: "CLI_CANCELLED\n" })
          expect(await provider.runPromise(llm.calls)).toBe(0)
        }
      }
      await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" })
      expect(await readdir(fixture.profile)).not.toContain(".writer")
    } finally {
      release.resolve()
      await state.result?.catch(() => {})
      await provider.dispose()
      for (const callback of cleanup) await callback()
    }
  },
  30_000,
)

test("strict recovery still blocks an ordinary request before the model and preserves its record", async () => {
  await using fixture = await standaloneFixture()
  const provider = ManagedRuntime.make(TestLLMServer.layer)
  try {
    const llm = await provider.runPromise(TestLLMServer)
    await writeFile(join(fixture.profile, "config/loginom-ai-agent.json"), JSON.stringify(testProviderConfig(llm.url)))
    const journal = await recoveryStore(join(fixture.profile, "loginom/recovery"), { strict: true })
    const id = await journal.begin("a".repeat(64), 1)
    await journal.settle(id, false)
    const result = await invoke(fixture, ["--", "Обычный вопрос"], undefined, { LOGINOM_AI_AGENT_STRICT_RECOVERY: "1" })
    expect(result).toMatchObject({ exit: 4, errors: "LOGINOM_RECOVERY_REQUIRED\n" })
    expect(await provider.runPromise(llm.calls)).toBe(0)
    expect((await recoveryStore(join(fixture.profile, "loginom/recovery"), { strict: true })).pending()).toEqual([id])
    expect(await readdir(fixture.profile)).not.toContain(".writer")
  } finally {
    await provider.dispose()
  }
}, 30_000)

async function standaloneFixture() {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await realpath(await mkdtemp(join(tmpdir(), "standalone-lazy-preflight-")))
  const bundle = join(directory, "bundle")
  const profile = join(directory, "profile")
  try {
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
    const initialized = await acquireProfile(profile, "dev")
    await initialized.release()
    return {
      directory,
      bundle,
      profile,
      async [Symbol.asyncDispose]() {
        await rm(directory, { recursive: true, force: true })
      },
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

async function invoke(
  fixture: Awaited<ReturnType<typeof standaloneFixture>>,
  args: string[],
  onStart?: (interrupt: () => void) => void,
  environment?: NodeJS.ProcessEnv,
) {
  const child = Bun.spawn(
    [
      process.execPath,
      "run",
      "./src/standalone.ts",
      "run",
      "--format=json",
      "--dir",
      fixture.directory,
      "--model",
      "test/test-model",
      ...args,
    ],
    {
      cwd: resolve(import.meta.dir, "../.."),
      env: {
        ...process.env,
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
        LOGINOM_AI_AGENT_PURE: "1",
        LOGINOM_AI_AGENT_CHANNEL: "dev",
        LOGINOM_AI_AGENT_CLI_PROFILE: fixture.profile,
        LOGINOM_AI_AGENT_CLI_BUNDLE: fixture.bundle,
        LOGINOM_AI_AGENT_SYSTEM_PROXY: "off",
        LOGINOM_AI_AGENT_STRICT_RECOVERY: "0",
        DISPLAY: "",
        WAYLAND_DISPLAY: "",
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
