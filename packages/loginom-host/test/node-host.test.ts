import { afterAll, beforeAll, expect, test } from "bun:test"
import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { EventEmitter, once } from "node:events"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { buildKeychain } from "../script/build-keychain"
import { launchNodeHost, NodeHostStartupError } from "../src/node-client"
import { nodeManagement } from "../src/node-management"
import { createLoginomHost } from "../src/host"
import { loginomHostPort } from "../src/host-port"
import { transport } from "../src/transport"
import { credentials } from "../src/connection/credentials"
import { connectionStore } from "../src/connection/connection-store"
import { cliCredentials } from "../src/connection/cli-credentials"
import { knowledgeServer } from "../../loginom-runtime/client/test/support/knowledge-server.mjs"

const fixture = { directory: "", entry: "", node: process.env.LOGINOM_AI_AGENT_TEST_NODE ?? "" }
beforeAll(async () => {
  if (!fixture.node) throw new Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  fixture.directory = await mkdtemp(join(tmpdir(), "loginom-node-host-"))
  // Match connection-validation: isolate Bun's build cache from this test runner.
  const builder = Bun.spawn([process.execPath, join(import.meta.dir, "../script/build-node-host.ts"), fixture.directory], {
    stdout: "pipe", stderr: "pipe",
  })
  const [code, output, errors] = await Promise.all([builder.exited,
    new Response(builder.stdout).text(), new Response(builder.stderr).text()])
  expect({ code, output, errors }).toEqual({ code: 0, output: "", errors: "" })
  fixture.entry = join(fixture.directory, "node-host.mjs")
})
afterAll(async () => {
  if (fixture.directory) await rm(fixture.directory, { recursive: true, force: true })
})

test.each(["rejected", "invalid"])(
  "failed host startup confirms cleanup and exit before rejecting: %s",
  async (mode) => {
    const marker = join(fixture.directory, "startup-" + mode)
    const entry = marker + ".mjs"
    await writeFile(
      entry,
      `import {writeFileSync} from 'node:fs';
      process.on('SIGTERM', () => {});
      process.on('message', m => {
        if (m.method === 'start') {
          writeFileSync(${JSON.stringify(marker)}, String(process.pid));
          process.send({id:m.id,${mode === "rejected" ? "error:'LOGINOM_HANDSHAKE_INVALID'" : "result:{protocol:1,ready:false,pid:process.pid}"}});
        }
        if (m.method === 'close') process.send({id:m.id,result:{closed:true}},()=>process.exit(0));
      });`,
    )
    try {
      const error = await launchNodeHost({
        node: fixture.node,
        entry,
        root: fixture.directory,
        resources: fixture.directory,
        headless: true,
      }).catch((error: unknown) => error)
      expect(error).toMatchObject({ message: "LOGINOM_HANDSHAKE_INVALID", cleanupConfirmed: true })
      const pid = Number(await readFile(marker, "utf8"))
      expect(() => process.kill(pid, 0)).toThrow()
    } finally {
      const pid = Number(await readFile(marker, "utf8"))
      try {
        process.kill(pid, "SIGKILL")
      } catch {}
    }
  },
  15_000,
)

test("a failed host constructor is closed without masking its startup error", async () => {
  const root = join(fixture.directory, "not-a-directory")
  await writeFile(root, "blocked")
  await expect(
    launchNodeHost({ node: fixture.node, entry: fixture.entry, root, resources: fixture.directory, headless: true }),
  ).rejects.toMatchObject({
    message: "LOGINOM_HOST_REQUEST_FAILED",
    cleanupConfirmed: true,
  })
})

test("an executable that could not spawn needs no cleanup acknowledgement", async () => {
  await expect(
    launchNodeHost({
      node: join(fixture.directory, "missing-node"),
      entry: fixture.entry,
      root: fixture.directory,
      resources: fixture.directory,
      headless: true,
    }),
  ).rejects.toMatchObject({ cleanupConfirmed: true })
})

