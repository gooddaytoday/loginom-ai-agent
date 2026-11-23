import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { cliCredentials } from "@loginom-ai-agent/loginom-host/connection/cli-credentials"
import { recoveryStore } from "@loginom-ai-agent/loginom-host/connection/recovery-store"
import { writeHelp } from "../../loginom-runtime/client/test/support/help-fixture.mjs"
import { resourceInventory } from "../../loginom-runtime/src/resource-inventory.mjs"
import { LoginomManagement } from "../src/loginom-management"
import { isolatedEnv } from "./fixture/environment"

// Loginom AI Agent (B2.7b): `loginom setup/status/check/cancel-pending/recover` of the product CLI, the cases of 0.4
// `test/cli/{loginom-management,standalone-status,standalone-preflight,standalone-startup}.test.ts`
// (`a080f7725c:packages/opencode`) and the callers of this stage: `scripts/node-acceptance/run-check.py` and `evals`.
// Each command runs the product CLI entry from source with the real Node host (`LOGINOM_AI_AGENT_TEST_NODE`) and fixture
// resources: Help and the browser are stubs, so a fictional Loginom stand answers without Chromium or a network. The
// cases left behind, and why, are in the migration log (B2.7b).
const cli = path.join(import.meta.dir, "..")
const roots: string[] = []
// The Host entry `loginom-host/script/build-node-host.ts` builds once, copied into each fixture.
const built = { host: "" }
// Fictional values: no stand has them.
const login = {
  url: "https://loginom.example.test/app/",
  username: "fixture-user",
  password: "fixture-setup-password-b27b",
}

afterAll(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })))
})

test("stdin setup distinguishes missing secrets, explicit empty password and replacements", () => {
  const current = {
    revision: 4,
    generation: 2,
    url: "http://example.test/app/",
    username: "user",
    folder: "/user",
    hasPassword: true,
    state: "ready" as const,
  }
  expect(LoginomManagement.setupCandidate("{}", current)).toEqual({
    revision: 4,
    url: "http://example.test/app/",
    username: "user",
    password: { operation: "preserve" },
  })
  expect(LoginomManagement.setupCandidate('{"password":""}', current).password).toEqual({ operation: "empty" })
  expect(LoginomManagement.setupCandidate('{"password":"new-password"}', current).password).toEqual({
    operation: "replace",
    value: "new-password",
  })
  // Older setup scripts may still send a key; the built-in knowledge key replaced it.
  for (const json of ['{"apiKey":"old-key"}', '{"apiKey":""}'])
    expect(LoginomManagement.setupCandidate(json, current)).not.toHaveProperty("apiKey")
  expect(() => LoginomManagement.setupCandidate('{"password":null}', current)).toThrow("CLI_SETUP_INVALID")
  expect(() => LoginomManagement.setupCandidate('{"folder":"/not-a-setup-field"}', current)).toThrow(
    "CLI_SETUP_INVALID",
  )
  expect(() => LoginomManagement.setupCandidate("secret-broken-json", current)).toThrow("CLI_SETUP_INVALID")
})

