import { expect, test } from "bun:test"
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { createLoginomHost } from "../src/host"
import { credentials } from "../src/connection/credentials"
import { connectionStore } from "../src/connection/connection-store"
import { knowledgeServer } from "../../loginom-runtime/client/test/support/knowledge-server.mjs"

async function fixture(error: string, options: Parameters<typeof knowledgeServer>[1] = {}) {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "connection-validation-"))
  const cleanup: (() => void | Promise<void>)[] = []
  const server = await knowledgeServer({ after: (callback) => cleanup.push(callback) }, options)
  const resources = join(directory, "resources")
  const root = join(directory, "profile")
  const marker = join(directory, "browser-validation")
  await mkdir(join(resources, "bin"), { recursive: true })
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await symlink(node, join(resources, "bin/node"))
  await symlink(
    fileURLToPath(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url)),
    join(resources, "runtime/src/knowledge-entry.mjs"),
  )
  // Only the browser boundary is controlled. Help uses the real entry, SDK and HTTP MCP.
  await writeFile(
    join(resources, "runtime/src/managed-entry.mjs"),
    `import {writeFileSync} from 'node:fs';
    process.on('disconnect', () => process.exit(0));
    process.on('message', message => {
      if (message.operation === 'start') {
        writeFileSync(${JSON.stringify(marker)}, JSON.stringify({validation:message.input.validation,pid:process.pid}));
        process.send(${JSON.stringify(error)} ? {id:message.id,error:${JSON.stringify(error)}}
          : {id:message.id,result:{protocol:1,generation:message.input.generation,checked:true,ready:true,chat:message.input.chat}});
      }
      if (message.operation === 'close') process.send({id:message.id,result:{closed:true}},()=>process.disconnect());
    });`,
  )
  await writeFile(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: server.endpoint }))
  const host = await createLoginomHost({ root, resources, codec: credentials("linux"), environment: {} })
  return {
    host,
    server,
    root,
    resources,
    marker,
    candidate: {
      revision: 0,
      url: "http://unavailable.example/app/?custom=1",
      username: "user",
      apiKey: { operation: "replace" as const, value: "UNIT-NONSECRET" },
      password: { operation: "replace" as const, value: "PRIVATE-NONSECRET-PASSWORD" },
    },
    async close() {
      await host.close()
      for (const callback of cleanup) await callback()
      await rm(directory, { recursive: true, force: true })
    },
  }
}

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
      expect(f.server.requests.length).toBeGreaterThan(0)
      expect(f.server.requests.every((request) => request.authorization === "Bearer UNIT-NONSECRET")).toBe(true)
      await f.host.api.save({ validationId: validation.validationId, revision: 0 })
      await f.host.settled()
      await f.host.catalog(1)
      expect(await f.host.api.status()).toMatchObject({
        generation: 1,
        state: "ready",
        hasApiKey: true,
        browser: { state: "failed", failure },
      })
      expect((await f.host.api.status()).failure).toBeUndefined()
      expect(await connectionStore(join(f.root, "connection"), credentials("linux")).read()).toMatchObject({
        url: f.candidate.url,
        apiKey: f.candidate.apiKey.value,
        password: f.candidate.password.value,
      })
      expect(
        await f.host.knowledge(1).request("call", {
          run: "docs",
          id: "help",
          name: "read",
          arguments: { uri: "Help/node.md" },
        }),
      ).toMatchObject({ content: [{ type: "text", text: expect.stringContaining("Help/node.md") }] })
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

test("browser validation starts only after the real Help catalog is complete", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const f = await fixture("", {
    list: async () => {
      entered.resolve()
      await release.promise
      return { tools: f.server.tools }
    },
  })
  const checking = f.host.api.check(f.candidate)
  void checking.catch(() => {})
  try {
    await entered.promise
    await expect(access(f.marker)).rejects.toMatchObject({ code: "ENOENT" })
    release.resolve()
    expect((await checking).browser).toEqual({ state: "verified" })
    expect(await f.host.api.status()).toMatchObject({ state: "unconfigured", browser: { state: "unknown" } })
  } finally {
    release.resolve()
    await checking.catch(() => {})
    await f.close()
  }
}, 15_000)

test("a failed Help service cannot start browser validation", async () => {
  const f = await fixture("LOGINOM_LOGIN_UNAVAILABLE", {
    initialize: () => {
      throw Error("REMOTE-PRIVATE-TEXT")
    },
  })
  try {
    await expect(f.host.api.check(f.candidate)).rejects.toThrow("LOGINOM_KNOWLEDGE_UNAVAILABLE")
    await expect(access(f.marker)).rejects.toMatchObject({ code: "ENOENT" })
    expect((await f.host.api.status()).hasApiKey).toBe(false)
  } finally {
    await f.close()
  }
}, 15_000)

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

test("invalid Help key cannot start browser validation or produce a save token", async () => {
  const f = await fixture("LOGINOM_LOGIN_UNAVAILABLE")
  try {
    await expect(
      f.host.api.check({
        ...f.candidate,
        apiKey: { operation: "replace", value: "WRONG-NONSECRET" },
      }),
    ).rejects.toThrow("LOGINOM_KNOWLEDGE_AUTH_FAILED")
    await expect(access(f.marker)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await f.host.api.status()).toMatchObject({ state: "unconfigured", generation: 0, hasApiKey: false })
    await expect(f.host.api.save({ revision: 0, validationId: "never-issued" })).rejects.toThrow(
      "LOGINOM_VALIDATION_EXPIRED",
    )
    expect(await connectionStore(join(f.root, "connection"), credentials("linux")).read()).toBeUndefined()
  } finally {
    await f.close()
  }
}, 15_000)

test("Host shutdown cancels the pending Help validation before any browser check", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const f = await fixture("", {
    list: async () => {
      entered.resolve()
      await release.promise
      return { tools: f.server.tools }
    },
  })
  const checking = f.host.api.check(f.candidate)
  void checking.catch(() => {})
  const deadline: { timer?: ReturnType<typeof setTimeout> } = {}
  try {
    await entered.promise
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
    release.resolve()
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