test("bundled Node host handshakes without Electron, manages its profile and closes completely", async () => {
  const host = await launchNodeHost({
    node: fixture.node,
    entry: fixture.entry,
    root: join(fixture.directory, "profile"),
    resources: join(fixture.directory, "absent-runtime"),
    headless: true,
    environment: { ...process.env, OPENAI_API_KEY: "must-not-be-forwarded" },
  })
  try {
    expect(host.alive).toBe(true)
    expect(await host.request("connection.status", {})).toMatchObject({ state: "unconfigured", generation: 0 })
    const error = await host
      .request("connection.check", { apiKey: "private-sentinel" })
      .catch((error: Error) => error.message)
    expect(error).not.toContain("private-sentinel")
    expect(error).toBe("LOGINOM_CANDIDATE_INVALID")
    expect(await host.request("acquire", { run: "test", session: "chat" })).toEqual({ generation: 0 })
    expect(await host.request("release", { run: "test" })).toBe(true)
  } finally {
    await host.close()
  }
  expect(host.alive).toBe(false)
  expect(await host.exited).toEqual({ code: 0, signal: null })
  await expect(host.request("connection.status", {})).rejects.toThrow("LOGINOM_HOST_CLOSED")
}, 15_000)

test.each(["connection.cloud-cancel", "connection.cloud-disconnect"])(
  "bundled Node host returns a redacted disconnected view for %s",
  async (method) => {
    const host = await launchNodeHost({
      node: fixture.node,
      entry: fixture.entry,
      root: join(fixture.directory, method),
      resources: join(fixture.directory, "absent-runtime"),
      headless: true,
      environment: {},
    })
    try {
      const before = await host.request("connection.status", {})
      for (const input of [undefined, null, [], { verifyBrowser: false }, { endpoint: "http://127.0.0.1:1" }])
        await expect(host.request(method, input)).rejects.toThrow("LOGINOM_INPUT_INVALID")
      expect(await host.request(method, {})).toEqual(before)
      expect(before).toMatchObject({ state: "unconfigured", generation: 0, cloud: { connected: false } })
      expect(before).not.toHaveProperty("cloud.pending")
    } finally {
      await host.close()
    }
    expect(await host.exited).toEqual({ code: 0, signal: null })
  },
  15_000,
)

