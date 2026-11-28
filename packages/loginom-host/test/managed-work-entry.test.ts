import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, unlink } from "node:fs/promises"
import { MessageChannel } from "node:worker_threads"
import { Schema } from "effect"
import { Agent } from "@opencode/schema/agent"
import { AbsolutePath } from "@opencode/schema/schema"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { Tool } from "@opencode/schema/tool"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { supervise } from "../src/supervisor"
import { createLoginomHost } from "../src/host"
import { loginomHostPort } from "../src/host-port"
import { LoginomHost } from "../src/adapter"
import { transport } from "../src/transport"
import { HostTaskScope } from "../src/task-scope"
import { connectionStore } from "../src/connection/connection-store"
import { credentials } from "../src/connection/credentials"
import { stageKnowledgeFixture, waitForKnowledge } from "./fixtures/knowledge"
import { dockTools } from "../../loginom-agent/src/dock"

test("actual managed entry relays work, dispatch and Dock tool progress over private IPC", async () => {
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
    "runtime/src/dashboard-storage.mjs": await readFile(
      new URL("../../loginom-runtime/src/dashboard-storage.mjs", import.meta.url),
      "utf8",
    ),
    "runtime/src/browser-window.mjs": await readFile(
      new URL("../../loginom-runtime/src/browser-window.mjs", import.meta.url),
      "utf8",
    ),
    "runtime/src/resources.mjs": `export async function verifyResources() {
      return { manifestHash: 'fixture', manifest: { actionManifestSha256: 'fixture' } };
    }`,
    "runtime/src/connection-check.mjs": `
      import { EventEmitter } from 'node:events';
      import { readFileSync } from 'node:fs';
      export const loginomAddress = value => value;
      export const loginBrowser = async ({ onContextCreated, onWindowPage }) => {
        const context = Object.assign(new EventEmitter(), { pages: () => [], close: async () => {} });
        onContextCreated?.(context);
        let bounds = { left: 800, top: 0, width: 800, height: 900, windowState: 'normal' };
        let startupRead = true;
        let stall = true;
        let refusal = true;
        let loseReply = true;
        const cdp = {
          async send(method, input) {
            if (method === 'Browser.getWindowForTarget') {
              if (startupRead) {
                startupRead = false;
                throw Error('startup bounds not ready');
              }
              const { browserLeft } = JSON.parse(readFileSync(${JSON.stringify(work)}, 'utf8'));
              return { windowId: 8, bounds: browserLeft === undefined ? bounds : { ...bounds, left: browserLeft } };
            }
            if (method === 'Browser.getWindowBounds') return { bounds };
            if (method === 'Browser.setWindowBounds') {
              if (stall) {
                stall = false;
                await new Promise(() => {});
              }
              if (refusal) {
                refusal = false;
                return;
              }
              bounds = { ...bounds, ...input.bounds };
              if (loseReply) {
                loseReply = false;
                await new Promise(() => {});
              }
            }
          },
          async detach() {},
        };
        context.newCDPSession = async () => cdp;
        await onWindowPage?.({ isClosed: () => false, context: () => context, waitForFunction: async () => ({ async dispose() {} }) });
        context.emit('response', { url: () => 'http://example.test/app/', fromServiceWorker: () => false });
        return { context };
      };
      export const reauthenticateReloadedPage = async () => { throw Error('work state fixture does not log in again'); };`,
    "runtime/client/package.json": JSON.stringify({ type: "module" }),
    "runtime/client/lib/execution-journal.mjs": await readFile(
      new URL("../../loginom-runtime/client/lib/execution-journal.mjs", import.meta.url),
      "utf8",
    ),
    "runtime/client/lib/redact.mjs": await readFile(
      new URL("../../loginom-runtime/client/lib/redact.mjs", import.meta.url),
      "utf8",
    ),
    "runtime/client/lib/browser-downloads.mjs": await readFile(
      new URL("../../loginom-runtime/client/lib/browser-downloads.mjs", import.meta.url),
      "utf8",
    ),
    "runtime/client/lib/step-progress.mjs": await readFile(
      new URL("../../loginom-runtime/client/lib/step-progress.mjs", import.meta.url),
      "utf8",
    ),
    "runtime/client/lib/catalog.mjs": await readFile(
      new URL("../../loginom-runtime/client/lib/catalog.mjs", import.meta.url),
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
        trackedStep: (_name, _args, dispatch) => dispatch(),
        checkStepState: async id => id!==work().checkId ? { state: 'unavailable', retryAvailable: false } : {
          state: 'observed', retryAvailable: true, window: { path: null, modified: true, nodeCount: 1, linkCount: 0 },
          lastConfirmedStep: null, graphSinceLastConfirmedStep: 'unknown',
          step: { outcome: 'not_applied', retryAvailable: true, persistence: 'step_unsaved', save: null },
        },
        prepareLocalPackage: async (args, pair, { signal }) => {
          signal.throwIfAborted();
          return { content: [{ type: 'text', text: JSON.stringify({ args, pair, private: true }) }] };
        },
      } }`,
    "runtime/client/node_modules/@modelcontextprotocol/sdk/package.json": JSON.stringify({ type: "commonjs" }),
    "runtime/client/node_modules/@modelcontextprotocol/sdk/client/index.js": `
      exports.Client = class {
        async connect() {} async close() {}
        async listTools() { return { tools: [{ name: 'fixture', inputSchema: { type: 'object' } }, { name: 'dock_node_apply', inputSchema: { type: 'object' } }] }; }
        async callTool(input, _unused, { signal }) {
          if (input.arguments.failAfterDispatch) throw Error('LOGINOM_FILE_CHANGED');
          if (input.arguments.progressFixture) {
            const { stepPhase } = await import('../../../../lib/step-progress.mjs');
            stepPhase('configuring', 'transform.group_data', { kind: 'fields', index: 2, total: 3 });
            await new Promise(resolve => setTimeout(resolve, 1700));
            stepPhase('reading', 'transform.group_data');
            await new Promise(resolve => setTimeout(resolve, 1550));
            setTimeout(() => stepPhase('executing'), 50);
            return { content: [{ type: 'text', text: 'original model result' }] };
          }
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
    connection: { url: "http://example.test", username: "user", apiKey: "fixture", password: "" },
    desktopWindow: true,
    environment: {},
  })
  try {
    const windowBounds = { x: 1200, y: 0, width: 800, height: 900 }
    expect(await readFile(join(src, "managed-entry.mjs"), "utf8")).toBe(
      await readFile(new URL("../../loginom-runtime/src/managed-entry.mjs", import.meta.url), "utf8"),
    )
    for (const prepared of [false, true, false]) {
      await Bun.write(work, JSON.stringify({ activeWork: false, unsettledWork: false, prepared }))
      expect(await runtime.request("list")).toEqual({
        prepared,
        tools: [
          { name: "fixture", inputSchema: { type: "object" } },
          { name: "dock_node_apply", inputSchema: { type: "object" } },
        ],
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
    expect(await runtime.request("placeWindow", windowBounds)).toBe("unchanged")
    const platform = process.platform === "win32" ? "manual" : "focused"
    expect(await runtime.request("showWindow")).toBe(platform)
    expect(await runtime.request("checkStepState", { operationId: "pending" })).toEqual({
      state: "busy", retryAvailable: false,
    })
    expect(await runtime.request("interrupt")).toEqual({ interrupted: true })
    expect(await call).toMatchObject({ message: "LOGINOM_RUNTIME_FAILED" })
    expect(await runtime.request("work")).toEqual({ activeWork: false, unsettledWork: false, dispatching: false })
    const stalled = runtime.request("placeWindow", windowBounds, 2500)
    const tool = runtime.request("call", { name: "fixture", arguments: {} }, 2500)
    expect(await Promise.all([stalled, tool])).toEqual([
      "layout-unavailable",
      { result: { content: [] }, recoveryPending: false, activeWork: false },
    ])
    expect(await runtime.request("placeWindow", windowBounds)).toBe("layout-unavailable")
    expect(await runtime.request("placeWindow", windowBounds, 2500)).toBe("layout-unavailable")
    expect(await runtime.request("placeWindow", { ...windowBounds, x: 800 })).toBe("unchanged")
    expect(await runtime.request("placeWindow", windowBounds)).toBe("placed")
    expect(await runtime.request("placeWindow", windowBounds)).toBe("placed")
    expect(await runtime.request("placeWindow", { ...windowBounds, x: 800 })).toBe("unchanged")
    await Bun.write(work, JSON.stringify({ activeWork: true, unsettledWork: true, browserLeft: 1050 }))
    expect(await runtime.request("placeWindow", windowBounds)).toBe("moved")
    await Bun.write(work, JSON.stringify({ activeWork: false, unsettledWork: false }))
    expect(await runtime.request("placeWindow", windowBounds)).toBe("moved")
    expect(await runtime.request("showWindow")).toBe(platform)
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
  await Bun.write(join(directory, "resource-manifest.json"), JSON.stringify({}))
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
  const sharedPort = {
    postMessage: (data: unknown) => channel.port2.postMessage(data),
    on: (_event: "message", listener: (event: { data: unknown }) => void) =>
      channel.port2.on("message", (data) => listener({ data })),
    start: () => channel.port2.start(),
  }
  LoginomHost.connect(sharedPort)
  const privateHost = transport(sharedPort)
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
    const sessionID = Session.ID.make("ses_file_errors")
    const messageID = SessionMessage.ID.make("msg_original")
    type DockPlugin = Parameters<typeof dockTools>[0]["plugin"]
    const captured: { transform?: Parameters<DockPlugin["tool"]["transform"]>[0] } = {}
    const dock = await dockTools({
      plugin: {
        location: { directory: AbsolutePath.make(directory) },
        tool: {
          transform: async (transform) => {
            captured.transform = transform
            return { dispose: async () => undefined }
          },
          reload: async () => undefined,
        },
        model: { list: async () => { throw Error("No model access in fixture") } },
        session: { context: async () => [] },
      },
      files: { ask: async () => undefined, snapshot: async () => { throw Error("Unexpected file snapshot") } },
      profiles: directory,
      ready: () => true,
      lease: async () => run,
      task: async () => messageID,
      failure: () => undefined,
      wrap: (tool) => tool,
    })
    await dock.refresh(sessionID, "loginom-automation", undefined)
    type Editor = Parameters<NonNullable<typeof captured.transform>>[0]
    const tools = new Map<string, Parameters<Editor["add"]>[0]>()
    captured.transform?.({
      add: (tool) => tools.set(tool.name, tool),
      list: () => [], get: () => undefined, namespace: () => undefined, update: () => undefined, remove: () => undefined,
    })
    const tool = tools.get("loginom_fixture")
    if (!tool) throw Error("Fixture tool not registered")
    const apply = tools.get("loginom_dock_node_apply")
    if (!apply) throw Error("Apply tool not registered")
    const updates: unknown[] = []
    const result = await tool.execute({ progressFixture: true }, {
      sessionID, messageID, agent: Agent.ID.make("fixture"), id: Tool.CallID.make("fixture"),
      signal: new AbortController().signal,
      progress: async (update) => { updates.push(update) },
    })
    expect(result).toEqual({ content: "original model result", metadata: { generation: 1 } })
    expect(updates).toEqual([
      { loginomStep: { version: 1, phase: "configuring", nodeType: "transform.group_data", substep: { kind: "fields", index: 2, total: 3 }, startedAt: expect.any(Number), lastReplyAt: expect.any(Number), stalledSince: null } },
      { loginomStep: { version: 1, phase: "reading", nodeType: "transform.group_data", substep: null, startedAt: expect.any(Number), lastReplyAt: expect.any(Number), stalledSince: null } },
    ])
    await Bun.sleep(1_600)
    expect(updates).toHaveLength(2)
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
      const text = error instanceof Error ? error.message + JSON.stringify("details" in error ? error.details : undefined) : String(error)
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
    fault.name = ""
    const lostArgs = { operation_id: "lost-write", failAfterDispatch: true }
    const blocked = { message: "LOGINOM_CALL_UNCERTAIN", details: { operationId: "lost-write" } }
    expect(await run.call("dock_node_apply", lostArgs, "msg_original").catch((error: unknown) => error)).toMatchObject(blocked)
    expect(await run.call("dock_node_apply", { operation_id: "premature" }, "msg_original").catch((error: unknown) => error)).toMatchObject(blocked)
    const modelError = await apply.execute({ operation_id: "premature" }, {
      sessionID, messageID, agent: Agent.ID.make("fixture"), id: Tool.CallID.make("blocked-write"),
      signal: new AbortController().signal, progress: async () => {},
    }).catch((error: unknown) => error)
    expect(modelError).toBeInstanceOf(Tool.Error)
    expect(modelError).toMatchObject({ message: expect.stringContaining("LOGINOM_CALL_UNCERTAIN"), metadata: {
      loginom: { operationId: "lost-write", step: { outcome: "check_required", retryAvailable: false } },
    } })
    await Bun.write(work, JSON.stringify({ activeWork: false, unsettledWork: false, prepared: true, checkId: "lost-write" }))
    expect(await privateHost.request("checkStepState", { sessionID: "foreign-chat", operationId: "lost-write" }))
      .toEqual({ state: "unavailable", retryAvailable: false })
    expect(await privateHost.request("checkStepState", { sessionID: "file-errors", operationId: "lost-write" }))
      .toMatchObject({ state: "observed", retryAvailable: true })
    expect(await run.call("dock_node_apply", { operation_id: "next" }, "msg_original")).toMatchObject({ content: [] })

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
