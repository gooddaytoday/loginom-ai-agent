import { afterAll, beforeAll, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cliCredentials } from "../src/connection/cli-credentials"
import { connectionStore } from "../src/connection/connection-store"
import { hostError } from "../src/errors"
import { launchNodeHost } from "../src/node-client"
import { transport } from "../src/transport"
import { stageHeldKnowledge } from "./fixtures/knowledge"

const directory = await mkdtemp(join(tmpdir(), "connection-switch-"))
const resources = join(directory, "resources")
const gate = join(directory, "catalog")
const nodePath = process.platform === "win32" ? "bin/node.exe" : "bin/node"
const node = join(resources, nodePath)
const original = {
  generation: 1,
  revision: 1,
  url: "http://old.example/app/",
  username: "old-user",
  apiKey: "",
  password: "OLD-FIXTURE",
}
const replacement = {
  url: "http://new.example/app/",
  username: "new-user",
  password: { operation: "replace" as const, value: "NEW-FIXTURE" },
}
const flag = "LOGINOM_AI_AGENT_CON08_TEST_BUILD"
let catalog: Awaited<ReturnType<typeof stageHeldKnowledge>>

beforeAll(async () => {
  const source = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!source) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  await mkdir(join(resources, "bin"), { recursive: true })
  await copyFile(source, node)
  catalog = await stageHeldKnowledge(join(resources, "runtime/src/knowledge-entry.mjs"), gate)
  await catalog.release()
  const browser = "fixture-browser"
  await writeFile(join(resources, browser), "")
  await writeFile(
    join(resources, "runtime/src/managed-entry.mjs"),
    `
    process.on('message', m => {
      if (m.operation === 'start') process.send({id:m.id,result:{protocol:1,generation:m.input.generation,checked:true}});
      if (m.operation === 'close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
    });
  `,
  )
  const files = await Promise.all(
    [nodePath, browser].map(async (path) => {
      const hash = createHash("sha256")
      for await (const chunk of createReadStream(join(resources, path))) hash.update(chunk)
      return { path, sha256: hash.digest("hex") }
    }),
  )
  await writeFile(
    join(resources, "resource-manifest.json"),
    JSON.stringify({
      protocol: 1,
      nodeVersion: "24.19.0",
      node: nodePath,
      browser,
      files,
    }),
  )
  // Build in separate processes: Bun.build can reuse failed reads in the test runner.
  for (const [build, workflow, job] of [
    ["local", "", ""],
    ["release", "loginom-release.yml", "con08-fixture"],
    ["production", "loginom-windows.yml", "build-package-test"],
    ["fixture", "loginom-windows.yml", "con08-fixture"],
  ]) {
    const child = Bun.spawn(
      [process.execPath, join(import.meta.dir, "../script/build-node-host.ts"), join(directory, build)],
      {
        env: {
          ...process.env,
          [flag]: "1",
          GITHUB_ACTIONS: workflow ? "true" : "false",
          GITHUB_EVENT_NAME: "workflow_dispatch",
          GITHUB_JOB: job,
          GITHUB_REPOSITORY: "gooddaytoday/loginom-ai-agent",
          GITHUB_WORKFLOW_REF: workflow
            ? `gooddaytoday/loginom-ai-agent/.github/workflows/${workflow}@refs/heads/test`
            : "",
        },
        stderr: "pipe",
      },
    )
    const errors = new Response(child.stderr).text()
    expect({ code: await child.exited, errors: await errors }).toEqual({ code: 0, errors: "" })
  }
}, 20_000)

afterAll(() => rm(directory, { recursive: true, force: true }))

async function profile(mode: string, build: "production" | "fixture") {
  const root = join(directory, mode)
  const store = connectionStore(join(root, "connection"), cliCredentials(process.platform, { root, resources }))
  await store.stage(original)
  await store.activate(1)
  const launch = () =>
    launchNodeHost({
      node,
      entry: join(directory, build, "node-host.mjs"),
      root,
      resources,
      headless: true,
      environment: { ...process.env, [flag]: "1" },
    })
  return { store, launch, fault: join(root, "con08-fault") }
}

type Owner = Awaited<ReturnType<typeof launchNodeHost>>

async function validate(owner: Owner, revision: number) {
  await owner.request("connection.verify-resources", {})
  const checked = await owner.request("connection.check", { ...replacement, revision })
  if (!checked || typeof checked !== "object" || !("validationId" in checked) || typeof checked.validationId !== "string")
    throw Error("Missing validation ID")
  return { revision, validationId: checked.validationId }
}

async function openRun(owner: Owner, run: string) {
  return owner.request("acquire", { run, session: run })
}

async function readHelp(owner: Owner, run: string, generation: number) {
  const response = Promise.withResolvers<unknown>()
  await expect(
    transport(owner.port).request(
      "call",
      { run, name: "read", userMessage: "Read Help", args: { uri: "fixture.md" } },
      5000,
      response.resolve,
    ),
  ).resolves.toMatchObject({ content: [{ type: "text", text: expect.stringContaining("fixture.md") }] })
  expect(await response.promise).toMatchObject({ generation })
}