test("private cloud start returns only pending login and status/cancel do not call the site", async () => {
  const calls: string[] = []
  const canaries = ["DEVICE-CANARY", "SESSION-CANARY", "INSTALLATION-CANARY", "PRIMARY-CANARY", "RESERVE-CANARY"]
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request): Response {
      calls.push(new URL(request.url).pathname)
      if (new URL(request.url).pathname !== "/api/auth/device/code") return new Response(null, { status: 500 })
      return Response.json({
        device_code: canaries[0], user_code: "ABCD-EFGH",
        verification_uri_complete: `${server.url.origin}/device?user_code=ABCD-EFGH`,
        expires_in: 600, interval: 600,
        access_token: canaries[1], installationKey: canaries[2],
        dock: { primary: { apiKey: canaries[3] }, reserve: { apiKey: canaries[4] } },
      })
    },
  })
  const host = await createLoginomHost({
    root: join(fixture.directory, "cloud-management"), resources: join(fixture.directory, "absent-runtime"),
    codec: credentials("linux"), environment: {}, headless: true,
    cloudEndpoints: { site: server.url.origin, primary: `${server.url}primary`, reserve: `${server.url}reserve` },
  })
  const lifecycle = { stopped: Promise.withResolvers<void>(), closed: false }
  const manage = (method: string, input: unknown) => nodeManagement(method, input, host, {
    stopped: lifecycle.stopped.promise, closed: () => lifecycle.closed,
  })
  const requests = new EventEmitter()
  const replies = new EventEmitter()
  const port = loginomHostPort({
    postMessage: value => replies.emit("message", { data: value }), on: requests.on.bind(requests), start() {},
  }, host)
  const client = transport({
    postMessage: value => requests.emit("message", { data: value }), on: replies.on.bind(replies), start() {},
  })
  try {
    for (const method of ["connection.cloud-start", "connection.cloud-cancel", "connection.cloud-disconnect"]) {
      for (const input of [undefined, null, [], [{}], "", 0, true, { endpoint: server.url.origin },
        { device_code: canaries[0] }, { verifyBrowser: false }]) {
        await expect(manage(method, input)).rejects.toThrow("LOGINOM_INPUT_INVALID")
      }
    }
    expect(calls).toEqual([])
    await expect(manage("connection.cloud-start-extra", {})).rejects.toThrow("LOGINOM_METHOD_INVALID")
    expect(await manage("connection.check", {
      revision: 0, url: "https://example.test/app/", username: "fixture", password: { operation: "empty" },
      verifyBrowser: false,
    })).toMatchObject({ help: { state: "connection-required" } })
    expect(calls).toEqual([])
    const before = Date.now()
    const start = await manage("connection.cloud-start", {})
    if (!("cloud" in start)) throw new Error("Expected connection view")
    expect(start.cloud).toEqual({ connected: false, pending: {
      userCode: "ABCD-EFGH", verificationUrl: `${server.url.origin}/device?user_code=ABCD-EFGH`,
      expiresAt: expect.any(Number),
    } })
    expect(start.cloud.pending!.expiresAt).toBeGreaterThanOrEqual(before + 600_000)
    expect(await manage("connection.status", {})).toEqual(start)
    await client.request("acquire", { run: "cloud", session: "chat" })
    expect(await client.request("tools", { run: "cloud" })).toEqual({ tools: [expect.objectContaining({ name: "dock_diagnostics" })] })
    const diagnostic = await client.request("call", {
      run: "cloud", name: "dock_diagnostics", args: {}, userMessage: "original",
    }) as { structuredContent: Record<string, unknown>; content: { text: string }[] }
    expect(Object.keys(diagnostic.structuredContent).sort()).toEqual([
      "revision", "generation", "url", "username", "folder", "hasPassword", "state", "browser", "failure", "recoveries",
      "mode", "server", "help",
    ].sort())
    expect(JSON.parse(diagnostic.content[0]!.text)).toEqual(diagnostic.structuredContent)
    expect(JSON.stringify(diagnostic)).not.toContain("ABCD-EFGH")
    expect(JSON.stringify(diagnostic)).not.toContain(server.url.origin)
    expect(calls).toEqual(["/api/auth/device/code"])
    const cancel = await manage("connection.cloud-cancel", {})
    expect("cloud" in cancel ? cancel.cloud : undefined).toEqual({ connected: false })
    expect(await manage("connection.cloud-disconnect", {})).toEqual(cancel)
    expect(calls).toEqual(["/api/auth/device/code"])
    for (const canary of canaries) expect(JSON.stringify([start, cancel])).not.toContain(canary)
  } finally {
    lifecycle.closed = true
    lifecycle.stopped.resolve()
    client.close()
    await port.close()
    await host.close()
    server.stop(true)
  }
}, 15_000)

test("host startup permits readiness after 30 seconds and still closes completely", async () => {
  const entry = join(fixture.directory, "slow-start.mjs")
  await writeFile(
    entry,
    `
    process.on('message', message => {
      if (message.method === 'start') setTimeout(() => process.send({
        id: message.id, result: { protocol: 1, ready: true, pid: process.pid }
      }), 31_000);
      if (message.method === 'close') process.send({
        id: message.id, result: { closed: true }
      }, () => process.disconnect());
    });
  `,
  )
  const host = await launchNodeHost({
    node: fixture.node,
    entry,
    root: fixture.directory,
    resources: fixture.directory,
    headless: true,
  })
  try {
    expect(host.alive).toBe(true)
  } finally {
    await host.close()
  }
  expect(await host.exited).toEqual({ code: 0, signal: null })
}, 40_000)

test("a non-boolean recovery mode is rejected before the host starts", async () => {
  const failure = await launchNodeHost({
    node: fixture.node,
    entry: fixture.entry,
    root: join(fixture.directory, "bad-recovery"),
    resources: join(fixture.directory, "absent-runtime"),
    headless: true,
    strictRecovery: "yes" as unknown as boolean,
  }).catch((error: unknown) => error)
  expect(failure).toMatchObject({ message: "LOGINOM_HANDSHAKE_INVALID", cleanupConfirmed: true })
  expect(failure).toHaveProperty("cause", expect.objectContaining({ message: "LOGINOM_HANDSHAKE_INVALID" }))
}, 15_000)

