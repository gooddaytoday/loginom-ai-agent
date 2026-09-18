import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { buildNodeHost } from "../../../loginom-host/script/build-node-host"
import { recoveryStore } from "@loginom-ai-agent/loginom-host/connection/recovery-store"

test("standalone exits after failed host cleanup despite retained process handles", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-cli-failed-exit-"))
  try {
    const bundle = join(directory, "bundle")
    await mkdir(join(bundle, "bin"), { recursive: true })
    await mkdir(join(bundle, "host"))
    await symlink(resolve(import.meta.dir, "../../../desktop/resources/loginom/bin/node"), join(bundle, "bin/node"))
    await writeFile(
      join(bundle, "host/node-host.mjs"),
      `process.on("message", m => {
      if (m.method === "start") process.send({ id: m.id, result: { protocol: 1, ready: true, pid: process.pid } });
      if (m.method === "connection.status") process.send({ id: m.id, error: "LOGINOM_HOST_CLOSED" });
      if (m.method === "close") process.exit(1);
    });`,
    )
    const entry = join(directory, "entry.ts")
    await writeFile(
      entry,
      `setInterval(() => {}, 1000);
      process.argv = ["bun", "standalone", "loginom", "status", "--format", "json"];
      await import(${JSON.stringify(resolve(import.meta.dir, "../../src/standalone.ts"))});`,
    )
    const child = Bun.spawn([process.execPath, "run", entry], {
      cwd: resolve(import.meta.dir, "../.."),
      env: {
        ...process.env,
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
        LOGINOM_AI_AGENT_CLI_PROFILE: join(directory, "profile"),
        LOGINOM_AI_AGENT_CLI_BUNDLE: bundle,
      },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
    const output = new Response(child.stdout).text()
    const errors = new Response(child.stderr).text()
    const deadline = { fired: false }
    const timer = setTimeout(() => {
      deadline.fired = true
      child.kill("SIGKILL")
    }, 8_000)
    try {
      expect(await child.exited).toBe(1)
      expect(deadline.fired).toBe(false)
      expect(await errors).toContain("LOGINOM_HOST_CLEANUP_FAILED")
      expect(await output).toContain("LOGINOM_HOST_CLOSED")
      expect(await readdir(join(directory, "profile"))).toContain(".writer")
    } finally {
      clearTimeout(timer)
      child.kill()
      await child.exited
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 12_000)

test("actual standalone status launches bundled Node and releases the isolated profile", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-cli-status-"))
  try {
    const bundle = join(directory, "bundle")
    await mkdir(join(bundle, "bin"), { recursive: true })
    await symlink(resolve(import.meta.dir, "../../../desktop/resources/loginom/bin/node"), join(bundle, "bin/node"))
    await buildNodeHost(join(bundle, "host"))
    const child = Bun.spawn([process.execPath, "run", "./src/standalone.ts", "loginom", "status", "--format", "json"], {
      cwd: resolve(import.meta.dir, "../.."),
      env: {
        ...process.env,
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
        LOGINOM_AI_AGENT_CLI_PROFILE: join(directory, "profile"),
        LOGINOM_AI_AGENT_CLI_BUNDLE: bundle,
        XDG_CONFIG_HOME: join(directory, "desktop-config"),
        XDG_DATA_HOME: join(directory, "desktop-data"),
        XDG_STATE_HOME: join(directory, "desktop-state"),
        XDG_CACHE_HOME: join(directory, "desktop-cache"),
      },
      stdout: "pipe",
      stderr: "pipe",
    })
    const out = new Response(child.stdout).text()
    const errors = new Response(child.stderr).text()
    expect(await child.exited).toBe(0)
    expect(await errors).toBe("")
    expect(JSON.parse(await out)).toMatchObject({ state: "unconfigured", hasApiKey: false, generation: 0 })
    expect(await readdir(directory)).toEqual(["bundle", "profile"])
    expect(await readdir(join(directory, "profile"))).not.toContain(".writer")
    expect(await readdir(join(directory, "profile", "loginom"))).not.toContain("runtime")
    const run = Bun.spawn(
      [
        process.execPath,
        "run",
        "./src/standalone.ts",
        "run",
        "--headless",
        "--format",
        "json",
        "Do not execute without Loginom setup",
      ],
      {
        cwd: resolve(import.meta.dir, "../.."),
        env: {
          ...process.env,
          BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
          LOGINOM_AI_AGENT_CLI_PROFILE: join(directory, "profile"),
          LOGINOM_AI_AGENT_CLI_BUNDLE: bundle,
        },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const output = new Response(run.stdout).text()
    const runErrors = new Response(run.stderr).text()
    expect(await run.exited).toBe(2)
    expect(JSON.parse(await output)).toMatchObject({ type: "error", error: { name: "LOGINOM_CONFIG_REQUIRED" } })
    expect(await runErrors).toBe("LOGINOM_CONFIG_REQUIRED\n")
    expect(await readdir(join(directory, "profile"))).not.toContain(".writer")
    expect(await readdir(join(directory, "profile", "data"))).toEqual([])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 15_000)

test("management commands share durable setup and recovery semantics through the real Node host", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-cli-management-"))
  try {
    const bundle = join(directory, "bundle")
    const profile = join(directory, "profile")
    await mkdir(join(bundle, "bin"), { recursive: true })
    await mkdir(join(bundle, "runtime/src"), { recursive: true })
    await symlink(resolve(import.meta.dir, "../../../desktop/resources/loginom/bin/node"), join(bundle, "bin/node"))
    await buildNodeHost(join(bundle, "host"))
    await writeFile(join(bundle, "resource-manifest.json"), JSON.stringify({ endpoint: "https://example.test" }))
    // Fixture only: handshake/validation succeeds without Chromium, Loginom or a provider.
    await writeFile(
      join(bundle, "runtime/src/managed-entry.mjs"),
      `
      process.on('message', message => {
        if (message.operation === 'start') process.send({ id: message.id, result: {
          protocol: 1, generation: message.input.generation, chat: message.input.chat,
          checked: true, ready: true
        }});
        if (message.operation === 'interrupt') process.send({ id: message.id, result: { interrupted: true } });
        if (message.operation === 'list') process.send({ id: message.id, result: { tools: [{ name: 'probe', description: 'Test the private host path', inputSchema: { type: 'object', properties: { fail: { type: 'boolean' }, operation_id: { type: 'string' } } } }] } });
        if (message.operation === 'call') process.send({ id: message.id, result: { recoveryPending: false, result: { isError: message.input.arguments?.fail === true, content: [{ type: 'text', text: message.input.arguments?.fail ? 'private host probe failed' : 'private host probe completed' }] } } });
        if (message.operation === 'admit') process.send({ id: message.id, result: { files: [] } });
        if (message.operation === 'close') process.send({ id: message.id, result: { closed: true } }, () => process.disconnect());
      });
    `,
    )
    async function command(args: string[], input = "") {
      const child = Bun.spawn(
        [process.execPath, "run", "./src/standalone.ts", "loginom", ...args, "--format", "json"],
        {
          cwd: resolve(import.meta.dir, "../.."),
          env: {
            ...process.env,
            BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
            LOGINOM_AI_AGENT_CLI_PROFILE: profile,
            LOGINOM_AI_AGENT_CLI_BUNDLE: bundle,
          },
          stdin: new Blob([input]),
          stdout: "pipe",
          stderr: "pipe",
        },
      )
      const stdout = new Response(child.stdout).text()
      const stderr = new Response(child.stderr).text()
      const code = await child.exited
      const text = await stdout
      const errors = await stderr
      expect(text + errors).not.toContain("private-setup-key")
      expect(await readdir(profile)).not.toContain(".writer")
      return { code, result: JSON.parse(text), errors }
    }
    expect(await command(["check"])).toMatchObject({ code: 2, result: { code: "LOGINOM_CONFIG_REQUIRED" } })
    expect(await command(["setup"])).toMatchObject({ code: 2, result: { code: "CLI_STDIN_REQUIRED" } })
    expect(await command(["setup", "--stdin-json"], "private-setup-key")).toMatchObject({
      code: 2,
      result: { code: "CLI_SETUP_INVALID" },
    })
    expect(
      await command(
        ["setup", "--stdin-json"],
        JSON.stringify({ apiKey: "private-setup-key", password: "initial-password" }),
      ),
    ).toMatchObject({ code: 0, result: { state: "ready", generation: 1, hasApiKey: true, hasPassword: true } })
    expect(await command(["setup", "--stdin-json"], JSON.stringify({ password: "" }))).toMatchObject({
      code: 0,
      result: { state: "ready", generation: 2, hasApiKey: true, hasPassword: false },
    })
    const persisted = JSON.parse(await readFile(join(profile, "loginom/connection/connection.json"), "utf8"))
    expect(JSON.parse(persisted.secrets.payload)).toEqual({ apiKey: "private-setup-key", password: "" })
    expect(await command(["check"])).toMatchObject({ code: 0, result: { code: "LOGINOM_CONNECTION_VALID" } })
    expect(await command(["cancel-pending"])).toMatchObject({ code: 0, result: { state: "ready" } })
    const journal = await recoveryStore(join(profile, "loginom/recovery"))
    const id = await journal.begin("a".repeat(64), 2)
    await journal.settle(id, false)
    expect(await command(["recover"])).toMatchObject({
      code: 4,
      result: { code: "LOGINOM_RECOVERY_CONFIRMATION_REQUIRED" },
    })
    expect(await command(["recover", "--acknowledge"])).toMatchObject({ code: 0, result: { state: "ready" } })
    expect((await recoveryStore(join(profile, "loginom/recovery"))).pending()).toEqual([])
    const run = Bun.spawn(
      [
        process.execPath,
        "run",
        "./src/standalone.ts",
        "run",
        "--headless",
        "--format",
        "json",
        "--dir",
        directory,
        "--model",
        "__standalone_no_provider__/missing",
        "test",
      ],
      {
        cwd: resolve(import.meta.dir, "../.."),
        env: {
          ...process.env,
          BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
          LOGINOM_AI_AGENT_PURE: "1",
          LOGINOM_AI_AGENT_CLI_PROFILE: profile,
          LOGINOM_AI_AGENT_CLI_BUNDLE: bundle,
        },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const output = new Response(run.stdout).text()
    const errors = new Response(run.stderr).text()
    expect(await run.exited).toBe(1)
    const text = await output
    expect(text + (await errors)).not.toContain("private-setup-key")
    expect(
      text
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toContainEqual(
      expect.objectContaining({
        type: "error",
        error: expect.objectContaining({
          data: expect.objectContaining({ message: "Model not found: __standalone_no_provider__/missing." }),
        }),
      }),
    )
    expect(await readdir(profile)).not.toContain(".writer")
    const { ManagedRuntime } = await import("effect")
    const { TestLLMServer } = await import("../lib/llm-server")
    const { testProviderConfig } = await import("../lib/test-provider")
    const provider = ManagedRuntime.make(TestLLMServer.layer)
    try {
      const llm = await provider.runPromise(TestLLMServer)
      await provider.runPromise(llm.tool("loginom_probe", {}))
      await provider.runPromise(llm.text("standalone provider response"))
      await writeFile(
        join(profile, "config/loginom-ai-agent.json"),
        JSON.stringify({ ...testProviderConfig(llm.url), permission: { "loginom_*": "ask" } }),
      )
      const invoke = (auto: boolean, file?: string) =>
        Bun.spawn(
          [
            process.execPath,
            "run",
            "./src/standalone.ts",
            "run",
            "--headless",
            "--format",
            "json",
            "--dir",
            directory,
            "--model",
            "test/test-model",
            ...(auto ? ["--dangerously-skip-permissions"] : []),
            ...(file ? ["--file", file] : []),
            "--",
            "say hello",
          ],
          {
            cwd: resolve(import.meta.dir, "../.."),
            env: {
              ...process.env,
              BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
              LOGINOM_AI_AGENT_PURE: "1",
              LOGINOM_AI_AGENT_CLI_PROFILE: profile,
              LOGINOM_AI_AGENT_CLI_BUNDLE: bundle,
            },
            stdin: "ignore",
            stdout: "pipe",
            stderr: "pipe",
          },
        )
      const attachment = join(directory, "sales.csv")
      await writeFile(attachment, "amount\n10\n20\n25\n")
      const success = invoke(true, attachment)
      const stdout = new Response(success.stdout).text()
      const stderr = new Response(success.stderr).text()
      expect(await success.exited).toBe(0)
      expect(await stderr).not.toContain("private-setup-key")
      const events = (await stdout)
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      expect(events.map((event) => event.type)).toContain("tool_use")
      expect(events.find((event) => event.type === "tool_use").part).toMatchObject({
        tool: "loginom_probe",
        state: { status: "completed", output: "private host probe completed" },
      })
      expect(events.find((event) => event.type === "text").part.text).toBe("standalone provider response")
      expect(await readdir(profile)).not.toContain(".writer")
      expect(await provider.runPromise(llm.calls)).toBeGreaterThan(0)
      const admissions = await readdir(join(profile, "loginom/inputs"))
      expect(admissions).toHaveLength(1)
      expect(await readFile(join(profile, "loginom/inputs", admissions[0], "0"), "utf8")).toBe("amount\n10\n20\n25\n")
      await provider.runPromise(llm.tool("loginom_probe", {}))
      await provider.runPromise(llm.text("cannot complete without permission"))
      const denied = invoke(false)
      const deniedOutput = new Response(denied.stdout).text()
      const deniedErrors = new Response(denied.stderr).text()
      expect(await denied.exited).toBe(1)
      expect(await deniedErrors).not.toContain("private-setup-key")
      expect(
        (await deniedOutput)
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line)),
      ).toContainEqual(
        expect.objectContaining({
          type: "error",
          error: { name: "CLI_PERMISSION_REJECTED", data: { message: "CLI_PERMISSION_REJECTED" } },
        }),
      )
      expect(await readdir(profile)).not.toContain(".writer")
      await writeFile(
        join(profile, "config/loginom-ai-agent.json"),
        JSON.stringify({ ...testProviderConfig(llm.url), permission: { bash: { "*": "allow", pwd: "deny" } } }),
      )
      await provider.runPromise(llm.reset)
      await provider.runPromise(llm.tool("bash", { command: "pwd", description: "Check denied command" }))
      await provider.runPromise(llm.text("policy denied the action"))
      const policyDenied = invoke(true)
      const policyDeniedOutput = new Response(policyDenied.stdout).text()
      const policyDeniedErrors = new Response(policyDenied.stderr).text()
      expect(await policyDenied.exited).toBe(1)
      const policyDeniedEvents = (await policyDeniedOutput)
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      expect(policyDeniedEvents).toContainEqual(
        expect.objectContaining({
          type: "error",
          error: expect.objectContaining({ name: "CLI_PERMISSION_REJECTED" }),
        }),
      )
      expect(policyDeniedEvents.find((event) => event.type === "tool_use").part.state).toMatchObject({
        status: "error",
        metadata: { permissionDenied: true },
      })
      expect(await policyDeniedErrors).not.toContain("private-setup-key")
      expect(await readdir(profile)).not.toContain(".writer")
      await provider.runPromise(llm.reset)
      await provider.runPromise(llm.tool("loginom_probe", { fail: true }))
      await provider.runPromise(llm.text("tool failure was reported"))
      const toolFailure = invoke(true)
      const failureOutput = new Response(toolFailure.stdout).text()
      const failureErrors = new Response(toolFailure.stderr).text()
      expect(await toolFailure.exited).toBe(1)
      const failureEvents = (await failureOutput)
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      expect(failureEvents.find((event) => event.type === "tool_use").part.state).toMatchObject({
        status: "error",
        error: "private host probe failed",
        metadata: { isError: true },
      })
      expect(failureEvents).toContainEqual(
        expect.objectContaining({ type: "error", error: expect.objectContaining({ name: "CLI_TOOL_FAILED" }) }),
      )
      expect(await failureErrors).not.toContain("private-setup-key")
      expect(await readdir(profile)).not.toContain(".writer")
      await provider.runPromise(llm.reset)
      await provider.runPromise(llm.tool("loginom_probe", { operation_id: "corrected-probe", fail: true }))
      await provider.runPromise(llm.tool("loginom_probe", { operation_id: "corrected-probe", fail: false }))
      await provider.runPromise(llm.text("tool failure was corrected"))
      const corrected = invoke(true)
      const correctedOutput = new Response(corrected.stdout).text()
      const correctedErrors = new Response(corrected.stderr).text()
      expect(await corrected.exited).toBe(0)
      const correctedEvents = (await correctedOutput)
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
      expect(
        correctedEvents.filter((event) => event.type === "tool_use").map((event) => event.part.state.status),
      ).toEqual(["error", "completed"])
      expect(await correctedErrors).not.toContain("private-setup-key")
      expect(await readdir(profile)).not.toContain(".writer")
      for (const unavailable of [false, true]) {
        await provider.runPromise(llm.reset)
        if (unavailable) {
          await writeFile(
            join(profile, "config/loginom-ai-agent.json"),
            JSON.stringify({
              ...testProviderConfig(llm.url),
              permission: { "loginom_*": "deny" },
            }),
          )
          await provider.runPromise(llm.tool("loginom_probe", {}))
        } else {
          await provider.runPromise(llm.tool("loginom_probe", { operation_id: "failed-one", fail: true }))
          await provider.runPromise(llm.tool("loginom_probe", { operation_id: "different-one", fail: false }))
        }
        await provider.runPromise(llm.text("a final answer cannot erase the failure"))
        const unresolved = invoke(true)
        const unresolvedOutput = new Response(unresolved.stdout).text()
        const unresolvedErrors = new Response(unresolved.stderr).text()
        expect(await unresolved.exited).toBe(1)
        const unresolvedEvents = (await unresolvedOutput)
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
        expect(unresolvedEvents).toContainEqual(
          expect.objectContaining({
            type: "error",
            error: expect.objectContaining({ name: "CLI_TOOL_FAILED" }),
          }),
        )
        if (unavailable) expect(unresolvedEvents.find((event) => event.type === "tool_use").part.tool).toBe("invalid")
        expect(await unresolvedErrors).not.toContain("private-setup-key")
        expect(await readdir(profile)).not.toContain(".writer")
      }
      await provider.runPromise(llm.reset)
      const calls = await provider.runPromise(llm.calls)
      await provider.runPromise(llm.hang)
      const cancelled = invoke(true)
      const cancelledOutput = new Response(cancelled.stdout).text()
      const cancelledErrors = new Response(cancelled.stderr).text()
      await provider.runPromise(llm.wait(calls + 1))
      cancelled.kill("SIGINT")
      expect(await cancelled.exited).toBe(130)
      expect(await cancelledErrors).not.toContain("private-setup-key")
      expect(await cancelledOutput).toContain('"name":"CLI_CANCELLED"')
      expect(await readdir(profile)).not.toContain(".writer")
    } finally {
      await provider.dispose()
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 60_000)
