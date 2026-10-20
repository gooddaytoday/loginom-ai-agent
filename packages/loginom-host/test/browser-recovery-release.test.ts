import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { launchNodeHost } from "../src/node-client"
import { connectionStore } from "../src/connection/connection-store"
import { cliCredentials } from "../src/connection/cli-credentials"
import { stageKnowledgeFixture } from "./fixtures/knowledge"

const fixture = { directory: "", entry: "", node: process.env.LOGINOM_AI_AGENT_TEST_NODE ?? "" }
beforeAll(async () => {
  if (!fixture.node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  fixture.directory = await mkdtemp(join(tmpdir(), "loginom-browser-release-"))
  const builder = Bun.spawn([process.execPath, join(import.meta.dir, "../script/build-node-host.ts"), fixture.directory], {
    stdout: "pipe", stderr: "pipe",
  })
  const [code, output, errors] = await Promise.all([builder.exited,
    new Response(builder.stdout).text(), new Response(builder.stderr).text()])
  expect({ code, output, errors }).toEqual({ code: 0, output: "", errors: "" })
  fixture.entry = join(fixture.directory, "node-host.mjs")
})
afterAll(async () => {
  await rm(fixture.directory, { recursive: true, force: true })
})

async function configuredHost(refuseRelease = false) {
  const directory = await mkdtemp(join(fixture.directory, "profile-"))
  const resources = join(directory, "resources")
  const root = join(directory, "profile")
  await mkdir(join(resources, "bin"), { recursive: true })
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await stageKnowledgeFixture(resources)
  await symlink(fixture.node, join(resources, "bin/node"))
  await Bun.write(join(resources, "resource-manifest.json"), JSON.stringify({ endpoint: "http://example.test" }))
  await Bun.write(
    join(resources, "runtime/src/managed-entry.mjs"),
    `
    import { appendFileSync } from 'node:fs';
    process.on('message', m => {
      appendFileSync(${JSON.stringify(join(directory, "operations.jsonl"))}, m.operation + '\\n');
      if (m.operation === 'start') process.send({ id:m.id, result:{ protocol:1, generation:m.input.generation, chat:m.input.chat, ready:true } });
      if (m.operation === 'call') process.send({ id:m.id, result:{ result:{ ok:true }, recoveryPending:false, activeWork:false } });
      if (m.operation === 'interrupt') process.send({ id:m.id, result:{ interrupted:true } });
      if (m.operation === 'run-released') process.send(${refuseRelease ? "{ id:m.id, error:'LOGINOM_RELEASE_REFUSED' }" : "{ id:m.id, result:{ released:true } }"});
      if (m.operation === 'close') process.send({ id:m.id, result:{ closed:true } }, () => process.disconnect());
    });
  `,
  )
  const store = connectionStore(join(root, "connection"), cliCredentials(process.platform, { root, resources }))
  await store.stage({ generation: 1, revision: 1, url: "http://example.test", username: "user", apiKey: "fixture", password: "" })
  await store.activate(1)
  const host = await launchNodeHost({ node: fixture.node, entry: fixture.entry, root, resources, headless: true })
  await host.request("connection.ready", {})
  return { host, directory }
}

test("releasing a run notifies its existing runtime once and never starts one", async () => {
  const { host, directory } = await configuredHost()
  try {
    expect(await host.request("acquire", { run: "one", session: "chat-one" })).toEqual({ generation: 1 })
    await host.request("scope", {
      run: "one", mode: "bind", scope: { taskMessageID: "msg_original", profile: "loginom-automation" },
    })
    expect(await host.request("call", { run: "one", userMessage: "msg_original", name: "dock_prepare", args: {} })).toEqual({ ok: true })
    expect(await host.request("release", { run: "one" })).toBe(true)
    const before = (await readFile(join(directory, "operations.jsonl"), "utf8")).trim().split("\n")
    expect(before.filter((value) => value === "run-released")).toHaveLength(1)
    expect(before.indexOf("run-released")).toBeGreaterThan(before.indexOf("call"))
    const starts = before.filter((value) => value === "start").length
    expect(await host.request("acquire", { run: "two", session: "chat-two" })).toEqual({ generation: 1 })
    expect(await host.request("release", { run: "two" })).toBe(true)
    const after = (await readFile(join(directory, "operations.jsonl"), "utf8")).trim().split("\n")
    expect(after.filter((value) => value === "start")).toHaveLength(starts)
    expect(after.filter((value) => value === "run-released")).toHaveLength(1)
  } finally {
    await host.close()
  }
  expect(await host.exited).toEqual({ code: 0, signal: null })
})

test("a refused run-released never fails the release", async () => {
  const { host, directory } = await configuredHost(true)
  try {
    expect(await host.request("acquire", { run: "three", session: "chat-three" })).toEqual({ generation: 1 })
    await host.request("scope", {
      run: "three", mode: "bind", scope: { taskMessageID: "msg_original", profile: "loginom-automation" },
    })
    expect(await host.request("call", { run: "three", userMessage: "msg_original", name: "dock_prepare", args: {} })).toEqual({ ok: true })
    expect(await host.request("release", { run: "three" })).toBe(true)
    const operations = (await readFile(join(directory, "operations.jsonl"), "utf8")).trim().split("\n")
    expect(operations.filter((value) => value === "run-released")).toHaveLength(1)
  } finally {
    await host.close()
  }
  expect(await host.exited).toEqual({ code: 0, signal: null })
})