test.each(["ready", "close"])(
  "private Help preflight waits for the catalog or cancels on shutdown: %s",
  async (mode) => {
    const cleanup: (() => void | Promise<void>)[] = []
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
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
    const resources = join(fixture.directory, "knowledge-resources-" + mode)
    const root = join(fixture.directory, "knowledge-profile-" + mode)
    const marker = join(root, "forbidden-browser")
    await mkdir(join(resources, "bin"), { recursive: true })
    await mkdir(join(resources, "runtime/src"), { recursive: true })
    await symlink(fixture.node, join(resources, "bin/node"))
    await symlink(
      join(import.meta.dir, "../../loginom-runtime/src/knowledge-entry.mjs"),
      join(resources, "runtime/src/knowledge-entry.mjs"),
    )
    await writeFile(
      join(resources, "runtime/src/managed-entry.mjs"),
      `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'started'); throw Error('Browser forbidden');`,
    )
    await writeFile(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: server.endpoint }))
    await mkdir(root, { recursive: true, mode: 0o700 })
    if (process.platform === "darwin") await buildKeychain(join(resources, "bin"))
    const store = connectionStore(join(root, "connection"), cliCredentials(process.platform, { root, resources }))
    await store.stage({ mode: "custom", endpoint: server.endpoint,
      generation: 1,
      revision: 1,
      apiKey: "UNIT-NONSECRET",
      password: "PRIVATE-NONSECRET",
      username: "user",
      url: "http://127.0.0.1:1/app/?custom=preserve",
    })
    await store.activate(1)
    const host = await launchNodeHost({
      node: fixture.node,
      entry: fixture.entry,
      root,
      resources,
      headless: true,
      environment: {},
    })
    try {
      expect(await host.request("connection.status", {})).toMatchObject({
        state: "starting",
        generation: 1,
        url: "http://127.0.0.1:1/app/?custom=preserve",
      })
      await entered.promise
      const settled = { value: false }
      const readiness = host.request("connection.ready", {}).finally(() => {
        settled.value = true
      })
      void readiness.catch(() => {})
      await host.request("connection.status", {})
      expect(settled.value).toBe(false)
      if (mode === "ready") {
        release.resolve()
        expect(await readiness).toMatchObject({ state: "ready", generation: 1 })
      } else {
        await host.close()
        await expect(readiness).rejects.toThrow("LOGINOM_HOST_CLOSED")
        expect(await host.exited).toEqual({ code: 0, signal: null })
      }
      await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" })
    } finally {
      release.resolve()
      await host.close().catch(() => {})
      for (const callback of cleanup) await callback()
      if (process.platform === "darwin") {
        const child = Bun.spawn(
          [
            "/usr/bin/security",
            "delete-generic-password",
            "-s",
            "com.loginom.aiagent.cli.profile-key.v1",
            "-a",
            createHash("sha256")
              .update(await realpath(root))
              .digest("hex"),
          ],
          { stdout: "ignore", stderr: "ignore" },
        )
        expect([0, 44]).toContain(await child.exited)
      }
    }
  },
  45_000,
)

test("private host handshake retains its upper budget beyond the former 30s deadline", async () => {
  const entry = join(fixture.directory, "slow-readiness.mjs")
  await writeFile(
    entry,
    `
    process.on('message', m => {
      if (m.method === 'start') setTimeout(() => process.send({id:m.id,result:{protocol:1,ready:true,pid:process.pid}}), 31_000);
      if (m.method === 'close') process.send({id:m.id,result:{closed:true}}, () => process.exit(0));
    });
  `,
  )
  const host = await launchNodeHost({
    node: fixture.node,
    entry,
    root: fixture.directory,
    resources: fixture.directory,
    headless: true,
  })
  await host.close()
  expect(await host.exited).toEqual({ code: 0, signal: null })
}, 40_000)