async function expectAwaitingCatalog(owner: Owner, store: ReturnType<typeof connectionStore>) {
  const held = Bun.file(gate + ".held")
  for (let attempt = 0; attempt < 500 && !(await held.exists()); attempt++) await Bun.sleep(10)
  expect(await held.exists()).toBe(true)
  expect(await owner.request("connection.status", {})).toMatchObject({ state: "starting", generation: 1 })
  expect(await store.read()).toEqual(original)
  expect(await store.staged(2)).toBeUndefined()
}

test.each([
  ["start", "LOGINOM_RUNTIME_START_FAILED"],
  ["before-activate", "LOGINOM_STORE_WRITE_FAILED"],
  ["readiness-timeout", "LOGINOM_RUNTIME_TIMEOUT"],
])(
  "connection switch recovers after %s",
  async (fault, failure) => {
    const f = await profile(fault, "fixture")
    let owner = await f.launch()
    try {
      await owner.request("connection.ready", {})
      expect(await openRun(owner, "draining")).toEqual({ generation: 1 })
      await readHelp(owner, "draining", 1)
      const candidate = await validate(owner, 1)
      await writeFile(f.fault, fault)
      expect(await owner.request("connection.save", candidate)).toMatchObject({ state: "pending", generation: 1 })
      expect(await readFile(f.fault, "utf8")).toBe(fault)
      await readHelp(owner, "draining", 1)
      if (fault === "before-activate") await writeFile(gate, "")
      await owner.request("release", { run: "draining" })
      if (fault === "before-activate") {
        try {
          await expectAwaitingCatalog(owner, f.store)
        } finally {
          await catalog.release()
        }
      }
      // The released lease starts the switch asynchronously.
      for (let attempt = 0; attempt < 500; attempt++) {
        const view = await owner.request("connection.status", {})
        if (view && typeof view === "object" && "state" in view && view.state === "ready") break
        await Bun.sleep(10)
      }
      expect(await owner.request("connection.status", {})).toMatchObject({
        state: "ready",
        generation: 1,
        revision: 2,
        url: original.url,
        username: original.username,
        failure,
      })
      expect(hostError(failure)).toBe(failure)
      expect(await f.store.read()).toEqual(original)
      expect(await Bun.file(f.fault).exists()).toBe(false)
      expect(await f.store.pending()).toBeUndefined()
      if (fault === "before-activate") expect(await f.store.staged(2)).toMatchObject({ url: replacement.url })
      else expect(await f.store.staged(2)).toBeUndefined()
      expect(await openRun(owner, "after-failure")).toEqual({ generation: 1 })
      await readHelp(owner, "after-failure", 1)
      await owner.request("release", { run: "after-failure" })

      await owner.close()
      owner = await f.launch()
      expect(await owner.request("connection.ready", {})).toMatchObject({
        state: "ready",
        generation: 1,
        revision: 1,
        url: original.url,
      })
      expect(await f.store.read()).toEqual(original)
      expect(await openRun(owner, "after-restart")).toEqual({ generation: 1 })
      await readHelp(owner, "after-restart", 1)
      await owner.request("release", { run: "after-restart" })

      const generation = fault === "before-activate" ? 3 : 2
      const retry = await validate(owner, 1)
      const switched = await owner.request("connection.save", retry)
      expect(switched).toMatchObject({
        state: "ready",
        generation,
        url: replacement.url,
        username: replacement.username,
      })
      expect(switched).not.toHaveProperty("failure")
      expect(await f.store.read()).toMatchObject({
        generation,
        url: replacement.url,
        password: replacement.password.value,
      })
      await openRun(owner, "retried")
      await readHelp(owner, "retried", generation)
    } finally {
      await owner.close()
    }
  },
  15_000,
)

test("production ignores the CON-08 marker and commits only after replacement readiness", async () => {
  const f = await profile("production-profile", "production")
  for (const build of ["local", "release", "production"])
    expect(await Bun.file(join(directory, build, "node-host.mjs")).text()).not.toContain("con08-fault")
  const owner = await f.launch()
  try {
    await owner.request("connection.ready", {})
    const candidate = await validate(owner, 1)
    await writeFile(f.fault, "start")
    await writeFile(gate, "")
    const saving = owner.request("connection.save", candidate)
    void saving.catch(() => undefined)
    try {
      // Observe the real replacement's pending catalog while the disk and Host still report generation 1.
      await expectAwaitingCatalog(owner, f.store)
    } finally {
      await catalog.release()
    }
    expect(await saving).toMatchObject({ state: "ready", generation: 2, url: replacement.url })
    expect(await f.store.read()).toMatchObject({ generation: 2, url: replacement.url })
    expect(await readFile(f.fault, "utf8")).toBe("start")
  } finally {
    await owner.close()
  }
}, 15_000)
