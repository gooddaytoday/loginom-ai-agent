import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, unlink } from "node:fs/promises"
import { MessageChannel } from "node:worker_threads"
import { Schema } from "effect"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { supervise } from "../src/supervisor"
import { createLoginomHost } from "../src/host"
import { loginomHostPort } from "../src/host-port"
import { LoginomHost } from "../src/adapter"
import { HostTaskScope } from "../src/task-scope"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { stageKnowledgeFixture, waitForKnowledge } from "./fixtures/knowledge"

test("actual managed entry reads live bridge work and dispatching over private IPC", async () => {
  const node = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!node) throw Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  const directory = await mkdtemp(join(tmpdir(), "managed-work-entry-"))
  const work = join(directory, "work.json")
  const src = join(directory, "runtime/src")
  const files = {
    "runtime/src/managed-entry.mjs": await readFile(
      new URL("../../loginom-runtime/src/managed-entry.mjs", import.meta.url),
      "utf8",
    ),
    "runtime/src/start-input.mjs": await readFile(
      new URL("../../loginom-runtime/src/start-input.mjs", import.meta.url),
      "utf8",
    ),
    "runtime/src/managed-resources-close.mjs": await readFile(
      new URL("../../loginom-runtime/src/managed-resources-close.mjs", import.meta.url),
      "utf8",
    ),
    "runtime/src/call-timeout.mjs": await readFile(
      new URL("../../loginom-runtime/src/call-timeout.mjs", import.meta.url),
      "utf8",
    ),
    "runtime/src/resources.mjs": `export async function verifyResources() {
      return { manifestHash: 'fixture', manifest: { actionManifestSha256: 'fixture' } };
    }`,
    "runtime/src/connection-check.mjs": `
      export const loginomAddress = value => value;
      export const loginBrowser = async () => ({ context: { close: async () => {} } });`,
    "runtime/client/package.json": JSON.stringify({ type: "module" }),
    "runtime/client/lib/execution-journal.mjs": await readFile(
      new URL("../../loginom-runtime/client/lib/execution-journal.mjs", import.meta.url),
      "utf8",
    ),
    "runtime/client/lib/redact.mjs": await readFile(
      new URL("../../loginom-runtime/client/lib/redact.mjs", import.meta.url),
      "utf8",
    ),
    "runtime/client/lib/session.mjs": `
      import { readFileSync } from 'node:fs';
      import { createArtifactStore } from ${JSON.stringify(new URL("../../loginom-runtime/client/lib/artifacts.mjs", import.meta.url).href)};
      export async function createSession(config, {managed}) {
        return { artifactStore: await createArtifactStore({directory:managed.directory+'/artifacts'}),
          browserConfig: ${JSON.stringify(work)}, metadata: {
          clientRevision: 'fixture',
          get workspaceReady() { return JSON.parse(readFileSync(${JSON.stringify(work)}, 'utf8')).prepared === true; }
        } };
      }`,
    "runtime/client/lib/artifacts.mjs": `const artifacts=await import(${JSON.stringify(new URL("../../loginom-runtime/client/lib/artifacts.mjs", import.meta.url).href)});
       export const admitStartupArtifacts=artifacts.admitStartupArtifacts;
       export const artifactFailure=artifacts.artifactFailure ?? (()=>null);`,
    "runtime/client/lib/bridge.mjs": `
      import { readFileSync } from 'node:fs';
      const work = () => JSON.parse(readFileSync(${JSON.stringify(work)}, 'utf8'));
      export async function createBridge() { return {
        server: { connect: async () => {} }, close: async () => ({
          browser_transport_closed: true, browser_process_terminated: true, clipboard_leases_retained: 0,
        }),
        hasActiveWork: () => work().activeWork, hasUnsettledWork: () => work().unsettledWork,
        prepareLocalPackage: async (args, pair, { signal }) => {
          signal.throwIfAborted();
          return { content: [{ type: 'text', text: JSON.stringify({ args, pair, private: true }) }] };
        },
      } }`,
    "runtime/client/node_modules/@modelcontextprotocol/sdk/package.json": JSON.stringify({ type: "commonjs" }),
    "runtime/client/node_modules/@modelcontextprotocol/sdk/client/index.js": `
      exports.Client = class {
        async connect() {} async close() {}
        async listTools() { return { tools: [{ name: 'fixture', inputSchema: { type: 'object' } }] }; }
        async callTool(input, _unused, { signal }) {
          if (input.arguments.failAfterDispatch) throw Error('LOGINOM_FILE_CHANGED');
          if (!input.arguments.hold) return { content: [] };
          await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Error('aborted')), { once: true }));
        }
      }`,
    "runtime/client/node_modules/@modelcontextprotocol/sdk/inMemory.js":
      "exports.InMemoryTransport = { createLinkedPair: () => [{}, {}] }",
    "runtime/client/node_modules/@playwright/mcp/package.json": JSON.stringify({ type: "commonjs", main: "index.js" }),
    "runtime/client/node_modules/@playwright/mcp/index.js":
      "exports.createConnection = async () => ({ connect: async () => {}, close: async () => {} })",
  }
  // Entry, validator, timeout, journal/redactor and resource cleanup are byte-identical copies.
  // Only external browser/MCP/bridge boundaries are controlled.
  for (const [name, contents] of Object.entries(files)) {
    const target = join(directory, name)
    await mkdir(dirname(target), { recursive: true })
    await Bun.write(target, contents)
  }
  await Bun.write(work, JSON.stringify({ activeWork: false, unsettledWork: false }))
  const runtime = await supervise({
    node,
    entry: join(src, "managed-entry.mjs"),
    resources: directory,
    stateDir: join(directory, "state"),
    generation: 1,
    chat: "chat",
    endpoint: "http://example.test",
    connection: { url: "http://example.test", username: "user", apiKey: "fixture", password: "" },
    environment: {},
  })
  try {
    expect(await readFile(join(src, "managed-entry.mjs"), "utf8")).toBe(
      await readFile(new URL("../../loginom-runtime/src/managed-entry.mjs", import.meta.url), "utf8"),
    )
    for (const prepared of [false, true, false]) {
      await Bun.write(work, JSON.stringify({ activeWork: false, unsettledWork: false, prepared }))
      expect(await runtime.request("list")).toEqual({
        prepared,
        tools: [{ name: "fixture", inputSchema: { type: "object" } }],
      })
    }
    for (const state of [
      { activeWork: true, unsettledWork: true },
      { activeWork: false, unsettledWork: true },
      { activeWork: false, unsettledWork: false },
    ]) {
      await Bun.write(work, JSON.stringify(state))
      expect(await runtime.request("work")).toEqual({ ...state, dispatching: false })
    }
    const args = { intent: "open_package", operation_id: "local-package" }
    const packageArtifact = { artifactID: "artifact", uploadGrantID: "grant" }
    expect(await runtime.request("call", { name: "dock_prepare", arguments: args, packageArtifact })).toEqual({
      result: { content: [{ type: "text", text: JSON.stringify({ args, pair: packageArtifact, private: true }) }] },
      recoveryPending: false,
      activeWork: false,
    })
    const call = runtime
      .request("call", { name: "fixture", arguments: { hold: true } })
      .catch((error: unknown) => error)
    expect(await runtime.request("work")).toEqual({ activeWork: false, unsettledWork: false, dispatching: true })
    expect(await runtime.request("interrupt")).toEqual({ interrupted: true })
    expect(await call).toMatchObject({ message: "LOGINOM_RUNTIME_FAILED" })
    expect(await runtime.request("work")).toEqual({ activeWork: false, unsettledWork: false, dispatching: false })
  } finally {
    await runtime.close()
    expect(await runtime.exited).toEqual({ code: 0, signal: null })
  }
  // All error-producing admission, managed entry, supervision, HostPort,
  // transport and adapter code is production code. Only browser/Help are fixtures.
  await Bun.write(work, JSON.stringify({ activeWork: false, unsettledWork: false, prepared: true }))
  await stageKnowledgeFixture(directory)
  await mkdir(join(directory, "bin"))
  await symlink(node, join(directory, "bin/node"))
  await Bun.write(join(directory, "resource-manifest.json"), JSON.stringify({ endpoint: "http://example.test" }))
  const root = join(directory, "host")
  const codec = credentials("linux")
  const store = connectionStore(join(root, "connection"), codec)
  await store.stage({
    generation: 1,
    revision: 1,
    url: "http://example.test",
    username: "user",
    apiKey: "secret-key",
    password: "secret-password",
  })
  await store.activate(1)
  const host = await createLoginomHost({ root, resources: directory, codec, environment: {} })
  const channel = new MessageChannel()
  const port = loginomHostPort(
    {
      postMessage: (data) => channel.port1.postMessage(data),
      on: (event, listener) => channel.port1.on(event, event === "message" ? (data) => listener({ data }) : listener),
      start: () => channel.port1.start(),
    },
    host,
  )
  LoginomHost.connect({
    postMessage: (data) => channel.port2.postMessage(data),
    on: (_event, listener) => channel.port2.on("message", (data) => listener({ data })),
    start: () => channel.port2.start(),
  })
  const original = host.inputs
  const fault = { name: "" }
  // Deterministically reproduce a source disappearing/changing after the Host
  // snapshot and before runtime readVerified. Never replace its error logic.
  host.inputs = async (...args) => {
    const files = await original(...args)
    const path = files[0].sourcePath
    if (fault.name === "missing") await unlink(path)
    if (fault.name === "directory") {
      await unlink(path)
      await mkdir(path)
    }
    if (fault.name === "denied") await chmod(path, 0)
    if (fault.name === "changed") await Bun.write(path, "changed")
    if (fault.name === "unknown") throw Error("unexpected secret-password /private/path")
    return files
  }
  try {
    await waitForKnowledge(host)
    const run = await LoginomHost.acquire("file-errors")
    if (!run) throw Error("Adapter unavailable")
    await run.scope(
      "bind",
      Schema.decodeUnknownSync(HostTaskScope.Info)({ taskMessageID: "msg_original", profile: "loginom-automation" }),
    )
    await run.call("dock_prepare", {}, "msg_original")
    await run.tools()
    for (const [name, code] of [
      ["missing", "LOGINOM_FILE_NOT_FOUND"],
      ["directory", "LOGINOM_FILE_NOT_REGULAR"],
      ["denied", "LOGINOM_FILE_ACCESS_DENIED"],
      ["changed", "LOGINOM_FILE_CHANGED"],
      ["oversize", "LOGINOM_FILE_TOO_LARGE"],
      ["unknown", "LOGINOM_HOST_REQUEST_FAILED"],
    ]) {
      fault.name = name
      const files = [
        { name: "data.csv", data: Buffer.alloc(name === "oversize" ? 16 * 1024 * 1024 + 1 : 3, 65).toString("base64") },
      ]
      const error = await run.admit("msg_" + name, files).then(
        () => {
          throw Error("Expected refusal")
        },
        (error: unknown) => error,
      )
      expect(error).toMatchObject({ message: code })
      if (name === "oversize")
        expect(error).toMatchObject({ details: { actual: 16 * 1024 * 1024 + 1, limit: 16 * 1024 * 1024 } })
      const text = error instanceof Error ? error.message + JSON.stringify(Reflect.get(error, "details")) : String(error)
      expect(text).toContain(code)
      expect(text).not.toMatch(/secret|sourcePath|\/private|stack|AAAA/)
      expect(host.journal.pending()).toEqual([])
      // The same known admission error in a scenario call also precedes
      // journal admission and must retain its cause, never CALL_UNCERTAIN.
      const callError = await run
        .call("fixture", {}, "msg_original", undefined, [{ userMessage: "msg_call_" + name, files }])
        .catch((error: unknown) => error)
      expect(callError).toMatchObject({ message: code })
    }
    // Once dispatch has started, a thrown file-shaped error cannot certify
    // no effect and must still become CALL_UNCERTAIN.
    fault.name = ""
    const uncertain = await run
      .call("fixture", { failAfterDispatch: true }, "msg_original")
      .catch((error: unknown) => error)
    expect(uncertain).toMatchObject({ message: "LOGINOM_CALL_UNCERTAIN" })
    await run.release()
  } finally {
    LoginomHost.disconnect()
    await port.close()
    await host.close()
    channel.port1.close()
    channel.port2.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 30_000)