test.skipIf(process.platform === "win32")(
  "failed startup waits for a delayed SIGTERM exit without confirming cleanup",
  async () => {
    const entry = join(fixture.directory, "term-start.mjs")
    const marker = join(fixture.directory, "term-exited")
    await writeFile(
      entry,
      `
    import { writeFileSync } from 'node:fs';
    process.on('message', message => {
      if (message.method === 'start') process.send({id:message.id,error:'LOGINOM_HANDSHAKE_INVALID'});
    });
    process.on('SIGTERM', () => setTimeout(() => {
      writeFileSync(${JSON.stringify(marker)}, 'exited');
      process.exit(0);
    }, 150));
  `,
    )
    const started = Date.now()
    const failure = await launchNodeHost(
      {
        node: fixture.node,
        entry,
        root: fixture.directory,
        resources: fixture.directory,
        headless: true,
      },
      { start: 1000, close: 100, terminate: 500, teardown: 1500 },
    ).catch((error: unknown) => error)
    expect(failure).toMatchObject({ message: "LOGINOM_HANDSHAKE_INVALID", cleanupConfirmed: false })
    expect(await Bun.file(marker).text()).toBe("exited")
    expect(Date.now() - started).toBeLessThan(1500)
  },
  10_000,
)

test("a failed host spawn confirms no child needs cleanup", async () => {
  const failure = await launchNodeHost(
    {
      node: join(fixture.directory, "missing-node"),
      entry: fixture.entry,
      root: fixture.directory,
      resources: fixture.directory,
      headless: true,
    },
    { close: 100, terminate: 100, teardown: 1000 },
  ).catch((error: unknown) => error)
  expect(failure).toBeInstanceOf(NodeHostStartupError)
  expect(failure).toMatchObject({ message: "LOGINOM_HOST_CLOSED", cleanupConfirmed: true })
  expect(failure).toHaveProperty("cause", expect.objectContaining({ message: "LOGINOM_HOST_CLOSED" }))
})

test.skipIf(process.platform === "win32")(
  "IPC loss during startup still waits for the actual host exit",
  async () => {
    const entry = join(fixture.directory, "disconnect-start.mjs")
    const marker = join(fixture.directory, "disconnect-exited")
    const pid = join(fixture.directory, "disconnect-pid")
    await writeFile(
      entry,
      `
    import { writeFileSync } from 'node:fs';
    setInterval(() => {}, 1000);
    process.on('message', message => {
      if (message.method !== 'start') return;
      writeFileSync(${JSON.stringify(pid)}, String(process.pid));
      process.disconnect();
    });
    process.on('SIGTERM', () => setTimeout(() => {
      writeFileSync(${JSON.stringify(marker)}, 'exited');
      process.exit(0);
    }, 150));
  `,
    )
    const failure = await launchNodeHost(
      {
        node: fixture.node,
        entry,
        root: fixture.directory,
        resources: fixture.directory,
        headless: true,
      },
      { start: 1000, close: 100, terminate: 500, teardown: 1500 },
    ).catch((error: unknown) => error)
    expect(failure).toMatchObject({ message: "LOGINOM_HOST_CLOSED", cleanupConfirmed: false })
    expect(await Bun.file(marker).text()).toBe("exited")
    const child = Number(await Bun.file(pid).text())
    expect(() => process.kill(child, 0)).toThrow()
  },
  10_000,
)

test("an invalid handshake uses acknowledged cleanup before rejecting startup", async () => {
  const entry = join(fixture.directory, "invalid-handshake.mjs")
  await writeFile(
    entry,
    `
    process.on('message', message => {
      if (message.method === 'start') process.send({id:message.id,result:{protocol:0,ready:true,pid:process.pid}});
      if (message.method === 'close') process.send({id:message.id,result:{closed:true}}, () => process.disconnect());
    });
  `,
  )
  const failure = await launchNodeHost({
    node: fixture.node,
    entry,
    root: fixture.directory,
    resources: fixture.directory,
    headless: true,
  }).catch((error: unknown) => error)
  expect(failure).toBeInstanceOf(NodeHostStartupError)
  expect(failure).toMatchObject({ message: "LOGINOM_HANDSHAKE_INVALID", cleanupConfirmed: true })
})

test("a non-boolean saved-package cleanup policy is rejected before the host starts", async () => {
  await expect(
    launchNodeHost({
      node: fixture.node,
      entry: fixture.entry,
      root: join(fixture.directory, "bad-cleanup"),
      resources: join(fixture.directory, "absent-runtime"),
      headless: false,
      closeSavedPackageOnShutdown: "true" as unknown as boolean,
    }),
  ).rejects.toMatchObject({ message: "LOGINOM_HANDSHAKE_INVALID", cleanupConfirmed: true })
}, 15_000)

