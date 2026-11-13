import { afterAll, beforeAll, expect, test } from "bun:test"
import { fork } from "node:child_process"
import { randomUUID } from "node:crypto"
import { once } from "node:events"
import { request } from "node:http"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { environmentProxy } from "../../desktop/test/loginom/environment-proxy"
import { superviseKnowledge, runtimeEnvironment } from "../src/supervisor"
import { knowledgeServer } from "../../loginom-runtime/client/test/support/knowledge-server.mjs"
import { resolveSystemProxy } from "../src/system-proxy"

const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
const fixture = { directory: "", caller: "", helpEntry: "" }
beforeAll(async () => {
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  fixture.directory = await mkdtemp(join(tmpdir(), "cloud-native-proxy-"))
  const entry = join(fixture.directory, "caller.ts")
  await writeFile(
    entry,
    `
    import { createCloudAuth } from ${JSON.stringify(join(import.meta.dir, "../src/cloud-auth.ts"))};
    if (process.env.OPENAI_API_KEY || process.env.LOGINOM_AI_AGENT_SERVER_PASSWORD) throw Error('CREDENTIAL_LEAK');
    const { createLoginomHost } = await import(${JSON.stringify(join(import.meta.dir, "../src/host.ts"))});
    const { credentials } = await import(${JSON.stringify(join(import.meta.dir, "../src/connection/credentials.ts"))});
    const local = await createLoginomHost({ root: process.argv[3], resources: process.argv[3], codec: credentials('linux'), environment: {} });
    await local.settled();
    if ((await local.api.status()).state !== 'unconfigured') throw Error('LOCAL_ADMISSION_FAILED');
    const site = process.argv[2];
    const operation = process.argv[4];
    const auth = await createCloudAuth({
      endpoints: { site, primary: site, reserve: site },
      store: { async read() {
        if (operation !== 'start') return { kind: 'loginom-cloud-v1', installationKey: 'fixture-installation',
          email: 'fixture@example.test', dock: { primary: { apiKey: 'fixture-primary' }, reserve: { apiKey: 'fixture-reserve' } } };
      }, async write() {}, async clear() {} }, changed() {},
    });
    try {
      if (operation === 'disconnect') {
        await auth.disconnect(); console.log(JSON.stringify({ disconnected: !auth.status().connected, failure: auth.status().failure }));
      } else if (operation === 'refresh') {
        await auth.refresh({ deadline: Date.now() + 5000, signal: new AbortController().signal });
        console.log(JSON.stringify({ refreshed: true }));
      } else { await auth.start(); console.log(JSON.stringify({ started: !!auth.status().pending })); }
    }
    catch (error) { console.log(JSON.stringify({ error: error.message })); }
    finally { await auth.close(); await local.close(); process.disconnect(); }
  `,
  )
  const result = await Bun.build({
    entrypoints: [entry],
    outdir: fixture.directory,
    target: "node",
    naming: "caller.mjs",
  })
  if (!result.success) throw new AggregateError(result.logs, "CALLER_BUILD_FAILED")
  fixture.caller = join(fixture.directory, "caller.mjs")
  fixture.helpEntry = join(fixture.directory, "help-entry.mjs")
  await writeFile(
    fixture.helpEntry,
    `
    if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.LOGINOM_AI_AGENT_SERVER_PASSWORD)
      throw Error('CREDENTIAL_LEAK');
    await import(${JSON.stringify(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url).href)});
  `,
  )
})
afterAll(async () => {
  if (fixture.directory) await rm(fixture.directory, { recursive: true, force: true })
})

async function call(site: string, environment: NodeJS.ProcessEnv, operation = "start") {
  const child = fork(fixture.caller, [site, join(fixture.directory, randomUUID()), operation], {
    execPath: node!,
    execArgv: ["--use-system-ca"],
    env: runtimeEnvironment({
      ...environment,
      OPENAI_API_KEY: "fixture-provider",
      LOGINOM_AI_AGENT_SERVER_PASSWORD: "fixture-password",
    }),
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    timeout: 20_000,
  })
  const output: Buffer[] = []
  const errors: Buffer[] = []
  child.stdout!.on("data", (chunk) => output.push(chunk))
  child.stderr!.on("data", (chunk) => errors.push(chunk))
  const result = await once(child, "exit")
  expect({ result, stderr: Buffer.concat(errors).toString() }).toEqual({ result: [0, null], stderr: "" })
  return JSON.parse(Buffer.concat(output).toString())
}

