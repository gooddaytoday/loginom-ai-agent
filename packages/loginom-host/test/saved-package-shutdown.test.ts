import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { buildNodeHost } from "../script/build-node-host"
import { launchNodeHost } from "../src/node-client"
import { connectionStore } from "../src/connection/connection-store"
import { cliCredentials } from "../src/connection/cli-credentials"
import { supervise } from "../src/supervisor"

const fixture = { directory: "", entry: "", node: process.env.LOGINOM_AI_AGENT_TEST_NODE ?? "" }
beforeAll(async () => {
  if (!fixture.node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  fixture.directory = await mkdtemp(join(tmpdir(), "loginom-saved-package-policy-"))
  fixture.entry = await buildNodeHost(fixture.directory)
})
afterAll(async () => {
  await rm(fixture.directory, { recursive: true, force: true })
})

test.each([undefined, false, true])("private Host policy reaches only a task runtime: %s", async (policy) => {
  const directory = await mkdtemp(join(fixture.directory, "profile-"))
  const resources = join(directory, "resources")
  const root = join(directory, "profile")
  await mkdir(join(resources, "bin"), { recursive: true })
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await symlink(fixture.node, join(resources, "bin/node"))
  await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "https://example.test/mcp" }))
  // Real compiled Host and real Node IPC; the external browser runtime is a
  // controlled boundary. This proves routing, not package closure in Loginom.
  await Bun.write(join(resources, "runtime/src/managed-entry.mjs"), `
    import {appendFileSync} from 'node:fs';
    process.on('message', m => {
      if(m.operation==='start') {
        appendFileSync(${JSON.stringify(join(directory, "starts.jsonl"))}, JSON.stringify({
          validation:m.input.validation===true,chat:m.input.chat,
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
  `)
  const store = connectionStore(join(root, "connection"), cliCredentials(process.platform, { root, resources }))
  await store.stage({ generation: 1, revision: 1, url: "http://example.test/app", username: "user", password: "", apiKey: "fixture" })
  await store.activate(1)
  const host = await launchNodeHost({
    node: fixture.node, entry: fixture.entry, root, resources, headless: false,
    closeSavedPackageOnShutdown: policy,
    environment: { ...process.env, LOGINOM_AI_AGENT_CLOSE_SAVED_PACKAGE: "hostile-path" },
  })
  try {
    expect(await host.request("connection.check", {
      revision: 1, url: "http://example.test/app", username: "user",
      password: { operation: "preserve" }, apiKey: { operation: "preserve" },
    })).toMatchObject({ validationId: expect.any(String), expiresAt: expect.any(Number) })
    expect(await host.request("acquire", { run: "one", session: "chat" })).toEqual({ generation: 1 })
    expect(await host.request("call", {
      run: "one", userMessage: "original", name: "dock_prepare",
      args: { closeSavedPackageOnShutdown: !policy, acceptanceCleanupPackage: "/foreign/package.lgp" },
    })).toEqual({ ok: true })
    await host.request("release", { run: "one" })
  } finally {
    await host.close()
  }
  expect(await host.exited).toEqual({ code: 0, signal: null })
  const starts = (await readFile(join(directory, "starts.jsonl"), "utf8")).trim().split("\n")
    .map((line) => JSON.parse(line))
  expect(starts).toHaveLength(3)
  expect(starts.filter((value) => value.validation || value.chat === "readiness")
    .every((value) => value.closeSavedPackageOnShutdown === false)).toBe(true)
  expect(starts.find((value) => !value.validation && value.chat !== "readiness").closeSavedPackageOnShutdown).toBe(policy === true)
  expect(starts.every((value) => value.acceptancePath === null && value.environmentPolicy === null)).toBe(true)
}, 15_000)

test("normal guarded cleanup can acknowledge after the old five-second resource budget", async () => {
  const directory = await mkdtemp(join(fixture.directory, "close-"))
  const entry = join(directory, "runtime.mjs")
  await Bun.write(entry, `process.on('message', m=>{
    if(m.operation==='start') process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
    if(m.operation==='close') setTimeout(()=>process.send({id:m.id,result:{closed:true}},()=>process.disconnect()),5250);
  });`)
  const runtime = await supervise({
    node: fixture.node, entry, resources: directory, stateDir: directory, generation: 1, chat: "chat",
    endpoint: "https://example.test/mcp", connection: { url: "http://example.test/app", username: "user", password: "", apiKey: "fixture" },
    closeSavedPackageOnShutdown: true,
  })
  const first = runtime.close()
  expect(runtime.close()).toBe(first)
  await first
  expect(await runtime.exited).toEqual({ code: 0, signal: null })
}, 10_000)