test("a non-boolean browser recovery capability is rejected before the host starts", async () => {
  await expect(
    launchNodeHost({
      node: fixture.node,
      entry: fixture.entry,
      root: join(fixture.directory, "bad-recovery"),
      resources: join(fixture.directory, "absent-runtime"),
      headless: false,
      browserRecovery: "true" as unknown as boolean,
    }),
  ).rejects.toMatchObject({ message: "LOGINOM_HANDSHAKE_INVALID", cleanupConfirmed: true })
}, 15_000)

test.each(["ack-without-exit", "disconnect-without-exit", "bad-ack", "missing-ack", "exit-without-ack", "bad-exit"])(
  "host shutdown is bounded and never accepts incomplete cleanup: %s",
  async (mode) => {
    const entry = join(fixture.directory, mode + ".mjs")
    await writeFile(
      entry,
      `
      setInterval(() => {}, 1000);
      process.on('message', m => {
        if (m.method === 'start') process.send({id:m.id,result:{protocol:1,ready:true,pid:process.pid}});
        if (m.method !== 'close') return;
        if (${JSON.stringify(mode)} === 'disconnect-without-exit') { process.disconnect(); return; }
        if (${JSON.stringify(mode)} === 'exit-without-ack') { process.exit(0); return; }
        if (${JSON.stringify(mode)} === 'missing-ack') return;
        process.send({id:m.id,result:{closed:${mode !== "bad-ack"}}}, () => {
          if (${JSON.stringify(mode)} === 'bad-exit') process.exit(7);
        });
      });
    `,
    )
    const host = await launchNodeHost(
      {
        node: fixture.node,
        entry,
        root: fixture.directory,
        resources: fixture.directory,
        headless: true,
      },
      { close: 100, terminate: 100, teardown: 1500 },
    )
    const closing = host.close()
    expect(host.close()).toBe(closing)
    await expect(closing).rejects.toThrow("LOGINOM_HOST_CLEANUP_FAILED")
    await expect(host.close()).rejects.toThrow("LOGINOM_HOST_CLEANUP_FAILED")
    expect(host.alive).toBe(false)
    const outcome = await host.exited
    if (mode === "exit-without-ack") expect(outcome).toEqual({ code: 0, signal: null })
    if (mode === "bad-exit") expect(outcome).toEqual({ code: 7, signal: null })
    if (mode !== "exit-without-ack" && mode !== "bad-exit")
      expect(outcome.code !== 0 || outcome.signal !== null).toBe(true)
    await expect(host.request("connection.status", {})).rejects.toThrow("LOGINOM_HOST_CLOSED")
  },
  10000,
)

test.skipIf(process.platform === "win32")(
  "saved-package Host teardown retains actual-exit margin after its full graceful window",
  async () => {
    const entry = join(fixture.directory, "saved-package-teardown.mjs")
    const marker = join(fixture.directory, "saved-package-term-exited")
    const pid = join(fixture.directory, "saved-package-teardown-pid")
    await writeFile(
      entry,
      `
      import { writeFileSync } from 'node:fs';
      setInterval(() => {}, 1000);
      process.on('message', m => {
        if (m.method === 'start') {
          writeFileSync(${JSON.stringify(pid)}, String(process.pid));
          process.send({id:m.id,result:{protocol:1,ready:true,pid:process.pid}});
        }
        // An acknowledgement alone cannot certify cleanup while the child stays alive.
        if (m.method === 'close') process.send({id:m.id,result:{closed:true}});
      });
      process.on('SIGTERM', () => setTimeout(() => {
        writeFileSync(${JSON.stringify(marker)}, 'exited');
        process.exit(0);
      }, 150));
    `,
    )
    const host = await launchNodeHost({
      node: fixture.node,
      entry,
      root: fixture.directory,
      resources: fixture.directory,
      headless: true,
      closeSavedPackageOnShutdown: true,
    })
    try {
      const started = Date.now()
      const closing = host.close()
      expect(host.close()).toBe(closing)
      await expect(closing).rejects.toThrow("LOGINOM_HOST_CLEANUP_FAILED")
      // The policy must reserve time after its 60s graceful window for TERM
      // and observation. A 60s total deadline would kill before this marker.
      expect(await Bun.file(marker).text()).toBe("exited")
      expect(await host.exited).toEqual({ code: 0, signal: null })
      expect(Date.now() - started).toBeGreaterThanOrEqual(60_000)
      expect(Date.now() - started).toBeLessThan(75_000)
      expect(host.alive).toBe(false)
      await expect(host.close()).rejects.toThrow("LOGINOM_HOST_CLEANUP_FAILED")
      const child = Number(await Bun.file(pid).text())
      expect(() => process.kill(child, 0)).toThrow()
    } finally {
      try {
        process.kill(Number(await Bun.file(pid).text()), "SIGKILL")
      } catch {}
    }
  },
  75_000,
)