async function siteFixture() {
  return environmentProxy((req, res) => {
    res.setHeader("content-type", "application/json")
    res.end(
      JSON.stringify({
        device_code: "fixture-device",
        user_code: "ABCD-EFGH",
        verification_uri_complete: `${"encrypted" in req.socket && req.socket.encrypted ? "https" : "http"}://${req.headers.host}/device`,
        expires_in: 600,
        interval: 600,
      }),
    )
  })
}

test("native CloudAuth first device/code request uses explicit proxy without opt-in flag", async () => {
  const route = await siteFixture()
  try {
    expect(
      await call(`http://127.0.0.1:${route.port(route.httpTarget)}`, {
        HTTP_PROXY: `http://127.0.0.1:${route.port(route.proxy)}`,
      }),
    ).toEqual({ started: true })
    expect(route.proxyRequests).toContain("/api/auth/device/code")
    expect(route.targetRequests).toEqual(["/api/auth/device/code"])
    expect(route.directTargetRequests).toBe(0)
  } finally {
    await route.close()
  }
}, 30_000)

test("NO_PROXY permits direct loopback CloudAuth despite explicit proxy", async () => {
  const route = await siteFixture()
  try {
    expect(
      await call(`http://127.0.0.1:${route.port(route.httpTarget)}`, {
        HTTP_PROXY: `http://127.0.0.1:${route.port(route.proxy)}`,
        NO_PROXY: "127.0.0.1",
      }),
    ).toEqual({ started: true })
    expect(route.proxyRequests).toEqual([])
    expect(route.directTargetRequests).toBe(1)
    expect(route.targetRequests).toEqual(["/api/auth/device/code"])
  } finally {
    await route.close()
  }
}, 30_000)

test("unavailable explicit proxy fails CloudAuth temporarily without reaching target", async () => {
  const route = await siteFixture()
  try {
    expect(
      await call(`http://127.0.0.1:${route.port(route.httpTarget)}`, {
        HTTP_PROXY: "http://127.0.0.1:1",
      }),
    ).toEqual({ error: "LOGINOM_CLOUD_UNAVAILABLE" })
    expect(route.targetRequests).toEqual([])
    expect(route.directTargetRequests).toBe(0)
  } finally {
    await route.close()
  }
}, 30_000)

test("without explicit env CloudAuth is direct even with a configured OS proxy fixture", async () => {
  const route = await siteFixture()
  try {
    const environment = {}
    const system = await resolveSystemProxy({
      platform: "win32",
      environment,
      windows: { autoDetect: false, autoConfigUrl: "", proxy: `127.0.0.1:${route.port(route.proxy)}`, bypass: "" },
    })
    expect(system.state).toBe("applied")
    expect(await call(`http://127.0.0.1:${route.port(route.httpTarget)}`, environment)).toEqual({ started: true })
    expect(route.proxyRequests).toEqual([])
    expect(route.directTargetRequests).toBe(1)
  } finally {
    await route.close()
  }
}, 30_000)

test("CloudAuth redirect error never reaches the second origin", async () => {
  const second = await siteFixture()
  const route = await environmentProxy((_req, res) => {
    res.writeHead(302, { location: `http://127.0.0.1:${second.port(second.httpTarget)}/redirected` })
    res.end()
  })
  try {
    expect(
      await call(`http://127.0.0.1:${route.port(route.httpTarget)}`, {
        HTTP_PROXY: `http://127.0.0.1:${route.port(route.proxy)}`,
      }),
    ).toEqual({ error: "LOGINOM_CLOUD_UNAVAILABLE" })
    expect(route.proxyRequests).toEqual(["/api/auth/device/code"])
    expect(route.directTargetRequests).toBe(0)
    expect(second.targetRequests).toEqual([])
  } finally {
    await route.close()
    await second.close()
  }
}, 30_000)

