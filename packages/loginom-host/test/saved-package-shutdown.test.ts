import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { buildNodeHost } from "../script/build-node-host"
import { launchNodeHost } from "../src/node-client"
import { connectionStore } from "../src/connection/connection-store"
import { cliCredentials } from "../src/connection/cli-credentials"
import { supervise } from "../src/supervisor"
import { createLoginomHost } from "../src/host"

const fixture = { directory: "", entry: "", node: process.env.LOGINOM_AI_AGENT_TEST_NODE ?? "" }
beforeAll(async () => {
  if (!fixture.node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  fixture.directory = await mkdtemp(join(tmpdir(), "loginom-saved-package-policy-"))
  fixture.entry = await buildNodeHost(fixture.directory)
})
afterAll(async () => {
  await rm(fixture.directory, { recursive: true, force: true })
})

async function configuredRuntime(directory: string, source: string) {
  const resources = join(directory, "resources")
  const root = join(directory, "profile")
  await mkdir(join(resources, "bin"), { recursive: true })
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await symlink(fixture.node, join(resources, "bin/node"))
  await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "https://example.test/mcp" }))
  await Bun.write(join(resources, "runtime/src/managed-entry.mjs"), source)
  const store = connectionStore(join(root, "connection"), cliCredentials(process.platform, { root, resources }))
  await store.stage({
    generation: 1,
    revision: 1,
    url: "http://example.test/app",
    username: "user",
    password: "",
    apiKey: "fixture",
  })
  await store.activate(1)
  return { root, resources }
}

test.each([false, true])(
  "retired runtime cleanup failure survives only the new strict shutdown policy: %s",
  async (policy) => {
    const directory = await mkdtemp(join(fixture.directory, "retired-"))
    const configured = await configuredRuntime(
      directory,
      `
    import {existsSync,writeFileSync} from 'node:fs';
    let chat;
    process.on('message', m=>{
      if(m.operation==='start') {chat=m.input.chat;process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat,ready:true}});}
      if(m.operation==='close') {
        const marker=${JSON.stringify(join(directory, "retired"))};
        const failed=chat==='chat'&&!existsSync(marker);
        if(failed)writeFileSync(marker,'retired failure');
        process.send({id:m.id,result:{closed:!failed}},()=>process.disconnect());
      }
    });
  `,
    )
    const host = await createLoginomHost({
      ...configured,
      codec: cliCredentials(process.platform, configured),
      environment: {},
      closeSavedPackageOnShutdown: policy,
    })
    try {
      await host.settled()
      await host.runtime(1, "chat")
      host.markRuntimeStale("chat")
      await host.retireRuntime("chat")
      await host.runtime(1, "chat")
      if (policy) await expect(host.close()).rejects.toThrow("LOGINOM_RUNTIME_CLEANUP_FAILED")
      if (!policy) await host.close()
    } finally {
      await host.close().catch(() => undefined)
    }
  },
)

test("a runtime exit without requested closure cannot certify normal CLI shutdown", async () => {
  const directory = await mkdtemp(join(fixture.directory, "lost-"))
  const configured = await configuredRuntime(
    directory,
    `process.on('message',m=>{
    if(m.operation==='start')process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
    if(m.operation==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
    if(m.operation==='exit')process.send({id:m.id,result:{exit:true}},()=>process.disconnect());
  });`,
  )
  const host = await createLoginomHost({
    ...configured,
    codec: cliCredentials(process.platform, configured),
    environment: {},
    closeSavedPackageOnShutdown: true,
  })
  try {
    await host.settled()
    const runtime = await host.runtime(1, "chat")
    await runtime.request("exit")
    expect(await runtime.exited).toEqual({ code: 0, signal: null })
    await expect(host.close()).rejects.toThrow("LOGINOM_RUNTIME_CLEANUP_FAILED")
  } finally {
    await host.close().catch(() => undefined)
  }
})

