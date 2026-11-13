import { expect, test } from "bun:test"
import { access, copyFile, mkdir, mkdtemp, readdir, rm, stat, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { createLoginomHost } from "../src/host"
import { writeHelp } from "../../loginom-runtime/client/test/support/help-fixture.mjs"
import { credentials } from "../src/connection/credentials"
import { connectionStore } from "../src/connection/connection-store"
import { createHash } from "node:crypto"
import { constants } from "node:fs"

test("shared host can manage an unconfigured profile without Electron or starting a runtime", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-host-"))
  try {
    const host = await createLoginomHost({
      root: directory,
      resources: join(directory, "absent-resources"),
      codec: credentials("linux"),
      environment: {},
      headless: true,
    })
    expect(await host.api.status()).toMatchObject({ state: "unconfigured" })
    expect(host.acquire("test-run")).toBeUndefined()
    expect(await readdir(directory)).not.toContain("runtime")
    await host.close()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("Host prewarms one full resource verification and hands every runtime start its manifest proof and metadata cache", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-prewarm-"))
  const resources = join(directory, "resources")
  const root = join(directory, "profile")
  await mkdir(join(resources, "bin"), { recursive: true })
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  const binary = process.platform === "win32" ? "bin/node.exe" : "bin/node"
  await copyFile(node, join(resources, binary), constants.COPYFILE_FICLONE)
  await writeFile(join(resources, "browser"), "controlled browser payload")
  await writeFile(
    join(resources, "runtime/src/knowledge-entry.mjs"),
    `process.on('message', m => {
    if (m.operation === 'start') process.send({id:m.id,result:{protocol:1,generation:m.input.generation,started:true}});
    if (m.operation === 'list') process.send({id:m.id,result:{tools:[]}});
    if (m.operation === 'close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
  });`,
  )
  await writeFile(
    join(resources, "runtime/src/managed-entry.mjs"),
    `import {appendFileSync} from 'node:fs';
    process.on('message', m => {
      if (m.operation === 'start') {
        appendFileSync(${JSON.stringify(join(directory, "proofs.jsonl"))},JSON.stringify({hash:m.input.resourceManifestHash,cachePath:m.input.resourceCachePath,cacheVersion:m.input.resourceCacheVersion})+'\\n');
        process.send({id:m.id,result:{protocol:1,generation:m.input.generation,checked:true}});
      }
      if (m.operation === 'close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
    });`,
  )
  await writeFile(
    join(resources, "resource-manifest.json"),
    JSON.stringify({
      protocol: 1,
      nodeVersion: "24.19.0",
      node: binary,
      browser: "browser",
      files: await Promise.all(
        [binary, "browser"].map(async (path) => ({
          path,
          sha256: createHash("sha256")
            .update(Buffer.from(await Bun.file(join(resources, path)).arrayBuffer()))
            .digest("hex"),
        })),
      ),
    }),
  )
  const host = await createLoginomHost({ root, resources, codec: credentials("linux"), environment: {} })
  try {
    // Verification happens with no connection or browser admission.
    for (
      let retry = 0;
      retry < 400 &&
      !(
        await Bun.file(join(root, "startup-phases.jsonl"))
          .text()
          .catch(() => "")
      ).includes('"status":"ready"');
      retry++
    )
      await Bun.sleep(10)
    expect(await Bun.file(join(root, "startup-phases.jsonl")).text()).toContain('"status":"ready"')
    const candidate = {
      revision: 0,
      url: "https://example.test/app/",
      username: "fixture",
      password: { operation: "empty" as const },
    }
    await host.api.check(candidate)
    await host.api.check(candidate)
    const proofs = (await Bun.file(join(directory, "proofs.jsonl")).text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(proofs).toHaveLength(2)
    expect(proofs[0].hash).toMatch(/^[a-f0-9]{64}$/)
    // Each start rechecks file metadata against the profile cache the prewarm wrote.
    for (const proof of proofs)
      expect(proof).toEqual({ hash: proofs[0].hash, cachePath: join(root, "resource-verification.json"), cacheVersion: "" })
    expect(await Bun.file(join(root, "resource-verification.json")).exists()).toBe(true)
    expect(
      (await Bun.file(join(root, "startup-phases.jsonl")).text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
        .filter((event) => event.phase === "resources.verify" && event.status === "ready"),
    ).toHaveLength(1)
    await host.close()
    const restored = await createLoginomHost({
      root,
      resources,
      resourceVersion: "",
      codec: credentials("linux"),
      environment: {},
    })
    try {
      for (let retry = 0; retry < 400; retry++) {
        const events = (await Bun.file(join(root, "startup-phases.jsonl")).text())
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
          .filter((event) => event.phase === "resources.verify" && event.status === "ready")
        if (events.length === 2) {
          expect(events[1]).toMatchObject({ mode: "metadata", hashedFiles: 0, cachedFiles: 2 })
          break
        }
        if (retry === 399) throw Error("RESTORED_CACHE_NOT_READY")
        await Bun.sleep(10)
      }
    } finally {
      await restored.close()
    }
  } finally {
    await host.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 15_000)

test("Host retains prewarm wait cancellation before any browser child starts", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE")
  const directory = await mkdtemp(join(tmpdir(), "loginom-prewarm-wait-")),
    root = join(directory, "profile"),
    resources = join(directory, "resources")
  const binary = process.platform === "win32" ? "bin/node.exe" : "bin/node"
  await mkdir(join(resources, "bin"), { recursive: true })
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await copyFile(node, join(resources, binary), constants.COPYFILE_FICLONE)
  await writeFile(join(resources, "browser"), "")
  await writeFile(
    join(resources, "resource-manifest.json"),
    JSON.stringify({
      protocol: 1,
      nodeVersion: "24.19.0",
      node: binary,
      browser: "browser",
      files: [
        {
          path: binary,
          sha256: createHash("sha256")
            .update(Buffer.from(await Bun.file(node).arrayBuffer()))
            .digest("hex"),
        },
        { path: "browser", sha256: createHash("sha256").update("").digest("hex") },
      ],
    }),
  )
  await writeFile(
    join(resources, "runtime/src/knowledge-entry.mjs"),
    `process.on('message',m=>{
    if(m.operation==='start')process.send({id:m.id,result:{protocol:1,generation:m.input.generation,started:true}});
    if(m.operation==='list')process.send({id:m.id,result:{tools:[]}});
    if(m.operation==='close')process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
  });`,
  )
  // Keep the verifier barrier in a separate process so its module fixture cannot
  // replace resource verification for any other Host test.
  const child = Bun.spawn(
    [process.execPath, fileURLToPath(new URL("./fixtures/prewarm-wait.ts", import.meta.url)), root, resources],
    { stdout: "pipe", stderr: "pipe" },
  )
  const timer = setTimeout(() => child.kill(), 10_000)
  try {
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    expect({ code, stdout, stderr }).toEqual({ code: 0, stdout: "", stderr: "" })
  } finally {
    clearTimeout(timer)
    if (child.exitCode === null) child.kill()
    await child.exited
    await rm(directory, { recursive: true, force: true })
  }
}, 15_000)

test("real managed resource failure evidence survives validation profile removal", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-resource-failure-"))
  const resources = join(directory, "resources"),
    root = join(directory, "profile")
  await mkdir(join(resources, "bin"), { recursive: true })
  await mkdir(join(resources, "runtime/src"), { recursive: true })
  await symlink(node, join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"))
  await writeFile(join(resources, "resource-manifest.json"), "{}")
  await symlink(
    fileURLToPath(new URL("../../loginom-runtime/src/managed-entry.mjs", import.meta.url)),
    join(resources, "runtime/src/managed-entry.mjs"),
  )
  await writeFile(
    join(resources, "runtime/src/knowledge-entry.mjs"),
    `process.on('message', m => {
    if (m.operation === 'start') process.send({id:m.id,result:{protocol:1,generation:m.input.generation,started:true}});
    if (m.operation === 'list') process.send({id:m.id,result:{tools:[]}});
    if (m.operation === 'close') process.send({id:m.id,result:{closed:true}},()=>process.disconnect());
  });`,
  )
  const host = await createLoginomHost({ root, resources, codec: credentials("linux"), environment: {} })
  try {
    await expect(
      host.api.check({
        revision: 0,
        url: "https://example.test/?key=PRIVATE-KEY",
        username: "PRIVATE-USER",
        password: { operation: "replace", value: "PRIVATE-PASSWORD" },
      }),
    ).rejects.toMatchObject({ message: "LOGINOM_CONNECTION_CHECK_FAILED", cause: expect.any(Error) })
    const evidence = await Bun.file(join(root, "validation/startup-failures.jsonl")).text()
    expect(evidence).toContain('"phase":"resources.verify"')
    expect(evidence).toContain("LOGINOM_RESOURCES_INVALID")
    for (const secret of ["PRIVATE-KEY", "PRIVATE-USER", "PRIVATE-PASSWORD"]) expect(evidence).not.toContain(secret)
    expect(
      await readdir(join(root, "validation/generations/1/chats")).catch((error) => {
        if (error.code === "ENOENT") return []
        throw error
      }),
    ).toEqual([])
  } finally {
    await host.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 15_000)

test("failed readiness cleanup cannot acknowledge host shutdown", async () => {
  const fixture = await startupFixture(false)
  try {
    await fixture.host.settled()
    expect(await fixture.host.api.status()).toMatchObject({ state: "recoverable-error" })
    await expect(fixture.host.close()).rejects.toThrow("LOGINOM_RUNTIME_CLEANUP_FAILED")
  } finally {
    await fixture.host.close().catch(() => undefined)
    await rm(fixture.directory, { recursive: true, force: true })
  }
}, 15000)

test("clean readiness failure remains recoverable and permits host shutdown", async () => {
  const fixture = await startupFixture(true)
  try {
    await fixture.host.settled()
    expect(await fixture.host.api.status()).toMatchObject({ state: "recoverable-error" })
    expect(fixture.host.acquire("unavailable-run")).toBeUndefined()
    await fixture.host.close()
  } finally {
    await fixture.host.close().catch(() => undefined)
    await rm(fixture.directory, { recursive: true, force: true })
  }
}, 15000)

test.each([true, false])(
  "browser startup warning requires confirmed cleanup: %s",
  async (closed) => {
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw new Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
    const directory = await mkdtemp(join(tmpdir(), "loginom-validation-cleanup-"))
    const resources = join(directory, "resources")
    await mkdir(join(resources, "bin"), { recursive: true })
    await mkdir(join(resources, "runtime", "src"), { recursive: true })
    await copyFile(node, join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"))
    await writeFile(join(resources, "resource-manifest.json"), JSON.stringify({}))
    await writeFile(
      join(resources, "runtime", "src", "knowledge-entry.mjs"),
      `process.on('message', message => {
        if (message.operation === 'start') process.send({id:message.id,result:{protocol:1,generation:message.input.generation,started:true}});
        if (message.operation === 'list') process.send({id:message.id,result:{tools:[]}});
        if (message.operation === 'close') process.send({id:message.id,result:{closed:true}},()=>process.disconnect());
      });`,
    )
    await writeFile(
      join(resources, "runtime", "src", "managed-entry.mjs"),
      `process.on('message', message => {
        if (message.operation === 'start') process.send({id:message.id,error:'LOGINOM_BROWSER_START_FAILED'});
        if (message.operation === 'close') process.send({id:message.id,result:{closed:${closed}}},()=>process.disconnect());
      });`,
    )
    const host = await createLoginomHost({
      root: join(directory, "profile"),
      resources,
      codec: credentials("linux"),
      environment: {},
      headless: true,
    })
    try {
      const checking = host.api.check({
        revision: 0,
        url: "https://example.test/app/",
        username: "fixture",
        apiKey: { operation: "replace", value: "fixture" },
        password: { operation: "empty" },
      })
      if (closed) {
        expect(await checking).toMatchObject({
          validationId: expect.any(String),
          browser: { state: "failed", failure: "LOGINOM_BROWSER_START_FAILED" },
        })
        await host.close()
        return
      }
      await expect(checking).rejects.toThrow("LOGINOM_CONNECTION_CHECK_FAILED")
      await expect(host.close()).rejects.toThrow("LOGINOM_RUNTIME_CLEANUP_FAILED")
    } finally {
      await host.close().catch(() => undefined)
      await removeFixture(directory)
    }
  },
  15_000,
)

test.each(["missing", "tampered"])(
  "failed Knowledge validation preserves safe startup evidence after validation cleanup: %s Help",
  async (help) => {
    const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
    if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
    const directory = await mkdtemp(join(tmpdir(), "loginom-knowledge-evidence-"))
    const root = join(directory, "profile")
    const resources = join(directory, "resources")
    const marker = join(directory, "forbidden-browser")
    const secrets = ["PRIVATE-KNOWLEDGE-PASSWORD", "PRIVATE-KNOWLEDGE-USER"]
    await mkdir(join(resources, "bin"), { recursive: true })
    await mkdir(join(resources, "runtime/src"), { recursive: true })
    await symlink(node, join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"))
    await symlink(
      fileURLToPath(new URL("../../loginom-runtime/src/knowledge-entry.mjs", import.meta.url)),
      join(resources, "runtime/src/knowledge-entry.mjs"),
    )
    await writeFile(
      join(resources, "runtime/src/managed-entry.mjs"),
      `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'started'); throw Error('Browser startup is forbidden');`,
    )
    if (help === "tampered") await writeHelp(join(resources, "help"), { tamper: "data/README.md" })
    const host = await createLoginomHost({
      root,
      resources,
      codec: credentials("linux"),
      environment: {},
      headless: true,
    })
    try {
      await expect(
        host.api.check({
          revision: 0,
          url: "https://example.test/app/",
          username: secrets[1]!,
          password: { operation: "replace", value: secrets[0]! },
        }),
      ).rejects.toMatchObject({ message: "LOGINOM_KNOWLEDGE_UNAVAILABLE" })
      await host.close()
      await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" })
      expect(
        await readdir(join(root, "validation/knowledge")).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return []
          throw error
        }),
      ).toEqual([])
      const receipts = (await readdir(join(root, "knowledge/1"))).filter(
        (name) => name.startsWith("runtime-close-") && name.endsWith(".json"),
      )
      expect(receipts).toHaveLength(1)
      const file = join(root, "knowledge/1", receipts[0]!)
      const text = await Bun.file(file).text()
      // Shipped Help failures are local: the receipt confirms cleanup and carries no remote startup failure.
      expect(JSON.parse(text)).toEqual({
        version: 1,
        pid: expect.any(Number),
        started_at: expect.any(String),
        completed_at: expect.any(String),
        request_error: null,
        closed_ack: true,
        exit_code: 0,
        exit_signal: null,
      })
      // Windows mode bits do not represent the native DACL.
      if (process.platform !== "win32") expect((await stat(file)).mode & 0o777).toBe(0o600)
      const log = await Bun.file(join(root, "knowledge/1/startup-failures.jsonl")).text()
      const [id] = await readdir(join(root, "knowledge/1/diagnostics"))
      const diagnostic = await Bun.file(join(root, "knowledge/1/diagnostics", id!, "events.jsonl")).text()
      for (const evidence of [log, diagnostic]) {
        expect(evidence).toContain('"phase":"knowledge.catalog"')
        expect(evidence).toContain("LOGINOM_KNOWLEDGE_UNAVAILABLE")
        expect(evidence).toContain(help === "missing" ? "ENOENT" : "LOGINOM_HELP_INTEGRITY")
      }
      for (const secret of secrets)
        for (const evidence of [text, log, diagnostic]) expect(evidence).not.toContain(secret)
    } finally {
      await host.close().catch(() => undefined)
      await rm(directory, { recursive: true, force: true })
    }
  },
  15_000,
)

async function startupFixture(closed: boolean) {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw new Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "loginom-readiness-cleanup-"))
  const root = join(directory, "profile")
  const resources = join(directory, "resources")
  await mkdir(join(resources, "bin"), { recursive: true })
  await mkdir(join(resources, "runtime", "src"), { recursive: true })
  await copyFile(node, join(resources, "bin", process.platform === "win32" ? "node.exe" : "node"))
  await writeFile(join(resources, "resource-manifest.json"), JSON.stringify({}))
  await writeFile(
    join(resources, "runtime", "src", "knowledge-entry.mjs"),
    `process.on('message', message => {
      if (message.operation === 'start') process.send({id:message.id,error:'LOGINOM_KNOWLEDGE_UNAVAILABLE'});
      if (message.operation === 'close') process.send({id:message.id,result:{closed:${closed}}},()=>process.disconnect());
    });`,
  )
  const codec = credentials("linux")
  const store = connectionStore(join(root, "connection"), codec)
  await store.stage({
    generation: 1,
    revision: 1,
    url: "https://example.test/app/",
    username: "fixture",
    apiKey: "fixture",
    password: "",
  })
  await store.activate(1)
  const host = await createLoginomHost({ root, resources, codec, environment: {}, headless: true })
  return { directory, host }
}

// Both children have already emitted exit (close awaits it), but Windows can
// keep the copied node.exe image locked briefly afterwards. Only fixture
// removal waits for that release; the cleanup assertions above are unchanged.
async function removeFixture(directory: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await rm(directory, { recursive: true, force: true })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? ""
      if (process.platform !== "win32" || !["EBUSY", "EPERM", "ENOTEMPTY"].includes(code) || attempt >= 50) throw error
      await Bun.sleep(100)
    }
  }
}