async function helpCatalog(
  route: Awaited<ReturnType<typeof environmentProxy>>,
  environment: NodeJS.ProcessEnv,
  redirect?: string,
) {
  const cleanup: (() => void | Promise<void>)[] = []
  const server = await knowledgeServer(
    { after: (callback: () => Promise<void>) => cleanup.push(callback) },
    {
      request: async (
        _body: unknown,
        request: import("node:http").IncomingMessage,
        response: import("node:http").ServerResponse,
      ) => {
        route.observe(request)
        if (!redirect) return false
        response.writeHead(302, { location: redirect })
        response.end()
        return true
      },
    },
  )
  try {
    const runtime = await superviseKnowledge({
      node: node!,
      entry: fixture.helpEntry,
      stateDir: join(route.directory, "help"),
      generation: 1,
      endpoint: server.endpoint,
      apiKey: "UNIT-NONSECRET",
      environment,
      deadline: Date.now() + 5000,
    })
    expect(runtime.ready).toMatchObject({ started: true })
    try {
      return await runtime.request("list", undefined, 5000)
    } finally {
      await runtime.close()
    }
  } finally {
    for (const close of cleanup) await close()
  }
}

test("NO_PROXY permits direct loopback Help initialize/list", async () => {
  const route = await environmentProxy()
  try {
    const result = await helpCatalog(route, {
      HTTP_PROXY: `http://127.0.0.1:${route.port(route.proxy)}`,
      NO_PROXY: "127.0.0.1",
    })
    expect(result).toMatchObject({ tools: expect.arrayContaining([expect.objectContaining({ name: "read" })]) })
    expect(route.targetRequests.length).toBeGreaterThanOrEqual(3)
    expect(route.directTargetRequests).toBe(route.targetRequests.length)
    expect(route.proxyRequests).toEqual([])
  } finally {
    await route.close()
  }
}, 30_000)

test("unavailable explicit proxy fails Help temporarily without reaching target", async () => {
  const route = await environmentProxy()
  try {
    await expect(helpCatalog(route, { HTTP_PROXY: "http://127.0.0.1:1" })).rejects.toMatchObject({
      message: "LOGINOM_KNOWLEDGE_UNAVAILABLE",
      knowledgeFailure: { kind: "unavailable" },
    })
    expect(route.targetRequests).toEqual([])
    expect(route.directTargetRequests).toBe(0)
  } finally {
    await route.close()
  }
}, 30_000)

test("without explicit env Help is direct despite configured OS/PAC fixture", async () => {
  const route = await environmentProxy()
  try {
    const environment = {}
    const system = await resolveSystemProxy({
      platform: "linux",
      environment,
      read: async () => ({}),
      chromium: [
        { url: "https://auth.openai.com/oauth/token", resolution: `PROXY 127.0.0.1:${route.port(route.proxy)}` },
      ],
    })
    expect(system.state).toBe("applied")
    expect(await helpCatalog(route, environment)).toMatchObject({ tools: expect.any(Array) })
    expect(route.targetRequests.length).toBeGreaterThanOrEqual(3)
    expect(route.directTargetRequests).toBe(route.targetRequests.length)
    expect(route.proxyRequests).toEqual([])
  } finally {
    await route.close()
  }
}, 30_000)

test("Help credential-bearing redirect never reaches the second origin", async () => {
  const route = await environmentProxy()
  const second = await environmentProxy()
  try {
    await expect(
      helpCatalog(
        route,
        { HTTP_PROXY: `http://127.0.0.1:${route.port(route.proxy)}` },
        `http://127.0.0.1:${second.port(second.httpTarget)}/redirected`,
      ),
    ).rejects.toMatchObject({ message: "LOGINOM_KNOWLEDGE_UNAVAILABLE" })
    expect(route.proxyRequests).toEqual(["/mcp"])
    expect(route.directTargetRequests).toBe(0)
    expect(second.targetRequests).toEqual([])
  } finally {
    await route.close()
    await second.close()
  }
}, 30_000)

test("native CloudAuth TLS passes CONNECT with a local test CA", async () => {
  const route = await siteFixture()
  try {
    expect(
      await call(`https://127.0.0.1:${route.port(route.target)}`, {
        ALL_PROXY: "http://127.0.0.1:1",
        HTTPS_PROXY: `http://127.0.0.1:${route.port(route.tlsProxy)}`,
        NODE_EXTRA_CA_CERTS: route.cert,
      }),
    ).toEqual({ started: true })
    expect(route.proxyRequests).toEqual(["/api/auth/device/code"])
    expect(route.tunnels).toContain(`127.0.0.1:${route.port(route.target)}`)
    expect(route.directTargetRequests).toBe(0)
  } finally {
    await route.close()
  }
}, 30_000)