test("setup finishes resource verification before minting its validation token", async () => {
  const current = {
    revision: 4,
    generation: 2,
    url: "http://example.test/app/",
    username: "user",
    folder: "/user",
    hasPassword: true,
    state: "ready",
  }
  // A child process, so setup reads its own stdin.
  const child = Bun.spawn(
    [
      process.execPath,
      "--eval",
      `
    import { LoginomManagement } from ${JSON.stringify(path.join(cli, "src/loginom-management.ts"))};
    const calls = [];
    const current = ${JSON.stringify(current)};
    const host = { async request(method) {
      calls.push(method);
      if (method === "connection.status" || method === "connection.save") return current;
      if (method === "connection.verify-resources") return { verified: true };
      if (method === "connection.check") return { validationId: "fresh", expiresAt: Date.now() + 300000 };
      throw Error("UNEXPECTED_METHOD");
    } };
    await LoginomManagement.loginomManagement(host, "setup", { stdinJSON: true, acknowledge: false });
    process.stdout.write(JSON.stringify(calls));
  `,
    ],
    { cwd: cli, stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  )
  child.stdin.write('{"password":""}')
  child.stdin.end()
  const [exit, output, errors] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  expect({ exit, errors }).toEqual({ exit: 0, errors: "" })
  expect(JSON.parse(output)).toEqual([
    "connection.status",
    "connection.verify-resources",
    "connection.check",
    "connection.save",
  ])
})

test("status prints the saved connection and recovery work instead of a new Host's starting phase", () => {
  const { statusText, statusView } = LoginomManagement
  const base = {
    revision: 1,
    generation: 1,
    url: "https://app.loginom.ai/app/",
    username: "worker",
    folder: "/worker",
    hasPassword: true,
    browser: { state: "unknown" as const },
  }
  const unconfigured = { ...base, generation: 0, revision: 0, state: "unconfigured" as const }
  expect(statusText(statusView(unconfigured))).toBe("Подключение не настроено — `loginom setup`.")
  expect(statusView({ ...unconfigured, state: "starting" }).state).toBe("unconfigured")
  const starting = { ...base, state: "starting" as const }
  expect(statusView(starting)).toEqual({ ...starting, state: "configured" })
  expect(statusView({ ...base, state: "ready" }).state).toBe("ready")
  const configured =
    "Подключение настроено: https://app.loginom.ai/app/, пользователь worker. " +
    "Незавершённых операций нет. Проверить соединение — `loginom check`."
  expect(statusText(statusView(starting))).toBe(configured)
  expect(statusText(statusView({ ...base, state: "ready" }))).toBe(configured)
  const pending = statusView({ ...base, revision: 2, state: "pending" })
  expect(pending.state).toBe("pending")
  expect(statusText(pending)).toBe(
    configured + "\nСохранённое изменение подключения ещё не применено; отменить его — `loginom cancel-pending`.",
  )
  const recovery = (count: number) =>
    statusText(
      statusView({
        ...base,
        state: "recoverable-error",
        recoveries: Array.from({ length: count }, (_, index) => String(index)),
      }),
    )
  const required = (count: string) =>
    "Подключение настроено: https://app.loginom.ai/app/, пользователь worker.\n" +
    `Требуется восстановление: ${count} — проверьте сценарий в Loginom и выполните \`loginom recover\`.`
  expect(recovery(1)).toBe(required("1 операция"))
  expect(recovery(2)).toBe(required("2 операции"))
  expect(recovery(5)).toBe(required("5 операций"))
  expect(recovery(11)).toBe(required("11 операций"))
  expect(recovery(21)).toBe(required("21 операция"))
  expect(statusText(statusView({ ...base, state: "recoverable-error", failure: "LOGINOM_RUNTIME_START_FAILED" }))).toBe(
    "Подключение настроено: https://app.loginom.ai/app/, пользователь worker.\n" +
      "Ошибка подключения: LOGINOM_RUNTIME_START_FAILED. Проверить соединение — `loginom check`, настроить заново — `loginom setup`.",
  )
})

// The fixture resources carry Linux's Node and no Keychain helper.
describe.skipIf(process.platform !== "linux")("loginom commands with the real Node host", () => {
  beforeAll(async () => {
    node()
    built.host = path.join(await temporary(), "host")
    // Built in its own process, so Bun's build cache stays out of this runner.
    const builder = Bun.spawn(
      [process.execPath, path.join(cli, "../loginom-host/script/build-node-host.ts"), built.host],
      { stdout: "pipe", stderr: "pipe" },
    )
    expect({ code: await builder.exited, error: await new Response(builder.stderr).text() }).toEqual({
      code: 0,
      error: "",
    })
  }, 60_000)

  test("status starts the Host from the resources and leaves nothing behind", async () => {
    const fixture = await setupFixture()
    expect(await loginom(fixture, ["status", "--format", "json"])).toMatchObject({
      code: 0,
      stderr: "",
      json: { state: "unconfigured", generation: 0 },
    })
    expect(await loginom(fixture, ["status"])).toMatchObject({
      code: 0,
      stdout: "Подключение не настроено — `loginom setup`.\n",
    })
    // Only the profile and the resources: no Desktop storage beside them, no latch, no runtime, no database.
    expect((await fs.readdir(fixture.root)).sort()).toEqual(["profile", "resources"])
    expect(await fs.readdir(fixture.profile)).not.toContain(".writer")
    expect(await fs.readdir(path.join(fixture.profile, "loginom"))).not.toContain("runtime")
    expect(await fs.readdir(path.join(fixture.profile, "data"))).toEqual([])
    expect(await loginom(fixture, ["--headless", "--no-headless", "status", "--format", "json"])).toMatchObject({
      code: 2,
      json: { ok: false, code: "CLI_ARGUMENT_INVALID" },
    })
    expect(await loginom(fixture, ["status", "--stdin-json", "--format", "json"])).toMatchObject({
      code: 2,
      json: { ok: false, code: "CLI_ARGUMENT_INVALID" },
    })
  }, 60_000)

  test("setup from stdin JSON saves a new generation through cliCredentials, and the profile's server reads it", async () => {
    const fixture = await setupFixture()
    // The command line of `scripts/node-acceptance/run-check.py`; it reads stdout as one JSON document.
    const setup = await loginom(
      fixture,
      ["setup", "--headless", "--stdin-json", "--format", "json"],
      JSON.stringify({ url: login.url, username: login.username, password: login.password }),
    )
    expect(setup).toMatchObject({ code: 0, stderr: "" })
    expect(JSON.parse(setup.stdout)).toMatchObject({
      generation: 1,
      url: login.url,
      username: login.username,
      hasPassword: true,
      state: expect.stringMatching(/^(starting|ready)$/),
      browser: { state: "verified" },
    })
    // The validation login got the connection from stdin.
    expect(await records(fixture.validations)).toEqual([
      expect.objectContaining({ validation: true, url: login.url, username: login.username, password: login.password }),
    ])
    const connection = path.join(fixture.profile, "loginom", "connection")
    const saved = JSON.parse(await fs.readFile(path.join(connection, "connection.json"), "utf8"))
    expect(saved).toMatchObject({ generation: 1, url: login.url, username: login.username })
    expect(saved.secrets).toMatchObject({ format: "loginom-cli-secrets-v1", protection: "plaintext" })
    expect(await cliCredentials("linux").decode(saved.secrets)).toEqual({ apiKey: "", password: login.password })
    expect(await fs.readdir(path.join(connection, "generations"))).toEqual(["1.json"])
    // `run-check.py` links `data/auth.json` next, which OpenCode 2 imports only when it creates the database.
    expect(await fs.readdir(path.join(fixture.profile, "data"))).toEqual([])

    // The call of `evals`: no headless flag in source mode, and a key from older scripts that is ignored.
    const again = await loginom(
      fixture,
      ["setup", "--stdin-json", "--format", "json"],
      JSON.stringify({ url: login.url, username: login.username, password: "", apiKey: "fixture-legacy-key" }),
    )
    expect(again).toMatchObject({ code: 0, json: { generation: 2, hasPassword: false } })
    expect((await fs.readdir(path.join(connection, "generations"))).sort()).toEqual(["1.json", "2.json"])
    expect(await loginom(fixture, ["status", "--format", "json"])).toMatchObject({
      code: 0,
      json: {
        generation: 2,
        url: login.url,
        username: login.username,
        state: expect.stringMatching(/^(configured|ready)$/),
      },
    })
    expect(await loginom(fixture, ["status"])).toMatchObject({
      code: 0,
      stdout: expect.stringContaining(`Подключение настроено: ${login.url}, пользователь ${login.username}.`),
    })

    // The profile's server starts its Host in the same directory (B2.3): it prepares Help for the saved generation.
    const before = (await records(fixture.starts)).length
    const server = Bun.spawn([process.execPath, "src/loginom-cli.ts", "serve", "--port", "0"], {
      cwd: cli,
      env: fixture.env,
      stdout: "pipe",
      stderr: "pipe",
    })
    try {
      if (!(await listening(server)))
        throw new Error(`server did not start: ${await new Response(server.stderr).text()}`)
      const start = await waitFor(async () => (await records(fixture.starts)).slice(before).find(Boolean), 30_000)
      expect(start).toMatchObject({ generation: 2 })
      // Help is a child of the server's Node host.
      expect(parent(parent(start.pid))).toBe(server.pid)
      // A command never opens a second Host on the profile while its server holds it.
      const busy = await loginom(fixture, ["status", "--format", "json"])
      expect(busy).toMatchObject({ code: 3, stdout: "" })
      expect(busy.stderr).toContain("PROFILE_BUSY")
    } finally {
      server.kill("SIGTERM")
      await server.exited
    }
    expect(await fs.readdir(fixture.profile)).not.toContain(".writer")
  }, 120_000)

  test("management commands share durable setup and recovery semantics through the real Node host", async () => {
    const fixture = await setupFixture()
    expect(await loginom(fixture, ["check", "--format", "json"])).toMatchObject({
      code: 2,
      json: { code: "LOGINOM_CONFIG_REQUIRED" },
    })
    expect(await loginom(fixture, ["setup", "--format", "json"])).toMatchObject({
      code: 2,
      json: { code: "CLI_STDIN_REQUIRED" },
    })
    expect(await loginom(fixture, ["setup", "--stdin-json", "--format", "json"], "private-setup-key")).toMatchObject({
      code: 2,
      json: { code: "CLI_SETUP_INVALID" },
    })
    // Older setup scripts still send a key; it is ignored and never stored.
    expect(
      await loginom(
        fixture,
        ["setup", "--stdin-json", "--format", "json"],
        JSON.stringify({ apiKey: "legacy-setup-key", password: "fixture-initial-password" }),
      ),
    ).toMatchObject({
      code: 0,
      json: { state: expect.stringMatching(/^(starting|ready)$/), generation: 1, hasPassword: true },
    })
    expect(
      await loginom(fixture, ["setup", "--stdin-json", "--format", "json"], JSON.stringify({ password: "" })),
    ).toMatchObject({
      code: 0,
      json: { state: expect.stringMatching(/^(starting|ready)$/), generation: 2, hasPassword: false },
    })
    const persisted = JSON.parse(
      await fs.readFile(path.join(fixture.profile, "loginom/connection/connection.json"), "utf8"),
    )
    expect(await cliCredentials("linux").decode(persisted.secrets)).toEqual({ apiKey: "", password: "" })
    expect(JSON.stringify(persisted)).not.toContain("legacy-setup-key")
    expect(await loginom(fixture, ["check", "--format", "json"])).toMatchObject({
      code: 0,
      json: { code: "LOGINOM_CONNECTION_VALID", help: { state: "ready" }, browser: { state: "verified" } },
    })
    expect(await loginom(fixture, ["cancel-pending", "--format", "json"])).toMatchObject({
      code: 0,
      json: { state: expect.stringMatching(/^(starting|ready)$/) },
    })
    const strict = { LOGINOM_AI_AGENT_STRICT_RECOVERY: "1" }
    const journal = await recoveryStore(path.join(fixture.profile, "loginom/recovery"), { strict: true })
    const id = await journal.begin("a".repeat(64), 2)
    await journal.settle(id, false)
    expect(await loginom(fixture, ["status"], "", strict)).toMatchObject({
      code: 0,
      stdout: expect.stringContaining(
        "Требуется восстановление: 1 операция — проверьте сценарий в Loginom и выполните `loginom recover`.",
      ),
    })
    expect(await loginom(fixture, ["recover", "--format", "json"], "", strict)).toMatchObject({
      code: 4,
      json: { code: "LOGINOM_RECOVERY_CONFIRMATION_REQUIRED" },
    })
    expect(
      await loginom(
        fixture,
        ["recover", "--acknowledge", "00000000-0000-0000-0000-000000000000", "--format", "json"],
        "",
        strict,
      ),
    ).toMatchObject({ code: 3, json: { code: "LOGINOM_RECOVERY_CONFLICT" } })
    expect(await loginom(fixture, ["recover", "--acknowledge", id, "--format", "json"], "", strict)).toMatchObject({
      code: 0,
      json: { state: expect.stringMatching(/^(starting|ready)$/) },
    })
    expect((await recoveryStore(path.join(fixture.profile, "loginom/recovery"), { strict: true })).pending()).toEqual(
      [],
    )
    const next = await journal.begin("b".repeat(64), 2)
    await journal.settle(next, false)
    expect(await loginom(fixture, ["recover", "--acknowledge", "--format", "json"], "", strict)).toMatchObject({
      code: 0,
      json: { state: expect.stringMatching(/^(starting|ready)$/) },
    })
    expect((await recoveryStore(path.join(fixture.profile, "loginom/recovery"), { strict: true })).pending()).toEqual(
      [],
    )
    // Without strict recovery the Host drops an uncertain operation of a process that is gone (G4).
    const dropped = await journal.begin("c".repeat(64), 2)
    await journal.settle(dropped, false)
    const advisory = await loginom(fixture, ["status", "--format", "json"])
    expect(advisory.code).toBe(0)
    expect(["configured", "ready"]).toContain(advisory.json.state)
    expect(advisory.json.recoveries).toBeUndefined()
    expect(await loginom(fixture, ["status"])).toMatchObject({
      code: 0,
      stdout: expect.stringContaining("Незавершённых операций нет. Проверить соединение — `loginom check`."),
    })
    expect((await recoveryStore(path.join(fixture.profile, "loginom/recovery"), { strict: true })).pending()).toEqual(
      [],
    )
  }, 120_000)

  test.each(["valid-help", "missing-help"])(
    "management separates Help from browser validation: %s",
    async (mode) => {
      const fixture = await setupFixture("LOGINOM_LOGIN_UNAVAILABLE")
      if (mode === "missing-help") await fs.rm(path.join(fixture.resources, "help"), { recursive: true, force: true })
      // An older setup script still sends a key; it is ignored.
      const setup = await loginom(
        fixture,
        ["setup", "--stdin-json", "--format=json"],
        JSON.stringify({
          apiKey: "UNIT-NONSECRET",
          url: "http://127.0.0.1:1/app/",
          username: "user",
          password: "PRIVATE-NONSECRET",
        }),
      )
      if (mode === "missing-help") {
        expect(setup).toMatchObject({ code: 1, json: { ok: false, code: "LOGINOM_KNOWLEDGE_UNAVAILABLE" } })
        expect(await records(fixture.validations)).toEqual([])
        expect((await loginom(fixture, ["status", "--format=json"])).json).toMatchObject({
          state: "unconfigured",
          generation: 0,
        })
        return
      }
      expect(setup).toMatchObject({
        code: 0,
        stderr: "",
        json: { generation: 1, browser: { state: "failed", failure: "LOGINOM_LOGIN_UNAVAILABLE" } },
      })
      expect((await loginom(fixture, ["status", "--format=json"])).json.browser).toEqual({ state: "unknown" })
      expect(await loginom(fixture, ["check", "--format=json"])).toMatchObject({
        code: 0,
        stderr: "",
        json: {
          ok: true,
          help: { state: "ready" },
          browser: { state: "failed", failure: "LOGINOM_LOGIN_UNAVAILABLE" },
        },
      })
      const browser = (await records(fixture.validations)).at(-1)
      expect(browser.validation).toBe(true)
      await expect(fs.access(`/proc/${browser.pid}`)).rejects.toMatchObject({ code: "ENOENT" })
      expect(await fs.readdir(path.join(fixture.profile, "loginom"))).not.toContain("runtime")
    },
    60_000,
  )

  test("a command exits after failed Host cleanup despite retained process handles", async () => {
    const root = await temporary()
    const resources = await fakeHost(
      root,
      `process.on("message", m => {
        if (m.method === "start") process.send({ id: m.id, result: { protocol: 1, ready: true, pid: process.pid } });
        if (m.method === "connection.status") process.send({ id: m.id, error: "LOGINOM_HOST_CLOSED" });
        if (m.method === "close") process.exit(1);
      });`,
    )
    // An entry that keeps the event loop busy: only an explicit exit ends the process.
    const entry = path.join(root, "entry.ts")
    await fs.writeFile(
      entry,
      `setInterval(() => {}, 1000);
      process.argv = ["bun", "loginom-cli", "loginom", "status", "--format", "json"];
      await import(${JSON.stringify(path.join(cli, "src/loginom-cli.ts"))});`,
    )
    const profile = path.join(root, "profile")
    const child = Bun.spawn([process.execPath, "run", entry], {
      cwd: cli,
      env: isolatedEnv(root, { LOGINOM_AI_AGENT_CLI_PROFILE: profile, LOGINOM_AI_AGENT_RESOURCES: resources }),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
    const deadline = { fired: false }
    const timer = setTimeout(() => {
      deadline.fired = true
      child.kill("SIGKILL")
    }, 8_000)
    try {
      expect(await child.exited).toBe(1)
      expect(deadline.fired).toBe(false)
      expect(await new Response(child.stderr).text()).toContain("LOGINOM_HOST_CLEANUP_FAILED")
      expect(await new Response(child.stdout).text()).toContain("LOGINOM_HOST_CLOSED")
      expect(await fs.readdir(profile)).toContain(".writer")
    } finally {
      clearTimeout(timer)
      child.kill()
      await child.exited
    }
  }, 15_000)

  // The cleanups that wait out the Host client's 30-second close budget (`disconnect`, `ack-without-exit`) are cases of
  // `loginom-host/test/node-host.test.ts`; here one confirmed and one unconfirmed path each decide the latch.
  test("startup failure releases the profile only after confirmed cleanup", async () => {
    for (const cleanup of ["confirmed", "bad-ack", "exit-without-ack", "secret-error"]) {
      const confirmed = cleanup === "confirmed" || cleanup === "secret-error"
      const failure = cleanup === "secret-error" ? "LOGINOM_HOST_REQUEST_FAILED" : "LOGINOM_HANDSHAKE_INVALID"
      const root = await temporary()
      const marker = path.join(root, "host.json")
      const resources = await fakeHost(
        root,
        `import { writeFileSync } from "node:fs";
        process.on("message", m => {
          if (m.method === "start") {
            writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ pid: process.pid }));
            process.send({ id: m.id, error: ${JSON.stringify(cleanup === "secret-error" ? "private-startup-sentinel" : "LOGINOM_HANDSHAKE_INVALID")} });
          }
          if (m.method !== "close") return;
          if (${JSON.stringify(cleanup)} === "exit-without-ack") { process.exit(0); return; }
          process.send({ id: m.id, result: { closed: ${confirmed} } }, () => process.exit(${confirmed ? 0 : 1}));
        });`,
      )
      const profile = path.join(root, "profile")
      const child = Bun.spawn([process.execPath, "src/loginom-cli.ts", "loginom", "status", "--format=json"], {
        cwd: cli,
        env: isolatedEnv(root, { LOGINOM_AI_AGENT_CLI_PROFILE: profile, LOGINOM_AI_AGENT_RESOURCES: resources }),
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      })
      const timer = setTimeout(() => child.kill("SIGKILL"), 20_000)
      try {
        const [code, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ])
        expect({ cleanup, code }).toEqual({ cleanup, code: 1 })
        expect(stderr).toContain(confirmed ? failure : "LOGINOM_HOST_CLEANUP_FAILED")
        if (confirmed) expect(stdout).toContain(failure)
        expect(stdout + stderr).not.toContain("private-startup-sentinel")
        expect({ cleanup, writer: (await fs.readdir(profile)).includes(".writer") }).toEqual({
          cleanup,
          writer: !confirmed,
        })
        const host = JSON.parse(await fs.readFile(marker, "utf8"))
        expect(() => process.kill(host.pid, 0)).toThrow()
      } finally {
        clearTimeout(timer)
        child.kill()
        await child.exited
        const host = await fs.readFile(marker, "utf8").then(
          (text) => JSON.parse(text),
          () => undefined,
        )
        if (host && existsSync(`/proc/${host.pid}`)) process.kill(host.pid, "SIGKILL")
      }
    }
  }, 60_000)
})

function node() {
  const value = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!value) throw new Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  return value
}

async function temporary() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "cli-loginom-")))
  roots.push(root)
  return root
}