test.skipIf(!process.env.LOGINOM_AI_AGENT_TEST_CLOUD_FIXTURE || !process.env.LOGINOM_AI_AGENT_TEST_CLI_BIN)(
  "current compiled CLI Host uses baked cloud endpoints through Node transport and explicit proxy",
  async () => {
    const { dirname, resolve } = await import("node:path")
    const cloud = await Bun.file(process.env.LOGINOM_AI_AGENT_TEST_CLOUD_FIXTURE!).json()
    const resources = resolve(dirname(process.env.LOGINOM_AI_AGENT_TEST_CLI_BIN!), "../resources/loginom")
    const root = join(fixture.directory, "compiled-cloud")
    const before = await (await fetch(cloud.control)).json()
    const host = await launchNodeHost({ node: fixture.node, entry: join(resources, "host/node-host.mjs"), root, resources,
      headless: true, environment: { NODE_EXTRA_CA_CERTS: cloud.cert, HTTPS_PROXY: cloud.proxy, NO_PROXY: "" } })
    const results: unknown[] = []
    try {
      const validation = await host.request("connection.check", { revision: 0, mode: "cloud", url: cloud.control + "/app/",
        username: "fixture", password: { operation: "empty" }, verifyBrowser: false }) as typeof import("@opencode-ai/schema/loginom").Loginom.Validation.Type
      const saved = await host.request("connection.save", { revision: 0, validationId: validation.validationId }) as import("@opencode-ai/schema/loginom").Loginom.View
      expect(saved).toMatchObject({ state: "connection-required", browser: { state: "unknown" } })
      results.push(await host.request("connection.cloud-start", {}))
      results.push(await host.request("connection.status", {}))
      results.push(await host.request("connection.cloud-cancel", {}))
      results.push(await host.request("connection.cloud-start", {}))
      await fetch(cloud.control + "/approve")
      for (let attempt = 0; attempt < 100; attempt++) {
        const view = await host.request("connection.status", {}) as import("@opencode-ai/schema/loginom").Loginom.View
        if (view.cloud.connected) break
        await Bun.sleep(100)
      }
      const ready = await host.request("connection.ready", {})
      expect(ready).toMatchObject({ state: "ready", generation: saved.generation, revision: saved.revision, cloud: { connected: true } })
      results.push(ready)
      await expect(host.request("connection.cloud-start", {})).rejects.toThrow("LOGINOM_CLOUD_ALREADY_CONNECTED")
      await host.request("acquire", { run: "compiled", session: "compiled" })
      results.push(await host.request("tools", { run: "compiled" }))
      for (const [name, args] of Object.entries({ find: { query: "fixture" }, search: { query: "fixture" },
        read: { uris: ["viking://resources/loginom-dock/test"] }, grep: { uri: "viking://resources/loginom-dock", pattern: ["fixture"] },
        glob: { uri: "viking://resources/loginom-dock", pattern: "*" }, list: { uri: "viking://resources/loginom-dock" },
        tree: { uri: "viking://resources/loginom-dock" } }))
        results.push(await host.request("call", { run: "compiled", name, args, userMessage: "Read fixture documentation" }))
      await host.request("release", { run: "compiled" })
      results.push(await host.request("connection.cloud-disconnect", {}))
      expect(JSON.stringify(results)).not.toContain("CANARY")
      const after = await (await fetch(cloud.control)).json()
      expect(after.starts - before.starts).toBe(2)
      expect(after.direct - before.direct).toBe(0)
      expect(after.primaryCalls - before.primaryCalls).toBe(7)
      expect(after.requests.slice(before.requests.length)).toContain("/primary/mcp")
    } finally { await host.close() }
    expect(await host.exited).toEqual({ code: 0, signal: null })
    for (const bypass of [true, false]) {
      const before = await (await fetch(cloud.control)).json()
      const probe = await launchNodeHost({ node: fixture.node, entry: join(resources, "host/node-host.mjs"), resources,
        root: join(root, bypass ? "bypass" : "unavailable"), headless: true,
        environment: { NODE_EXTRA_CA_CERTS: cloud.cert, HTTPS_PROXY: bypass ? cloud.proxy : "http://127.0.0.1:1", NO_PROXY: bypass ? new URL(cloud.endpoints.site).hostname : "" } })
      try {
        if (bypass) {
          expect(await probe.request("connection.cloud-start", {})).toMatchObject({ cloud: { pending: { userCode: "TASK13-CODE" } } })
          await probe.request("connection.cloud-cancel", {})
        }
        if (!bypass) await expect(probe.request("connection.cloud-start", {})).rejects.toThrow("LOGINOM_CLOUD_UNAVAILABLE")
      } finally { await probe.close() }
      const after = await (await fetch(cloud.control)).json()
      expect(after.direct - before.direct).toBe(bypass ? 1 : 0)
      expect(after.starts - before.starts).toBe(bypass ? 1 : 0)
      expect(await probe.exited).toEqual({ code: 0, signal: null })
    }
  }, 60000,
)