test("real Help TLS initialize/list passes CONNECT with a local test CA", async () => {
  const cleanup: (() => void | Promise<void>)[] = []
  const server = await knowledgeServer({ after: (callback: () => Promise<void>) => cleanup.push(callback) })
  const route = await environmentProxy((req, res) => {
    const relay = request(server.endpoint, { method: req.method, headers: req.headers }, (upstream) => {
      res.writeHead(upstream.statusCode!, upstream.headers)
      upstream.pipe(res)
    })
    relay.on("error", () => {
      res.writeHead(502)
      res.end()
    })
    req.pipe(relay)
  })
  const runtime = await superviseKnowledge({
    node: node!,
    entry: join(import.meta.dir, "../../loginom-runtime/src/knowledge-entry.mjs"),
    stateDir: join(route.directory, "help"),
    generation: 1,
    endpoint: `https://127.0.0.1:${route.port(route.target)}/mcp`,
    apiKey: "UNIT-NONSECRET",
    environment: { HTTPS_PROXY: `http://127.0.0.1:${route.port(route.tlsProxy)}`, NODE_EXTRA_CA_CERTS: route.cert },
    deadline: Date.now() + 5000,
  })
  try {
    expect(await runtime.request("list", undefined, 5000)).toMatchObject({ tools: expect.any(Array) })
    expect(route.proxyRequests).toContain("/mcp")
    expect(route.targetRequests.length).toBeGreaterThanOrEqual(3)
    expect(route.directTargetRequests).toBe(0)
    expect(route.tunnels).toContain(`127.0.0.1:${route.port(route.target)}`)
  } finally {
    await runtime.close()
    for (const close of cleanup) await close()
    await route.close()
  }
}, 30_000)

test("actual Help child inherits proxy but no model/provider credentials", async () => {
  const route = await environmentProxy()
  try {
    expect(
      await helpCatalog(route, {
        HTTP_PROXY: `http://127.0.0.1:${route.port(route.proxy)}`,
        OPENAI_API_KEY: "fixture-provider",
        ANTHROPIC_API_KEY: "fixture-provider",
        LOGINOM_AI_AGENT_SERVER_PASSWORD: "fixture-password",
      }),
    ).toMatchObject({ tools: expect.any(Array) })
    expect(route.proxyRequests).toContain("/mcp")
    expect(route.directTargetRequests).toBe(0)
  } finally {
    await route.close()
  }
}, 30_000)

test("invalid explicit proxy preserves local Host startup but safely rejects site requests", async () => {
  const route = await siteFixture()
  try {
    expect(
      await call(`http://127.0.0.1:${route.port(route.httpTarget)}`, {
        HTTP_PROXY: "invalid-proxy-configuration",
      }),
    ).toEqual({ error: "LOGINOM_CLOUD_UNAVAILABLE" })
    expect(route.targetRequests).toEqual([])
    expect(route.directTargetRequests).toBe(0)
  } finally {
    await route.close()
  }
}, 30_000)

test("invalid explicit proxy admits Help locally then safely rejects list and closes", async () => {
  const route = await environmentProxy()
  try {
    await expect(helpCatalog(route, { HTTP_PROXY: "invalid-proxy-configuration" })).rejects.toMatchObject({
      message: "LOGINOM_KNOWLEDGE_UNAVAILABLE",
      knowledgeFailure: { kind: "unavailable" },
    })
    expect(route.targetRequests).toEqual([])
    expect(route.directTargetRequests).toBe(0)
    const diagnostics = await Bun.file(join(route.directory, "help/startup-failures.jsonl")).text()
    expect(diagnostics).not.toContain("invalid-proxy-configuration")
  } finally {
    await route.close()
  }
}, 30_000)

test("invalid native proxy prevents DELETE but still disconnects locally", async () => {
  const route = await siteFixture()
  try {
    expect(
      await call(
        `http://127.0.0.1:${route.port(route.httpTarget)}`,
        { HTTP_PROXY: "invalid-proxy-configuration" },
        "disconnect",
      ),
    ).toEqual({ disconnected: true, failure: "LOGINOM_CLOUD_REVOKE_UNCONFIRMED" })
    expect(route.targetRequests).toEqual([])
  } finally {
    await route.close()
  }
}, 30_000)