// Resources with the pinned Node, the built Host entry and a small shipped Help, as `build-cli.ts` lays them out. Help
// and the browser are stubs: Help records each start, the browser each validation login, and the login succeeds unless
// `browser` names its refusal.
async function setupFixture(browser?: "LOGINOM_LOGIN_UNAVAILABLE") {
  const root = await temporary()
  const resources = path.join(root, "resources")
  const starts = path.join(root, "help-starts.jsonl")
  const validations = path.join(root, "browser-logins.jsonl")
  await fs.mkdir(path.join(resources, "bin"), { recursive: true })
  await fs.mkdir(path.join(resources, "runtime", "src"), { recursive: true })
  await fs.copyFile(node(), path.join(resources, "bin", "node"))
  await fs.cp(built.host, path.join(resources, "host"), { recursive: true })
  await writeHelp(path.join(resources, "help"))
  await fs.writeFile(path.join(resources, "browser"), "controlled browser payload")
  await fs.writeFile(
    path.join(resources, "runtime", "src", "knowledge-entry.mjs"),
    `import { appendFileSync } from "node:fs";
    process.on("disconnect", () => process.exit(0));
    process.on("message", m => {
      if (m.operation === "start") {
        appendFileSync(${JSON.stringify(starts)}, JSON.stringify({ generation: m.input.generation, pid: process.pid }) + "\\n");
        process.send({ id: m.id, result: { protocol: 1, generation: m.input.generation, started: true } });
      }
      if (m.operation === "list") process.send({ id: m.id, result: { tools: [] } });
      if (m.operation === "interrupt") process.send({ id: m.id, result: { interrupted: true } });
      if (m.operation === "close") process.send({ id: m.id, result: { closed: true } }, () => process.disconnect());
    });`,
  )
  await fs.writeFile(
    path.join(resources, "runtime", "src", "managed-entry.mjs"),
    `import { appendFileSync } from "node:fs";
    process.on("disconnect", () => process.exit(0));
    process.on("message", m => {
      if (m.operation === "start") {
        const { url, username, password } = m.input.connection;
        appendFileSync(${JSON.stringify(validations)}, JSON.stringify({ validation: m.input.validation, pid: process.pid, url, username, password }) + "\\n");
        process.send(${JSON.stringify(browser ?? "")}
          ? { id: m.id, error: ${JSON.stringify(browser ?? "")} }
          : { id: m.id, result: { protocol: 1, generation: m.input.generation, chat: m.input.chat, checked: true, ready: true } });
      }
      if (m.operation === "close") process.send({ id: m.id, result: { closed: true } }, () => process.disconnect());
    });`,
  )
  await fs.writeFile(
    path.join(resources, "resource-manifest.json"),
    JSON.stringify({
      protocol: 1,
      nodeVersion: "24.19.0",
      node: "bin/node",
      browser: "browser",
      files: await resourceInventory(resources),
    }),
  )
  const profile = path.join(root, "profile")
  return {
    root,
    resources,
    profile,
    starts,
    validations,
    env: isolatedEnv(root, {
      LOGINOM_AI_AGENT_CLI_PROFILE: profile,
      LOGINOM_AI_AGENT_RESOURCES: resources,
      LOGINOM_AI_AGENT_PASSWORD: "fixture-server-password",
    }),
  }
}

