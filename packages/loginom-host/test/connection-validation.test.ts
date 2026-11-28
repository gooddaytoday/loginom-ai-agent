import { expect, test } from "bun:test"
import { Schema } from "effect"
import { Loginom } from "../src/loginom"
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { watch } from "node:fs"
import { createLoginomHost } from "../src/host"
import { cliCredentials } from "../src/connection/cli-credentials"
import { credentials } from "../src/connection/credentials"
import { connectionService } from "../src/connection/connection-service"
import { connectionStore } from "../src/connection/connection-store"
import { writeHelp } from "../../loginom-runtime/client/test/support/help-fixture.mjs"
import { launchNodeHost } from "../src/node-client"
import { stageHeldKnowledge } from "./fixtures/knowledge"

async function buildNodeHost(output: string) {
  // Isolate Bun.build: repeated in-process builds in Bun's test runner can fail
  // reading otherwise unchanged dependencies (EISDIR / Unseekable reading).
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "../script/build-node-host.ts"), output], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const error = new Response(child.stderr).text()
  expect({ code: await child.exited, error: await error }).toEqual({ code: 0, error: "" })
  return join(output, "node-host.mjs")
}

const diagnosticKey = "synthetic-knowledge-key"

// "held" keeps the Help catalog pending in a stub entry; the other modes run the
// real entry over <resources>/help, absent or with a changed page.
async function fixture(
  error: string,
  help: "shipped" | "held" | "missing" | "tampered" = "shipped",
  holdStart = false,
  failClose = false,
) {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "connection-validation-"))
  const resources = join(directory, "resources")
  const root = join(directory, "profile")
  const marker = join(directory, "browser-validation")
  await mkdir(join(resources, "bin"), { recursive: true })
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await symlink(node, join(resources, "bin/node"))
  const catalog = await stageHeldKnowledge(join(directory, "held-knowledge.mjs"), join(directory, "catalog-gate"))
  await symlink(
    help === "held"
      ? join(directory, "held-knowledge.mjs")
      : fileURLToPath(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url)),
    join(resources, "runtime/src/knowledge-entry.mjs"),
  )
  if (help !== "missing")
    await writeHelp(join(resources, "help"), help === "tampered" ? { tamper: "data/README.md" } : {})
  // Only the browser boundary is controlled. Help uses the real entry over shipped Help files.
  await writeFile(
    join(resources, "runtime/src/managed-entry.mjs"),
    `import {writeFileSync,existsSync,mkdirSync} from 'node:fs';
    import {join} from 'node:path';
    let starting;
    function ready() {
      process.send(${JSON.stringify(error)} ? {id:starting.id,error:${JSON.stringify(error)},startupDiagnostics:[{
        error:{message:'Fixture rejected ' + starting.input.connection.password + ' apiKey=' + ${JSON.stringify(diagnosticKey)}}
      }]}
        : {id:starting.id,result:{protocol:1,generation:starting.input.generation,checked:true,ready:true,chat:starting.input.chat}});
    }
    process.on('SIGUSR1', ready);
    process.on('disconnect', () => process.exit(0));
    process.on('message', message => {
      if (message.operation === 'start') {
        starting = message;
        const cache=join(message.input.stateDir,'http-cache');
        const cacheHit=message.input.validationHttpCache===true && existsSync(join(cache,'fixture-hit'));
        if(message.input.validationHttpCache===true){mkdirSync(cache,{recursive:true});writeFileSync(join(cache,'fixture-hit'),'owned fixture cache');}
        writeFileSync(${JSON.stringify(marker)}, JSON.stringify({validation:message.input.validation,pid:process.pid,httpCache:message.input.validationHttpCache===true,cacheHit}));
        if (!${holdStart}) ready();
      }
      if (message.operation === 'close') process.send({id:message.id,result:{closed:${!failClose}}},()=>process.exit(${failClose ? 1 : 0}));
    });`,
  )
  await writeFile(join(resources, "resource-manifest.json"), JSON.stringify({}))
  const host = await createLoginomHost({ root, resources, codec: credentials("linux"), environment: {} })
  return {
    host,
    catalog,
    root,
    resources,
    marker,
    candidate: {
      revision: 0,
      url: "http://unavailable.example/app/?custom=1",
      username: "user",
      password: { operation: "replace" as const, value: "PRIVATE-NONSECRET-PASSWORD" },
    },
    async close() {
      try {
        await catalog.release()
        await host.close()
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  }
}

test("validation shares only HTTP cache for identical credentials and clears it at shutdown", async () => {
  const f = await fixture("")
  try {
    const run = async (candidate = f.candidate) => {
      await f.host.api.check(candidate)
      return JSON.parse(await readFile(f.marker, "utf8"))
    }
    expect(await run()).toMatchObject({ httpCache: true, cacheHit: false })
    expect(await run()).toMatchObject({ httpCache: true, cacheHit: true })
    const changed = { ...f.candidate, password: { operation: "replace" as const, value: "DIFFERENT-NONSECRET" } }
    expect(await run(changed)).toMatchObject({ httpCache: true, cacheHit: false })
    expect(await run(changed)).toMatchObject({ httpCache: true, cacheHit: true })
    expect(await run({ ...changed, username: "other-user" })).toMatchObject({ httpCache: true, cacheHit: false })
    await f.host.close()
    await expect(access(join(f.root, "validation/http-cache"))).rejects.toMatchObject({ code: "ENOENT" })
  } finally { await f.close() }
})

test("overlapping validation uses a fresh cache without blocking the first check", async () => {
  const f = await fixture("", "held")
  const first = f.host.api.check(f.candidate)
  void first.catch(() => {})
  try {
    await f.catalog.entered()
    await f.host.api.check(f.candidate)
    expect(JSON.parse(await readFile(f.marker, "utf8"))).toMatchObject({ httpCache: false, cacheHit: false })
    await f.catalog.release()
    await first
    expect(JSON.parse(await readFile(f.marker, "utf8"))).toMatchObject({ httpCache: true, cacheHit: false })
    await f.host.api.check(f.candidate)
    expect(JSON.parse(await readFile(f.marker, "utf8"))).toMatchObject({ httpCache: true, cacheHit: true })
  } finally { await f.close() }
})

test.each(["host", "node"])(
  "Host shutdown cancels browser validation while its handshake is pending: %s",
  async (mode) => {
    const f = await fixture("", "shipped", true)
    const owner =
      mode === "host"
        ? f.host
        : await launchNodeHost({
            node: process.env.LOGINOM_AI_AGENT_TEST_NODE!,
            entry: await buildNodeHost(join(f.resources, "host")),
            root: f.root,
            resources: f.resources,
            headless: true,
            environment: {},
          })
    const started = Promise.withResolvers<void>()
    const watcher = watch(join(f.marker, ".."), (_, name) => {
      if (name === "browser-validation") started.resolve()
    })
    const checking = "api" in owner ? owner.api.check(f.candidate) : owner.request("connection.check", f.candidate)
    void checking.catch(() => {})
    let closing: Promise<void> | undefined
    const deadline = { timer: undefined as ReturnType<typeof setTimeout> | undefined }
    try {
      await started.promise
      closing = owner.close()
      await Promise.race([
        closing,
        new Promise((_, reject) => {
          deadline.timer = setTimeout(() => reject(Error("BROWSER_VALIDATION_DID_NOT_CANCEL")), 1500)
        }),
      ])
      await expect(checking).rejects.toThrow("LOGINOM_HOST_CLOSED")
      const browser = JSON.parse(await readFile(f.marker, "utf8"))
      expect(() => process.kill(browser.pid, 0)).toThrow()
      await expect(f.host.api.save({ revision: 0, validationId: "never-issued" })).rejects.toThrow()
    } finally {
      clearTimeout(deadline.timer)
      watcher.close()
      const browser = JSON.parse(await readFile(f.marker, "utf8"))
      try {
        process.kill(browser.pid, "SIGUSR1")
      } catch {}
      await closing
      await checking.catch(() => {})
      await f.close()
    }
  },
  15_000,
)

test.each(["host", "node"])(
  "cancelled browser validation cannot hide failed cleanup: %s",
  async (mode) => {
    const f = await fixture("", "shipped", true, true)
    const owner =
      mode === "host"
        ? f.host
        : await launchNodeHost({
            node: process.env.LOGINOM_AI_AGENT_TEST_NODE!,
            entry: await buildNodeHost(join(f.resources, "host")),
            root: f.root,
            resources: f.resources,
            headless: true,
            environment: {},
          })
    const started = Promise.withResolvers<void>()
    const watcher = watch(join(f.marker, ".."), (_, name) => {
      if (name === "browser-validation") started.resolve()
    })
    const checking = "api" in owner ? owner.api.check(f.candidate) : owner.request("connection.check", f.candidate)
    void checking.catch(() => {})
    try {
      await started.promise
      await expect(owner.close()).rejects.toThrow(
        mode === "host" ? "LOGINOM_RUNTIME_CLEANUP_FAILED" : "LOGINOM_HOST_CLEANUP_FAILED",
      )
      await expect(checking).rejects.toThrow("LOGINOM_HOST_CLOSED")
      const browser = JSON.parse(await readFile(f.marker, "utf8"))
      expect(() => process.kill(browser.pid, 0)).toThrow()
    } finally {
      watcher.close()
      await checking.catch(() => {})
      await owner.close().catch(() => {})
      await f.close().catch(() => {})
    }
  },
  15_000,
)

test.each([
  "LOGINOM_LOGIN_UNAVAILABLE",
  "LOGINOM_LOGIN_REJECTED",
  "LOGINOM_ACCOUNT_MISMATCH",
  "LOGINOM_BROWSER_START_FAILED",
])(
  "valid Help permits saving despite browser failure %s",
  async (failure) => {
    const f = await fixture(failure)
    try {
      const validation = await f.host.api.check(f.candidate)
      expect(structuredClone(validation)).toMatchObject({
        validationId: expect.any(String),
        browser: { state: "failed", failure },
      })
      const browser = JSON.parse(await readFile(f.marker, "utf8"))
      expect(browser.validation).toBe(true)
      await expect(access(`/proc/${browser.pid}`)).rejects.toMatchObject({ code: "ENOENT" })
      await f.host.api.save({ validationId: validation.validationId, revision: 0 })
      await f.host.settled()
      await f.host.catalog(1)
      expect(await f.host.api.status()).toMatchObject({
        generation: 1,
        state: "ready",
        browser: { state: "failed", failure },
      })
      expect((await f.host.api.status()).failure).toBeUndefined()
      expect(await connectionStore(join(f.root, "connection"), credentials("linux")).read()).toMatchObject({
        url: f.candidate.url,
        // Shipped Help needs no key, so none is stored with the connection.
        apiKey: "",
        password: f.candidate.password.value,
      })
      expect(
        await f.host.knowledge(1).request("call", {
          run: "docs",
          id: "help",
          name: "read",
          arguments: { uris: "data/processors/integration/rest-request.md" },
        }),
      ).toMatchObject({ content: [{ type: "text", text: expect.stringContaining("# REST-запрос") }] })
      expect(f.host.hasRuntime(1, "docs")).toBe(false)
      expect(f.host.journal.pending()).toEqual([])
    } finally {
      await f.close()
    }
  },
  15_000,
)

test.each(["", "LOGINOM_LOGIN_REJECTED"])(
  "chat runtime updates browser status after restore (%s)",
  async (failure) => {
    const f = await fixture(failure)
    const validation = await f.host.api.check(f.candidate)
    await f.host.api.save({ revision: 0, validationId: validation.validationId })
    await f.host.settled()
    await f.host.close()
    const restored = await createLoginomHost({
      root: f.root,
      resources: f.resources,
      codec: credentials("linux"),
      environment: {},
    })
    try {
      await restored.settled()
      await restored.catalog(1)
      expect((await restored.api.status()).browser).toEqual({ state: "unknown" })
      if (failure) await expect(restored.runtime(1, "scenario")).rejects.toThrow(failure)
      if (!failure) expect((await restored.runtime(1, "scenario")).ready).toMatchObject({ ready: true })
      expect((await restored.api.status()).browser).toEqual(
        failure ? { state: "failed", failure } : { state: "verified" },
      )
      expect(await restored.api.status()).toMatchObject({ state: "ready", generation: 1 })
    } finally {
      await restored.close()
      await f.close()
    }
  },
  15_000,
)

test("browser validation starts only after the Help catalog is complete", async () => {
  const f = await fixture("", "held")
  const checking = f.host.api.check(f.candidate)
  void checking.catch(() => {})
  try {
    await f.catalog.entered()
    await expect(access(f.marker)).rejects.toMatchObject({ code: "ENOENT" })
    await f.catalog.release()
    expect((await checking).browser).toEqual({ state: "verified" })
    expect(await f.host.api.status()).toMatchObject({ state: "unconfigured", browser: { state: "unknown" } })
  } finally {
    await f.catalog.release()
    await checking.catch(() => {})
    await f.close()
  }
}, 15_000)

test.each(["missing", "tampered"] as const)(
  "unavailable shipped Help cannot start browser validation or produce a save token: %s",
  async (help) => {
    const f = await fixture("LOGINOM_LOGIN_UNAVAILABLE", help)
    try {
      await expect(f.host.api.check(f.candidate)).rejects.toThrow("LOGINOM_KNOWLEDGE_UNAVAILABLE")
      await expect(access(f.marker)).rejects.toMatchObject({ code: "ENOENT" })
      expect(await f.host.api.status()).toMatchObject({ state: "unconfigured", generation: 0 })
      await expect(f.host.api.save({ revision: 0, validationId: "never-issued" })).rejects.toThrow(
        "LOGINOM_VALIDATION_EXPIRED",
      )
      expect(await connectionStore(join(f.root, "connection"), credentials("linux")).read()).toBeUndefined()
    } finally {
      await f.close()
    }
  },
  15_000,
)

test("unexpected runtime failures do not become a successful browser warning or leak secrets", async () => {
  const f = await fixture("REMOTE-PRIVATE-TEXT")
  try {
    await expect(f.host.api.check(f.candidate)).rejects.toThrow("LOGINOM_CONNECTION_CHECK_FAILED")
    expect(await f.host.api.status()).toMatchObject({ state: "unconfigured", browser: { state: "unknown" } })
    await expect(f.host.api.save({ revision: 0, validationId: "never-issued" })).rejects.toThrow(
      "LOGINOM_VALIDATION_EXPIRED",
    )
  } finally {
    await f.close()
  }
}, 15_000)

test("Host shutdown cancels the pending Help validation before any browser check", async () => {
  const f = await fixture("", "held")
  const checking = f.host.api.check(f.candidate)
  void checking.catch(() => {})
  const deadline: { timer?: ReturnType<typeof setTimeout> } = {}
  try {
    await f.catalog.entered()
    await f.host.close()
    await expect(
      Promise.race([
        checking,
        new Promise((_, reject) => {
          deadline.timer = setTimeout(() => reject(Error("VALIDATION_DID_NOT_CANCEL")), 2_000)
        }),
      ]),
    ).rejects.toThrow("LOGINOM_HOST_CLOSED")
    await expect(access(f.marker)).rejects.toMatchObject({ code: "ENOENT" })
  } finally {
    clearTimeout(deadline.timer)
    await f.catalog.release()
    await checking.catch(() => {})
    await f.close()
  }
}, 15_000)

test("rechecking the unchanged active connection updates its browser status without saving", async () => {
  const f = await fixture("LOGINOM_LOGIN_REJECTED")
  const store = connectionStore(join(f.root, "connection"), credentials("linux"))
  try {
    const validation = await f.host.api.check(f.candidate)
    await f.host.api.save({ revision: 0, validationId: validation.validationId })
    await f.host.settled()
    await f.host.catalog(1)
    const original = await store.read()
    await f.host.close()
    const restored = await createLoginomHost({
      root: f.root,
      resources: f.resources,
      codec: credentials("linux"),
      environment: {},
    })
    try {
      await restored.settled()
      await restored.catalog(1)
      expect((await restored.api.status()).browser).toEqual({ state: "unknown" })
      const changed = await restored.api.check({ ...f.candidate, revision: 1, username: "different-user" })
      expect(changed.browser).toEqual({ state: "failed", failure: "LOGINOM_LOGIN_REJECTED" })
      expect((await restored.api.status()).browser).toEqual({ state: "unknown" })
      const checked = await restored.api.check({
        ...f.candidate,
        revision: 1,
        apiKey: { operation: "preserve" },
        password: { operation: "preserve" },
      })
      expect(checked.browser).toEqual({ state: "failed", failure: "LOGINOM_LOGIN_REJECTED" })
      expect(await restored.api.status()).toMatchObject({
        generation: 1,
        state: "ready",
        browser: { state: "failed", failure: "LOGINOM_LOGIN_REJECTED" },
      })
      expect(await store.read()).toEqual(original)
    } finally {
      await restored.close()
    }
  } finally {
    await f.close()
  }
}, 15_000)

test("browser reports from an old generation cannot replace the saved connection's status", async () => {
  const f = await fixture("")
  try {
    const first = await f.host.api.check(f.candidate)
    await f.host.api.save({ revision: 0, validationId: first.validationId })
    await f.host.settled()
    await f.host.catalog(1)
    const second = await f.host.api.check({ ...f.candidate, revision: 1, url: "http://next.example/app/" })
    await f.host.api.save({ revision: 1, validationId: second.validationId })
    await f.host.settled()
    await f.host.catalog(2)
    f.host.browserStatus(1, { state: "failed", failure: "LOGINOM_ACCOUNT_MISMATCH" })
    expect(await f.host.api.status()).toMatchObject({
      generation: 2,
      state: "ready",
      browser: { state: "verified" },
    })
    const view = await f.host.api.status()
    if (view.browser) Object.assign(view.browser, { state: "unknown" })
    expect((await f.host.api.status()).browser).toEqual({ state: "verified" })
  } finally {
    await f.close()
  }
}, 15_000)

test("settings reject a bad password through Node IPC without creating an active connection", async () => {
  const f = await fixture("LOGINOM_LOGIN_REJECTED")
  try {
    const host = await launchNodeHost({
      node: process.env.LOGINOM_AI_AGENT_TEST_NODE!,
      entry: await buildNodeHost(f.root),
      root: join(f.root, "service"),
      resources: f.resources,
      headless: true,
    })
    try {
      await expect(host.request("connection.settings.check", f.candidate)).rejects.toThrow("LOGINOM_URL_INVALID")
      const candidate = { ...f.candidate, url: "http://loginom.example/" }
      await expect(host.request("connection.settings.check", candidate)).rejects.toThrow("LOGINOM_LOGIN_REJECTED")
      expect(await host.request("connection.status", {})).toMatchObject({ revision: 0, generation: 0 })
    } finally {
      await host.close()
    }
  } finally {
    await f.close()
  }
})

test.each(["LOGINOM_KNOWLEDGE_AUTH_FAILED", "LOGINOM_LOGIN_UNAVAILABLE", "LOGINOM_LOGIN_REJECTED"])(
  "settings preserve the active connection and redact diagnostics when validation fails with %s",
  async (error) => {
    const scenario = await fixture(error)
    try {
      const root = join(scenario.root, "service")
      const store = connectionStore(
        join(root, "connection"),
        cliCredentials(process.platform, { root, resources: scenario.resources }),
      )
      const original = {
        generation: 1,
        revision: 1,
        url: "https://active.example/app/",
        username: "analyst",
        apiKey: "",
        password: "fixture-stored-password",
      }
      await store.stage(original)
      await store.activate(original.generation)
      const host = await launchNodeHost({
        node: process.env.LOGINOM_AI_AGENT_TEST_NODE!,
        entry: await buildNodeHost(scenario.root),
        root,
        resources: scenario.resources,
        headless: true,
      })
      try {
        const candidate = { ...scenario.candidate, url: "http://loginom.example/", revision: 1 }
        await expect(host.request("connection.settings.check", candidate)).rejects.toThrow(error)
        expect(await host.request("connection.status", {})).toMatchObject({
          revision: 1,
          generation: 1,
          url: original.url,
          username: original.username,
          hasPassword: true,
        })
        expect(await store.read()).toEqual(original)
        expect(await store.pending()).toBeUndefined()
        const log = await readFile(join(root, "validation", "startup-failures.jsonl"), "utf8")
        expect(log).toContain(error)
        expect(log).toContain("Fixture rejected [redacted]")
        expect(log).not.toContain(scenario.candidate.password.value)
        expect(log).not.toContain(diagnosticKey)
      } finally {
        await host.close()
      }
    } finally {
      await scenario.close()
    }
  },
  15_000,
)

test.each([
  ["keep", { operation: "preserve" }, "fixture-stored-password"],
  ["replace", { operation: "replace", value: "fixture-new-password" }, "fixture-new-password"],
  ["passwordless", { operation: "empty" }, ""],
] satisfies [string, typeof Loginom.PasswordEdit.Type, string][])(
  "settings use and persist the selected password operation after restart: %s",
  async (_operation, password, expectedPassword) => {
    const directory = await mkdtemp(join(tmpdir(), "connection-password-"))
    const codec = credentials("linux")
    const store = connectionStore(directory, codec)
    const original = {
      generation: 1,
      revision: 1,
      url: "https://loginom.example/app/",
      username: "analyst",
      apiKey: "",
      password: "fixture-stored-password",
    }
    try {
      await store.stage(original)
      await store.activate(original.generation)
      const service = await connectionService(store, {
        async check(candidate) {
          if (candidate.password !== expectedPassword) throw new Error("LOGINOM_LOGIN_REJECTED")
          return { state: "verified" }
        },
        async prepare() {
          return { async close() {} }
        },
      })
      try {
        await service.settled()
        const { revision, url, username } = original
        const { validationId } = await service.api.check({ revision, url, username, password }, true)
        expect(await store.read()).toEqual(original)
        await service.api.save({ revision, validationId }, true)
        await service.settled()
        expect(await service.api.status()).toMatchObject({ generation: 2, hasPassword: expectedPassword !== "" })
      } finally {
        await service.close()
      }
      const reopened = connectionStore(directory, codec)
      expect(await reopened.read()).toEqual({
        ...original,
        generation: 2,
        revision: 2,
        urlSource: "explicit",
        password: expectedPassword,
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
)

test("settings save waits for the current turn, including first setup, and survives a Host restart", async () => {
  const f = await fixture("")
  const root = join(f.root, "service")
  const options = {
    node: process.env.LOGINOM_AI_AGENT_TEST_NODE!,
    entry: await buildNodeHost(f.root),
    root,
    resources: f.resources,
    headless: true,
  }
  const store = connectionStore(join(root, "connection"), cliCredentials(process.platform, { root, resources: f.resources }))
  const readCheck = (reply: unknown) => Schema.decodeUnknownSync(Loginom.Validation)(reply)
  const readStatus = (reply: unknown) => Schema.decodeUnknownSync(Loginom.View)(reply)
  try {
    const host = await launchNodeHost(options)
    try {
      const candidate = { ...f.candidate, url: "http://loginom.example/" }
      const legacy = readCheck(await host.request("connection.check", candidate))
      await expect(host.request("connection.settings.save", { revision: 0, validationId: legacy.validationId }))
        .rejects.toThrow("LOGINOM_VALIDATION_EXPIRED")

      await host.request("connection.settings.turn", { id: "existing-turn", active: true })
      const checked = readCheck(await host.request("connection.settings.check", candidate))
      expect(await host.request("connection.status", {})).toMatchObject({ revision: 0, generation: 0 })
      expect(await host.request("connection.settings.save", { revision: 0, validationId: checked.validationId }))
        .toMatchObject({ revision: 1, generation: 0, state: "pending" })
      expect(await store.read()).toBeUndefined()

      await host.request("connection.settings.turn", { id: "new-turn", active: true })
      await host.request("connection.settings.turn", { id: "existing-turn", active: false })
      const deadline = Date.now() + 5000
      while (readStatus(await host.request("connection.status", {})).state !== "ready" && Date.now() < deadline)
        await Bun.sleep(25)
      expect(readStatus(await host.request("connection.status", {}))).toMatchObject({ generation: 1, state: "ready" })
      expect(await store.read())
        .toMatchObject({ username: "user", url: candidate.url, generation: 1 })
      const wrongServer = { revision: 1, url: "http://other.example", username: "user", password: { operation: "preserve" } }
      await expect(host.request("connection.settings.check", wrongServer)).rejects.toThrow("LOGINOM_PASSWORD_REQUIRED")
    } finally {
      await host.close()
    }
    const restored = await launchNodeHost(options)
    try {
      const status = readStatus(await restored.request("connection.status", {}))
      expect(status).toMatchObject({ generation: 1, username: "user", hasPassword: true })
      expect(status).not.toHaveProperty("password")
      expect(status).not.toHaveProperty("apiKey")
    } finally {
      await restored.close()
    }
  } finally {
    await f.close()
  }
}, 30_000)


test("settings Save acknowledges persistence while activation is still blocked", async () => {
  const f = await fixture("")
  const root = join(f.root, "service")
  const gate = join(f.root, "allow-activation")
  try {
    const host = await launchNodeHost({
      node: process.env.LOGINOM_AI_AGENT_TEST_NODE!,
      entry: await buildNodeHost(f.root),
      root,
      resources: f.resources,
      headless: true,
    })
    try {
      const candidate = { ...f.candidate, url: "http://loginom.example/" }
      const { validationId } = Schema.decodeUnknownSync(Loginom.Validation)(
        await host.request("connection.settings.check", candidate),
      )
      // Hold the knowledge startup for the new generation after validation completed.
      const entry = join(f.resources, "runtime/src/knowledge-entry.mjs")
      await rm(entry)
      await writeFile(entry, `
        import { existsSync } from 'node:fs';
        process.on('message', message => {
          if (message.operation === 'start') {
            const timer = setInterval(() => {
              if (!existsSync(${JSON.stringify(gate)})) return;
              clearInterval(timer);
              process.send({id:message.id,result:{protocol:1,generation:message.input.generation,started:true}});
            }, 10);
          }
          if (message.operation === 'list') process.send({id:message.id,result:{tools:[]}});
          if (message.operation === 'interrupt') process.send({id:message.id,result:{interrupted:true}});
          if (message.operation === 'close') process.send({id:message.id,result:{closed:true}},()=>process.disconnect());
        });
      `)
      expect(await host.request("connection.settings.save", { revision: 0, validationId }, 2000))
        .toMatchObject({ revision: 1, generation: 0, state: "starting" })
      const store = connectionStore(join(root, "connection"), cliCredentials(process.platform, { root, resources: f.resources }))
      expect(await store.pending()).toMatchObject({ revision: 1, url: candidate.url, username: candidate.username })
    } finally {
      await writeFile(gate, "")
      await host.close()
    }
  } finally {
    await f.close()
  }
}, 15_000)

test("aborting a settings check stops its browser without closing the node Host", async () => {
  const f = await fixture("", "shipped", true)
  try {
    const host = await launchNodeHost({
      node: process.env.LOGINOM_AI_AGENT_TEST_NODE!,
      entry: await buildNodeHost(f.root),
      root: join(f.root, "service"),
      resources: f.resources,
      headless: true,
    })
    const started = Promise.withResolvers<void>()
    const watcher = watch(join(f.marker, ".."), (_, name) => {
      if (name === "browser-validation") started.resolve()
    })
    const controller = new AbortController()
    const candidate = { ...f.candidate, url: "http://loginom.example/" }
    const checking = host.request("connection.settings.check", candidate, 30_000, controller.signal)
    try {
      await Promise.race([
        started.promise,
        checking.then(() => { throw Error("Expected a pending browser check") }),
      ])
      const { pid } = JSON.parse(await readFile(f.marker, "utf8"))
      controller.abort()
      await expect(checking).rejects.toMatchObject({ name: "AbortError" })
      const deadline = Date.now() + 5000
      while (runtimeAlive(pid) && Date.now() < deadline) await Bun.sleep(25)
      expect(runtimeAlive(pid)).toBe(false)
      expect(await host.request("connection.status", {})).toMatchObject({ revision: 0, generation: 0 })
    } finally {
      controller.abort()
      watcher.close()
      await host.close()
      await checking.catch(() => undefined)
    }
  } finally {
    await f.close()
  }
}, 15_000)

function runtimeAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