test("invalid native proxy prevents restored credentials refresh without direct fallback", async () => {
  const route = await siteFixture()
  try {
    expect(
      await call(
        `http://127.0.0.1:${route.port(route.httpTarget)}`,
        { HTTP_PROXY: "invalid-proxy-configuration" },
        "refresh",
      ),
    ).toEqual({ error: "LOGINOM_CLOUD_UNAVAILABLE" })
    expect(route.targetRequests).toEqual([])
  } finally {
    await route.close()
  }
}, 30_000)

test("native CloudAuth honors lowercase explicit proxy precedence", async () => {
  const route = await siteFixture()
  try {
    expect(
      await call(`http://127.0.0.1:${route.port(route.httpTarget)}`, {
        ALL_PROXY: "http://127.0.0.1:1",
        HTTP_PROXY: "http://127.0.0.1:1",
        http_proxy: `http://127.0.0.1:${route.port(route.proxy)}`,
      }),
    ).toEqual({ started: true })
    expect(route.proxyRequests).toContain("/api/auth/device/code")
    expect(route.directTargetRequests).toBe(0)
  } finally {
    await route.close()
  }
}, 30_000)

test("native CloudAuth ALL_PROXY-only route never silently reaches target directly", async () => {
  const route = await siteFixture()
  try {
    expect(
      await call(`http://127.0.0.1:${route.port(route.httpTarget)}`, {
        ALL_PROXY: `http://127.0.0.1:${route.port(route.proxy)}`,
      }),
    ).toEqual({ started: true })
    expect(route.proxyRequests).toContain("/api/auth/device/code")
    expect(route.directTargetRequests).toBe(0)
  } finally {
    await route.close()
  }
}, 30_000)

test("real Help ALL_PROXY-only initializes/lists through proxy with no direct target request", async () => {
  const route = await environmentProxy()
  try {
    expect(
      await helpCatalog(route, {
        ALL_PROXY: "http://127.0.0.1:1",
        all_proxy: `http://127.0.0.1:${route.port(route.proxy)}`,
      }),
    ).toMatchObject({ tools: expect.any(Array) })
    expect(route.proxyRequests).toContain("/mcp")
    expect(route.directTargetRequests).toBe(0)
  } finally {
    await route.close()
  }
}, 30_000)

test("dead ALL_PROXY fails CloudAuth temporarily with target count zero", async () => {
  const route = await siteFixture()
  try {
    expect(await call(`http://127.0.0.1:${route.port(route.httpTarget)}`, { ALL_PROXY: "http://127.0.0.1:1" })).toEqual(
      { error: "LOGINOM_CLOUD_UNAVAILABLE" },
    )
    expect(route.targetRequests).toEqual([])
  } finally {
    await route.close()
  }
}, 30_000)

test("dead ALL_PROXY fails Help temporarily with target count zero", async () => {
  const route = await environmentProxy()
  try {
    await expect(helpCatalog(route, { ALL_PROXY: "http://127.0.0.1:1" })).rejects.toMatchObject({
      message: "LOGINOM_KNOWLEDGE_UNAVAILABLE",
      knowledgeFailure: { kind: "unavailable" },
    })
    expect(route.targetRequests).toEqual([])
  } finally {
    await route.close()
  }
}, 30_000)

test("unsupported ALL_PROXY scheme never makes CloudAuth fall back to direct", async () => {
  const route = await siteFixture()
  try {
    expect(await call(`http://127.0.0.1:${route.port(route.httpTarget)}`, { ALL_PROXY: "ftp://127.0.0.1:1" })).toEqual({
      error: "LOGINOM_CLOUD_UNAVAILABLE",
    })
    expect(route.targetRequests).toEqual([])
  } finally {
    await route.close()
  }
}, 30_000)

test("unsupported ALL_PROXY scheme never makes Help fall back to direct", async () => {
  const route = await environmentProxy()
  try {
    await expect(helpCatalog(route, { ALL_PROXY: "ftp://127.0.0.1:1" })).rejects.toMatchObject({
      message: "LOGINOM_KNOWLEDGE_UNAVAILABLE",
      knowledgeFailure: { kind: "unavailable" },
    })
    expect(route.targetRequests).toEqual([])
  } finally {
    await route.close()
  }
}, 30_000)
