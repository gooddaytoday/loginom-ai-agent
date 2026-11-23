import { expect, test } from "bun:test"
import { ManagedRuntime } from "effect"
import { access, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { TestLLMServer } from "../lib/llm-server"
import { testProviderConfig } from "../lib/test-provider"
import { stageHeldKnowledge } from "../../../loginom-host/test/fixtures/knowledge"
import { connectionStore } from "@loginom-ai-agent/loginom-host/connection/connection-store"
import { cliCredentials } from "@loginom-ai-agent/loginom-host/connection/cli-credentials"
import { recoveryStore } from "@loginom-ai-agent/loginom-host/connection/recovery-store"
import { standaloneFixture, invoke } from "../fixture/standalone"

test.each([false, true])("ordinary standalone chat omits todowrite and releases its profile (auto=%s)", async (auto) => {
  await using fixture = await standaloneFixture(process.env.LOGINOM_AI_AGENT_TEST_CLI_BIN)
  const provider = ManagedRuntime.make(TestLLMServer.layer)
  try {
    const llm = await provider.runPromise(TestLLMServer)
    await provider.runPromise(llm.text("Ответ: 4."))
    await writeFile(join(fixture.profile, "config/loginom-ai-agent.json"), JSON.stringify(testProviderConfig(llm.url)))
    const result = await invoke(
      fixture,
      [...(auto ? ["--dangerously-skip-permissions"] : []), "--", "Сколько будет 2 + 2?"],
      undefined,
      fixture.binary ? { PATH: "/nonexistent" } : undefined,
    )
    expect(result).toMatchObject({ exit: 0 })
    expect(result.events.find((event) => event.type === "text")?.part.text).toBe("Ответ: 4.")
    expect(await provider.runPromise(llm.calls)).toBeGreaterThan(0)
    const requests = (await provider.runPromise(llm.hits)).filter(
      (hit) => Array.isArray(hit.body.tools) && hit.body.tools.length > 0,
    )
    expect(requests.length).toBeGreaterThan(0)
    for (const request of requests) {
      expect(request.body.tools).toContainEqual(
        expect.objectContaining({ function: expect.objectContaining({ name: "skill" }) }),
      )
      expect(request.body.tools).not.toContainEqual(
        expect.objectContaining({ function: expect.objectContaining({ name: "todowrite" }) }),
      )
    }
    expect(result.errors).not.toContain("LOGINOM_CONFIG_REQUIRED")
    expect(await readdir(fixture.profile)).not.toContain(".writer")
    expect(await readdir(join(fixture.profile, "loginom"))).not.toContain("runtime")
    expect(await readdir(join(fixture.profile, "loginom"))).not.toContain("knowledge")
  } finally {
    await provider.dispose()
  }
}, 30_000)

// Native coverage uses the copied compiled resource tree. The source-only browser
// refusal fixture deliberately substitutes managed-entry and stays separate.
test.each(
  process.env.LOGINOM_AI_AGENT_TEST_CLI_BIN
    ? ["unconfigured", "help-unavailable"]
    : ["unconfigured", "help-unavailable", "browser-unavailable"],
)(
  "lazy scenario preparation preserves standalone connection exit: %s",
  async (mode) => {
    await using fixture = await standaloneFixture(process.env.LOGINOM_AI_AGENT_TEST_CLI_BIN)
    const provider = ManagedRuntime.make(TestLLMServer.layer)
    try {
      const marker = join(fixture.directory, "browser-started")
      if (mode !== "unconfigured") {
        if (!fixture.binary) {
          await mkdir(join(fixture.bundle, "runtime/src"), { recursive: true })
          await symlink(
            resolve(import.meta.dir, "../../../loginom-runtime/src/knowledge-entry.mjs"),
            join(fixture.bundle, "runtime/src/knowledge-entry.mjs"),
          )
          await writeFile(
            join(fixture.bundle, "runtime/src/managed-entry.mjs"),
            `
        import {writeFileSync} from 'node:fs';
        process.on('message', message => {
          if (message.operation === 'start') {
            writeFileSync(${JSON.stringify(marker)}, 'started');
            process.send({id: message.id, error: 'LOGINOM_LOGIN_UNAVAILABLE'});
          }
          if (message.operation === 'close') process.send({id: message.id, result: {closed: true}}, () => process.disconnect());
        });
      `,
          )
        }
        if (mode === "help-unavailable") await rm(join(fixture.bundle, "help"), { recursive: true, force: true })
        const store = connectionStore(join(fixture.profile, "loginom/connection"), cliCredentials("linux"))
        await store.stage({
          generation: 1,
          revision: 1,
          apiKey: "UNIT-NONSECRET",
          password: "PRIVATE-NONSECRET",
          username: "user",
          url: "http://127.0.0.1:1/app/",
        })
        await store.activate(1)
      }
      const llm = await provider.runPromise(TestLLMServer)
      await provider.runPromise(
        llm.toolMatch((hit) => JSON.stringify(hit.body.tools ?? []).includes('"name":"skill"'), "skill", {
          name: "loginom-automation",
        }),
      )
      await provider.runPromise(
        llm.toolMatch(
          (hit) => JSON.stringify(hit.body.tools ?? []).includes('"name":"loginom_dock_prepare"'),
          "loginom_dock_prepare",
          {},
        ),
      )
      await provider.runPromise(
        llm.textMatch(
          (hit) => Array.isArray(hit.body.tools) && hit.body.tools.length > 0,
          "Для построения нужно настроить подключение.",
        ),
      )
      await writeFile(
        join(fixture.profile, "config/loginom-ai-agent.json"),
        JSON.stringify(testProviderConfig(llm.url)),
      )
      const result = await invoke(
        fixture,
        ["--dangerously-skip-permissions", "--", "Построй сценарий суммирования."],
        undefined,
        fixture.binary ? { PATH: "/nonexistent" } : undefined,
      )
      expect(
        result.events.find((event) => event.type === "tool_use" && event.part.tool === "loginom_dock_prepare")?.part
          .state,
      ).toMatchObject({
        status: "error",
        error:
          mode === "unconfigured"
            ? "LOGINOM_CONFIG_REQUIRED"
            : mode === "help-unavailable"
              ? "LOGINOM_CONNECTION_NOT_READY"
              : "LOGINOM_LOGIN_UNAVAILABLE",
      })
      expect(result.exit).toBe(mode === "unconfigured" ? 2 : 1)
      expect(result.events.filter((event) => event.type === "error").map((event) => event.error.name)).toContain(
        mode === "unconfigured" ? "LOGINOM_CONFIG_REQUIRED" : "LOGINOM_CONNECTION_NOT_READY",
      )
      expect(await readdir(fixture.profile)).not.toContain(".writer")
      if (mode === "browser-unavailable") expect(await readFile(marker, "utf8")).toBe("started")
      else {
        await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" })
        expect(await readdir(join(fixture.profile, "loginom"))).not.toContain("runtime")
      }
    } finally {
      await provider.dispose()
    }
  },
  30_000,
)

test("a real Help refusal does not turn an ordinary standalone answer into a connection failure", async () => {
  await using fixture = await standaloneFixture(process.env.LOGINOM_AI_AGENT_TEST_CLI_BIN)
  const provider = ManagedRuntime.make(TestLLMServer.layer)
  try {
    if (!fixture.binary) {
      await mkdir(join(fixture.bundle, "runtime/src"), { recursive: true })
      await symlink(
        resolve(import.meta.dir, "../../../loginom-runtime/src/knowledge-entry.mjs"),
        join(fixture.bundle, "runtime/src/knowledge-entry.mjs"),
      )
    }
    const store = connectionStore(join(fixture.profile, "loginom/connection"), cliCredentials("linux"))
    await store.stage({
      generation: 1,
      revision: 1,
      apiKey: "UNIT-NONSECRET",
      password: "PRIVATE-NONSECRET",
      username: "user",
      url: "http://127.0.0.1:1/app/",
    })
    await store.activate(1)
    const llm = await provider.runPromise(TestLLMServer)
    await provider.runPromise(
      llm.toolMatch((hit) => JSON.stringify(hit.body.tools ?? []).includes('"name":"loginom_read"'), "loginom_read", {
        uris: "help://component",
      }),
    )
    await provider.runPromise(
      llm.textMatch((hit) => Array.isArray(hit.body.tools) && hit.body.tools.length > 0, "Ответ: 4."),
    )
    await writeFile(join(fixture.profile, "config/loginom-ai-agent.json"), JSON.stringify(testProviderConfig(llm.url)))
    const result = await invoke(
      fixture,
      ["--dangerously-skip-permissions", "--", "Сколько будет 2 + 2?"],
      undefined,
      fixture.binary ? { PATH: "/nonexistent" } : undefined,
    )
    expect(result.exit).toBe(0)
    expect(result.events.filter((event) => event.type === "error")).toEqual([])
    // Shipped Help refuses a page it does not have; the refusal stays on the Help tool.
    expect(
      result.events.find((event) => event.type === "tool_use" && event.part.tool === "loginom_read")?.part.state,
    ).toMatchObject({
      status: "error",
      input: { uris: "help://component" },
      error: expect.stringContaining("File not found."),
    })
    expect(result.events.find((event) => event.type === "text")?.part.text).toBe("Ответ: 4.")
    expect(await readdir(fixture.profile)).not.toContain(".writer")
    expect(await readdir(join(fixture.profile, "loginom"))).not.toContain("runtime")
  } finally {
    await provider.dispose()
  }
}, 30_000)

// Native coverage runs the compiled knowledge entry, whose catalog cannot be held,
// so only the source path observes the pending catalog and cancels during it.
test.each(
  process.env.LOGINOM_AI_AGENT_TEST_CLI_BIN
    ? ["ready", "unavailable", "ordinary-unavailable"]
    : ["ready", "cancel", "unavailable", "ordinary-unavailable"],
)(
  "standalone Help preflight stays independent of the browser: %s",
  async (mode) => {
    await using fixture = await standaloneFixture(process.env.LOGINOM_AI_AGENT_TEST_CLI_BIN)
    const provider = ManagedRuntime.make(TestLLMServer.layer)
    const state: { result?: ReturnType<typeof invoke> } = {}
    const entry = join(fixture.bundle, "runtime/src/knowledge-entry.mjs")
    const catalog =
      fixture.binary || mode.includes("unavailable")
        ? undefined
        : await stageHeldKnowledge(entry, join(fixture.directory, "catalog-gate"))
    try {
      const marker = join(fixture.directory, "forbidden-browser")
      // The native path retains the compiled knowledge and browser resources.
      // The source-only marker rejects accidental browser dispatch early.
      if (!fixture.binary) {
        await mkdir(join(fixture.bundle, "runtime/src"), { recursive: true })
        if (!catalog) await symlink(resolve(import.meta.dir, "../../../loginom-runtime/src/knowledge-entry.mjs"), entry)
        await writeFile(
          join(fixture.bundle, "runtime/src/managed-entry.mjs"),
          `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'started'); throw Error('Browser forbidden');`,
        )
      }
      // The stored connection stays valid; only the shipped Help decides availability.
      if (mode.includes("unavailable")) await rm(join(fixture.bundle, "help"), { recursive: true, force: true })
      const store = connectionStore(join(fixture.profile, "loginom/connection"), cliCredentials("linux"))
      await store.stage({
        generation: 1,
        revision: 1,
        apiKey: "UNIT-NONSECRET",
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
              void catalog?.entered().then(interrupt)
            }
          : undefined,
        fixture.binary ? { PATH: "/nonexistent" } : undefined,
      )
      void state.result.catch(() => {})
      if (mode === "ordinary-unavailable") {
        expect(await state.result).toMatchObject({ exit: 0 })
        expect(await provider.runPromise(llm.calls)).toBeGreaterThan(0)
      } else if (mode === "unavailable") {
        expect(await state.result).toMatchObject({ exit: 1, errors: "LOGINOM_CONNECTION_NOT_READY\n" })
        expect(await provider.runPromise(llm.calls)).toBe(0)
      } else {
        if (catalog) {
          await Promise.race([
            catalog.entered(),
            state.result.then((result) => {
              throw Error("CLI exited before Help catalog: " + JSON.stringify(result))
            }),
          ])
          expect(await provider.runPromise(llm.calls)).toBe(0)
        }
        if (mode === "ready") {
          await catalog?.release()
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
      expect(await readdir(join(fixture.profile, "loginom"))).not.toContain("runtime")
    } finally {
      await catalog?.release()
      await state.result?.catch(() => {})
      await provider.dispose()
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

test.each(["valid-help", "missing-help"])(
  "standalone management separates Help from browser validation: %s",
  async (mode) => {
    await using fixture = await standaloneFixture()
    const marker = join(fixture.directory, "browser-validation")
    await mkdir(join(fixture.bundle, "runtime/src"), { recursive: true })
    await symlink(
      resolve(import.meta.dir, "../../../loginom-runtime/src/knowledge-entry.mjs"),
      join(fixture.bundle, "runtime/src/knowledge-entry.mjs"),
    )
    await writeFile(
      join(fixture.bundle, "runtime/src/managed-entry.mjs"),
      `
    import { writeFileSync } from 'node:fs';
    process.on('disconnect', () => process.exit(0));
    process.on('message', m => {
      if (m.operation === 'start') {
        writeFileSync(${JSON.stringify(marker)}, JSON.stringify({validation:m.input.validation,pid:process.pid}));
        process.send({id:m.id,error:'LOGINOM_LOGIN_UNAVAILABLE'});
      }
      if (m.operation === 'close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
    });`,
    )
    async function command(args: string[], input?: object) {
      const child = Bun.spawn([process.execPath, "run", "./src/standalone.ts", "loginom", ...args, "--format=json"], {
        cwd: resolve(import.meta.dir, "../.."),
        env: {
          ...process.env,
          BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
          LOGINOM_AI_AGENT_CHANNEL: "dev",
          LOGINOM_AI_AGENT_CLI_PROFILE: fixture.profile,
          LOGINOM_AI_AGENT_CLI_BUNDLE: fixture.bundle,
          LOGINOM_AI_AGENT_SYSTEM_PROXY: "off",
          LOGINOM_AI_AGENT_STRICT_RECOVERY: "0",
          DISPLAY: "",
          WAYLAND_DISPLAY: "",
        },
        stdin: input ? new Blob([JSON.stringify(input)]) : "ignore",
        stdout: "pipe",
        stderr: "pipe",
      })
      const output = new Response(child.stdout).text()
      const errors = new Response(child.stderr).text()
      const timer = setTimeout(() => child.kill("SIGKILL"), 10_000)
      try {
        const exit = await child.exited
        const text = await output
        expect(text).not.toContain("PRIVATE-NONSECRET")
        expect(await readdir(fixture.profile)).not.toContain(".writer")
        return { exit, errors: await errors, result: JSON.parse(text) }
      } finally {
        clearTimeout(timer)
        child.kill()
        await child.exited
      }
    }
    if (mode === "missing-help") await rm(join(fixture.bundle, "help"), { recursive: true, force: true })
    // An older setup script still sends a key; it is ignored.
    const setup = await command(["setup", "--stdin-json"], {
      apiKey: "UNIT-NONSECRET",
      url: "http://127.0.0.1:1/app/",
      username: "user",
      password: "PRIVATE-NONSECRET",
    })
    if (mode === "missing-help") {
      expect(setup).toMatchObject({ exit: 1, result: { ok: false, code: "LOGINOM_KNOWLEDGE_UNAVAILABLE" } })
      await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" })
      expect((await command(["status"])).result).toMatchObject({ state: "unconfigured", generation: 0 })
      return
    }
    expect(setup).toMatchObject({
      exit: 0,
      errors: "",
      result: {
        generation: 1,
        browser: { state: "failed", failure: "LOGINOM_LOGIN_UNAVAILABLE" },
      },
    })
    expect((await command(["status"])).result.browser).toEqual({ state: "unknown" })
    expect(await command(["check"])).toMatchObject({
      exit: 0,
      errors: "",
      result: {
        ok: true,
        help: { state: "ready" },
        browser: { state: "failed", failure: "LOGINOM_LOGIN_UNAVAILABLE" },
      },
    })
    const browser = JSON.parse(await readFile(marker, "utf8"))
    expect(browser.validation).toBe(true)
    if (process.platform === "linux")
      await expect(access(`/proc/${browser.pid}`)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await readdir(join(fixture.profile, "loginom"))).not.toContain("runtime")
  },
  30_000,
)
