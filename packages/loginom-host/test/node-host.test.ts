import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { buildNodeHost } from "../script/build-node-host"
import { launchNodeHost, NodeHostStartupError } from "../src/node-client"

const fixture = { directory: "", entry: "", node: process.env.LOGINOM_AI_AGENT_TEST_NODE ?? "" }
beforeAll(async () => {
  if (!fixture.node) throw new Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  fixture.directory = await mkdtemp(join(tmpdir(), "loginom-node-host-"))
  fixture.entry = await buildNodeHost(fixture.directory)
})
afterAll(async () => {
  if (fixture.directory) await rm(fixture.directory, { recursive: true, force: true })
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
    expect(await host.request("connection.status", {})).toMatchObject({ state: "unconfigured", hasApiKey: false })
    const error = await host
      .request("connection.check", { apiKey: "private-sentinel" })
      .catch((error: Error) => error.message)
    expect(error).not.toContain("private-sentinel")
    expect(error).toBe("LOGINOM_CANDIDATE_INVALID")
    expect(await host.request("acquire", { run: "test", session: "chat" })).toBeNull()
  } finally {
    await host.close()
  }
  expect(host.alive).toBe(false)
  expect(await host.exited).toEqual({ code: 0, signal: null })
  await expect(host.request("connection.status", {})).rejects.toThrow("LOGINOM_HOST_CLOSED")
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

test("saved-connection readiness can finish after the former 30s startup deadline", async () => {
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