// Resources with the pinned Node and a Host entry of the test's own.
async function fakeHost(root: string, entry: string) {
  const resources = path.join(root, "resources")
  await fs.mkdir(path.join(resources, "bin"), { recursive: true })
  await fs.mkdir(path.join(resources, "host"))
  await fs.symlink(node(), path.join(resources, "bin", "node"))
  await fs.writeFile(path.join(resources, "host", "node-host.mjs"), entry)
  return resources
}

// `loginom <args>` of the product CLI from source; stdout is parsed when it is one JSON document.
async function loginom(
  fixture: Awaited<ReturnType<typeof setupFixture>>,
  args: string[],
  input = "",
  env: Record<string, string> = {},
) {
  const child = Bun.spawn([process.execPath, "src/loginom-cli.ts", "loginom", ...args], {
    cwd: cli,
    env: { ...fixture.env, ...env },
    stdin: new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  // Secrets never reach the output.
  for (const secret of [
    login.password,
    "fixture-initial-password",
    "private-setup-key",
    "legacy-setup-key",
    "PRIVATE-NONSECRET",
  ])
    expect(stdout + stderr).not.toContain(secret)
  // A command leaves the profile free, unless its server holds it.
  if (code !== 3) expect(await fs.readdir(fixture.profile)).not.toContain(".writer")
  const json = (() => {
    try {
      return JSON.parse(stdout)
    } catch {
      return undefined
    }
  })()
  return { code, stdout, stderr, json }
}

async function records(file: string) {
  const text = await fs.readFile(file, "utf8").catch(() => "")
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

async function waitFor<T>(check: () => Promise<T | undefined>, timeout: number): Promise<T> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await check()
    if (value !== undefined) return value
    await Bun.sleep(100)
  }
  throw new Error("Timed out waiting for condition")
}

// The parent of a Linux process.
function parent(pid: number) {
  const stat = readFileSync(`/proc/${pid}/stat`, "utf8")
  return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1])
}

// The URL once the server listens, or undefined when it exits first.
async function listening(child: Bun.Subprocess<"ignore", "pipe", "pipe">) {
  const decoder = new TextDecoder()
  const output = { text: "" }
  for await (const chunk of child.stdout) {
    output.text += decoder.decode(chunk)
    const url = /server listening on (http:\/\/\S+)/.exec(output.text)?.[1]
    if (url) return url
  }
  return undefined
}
