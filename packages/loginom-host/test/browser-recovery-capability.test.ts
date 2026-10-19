import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { buildNodeHost } from "../script/build-node-host"
import { buildKeychain } from "../script/build-keychain"
import { launchNodeHost } from "../src/node-client"
import { connectionStore } from "../src/connection/connection-store"
import { cliCredentials } from "../src/connection/cli-credentials"
import { stageKnowledgeFixture } from "./fixtures/knowledge"

const fixture = { directory: "", entry: "", node: process.env.LOGINOM_AI_AGENT_TEST_NODE ?? "" }
beforeAll(async () => {
  if (!fixture.node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  fixture.directory = await mkdtemp(join(tmpdir(), "loginom-browser-recovery-"))
  fixture.entry = await buildNodeHost(fixture.directory)
})
afterAll(async () => {
  if (fixture.directory) await rm(fixture.directory, { recursive: true, force: true })
})

test.each([true, false])("browser recovery capability reaches only the task runtime: %p", async (capability) => {
  const directory = await mkdtemp(join(fixture.directory, "profile-"))
  const resources = join(directory, "resources")
  const root = join(directory, "profile")
  await mkdir(join(resources, "bin"), { recursive: true })
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await stageKnowledgeFixture(resources)
  await symlink(fixture.node, join(resources, "bin/node"))
  await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "https://example.test/mcp" }))
  await Bun.write(
    join(resources, "runtime/src/managed-entry.mjs"),
    `
    import {appendFileSync} from 'node:fs';
    process.on('message', m => {
      if(m.operation==='start') {
        appendFileSync(${JSON.stringify(join(directory, "starts.jsonl"))}, JSON.stringify({
          validation:m.input.validation===true,
          browserRecovery:m.input.browserRecovery,
          environmentRecovery:process.env.LOGINOM_AI_AGENT_BROWSER_RECOVERY??null
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
  await mkdir(root, { recursive: true, mode: 0o700 })
  if (process.platform === "darwin") await buildKeychain(join(resources, "bin"))
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
    headless: true,
    browserRecovery: capability,
    environment: { ...process.env, LOGINOM_AI_AGENT_BROWSER_RECOVERY: "1" },
  })
  try {
    await host.request("connection.ready", {})
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
    await host.request("scope", {
      run: "one",
      mode: "bind",
      scope: { taskMessageID: "msg_original", profile: "loginom-automation" },
    })
    expect(
      await host.request("call", {
        run: "one",
        userMessage: "msg_original",
        name: "dock_prepare",
        args: { browserRecovery: !capability },
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
  expect(starts).toHaveLength(2)
  expect(starts.filter((value) => value.validation)).toHaveLength(1)
  expect(starts.filter((value) => value.validation).every((value) => value.browserRecovery === false)).toBe(true)
  expect(starts.find((value) => !value.validation)?.browserRecovery).toBe(capability)
  expect(starts.every((value) => value.environmentRecovery === null)).toBe(true)
}, 15_000)
