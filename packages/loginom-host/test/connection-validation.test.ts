import { expect, test } from "bun:test"
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { watch } from "node:fs"
import { createLoginomHost } from "../src/host"
import { credentials } from "../src/connection/credentials"
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
    `import {writeFileSync} from 'node:fs';
    let starting;
    function ready() {
      process.send(${JSON.stringify(error)} ? {id:starting.id,error:${JSON.stringify(error)}}
        : {id:starting.id,result:{protocol:1,generation:starting.input.generation,checked:true,ready:true,chat:starting.input.chat}});
    }
    process.on('SIGUSR1', ready);
    process.on('disconnect', () => process.exit(0));
    process.on('message', message => {
      if (message.operation === 'start') {
        starting = message;
        writeFileSync(${JSON.stringify(marker)}, JSON.stringify({validation:message.input.validation,pid:process.pid}));
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