test.skipIf(process.platform === "win32")("terminal SIGINT leaves the private Host available for acknowledged owner cleanup", async () => {
  const { fork } = await import("node:child_process")
  const entry = join(fixture.directory, "terminal-owner.ts")
  const output = join(fixture.directory, "terminal-owner.mjs")
  await writeFile(entry, `
    import { launchNodeHost } from ${JSON.stringify(join(import.meta.dir, "../src/node-client.ts"))};
    const host = await launchNodeHost({node:${JSON.stringify(fixture.node)},entry:${JSON.stringify(fixture.entry)},
      root:${JSON.stringify(join(fixture.directory, "terminal-profile"))},resources:${JSON.stringify(fixture.directory)},headless:true,environment:{}});
    process.once('SIGINT', async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      const result = {};
      try { result.state = (await host.request('connection.status',{})).state; }
      catch (error) { result.requestError = error.message; }
      try { await host.close(); result.closed = true; }
      catch (error) { result.cleanupError = error.message; }
      result.exit = await host.exited;
      process.send(result, () => process.disconnect());
    });
    process.send({ready:true});
  `)
  const builder = Bun.spawn([process.execPath, "build", entry, "--target=node", "--outfile=" + output], { stdout: "pipe", stderr: "pipe" })
  expect(await builder.exited).toBe(0)
  const owner = fork(output, [], { execPath: fixture.node, execArgv: [], detached: true, env: {}, stdio: ["ignore", "pipe", "pipe", "ipc"] })
  const exited = once(owner, "exit")
  try {
    expect(await once(owner, "message")).toEqual([{ ready: true }, undefined])
    const result = once(owner, "message")
    process.kill(-owner.pid!, "SIGINT")
    expect((await result)[0]).toEqual({ state: "unconfigured", closed: true, exit: { code: 0, signal: null } })
    expect(await exited).toEqual([0, null])
    if (process.platform === "linux") {
      const abandoned = fork(output, [], { execPath: fixture.node, execArgv: [], detached: true, env: {}, stdio: ["ignore", "pipe", "pipe", "ipc"] })
      const ownerExited = once(abandoned, "exit")
      await once(abandoned, "message")
      const children = (await readFile(`/proc/${abandoned.pid}/task/${abandoned.pid}/children`, "utf8")).trim().split(/\s+/).map(Number)
      expect(children).toHaveLength(1)
      abandoned.kill("SIGKILL")
      await ownerExited
      try {
        for (let attempt = 0; attempt < 50; attempt++) {
          if (!await Bun.file(`/proc/${children[0]}/stat`).exists()) break
          await Bun.sleep(100)
        }
        expect(() => process.kill(children[0], 0)).toThrow()
      } finally {
        try { process.kill(children[0], "SIGKILL") } catch {}
      }
    }
  } finally {
    if (owner.exitCode === null) { owner.kill("SIGTERM"); await exited }
  }
}, 15000)