test.each([undefined, false, true].flatMap((policy) => [false, true].map((headless) => ({ policy, headless }))))(
  "private CLI policies reach task and preflight runtimes: %j",
  async (input) => {
    const directory = await mkdtemp(join(fixture.directory, "profile-"))
    const resources = join(directory, "resources")
    const root = join(directory, "profile")
    await mkdir(join(resources, "bin"), { recursive: true })
    await mkdir(join(resources, "runtime/src"), { recursive: true })
    await symlink(fixture.node, join(resources, "bin/node"))
    await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "https://example.test/mcp" }))
    // Real compiled Host and real Node IPC; the external browser runtime is a
    // controlled boundary. This proves routing, not package closure in Loginom.
    await Bun.write(
      join(resources, "runtime/src/managed-entry.mjs"),
      `
    import {appendFileSync} from 'node:fs';
    process.on('message', m => {
      if(m.operation==='start') {
        appendFileSync(${JSON.stringify(join(directory, "starts.jsonl"))}, JSON.stringify({
          validation:m.input.validation===true,chat:m.input.chat,headless:m.input.headless,
          closeSavedPackageOnShutdown:m.input.closeSavedPackageOnShutdown,
          acceptancePath:m.input.acceptanceCleanupPackage??null,
          environmentPolicy:process.env.LOGINOM_AI_AGENT_CLOSE_SAVED_PACKAGE??null
        })+'\\n');
        process.send({id:m.id,result:m.input.validation
          ?{protocol:1,generation:m.input.generation,checked:true}
          :{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
      }
      if(m.operation==='call') process.send({id:m.id,result:{result:{ok:true},recoveryPending:false,activeWork:false}});
      if(m.operation==='interrupt') process.send({id:m.id,result:{interrupted:true}});
      if(m.operation==='close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
    });
  `,
    )
    const store = connectionStore(join(root, "connection"), cliCredentials(process.platform, { root, resources }))
    await store.stage({
      generation: 1,
      revision: 1,
      url: "http://example.test/app",
      username: "user",
      password: "",
      apiKey: "fixture",
    })
    await store.activate(1)
    const host = await launchNodeHost({
      node: fixture.node,
      entry: fixture.entry,
      root,
      resources,
      headless: input.headless,
      closeSavedPackageOnShutdown: input.policy,
      environment: { ...process.env, LOGINOM_AI_AGENT_CLOSE_SAVED_PACKAGE: "hostile-path" },
    })
    try {
      expect(
        await host.request("connection.check", {
          revision: 1,
          url: "http://example.test/app",
          username: "user",
          password: { operation: "preserve" },
          apiKey: { operation: "preserve" },
        }),
      ).toMatchObject({ validationId: expect.any(String), expiresAt: expect.any(Number) })
      expect(await host.request("acquire", { run: "one", session: "chat" })).toEqual({ generation: 1 })
      expect(
        await host.request("call", {
          run: "one",
          userMessage: "original",
          name: "dock_prepare",
          args: { closeSavedPackageOnShutdown: !input.policy, acceptanceCleanupPackage: "/foreign/package.lgp" },
        }),
      ).toEqual({ ok: true })
      await host.request("release", { run: "one" })
    } finally {
      await host.close()
    }
    expect(await host.exited).toEqual({ code: 0, signal: null })
    const starts = (await readFile(join(directory, "starts.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(starts).toHaveLength(3)
    expect(starts.every((value) => value.headless === input.headless)).toBe(true)
    expect(
      starts
        .filter((value) => value.validation || value.chat === "readiness")
        .every((value) => value.closeSavedPackageOnShutdown === false),
    ).toBe(true)
    expect(starts.find((value) => !value.validation && value.chat !== "readiness").closeSavedPackageOnShutdown).toBe(
      input.policy === true,
    )
    expect(starts.every((value) => value.acceptancePath === null && value.environmentPolicy === null)).toBe(true)
  },
  15_000,
)

test("direct Desktop host retains quiet readiness with a headed task", async () => {
  const directory = await mkdtemp(join(fixture.directory, "desktop-preflight-"))
  const configured = await configuredRuntime(
    directory,
    `
    import {appendFileSync} from 'node:fs';
    process.on('message',m=>{
      if(m.operation==='start') {
        appendFileSync(${JSON.stringify(join(directory, "starts.jsonl"))},JSON.stringify({chat:m.input.chat,headless:m.input.headless})+'\\n');
        process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
      }
      if(m.operation==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
    });
  `,
  )
  const host = await createLoginomHost({
    ...configured,
    codec: cliCredentials(process.platform, configured),
    environment: {},
    headless: false,
  })
  try {
    await host.settled()
    await host.runtime(1, "chat")
  } finally {
    await host.close()
  }
  expect(
    (await readFile(join(directory, "starts.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  ).toEqual([
    { chat: "readiness", headless: true },
    { chat: "chat", headless: false },
  ])
})

test("normal guarded cleanup can acknowledge after the old five-second resource budget", async () => {
  const directory = await mkdtemp(join(fixture.directory, "close-"))
  const entry = join(directory, "runtime.mjs")
  await Bun.write(
    entry,
    `process.on('message', m=>{
    if(m.operation==='start') process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
    if(m.operation==='close') setTimeout(()=>process.send({id:m.id,result:{closed:true}},()=>process.disconnect()),5250);
  });`,
  )
  const runtime = await supervise({
    node: fixture.node,
    entry,
    resources: directory,
    stateDir: directory,
    generation: 1,
    chat: "chat",
    endpoint: "https://example.test/mcp",
    connection: { url: "http://example.test/app", username: "user", password: "", apiKey: "fixture" },
    closeSavedPackageOnShutdown: true,
  })
  const first = runtime.close()
  expect(runtime.close()).toBe(first)
  await first
  expect(await runtime.exited).toEqual({ code: 0, signal: null })
}, 10_000)

test.each(["success", "refused", "private-error", "bad-ack", "bad-exit", "timeout"])(
  "private shutdown evidence distinguishes IPC and exit without weakening cleanup: %s",
  async (mode) => {
    const directory = await mkdtemp(join(fixture.directory, "diagnostic-"))
    const entry = join(directory, "runtime.mjs")
    await Bun.write(entry, `process.on('message',m=>{
      if(m.operation==='start')process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
      if(m.operation!=='close')return;
      const mode=${JSON.stringify(mode)};
      if(mode==='timeout'){setTimeout(()=>process.disconnect(),5250);return;}
      if(mode==='bad-exit')process.exitCode=1;
      const value=mode==='refused'?{error:'LOGINOM_RUNTIME_CLEANUP_FAILED'}:
        mode==='private-error'?{error:'private-secret-must-not-escape'}:{result:{closed:mode!=='bad-ack',extra:'private-secret-must-not-escape'}};
      process.send({id:m.id,...value},()=>process.disconnect());
    });`)
    const runtime = await supervise({ node: fixture.node, entry, resources: directory, stateDir: directory,
      generation: 1, chat: "chat", endpoint: "https://example.test/mcp",
      connection: { url: "http://example.test/app", username: "user", password: "", apiKey: "fixture" } })
    if (mode === "success") await runtime.close()
    if (mode !== "success") await expect(runtime.close()).rejects.toThrow("LOGINOM_RUNTIME_CLEANUP_FAILED")
    const files = (await readdir(directory)).filter((name) => name.startsWith("runtime-close-"))
    expect(files).toHaveLength(1)
    const text = await readFile(join(directory, files[0]), "utf8")
    expect(text).not.toContain("private-secret")
    expect((await stat(join(directory, files[0]))).mode & 0o777).toBe(0o600)
    const result = JSON.parse(text)
    expect(result.request_error).toBe(mode === "timeout" ? "LOGINOM_RUNTIME_TIMEOUT"
      : mode === "refused" ? "LOGINOM_RUNTIME_CLEANUP_FAILED" : mode === "private-error" ? "LOGINOM_RUNTIME_FAILED" : null)
    expect(result.closed_ack).toBe(["success", "bad-exit"].includes(mode))
    expect(result.exit_code).toBe(mode === "bad-exit" ? 1 : 0)
    expect(result.exit_signal).toBeNull()
  }, 10_000,
)
